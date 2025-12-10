import { createPortal } from './app-portal.js';
import { APPS } from './player-os-apps.js';
import { open as openPlayerToolsDrawer } from './player-tools-drawer.js';

const doc = typeof document !== 'undefined' ? document : null;
const root = doc?.documentElement || null;
const launcher = doc?.getElementById('ptLauncher') || null;
const getPhoneShell = () =>
  doc?.querySelector('#player-tools-drawer [data-phone-shell], .pt-drawer [data-phone-shell]') || null;
const setPhoneOwnedByOS = (owned) => {
  const shell = getPhoneShell();
  if (!shell) return;
  shell.classList.toggle('pt-os-active', !!owned);
};
const scrim = launcher?.querySelector('[data-pt-launcher-scrim]') || null;
const homeView = launcher?.querySelector('[data-pt-launcher-home]') || null;
const appView = launcher?.querySelector('[data-pt-launcher-app]') || null;
const appHost = launcher?.querySelector('[data-pt-app-host]') || null;
const appTitle = launcher?.querySelector('[data-pt-launcher-app-title]') || null;
const headerTitle = launcher?.querySelector('#ptLauncherTitle') || null;
const backButton = launcher?.querySelector('[data-pt-launcher-back]') || null;
const closeButton = launcher?.querySelector('[data-pt-launcher-close]') || null;
const boot = launcher?.querySelector('[data-pt-boot]') || null;
const bootIcon = launcher?.querySelector('[data-pt-boot-icon]') || null;
const bootLabel = launcher?.querySelector('[data-pt-boot-label]') || null;
const bootFill = launcher?.querySelector('[data-pt-boot-fill]') || null;
const toast = launcher?.querySelector('[data-pt-toast]') || null;
const toastMsg = launcher?.querySelector('[data-pt-toast-msg]') || null;
const lock = launcher?.querySelector('[data-pt-lock]') || null;
const lockTime = launcher?.querySelector('[data-pt-lock-time]') || null;
const lockDate = launcher?.querySelector('[data-pt-lock-date]') || null;

let toastTimer = null;
let bootTimer = null;
let lockTimer = null;
let lockResolve = null;
let toastPrevFocus = null;

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
]
  .map((sel) => `${sel}:not([aria-hidden="true"])`)
  .join(',');

const SETTINGS_KEYS = Object.freeze({
  reduceMotion: 'cc:settings:reduce-motion',
  hideTickers: 'cc:settings:hide-tickers',
});

const PERM_KEYS = Object.freeze({
  shardsUnlocked: 'cc:perm:shards-unlocked',
});

const APP_LABELS = Object.freeze({
  playerTools: 'Player Tools',
  shards: 'TSoMF',
  messages: 'Director’s Messages',
  settings: 'Settings',
  initiative: 'Initiative',
  codex: 'Codex',
  missions: 'Missions',
  locked: 'Access Restricted',
  home: 'Player OS',
});

const state = {
  open: false,
  app: 'home',
  lastFocused: null,
  settings: {
    reduceMotion: false,
    hideTickers: false,
  },
};

const perms = {
  shardsUnlocked: false,
};

const getAppMeta = (id) => APPS.find((app) => app.id === id) || null;
const getAppLabel = (id) => {
  const meta = getAppMeta(id);
  if (meta?.title) return meta.title;
  return APP_LABELS[id] || id;
};
const canOpenApp = (app) => {
  if (!app) return false;
  if (app.perm === 'shardsUnlocked' && !perms.shardsUnlocked) return false;
  return true;
};

const portal = doc ? createPortal(doc) : null;

let mountedFragment = null;
let mountedAppId = null;
let navToken = 0;

const restoreMountedApp = () => {
  if (mountedFragment && portal) {
    portal.restore(mountedFragment);
  }
  mountedFragment = null;
  mountedAppId = null;
};

const mountLauncher = () => {
  if (!launcher) return false;
  const phoneShell = getPhoneShell();
  if (!phoneShell) return false;

  if (launcher.parentElement !== phoneShell) {
    phoneShell.appendChild(launcher);
  }
  launcher.dataset.ptMount = 'phone';
  return true;
};

const getStorage = () => {
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
};

const readSetting = (key, fallback = false) => {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    if (value === null) return fallback;
    return value === '1' || value === 'true';
  } catch (_) {
    return fallback;
  }
};

