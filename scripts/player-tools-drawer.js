(() => {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) return;
  const openClass = 'is-open';
  const applyState = open => {
    drawer.classList.toggle(openClass, open);
    tab.setAttribute('aria-expanded', `${open}`);
    drawer.toggleAttribute('inert', !open);
    drawer.setAttribute('aria-hidden', `${!open}`);
    drawer.toggleAttribute('hidden', !open);
  };
  const onKeyDown = event => {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      closeDrawer();
    }
  };
  const openDrawer = () => {
    if (drawer.classList.contains(openClass)) return;
    applyState(true);
    document.addEventListener('keydown', onKeyDown, true);
    requestAnimationFrame(() => drawer.focus({ preventScroll: true }));
  };
  const closeDrawer = (returnFocus = true) => {
    if (!drawer.classList.contains(openClass)) return;
    applyState(false);
    document.removeEventListener('keydown', onKeyDown, true);
    if (returnFocus) tab.focus({ preventScroll: true });
  };
  tab.addEventListener('click', () => {
    drawer.classList.contains(openClass) ? closeDrawer() : openDrawer();
  });
  applyState(false);
})();
