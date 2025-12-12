(() => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const LOCK_CLASS = 'pt-os-lock';
  const OPEN_ATTR = 'data-pt-modal-open';

  const getPhoneToast = () => doc.querySelector('[data-pt-launcher] [data-pt-ios-toast]');
  let toastTimer = null;
  const showPhoneToast = (msg, ms = 1600) => {
    const el = getPhoneToast();
    if (!el) return;
    clearTimeout(toastTimer);
    el.textContent = String(msg || '').trim();
    el.hidden = false;
    el.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      el.classList.remove('is-visible');
      toastTimer = setTimeout(() => {
        el.hidden = true;
        el.textContent = '';
      }, 160);
    }, ms);
  };

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

  const openFirstModal = (ids = []) => {
    for (const id of ids) {
      if (openModal(id)) return true;
    }
    return false;
  };

  const clickFirst = (selectors = []) => {
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      if (typeof el.click === 'function') {
        el.click();
        return true;
      }
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      } catch (_) {}
    }
    return false;
  };

  const OPENERS = {
    shards: () => openFirstModal(['somf-reveal-alert', 'somf-confirm']),
    messages: () => openFirstModal(['app-alert']),
    playerTools: () => {
      try {
        window.PlayerTools?.openTray?.();
        return true;
      } catch (_) {}
      return false;
    },
    help: () =>
      openFirstModal(['help-modal', 'pt-help-modal', 'rules-help-modal']) ||
      clickFirst(['[data-open-help]', '[data-pt-open-help]', '#open-help']),
    rules: () =>
      openFirstModal(['rules-modal', 'pt-rules-modal']) ||
      clickFirst(['[data-open-rules]', '[data-pt-open-rules]', '#open-rules']),
    encounter: () =>
      openFirstModal(['encounter-modal', 'initiative-modal', 'pt-encounter-modal']) ||
      clickFirst([
        '[data-open-encounter]',
        '[data-open-initiative]',
        '[data-pt-open-encounter]',
        '#open-encounter'
      ]),
    loadSave: () =>
      openFirstModal(['load-save-modal', 'save-load-modal', 'pt-load-save-modal']) ||
      clickFirst([
        '[data-open-load-save]',
        '[data-open-save-load]',
        '[data-pt-open-load-save]',
        '#open-load-save'
      ]),
    actionLog: () =>
      openFirstModal(['action-log-modal', 'pt-action-log-modal']) ||
      clickFirst(['[data-open-action-log]', '[data-pt-open-action-log]', '#open-action-log']),
    creditsLedger: () =>
      openFirstModal(['player-credit-modal', 'credits-ledger-modal', 'pt-credits-modal']) ||
      clickFirst(['[data-open-credits]', '[data-open-credit-modal]', '[data-pt-open-credits]', '#open-credits']),
    campaignLog: () =>
      openFirstModal(['campaign-log-modal', 'pt-campaign-log-modal']) ||
      clickFirst(['[data-open-campaign-log]', '[data-pt-open-campaign-log]', '#open-campaign-log']),
    locked: () => {
      showPhoneToast('Access denied');
      return true;
    }
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
    const fn = OPENERS[appId];
    const ok = typeof fn === 'function' ? !!fn() : false;
    if (!ok) {
      showPhoneToast('Coming soon');
    }
  });
})();
