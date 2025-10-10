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

  const managedAttr = 'data-player-tools-managed';
  const fallbackTabIndexAttr = 'data-player-tools-original-tabindex';

  const getPageElements = () => {
    if (!body) return [];
    return Array.from(body.children).filter((element) => element !== drawer && element !== tab);
  };

  const disableFocusWithin = (root) => {
    if (isInertSupported) return;
    root
      .querySelectorAll(focusableSelectors)
      .forEach((element) => {
        if (!element.hasAttribute(fallbackTabIndexAttr)) {
          const existingTabIndex = element.getAttribute('tabindex');
          if (existingTabIndex !== null) {
            element.setAttribute(fallbackTabIndexAttr, existingTabIndex);
          } else {
            element.setAttribute(fallbackTabIndexAttr, '');
          }
        }
        element.setAttribute('tabindex', '-1');
      });
  };

  const restoreFocusWithin = (root) => {
    if (isInertSupported) return;
    root
      .querySelectorAll(`[${fallbackTabIndexAttr}]`)
      .forEach((element) => {
        const originalTabIndex = element.getAttribute(fallbackTabIndexAttr);
        if (originalTabIndex === '' || originalTabIndex === null) {
          element.removeAttribute('tabindex');
        } else {
          element.setAttribute('tabindex', originalTabIndex);
        }
        element.removeAttribute(fallbackTabIndexAttr);
      });
  };

  const applyPageInert = () => {
    getPageElements().forEach((element) => {
      if (!element.hasAttribute(managedAttr)) {
        const wasInert = element.hasAttribute('inert');
        element.setAttribute(managedAttr, wasInert ? 'already' : 'added');
        if (!wasInert) {
          element.setAttribute('inert', '');
        }
      }
      if (element.getAttribute(managedAttr) === 'added') {
        disableFocusWithin(element);
      }
    });
  };

  const removePageInert = () => {
    getPageElements().forEach((element) => {
      if (element.getAttribute(managedAttr) === 'added') {
        element.removeAttribute('inert');
      }
      if (element.hasAttribute(managedAttr)) {
        restoreFocusWithin(element);
        element.removeAttribute(managedAttr);
      }
    });
  };

  const isFocusableElement = (element) => {
    if (!element) return false;
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.tabIndex < 0) return false;
    return element.getClientRects().length > 0;
  };

  const getTrapElements = () => {
    const drawerElements = Array.from(drawer.querySelectorAll(focusableSelectors)).filter((focusable) =>
      isFocusableElement(focusable)
    );
    return [tab, ...drawerElements];
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
      drawer.removeAttribute('inert');
      if (!isInertSupported) {
        drawer.querySelectorAll('[data-inert-tabindex]').forEach((element) => {
          const originalTabIndex = element.getAttribute('data-inert-tabindex');
          if (originalTabIndex === '') {
            element.removeAttribute('tabindex');
          } else {
            element.setAttribute('tabindex', originalTabIndex);
          }
          element.removeAttribute('data-inert-tabindex');
        });
      }
      applyPageInert();
    } else {
      resetTabOffset();
      drawer.setAttribute('inert', '');
      if (!isInertSupported) {
        drawer.querySelectorAll(focusableSelectors).forEach((element) => {
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
      }
      removePageInert();
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

  const handleFocusTrap = (event) => {
    if (!drawer.classList.contains('is-open')) return;
    if (event.key !== 'Tab') return;

    const trapElements = getTrapElements().filter((element) => element && isFocusableElement(element));
    const [firstElement, firstInnerElement] = trapElements;
    const lastElement = trapElements[trapElements.length - 1];
    const active = document.activeElement;

    if (!trapElements.length) {
      event.preventDefault();
      drawer.focus({ preventScroll: true });
      return;
    }

    if (trapElements.length === 1) {
      if (active === trapElements[0] || active === drawer) {
        event.preventDefault();
        trapElements[0].focus({ preventScroll: true });
      }
      return;
    }

    if (active === drawer) {
      event.preventDefault();
      if (event.shiftKey) {
        lastElement.focus({ preventScroll: true });
      } else if (firstInnerElement) {
        firstInnerElement.focus({ preventScroll: true });
      } else {
        firstElement.focus({ preventScroll: true });
      }
      return;
    }

    if (event.shiftKey && active === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }

    if (event.shiftKey && firstInnerElement && active === firstInnerElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && active === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
      return;
    }
  };

  document.addEventListener('keydown', handleFocusTrap, true);
})();
