import { qs, qsa } from './helpers.js';

/* ========= tabs ========= */
const TAB_ICON_SELECTOR = '[data-tab-icon]';
const TAB_ICON_ANIMATION_DURATION = 600;
const tabIconStates = new WeakMap();

const headerEl = qs('header');

function parseDimension(value) {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function removeCanvasBackground(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  if (!width || !height) return;

  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (err) {
    return;
  }

  const { data } = imageData;
  if (!data || data.length < 4) return;

  const originalData = new Uint8ClampedArray(data);
  let visibleBefore = 0;
  for (let i = 3; i < originalData.length; i += 4) {
    if (originalData[i] > 0) {
      visibleBefore += 1;
    }
  }

  const sampleIndices = [0, (width - 1) * 4, (width * (height - 1)) * 4, ((width * height) - 1) * 4]
    .filter(index => index >= 0 && index + 3 < data.length);
  if (!sampleIndices.length) return;

  let baseR = 0;
  let baseG = 0;
  let baseB = 0;
  sampleIndices.forEach(index => {
    baseR += data[index];
    baseG += data[index + 1];
    baseB += data[index + 2];
  });
  baseR /= sampleIndices.length;
  baseG /= sampleIndices.length;
  baseB /= sampleIndices.length;

  const tolerance = 40;
  const baseIntensity = (baseR + baseG + baseB) / 3;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const intensity = (r + g + b) / 3;
    const distance = Math.sqrt((r - baseR) ** 2 + (g - baseG) ** 2 + (b - baseB) ** 2);
    if (distance <= tolerance || intensity >= baseIntensity + tolerance) {
      data[i + 3] = 0;
    }
  }

  if (visibleBefore > 0) {
    let visibleAfter = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        visibleAfter += 1;
      }
    }
    if (visibleAfter <= visibleBefore * 0.05) {
      data.set(originalData);
    }
  }

  try {
    ctx.putImageData(imageData, 0, 0);
  } catch (err) {}
}

function prepareTabIcon(img) {
  if (!img) return;
  const container = img.closest('.tab__icon');
  if (!container || tabIconStates.has(container)) return;

  const widthAttr = parseDimension(img.getAttribute('width'));
  const heightAttr = parseDimension(img.getAttribute('height'));
  const initialWidth = Number.isFinite(widthAttr) ? widthAttr : (img.naturalWidth || 48);
  const initialHeight = Number.isFinite(heightAttr) ? heightAttr : (img.naturalHeight || initialWidth);

  const canvas = document.createElement('canvas');
  canvas.width = initialWidth;
  canvas.height = initialHeight;
  canvas.style.width = 'var(--tab-icon-size)';
  canvas.style.height = 'var(--tab-icon-size)';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.tabIconStill = 'true';
  container.insertBefore(canvas, img);

  if (!img.hasAttribute('data-tab-icon-still')) {
    img.dataset.tabIconStill = 'true';
  }
  img.dataset.tabIconSource = 'true';
  img.setAttribute('aria-hidden', 'true');
  container.classList.add('tab__icon--prepared');

  const state = {
    container,
    canvas,
    animationTimer: null,
  };

  const drawStill = source => {
    if (!source) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const naturalWidth = source.naturalWidth || initialWidth;
    const naturalHeight = source.naturalHeight || initialHeight;
    if (naturalWidth && naturalHeight) {
      const ratio = Math.min(canvas.width / naturalWidth, canvas.height / naturalHeight, 1);
      const width = Math.max(1, Math.round(naturalWidth * ratio));
      const height = Math.max(1, Math.round(naturalHeight * ratio));
      const offsetX = Math.floor((canvas.width - width) / 2);
      const offsetY = Math.floor((canvas.height - height) / 2);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, offsetX, offsetY, width, height);
      removeCanvasBackground(canvas);
    }
  };

  const handleLoad = () => {
    drawStill(img);
  };

  if (img.complete && img.naturalWidth) handleLoad();
  else img.addEventListener('load', handleLoad, { once: true });

  tabIconStates.set(container, state);
}

function setupTabIconAnimations() {
  const iconImages = Array.from(qsa(TAB_ICON_SELECTOR));
  iconImages.forEach(img => prepareTabIcon(img));
}

