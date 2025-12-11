// PLAYER OS LAUNCHER: lock screen + home + apps
(function () {
  'use strict';

  // ---- DOM LOOKUP ---------------------------------------------------------

  const launcher = document.querySelector('[data-pt-launcher]');
  if (!launcher) {
    console.warn('Player OS: [data-pt-launcher] not found.');
    return;
  }

  const lockScreen  = launcher.querySelector('[data-pt-lock-screen]');
  const homeView    = launcher.querySelector('[data-pt-launcher-home]');
  const appView     = launcher.querySelector('[data-pt-launcher-app]');
  const appHost     = launcher.querySelector('[data-pt-app-host]');
  const appTitleEl  = launcher.querySelector('[data-pt-launcher-app-title]');
  const headerTitle = launcher.querySelector('#ptLauncherTitle');
  const backButton  = launcher.querySelector('[data-pt-launcher-back]');
  const unlockEl    = launcher.querySelector('[data-pt-lock-unlock]') || lockScreen;

  if (!lockScreen || !homeView || !appView || !appHost) {
    console.warn('Player OS: missing one of lock/home/app/appHost containers.');
  }

  // App templates live as <template data-pt-app="id"> inside launcher.
  const appTemplates = {};
  launcher.querySelectorAll('template[data-pt-app]').forEach((tpl) => {
    const id = tpl.getAttribute('data-pt-app');
    if (id) appTemplates[id] = tpl;
  });

  // ---- STATE --------------------------------------------------------------

  const state = {
    open: true,
    view: 'lock',   // 'lock' | 'home' | 'app'
    appId: null,
  };

  // ---- HELPERS ------------------------------------------------------------

  function showLayer(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    el.style.display = visible ? '' : 'none';
  }

  function getAppLabel(appId) {
    if (!appId) return '';
    const icon = launcher.querySelector('[data-pt-open-app="' + appId + '"]');
    if (icon && icon.getAttribute('data-pt-app-label')) {
      return icon.getAttribute('data-pt-app-label');
    }
    return appId.charAt(0).toUpperCase() + appId.slice(1);
  }

  function normalizeAppId(appId) {
    if (appId === 'shards' && window.perms && window.perms.shardsUnlocked === false) {
      return 'locked';
    }
    return appId;
  }

  function mountApp(appId) {
    if (!appHost) return;
    appHost.innerHTML = '';

    const template = appTemplates[appId];
    if (!template) {
      console.warn('Player OS: no template for app', appId);
      return;
    }

    const fragment = document.importNode(template.content, true);
    appHost.appendChild(fragment);
  }

  // ---- VIEW SWITCHING -----------------------------------------------------

  function setView(view, appId) {
    state.view = view;
    state.appId = appId || null;

    const isLock = view === 'lock';
    const isHome = view === 'home';
    const isApp  = view === 'app';

    showLayer(lockScreen, isLock);
    showLayer(homeView,   isHome);
    showLayer(appView,    isApp);

    if (headerTitle) {
      if (isApp && appId) {
        headerTitle.textContent = getAppLabel(appId);
      } else {
        headerTitle.textContent = 'Player OS';
      }
    }

    if (appTitleEl) {
      appTitleEl.textContent = isApp && appId ? getAppLabel(appId) : '';
    }
  }

  function openLauncher() {
    state.open = true;
    launcher.setAttribute('aria-hidden', 'false');
    setView('lock');
  }

  function closeLauncher() {
    state.open = false;
    launcher.setAttribute('aria-hidden', 'true');
    setView('lock');
  }

  // ---- PUBLIC APP API -----------------------------------------------------

  function openApp(appId) {
    const normalized = normalizeAppId(appId || 'home');

    if (normalized === 'home') {
      if (appHost) appHost.innerHTML = '';
      setView('home');
      return;
    }

    mountApp(normalized);
    setView('app', normalized);
  }

  function showLockedToast(message) {
    const text = message || 'This feature is locked.';
    try {
      if (typeof window.toast === 'function') {
        window.toast(text, 'warning');
        return;
      }
    } catch (_) {}

    try {
      console.warn(text);
    } catch (_) {}
  }

  const playerApi = {
    open: openLauncher,
    close: closeLauncher,
    openApp: openApp,
    setView: setView,
    showLockedToast,
    get state() {
      return Object.assign({}, state);
    },
  };

  window.PlayerLauncher = playerApi;

  window.PlayerOS = Object.assign(Object.create(playerApi), {
    openLauncher: openLauncher,
    closeLauncher: closeLauncher,
  });

  // ---- EVENT BINDINGS -----------------------------------------------------

  function bindEvents() {
    if (unlockEl) {
      unlockEl.addEventListener('click', function () {
        if (!state.open) openLauncher();
        setView('home');
      });
    }

    launcher.querySelectorAll('[data-pt-open-app]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const appId = btn.getAttribute('data-pt-open-app');
        if (!appId) return;
        openApp(appId);
      });
    });

    if (backButton) {
      backButton.addEventListener('click', function () {
        openApp('home');
      });
    }

    document.querySelectorAll('[data-pt-launcher-open]').forEach((btn) => {
      btn.addEventListener('click', openLauncher);
    });
    document.querySelectorAll('[data-pt-launcher-close]').forEach((btn) => {
      btn.addEventListener('click', closeLauncher);
    });
  }

  // ---- INIT ---------------------------------------------------------------

  function init() {
    launcher.setAttribute('aria-hidden', 'false');
    setView('lock');
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
