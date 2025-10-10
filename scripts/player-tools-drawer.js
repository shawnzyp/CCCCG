(() => {
  const container = document.getElementById('player-tools');
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

  const setOpenState = (open) => {
    const isOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', isOpen);
    tab.classList.toggle('is-open', isOpen);
    if (container) {
      container.classList.toggle('is-open', isOpen);
    }
    if (body) {
      body.classList.toggle('player-tools-open', isOpen);
    }
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
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
    } else {
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
})();
