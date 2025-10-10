(() => {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) return;

  const body = document.body;

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
    } else {
      drawer.focus({ preventScroll: true });
    }
  };

  let externalInertTargets = [];
  let lastFocusWithin = null;

  const getDrawerDirection = () => {
    const rootStyles = window.getComputedStyle(document.documentElement);
    const directionValue = parseFloat(rootStyles.getPropertyValue('--drawer-slide-direction'));
    return Number.isFinite(directionValue) && directionValue !== 0 ? directionValue : -1;
  };

  const updateTabOffset = () => {
    const rect = drawer.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const direction = getDrawerDirection();

    const drawerRight = rect.right || rect.left + rect.width || 0;
    const drawerLeft = rect.left || rect.right - rect.width || 0;
    const offset = direction < 0 ? drawerRight : viewportWidth - drawerLeft;
    const clampedOffset = Math.max(0, Math.min(offset, viewportWidth));
    const translatedOffset = clampedOffset * direction * -1;

    tab.style.setProperty('--player-tools-tab-translate', `${translatedOffset}px`);
  };

  let drawerAnimationFrame = null;
  let drawerTrackingTimeout = null;

  const parseTimeToMs = (value) => {
    if (typeof value !== 'string') return 0;
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const number = parseFloat(trimmed);
    if (!Number.isFinite(number)) return 0;
    return trimmed.endsWith('ms') ? number : number * 1000;
  };

  const getDrawerTransitionDuration = () => {
    const styles = window.getComputedStyle(drawer);
    const properties = styles.transitionProperty.split(',').map((value) => value.trim());
    const durations = styles.transitionDuration.split(',').map(parseTimeToMs);
    const delays = styles.transitionDelay.split(',').map(parseTimeToMs);
    const count = Math.max(properties.length, durations.length, delays.length);
    let maxDuration = 0;

    for (let index = 0; index < count; index += 1) {
      const property = properties[index] || properties[properties.length - 1] || '';
      const duration = durations[index] || durations[durations.length - 1] || 0;
      const delay = delays[index] || delays[delays.length - 1] || 0;
      if (property === 'transform' || property === 'all') {
        maxDuration = Math.max(maxDuration, duration + delay);
      }
    }

    return maxDuration;
  };

  const clearDrawerTrackingTimeout = () => {
    if (drawerTrackingTimeout === null) return;
    window.clearTimeout(drawerTrackingTimeout);
    drawerTrackingTimeout = null;
  };

  const trackDrawerOffset = () => {
    updateTabOffset();
    drawerAnimationFrame = window.requestAnimationFrame(trackDrawerOffset);
  };

  const startTrackingDrawer = () => {
    if (drawerAnimationFrame === null) {
      trackDrawerOffset();
    }

    clearDrawerTrackingTimeout();
    const fallbackDuration = getDrawerTransitionDuration();
    if (fallbackDuration <= 0) {
      stopTrackingDrawer();
      updateTabOffset();
      return;
    }

    drawerTrackingTimeout = window.setTimeout(() => {
      stopTrackingDrawer();
      updateTabOffset();
    }, fallbackDuration + 100);
  };

  const stopTrackingDrawer = () => {
    if (drawerAnimationFrame !== null) {
      window.cancelAnimationFrame(drawerAnimationFrame);
      drawerAnimationFrame = null;
    }

    clearDrawerTrackingTimeout();
  };

  const handleResize = () => {
    updateTabOffset();
  };

  window.addEventListener('resize', handleResize);

  const isTransformTransition = (event) => event && event.propertyName === 'transform';

  const handleDrawerTransitionStart = (event) => {
    if (!isTransformTransition(event)) return;
    startTrackingDrawer();
  };

  const handleDrawerTransitionEnd = (event) => {
    if (!isTransformTransition(event)) return;
    stopTrackingDrawer();
    updateTabOffset();
  };

  drawer.addEventListener('transitionrun', handleDrawerTransitionStart);
  drawer.addEventListener('transitionstart', handleDrawerTransitionStart);
  drawer.addEventListener('transitionend', handleDrawerTransitionEnd);
  drawer.addEventListener('transitioncancel', handleDrawerTransitionEnd);

  const setOpenState = (open) => {
    const currentlyOpen = drawer.classList.contains('is-open');
    const isOpen = typeof open === 'boolean' ? open : !currentlyOpen;

    if (isOpen === currentlyOpen) {
      updateTabOffset();
      return;
    }

    drawer.classList.toggle('is-open', isOpen);
    tab.classList.toggle('is-open', isOpen);
    if (body) {
      body.classList.toggle('player-tools-open', isOpen);
    }
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    updateTabOffset();
    if (isOpen) {
      startTrackingDrawer();
      removeElementInert(drawer);
      externalInertTargets = getExternalInertTargets();
      externalInertTargets.forEach(setElementInert);
    } else {
      startTrackingDrawer();
      externalInertTargets.forEach(removeElementInert);
      externalInertTargets = [];
      setElementInert(drawer);
    }
    if (isOpen) {
      drawer.focus({ preventScroll: true });
    } else {
      tab.focus({ preventScroll: true });
    }
  };

  tab.addEventListener('click', () => {
    setOpenState();
  });

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
      drawer.focus({ preventScroll: true });
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

  if (!drawer.classList.contains('is-open')) {
    setElementInert(drawer);
  }

  updateTabOffset();
})();
