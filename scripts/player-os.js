import { createPortal } from './app-portal.js';
import { APPS } from './player-os-apps.js';
import { open as openPlayerToolsDrawer } from './player-tools-drawer.js';

const doc = typeof document !== 'undefined' ? document : null;
const root = doc?.documentElement || null;
const launcher = doc?.getElementById('ptLauncher') || null;
const getPhoneShell = () =>
  launcher?.closest?.('[data-pt-phone-shell]') ||
  doc?.querySelector('[data-pt-phone-shell]') ||
  null;
const setPhoneOwnedByOS = (owned) => {
  const shell = getPhoneShell();
  if (!shell) return;
  shell.classList.toggle('pt-os-active', !!owned);

  // Safety: never let the faux glass intercept taps while Player OS is open.
  const glass =
    shell.querySelector?.('.pt-screen__glass, [data-pt-screen-glass], [data-screen-glass]') || null;
  if (glass) {
    if (owned) {
      glass.style.pointerEvents = 'none';
      glass.style.opacity = '0';
    } else {
      glass.style.pointerEvents = '';
      glass.style.opacity = '';
    }
  }
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
let unlockToken = 0;
let unlockCleanupTimer = null;
let toastPrevFocus = null;
let lockGestureCleanup = null;
let launcherWired = false;
let lastLauncherActivationTs = 0;

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
  loadSave: 'Load / Save',
  encounter: 'Encounter / Initiative',
  actionLog: 'Action Log',
  creditsLedger: 'Credits Ledger',
  campaignLog: 'Campaign Log',
  rules: 'Rules',
  help: 'Help',
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

const LOCKSCREEN_DURATION_MS = 2500;
const LOCK_SWIPE_THRESHOLD = 40;
const LAUNCHER_ACTIVATE_DEBOUNCE_MS = 250;

const nowTs = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const portal = doc ? createPortal(doc) : null;

const dispatchMenuAction = (actionId) => {
  if (!actionId || typeof window === 'undefined') return false;
  const event = new CustomEvent('cc:menu-action', {
    detail: { action: actionId, source: 'player-os' },
    cancelable: true,
  });
  return window.dispatchEvent(event);
};

const isMenuActionBlocked = () => {
  if (typeof window !== 'undefined' && typeof window.isMenuActionBlocked === 'function') {
    return window.isMenuActionBlocked();
  }
  const body = doc?.body || null;
  const launching = !!(body && body.classList.contains('launching'));
  const welcomeModal = doc?.getElementById('modal-welcome') || null;
  const welcomeVisible = welcomeModal && !welcomeModal.classList.contains('hidden');
  return launching || welcomeVisible;
};

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
const getGlobalToastElement = () => doc?.getElementById('toast') || null;
const isGlobalToastTarget = (el) => {
  const globalToast = getGlobalToastElement();
  return !!(globalToast && el && globalToast.contains(el));
};
const isToastFocus = (el) =>
  !!(
    el?.closest?.(
      '.toast, .toast-container, [data-toast], [data-toast-root], [role="status"], [aria-live]'
    ) || isGlobalToastTarget(el)
  );

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
  const focusables = getFocusable();
  const first = focusables[0];

  if (!first) return;
  if (doc?.activeElement === first) return;

  try {
    first.focus({ preventScroll: true });
  } catch (_) {
    first.focus();
  }
};

const enforceFocus = (event) => {
  if (!state.open || !launcher) return;
  const target = event?.target;
  if (!target) return;
  if (launcher.contains(target)) return;
  if (isToastFocus(target)) return;
  if (isToastVisible() && toast && !toast.contains(target)) {
    focusFirstElement();
    return;
  }
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
  if (launcher) launcher.classList.remove('is-toast-open');
  if (!toast) {
    toastPrevFocus = null;
    return;
  }

  const wasVisible = isToastVisible();
  toast.hidden = true;
  toast.setAttribute('aria-hidden', 'true');
  toast.removeAttribute('tabindex');

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

const endLockSequence = (lockEl, launcherEl) => {
  if (!lockEl || !launcherEl) return;
  lockEl.hidden = true;
  lockEl.setAttribute('aria-hidden', 'true');
  lockEl.classList.remove('is-on', 'is-off');
  lockEl.removeAttribute('tabindex');
  launcherEl.classList.remove('is-locking');
};

const attachLockGesture = (lockEl, resolve) => {
  let startY = null;
  const usePointer = typeof window !== 'undefined' && 'PointerEvent' in window;

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.buttons === 0) return;
    startY = event.clientY ?? event.touches?.[0]?.clientY ?? null;
  };

  const onPointerUp = (event) => {
    if (startY == null) return;
    const endY = event.clientY ?? event.changedTouches?.[0]?.clientY ?? null;
    if (endY == null) return;
    const delta = startY - endY;
    if (delta >= LOCK_SWIPE_THRESHOLD) {
      cleanup();
      resolve();
    }
  };

  const onPointerCancel = () => {
    startY = null;
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cleanup();
      resolve();
    }
  };

  const cleanup = () => {
    startY = null;
    if (usePointer) {
      lockEl.removeEventListener('pointerdown', onPointerDown);
      lockEl.removeEventListener('pointerup', onPointerUp);
      lockEl.removeEventListener('pointercancel', onPointerCancel);
    } else {
      lockEl.removeEventListener('touchstart', onPointerDown);
      lockEl.removeEventListener('touchend', onPointerUp);
    }
    lockEl.removeEventListener('keydown', onKeyDown);
  };

  if (usePointer) {
    lockEl.addEventListener('pointerdown', onPointerDown);
    lockEl.addEventListener('pointerup', onPointerUp);
    lockEl.addEventListener('pointercancel', onPointerCancel);
  } else {
    lockEl.addEventListener('touchstart', onPointerDown, { passive: true });
    lockEl.addEventListener('touchend', onPointerUp);
  }
  lockEl.addEventListener('keydown', onKeyDown);

  return cleanup;
};

