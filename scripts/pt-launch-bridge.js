(() => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const LOCK_CLASS = 'pt-os-lock';
  const OPEN_ATTR = 'data-pt-modal-open';

  const launcher = doc.querySelector('[data-pt-launcher]');
  const modalHost = launcher?.querySelector('[data-pt-modal-host]');
  const qInLauncher = (sel) => (launcher ? launcher.querySelector(sel) : null);
  const safeEscape = (id) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      try { return CSS.escape(id); } catch (_) { /* noop */ }
    }
    return String(id || '').replace(/[^\w-]/g, '\\$&');
  };

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
    const inLauncher = launcher?.querySelector(`.pt-modal[${OPEN_ATTR}="1"]`);
    if (inLauncher) return true;
    return !!doc.querySelector(`.pt-modal[${OPEN_ATTR}="1"]`);
  };

  const getModalById = (id) => qInLauncher(`#${safeEscape(id)}`) || doc.getElementById(id);

  const setModalHostOpen = (open) => {
    if (!modalHost) return;
    if (open) {
      modalHost.setAttribute('data-pt-modal-open', '1');
      modalHost.setAttribute('aria-hidden', 'false');
      launcher?.setAttribute('data-pt-modal-lock', '1');
    } else {
      modalHost.removeAttribute('data-pt-modal-open');
      modalHost.setAttribute('aria-hidden', 'true');
      launcher?.removeAttribute('data-pt-modal-lock');
    }
  };

  const openModal = id => {
    const modal = getModalById(id);
    if (!modal) return false;

    const inLauncher = launcher && launcher.contains(modal);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute(OPEN_ATTR, '1');
    if (inLauncher) {
      setModalHostOpen(true);
    }
    setLocked(true);
    requestAnimationFrame(() => focusFirst(modal));
    try {
      window.dispatchEvent(new CustomEvent('cc:pt-modal-opened', { detail: { id, modal } }));
    } catch (_) {}
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
    shards: () => openFirstModal(['modal-somf-reveal', 'modal-somf-confirm']),
    messages: () => openFirstModal(['app-alert']),
    playerTools: () => {
      try {
        window.PlayerTools?.openTray?.();
        return true;
      } catch (_) {}
      return false;
    },
    help: () =>
      openFirstModal(['modal-help', 'help-modal', 'pt-help-modal', 'rules-help-modal']) ||
      clickFirst(['[data-open-help]', '[data-pt-open-help]', '#open-help']),
    rules: () =>
      openFirstModal(['modal-rules', 'rules-modal', 'pt-rules-modal']) ||
      clickFirst(['[data-open-rules]', '[data-pt-open-rules]', '#open-rules']),
    encounter: () =>
      openFirstModal(['modal-enc', 'encounter-modal', 'initiative-modal', 'pt-encounter-modal']) ||
      clickFirst([
        '[data-open-encounter]',
        '[data-open-initiative]',
        '[data-pt-open-encounter]',
        '#open-encounter'
      ]),
    minigames: () => {
      try {
        window.PlayerOS?.openApp?.('minigames');
        return true;
      } catch (_) {}
      return false;
    },
    loadSave: () =>
      openFirstModal([
        'modal-load',
        'modal-load-list',
        'modal-recover-char',
        'modal-recover-list',
        'modal-augment-picker',
        'modal-welcome',
        'modal-pin'
      ]) ||
      clickFirst([
        '[data-open-load-save]',
        '[data-open-save-load]',
        '[data-pt-open-load-save]',
        '#open-load-save'
      ]),
    actionLog: () =>
      openFirstModal(['modal-log', 'action-log-modal', 'pt-action-log-modal']) ||
      clickFirst(['[data-open-action-log]', '[data-pt-open-action-log]', '#open-action-log']),
    creditsLedger: () =>
      openFirstModal(['modal-credits-ledger', 'player-credit-modal', 'credits-ledger-modal', 'pt-credits-modal']) ||
      clickFirst(['[data-open-credits]', '[data-open-credit-modal]', '[data-pt-open-credits]', '#open-credits']),
    campaignLog: () =>
      openFirstModal(['modal-campaign', 'campaign-log-modal', 'pt-campaign-log-modal']) ||
      clickFirst(['[data-open-campaign-log]', '[data-pt-open-campaign-log]', '#open-campaign-log']),
    initiative: () =>
      openFirstModal(['modal-enc', 'initiative-modal', 'pt-encounter-modal']) ||
      clickFirst([
        '[data-open-initiative]',
        '[data-pt-open-encounter]',
        '#open-encounter'
      ]),
    locked: () => {
      showPhoneToast('Access denied');
      return true;
    }
  };

  const closeModal = id => {
    const modal = getModalById(id);
    if (!modal) return false;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute(OPEN_ATTR);
    const hasOpen = anyOpenModal();
    setModalHostOpen(hasOpen);
    setLocked(hasOpen);
    try {
      window.dispatchEvent(new CustomEvent('cc:pt-modal-closed', { detail: { id, modal } }));
    } catch (_) {}
    return true;
  };

  const getFocusables = (root) => {
    if (!root) return [];
    return Array.from(root.querySelectorAll(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
    )).filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
  };

  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const openModals = launcher ? Array.from(launcher.querySelectorAll(`.pt-modal[${OPEN_ATTR}="1"]`)) : [];
    const modal = openModals.length ? openModals[openModals.length - 1] : null;
    if (!modal) return;

    const focusables = getFocusables(modal);
    if (!focusables.length) {
      e.preventDefault();
      return;
    }

    const current = doc.activeElement;
    const idx = focusables.indexOf(current);
    const lastIndex = focusables.length - 1;

    let nextIndex = 0;
    if (e.shiftKey) {
      nextIndex = idx <= 0 ? lastIndex : idx - 1;
    } else {
      nextIndex = idx === lastIndex ? 0 : idx + 1;
    }

    e.preventDefault();
    const next = focusables[nextIndex] || focusables[0];
    if (next && typeof next.focus === 'function') {
      next.focus();
    }
  }, true);

  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pt-modal-close]');
    if (!btn) return;
    const modal = e.target.closest('.pt-modal');
    if (!modal || (launcher && !launcher.contains(modal))) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute(OPEN_ATTR);
    const hasOpen = anyOpenModal();
    setModalHostOpen(hasOpen);
    setLocked(hasOpen);
    const id = modal.getAttribute('id') || '';
    try {
      window.dispatchEvent(new CustomEvent('cc:pt-modal-closed', { detail: { id, modal } }));
    } catch (_) {}
  });

  doc.addEventListener('click', (e) => {
    const draw = e.target.closest('[data-somf-draw]');
    if (draw) {
      closeModal('modal-somf-reveal');
      openModal('modal-somf-confirm');
      return;
    }

    const confirm = e.target.closest('[data-somf-confirm]');
    if (confirm) {
      closeModal('modal-somf-confirm');
      return;
    }
  });

  const wireDismiss = (selector, modalId) => {
    const btn = doc.querySelector(selector);
    if (!btn) return;
    btn.addEventListener('click', () => closeModal(modalId));
  };

  wireDismiss('[data-somf-reveal-dismiss]', 'modal-somf-reveal');
  wireDismiss('[data-somf-confirm-cancel]', 'modal-somf-confirm');
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

  window.addEventListener('cc:pt-open-modal', (e) => {
    const id = e?.detail?.id;
    if (!id) return;
    openModal(id);
  });
})();
