(() => {
  const drawer = document.getElementById('player-tools-drawer');
  const tab = document.getElementById('player-tools-tab');
  if (!drawer || !tab) return;
  const openClass = 'is-open';
  const setExpanded = value => tab.setAttribute('aria-expanded', String(value));
  const focusDrawer = () => drawer.focus({ preventScroll: true });
  function closeDrawer(returnFocus = true) {
    if (!drawer.classList.contains(openClass)) return;
    drawer.classList.remove(openClass);
    setExpanded(false);
    document.removeEventListener('keydown', handleEscape, true);
    if (returnFocus) tab.focus({ preventScroll: true });
  }
  function openDrawer() {
    if (drawer.classList.contains(openClass)) return;
    drawer.classList.add(openClass);
    setExpanded(true);
    document.addEventListener('keydown', handleEscape, true);
    requestAnimationFrame(focusDrawer);
  }
  function handleEscape(event) {
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      closeDrawer();
    }
  }
  tab.addEventListener('click', () => {
    if (drawer.classList.contains(openClass)) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
})();