const persistSetting = (key, value) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value ? '1' : '0');
  } catch (_) {
    /* ignore */
  }
};

const readBool = (key, fallback = false) => {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const value = storage.getItem(key);
    if (value === null) return fallback;
    return value === '1' || value === 'true';
  } catch (_) {
    return fallback;
  }
};

const writeBool = (key, value) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value ? '1' : '0');
  } catch (_) {
    /* ignore */
  }
};

const applySettingClasses = () => {
  if (!root) return;
  root.classList.toggle('ccReduceMotion', !!state.settings.reduceMotion);
  root.classList.toggle('ccHideTickers', !!state.settings.hideTickers);
};

const syncSettings = () => {
  state.settings.reduceMotion = readSetting(SETTINGS_KEYS.reduceMotion, false);
  state.settings.hideTickers = readSetting(SETTINGS_KEYS.hideTickers, false);
  applySettingClasses();
  const reduceToggle = launcher?.querySelector('[data-pt-reduce-motion]');
  const tickerToggle = launcher?.querySelector('[data-pt-hide-tickers]');
  if (reduceToggle) reduceToggle.checked = !!state.settings.reduceMotion;
  if (tickerToggle) tickerToggle.checked = !!state.settings.hideTickers;
};

const setSetting = (key, value) => {
  const normalized = !!value;
  if (key in state.settings) {
    state.settings[key] = normalized;
    persistSetting(SETTINGS_KEYS[key], normalized);
    applySettingClasses();
  }
};

const isToastVisible = () => toast && !toast.hidden && toast.getAttribute('aria-hidden') !== 'true';

const getFocusable = () => {
  if (!launcher) return [];
  const scope = isToastVisible() ? toast : launcher;
  if (!scope) return [];
  const focusables = Array.from(scope.querySelectorAll(focusableSelector));
  if (isToastVisible() && !focusables.includes(toast)) {
    focusables.unshift(toast);
  }
  return focusables.filter((el) => {
    if (el.closest('[hidden]')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
};

const focusFirstElement = () => {
  const target =
    (isToastVisible() && toast) ||
    launcher?.querySelector('[data-pt-app-target]') ||
    launcher?.querySelector('[data-pt-launcher-close]') ||
    launcher;
  if (target && typeof target.focus === 'function') {
    try {
      target.focus({ preventScroll: true });
    } catch (_) {
      target.focus();
    }
  }
};

const enforceFocus = (event) => {
  if (!state.open || !launcher) return;
  if (isToastVisible() && toast && !toast.contains(event.target)) {
    focusFirstElement();
    return;
  }
  if (launcher.contains(event.target)) return;
  focusFirstElement();
};

const applyPermsUI = () => {
  if (!launcher) return;

  const shardCards = launcher.querySelectorAll('[data-pt-app-target="shards"]');
  shardCards.forEach((btn) => {
    const locked = !perms.shardsUnlocked;
    btn.classList.toggle('pt-launcher__app-card--locked', locked);
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  });
};

const showLockedToast = (msg = 'This app is locked.') => {
  if (!toast || !toastMsg) return;
  toastMsg.textContent = msg;
  const active = doc?.activeElement || null;
  toastPrevFocus = active && toast.contains(active) ? launcher : active;
  toast.hidden = false;
  toast.setAttribute('aria-hidden', 'false');
  toast.setAttribute('tabindex', '-1');
  launcher?.classList.add('is-toast-open');

  requestAnimationFrame(() => {
    try {
      toast.focus({ preventScroll: true });
    } catch (_) {
      toast.focus();
    }
  });

  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => hideToast(), 4000);
};

const hideToast = (restoreFocus = true) => {
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = null;
  if (!toast) {
    toastPrevFocus = null;
    return;
  }

  const wasVisible = isToastVisible();
  toast.hidden = true;
  toast.setAttribute('aria-hidden', 'true');
  toast.removeAttribute('tabindex');
  launcher?.classList.remove('is-toast-open');

  if (restoreFocus && wasVisible) {
    const focusTarget = toastPrevFocus && doc?.contains(toastPrevFocus) ? toastPrevFocus : launcher;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (_) {
        focusTarget.focus();
      }
    }
  }

  toastPrevFocus = null;
};

const handleKeydown = (event) => {
  if (!state.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (isToastVisible()) {
      hideToast();
      return;
    }
    closeLauncher();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = getFocusable();
  if (!focusable.length) {
    event.preventDefault();
    if (launcher) launcher.focus();
    return;
  }
  const currentIndex = focusable.indexOf(doc?.activeElement);
  const lastIndex = focusable.length - 1;
  if (event.shiftKey) {
    if (doc?.activeElement === focusable[0] || currentIndex === 0) {
      event.preventDefault();
      focusable[lastIndex].focus();
    }
  } else if (doc?.activeElement === focusable[lastIndex] || currentIndex === lastIndex) {
    event.preventDefault();
    focusable[0].focus();
  }
};

const runBoot = (sourceButton, labelText) =>
  new Promise((resolve) => {
    if (!boot || !bootIcon || !bootLabel || !bootFill) return resolve();

    const iconEl =
      sourceButton?.querySelector?.('.pt-launcher__app-icon') ||
      sourceButton?.querySelector?.('span[aria-hidden="true"]');
    bootIcon.innerHTML = iconEl ? iconEl.innerHTML : '';
    bootLabel.textContent = labelText || 'Launching';

    bootFill.style.width = '0%';
    boot.hidden = false;
    boot.setAttribute('aria-hidden', 'false');

    const steps = [18, 42, 68, 86, 100];
    let i = 0;

    const tick = () => {
      bootFill.style.width = `${steps[i]}%`;
      i += 1;
      if (i >= steps.length) {
        bootTimer = window.setTimeout(() => {
          boot.hidden = true;
          boot.setAttribute('aria-hidden', 'true');
          resolve();
        }, 120);
        return;
      }
      bootTimer = window.setTimeout(tick, 110 + Math.floor(Math.random() * 90));
    };

    if (bootTimer) window.clearTimeout(bootTimer);
    tick();
  });

const updateLockText = () => {
  if (!lockTime || !lockDate) return;
  const now = new Date();

  lockTime.textContent = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);

  lockDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now);
};

