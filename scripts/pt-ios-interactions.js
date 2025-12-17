(() => {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return;

  const launcher = doc.querySelector('[data-pt-launcher]');
  if (!launcher) return;

  const homeView = launcher.querySelector('section[data-pt-launcher-home]');
  const pagesRoot = launcher.querySelector('[data-pt-home-pages]');
  const dotsRoot = launcher.querySelector('[data-pt-home-dots]');

  const supportsVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  const hapticTap = () => {
    if (!supportsVibrate) return;
    try {
      navigator.vibrate(10);
    } catch (_) {}
  };

  const isHomeVisible = () =>
    homeView && homeView.getAttribute('aria-hidden') === 'false' && !homeView.hidden;

  /* ---------------------------
     1) Press animation (tap)
  ----------------------------*/
  const bindPressFX = (btn) => {
    let pressed = false;

    const down = (e) => {
      if (!isHomeVisible()) return;
      if (e.button != null && e.button !== 0) return;

      pressed = true;
      btn.classList.add('is-pressed');
      hapticTap();
    };

    const up = () => {
      if (!pressed) return;
      pressed = false;
      btn.classList.remove('is-pressed');
    };

    btn.addEventListener('pointerdown', down, { passive: true });
    btn.addEventListener('pointerup', up, { passive: true });
    btn.addEventListener('pointercancel', up, { passive: true });
    btn.addEventListener('pointerleave', up, { passive: true });
    btn.addEventListener('blur', up, { passive: true });
  };

  const iconButtons = Array.from(
    launcher.querySelectorAll('.pt-home-icon, .pt-dock-icon')
  );

  iconButtons.forEach(bindPressFX);

  /* ---------------------------
     2) Page dots + paging
  ----------------------------*/
  let activePage = 0;

  const setPage = (index) => {
    if (!pagesRoot) return;
    const pages = Array.from(pagesRoot.querySelectorAll('[data-pt-home-page]'));
    const dots = dotsRoot ? Array.from(dotsRoot.querySelectorAll('[data-pt-dot]')) : [];

    const next = Math.max(0, Math.min(pages.length - 1, Number(index) || 0));
    activePage = next;

    pages.forEach((page, i) => {
      const on = i === next;
      page.classList.toggle('is-active', on);
      page.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    dots.forEach((dot, i) => {
      const on = i === next;
      dot.classList.toggle('is-active', on);
      dot.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  };

  if (dotsRoot && pagesRoot) {
    dotsRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pt-dot]');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-pt-dot'));
      setPage(idx);
    });

    // Swipe to change pages (home only)
    let startX = null;
    let startY = null;

    pagesRoot.addEventListener('pointerdown', (e) => {
      if (!isHomeVisible()) return;
      if (e.target.closest('.pt-home-icon, .pt-dock-icon, .pt-context-menu')) return;
      startX = e.clientX;
      startY = e.clientY;
    }, { passive: true });

    pagesRoot.addEventListener('pointerup', (e) => {
      if (!isHomeVisible()) return;
      if (startX == null || startY == null) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      startX = null;
      startY = null;

      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

      if (dx < 0) setPage(activePage + 1);
      else setPage(activePage - 1);
    }, { passive: true });

    setPage(0);
  }

  /* ---------------------------
     3) Long-press context menus
  ----------------------------*/
  const menu = doc.createElement('div');
  menu.className = 'pt-context-menu';
  menu.hidden = true;
  launcher.appendChild(menu);

  let longPressTimer = null;
  let menuOpenFor = null;

  const closeMenu = () => {
    menu.classList.remove('is-open');
    menuOpenFor = null;
    setTimeout(() => {
      menu.hidden = true;
    }, 140);
  };

  const openMenuFor = (btn) => {
    if (!btn) return;

    const appId = btn.getAttribute('data-pt-open-app');
    const label = btn.getAttribute('data-pt-app-label') || btn.textContent.trim() || 'App';

    const items = [
      { key: 'open', label: `Open ${label}` },
      { key: 'info', label: 'App Info' },
    ];

    menu.innerHTML = items.map((i) =>
      `<button type="button" data-pt-menu-action="${i.key}">${i.label}</button>`
    ).join('');

    const rect = btn.getBoundingClientRect();
    const hostRect = launcher.getBoundingClientRect();

    const x = Math.min(
      hostRect.width - 240,
      Math.max(12, rect.left - hostRect.left - 20)
    );
    const y = Math.min(
      hostRect.height - 140,
      Math.max(12, rect.top - hostRect.top - 70)
    );

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));

    menuOpenFor = { btn, appId, label };
  };

  launcher.addEventListener('pointerdown', (e) => {
    if (menu.hidden) return;
    if (e.target.closest('.pt-context-menu')) return;
    closeMenu();
  }, { passive: true });

  menu.addEventListener('click', (e) => {
    const action = e.target.closest('[data-pt-menu-action]')?.getAttribute('data-pt-menu-action');
    if (!action || !menuOpenFor) return;

    const { appId } = menuOpenFor;
    closeMenu();

    if (action === 'open') {
      try {
        window.dispatchEvent(new CustomEvent('cc:pt-launch', { detail: { appId } }));
      } catch (_) {}
    }

    if (action === 'info') {
      try {
        window.dispatchEvent(new CustomEvent('cc:pt-show-toast', { detail: { message: 'Coming soon' } }));
      } catch (_) {}
    }
  });

  iconButtons.forEach((btn) => {
    let moved = false;
    let startX = 0;
    let startY = 0;

    const clear = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      moved = false;
    };

    btn.addEventListener('pointerdown', (e) => {
      if (!isHomeVisible()) return;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;

      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        if (!moved) openMenuFor(btn);
      }, 520);
    }, { passive: true });

    btn.addEventListener('pointermove', (e) => {
      if (!longPressTimer) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 10 || dy > 10) {
        moved = true;
        clear();
      }
    }, { passive: true });

    btn.addEventListener('pointerup', clear, { passive: true });
    btn.addEventListener('pointercancel', clear, { passive: true });
    btn.addEventListener('pointerleave', clear, { passive: true });
  });

  /* ---------------------------
     4) Dynamic badge counts API
  ----------------------------*/
  const setBadge = (appId, value) => {
    const targets = Array.from(launcher.querySelectorAll(`[data-pt-open-app="${appId}"]`));
    const count = Number(value);

    targets.forEach((btn) => {
      const icon = btn.querySelector('.icon');
      if (!icon) return;

      let badge = icon.querySelector('.pt-badge');
      if (!badge) {
        badge = doc.createElement('span');
        badge.className = 'pt-badge';
        badge.setAttribute('aria-hidden', 'true');
        icon.appendChild(badge);
      }

      if (!Number.isFinite(count) || count <= 0) {
        badge.hidden = true;
        badge.textContent = '';
        return;
      }

      badge.hidden = false;
      badge.textContent = count > 99 ? '99+' : String(count);
    });
  };

  /* ---------------------------
     5) OMNI Uplink widget
  ----------------------------*/
  const btnMsg = launcher.querySelector('[data-pt-uplink-open-messages]');
  btnMsg?.addEventListener('click', () => {
    try { window.dispatchEvent(new CustomEvent('cc:pt-launch', { detail: { appId: 'messages' } })); } catch (_) {}
  });

  const elSignal = launcher.querySelector('[data-pt-uplink-signal]');
  const elThreat = launcher.querySelector('[data-pt-uplink-threat]');
  const elLock   = launcher.querySelector('[data-pt-uplink-lock]');
  const elLast   = launcher.querySelector('[data-pt-uplink-last]');

  const threatCycle = ['GREEN', 'AMBER', 'RED'];
  const lockCycle = ['LOCKED', 'SEARCHING', 'LOST'];

  const updateUplink = () => {
    const now = new Date();
    if (elSignal) {
      const pct = 70 + Math.floor(Math.random() * 30);
      elSignal.textContent = `Signal: ${pct}%`;
    }
    if (elThreat) elThreat.textContent = threatCycle[Math.floor(Math.random() * threatCycle.length)];
    if (elLock)   elLock.textContent   = lockCycle[Math.floor(Math.random() * lockCycle.length)];
    if (elLast)   elLast.textContent   = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  updateUplink();
  setInterval(updateUplink, 15000);

  window.PlayerOS = window.PlayerOS || {};
  window.PlayerOSBadges = { setBadge };
})();
