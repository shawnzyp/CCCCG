(() => {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) return;

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'details summary',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const updateAccessibilityState = (isOpen) => {
    drawer.classList.toggle('is-open', isOpen);
    tab.classList.toggle('is-open', isOpen);
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    drawer.toggleAttribute('inert', !isOpen);

    const focusableElements = drawer.querySelectorAll(FOCUSABLE_SELECTOR);
    focusableElements.forEach((element) => {
      if (!isOpen) {
        const currentTabIndex = element.getAttribute('tabindex');
        element.dataset.playerToolsOriginalTabIndex = currentTabIndex ?? '';
        element.setAttribute('tabindex', '-1');
      } else if (Object.prototype.hasOwnProperty.call(element.dataset, 'playerToolsOriginalTabIndex')) {
        const previousTabIndex = element.dataset.playerToolsOriginalTabIndex;
        delete element.dataset.playerToolsOriginalTabIndex;
        if (previousTabIndex === '') {
          element.removeAttribute('tabindex');
        } else {
          element.setAttribute('tabindex', previousTabIndex);
        }
      }
    });
  };

  const setOpenState = (open, { focus = true } = {}) => {
    const isOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('is-open');
    updateAccessibilityState(isOpen);
    if (!focus) return;
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

  updateAccessibilityState(false);
})();
