import { Router } from '../core/router.js';
import { createHomeScreen } from './homeScreen.js';
import { MainMenu } from './mainMenu.js';

const AUTO_UNLOCK_MS = 1750;

function isLocked(appId) {
  return String(appId || '').trim() === 'locked';
}

function normalizeAppId(appId) {
  if (appId === 'shards' && window.perms && window.perms.shardsUnlocked === false) {
    return 'locked';
  }
  return appId;
}

function emitLaunch(appId) {
  try {
    window.dispatchEvent(new CustomEvent('cc:pt-launched', { detail: { appId, source: 'player-os' } }));
  } catch {}
}

export class PhoneOS {
  constructor({ appRoot, store } = {}) {
    this.root = appRoot || null;
    this.store = store || null;
    this.glass = this.root?.closest?.('.pt-screen__glass') || null;
    this.view = 'lock';
    this.app = null;
    this.autoUnlockTimer = null;
    this.ptReady = false;
    this.queuedOpen = false;
    this.queuedNextView = null;

    this.lockView = this.root?.querySelector('[data-pt-lock-screen]') || null;
    this.homeView = this.root?.querySelector('[data-pt-launcher-home]') || null;
    this.appView = this.root?.querySelector('[data-pt-launcher-app]') || null;
    this.appHost = this.root?.querySelector('[data-pt-app-host]') || null;
    this.toastEl = this.root?.querySelector('[data-pt-ios-toast]') || null;
    this.backButton = this.root?.querySelector('[data-pt-launcher-back]') || null;
    this.homeButton = this.root?.querySelector('[data-pt-launcher-home-btn]') || null;
    this.appTitleEl = this.root?.querySelector('[data-pt-launcher-app-title]') || null;
    this.headerTitle = document.getElementById('ptLauncherTitle');
    this.launcherTab = document.getElementById('player-tools-tab');

    this.homeScreen = createHomeScreen({ root: this.root });
    this.router = new Router({ root: this.appHost });
    this.mainMenu = new MainMenu({ root: this.root?.querySelector('#pt-main-menu') || null, appHost: this.appHost });
  }

  mount() {
    if (!this.root) return;
    this.bindEvents();
    this.setView('lock', null);
    this.homeScreen.updateLockTime();
    setInterval(() => this.homeScreen.updateLockTime(), 15000);
    this.syncPhoneOpenFlags();

    const api = {
      openLauncher: (nextView) => this.openLauncher(nextView),
      closeLauncher: () => this.closeLauncher(),
      openApp: (appId) => this.openApp(appId),
      setView: (view, appId) => this.setView(view, appId),
      getState: () => ({ view: this.view, app: this.app }),
      goHome: () => this.handleHome(),
    };

    const mergedApi = { ...(window.PlayerOS || {}), ...api };
    window.PlayerOS = mergedApi;
    window.PlayerLauncher = mergedApi;
  }

