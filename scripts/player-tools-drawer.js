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

  const getInertCount = (element) => {
    if (!element) return 0;
    const value = element.getAttribute('data-inert-count');
    const count = value ? Number.parseInt(value, 10) : 0;
    return Number.isNaN(count) ? 0 : count;
  };

  const incrementInert = (element) => {
    if (!element) return;
    const count = getInertCount(element);
    if (count === 0) {
      element.setAttribute('inert', '');
    }
    applyFallbackInert(element);
    element.setAttribute('data-inert-count', String(count + 1));
  };

  const decrementInert = (element) => {
    if (!element) return;
    const count = getInertCount(element);
    if (count <= 1) {
      element.removeAttribute('data-inert-count');
      element.removeAttribute('inert');
      removeFallbackInert(element);
    } else {
      element.setAttribute('data-inert-count', String(count - 1));
    }
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

  const updateTabOffset = () => {
    const drawerWidth = Math.min(drawer.getBoundingClientRect().width, window.innerWidth || drawer.offsetWidth);
    tab.style.setProperty('--player-tools-tab-offset', `${drawerWidth}px`);
  };

  const resetTabOffset = () => {
    tab.style.removeProperty('--player-tools-tab-offset');
  };

  const handleResize = () => {
    if (drawer.classList.contains('is-open')) {
      updateTabOffset();
    }
  };

  window.addEventListener('resize', handleResize);

  const setOpenState = (open) => {
    const isOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', isOpen);
    tab.classList.toggle('is-open', isOpen);
    if (body) {
      body.classList.toggle('player-tools-open', isOpen);
    }
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      updateTabOffset();
      decrementInert(drawer);
      externalInertTargets = getExternalInertTargets();
      externalInertTargets.forEach(incrementInert);
    } else {
      resetTabOffset();
      externalInertTargets.forEach(decrementInert);
      externalInertTargets = [];
      incrementInert(drawer);
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
    incrementInert(drawer);
  }
})();