const runUnlockSequence = (ms = 1500) => {
  if (!launcher || !lock) return Promise.resolve();

  updateLockText();

  lock.hidden = false;
  lock.setAttribute('aria-hidden', 'false');
  lock.classList.remove('is-off');
  launcher.classList.add('is-locking');

  requestAnimationFrame(() => {
    lock.classList.add('is-on');
  });

  const outAt = Math.max(0, ms - 350);

  if (lockTimer) window.clearTimeout(lockTimer);
  if (lockResolve) {
    lockResolve();
    lockResolve = null;
  }

  return new Promise((resolve) => {
    lockResolve = resolve;
    lockTimer = window.setTimeout(() => {
      lock.classList.add('is-off');
      lock.classList.remove('is-on');

      lockTimer = window.setTimeout(() => {
        lock.hidden = true;
        lock.setAttribute('aria-hidden', 'true');
        launcher.classList.remove('is-locking');
        lockTimer = null;
        lockResolve = null;
        resolve();
      }, 360);
    }, outAt);
  });
};

const openApp = async (appId = 'home', sourceButton = null, opts = {}) => {
  const token = ++navToken;

  if (appId === 'home') {
    setAppView('home');
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token !== navToken) return;
    return;
  }

  if (appId === 'locked') {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token !== navToken) return;
    showLockedToast('Access Restricted.');
    return;
  }

  const targetApp = getAppMeta(appId);

  if (!targetApp) {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token !== navToken) return;
    showLockedToast('App content not found.');
    return;
  }

  if (!canOpenApp(targetApp)) {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token !== navToken) return;
    showLockedToast('That app is locked. Ask your DM to enable it.');
    return;
  }

  let unlockPromise = Promise.resolve();
  if (!state.open) {
    unlockPromise = openLauncher('home', { unlock: opts.unlock });
    await Promise.resolve(unlockPromise);
  }

  if (token !== navToken) return;

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await unlockPromise;

  if (token !== navToken) return;

  const label = getAppLabel(appId);
  await runBoot(sourceButton, label);

  if (token !== navToken) return;

  if (mountedFragment && portal) {
    portal.restore(mountedFragment);
  }

  mountedFragment = null;
  mountedAppId = null;

  const fragmentId = targetApp?.fragment || appId;
  const fragment = doc?.querySelector(`[data-pt-app-fragment="${fragmentId}"]`);

  if (!fragment || !appHost || !portal) {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token !== navToken) return;
    showLockedToast('App content not found.');
    setAppView('home');
    return;
  }

  mountedFragment = portal.moveToHost(fragment, appHost);
  mountedAppId = appId;
  if (appId === 'settings') {
    syncSettings();
    applyPermsUI();
  }
  setAppView(appId);

  requestAnimationFrame(() => {
    focusFirstElement();
  });
};

