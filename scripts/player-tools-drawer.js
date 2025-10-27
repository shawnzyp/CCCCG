const createEventTarget = () => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.EventTarget === 'function') {
    return new globalThis.EventTarget();
  }
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (typeof callback !== 'function') return;
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      const set = listeners.get(type);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) {
        listeners.delete(type);
      }
    },
    dispatchEvent(event) {
      if (!event || typeof event.type !== 'string') return true;
      const set = listeners.get(event.type);
      if (!set) return true;
      set.forEach((listener) => {
        listener.call(undefined, event);
      });
      return true;
    }
  };
};

const createCustomEvent = (type, detail) => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.CustomEvent === 'function') {
    return new globalThis.CustomEvent(type, { detail });
  }
  return { type, detail };
};

const stateEvents = createEventTarget();

const DRAWER_CHANGE_EVENT = 'cc:player-tools-drawer';

let controllerInstance = null;
let lastKnownState = { open: false, progress: 0 };

function createPlayerToolsDrawer() {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) {
    return {
      open() {},
      close() {},
      toggle() {},
      subscribe(listener) {
        if (typeof listener === 'function') {
          listener({ open: false, progress: 0 });
        }
        return () => {};
      }
    };
  }

  const dispatchStateChange = (isOpen) => {
    const progress = clamp(openProgress, 0, 1);
    const detail = { open: Boolean(isOpen), progress };
    lastKnownState = detail;
    stateEvents.dispatchEvent(createCustomEvent('change', detail));
    if (typeof document?.dispatchEvent === 'function') {
      const CustomEventCtor =
        (typeof globalThis !== 'undefined' && typeof globalThis.CustomEvent === 'function')
          ? globalThis.CustomEvent
          : (typeof CustomEvent === 'function' ? CustomEvent : null);
      if (CustomEventCtor) {
        try {
          document.dispatchEvent(new CustomEventCtor(DRAWER_CHANGE_EVENT, { detail }));
        } catch (err) {
          /* ignore dispatch failures */
        }
      }
    }
  };

  const scrim = drawer.querySelector('.player-tools-drawer__scrim');
  const content = drawer.querySelector('[data-player-tools-content]');

  const motionPreference = null;

  const body = document.body;
  const root = document.documentElement;

  let scrollLockState = null;

  const getScrollOffsets = () => {
    if (typeof window === 'undefined') {
      const doc = document.documentElement;
      return {
        top: Number.isFinite(doc?.scrollTop) ? doc.scrollTop : 0,
        left: Number.isFinite(doc?.scrollLeft) ? doc.scrollLeft : 0
      };
    }
    const top = window.pageYOffset || document.documentElement?.scrollTop || body?.scrollTop || 0;
    const left = window.pageXOffset || document.documentElement?.scrollLeft || body?.scrollLeft || 0;
    return {
      top: Number.isFinite(top) ? top : 0,
      left: Number.isFinite(left) ? left : 0
    };
  };

  const lockDocumentScroll = () => {
    if (!body) return;

    if (!scrollLockState) {
      const offsets = getScrollOffsets();
      scrollLockState = {
        position: body.style.position || '',
        top: body.style.top || '',
        left: body.style.left || '',
        width: body.style.width || '',
        paddingRight: body.style.paddingRight || '',
        scrollTop: offsets.top,
        scrollLeft: offsets.left
      };

      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : null;
      const docWidth = document.documentElement?.clientWidth;
      const scrollbarWidth =
        Number.isFinite(viewportWidth) && Number.isFinite(docWidth)
          ? Math.max(0, viewportWidth - docWidth)
          : 0;

      body.style.position = 'fixed';
      body.style.top = `-${scrollLockState.scrollTop}px`;
      body.style.left = `-${scrollLockState.scrollLeft}px`;
      body.style.width = '100%';

      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    body.classList.add('player-tools-open');
    if (root) {
      root.classList.add('player-tools-open');
    }
  };

  const unlockDocumentScroll = () => {
    if (body) {
      body.classList.remove('player-tools-open');
    }
    if (root) {
      root.classList.remove('player-tools-open');
    }

    if (!body || !scrollLockState) {
      scrollLockState = null;
      return;
    }

    const { position, top, left, width, paddingRight, scrollTop, scrollLeft } = scrollLockState;

    body.style.position = position;
    body.style.top = top;
    body.style.left = left;
    body.style.width = width;
    body.style.paddingRight = paddingRight;

    scrollLockState = null;

    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(scrollLeft || 0, scrollTop || 0);
    } else if (document.documentElement) {
      if (Number.isFinite(scrollTop)) {
        document.documentElement.scrollTop = scrollTop;
      }
      if (Number.isFinite(scrollLeft)) {
        document.documentElement.scrollLeft = scrollLeft;
      }
    }
  };
  const requestFrame =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) =>
          window.setTimeout(
            () =>
              callback(
                typeof performance !== 'undefined' && typeof performance.now === 'function'
                  ? performance.now()
                  : Date.now()
              ),
            16
          );

  const cancelFrame =
    typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : (handle) => window.clearTimeout(handle);


  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return value;
    if (Number.isFinite(min) && value < min) return min;
    if (Number.isFinite(max) && value > max) return max;
    return value;
  };

  const parseDuration = (value) => {
    if (typeof value !== 'string') {
      return Number.isFinite(value) ? Number(value) : 0;
    }
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (trimmed.endsWith('ms')) {
      const parsed = parseFloat(trimmed.slice(0, -2));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (trimmed.endsWith('s')) {
      const parsed = parseFloat(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed * 1000 : 0;
    }
    const fallback = parseFloat(trimmed);
    return Number.isFinite(fallback) ? fallback : 0;
  };

  const getTransitionDuration = () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const raw = rootStyles.getPropertyValue('--player-tools-transition-duration');
    const duration = parseDuration(raw);
    return Number.isFinite(duration) && duration >= 0 ? duration : 0;
  };

  const easeOutCubic = (value) => {
    const clamped = clamp(value, 0, 1);
    const inverted = 1 - clamped;
    return 1 - inverted * inverted * inverted;
  };

  let openProgress = 0;

  const applyOpenProgress = (value) => {
    const next = clamp(value, 0, 1);
    openProgress = next;
    drawer.style.setProperty('--player-tools-open-progress', `${next}`);
    tab.style.setProperty('--player-tools-open-progress', `${next}`);
    if (content) {
      content.style.setProperty('--player-tools-open-progress', `${next}`);
    }
    lastKnownState = { open: lastKnownState.open, progress: next };
  };

  let openAnimationFrame = null;
  let openAnimationStart = null;
  let openAnimationTarget = 0;
  let openAnimationCompletion = null;

  const stopOpenAnimation = (cancelled) => {
    if (openAnimationFrame !== null) {
      cancelFrame(openAnimationFrame);
      openAnimationFrame = null;
    }
    openAnimationStart = null;
    if (!cancelled && typeof openAnimationCompletion === 'function') {
      openAnimationCompletion();
    }
    openAnimationCompletion = null;
  };

  const isMotionReduced = () => false;

  const animateOpenProgress = (target, onComplete) => {
    const destination = clamp(target, 0, 1);
    stopOpenAnimation(true);

    if (isMotionReduced()) {
      applyOpenProgress(destination);
      if (typeof onComplete === 'function') {
        onComplete();
      }
      return;
    }

    const duration = getTransitionDuration();
    const startValue = openProgress;
    if (!Number.isFinite(duration) || duration <= 16 || Math.abs(startValue - destination) <= 0.001) {
      applyOpenProgress(destination);
      if (typeof onComplete === 'function') {
        onComplete();
      }
      return;
    }

    openAnimationTarget = destination;
    openAnimationCompletion = typeof onComplete === 'function' ? onComplete : null;
    openAnimationStart = null;

    const step = (timestamp) => {
      if (openAnimationStart === null) {
        openAnimationStart = timestamp;
      }
      const elapsed = timestamp - openAnimationStart;
      const progress = clamp(duration === 0 ? 1 : elapsed / duration, 0, 1);
      const eased = easeOutCubic(progress);
      const value = startValue + (openAnimationTarget - startValue) * eased;
      applyOpenProgress(value);
      if (progress < 1) {
        openAnimationFrame = requestFrame(step);
        return;
      }
      openAnimationFrame = null;
      openAnimationStart = null;
      applyOpenProgress(openAnimationTarget);
      if (typeof openAnimationCompletion === 'function') {
        openAnimationCompletion();
      }
      openAnimationCompletion = null;
    };

    openAnimationFrame = requestFrame(step);
  };

  const applyTabTopProperty = () => {
    if (!tab) return;
    const viewport = window.visualViewport;

    if (viewport) {
      const viewportHeight = Number.isFinite(viewport.height) ? viewport.height : 0;
      const viewportTop = Number.isFinite(viewport.offsetTop)
        ? viewport.offsetTop
        : Number.isFinite(viewport.pageTop)
          ? viewport.pageTop
          : 0;
      const desiredCenter = viewportTop + viewportHeight / 2;
      if (Number.isFinite(desiredCenter) && viewportHeight > 0) {
        tab.style.setProperty('--player-tools-tab-top', `${desiredCenter}px`);
      } else {
        tab.style.removeProperty('--player-tools-tab-top');
      }
      return;
    }

    const viewHeight = window.innerHeight || document.documentElement?.clientHeight;
    const scrollTop = window.pageYOffset || document.documentElement?.scrollTop || 0;
    if (!Number.isFinite(viewHeight) || viewHeight <= 0) {
      tab.style.removeProperty('--player-tools-tab-top');
      return;
    }
    const desiredCenter = scrollTop + viewHeight / 2;
    if (Number.isFinite(desiredCenter)) {
      tab.style.setProperty('--player-tools-tab-top', `${desiredCenter}px`);
    } else {
      tab.style.removeProperty('--player-tools-tab-top');
    }
  };

  const getDrawerSlideDirection = () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const direction = parseFloat(rootStyles.getPropertyValue('--drawer-slide-direction'));
    return Number.isFinite(direction) && direction !== 0 ? direction : -1;
  };

  const updateTabOffset = (width) => {
    if (!tab || !drawer) return;
    const rect = typeof drawer.getBoundingClientRect === 'function' ? drawer.getBoundingClientRect() : null;
    let drawerWidth = Number.isFinite(width) ? width : rect?.width;
    if (!Number.isFinite(drawerWidth) || drawerWidth <= 0) {
      const fallbackWidth = drawer.offsetWidth || drawer.clientWidth;
      if (Number.isFinite(fallbackWidth) && fallbackWidth > 0) {
        drawerWidth = fallbackWidth;
      }
    }
    const tabStyle = tab?.style;
    const clearTabOffset = () => {
      if (!tabStyle) return;
      if (typeof tabStyle.removeProperty === 'function') {
        tabStyle.removeProperty('--player-tools-tab-offset');
        return;
      }
      if (typeof tabStyle.setProperty === 'function') {
        tabStyle.setProperty('--player-tools-tab-offset', '0px');
      }
    };

    if (!Number.isFinite(drawerWidth) || drawerWidth <= 0) {
      clearTabOffset();
      return;
    }
    const direction = getDrawerSlideDirection();
    const baseOffset = drawerWidth * direction * -1;
    if (!Number.isFinite(baseOffset)) {
      clearTabOffset();
      return;
    }

    let offset = baseOffset;

    const computeViewportWidth = () => {
      const measurements = [];
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width;
      if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
        measurements.push(viewportWidth);
      }

      const innerWidth = window.innerWidth;
      if (Number.isFinite(innerWidth) && innerWidth > 0) {
        measurements.push(innerWidth);
      }

      const docElement = document.documentElement;
      const docClientWidth = docElement?.clientWidth;
      if (Number.isFinite(docClientWidth) && docClientWidth > 0) {
        measurements.push(docClientWidth);
      }

      const bodyClientWidth = document.body?.clientWidth;
      if (Number.isFinite(bodyClientWidth) && bodyClientWidth > 0) {
        measurements.push(bodyClientWidth);
      }

      if (!measurements.length) return null;
      return Math.min(...measurements);
    };

    const computeTabWidth = () => {
      if (!tab) return null;
      if (typeof tab.getBoundingClientRect === 'function') {
        const rect = tab.getBoundingClientRect();
        if (rect && Number.isFinite(rect.width) && rect.width > 0) {
          return rect.width;
        }
      }
      const fallbackWidth = tab.offsetWidth || tab.clientWidth;
      if (Number.isFinite(fallbackWidth) && fallbackWidth > 0) {
        return fallbackWidth;
      }
      return null;
    };

    const viewportWidth = computeViewportWidth();
    const tabWidth = computeTabWidth();

    if (Number.isFinite(viewportWidth) && viewportWidth > 0 && Number.isFinite(tabWidth) && tabWidth > 0) {
      const availableDistance = Math.max(0, viewportWidth - tabWidth);
      if (offset > 0) {
        offset = Math.min(offset, availableDistance);
      } else if (offset < 0) {
        offset = Math.max(offset, -availableDistance);
      }
    }

    if (tabStyle && typeof tabStyle.setProperty === 'function') {
      tabStyle.setProperty('--player-tools-tab-offset', `${offset}px`);
    }
  };

  let tabTopUpdateFrame = null;
  const scheduleTabTopUpdate = () => {
    if (tabTopUpdateFrame !== null) return;
    tabTopUpdateFrame = requestFrame(() => {
      tabTopUpdateFrame = null;
      applyTabTopProperty();
      updateTabOffset();
    });
  };

  const initializeTabTrackers = () => {
    applyTabTopProperty();
    updateTabOffset();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleTabTopUpdate);
      window.visualViewport.addEventListener('scroll', scheduleTabTopUpdate);
    } else {
      window.addEventListener('resize', scheduleTabTopUpdate);
      window.addEventListener('orientationchange', scheduleTabTopUpdate);
      window.addEventListener('scroll', scheduleTabTopUpdate, { passive: true });
    }

    if (typeof ResizeObserver === 'function') {
      const drawerObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry?.target === drawer) {
            const measuredWidth = entry?.contentRect?.width;
            updateTabOffset(typeof measuredWidth === 'number' ? measuredWidth : undefined);
            scheduleTabTopUpdate();
          }
        }
      });
      drawerObserver.observe(drawer);
      drawer._playerToolsDrawerResizeObserver = drawerObserver;

      const tabObserver = new ResizeObserver(() => {
        scheduleTabTopUpdate();
      });
      tabObserver.observe(tab);
      tab._playerToolsTabResizeObserver = tabObserver;
    }
  };

  initializeTabTrackers();

  applyOpenProgress(drawer.classList.contains('is-open') ? 1 : 0);

  const batteryBadge = drawer.querySelector('[data-player-tools-battery]');
  const batteryFill = batteryBadge?.querySelector('[data-player-tools-battery-fill]');
  const batteryText = batteryBadge?.querySelector('[data-player-tools-battery-text]');
  const batteryPercent = batteryBadge?.querySelector('[data-player-tools-battery-percent]');
  const batteryLabel = batteryBadge?.querySelector('[data-player-tools-battery-label]');

  const setBatteryLabel = (message) => {
    if (!batteryLabel || typeof message !== 'string') return;
    batteryLabel.textContent = message;
  };

  const setBatteryText = (value) => {
    if (!batteryText || typeof value !== 'string') return;
    batteryText.textContent = value;
  };

  const setBatteryPercent = (value, { charging } = {}) => {
    if (!batteryPercent) return;
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const match = trimmed.match(/(\d{1,3})/);
    if (!match) {
      batteryPercent.textContent = '';
      batteryPercent.setAttribute('hidden', '');
      batteryPercent.removeAttribute('data-charging');
      return;
    }

    const parsed = parseInt(match[1], 10);
    const clamped = Number.isNaN(parsed)
      ? match[1]
      : String(Math.max(0, Math.min(parsed, 100)));

    batteryPercent.textContent = clamped;
    batteryPercent.removeAttribute('hidden');

    if (charging === true) {
      batteryPercent.dataset.charging = 'true';
    } else {
      batteryPercent.removeAttribute('data-charging');
    }
  };

  const setBatteryFill = (percent) => {
    if (!batteryFill) return;
    if (!Number.isFinite(percent)) {
      batteryFill.style.setProperty('--player-tools-meter-fill', '0%');
      return;
    }
    const clamped = clamp(Math.round(percent), 0, 100);
    batteryFill.style.setProperty('--player-tools-meter-fill', `${clamped}%`);
  };

  const setBatteryState = (state, { text, fill, announcement, charging } = {}) => {
    if (!batteryBadge) return;
    if (state) {
      batteryBadge.dataset.batteryState = state;
    } else {
      batteryBadge.removeAttribute('data-battery-state');
    }
    const isCharging = charging === true;
    if (isCharging) {
      batteryBadge.setAttribute('data-battery-charging', 'true');
    } else {
      batteryBadge.removeAttribute('data-battery-charging');
    }
    if (typeof text === 'string') {
      setBatteryText(text);
      setBatteryPercent(text, { charging: isCharging });
    } else {
      setBatteryPercent('', { charging: isCharging });
    }
    if (Number.isFinite(fill)) {
      setBatteryFill(fill);
    }
    if (fill === null) {
      setBatteryFill(0);
    }
    if (typeof announcement === 'string') {
      setBatteryLabel(announcement);
    }
  };

  const normalizeBatteryState = (state) => {
    if (typeof state !== 'string') return '';
    const trimmed = state.trim().toLowerCase();
    switch (trimmed) {
      case 'full':
      case 'high':
      case 'green':
        return 'green';
      case 'medium':
      case 'orange':
        return 'orange';
      case 'yellow':
        return 'yellow';
      case 'low':
      case 'red':
        return 'red';
      case 'empty':
      case 'critical':
        return 'critical';
      case 'unavailable':
        return 'unavailable';
      default:
        return '';
    }
  };

  const applyBatteryStatus = ({ percent, charging, state, text, announcement } = {}) => {
    if (!batteryBadge) return;

    const numericPercent = Number.isFinite(percent) ? clamp(Math.round(percent), 0, 100) : null;
    const explicitState = typeof state === 'string' && state.trim() ? state.trim() : '';
    const chargingProvided = charging === true || charging === false;
    const isCharging =
      charging === true || (!chargingProvided && explicitState === 'charging');

    const normalizedState = normalizeBatteryState(explicitState);

    const resolvedState = (() => {
      if (normalizedState) {
        return normalizedState;
      }
      if (explicitState === 'charging' && !isCharging) {
        if (numericPercent === null) {
          return 'unavailable';
        }
        return getBatteryStateFromLevel(numericPercent / 100);
      }
      if (numericPercent === null) {
        return 'unavailable';
      }
      return getBatteryStateFromLevel(numericPercent / 100);
    })();

    let resolvedText = typeof text === 'string' ? text.trim() : '';
    if (!resolvedText) {
      if (numericPercent === null) {
        resolvedText = isCharging ? 'Charging' : 'Unavailable';
      } else {
        resolvedText = isCharging ? `Charging ${numericPercent}%` : `${numericPercent}%`;
      }
    }

    const resolvedAnnouncement =
      typeof announcement === 'string' && announcement.trim()
        ? announcement
        : describeBatteryAnnouncement(numericPercent, isCharging);

    setBatteryState(resolvedState, {
      text: resolvedText,
      fill: numericPercent,
      announcement: resolvedAnnouncement,
      charging: isCharging
    });
  };

  const describeBatteryAnnouncement = (percent, charging) => {
    if (!Number.isFinite(percent)) {
      return 'Battery status unavailable';
    }
    const rounded = clamp(Math.round(percent), 0, 100);
    if (charging) {
      return `Battery charging, ${rounded} percent available`;
    }
    if (rounded >= 100) {
      return 'Battery fully charged';
    }
    if (rounded <= 9) {
      return `Battery critically low, ${rounded} percent remaining`;
    }
    if (rounded <= 34) {
      return `Battery low, ${rounded} percent remaining`;
    }
    return `Battery at ${rounded} percent`;
  };

  const getBatteryStateFromLevel = (level) => {
    if (!Number.isFinite(level)) return 'unavailable';
    const clamped = clamp(level, 0, 1);
    const percent = clamped * 100;
    if (percent >= 75) return 'green';
    if (percent >= 50) return 'orange';
    if (percent >= 35) return 'yellow';
    if (percent >= 10) return 'red';
    return 'critical';
  };

  const updateBatteryFromManager = (batteryManager) => {
    if (!batteryManager) {
      applyBatteryStatus({
        percent: null,
        charging: false,
        state: 'unavailable',
        text: 'Unavailable',
        announcement: 'Battery status unavailable'
      });
      return;
    }

    const level = Number.isFinite(batteryManager.level) ? batteryManager.level : null;
    const charging = batteryManager.charging === true;
    if (level === null) {
      applyBatteryStatus({
        percent: charging ? 50 : null,
        charging,
        state: 'unavailable',
        text: charging ? 'Charging' : 'Unavailable',
        announcement: 'Battery status unavailable'
      });
      return;
    }

    const clampedLevel = clamp(level, 0, 1);
    const percent = clamp(Math.round(clampedLevel * 100), 0, 100);
    applyBatteryStatus({ percent, charging });
  };

  const parseBatteryNumber = (value) => {
    if (Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const match = value.match(/-?\d+(?:\.\d+)?/);
      if (match) {
        const parsed = parseFloat(match[0]);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return null;
  };

  const parseBatteryCharging = (value) => {
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'on', 'charging'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
    }
    return null;
  };

  const updateBatteryFromDetail = (detail) => {
    if (!detail || typeof detail !== 'object') return;

    const percentValue = (() => {
      const explicitPercent = parseBatteryNumber(detail.percent);
      if (Number.isFinite(explicitPercent)) {
        return explicitPercent;
      }
      const fill = parseBatteryNumber(detail.fill);
      if (Number.isFinite(fill)) {
        return fill;
      }
      const level = parseBatteryNumber(detail.level);
      if (Number.isFinite(level)) {
        return level > 1 ? level : level * 100;
      }
      return null;
    })();

    const chargingValue = parseBatteryCharging(detail.charging);
    const stateValue = typeof detail.state === 'string' ? detail.state : undefined;
    const textValue = typeof detail.text === 'string' ? detail.text : undefined;
    const announcementValue =
      typeof detail.announcement === 'string'
        ? detail.announcement
        : typeof detail.label === 'string'
          ? detail.label
          : undefined;

    if (stateValue === 'unavailable' && percentValue === null && chargingValue === null) {
      applyBatteryStatus({
        percent: null,
        charging: false,
        state: 'unavailable',
        text: textValue,
        announcement: announcementValue
      });
      return;
    }

    applyBatteryStatus({
      percent: percentValue,
      charging: chargingValue,
      state: stateValue,
      text: textValue,
      announcement: announcementValue
    });
  };

  if (batteryBadge) {
    applyBatteryStatus({
      percent: null,
      charging: false,
      state: 'unavailable',
      text: 'Unavailable',
      announcement: 'Battery status unavailable'
    });

    const supportsBatteryApi =
      typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function';

    if (supportsBatteryApi) {
      navigator
        .getBattery()
        .then((batteryManager) => {
          if (!batteryManager) {
            applyBatteryStatus({
              percent: null,
              charging: false,
              state: 'unavailable',
              text: 'Unavailable',
              announcement: 'Battery status unavailable'
            });
            return;
          }

          const handleBatteryChange = () => {
            updateBatteryFromManager(batteryManager);
          };

          updateBatteryFromManager(batteryManager);

          batteryManager.addEventListener('levelchange', handleBatteryChange);
          batteryManager.addEventListener('chargingchange', handleBatteryChange);

          const previousCleanup =
            typeof batteryBadge._playerToolsBatteryCleanup === 'function'
              ? batteryBadge._playerToolsBatteryCleanup
              : null;

          batteryBadge._playerToolsBatteryCleanup = () => {
            batteryManager.removeEventListener('levelchange', handleBatteryChange);
            batteryManager.removeEventListener('chargingchange', handleBatteryChange);
            if (previousCleanup) {
              previousCleanup();
            }
          };
        })
        .catch(() => {
          applyBatteryStatus({
            percent: null,
            charging: false,
            state: 'unavailable',
            text: 'Unavailable',
            announcement: 'Battery status unavailable'
          });
        });
    }

    const handleBatteryEvent = (event) => {
      if (!event) return;
      updateBatteryFromDetail(event.detail);
    };

    let removeBatteryEventListener = null;

    if (typeof document !== 'undefined') {
      const removeExisting =
        typeof document.removeEventListener === 'function'
          ? document.removeEventListener.bind(document, 'player-tools-battery-update')
          : null;
      if (removeExisting && batteryBadge._playerToolsBatteryEventHandler) {
        removeExisting(batteryBadge._playerToolsBatteryEventHandler);
      }
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('player-tools-battery-update', handleBatteryEvent);
        removeBatteryEventListener = document.removeEventListener
          ? () => document.removeEventListener('player-tools-battery-update', handleBatteryEvent)
          : null;
      }
    }

    batteryBadge._playerToolsBatteryDetail = updateBatteryFromDetail;
    batteryBadge._playerToolsBatteryEventHandler = handleBatteryEvent;

    const existingCleanup =
      typeof batteryBadge._playerToolsBatteryCleanup === 'function'
        ? batteryBadge._playerToolsBatteryCleanup
        : null;

    batteryBadge._playerToolsBatteryCleanup = () => {
      if (removeBatteryEventListener) {
        removeBatteryEventListener();
      }
      if (existingCleanup) {
        existingCleanup();
      }
    };
  }

  const clockElement = drawer.querySelector('[data-player-tools-clock]');
  let clockTimer = null;

  const clearClockTimer = () => {
    if (clockTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(clockTimer);
      clockTimer = null;
    }
  };

  const formatClockValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    try {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(hours)}:${pad(minutes)}`;
    }
  };

  const updateClock = () => {
    if (!clockElement) return;
    const now = new Date();
    const formatted = formatClockValue(now);
    if (formatted) {
      clockElement.textContent = formatted;
    }
    if (clockElement.setAttribute && Number.isFinite(now.getTime())) {
      clockElement.setAttribute('datetime', now.toISOString());
    }
  };

  const scheduleClockTick = () => {
    if (!clockElement || typeof window === 'undefined') return;
    clearClockTimer();
    const now = new Date();
    const secondsRemaining = 60 - now.getSeconds() - now.getMilliseconds() / 1000;
    const delay = Math.max(500, Math.round(secondsRemaining * 1000));
    clockTimer = window.setTimeout(() => {
      clockTimer = null;
      updateClock();
      scheduleClockTick();
    }, delay);
  };

  if (clockElement) {
    updateClock();
    scheduleClockTick();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', clearClockTimer, { once: true });
      window.addEventListener('beforeunload', clearClockTimer, { once: true });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          updateClock();
          scheduleClockTick();
        }
      });
    }
  }

  const focusableSelectors = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]'
  ].join(',');

  const isInertSupported = 'inert' in HTMLElement.prototype;

  const isElementVisible = (element) => {
    if (!element) return false;
    if (element.closest('[hidden]')) return false;
    const rects = element.getClientRects();
    if (rects.length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };

  const isElementFocusable = (element) => {
    if (!element) return false;
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.matches('[tabindex="-1"]')) return false;
    return isElementVisible(element);
  };

  const applyFallbackInert = (container) => {
    if (isInertSupported || !container) return;
    container.querySelectorAll(focusableSelectors).forEach((element) => {
      if (!element.hasAttribute('data-inert-tabindex')) {
        const existingTabIndex = element.getAttribute('tabindex');
        if (existingTabIndex !== null) {
          element.setAttribute('data-inert-tabindex', existingTabIndex);
        } else {
          element.setAttribute('data-inert-tabindex', '');
        }
      }
      element.setAttribute('tabindex', '-1');
    });
  };

  const removeFallbackInert = (container) => {
    if (isInertSupported || !container) return;
    container.querySelectorAll('[data-inert-tabindex]').forEach((element) => {
      const originalTabIndex = element.getAttribute('data-inert-tabindex');
      if (originalTabIndex === '') {
        element.removeAttribute('tabindex');
      } else {
        element.setAttribute('tabindex', originalTabIndex);
      }
      element.removeAttribute('data-inert-tabindex');
    });
  };

  const setElementInert = (element) => {
    if (!element) return;
    element.setAttribute('inert', '');
    applyFallbackInert(element);
  };

  const removeElementInert = (element) => {
    if (!element) return;
    element.removeAttribute('inert');
    removeFallbackInert(element);
  };

  const getExternalInertTargets = () => {
    return Array.from(document.body.children).filter((element) => {
      if (element === drawer || element === tab) return false;
      if (element.tagName === 'SCRIPT') return false;
      return true;
    });
  };

  const getFocusableElements = () => {
    const drawerFocusables = Array.from(drawer.querySelectorAll(focusableSelectors)).filter((element) =>
      isElementFocusable(element)
    );
    const ordered = [];
    const addUnique = (element) => {
      if (element && !ordered.includes(element)) {
        ordered.push(element);
      }
    };

    if (drawer.classList.contains('is-open')) {
      drawerFocusables.forEach(addUnique);
      addUnique(tab);
    } else {
      addUnique(tab);
      drawerFocusables.forEach(addUnique);
    }

    return ordered;
  };

  const focusWithinTrap = (preferred) => {
    const focusables = getFocusableElements();
    if (preferred && focusables.includes(preferred)) {
      preferred.focus({ preventScroll: true });
      return;
    }
    const primaryTargets = focusables.filter((element) => element && element !== tab);
    if (primaryTargets.length > 0) {
      primaryTargets[0].focus({ preventScroll: true });
      return;
    }
    if (focusables.length > 0) {
      focusables[0].focus({ preventScroll: true });
      return;
    }
    if (content) {
      content.focus({ preventScroll: true });
      return;
    }
    drawer.focus({ preventScroll: true });
  };

  let externalInertTargets = [];
  let lastFocusWithin = null;

  const setOpenState = (open) => {
    const currentlyOpen = drawer.classList.contains('is-open');
    const isOpen = typeof open === 'boolean' ? open : !currentlyOpen;

    scheduleTabTopUpdate();

    if (isOpen === currentlyOpen) {
      return;
    }

    drawer.classList.toggle('is-open', isOpen);
    tab.classList.toggle('is-open', isOpen);
    if (scrim && isOpen) {
      scrim.hidden = false;
    }
    if (isOpen) {
      lockDocumentScroll();
    } else {
      unlockDocumentScroll();
    }
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      removeElementInert(drawer);
      externalInertTargets = getExternalInertTargets();
      externalInertTargets.forEach(setElementInert);
    } else {
      externalInertTargets.forEach(removeElementInert);
      externalInertTargets = [];
      setElementInert(drawer);
    }
    animateOpenProgress(isOpen ? 1 : 0, () => {
      if (!isOpen && scrim) {
        scrim.hidden = true;
      }
    });

    if (isOpen) {
      focusWithinTrap();
    } else {
      tab.focus({ preventScroll: true });
    }

    if (typeof document?.dispatchEvent === 'function') {
      const detail = { open: isOpen };
      document.dispatchEvent(new CustomEvent('player-tools-drawer-toggle', { detail }));
      document.dispatchEvent(new CustomEvent(isOpen ? 'player-tools-drawer-open' : 'player-tools-drawer-close', { detail }));
    }

    dispatchStateChange(isOpen);
  };

  const getPointerTimestamp = () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const isInstantPointerEvent = (event) =>
    event
    && typeof event.pointerType === 'string'
    && (event.pointerType === 'touch' || event.pointerType === 'pen');

  let lastInstantTabToggle = 0;
  let lastInstantScrimToggle = 0;

  tab.addEventListener('pointerdown', (event) => {
    if (!isInstantPointerEvent(event)) return;
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    lastInstantTabToggle = getPointerTimestamp();
    setOpenState();
  });

  tab.addEventListener('click', () => {
    const now = getPointerTimestamp();
    if (lastInstantTabToggle && now - lastInstantTabToggle < 400) {
      lastInstantTabToggle = 0;
      return;
    }
    setOpenState();
  });

  if (scrim) {
    scrim.addEventListener('pointerdown', (event) => {
      if (!isInstantPointerEvent(event)) return;
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      lastInstantScrimToggle = getPointerTimestamp();
      setOpenState(false);
    });

    scrim.addEventListener('click', () => {
      const now = getPointerTimestamp();
      if (lastInstantScrimToggle && now - lastInstantScrimToggle < 400) {
        lastInstantScrimToggle = 0;
        return;
      }
      setOpenState(false);
    });
  }

  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.stopPropagation();
      event.preventDefault();
      setOpenState(false);
    }
  });

  const trackFocus = (event) => {
    const target = event.target;
    if (drawer.contains(target) || target === tab || tab.contains(target)) {
      lastFocusWithin = target;
    }
  };

  drawer.addEventListener('focusin', trackFocus);
  tab.addEventListener('focusin', trackFocus);

  const handleKeydown = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    if (event.key !== 'Tab') return;
    const focusables = getFocusableElements();
    if (!focusables.length) {
      event.preventDefault();
      (content || drawer).focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || (!drawer.contains(active) && active !== tab)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  const handleFocusIn = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    const target = event.target;
    if (drawer.contains(target) || target === tab || tab.contains(target)) return;
    event.stopPropagation();
    const fallback = lastFocusWithin && (drawer.contains(lastFocusWithin) || lastFocusWithin === tab || tab.contains(lastFocusWithin))
      ? lastFocusWithin
      : null;
    focusWithinTrap(fallback);
  };

  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('focusin', handleFocusIn);

  const handleMotionPreferenceChange = () => {
    const target = drawer.classList.contains('is-open') ? 1 : 0;
    stopOpenAnimation(true);
    applyOpenProgress(target);
    if (!target && scrim) {
      scrim.hidden = true;
    }
  };

  if (motionPreference) {
    if (typeof motionPreference.addEventListener === 'function') {
      motionPreference.addEventListener('change', handleMotionPreferenceChange);
    } else if (typeof motionPreference.addListener === 'function') {
      motionPreference.addListener(handleMotionPreferenceChange);
    }
  }

  if (!drawer.classList.contains('is-open')) {
    setElementInert(drawer);
  }

  dispatchStateChange(drawer.classList.contains('is-open'));

  const subscribe = (listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }
    const handler = (event) => {
      const detail = event?.detail;
      if (detail && typeof detail.open === 'boolean') {
        const progress = typeof detail.progress === 'number' ? detail.progress : detail.open ? 1 : 0;
        listener({ open: detail.open, progress });
      } else {
        const open = drawer.classList.contains('is-open');
        const progress = clamp(openProgress, 0, 1);
        listener({ open, progress });
      }
    };
    stateEvents.addEventListener('change', handler);
    const initial = lastKnownState || { open: drawer.classList.contains('is-open'), progress: clamp(openProgress, 0, 1) };
    listener({ open: Boolean(initial.open), progress: typeof initial.progress === 'number' ? initial.progress : clamp(openProgress, 0, 1) });
    return () => {
      stateEvents.removeEventListener('change', handler);
    };
  };

  return {
    open: () => setOpenState(true),
    close: () => setOpenState(false),
    toggle: () => setOpenState(),
    subscribe,
    setBatteryStatus: (detail) => {
      updateBatteryFromDetail(detail);
    }
  };
}

export function initializePlayerToolsDrawer() {
  if (!controllerInstance) {
    controllerInstance = createPlayerToolsDrawer();
  }
  return controllerInstance;
}

export const open = () => {
  const controller = initializePlayerToolsDrawer();
  if (controller) {
    controller.open();
  }
};

export const close = () => {
  const controller = initializePlayerToolsDrawer();
  if (controller) {
    controller.close();
  }
};

export const toggle = () => {
  const controller = initializePlayerToolsDrawer();
  if (controller) {
    controller.toggle();
  }
};

export const setBatteryStatus = (detail) => {
  const controller = initializePlayerToolsDrawer();
  if (controller && typeof controller.setBatteryStatus === 'function') {
    controller.setBatteryStatus(detail);
  }
};

export const subscribe = (listener) => {
  const controller = initializePlayerToolsDrawer();
  if (controller && typeof controller.subscribe === 'function') {
    return controller.subscribe(listener);
  }
  if (typeof listener === 'function') {
    listener({ open: false, progress: 0 });
  }
  return () => {};
};

export const onDrawerChange = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }

  initializePlayerToolsDrawer();

  const handler = (event) => {
    const detail = event?.detail;
    if (detail && typeof detail.open === 'boolean') {
      const progress = typeof detail.progress === 'number' ? detail.progress : detail.open ? 1 : 0;
      listener({ open: detail.open, progress });
    }
  };

  if (typeof document?.addEventListener === 'function') {
    document.addEventListener(DRAWER_CHANGE_EVENT, handler);
  }

  const snapshot = lastKnownState;
  listener({ open: Boolean(snapshot.open), progress: typeof snapshot.progress === 'number' ? snapshot.progress : 0 });

  return () => {
    if (typeof document?.removeEventListener === 'function') {
      document.removeEventListener(DRAWER_CHANGE_EVENT, handler);
    }
  };
};

initializePlayerToolsDrawer();