const runUnlockSequence = () => {
  const token = ++unlockToken;

  if (!launcher || !lock) return Promise.resolve();

  // Kill any previous gesture / timers and clear stale classes.
  if (lockGestureCleanup) {
    lockGestureCleanup();
    lockGestureCleanup = null;
  }
  if (unlockCleanupTimer) {
    clearTimeout(unlockCleanupTimer);
    unlockCleanupTimer = null;
  }

  hideToast(false);
  endLockSequence(lock, launcher); // ensure no stale is-locking/visibility

  updateLockText();

  launcher.classList.add('is-locking');

  lock.classList.remove('is-on', 'is-off');
  lock.hidden = false;
  lock.setAttribute('aria-hidden', 'false');
  lock.setAttribute('tabindex', '0');

  // Slight async to let styles apply before we flip it "on"
  return new Promise((resolve) => {
    const finish = () => {
      if (token !== unlockToken) return; // superseded by a newer run
      if (unlockCleanupTimer) {
        clearTimeout(unlockCleanupTimer);
        unlockCleanupTimer = null;
      }
      if (lockGestureCleanup) {
        lockGestureCleanup();
        lockGestureCleanup = null;
      }
      endLockSequence(lock, launcher);
      resolve();
    };

    // Attach gesture (swipe up / keyboard) that calls finish() when it succeeds.
    lockGestureCleanup = attachLockGesture(lock, finish);

    // Auto-unlock after the configured duration as a safety + spec match.
    unlockCleanupTimer = window.setTimeout(finish, LOCKSCREEN_DURATION_MS);

    // Turn the lock "on" for real.
    requestAnimationFrame(() => {
      if (token !== unlockToken) return;
      lock.classList.add('is-on');
    });
  });
};

const openApp = async (appId = 'home', sourceButton = null, opts = {}) => {
  const token = ++navToken;

  if (appId === 'home') {
    setAppView('home');
    if (!state.open) await openLauncher('home', { unlock: false });
    return token === navToken;
  }

  if (appId === 'locked') {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token === navToken) showLockedToast('Access Restricted.');
    return false;
  }

  const targetApp = getAppMeta(appId);

  if (!targetApp) {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token === navToken) showLockedToast('App content not found.');
    return false;
  }

  // Special bridge: "Player Tools" faux app should open the existing tray
  if (targetApp.id === 'playerTools') {
    closeLauncher();
    window.setTimeout(() => {
      try {
        if (typeof window.openPlayerToolsDrawer === 'function') {
          window.openPlayerToolsDrawer();
        } else if (typeof openPlayerToolsDrawer === 'function') {
          openPlayerToolsDrawer();
        }
      } catch (_) {
        // Fail silently – worst case the user hits the original tab
      }
    }, 80);
    return true;
  }

  if (targetApp.action) {
    if (!state.open) {
      const unlockPromise = openLauncher('home', { unlock: opts.unlock });
      await Promise.resolve(unlockPromise);
    }

    if (token !== navToken) return false;

    if (isMenuActionBlocked()) {
      showLockedToast('Finish setup before opening tools.');
      return false;
    }

    setAppView('home');
    closeLauncher();
    requestAnimationFrame(() => dispatchMenuAction(targetApp.action));
    return true;
  }

  if (!canOpenApp(targetApp)) {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token === navToken)
      showLockedToast('That app is locked. Ask your DM to enable it.');
    return false;
  }

  let unlockPromise = Promise.resolve();
  if (!state.open) {
    unlockPromise = openLauncher('home', { unlock: opts.unlock });
    await Promise.resolve(unlockPromise);
  }

  if (token !== navToken) return false;

  await new Promise((resolve) => requestAnimationFrame(resolve));
  await unlockPromise;

  if (token !== navToken) return false;

  const label = getAppLabel(appId);
  await runBoot(sourceButton, label);

  if (token !== navToken) return false;

  if (mountedFragment && portal) {
    portal.restore(mountedFragment);
  }

  mountedFragment = null;
  mountedAppId = null;

  const fragmentId = targetApp?.fragment || appId;
  const fragment = doc?.querySelector(`[data-pt-app-fragment="${fragmentId}"]`);

  if (!fragment || !appHost || !portal) {
    if (!state.open) await openLauncher('home', { unlock: false });
    if (token === navToken) {
      showLockedToast('App content not found.');
      setAppView('home');
    }
    return false;
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

  return true;
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
  if (lockGestureCleanup) {
    lockGestureCleanup();
    lockGestureCleanup = null;
  }
  if (unlockCleanupTimer) clearTimeout(unlockCleanupTimer);
  unlockToken += 1;
  unlockCleanupTimer = null;
  const tab = doc?.getElementById('player-tools-tab');
  const focusTarget = state.lastFocused && doc?.contains(state.lastFocused) ? state.lastFocused : tab;
  if (focusTarget && typeof focusTarget.focus === 'function') {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (_) {
      focusTarget.focus();
    }
  }
  if (lock) endLockSequence(lock, launcher);
  launcher.setAttribute('aria-hidden', 'true');
  launcher.hidden = true;
  launcher.classList.remove('is-open', 'is-locking', 'is-toast-open');
  doc?.removeEventListener('keydown', handleKeydown, true);
  doc?.removeEventListener('focusin', enforceFocus, true);
  if (backButton) backButton.setAttribute('tabindex', '-1');
  if (closeButton) closeButton.setAttribute('tabindex', '-1');
  if (tab) tab.setAttribute('aria-expanded', 'false');
};

