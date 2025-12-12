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

  const lockView    = q('[data-pt-lock-screen]', launcher);
  const homeView    = q('[data-pt-launcher-home]', launcher);
  const appView     = q('[data-pt-launcher-app]', launcher);
  const appHost     = q('[data-pt-app-host]', launcher);
  const unlockEl    = q('[data-pt-lock-unlock]', launcher) || lockView;
  const backButton  = q('[data-pt-launcher-back]', launcher);
  const appTitleEl  = q('[data-pt-launcher-app-title]', launcher);
  const headerTitle = document.getElementById('ptLauncherTitle');
  const launcherTab = document.getElementById('player-tools-tab');

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
    app: null
  };

  function normalizeAppId(appId) {
    if (appId === 'shards' && window.perms && window.perms.shardsUnlocked === false) {
      return 'locked';
    }
    return appId;
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
    launcher.style.display = 'block';
    launcher.setAttribute('aria-hidden', 'false');
    setTabExpanded(true);
  }

  function hideLauncher() {
    launcher.setAttribute('aria-hidden', 'true');
    launcher.style.display = 'none';
    launcher.hidden = true;
    setTabExpanded(false);
  }

  function setLayerVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    el.style.display = visible ? '' : 'none';
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

    const screen = appScreensById[normalized];
    if (!screen) {
      console.warn('Player OS: no [data-pt-app-screen="' + normalized + '"] found');
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

  function handleUnlock() {
    setView('home', null);
  }

  function handleBack() {
    openApp('home');
  }

  function bindEvents() {
    if (unlockEl) {
      unlockEl.addEventListener('click', handleUnlock);
    }

    qa('[data-pt-open-app]', launcher).forEach(btn => {
      btn.addEventListener('click', function () {
        const appId = btn.getAttribute('data-pt-open-app');
        if (!appId) return;
        openApp(appId);
      });
    });

    if (backButton) {
      backButton.addEventListener('click', handleBack);
    }

    // Optional external triggers
    qa('[data-pt-launcher-open]').forEach(btn => {
      btn.addEventListener('click', function () {
        openLauncher();
      });
    });

    qa('[data-pt-launcher-close]').forEach(btn => {
      btn.addEventListener('click', function () {
        closeLauncher();
      });
    });
  }

  function openLauncher(nextView) {
    showLauncher();
    if (state.view === 'lock') {
      setView('lock', null);
    }
    if (nextView && nextView !== 'lock') {
      openApp(nextView);
    }
  }

  function closeLauncher() {
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
    bindEvents();

    // Expose a small debug API if you want it
    const api = {
      openLauncher,
      closeLauncher,
      openApp,
      setView,
      getState
    };

    window.PlayerOS = api;
    window.PlayerLauncher = api; // backwards compatibility
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLauncher);
  } else {
    initLauncher();
  }
})();
