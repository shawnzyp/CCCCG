(() => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const focusFirst = root => {
    const el = root.querySelector(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    if (el && typeof el.focus === 'function') el.focus();
  };

  const openModal = id => {
    const modal = doc.getElementById(id);
    if (!modal) return false;

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    doc.documentElement.classList.add('pt-os-lock');
    requestAnimationFrame(() => focusFirst(modal));
    return true;
  };

  window.addEventListener('cc:pt-launch', e => {
    const appId = String(e?.detail?.appId || '').trim();

    switch (appId) {
      case 'shards':
        openModal('somf-reveal-alert') || openModal('somf-confirm');
        break;
      case 'messages':
        openModal('app-alert');
        break;
      case 'playerTools':
        try {
          window.PlayerTools?.openTray?.();
        } catch (_) {}
        break;
      default:
        break;
    }
  });
})();
