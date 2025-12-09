import { open as openPlayerToolsDrawer } from './player-tools-drawer.js';

const doc = typeof document !== 'undefined' ? document : null;
const root = doc?.documentElement || null;
const launcher = doc?.getElementById('ptLauncher') || null;
const scrim = launcher?.querySelector('[data-pt-launcher-scrim]') || null;
const homeView = launcher?.querySelector('[data-pt-launcher-home]') || null;
const appView = launcher?.querySelector('[data-pt-launcher-app]') || null;
const appTitle = launcher?.querySelector('[data-pt-launcher-app-title]') || null;
const backButton = launcher?.querySelector('[data-pt-launcher-back]') || null;
const closeButton = launcher?.querySelector('[data-pt-launcher-close]') || null;

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

const APP_LABELS = Object.freeze({
  playerTools: 'Player Tools',
  shards: 'Shards of Many Fates',
  messages: 'Director’s Messages',
  settings: 'Settings',
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

const getFocusable = () => {
  if (!launcher) return [];
  return Array.from(launcher.querySelectorAll(focusableSelector)).filter((el) => {
    if (el.closest('[hidden]')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
};

const focusFirstElement = () => {
  const target =
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
  if (launcher.contains(event.target)) return;
  event.stopPropagation();
  focusFirstElement();
};

const handleKeydown = (event) => {
  if (!state.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
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

const setAppView = (nextApp = 'home') => {
  state.app = nextApp;
  if (!homeView || !appView) return;
  const isHome = nextApp === 'home';
  homeView.hidden = !isHome;
  appView.hidden = isHome;
  if (appTitle) {
    appTitle.textContent = isHome ? '' : APP_LABELS[nextApp] || nextApp;
  }
  const panels = Array.from(appView.querySelectorAll('[data-pt-view]'));
  panels.forEach((panel) => {
    panel.hidden = panel.getAttribute('data-pt-view') !== nextApp;
  });
};

const closeLauncher = () => {
  if (!launcher || !state.open) return;
  state.open = false;
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

const openLauncher = (nextApp = 'home') => {
  if (!launcher || state.open) {
    setAppView(nextApp);
    return;
  }
  state.lastFocused = doc?.activeElement || null;
  state.open = true;
  setAppView(nextApp);
  launcher.hidden = false;
  launcher.setAttribute('aria-hidden', 'false');
  launcher.classList.add('is-open');
  doc?.addEventListener('keydown', handleKeydown, true);
  doc?.addEventListener('focusin', enforceFocus, true);
  if (backButton) backButton.removeAttribute('tabindex');
  if (closeButton) closeButton.removeAttribute('tabindex');
  const tab = doc?.getElementById('player-tools-tab');
  if (tab) tab.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    if (launcher) {
      try {
        launcher.focus({ preventScroll: true });
      } catch (_) {
        launcher.focus();
      }
    }
    focusFirstElement();
  });
};

const handleScrimClick = (event) => {
  if (event?.target === scrim) closeLauncher();
};

const wireAppButtons = () => {
  if (!launcher) return;
  const appButtons = launcher.querySelectorAll('[data-pt-app-target]');
  appButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-pt-app-target') || 'home';
      if (target === 'home') {
        setAppView('home');
      } else {
        setAppView(target);
      }
      if (!state.open) openLauncher(target);
    });
  });
  if (backButton) {
    backButton.addEventListener('click', () => setAppView('home'));
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
        openLauncher('home');
      },
      true
    );
  }
  if (scrim) scrim.addEventListener('click', handleScrimClick);
  if (closeButton) closeButton.addEventListener('click', closeLauncher);
  const quickTrayBtn = launcher?.querySelector('[data-pt-open-quick-tray]');
  if (quickTrayBtn) {
    quickTrayBtn.addEventListener('click', () => {
      closeLauncher();
      setTimeout(() => openPlayerToolsDrawer(), 50);
    });
  }
  const shardBtn = launcher?.querySelector('[data-pt-open-shards]');
  if (shardBtn) {
    shardBtn.addEventListener('click', () => {
      closeLauncher();
      const drawBtn = doc?.getElementById('somf-min-draw');
      if (drawBtn && typeof drawBtn.click === 'function') {
        drawBtn.click();
      }
    });
  }
  const themeBtn = launcher?.querySelector('[data-pt-theme-next]');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const themeToggle = doc?.querySelector('[data-theme-toggle]');
      if (themeToggle && typeof themeToggle.click === 'function') {
        themeToggle.click();
      }
    });
  }
  const reduceMotionToggle = launcher?.querySelector('[data-pt-reduce-motion]');
  if (reduceMotionToggle) {
    reduceMotionToggle.addEventListener('change', (event) => {
      setSetting('reduceMotion', event.target.checked);
    });
  }
  const hideTickerToggle = launcher?.querySelector('[data-pt-hide-tickers]');
  if (hideTickerToggle) {
    hideTickerToggle.addEventListener('change', (event) => {
      setSetting('hideTickers', event.target.checked);
    });
  }
};

const init = () => {
  syncSettings();
  wireAppButtons();
  wireActions();
  window.PlayerOS = Object.assign(window.PlayerOS || {}, { openLauncher });
};

if (launcher && doc) {
  init();
}
