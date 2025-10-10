(() => {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) return;

  const body = document.body;
  const appShell = document.querySelector('.app-shell');

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
  const fallbackInertRecords = new WeakMap();

  const applyInert = (element) => {
    if (!element) return;
    element.setAttribute('inert', '');
    if (isInertSupported || fallbackInertRecords.has(element)) return;
    const records = [];
    element.querySelectorAll(focusableSelectors).forEach((focusable) => {
      records.push({ element: focusable, tabIndex: focusable.getAttribute('tabindex') });
      focusable.setAttribute('tabindex', '-1');
    });
    fallbackInertRecords.set(element, records);
  };

  const removeInert = (element) => {
    if (!element) return;
    element.removeAttribute('inert');
    if (isInertSupported) return;
    const records = fallbackInertRecords.get(element);
    if (!records) return;
    records.forEach(({ element: focusable, tabIndex }) => {
      if (!focusable) return;
      if (tabIndex === null) {
        focusable.removeAttribute('tabindex');
      } else {
        focusable.setAttribute('tabindex', tabIndex);
      }
    });
    fallbackInertRecords.delete(element);
  };

  const getDrawerFocusableElements = () => {
    const elements = [drawer, ...drawer.querySelectorAll(focusableSelectors)];
    const unique = new Set();
    return elements.filter((element) => {
      if (!element || typeof element.focus !== 'function') return false;
      if (unique.has(element)) return false;
      unique.add(element);
      if (element.hasAttribute('disabled')) return false;
      if (element.getAttribute('aria-hidden') === 'true') return false;
      return true;
    });
  };

  const getFocusTrapElements = () => {
    const candidates = [tab, ...getDrawerFocusableElements()];
    const unique = new Set();
    return candidates.filter((element) => {
      if (!element || typeof element.focus !== 'function') return false;
      if (unique.has(element)) return false;
      unique.add(element);
      return true;
    });
  };

  const focusFirstTrapElement = () => {
    const trapElements = getFocusTrapElements();
    if (!trapElements.length) return;
    const first = trapElements[0];
    try {
      first.focus({ preventScroll: true });
    } catch (err) {
      // ignore focus errors
    }
  };

  const handleFocusTrapKeydown = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    if (event.key !== 'Tab' || event.altKey || event.metaKey || event.ctrlKey) return;
    const trapElements = getFocusTrapElements();
    if (!trapElements.length) return;
    const activeElement = document.activeElement;
    let currentIndex = trapElements.indexOf(activeElement);
    if (event.shiftKey) {
      if (currentIndex === -1) {
        event.preventDefault();
        trapElements[trapElements.length - 1].focus({ preventScroll: true });
        return;
      }
      if (currentIndex === 0) {
        event.preventDefault();
        trapElements[trapElements.length - 1].focus({ preventScroll: true });
      }
      return;
    }
    if (currentIndex === -1 || currentIndex === trapElements.length - 1) {
      event.preventDefault();
      trapElements[0].focus({ preventScroll: true });
    }
  };

  const handleFocusIn = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    if (event.target === tab) return;
    if (drawer.contains(event.target)) return;
    window.requestAnimationFrame(() => {
      focusFirstTrapElement();
    });
  };

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
      removeInert(drawer);
      if (appShell) {
        applyInert(appShell);
        appShell.setAttribute('aria-hidden', 'true');
      }
    } else {
      resetTabOffset();
      applyInert(drawer);
      if (appShell) {
        removeInert(appShell);
        appShell.removeAttribute('aria-hidden');
      }
    }
    if (isOpen) {
      const focusTargets = getDrawerFocusableElements().filter((element) => element !== drawer);
      const initialFocus = focusTargets.length ? focusTargets[0] : drawer;
      initialFocus.focus({ preventScroll: true });
    } else {
      tab.focus({ preventScroll: true });
    }
  };

  tab.addEventListener('click', () => {
    setOpenState();
  });

  document.addEventListener('keydown', handleFocusTrapKeydown);
  document.addEventListener('focusin', handleFocusIn);

  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.stopPropagation();
      event.preventDefault();
      setOpenState(false);
    }
  });

  applyInert(drawer);
})();