function triggerTabIconAnimation(container) {
  if (!container) return;
  const state = tabIconStates.get(container);
  if (!state) return;
  if (state.animationTimer) {
    clearTimeout(state.animationTimer);
    state.animationTimer = null;
  }

  const canvas = state.canvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const stillImg = container.querySelector('img[data-tab-icon-still]');
  const animatedImg = container.querySelector('img[data-tab-icon-animated]');
  if (!animatedImg) return;

  const drawStill = () => {
    if (stillImg && stillImg.complete && stillImg.naturalWidth) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ratio = Math.min(canvas.width / stillImg.naturalWidth, canvas.height / stillImg.naturalHeight, 1);
      const width = Math.max(1, Math.round(stillImg.naturalWidth * ratio));
      const height = Math.max(1, Math.round(stillImg.naturalHeight * ratio));
      const offsetX = Math.floor((canvas.width - width) / 2);
      const offsetY = Math.floor((canvas.height - height) / 2);
      ctx.drawImage(stillImg, offsetX, offsetY, width, height);
      removeCanvasBackground(canvas);
    }
  };

  const handleAnimationEnd = () => {
    container.classList.remove('tab__icon--animating');
    drawStill();
    if (state.animationTimer) {
      clearTimeout(state.animationTimer);
      state.animationTimer = null;
    }
  };

  drawStill();
  container.classList.add('tab__icon--animating');
  state.animationTimer = setTimeout(handleAnimationEnd, TAB_ICON_ANIMATION_DURATION);
}

const tabButtons = Array.from(qsa('.tab'));
const TAB_ORDER = tabButtons.map(btn => btn.getAttribute('data-go')).filter(Boolean);

const TAB_ANIMATION_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';
const TAB_ANIMATION_DURATION = 360;
const TAB_ANIMATION_OFFSET = 12;
const TAB_CONTAINER_CLASS = 'is-animating-tabs';
let isTabAnimating = false;

const tabChangeListeners = new Set();

const readActiveTabFromDom = () => {
  const activeBtn = qs('.tab.active');
  return activeBtn ? activeBtn.getAttribute('data-go') : null;
};

let activeTabName = readActiveTabFromDom();

const prefersReducedMotion = () => false;

const notifyTabChange = (previous, next) => {
  if (previous === next) {
    return;
  }
  activeTabName = next;
  tabChangeListeners.forEach(listener => {
    try {
      listener(next);
    } catch (err) {
      console.error('Tab change listener failed', err);
    }
  });
};

