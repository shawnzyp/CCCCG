(() => {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) return;

  const scrim = drawer.querySelector('.player-tools-drawer__scrim');
  const content = drawer.querySelector('[data-player-tools-content]');

  const body = document.body;
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

  const motionPreference =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

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

  const isMotionReduced = () => motionPreference?.matches === true;

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
    const tabHeight = tab.getBoundingClientRect().height || 0;
    const halfTab = tabHeight / 2;

    if (viewport) {
      const desiredCenter = viewport.offsetTop + viewport.height / 2;
      const minCenter = viewport.offsetTop + halfTab;
      const maxCenter = viewport.offsetTop + viewport.height - halfTab;
      const nextCenter = clamp(desiredCenter, minCenter, maxCenter);
      if (Number.isFinite(nextCenter)) {
        tab.style.setProperty('--player-tools-tab-top', `${nextCenter}px`);
      }
      return;
    }

    const viewHeight = window.innerHeight || document.documentElement?.clientHeight;
    const scrollTop = window.pageYOffset || document.documentElement?.scrollTop || 0;
    if (!Number.isFinite(viewHeight)) {
      tab.style.removeProperty('--player-tools-tab-top');
      return;
    }
    const desiredCenter = scrollTop + viewHeight / 2;
    const minCenter = scrollTop + halfTab;
    const maxCenter = scrollTop + viewHeight - halfTab;
    const nextCenter = clamp(desiredCenter, minCenter, maxCenter);
    if (Number.isFinite(nextCenter)) {
      tab.style.setProperty('--player-tools-tab-top', `${nextCenter}px`);
    }
  };

  const getDrawerSlideDirection = () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const direction = parseFloat(rootStyles.getPropertyValue('--drawer-slide-direction'));
    return Number.isFinite(direction) && direction !== 0 ? direction : -1;
  };

  const updateTabOffset = (width) => {
    if (!tab || !drawer) return;
    const drawerWidth = typeof width === 'number' ? width : drawer.getBoundingClientRect().width;
    if (!Number.isFinite(drawerWidth)) return;
    const direction = getDrawerSlideDirection();
    const offset = drawerWidth * direction * -1;
    if (Number.isFinite(offset)) {
      tab.style.setProperty('--player-tools-tab-offset', `${offset}px`);
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
    const focusables = [tab, ...drawerFocusables];
    return focusables.filter((element, index) => element && focusables.indexOf(element) === index);
  };

  const focusWithinTrap = (preferred) => {
    const focusables = getFocusableElements();
    if (preferred && focusables.includes(preferred)) {
      preferred.focus({ preventScroll: true });
      return;
    }
    if (focusables.length > 0) {
      focusables[0].focus({ preventScroll: true });
    } else if (content) {
      content.focus({ preventScroll: true });
    } else {
      drawer.focus({ preventScroll: true });
    }
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
    if (body) {
      body.classList.toggle('player-tools-open', isOpen);
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
  };

  tab.addEventListener('click', () => {
    setOpenState();
  });

  if (scrim) {
    scrim.addEventListener('click', () => {
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
})();
