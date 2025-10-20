import { qs, qsa } from './helpers.js';

const TAB_ANIMATION_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';
const TAB_ANIMATION_DURATION = 360;
const TAB_ANIMATION_OFFSET = 12;
const TAB_CONTAINER_CLASS = 'is-animating-tabs';

const tabButtons = Array.from(qsa('.tab'));
const TAB_ORDER = tabButtons.map(btn => btn.getAttribute('data-go')).filter(Boolean);

const headerEl = qs('header');
const mainEl = qs('main');

let isTabAnimating = false;
const tabChangeListeners = new Set();

function prefersReducedMotion() {
  return false;
}

function notifyTabChange(name) {
  tabChangeListeners.forEach(listener => {
    try {
      listener(name);
    } catch (err) {
      console.error('Tab change listener failed', err);
    }
  });
}

function getActiveTab() {
  const activeBtn = qs('.tab.active');
  return activeBtn ? activeBtn.getAttribute('data-go') : null;
}

function setTab(name) {
  qsa('fieldset[data-tab]').forEach(section => {
    const active = section.getAttribute('data-tab') === name;
    section.classList.toggle('active', active);
    section.setAttribute('aria-hidden', active ? 'false' : 'true');
    if ('inert' in section) {
      try {
        section.inert = !active;
      } catch (err) {
        /* ignore inert failures */
      }
    }
  });

  qsa('.tab').forEach(button => {
    const active = button.getAttribute('data-go') === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  try {
    localStorage.setItem('active-tab', name);
  } catch (err) {
    /* ignore storage failures */
  }

  notifyTabChange(name);
  return name;
}

function inferTabDirection(currentName, nextName) {
  if (!currentName || !nextName) return null;
  const currentIndex = TAB_ORDER.indexOf(currentName);
  const nextIndex = TAB_ORDER.indexOf(nextName);
  if (currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex) return null;
  return nextIndex > currentIndex ? 'left' : 'right';
}

function cleanupPanelAnimation(panel) {
  if (!panel) return;
  panel.classList.remove('animating');
  panel.style.removeProperty('pointer-events');
  panel.style.removeProperty('transform');
  panel.style.removeProperty('opacity');
  panel.style.removeProperty('will-change');
  panel.style.removeProperty('z-index');
  panel.style.removeProperty('filter');
  panel.style.removeProperty('visibility');
}

function animateTabTransition(currentName, nextName, direction) {
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

  activePanel.classList.add('animating');
  targetPanel.classList.add('animating');
  activePanel.style.pointerEvents = 'none';
  targetPanel.style.pointerEvents = 'none';
  activePanel.style.willChange = 'opacity, transform';
  targetPanel.style.willChange = 'opacity, transform';
  activePanel.style.zIndex = '3';
  targetPanel.style.zIndex = '4';
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
        } catch (err) {
          /* ignore cancel errors */
        }
      });
      if (typeof cleanupContainer === 'function') cleanupContainer();
      isTabAnimating = false;
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finishCleanup);
    else finishCleanup();
  });

  return true;
}

function getAdjacentTab(offset) {
  if (!Number.isInteger(offset) || !offset) return null;
  const activeBtn = qs('.tab.active');
  if (!activeBtn) return null;
  const current = activeBtn.getAttribute('data-go');
  const idx = TAB_ORDER.indexOf(current);
  if (idx === -1) return null;
  const nextIdx = idx + offset;
  if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return null;
  return TAB_ORDER[nextIdx];
}

function activateTab(name, options = {}) {
  const { direction, force = false, skipAnimation = false } = options;
  if (!name) return;

  if (skipAnimation) {
    setTab(name);
    return;
  }

  if (isTabAnimating) return;

  const performSwitch = () => {
    const currentName = getActiveTab();
    if (!force && currentName === name) return;
    const desiredDirection = direction || inferTabDirection(currentName, name);
    if (currentName && currentName !== name && animateTabTransition(currentName, name, desiredDirection)) {
      return;
    }
    setTab(name);
  };

  if (headerEl && typeof window !== 'undefined' && window.scrollY > 0) {
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
    window.setTimeout(showTabs, 600);
  } else {
    performSwitch();
  }
}

function onTabChange(listener) {
  if (typeof listener !== 'function') return () => {};
  tabChangeListeners.add(listener);
  try {
    listener(getActiveTab());
  } catch (err) {
    console.error('Tab change listener failed', err);
  }
  return () => {
    tabChangeListeners.delete(listener);
  };
}

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
    const activeName = getActiveTab();
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
    if (!swipeActive) {
      resetSwipeTracking();
      return;
    }
    const touch = e.changedTouches[0];
    if (!touch) {
      finishSwipe(false);
      resetSwipeTracking();
      return;
    }
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const distance = Math.abs(dx);
    const shouldCommit = swipeState.isActive && Math.abs(dx) > Math.abs(dy) && (distance > 60 || (swipeState.width && distance > swipeState.width * 0.32));
    finishSwipe(shouldCommit);
    resetSwipeTracking();
  }, { passive: true });

  mainEl.addEventListener('touchcancel', () => {
    finishSwipe(false);
    resetSwipeTracking();
  }, { passive: true });
}

export { activateTab, getActiveTab, onTabChange };
