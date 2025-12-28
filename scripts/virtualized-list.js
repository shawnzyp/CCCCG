// NOTE:
// ResizeObserver loop warnings are often triggered by measure/write work happening
// synchronously inside observer callbacks. This file ensures resize handling is
// deferred into rAF and coalesced to a single pass.

function __ccScheduleMeasure(fn) {
  try {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  } catch {}
  return setTimeout(fn, 16);
}

function __ccCoalesce(fn) {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    __ccScheduleMeasure(() => {
      scheduled = false;
      try {
        fn();
      } catch {}
    });
  };
}

const DEFAULT_ESTIMATE = 220;
const DEFAULT_OVERSCAN_PX = 0;
const MESSAGE_CLASS = 'virtualized-list__message';

const noop = () => {};

const createNoopVirtualizer = () => ({
  update: noop,
  refresh: noop,
  showMessage: noop,
  disconnect: noop,
  getMetrics: () => null,
});

const createSimpleVirtualizer = (container, options) => {
  const itemTagName = container && typeof container.tagName === 'string'
    ? container.tagName.toUpperCase()
    : 'DIV';
  const childTag = itemTagName === 'UL' || itemTagName === 'OL' ? 'li' : 'div';
  const renderItem = typeof options.renderItem === 'function'
    ? options.renderItem
    : noop;
  const metrics = null;

  return {
    update(items = [], context = null) {
      if (!container) return;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      if (!Array.isArray(items) || !items.length) {
        return;
      }
      const frag = document.createDocumentFragment();
      items.forEach((item, index) => {
        const wrapper = document.createElement(childTag);
        wrapper.className = options.itemClassName || 'virtualized-list__item';
        wrapper.__virtualItem = item;
        renderItem(item, { index, placeholder: wrapper, context, previous: null });
        if (wrapper.childNodes.length) {
          frag.appendChild(wrapper);
        }
      });
      container.appendChild(frag);
    },
    refresh(context = null) {
      if (!container) return;
      const children = Array.from(container.children || []);
      children.forEach((placeholder, index) => {
        const item = placeholder.__virtualItem;
        if (!item) return;
        renderItem(item, { index, placeholder, context, previous: placeholder.firstElementChild || null });
      });
    },
    showMessage(message = '', { tone = 'info' } = {}) {
      if (!container) return;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      if (!message) return;
      const el = document.createElement('div');
      el.className = `${MESSAGE_CLASS}${tone ? ` ${MESSAGE_CLASS}--${tone}` : ''}`;
      el.textContent = message;
      container.appendChild(el);
    },
    disconnect: noop,
    getMetrics: () => metrics,
  };
};

const hasIntersectionObserver = typeof window !== 'undefined'
  && typeof window.IntersectionObserver === 'function';

const hasResizeObserver = typeof window !== 'undefined'
  && typeof window.ResizeObserver === 'function';

function getChildTagName(container) {
  if (!container || typeof container.tagName !== 'string') {
    return 'div';
  }
  const tag = container.tagName.toUpperCase();
  if (tag === 'UL' || tag === 'OL') {
    return 'li';
  }
  return 'div';
}

function isDocumentFragment(node) {
  return node && typeof node === 'object' && node.nodeType === 11;
}

function replaceChildren(target, node) {
  if (!target) return;
  if (typeof target.replaceChildren === 'function') {
    target.replaceChildren(node);
    return;
  }
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
  if (node) {
    target.appendChild(node);
  }
}