const normalizeAppId = (nextApp = 'home') =>
  nextApp === 'shards' && !perms.shardsUnlocked ? 'locked' : nextApp;

const setAppView = (nextApp = 'home') => {
  const normalized = normalizeAppId(nextApp);
  state.app = normalized;
  if (!homeView || !appView) return;
  const isHome = normalized === 'home';
  homeView.hidden = !isHome;
  appView.hidden = isHome;
  if (isHome) {
    restoreMountedApp();
  }
  if (appTitle) {
    appTitle.textContent = isHome ? '' : getAppLabel(normalized);
  }
  if (headerTitle) {
    headerTitle.textContent = getAppLabel(normalized) || 'Player OS';
  }
};

const closeLauncher = () => {
  if (!launcher || !state.open) return;
  state.open = false;
  setPhoneOwnedByOS(false);
  restoreMountedApp();
  hideToast(false);
  if (bootTimer) window.clearTimeout(bootTimer);
  bootTimer = null;
  if (boot) {
    boot.hidden = true;
    boot.setAttribute('aria-hidden', 'true');
  }
  if (lockTimer) window.clearTimeout(lockTimer);
  lockTimer = null;
  if (lockResolve) {
    lockResolve();
    lockResolve = null;
  }
  if (lock) {
    lock.hidden = true;
    lock.setAttribute('aria-hidden', 'true');
    lock.classList.remove('is-on', 'is-off');
  }
  launcher.classList.remove('is-locking');
  launcher.setAttribute('aria-hidden', 'true');
  launcher.hidden = true;
  launcher.classList.remove('is-open');
  doc?.removeEventListener('keydown', handleKeydown, true);
  doc?.removeEventListener('focusin', enforceFocus, true);
  if (backButton) backButton.setAttribute('tabindex', '-1');
  if (closeButton) closeButton.setAttribute('tabindex', '-1');
  const tab = doc?.getElementById('player-tools-tab');
  if (tab) tab.setAttribute('aria-expanded', 'false');
  const focusTarget = state.lastFocused && doc?.contains(state.lastFocused) ? state.lastFocused : tab;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (_) {
      focusTarget.focus();
    }
  }
};

const openLauncher = async (nextApp = 'home') => {
  // Ensure we're mounted in the faux phone before opening.
const openLauncher = (nextApp = 'home', opts = {}) => {
  // Ensure we're mounted in the phone before opening
  if (launcher?.dataset?.ptMount !== 'phone') {
    if (!mountLauncher()) return false;
  }
  const target = normalizeAppId(nextApp);
  if (!launcher || state.open) {
    setAppView(target);
    return true;
  setPhoneOwnedByOS(true);
  const target = nextApp === 'shards' && !perms.shardsUnlocked ? 'locked' : nextApp;
  const wasClosed = !state.open;
  const shouldUnlock = wasClosed && opts.unlock !== false;
  if (!launcher || state.open) {
    setAppView(target);
    return Promise.resolve();
  }
  state.lastFocused = doc?.activeElement || null;
  state.open = true;
  setAppView(target);
  launcher.hidden = false;
  launcher.setAttribute('aria-hidden', 'false');
  launcher.classList.add('is-open');
  doc?.addEventListener('keydown', handleKeydown, true);
  doc?.addEventListener('focusin', enforceFocus, true);
  if (backButton) backButton.removeAttribute('tabindex');
  if (closeButton) closeButton.removeAttribute('tabindex');
  const tab = doc?.getElementById('player-tools-tab');
  if (tab) tab.setAttribute('aria-expanded', 'true');

  const unlockDelay = shouldUnlock ? 1500 : 0;
  const unlockPromise = shouldUnlock ? runUnlockSequence(unlockDelay) : Promise.resolve();
  requestAnimationFrame(() => {
    if (launcher) {
      try {
        launcher.focus({ preventScroll: true });
      } catch (_) {
        launcher.focus();
      }
    }
    if (shouldUnlock) {
      unlockPromise.then(() => {
        if (state.open) focusFirstElement();
      });
    } else {
      focusFirstElement();
    }
  });
  return true;
};

const openApp = async (appId = 'home') => {
  const target = normalizeAppId(appId);
  if (target === 'settings') {
    syncSettings();
    applyPermsUI();
  }
  const ok = await openLauncher(target);
  if (ok === false) return false;
  return true;
  return unlockPromise;
};

const handleScrimClick = (event) => {
  if (event?.target === scrim) closeLauncher();
};

const wireAppButtons = () => {
  if (!launcher) return;
  const appButtons = launcher.querySelectorAll('[data-pt-app-target]');
  appButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.getAttribute('data-pt-app-target') || 'home';
      openApp(target);
    });
  });
  if (backButton) {
    backButton.addEventListener('click', () => {
      openApp('home');
    });

      await openApp(target, btn);
    });
  });
  if (backButton) {
    backButton.addEventListener('click', () => openApp('home'));
  }
};