function setTab(name) {
  const previousTab = activeTabName;
  qsa('fieldset[data-tab]').forEach(s => {
    const active = s.getAttribute('data-tab') === name;
    s.classList.toggle('active', active);
    s.setAttribute('aria-hidden', active ? 'false' : 'true');
    if ('inert' in s) {
      try {
        s.inert = !active;
      } catch (err) {}
    }
  });
  qsa('.tab').forEach(b => {
    const active = b.getAttribute('data-go') === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  try {
    localStorage.setItem('active-tab', name);
  } catch (e) {}
  notifyTabChange(previousTab, name);
}

const getNavigationType = () => {
  if (typeof performance === 'undefined') return null;
  if (typeof performance.getEntriesByType === 'function') {
    const entries = performance.getEntriesByType('navigation');
    if (entries && entries.length) {
      const entry = entries[0];
      if (entry && typeof entry.type === 'string') return entry.type;
    }
  }
  const legacyNavigation = performance.navigation;
  if (legacyNavigation) {
    switch (legacyNavigation.type) {
      case legacyNavigation.TYPE_RELOAD:
        return 'reload';
      case legacyNavigation.TYPE_BACK_FORWARD:
        return 'back_forward';
      case legacyNavigation.TYPE_NAVIGATE:
        return 'navigate';
      case legacyNavigation.TYPE_RESERVED:
        return 'reserved';
      default:
        return null;
    }
  }
  return null;
};

const inferTabDirection = (currentName, nextName) => {
  if (!currentName || !nextName) return null;
  const currentIndex = TAB_ORDER.indexOf(currentName);
  const nextIndex = TAB_ORDER.indexOf(nextName);
  if (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex) return null;
  return nextIndex > currentIndex ? 'left' : 'right';
};

const cleanupPanelAnimation = panel => {
  if (!panel) return;
  panel.classList.remove('animating');
  panel.style.removeProperty('pointer-events');
  panel.style.removeProperty('transform');
  panel.style.removeProperty('opacity');
  panel.style.removeProperty('will-change');
  panel.style.removeProperty('z-index');
  panel.style.removeProperty('filter');
  panel.style.removeProperty('visibility');
};

const animateTabTransition = (currentName, nextName, direction) => {
  const targetPanel = qs(`fieldset[data-tab="${nextName}"]`);
  if (!targetPanel) return false;
  if (prefersReducedMotion() || typeof targetPanel.animate !== 'function') return false;

  const activePanel = currentName ? qs(`fieldset[data-tab="${currentName}"]`) : null;
  if (!activePanel) return false;

  const container = activePanel.parentElement;
  const activePanelHeight = activePanel.offsetHeight || activePanel.scrollHeight || 0;

  isTabAnimating = true;

  let cleanupContainer = null;

  const prepareContainerForAnimation = () => {
    if (!container || !(container instanceof HTMLElement)) return;
    let activeHeight = activePanelHeight;
    if (activeHeight <= 0) {
      const activeRect = activePanel.getBoundingClientRect();
      activeHeight = activeRect.height || activePanel.scrollHeight || 0;
    }

    const prevHeight = container.style.height;
    const prevTransition = container.style.transition;
    const prevOverflow = container.style.overflow;
    const prevWillChange = container.style.willChange;

    const measureTargetHeight = () => {
      const rect = targetPanel.getBoundingClientRect();
      return rect.height || targetPanel.offsetHeight || targetPanel.scrollHeight || activeHeight;
    };
    let targetHeight = measureTargetHeight();
    if (targetHeight <= 0) {
      targetHeight = activeHeight;
    }

    container.classList.add(TAB_CONTAINER_CLASS);
    container.style.height = `${activeHeight}px`;
    container.style.transition = `height ${TAB_ANIMATION_DURATION}ms ${TAB_ANIMATION_EASING}`;
    container.style.overflow = 'hidden';
    container.style.willChange = 'height';

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        container.style.height = `${targetHeight}px`;
      });
    } else {
      container.style.height = `${targetHeight}px`;
    }

    cleanupContainer = () => {
      container.classList.remove(TAB_CONTAINER_CLASS);
      if (prevHeight) container.style.height = prevHeight;
      else container.style.removeProperty('height');
      if (prevTransition) container.style.transition = prevTransition;
      else container.style.removeProperty('transition');
      if (prevOverflow) container.style.overflow = prevOverflow;
      else container.style.removeProperty('overflow');
      if (prevWillChange) container.style.willChange = prevWillChange;
      else container.style.removeProperty('will-change');
    };
  };

  prepareContainerForAnimation();
  targetPanel.style.opacity = '0';

  const axis = direction === 'up' || direction === 'down' ? 'Y' : 'X';
  const directionSign = direction === 'left' || direction === 'up' ? -1
    : direction === 'right' || direction === 'down' ? 1
      : 0;
  const translateDistance = `${directionSign * TAB_ANIMATION_OFFSET}px`;
  const zeroTranslate = `translate${axis}(0px)`;
  const offsetTranslate = directionSign === 0 ? zeroTranslate : `translate${axis}(${translateDistance})`;
  const enteringTransform = `${offsetTranslate} scale(0.98)`;
  const exitingTransform = `${offsetTranslate} scale(0.98)`;
  const neutralTransform = `${zeroTranslate} scale(1)`;

  targetPanel.style.transform = enteringTransform;
  activePanel.style.transform = neutralTransform;
  targetPanel.style.visibility = 'visible';

  const animations = [
    targetPanel.animate([
      { opacity: 0, transform: enteringTransform },
      { opacity: 1, transform: neutralTransform }
    ], { duration: TAB_ANIMATION_DURATION, easing: TAB_ANIMATION_EASING, fill: 'forwards' }),
    activePanel.animate([
      { opacity: 1, transform: neutralTransform },
      { opacity: 0, transform: exitingTransform }
    ], { duration: TAB_ANIMATION_DURATION, easing: TAB_ANIMATION_EASING, fill: 'forwards' })
  ];

  Promise.all(animations.map(anim => anim.finished.catch(() => {}))).then(() => {
    setTab(nextName);
  }).finally(() => {
    const finishCleanup = () => {
      cleanupPanelAnimation(activePanel);
      cleanupPanelAnimation(targetPanel);
      animations.forEach(anim => {
        try {
          if (typeof anim.cancel === 'function') anim.cancel();
        } catch (err) {}
      });
      if (typeof cleanupContainer === 'function') cleanupContainer();
      isTabAnimating = false;
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finishCleanup);
    else finishCleanup();
  });

  return true;
};