function createVirtualizedList(container, options = {}) {
  if (!container || typeof document === 'undefined') {
    return createNoopVirtualizer();
  }

  const renderItem = typeof options.renderItem === 'function' ? options.renderItem : null;
  if (!renderItem) {
    return createNoopVirtualizer();
  }

  if (!hasIntersectionObserver) {
    return createSimpleVirtualizer(container, options);
  }

  const itemClass = options.itemClassName || 'virtualized-list__item';
  const childTag = getChildTagName(container);
  const getItemKey = typeof options.getItemKey === 'function'
    ? options.getItemKey
    : (_item, index) => index;
  const estimate = Math.max(16, Number(options.estimateItemHeight) || DEFAULT_ESTIMATE);
  const overscanMargin = typeof options.overscan === 'number'
    ? `${Math.max(0, Math.round(options.overscan))}px`
    : `${DEFAULT_OVERSCAN_PX}px`;
  const rootMargin = options.rootMargin || `${overscanMargin} 0px`;
  const initialRenderCount = Math.max(0, Number(options.initialRenderCount) || 6);
  const scrollContainer = options.scrollContainer && typeof options.scrollContainer === 'object'
    ? options.scrollContainer
    : container;
  const measureScrollFps = options.measureScrollFps === true;
  const fpsThreshold = Number.isFinite(options.fpsThreshold) ? Number(options.fpsThreshold) : 5000;
  const fpsSampleLimit = Number.isFinite(options.fpsSampleLimit) ? Number(options.fpsSampleLimit) : 240;
  const fpsSettleDelay = Number.isFinite(options.fpsSettleDelay) ? Number(options.fpsSettleDelay) : 180;
  const metricsCallback = typeof options.onMetrics === 'function' ? options.onMetrics : null;

  container.classList.add('virtualized-list');

  const records = new Map();
  let recordOrder = [];
  let contextRef = null;
  let averageHeight = estimate;
  let measuredCount = 0;
  let messageState = null;
  let metrics = null;

  const sizeUpdates = new Map();
  let sizeFlushHandle = null;
  let sizeFlushUsesRaf = false;

  const scheduleSizeFlush = () => {
    if (sizeFlushHandle) return;
    if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
      sizeFlushUsesRaf = true;
      sizeFlushHandle = requestAnimationFrame(() => {
        sizeFlushHandle = null;
        sizeUpdates.forEach((height, record) => {
          if (!record || !record.placeholder) return;
          if (record.placeholder.__virtualRecord !== record) return;
          updateRecordHeight(record, height);
        });
        sizeUpdates.clear();
      });
      return;
    }
    sizeFlushUsesRaf = false;
    sizeFlushHandle = setTimeout(() => {
      sizeFlushHandle = null;
      sizeUpdates.forEach((height, record) => {
        if (!record || !record.placeholder) return;
        if (record.placeholder.__virtualRecord !== record) return;
        updateRecordHeight(record, height);
      });
      sizeUpdates.clear();
    }, 0);
  };
  const scheduleSizeFlushCoalesced = __ccCoalesce(scheduleSizeFlush);

  const resizeObserver = hasResizeObserver
    ? new ResizeObserver(entries => {
      entries.forEach(entry => {
        const placeholder = entry?.target;
        if (!placeholder || !placeholder.__virtualRecord) return;
        const rect = entry.contentRect;
        const height = Math.max(1, Math.round(rect?.height || placeholder.offsetHeight || 0));
        if (!height) return;
        sizeUpdates.set(placeholder.__virtualRecord, height);
      });
      scheduleSizeFlushCoalesced();
    })
    : null;

  const intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const placeholder = entry.target;
      if (!placeholder || !placeholder.__virtualRecord) return;
      if (entry.isIntersecting || entry.intersectionRatio > 0) {
        materializeRecord(placeholder.__virtualRecord);
      } else {
        dematerializeRecord(placeholder.__virtualRecord);
      }
    });
  }, { root: scrollContainer, rootMargin, threshold: 0 });

  const focusHandler = (event) => {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return;
    const placeholder = target.closest(`[data-virtual-key][data-virtualized='true']`);
    if (!placeholder || !placeholder.__virtualRecord) return;
    materializeRecord(placeholder.__virtualRecord, { force: true });
  };

  container.addEventListener('focusin', focusHandler, true);

  const fpsState = {
    active: false,
    samples: [],
    lastTimestamp: null,
    rafId: null,
    settleTimer: null,
    datasetSize: 0,
    scrollHandler: null,
  };

  const hasRaf = typeof requestAnimationFrame === 'function'
    && typeof cancelAnimationFrame === 'function';

  function updateRecordHeight(record, height) {
    if (!record || !Number.isFinite(height)) return;
    if (height === record.height) return;
    record.height = height;
    const placeholder = record.placeholder;
    placeholder.style.minHeight = `${height}px`;
    placeholder.style.setProperty('--virtual-estimate', `${height}px`);
    averageHeight = ((averageHeight * measuredCount) + height) / (measuredCount + 1);
    measuredCount += 1;
  }

  function getFocusToken(placeholder) {
    if (typeof document === 'undefined') return null;
    const active = document.activeElement;
    if (!active || !placeholder.contains(active)) return null;
    return active.getAttribute('data-focus-id') || active.id || null;
  }

  function restoreFocus(placeholder, token) {
    if (!token || typeof document === 'undefined') return;
    let selector = `[data-focus-id="${token.replace(/"/g, '\\"')}"]`;
    if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
      selector = `[data-focus-id="${window.CSS.escape(token)}"]`;
    }
    let target = placeholder.querySelector(selector);
    if (!target && token && token.includes('#')) {
      const id = token.split('#').pop();
      if (id) {
        const escaped = typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function'
          ? window.CSS.escape(id)
          : id.replace(/"/g, '\\"');
        target = placeholder.querySelector(`#${escaped}`);
      }
    }
    if (!target && token && !token.includes('#')) {
      const escapedId = typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function'
        ? window.CSS.escape(token)
        : token.replace(/"/g, '\\"');
      target = placeholder.querySelector(`#${escapedId}`);
    }
    if (target && typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch {
        try { target.focus(); } catch {}
      }
    }
  }

  function materializeRecord(record, { force = false } = {}) {
    if (!record || !record.placeholder) return;
    if (record.materialized && !force) return;
    const placeholder = record.placeholder;
    const previous = record.content && record.content.isConnected ? record.content : null;
    const focusToken = getFocusToken(placeholder);

    placeholder.setAttribute('data-virtual-materialized', 'true');
    placeholder.setAttribute('aria-hidden', 'false');

    const result = renderItem(record.item, {
      index: record.index,
      placeholder,
      context: contextRef,
      previous,
    });

    if (typeof result === 'string') {
      placeholder.innerHTML = result;
    } else if (result instanceof Node) {
      replaceChildren(placeholder, result);
    } else if (isDocumentFragment(result)) {
      replaceChildren(placeholder, result);
    }

    const contentNode = placeholder.firstElementChild || placeholder.firstChild || null;
    record.content = contentNode;
    record.materialized = true;
    placeholder.dataset.virtualized = 'true';

    const measured = Math.max(1, Math.round(placeholder.offsetHeight || (contentNode ? contentNode.offsetHeight : 0)));
    if (measured) {
      updateRecordHeight(record, measured);
    }

    restoreFocus(placeholder, focusToken);
  }

  function dematerializeRecord(record) {
    if (!record || !record.placeholder || !record.materialized) return;
    const placeholder = record.placeholder;
    if (typeof document !== 'undefined' && placeholder.contains(document.activeElement)) {
      return;
    }
    placeholder.innerHTML = '';
    placeholder.setAttribute('data-virtual-materialized', 'false');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.dataset.virtualized = 'true';
    placeholder.style.minHeight = `${Math.max(1, Math.round(record.height || averageHeight || estimate))}px`;
    placeholder.style.setProperty('--virtual-estimate', `${Math.max(1, Math.round(record.height || averageHeight || estimate))}px`);
    record.content = null;
    record.materialized = false;
  }

  function createRecord(item, index) {
    const key = getItemKey(item, index);
    const placeholder = document.createElement(childTag);
    placeholder.className = itemClass;
    placeholder.dataset.virtualKey = String(key);
    placeholder.dataset.virtualized = 'true';
    placeholder.style.minHeight = `${estimate}px`;
    placeholder.style.setProperty('--virtual-estimate', `${estimate}px`);
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.setAttribute('data-virtual-materialized', 'false');
    const record = {
      key,
      item,
      index,
      placeholder,
      materialized: false,
      content: null,
      height: estimate,
    };
    placeholder.__virtualRecord = record;
    if (resizeObserver) {
      resizeObserver.observe(placeholder);
    }
    intersectionObserver.observe(placeholder);
    records.set(key, record);
    return record;
  }

  function clearRecords() {
    recordOrder.forEach(record => {
      if (!record) return;
      intersectionObserver.unobserve(record.placeholder);
      if (resizeObserver) {
        resizeObserver.unobserve(record.placeholder);
      }
      record.placeholder.__virtualRecord = null;
    });
    records.clear();
    recordOrder = [];
  }

  function ensureScrollMetricsSupport() {
    if (!measureScrollFps || !hasRaf || !scrollContainer || typeof scrollContainer.addEventListener !== 'function') {
      return;
    }
    if (fpsState.scrollHandler) return;
    fpsState.scrollHandler = () => {
      if (!fpsState.active) {
        startFpsMeasurement();
      }
      if (fpsState.settleTimer) {
        window.clearTimeout(fpsState.settleTimer);
      }
      fpsState.settleTimer = window.setTimeout(() => stopFpsMeasurement(), fpsSettleDelay);
    };
    scrollContainer.addEventListener('scroll', fpsState.scrollHandler, { passive: true });
  }

  function startFpsMeasurement() {
    if (!hasRaf) return;
    fpsState.active = true;
    fpsState.samples = [];
    fpsState.lastTimestamp = null;
    const step = (timestamp) => {
      if (!fpsState.active) return;
      if (fpsState.lastTimestamp !== null) {
        const delta = timestamp - fpsState.lastTimestamp;
        if (delta > 0) {
          fpsState.samples.push(delta);
          if (fpsState.samples.length >= fpsSampleLimit) {
            stopFpsMeasurement();
            return;
          }
        }
      }
      fpsState.lastTimestamp = timestamp;
      fpsState.rafId = requestAnimationFrame(step);
    };
    fpsState.rafId = requestAnimationFrame(step);
  }

  function stopFpsMeasurement() {
    if (!fpsState.active) return;
    fpsState.active = false;
    if (fpsState.rafId) {
      cancelAnimationFrame(fpsState.rafId);
      fpsState.rafId = null;
    }
    if (fpsState.settleTimer) {
      window.clearTimeout(fpsState.settleTimer);
      fpsState.settleTimer = null;
    }
    if (!fpsState.samples.length) {
      fpsState.lastTimestamp = null;
      return;
    }
    const total = fpsState.samples.reduce((sum, value) => sum + value, 0);
    const averageFrameMs = total / fpsState.samples.length;
    const worstFrameMs = Math.max(...fpsState.samples);
    const averageFps = averageFrameMs ? 1000 / averageFrameMs : 0;
    const worstFps = worstFrameMs ? 1000 / worstFrameMs : 0;
    metrics = {
      averageFrameMs,
      worstFrameMs,
      averageFps,
      worstFps,
      sampleCount: fpsState.samples.length,
      datasetSize: fpsState.datasetSize,
      timestamp: Date.now(),
    };
    if (metricsCallback) {
      try {
        metricsCallback({ ...metrics });
      } catch {}
    }
    fpsState.samples = [];
    fpsState.lastTimestamp = null;
  }

  function update(items = [], context = null) {
    if (!Array.isArray(items)) {
      items = [];
    }
    if (messageState) {
      container.innerHTML = '';
      messageState = null;
    }
    contextRef = context;

    const fragment = document.createDocumentFragment();
    const nextOrder = [];
    const usedKeys = new Set();

    items.forEach((item, index) => {
      const key = getItemKey(item, index);
      let record = records.get(key);
      if (!record) {
        record = createRecord(item, index);
      }
      record.item = item;
      record.index = index;
      usedKeys.add(key);
      nextOrder.push(record);
      fragment.appendChild(record.placeholder);
    });

    recordOrder.forEach(record => {
      if (!record) return;
      if (!usedKeys.has(record.key)) {
        intersectionObserver.unobserve(record.placeholder);
        if (resizeObserver) {
          resizeObserver.unobserve(record.placeholder);
        }
        record.placeholder.remove();
        record.placeholder.__virtualRecord = null;
        records.delete(record.key);
      }
    });

    recordOrder = nextOrder;

    if (container.firstChild) {
      container.innerHTML = '';
    }
    container.appendChild(fragment);

    if (recordOrder.length) {
      for (let i = 0; i < Math.min(initialRenderCount, recordOrder.length); i += 1) {
        materializeRecord(recordOrder[i]);
      }
    }

    ensureScrollMetricsSupport();
    fpsState.datasetSize = recordOrder.length;
    if (measureScrollFps && fpsState.datasetSize < fpsThreshold) {
      stopFpsMeasurement();
    }
    if (measureScrollFps && fpsState.datasetSize >= fpsThreshold && typeof window !== 'undefined') {
      if (typeof window.__ccVirtualMetrics === 'object') {
        window.__ccVirtualMetrics.virtualListThreshold = fpsThreshold;
      }
    }
  }

  function refresh(nextContext = contextRef) {
    contextRef = nextContext;
    recordOrder.forEach(record => {
      if (!record) return;
      if (record.materialized) {
        materializeRecord(record, { force: true });
      }
    });
  }

  function showMessage(message = '', { tone = 'info' } = {}) {
    stopFpsMeasurement();
    clearRecords();
    container.innerHTML = '';
    if (!message) {
      messageState = null;
      return;
    }
    const el = document.createElement('div');
    el.className = `${MESSAGE_CLASS}${tone ? ` ${MESSAGE_CLASS}--${tone}` : ''}`;
    el.textContent = message;
    container.appendChild(el);
    messageState = { message, tone };
  }

  function disconnect() {
    stopFpsMeasurement();
    container.removeEventListener('focusin', focusHandler, true);
    if (fpsState.scrollHandler && scrollContainer && typeof scrollContainer.removeEventListener === 'function') {
      scrollContainer.removeEventListener('scroll', fpsState.scrollHandler, { passive: true });
    }
    intersectionObserver.disconnect();
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    if (sizeFlushHandle) {
      if (sizeFlushUsesRaf && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(sizeFlushHandle);
      } else {
        clearTimeout(sizeFlushHandle);
      }
      sizeFlushHandle = null;
    }
    sizeUpdates.clear();
    clearRecords();
  }

  function getMetrics() {
    return metrics ? { ...metrics } : null;
  }

  return {
    update,
    refresh,
    showMessage,
    disconnect,
    getMetrics,
  };
}

export { createVirtualizedList };
