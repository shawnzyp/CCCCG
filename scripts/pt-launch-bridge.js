(() => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const LOCK_CLASS = 'pt-os-lock';
  const OPEN_ATTR = 'data-pt-modal-open';

  const focusFirst = root => {
    const el = root.querySelector(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    if (el && typeof el.focus === 'function') el.focus();
  };

  const setLocked = locked => {
    doc.documentElement.classList.toggle(LOCK_CLASS, !!locked);
  };

  const anyOpenModal = () => {
    return !!doc.querySelector(`[${OPEN_ATTR}="1"]`);
  };

  const openModal = id => {
    const modal = doc.getElementById(id);
    if (!modal) return false;

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute(OPEN_ATTR, '1');
    setLocked(true);
    requestAnimationFrame(() => focusFirst(modal));
    return true;
  };

  const closeModal = id => {
    const modal = doc.getElementById(id);
    if (!modal) return false;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute(OPEN_ATTR);
    setLocked(anyOpenModal());
    return true;
  };

  const wireDismiss = (selector, modalId) => {
    const btn = doc.querySelector(selector);
    if (!btn) return;
    btn.addEventListener('click', () => closeModal(modalId));
  };

  wireDismiss('[data-somf-reveal-dismiss]', 'somf-reveal-alert');
  wireDismiss('[data-somf-confirm-cancel]', 'somf-confirm');
  // Accept may open other flows; avoid auto-closing unless desired.
  // wireDismiss('[data-somf-confirm-accept]', 'somf-confirm');
  wireDismiss('[data-app-alert-dismiss]', 'app-alert');

  window.addEventListener('cc:pt-launch', e => {
    const appId = String(e?.detail?.appId || '').trim();

    const emit = (name, detail = {}) => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } catch (_) {}
    };

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
      case 'loadSave':
        emit('cc:open-load-save');
        break;
      case 'encounter':
        emit('cc:open-encounter');
        break;
      case 'actionLog':
        emit('cc:open-action-log');
        break;
      case 'creditsLedger':
        emit('cc:open-credits-ledger');
        break;
      case 'campaignLog':
        emit('cc:open-campaign-log');
        break;
      case 'rules':
        emit('cc:open-rules');
        break;
      case 'help':
        emit('cc:open-help');
        break;
      default:
        break;
    }
  });
})();