const openLauncher = (nextApp = 'home', opts = {}) => {
  if (launcher?.dataset?.ptMount !== 'phone') {
    if (!mountLauncher()) return Promise.resolve(false);
  }

  ensureLauncherWired();

  launcher.classList.remove('is-locking', 'is-toast-open');

  setPhoneOwnedByOS(true);

  const target = normalizeAppId(nextApp);
  const shouldUnlock = opts?.unlock === true;

  // If already open, still show lockscreen when explicitly requested (Player Tools tray).
  if (launcher && state.open) {
    setAppView(target);
    if (!shouldUnlock) return Promise.resolve(true);
    return runUnlockSequence().then(() => {
      if (state.open) focusFirstElement();
      return true;
    });
  }

  if (!launcher) return Promise.resolve(false);

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

  const unlockPromise = shouldUnlock ? runUnlockSequence() : Promise.resolve();

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

  return unlockPromise.then(() => true);
};

if (typeof window !== 'undefined') {
  window.addEventListener('cc:player-tools-drawer-open', () => {
    // Show lockscreen every time tray opens, without changing the current faux app.
    openLauncher(state.app || 'home', { unlock: true });
  });
}

const handleScrimClick = (event) => {
  if (event?.target === scrim) closeLauncher();
};

const handleLauncherActivate = (event) => {
  if (!launcher) return;

  const targetEl = event?.target?.closest?.('[data-pt-app-target]');
  if (!targetEl || !launcher.contains(targetEl)) return;

  const eventTs =
    typeof event?.timeStamp === 'number' && event.timeStamp > 0 ? event.timeStamp : nowTs();
  if (eventTs - lastLauncherActivationTs < LAUNCHER_ACTIVATE_DEBOUNCE_MS) return;

  lastLauncherActivationTs = eventTs;

  event.preventDefault();
  event.stopPropagation();

  const target = targetEl.getAttribute('data-pt-app-target') || 'home';
  openApp(target, targetEl);
};

const handleLauncherKeyActivate = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const targetEl = event?.target?.closest?.('[data-pt-app-target]');
  if (!targetEl) return;

  event.preventDefault();
  event.stopPropagation();

  const target = targetEl.getAttribute('data-pt-app-target') || 'home';
  openApp(target, targetEl);
};

const wireAppButtons = () => {
  if (!launcher) return;

  launcher.querySelectorAll('[data-pt-app-target]').forEach((el) => {
    const tag = (el.tagName || '').toLowerCase();
    const isNative = tag === 'button' || tag === 'a';
    if (!isNative) {
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    }
  });

  launcher.addEventListener('pointerup', handleLauncherActivate, true);
  launcher.addEventListener('keydown', handleLauncherKeyActivate, true);

  if (backButton) backButton.addEventListener('click', () => openApp('home'));
};

const ensureLauncherWired = () => {
  if (!launcher || launcherWired) return;
  wireActions();
  wireAppButtons();
  launcherWired = true;
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
  ensureLauncherWired();
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

const start = () => {
  if (window.PlayerOS?.openLauncher) return;
  init();
};

if (doc) {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(start);
    } else {
      Promise.resolve().then(start);
    }
    setTimeout(start, 0);
  } else {
    start();
  }
}