  bindEvents() {
    if (!this.root) return;

    this.root.addEventListener(
      'pointerup',
      (event) => {
        if (this.root.hidden || this.root.getAttribute('aria-hidden') === 'true') return;
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;
        const unlockBtn = target.closest('[data-pt-lock-unlock]');
        if (unlockBtn) {
          event.preventDefault?.();
          event.stopPropagation?.();
          this.handleUnlock();
        }
      },
      { capture: true }
    );

    this.root.addEventListener(
      'pointerup',
      (event) => {
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      const open = target.closest('[data-pt-open-app]')?.getAttribute('data-pt-open-app');
      if (open) {
        event.preventDefault?.();
        this.store?.dispatch({ type: 'NAVIGATE', route: open });
        const overlays = this.store?.getState?.().overlays || [];
        if (overlays.some((entry) => entry.type === 'mainMenu')) {
          this.store?.dispatch({ type: 'CLOSE_OVERLAY' });
        }
      }

      const menu = target.closest('[data-pt-open-menu]');
      if (menu) {
        event.preventDefault?.();
        this.store?.dispatch({ type: 'OPEN_MAIN_MENU' });
      }
      },
      { capture: true }
    );

    document.addEventListener('pointerup', (event) => {
      if (document.documentElement.getAttribute('data-pt-phone-open') !== '1') return;

      const target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      const openBtn = target.closest('[data-pt-open-modal]');
      if (openBtn) {
        event.preventDefault?.();
        const id = openBtn.getAttribute('data-pt-open-modal');
        if (id) {
          try {
            window.dispatchEvent(new CustomEvent('cc:pt-open-modal', { detail: { id } }));
          } catch {}
        }
        return;
      }
    }, { capture: true });

    window.addEventListener('cc:pt-launch', (event) => {
      const rawAppId = String(event?.detail?.appId || '').trim();
      if (!rawAppId) return;
      const normalized = normalizeAppId(rawAppId);
      if (isLocked(normalized)) {
        emitLaunch('locked');
        return;
      }
      this.openApp(normalized);
      this.closeLauncher();
    });

    if (this.backButton) {
      this.backButton.addEventListener('click', () => this.handleBack());
    }

    if (this.homeButton) {
      this.homeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.handleHome();
      });
    }

    this.mainMenu.bind(this.store);

    document.querySelectorAll('[data-pt-launcher-open]').forEach((btn) => {
      btn.addEventListener(
        'pointerdown',
        () => {
          requestAnimationFrame(() => this.openLauncher());
        },
        { capture: true }
      );
    });

    document.querySelectorAll('[data-pt-launcher-close]').forEach((btn) => {
      btn.addEventListener(
        'pointerdown',
        () => {
          requestAnimationFrame(() => this.closeLauncher());
        },
        { capture: true }
      );
    });
  }

  setInteractive(on) {
    this.ptReady = on;
    if (!this.root) return;
    const targets = [this.lockView, this.homeView, this.appView];
    targets.forEach((node) => {
      if (!node) return;
      node.style.pointerEvents = on ? 'auto' : 'none';
    });

    if (on && this.queuedOpen) {
      const next = this.queuedNextView;
      this.queuedOpen = false;
      this.queuedNextView = null;
      this.performOpenLauncher(next);
    }
  }

  showMainMenu() {
    if (!this.appView) return;
    this.clearAutoUnlock();
    try { document.documentElement.setAttribute('data-pt-phone-open', '1'); } catch {}
    if (this.isLauncherHidden()) this.showLauncher();
    this.setView('app', null);
    this.mainMenu.show();
  }

  hideMainMenu() {
    this.mainMenu.hide();
  }

  navigate(route) {
    const raw = String(route || 'home').trim();

    if (!raw || raw === 'home') {
      this.setView('home', null);
      if (this.isLauncherHidden()) this.showLauncher();
      return;
    }

    if (raw.startsWith('tab:')) {
      const tabId = raw.slice(4).trim();
      if (tabId) {
        const selector = typeof CSS !== 'undefined' && CSS.escape
          ? `.tab[data-go="${CSS.escape(tabId)}"]`
          : `.tab[data-go="${tabId}"]`;
        const tab = document.querySelector(selector);
        if (tab && typeof tab.click === 'function') {
          tab.click();
        }
      }
      this.closeLauncher();
      return;
    }

    if (raw.startsWith('panel:')) {
      const panel = raw.slice(6).trim();
      if (panel === 'sync') {
        const trigger = document.querySelector('[data-sync-status-trigger]') || document.getElementById('sync-status-trigger');
        if (trigger && typeof trigger.click === 'function') {
          trigger.click();
        }
        this.closeLauncher();
        return;
      }
    }

    if (raw.startsWith('modal:')) {
      const modal = raw.slice(6).trim();
      if (modal === 'shards') {
        emitLaunch('shards');
        this.closeLauncher();
        return;
      }
      if (modal) {
        try {
          window.dispatchEvent(new CustomEvent('cc:pt-open-modal', { detail: { id: `modal-${modal}` } }));
        } catch {}
      }
      this.closeLauncher();
      return;
    }

    const normalized = normalizeAppId(raw);

    if (!normalized || normalized === 'home') {
      this.setView('home', null);
      if (this.isLauncherHidden()) this.showLauncher();
      return;
    }

    if (isLocked(normalized)) {
      emitLaunch('locked');
      this.setView('home', null);
      return;
    }

    if (normalized === 'playerTools' || normalized === 'shards' || normalized === 'messages') {
      emitLaunch(normalized);
      this.closeLauncher();
      return;
    }

    this.router.navigate(normalized);
    this.showLauncher();
    this.setView('app', normalized);

    try {
      window.dispatchEvent(new CustomEvent('cc:pt-app-opened', { detail: { appId: normalized } }));
    } catch {}
  }

  openApp(appId) {
    this.navigate(appId);
  }

  showLauncher() {
    if (!this.root) return;
    this.root.hidden = false;
    this.root.style.removeProperty('display');
    this.root.setAttribute('aria-hidden', 'false');
    this.root.setAttribute('data-pt-launcher-visible', '1');
    this.syncPhoneOpenFlags();
    document.documentElement.classList.remove('pt-os-lock');
    this.setTabExpanded(true);

    if (this.glass) this.glass.setAttribute('data-pt-launcher-visible', '1');
    document.querySelectorAll('.pt-screen__glass[data-pt-launcher-visible=\"1\"]').forEach((node) => {
      if (node !== this.glass) node.removeAttribute('data-pt-launcher-visible');
    });
  }

  hideLauncher() {
    if (!this.root) return;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.display = 'none';
    this.root.hidden = true;
    this.root.removeAttribute('data-pt-launcher-visible');
    this.syncPhoneOpenFlags();
    this.setTabExpanded(false);

    if (this.glass) this.glass.removeAttribute('data-pt-launcher-visible');
    document.querySelectorAll('.pt-screen__glass[data-pt-launcher-visible=\"1\"]').forEach((node) => {
      node.removeAttribute('data-pt-launcher-visible');
    });
  }

  setTabExpanded(isOpen) {
    if (!this.launcherTab) return;
    this.launcherTab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  syncPhoneOpenFlags() {
    if (!this.root) return;
    const isOpen = this.isLauncherActuallyVisible(this.root);
    if (isOpen) {
      document.documentElement.setAttribute('data-pt-phone-open', '1');
    } else {
      document.documentElement.removeAttribute('data-pt-phone-open');
    }
  }

  isLauncherHidden() {
    if (!this.root) return true;
    return this.root.getAttribute('aria-hidden') === 'true' || this.root.hidden || this.root.style.display === 'none';
  }

  isLauncherActuallyVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none')) return false;
    return true;
  }

  setView(view, appId) {
    this.view = view;
    this.app = appId || null;

    this.homeScreen.updateLockTime();

    if (this.root) this.root.setAttribute('data-view', view);

    if (view !== 'lock') this.clearAutoUnlock();

    const isLock = view === 'lock';
    const isHome = view === 'home';
    const isApp = view === 'app';

    this.setLayerVisible(this.lockView, isLock);
    this.setLayerVisible(this.homeView, isHome);
    this.setLayerVisible(this.appView, isApp);

    if (!isApp) this.router.hideAll();

    if (this.appTitleEl) {
      this.appTitleEl.textContent = isApp && appId ? this.getAppLabel(appId) : '';
    }
    if (this.headerTitle) {
      this.headerTitle.textContent = isApp && appId ? this.getAppLabel(appId) : 'Player OS';
    }
  }

  setLayerVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
    el.style.display = visible ? '' : 'none';
    el.style.pointerEvents = visible ? 'auto' : 'none';
  }

  getAppLabel(appId) {
    if (!appId || !this.root) return '';
    const icon = this.root.querySelector('[data-pt-open-app="' + appId + '"]');
    if (icon) {
      const fromAttr = icon.getAttribute('data-pt-app-label');
      if (fromAttr) return fromAttr;
      const text = icon.textContent && icon.textContent.trim();
      if (text) return text;
    }
    return appId.charAt(0).toUpperCase() + appId.slice(1);
  }

  clearAutoUnlock() {
    if (this.autoUnlockTimer) {
      clearTimeout(this.autoUnlockTimer);
      this.autoUnlockTimer = null;
    }
  }

  scheduleAutoUnlock() {
    this.clearAutoUnlock();
    this.autoUnlockTimer = setTimeout(() => {
      this.autoUnlockTimer = null;
      if (this.view !== 'lock') return;
      if (this.root?.hidden) return;
      this.setView('home', null);
    }, AUTO_UNLOCK_MS);
  }

  handleUnlock() {
    this.clearAutoUnlock();
    this.setView('home', null);
  }

  handleBack() {
    this.setView('home', null);
  }

  handleHome() {
    this.app = null;
    this.router.hideAll();
    if (this.appTitleEl) this.appTitleEl.textContent = '';
    if (this.headerTitle) this.headerTitle.textContent = 'Player OS';
    this.setView('home', null);
  }

  performOpenLauncher(nextView) {
    this.showLauncher();
    this.setView('lock', null);
    this.scheduleAutoUnlock();

    if (!nextView || nextView === 'lock') {
      const state = this.store?.getState?.();
      if (state?.phase === 'PHONE_OS') {
        this.store?.dispatch({ type: 'OPEN_MAIN_MENU' });
      }
      return;
    }
    if (nextView === 'home') {
      this.setView('home', null);
      return;
    }
    this.openApp(nextView);
  }

  openLauncher(nextView) {
    if (!this.ptReady) {
      this.hideLauncher();
      this.queuedOpen = true;
      this.queuedNextView = nextView || null;
      return;
    }
    this.performOpenLauncher(nextView);
  }

  closeLauncher() {
    this.clearAutoUnlock();
    this.hideLauncher();
  }
}