const activateTab = (name, options = {}) => {
  if (!name || isTabAnimating) return;

  const performSwitch = () => {
    const currentName = activeTabName || readActiveTabFromDom();
    if (currentName === name) {
      setTab(name);
      return;
    }
    const desiredDirection = options.direction || inferTabDirection(currentName, name);
    if (!animateTabTransition(currentName, name, desiredDirection)) {
      setTab(name);
    }
  };

  if (headerEl && window.scrollY > 0) {
    headerEl.classList.add('hide-tabs');
    const showTabs = () => {
      if (headerEl.classList.contains('hide-tabs')) {
        headerEl.classList.remove('hide-tabs');
        performSwitch();
      }
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (window.scrollY <= 1) {
        showTabs();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(showTabs, 600);
  } else {
    performSwitch();
  }
};

const getAdjacentTab = offset => {
  if (!Number.isInteger(offset) || !offset) return null;
  const current = activeTabName || readActiveTabFromDom();
  if (!current) return null;
  const idx = TAB_ORDER.indexOf(current);
  if (idx === -1) return null;
  const nextIdx = idx + offset;
  if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return null;
  return TAB_ORDER[nextIdx];
};

const mainEl = qs('main');
if (mainEl && TAB_ORDER.length) {
  let touchStartX = 0;
  let touchStartY = 0;
  let swipeDirection = null;
  let swipeActive = false;

  const swipeState = {
    activePanel: null,
    targetPanel: null,
    targetName: null,
    direction: null,
    width: 1,
    progress: 0,
    lastDx: 0,
    isActive: false
  };

  const resetSwipeTracking = () => {
    touchStartX = 0;
    touchStartY = 0;
    swipeDirection = null;
    swipeActive = false;
  };

  const cleanupSwipePanels = () => {
    if (swipeState.activePanel) cleanupPanelAnimation(swipeState.activePanel);
    if (swipeState.targetPanel) cleanupPanelAnimation(swipeState.targetPanel);
    swipeState.activePanel = null;
    swipeState.targetPanel = null;
    swipeState.targetName = null;
    swipeState.direction = null;
    swipeState.width = 1;
    swipeState.progress = 0;
    swipeState.lastDx = 0;
    swipeState.isActive = false;
    mainEl.classList.remove('is-swiping');
    mainEl.style.removeProperty('--swipe-progress');
    isTabAnimating = false;
  };

  const initSwipePanels = direction => {
    if (!direction) return false;
    const activeName = activeTabName || readActiveTabFromDom();
    if (!activeName) return false;
    const offset = direction === 'left' ? 1 : -1;
    const targetName = getAdjacentTab(offset);
    if (!targetName) return false;
    const activePanel = qs(`fieldset[data-tab="${activeName}"]`);
    const targetPanel = qs(`fieldset[data-tab="${targetName}"]`);
    if (!activePanel || !targetPanel) return false;
    const rect = mainEl.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth || 1);

    swipeState.activePanel = activePanel;
    swipeState.targetPanel = targetPanel;
    swipeState.targetName = targetName;
    swipeState.direction = direction;
    swipeState.width = width;
    swipeState.progress = 0;
    swipeState.lastDx = 0;
    swipeState.isActive = true;
    isTabAnimating = true;

    [activePanel, targetPanel].forEach(panel => {
      panel.classList.add('animating');
      panel.style.pointerEvents = 'none';
      panel.style.willChange = 'transform, opacity';
    });

    const startOffset = direction === 'left' ? width : -width;
    targetPanel.style.transform = `translate3d(${startOffset}px,0,0)`;
    targetPanel.style.opacity = '0';
    mainEl.classList.add('is-swiping');
    return true;
  };

  const updateSwipeProgress = dx => {
    if (!swipeState.isActive) return;
    const clampedDx = Math.max(Math.min(dx, swipeState.width), -swipeState.width);
    const progress = Math.min(1, Math.abs(clampedDx) / swipeState.width);
    const activePanel = swipeState.activePanel;
    const targetPanel = swipeState.targetPanel;
    if (activePanel) {
      activePanel.style.transform = `translate3d(${clampedDx}px,0,0)`;
      activePanel.style.opacity = `${1 - (progress * 0.4)}`;
    }
    if (targetPanel) {
      const startOffset = swipeState.direction === 'left' ? swipeState.width : -swipeState.width;
      const translateTarget = startOffset + clampedDx;
      targetPanel.style.transform = `translate3d(${translateTarget}px,0,0)`;
      targetPanel.style.opacity = `${0.35 + (progress * 0.65)}`;
    }
    swipeState.progress = progress;
    swipeState.lastDx = clampedDx;
    mainEl.style.setProperty('--swipe-progress', progress.toFixed(3));
  };

  const finishSwipe = shouldCommit => {
    if (!swipeState.isActive) {
      cleanupSwipePanels();
      return;
    }
    const activePanel = swipeState.activePanel;
    const targetPanel = swipeState.targetPanel;
    const targetName = swipeState.targetName;
    const direction = swipeState.direction;
    const width = swipeState.width;
    const progress = swipeState.progress;
    const currentDx = swipeState.lastDx;
    const startOffset = direction === 'left' ? width : -width;
    const remainingFactor = shouldCommit ? (1 - progress) : progress;
    const duration = Math.max(140, Math.round(TAB_ANIMATION_DURATION * Math.max(0.35, remainingFactor || 0.35)));
    const animations = [];

    if (activePanel && typeof activePanel.animate === 'function') {
      const currentOpacity = parseFloat(activePanel.style.opacity || '1') || 1;
      animations.push(activePanel.animate([
        { transform: `translate3d(${currentDx}px,0,0)`, opacity: currentOpacity },
        { transform: shouldCommit ? `translate3d(${direction === 'left' ? -width : width}px,0,0)` : 'translate3d(0,0,0)', opacity: shouldCommit ? 0 : 1 }
      ], { duration, easing: TAB_ANIMATION_EASING, fill: 'forwards' }));
    } else if (activePanel) {
      activePanel.style.transform = shouldCommit ? `translate3d(${direction === 'left' ? -width : width}px,0,0)` : 'translate3d(0,0,0)';
      activePanel.style.opacity = shouldCommit ? '0' : '1';
    }

    if (targetPanel) {
      const currentOpacity = parseFloat(targetPanel.style.opacity || '0') || 0;
      if (typeof targetPanel.animate === 'function') {
        animations.push(targetPanel.animate([
          { transform: `translate3d(${startOffset + currentDx}px,0,0)`, opacity: currentOpacity },
          { transform: shouldCommit ? 'translate3d(0,0,0)' : `translate3d(${startOffset}px,0,0)`, opacity: shouldCommit ? 1 : 0 }
        ], { duration, easing: TAB_ANIMATION_EASING, fill: 'forwards' }));
      } else {
        targetPanel.style.transform = shouldCommit ? 'translate3d(0,0,0)' : `translate3d(${startOffset}px,0,0)`;
        targetPanel.style.opacity = shouldCommit ? '1' : '0';
      }
    }

    Promise.all(animations.map(anim => (anim && anim.finished ? anim.finished.catch(() => {}) : Promise.resolve()))).then(() => {
      if (shouldCommit && targetName) {
        setTab(targetName);
      }
    }).finally(() => {
      cleanupSwipePanels();
    });
  };

  mainEl.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) {
      if (swipeState.isActive) finishSwipe(false);
      resetSwipeTracking();
      return;
    }
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    swipeDirection = null;
    swipeActive = true;
  }, { passive: true });

  mainEl.addEventListener('touchmove', e => {
    if (!swipeActive || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (!swipeDirection) {
      if (Math.abs(dx) < 12) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        if (swipeState.isActive) finishSwipe(false);
        resetSwipeTracking();
        return;
      }
      swipeDirection = dx < 0 ? 'left' : 'right';
      if (!initSwipePanels(swipeDirection)) {
        resetSwipeTracking();
        return;
      }
    }
    if (!swipeState.isActive && !initSwipePanels(swipeDirection)) {
      resetSwipeTracking();
      return;
    }
    updateSwipeProgress(dx);
  }, { passive: true });

  mainEl.addEventListener('touchend', e => {
    if (!swipeActive) return;
    swipeActive = false;
    if (!swipeState.isActive) {
      resetSwipeTracking();
      return;
    }
    const shouldCommit = swipeState.progress >= 0.4 || Math.abs(swipeState.lastDx) >= swipeState.width * 0.35;
    finishSwipe(shouldCommit);
    resetSwipeTracking();
  }, { passive: true });

  mainEl.addEventListener('touchcancel', () => {
    if (swipeState.isActive) finishSwipe(false);
    resetSwipeTracking();
  });
}

const scrollToTopOfCombat = () => {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
  const scroll = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (err) {
      window.scrollTo(0, 0);
    }
  };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
  else scroll();
};

const getActiveTab = () => activeTabName || readActiveTabFromDom();

const onTabChange = listener => {
  if (typeof listener !== 'function') return () => {};
  tabChangeListeners.add(listener);
  return () => {
    tabChangeListeners.delete(listener);
  };
};

setupTabIconAnimations();

export {
  activateTab,
  getActiveTab,
  getAdjacentTab,
  getNavigationType,
  onTabChange,
  scrollToTopOfCombat,
  triggerTabIconAnimation,
};
