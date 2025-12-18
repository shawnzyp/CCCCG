// Player OS launcher: lock screen + home screen + simple app switcher
(function () {
  'use strict';

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  const launcher = q('[data-pt-launcher]');
  if (!launcher) {
    console.warn('Player OS: [data-pt-launcher] not found in DOM');
    return;
  }

  const glass = launcher.closest('.pt-screen__glass') || launcher.parentElement;

  const toastEl     = q('[data-pt-ios-toast]', launcher);
  const lockView    = q('[data-pt-lock-screen]', launcher);
  const homeView    = q('section[data-pt-launcher-home]', launcher);
  const appView     = q('[data-pt-launcher-app]', launcher);
  const appHost     = q('[data-pt-app-host]', launcher);
  const backButton  = q('[data-pt-launcher-back]', launcher);
  const homeButton  = q('[data-pt-launcher-home-btn]', launcher);
  const appTitleEl  = q('[data-pt-launcher-app-title]', launcher);
  const headerTitle = document.getElementById('ptLauncherTitle');
  const launcherTab = document.getElementById('player-tools-tab');
  const iosTimeEl   = q('[data-pt-ios-time]', launcher);
  const iosDateEl   = q('[data-pt-ios-date]', launcher);

  // Map of appId -> element inside appHost
  const appScreensById = {};
  if (appHost) {
    qa('[data-pt-app-screen]', appHost).forEach(el => {
      const id = el.getAttribute('data-pt-app-screen');
      if (id) appScreensById[id] = el;
    });
  }

  const state = {
    view: 'lock',     // "lock" | "home" | "app"
    app: null,
  };

  // Auto-dismiss lock after a short delay (since input is unreliable in your embed)
  let autoUnlockTimer = null;
  const AUTO_UNLOCK_MS = 1750;

  function normalizeAppId(appId) {
    if (appId === 'shards' && window.perms && window.perms.shardsUnlocked === false) {
      return 'locked';
    }
    return appId;
  }

  const isLocked = id => String(id || '').trim() === 'locked';

  function emitLaunch(appId) {
    try {
      window.dispatchEvent(new CustomEvent('cc:pt-launch', { detail: { appId } }));
    } catch (_) {}
  }

  let toastTimer = null;
  function showToast(message = '', ms = 1600) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = String(message || '').trim();
    toastEl.hidden = false;
    toastEl.classList.add('is-visible');
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
      toastTimer = setTimeout(() => {
        toastEl.hidden = true;
        toastEl.textContent = '';
      }, 160);
    }, ms);
  }

  function updateLockTime() {
    const now = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const h12 = hours % 12 || 12;
    const time = `${pad2(h12)}:${pad2(minutes)}`;

    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const month = now.toLocaleDateString(undefined, { month: 'short' });
    const day = now.getDate();
    const date = `${weekday}, ${month} ${day}`;

    if (iosTimeEl) iosTimeEl.textContent = time;
    if (iosDateEl) iosDateEl.textContent = date;
  }

  function isLauncherHidden() {
    return launcher.getAttribute('aria-hidden') === 'true' || launcher.hidden || launcher.style.display === 'none';
  }

  function setTabExpanded(isOpen) {
    if (!launcherTab) return;
    launcherTab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function showLauncher() {
    launcher.hidden = false;
    launcher.style.removeProperty('display');
    launcher.setAttribute('aria-hidden', 'false');

    // Make the "phone open" interaction rules kick in
    document.documentElement.setAttribute('data-pt-phone-open', '1');
    document.documentElement.classList.remove('pt-os-lock');

    setTabExpanded(true);
    if (glass) glass.setAttribute('data-pt-launcher-visible', '1');
  }

  function hideLauncher() {
    launcher.setAttribute('aria-hidden', 'true');
    launcher.style.display = 'none';
    launcher.hidden = true;

    // Restore normal page interaction rules
    document.documentElement.removeAttribute('data-pt-phone-open');

    setTabExpanded(false);
    if (glass) glass.removeAttribute('data-pt-launcher-visible');
  }

  function setLayerVisible(el, visible) {
    if (!el) return;
    // Use deterministic visibility to avoid invisible overlays intercepting input
    el.hidden = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    el.style.display = visible ? '' : 'none';
    el.style.pointerEvents = visible ? 'auto' : 'none';
  }

  function clearAutoUnlock() {
    if (autoUnlockTimer) {
      clearTimeout(autoUnlockTimer);
      autoUnlockTimer = null;
    }
  }

  function scheduleAutoUnlock() {
    clearAutoUnlock();
    autoUnlockTimer = setTimeout(() => {
      autoUnlockTimer = null;
      // Only unlock if we're still on lock view and launcher is visible
      if (state.view !== 'lock') return;
      if (launcher?.hidden) return;
      setView('home', null);
    }, AUTO_UNLOCK_MS);
  }

  function getAppLabel(appId) {
    if (!appId) return '';
    const icon = launcher.querySelector('[data-pt-open-app="' + appId + '"]');
    if (icon) {
      const fromAttr = icon.getAttribute('data-pt-app-label');
      if (fromAttr) return fromAttr;
      const text = icon.textContent && icon.textContent.trim();
      if (text) return text;
    }
    return appId.charAt(0).toUpperCase() + appId.slice(1);
  }

  function setView(view, appId) {
    state.view = view;
    state.app = appId || null;

    updateLockTime();

    launcher.setAttribute('data-view', view);

    // If we leave lock, never allow a pending timer to flip views later
    if (view !== 'lock') clearAutoUnlock();

    const isLock = view === 'lock';
    const isHome = view === 'home';
    const isApp  = view === 'app';

    setLayerVisible(lockView, isLock);
    setLayerVisible(homeView, isHome);
    setLayerVisible(appView, isApp);

    // Hide all app screens whenever we are not in "app" view
    if (!isApp) {
      Object.keys(appScreensById).forEach(id => {
        setLayerVisible(appScreensById[id], false);
      });
    }

    if (appTitleEl) {
      appTitleEl.textContent = isApp && appId ? getAppLabel(appId) : '';
    }
    if (headerTitle) {
      headerTitle.textContent = isApp && appId ? getAppLabel(appId) : 'Player OS';
    }
  }

  function openApp(appId) {
    const normalized = normalizeAppId(appId || 'home');

    if (!normalized || normalized === 'home') {
      // Clear any active app and go back to home
      setView('home', null);
      if (isLauncherHidden()) showLauncher();
      return;
    }

    if (isLocked(normalized)) {
      emitLaunch('locked');
      setView('home', null);
      return;
    }

    if (normalized === 'playerTools' || normalized === 'shards' || normalized === 'messages') {
      emitLaunch(normalized);
      closeLauncher();
      return;
    }

    const screen = appScreensById[normalized];
    if (!screen) {
      showToast('Coming soon');
      setView('home', null);
      return;
    }

    // Hide all other app screens, show this one
    Object.entries(appScreensById).forEach(([id, el]) => {
      setLayerVisible(el, id === normalized);
    });

    showLauncher();
    setView('app', normalized);
  }

  function handleBack() {
    setView('home', null);
  }

  function handleHome() {
    state.app = null;

    Object.values(appScreensById).forEach((el) => setLayerVisible(el, false));

    if (appTitleEl) appTitleEl.textContent = '';
    if (headerTitle) headerTitle.textContent = 'Player OS';
    setView('home', null);
  }

  function launchFromHome(rawAppId) {
    const normalized = normalizeAppId(rawAppId);

    if (isLocked(normalized)) {
      emitLaunch('locked');
      return;
    }

    if (normalized === 'settings') {
      openApp('settings');
      return;
    }

    if (normalized === 'minigames') {
      openApp('minigames');
      return;
    }

    emitLaunch(normalized);
    closeLauncher();
  }

  function bindEvents() {
    // Always show the launcher (starting at lock) when the drawer opens
    window.addEventListener('cc:player-tools-drawer-open', () => {
      openLauncher();
    });

    window.addEventListener('cc:pt-show-toast', (e) => {
      const msg = String(e?.detail?.message || '').trim();
      if (msg) showToast(msg);
    });

    qa('[data-pt-open-app]', launcher).forEach(btn => {
      btn.addEventListener('click', function () {
        const appId = btn.getAttribute('data-pt-open-app');
        if (!appId) return;
        launchFromHome(appId);
      });
    });

    qa('[data-pt-open-game]', launcher).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pt-open-game');
        if (!id) return;
        try {
          window.dispatchEvent(new CustomEvent('cc:pt-open-modal', { detail: { id: `modal-game-${id}` } }));
        } catch (_) {}
      });
    });

    if (backButton) {
      backButton.addEventListener('click', handleBack);
    }

    if (homeButton) {
      homeButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleHome();
      });
    }

    // Optional external triggers
    qa('[data-pt-launcher-open]').forEach(btn => {
      btn.addEventListener(
        'pointerdown',
        function () {
          // Let any drawer animations start, then show the launcher above them.
          requestAnimationFrame(() => openLauncher());
        },
        { capture: true }
      );
    });

    qa('[data-pt-launcher-close]').forEach(btn => {
      btn.addEventListener(
        'pointerdown',
        function () {
          requestAnimationFrame(() => closeLauncher());
        },
        { capture: true }
      );
    });
  }

  function openLauncher(nextView) {
    showLauncher();
    setView('lock', null);
    // Always auto-dismiss to home after 1.75s
    scheduleAutoUnlock();

    if (!nextView || nextView === 'lock') return;

    if (nextView === 'home') {
      setView('home', null);
      return;
    }

    openApp(nextView);
  }

  function closeLauncher() {
    clearAutoUnlock();
    hideLauncher();
  }

  function getState() {
    return { view: state.view, app: state.app };
  }

  function initLauncher() {
    if (isLauncherHidden()) {
      hideLauncher();
    } else {
      showLauncher();
    }

    // Start on lock screen
    setView('lock', null);
    scheduleAutoUnlock();
    updateLockTime();
    setInterval(updateLockTime, 15000);
    bindEvents();

    // Expose a small debug API if you want it
    const api = {
      openLauncher,
      closeLauncher,
      openApp,
      setView,
      getState,
      goHome: handleHome
    };

    const mergedApi = { ...(window.PlayerOS || {}), ...api };

    window.PlayerOS = mergedApi;
    window.PlayerLauncher = mergedApi; // backwards compatibility
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLauncher);
  } else {
    initLauncher();
  }
})();