const wireActions = () => {
  const tab = doc?.getElementById('player-tools-tab');
  if (tab) {
    tab.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        openPlayerToolsDrawer();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => openLauncher('home', { unlock: true }));
        });
      },
      true
    );
  }
  if (scrim) scrim.addEventListener('click', handleScrimClick);
  if (closeButton) closeButton.addEventListener('click', closeLauncher);
  const quickTrayBtns = doc?.querySelectorAll('[data-pt-open-quick-tray]') || [];
  quickTrayBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      closeLauncher();
      setTimeout(() => openPlayerToolsDrawer(), 50);
    });
  });
  const shardBtns = doc?.querySelectorAll('[data-pt-open-shards]') || [];
  shardBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!perms.shardsUnlocked) {
        openApp('locked');
        showLockedToast('TSoMF is locked. Ask your DM to enable it.');
        if (!state.open) openLauncher('home');
        return;
      }
      closeLauncher();
      const drawBtn = doc?.getElementById('somf-min-draw');
      if (drawBtn && typeof drawBtn.click === 'function') {
        drawBtn.click();
      }
    });
  });
  const themeBtns = doc?.querySelectorAll('[data-pt-theme-next]') || [];
  themeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const themeToggle =
        doc?.querySelector('[data-theme-toggle]') ||
        doc?.querySelector('.logo-button');
      if (themeToggle && typeof themeToggle.click === 'function') {
        themeToggle.click();
      }
    });
  });
  const reduceMotionToggles = doc?.querySelectorAll('[data-pt-reduce-motion]') || [];
  reduceMotionToggles.forEach((toggle) => {
    toggle.addEventListener('change', (event) => {
      setSetting('reduceMotion', event.currentTarget.checked);
    });
  });
  const hideTickerToggles = doc?.querySelectorAll('[data-pt-hide-tickers]') || [];
  hideTickerToggles.forEach((toggle) => {
    toggle.addEventListener('change', (event) => {
      setSetting('hideTickers', event.currentTarget.checked);
    });
  });
};

const init = () => {
  // Do not return early. The phone shell may be injected after scripts load.
  mountLauncher();
  syncSettings();
  perms.shardsUnlocked = readBool(PERM_KEYS.shardsUnlocked, false);
  applyPermsUI();
  wireAppButtons();
  wireActions();
  const shouldAutoOpen =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 900px)').matches;
  if (shouldAutoOpen && !state.open) {
    openLauncher('home', { unlock: false });
  }
  window.PlayerOS = Object.assign(window.PlayerOS || {}, {
    openApp,
    openLauncher,
    openApp,
    showLockedToast,
    unlockShards() {
      perms.shardsUnlocked = true;
      writeBool(PERM_KEYS.shardsUnlocked, true);
      applyPermsUI();
    },
    lockShards() {
      perms.shardsUnlocked = false;
      writeBool(PERM_KEYS.shardsUnlocked, false);
      applyPermsUI();
    },
  });
};

if (launcher && doc) {
  init();
}
