import { Router } from '../core/router.js';
import { createHomeScreen, updateLockTime } from './homeScreen.js';
import { MainMenu } from './mainMenu.js';

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function shouldStartLocked() {
  return !!document?.body?.classList?.contains('launching');
}

export class PhoneOS {
  constructor(store) {
    this.store = store;
    this.root = null;
    this.view = 'lock';
    this.router = null;
    this.homeScreen = null;
    this.mainMenu = new MainMenu(store);
    this.ptReady = !shouldStartLocked();
    this.queuedOpen = false;

    this.glass = document.querySelector('.pt-screen__glass');
    this.lockView = null;
    this.homeView = null;
    this.appView = null;
    this.appHost = null;
    this.appTitle = null;
  }

  mount(mountNode) {
    if (!mountNode) return;
    this.root = mountNode;
    this.root.innerHTML = '';

    const status = document.createElement('div');
    status.className = 'pt-phone__status';
    status.innerHTML = `
      <span>Player OS</span>
      <span aria-hidden="true">✦ 5G</span>
    `;

    const pill = document.createElement('div');
    pill.className = 'pt-phone__pill';

    const content = document.createElement('div');
    content.className = 'pt-phone__content';

    const lockView = document.createElement('section');
    lockView.className = 'pt-view pt-lock';
    lockView.dataset.ptView = 'lock';
    lockView.innerHTML = `
      <div class="time" data-pt-lock-time></div>
      <div class="date" data-pt-lock-date></div>
      <button class="hint" type="button" data-pt-lock-unlock>Tap to unlock</button>
    `;

    const homeView = createHomeScreen(this.store);
    homeView.classList.add('pt-view');
    homeView.dataset.ptView = 'home';

    const appView = document.createElement('section');
    appView.className = 'pt-app-host';
    appView.dataset.ptView = 'app';
    appView.hidden = true;
    appView.setAttribute('aria-hidden', 'true');
    appView.innerHTML = `
      <div class="pt-app-frame">
        <div class="pt-app-topbar">
          <button type="button" data-pt-app-home>Home</button>
          <div class="title" data-pt-app-title>Player OS</div>
          <button type="button" data-pt-open-menu>Menu</button>
        </div>
        <div class="pt-app-body" data-pt-app-host></div>
      </div>
    `;

    content.append(lockView, homeView, appView);
    this.root.append(status, pill, content, this.mainMenu.el, this.buildBezel());

    this.lockView = lockView;
    this.homeView = homeView;
    this.appView = appView;
    this.appHost = appView.querySelector('[data-pt-app-host]');
    this.appTitle = appView.querySelector('[data-pt-app-title]');
    this.router = new Router(this.appHost);

    this.mainMenu.mount();
    this.bindEvents();
    this.setView('lock');
    this.syncClock();

    // Readiness signals: keep PhoneOS inert during the launch animation, then unlock.
    window.addEventListener('cc:pt-ready', () => this.setInteractive(true));
    window.addEventListener('cc:launch-sequence-complete', () => this.setInteractive(true));
    window.addEventListener('cc:pt-lock', () => this.setInteractive(false));

    nextFrame().then(() => {
      if (!this.ptReady && !shouldStartLocked()) this.setInteractive(true);
    });
    setTimeout(() => {
      if (!this.ptReady && !shouldStartLocked()) this.setInteractive(true);
    }, 1800);
  }

  buildBezel() {
    const bezel = document.createElement('div');
    bezel.className = 'pt-phone__bezel';
    return bezel;
  }

  bindEvents() {
    if (!this.root) return;

    this.root.addEventListener('click', (event) => {
      const target = event.target;
      if (!target) return;

      if (target.closest('[data-pt-lock-unlock]')) {
        event.preventDefault();
        this.setView('home');
        return;
      }

      const open = target.closest('[data-pt-open-app]')?.getAttribute('data-pt-open-app');
      if (open) {
        event.preventDefault();
        this.store?.dispatch?.({ type: 'NAVIGATE', payload: { route: open } });
        return;
      }

      if (target.closest('[data-pt-open-menu]')) {
        event.preventDefault();
        this.store?.dispatch?.({ type: 'OPEN_MAIN_MENU' });
        return;
      }

      if (target.closest('[data-pt-app-home]')) {
        event.preventDefault();
        this.store?.dispatch?.({ type: 'NAVIGATE', payload: { route: 'home' } });
        return;
      }
    });

    const floatingTab = document.getElementById('player-tools-tab');
    if (floatingTab) {
      floatingTab.addEventListener('click', (event) => {
        event.preventDefault();
        this.store?.dispatch?.({ type: 'OPEN_MAIN_MENU' });
      });
    }

    if (this.glass) {
      this.glass.addEventListener('click', () => {
        this.store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
      });
    }
  }

  syncClock() {
    const dateEl = this.lockView?.querySelector('[data-pt-lock-date]');
    const timeEl = this.lockView?.querySelector('[data-pt-lock-time]');
    updateLockTime(dateEl, timeEl);
    setInterval(() => updateLockTime(dateEl, timeEl), 10_000);
  }

  setInteractive(on) {
    this.ptReady = on;
    const targets = [this.lockView, this.homeView, this.appView];
    targets.forEach((node) => {
      if (!node) return;
      node.style.pointerEvents = on ? 'auto' : 'none';
    });

    if (on && this.queuedOpen) {
      this.queuedOpen = false;
      this.store?.dispatch?.({ type: 'OPEN_MAIN_MENU' });
    }
  }

  setView(view) {
    this.view = view;
    this.toggleView(this.lockView, view === 'lock');
    this.toggleView(this.homeView, view === 'home');
    this.toggleView(this.appView, view === 'app');
  }

  toggleView(node, isVisible) {
    if (!node) return;
    node.hidden = !isVisible;
    node.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
  }

  navigate(route) {
    const target = String(route || 'home');
    if (!target || target === 'home') {
      this.setView('home');
      return;
    }

    this.router?.navigate(target);
    if (this.appTitle) {
      this.appTitle.textContent = this.labelForRoute(target);
    }
    this.setView('app');
  }

  labelForRoute(route) {
    const label = this.root?.querySelector(`[data-pt-open-app="${route}"]`)?.getAttribute('data-pt-app-label');
    if (label) return label;
    return route.charAt(0).toUpperCase() + route.slice(1);
  }

  updateOverlays() {
    const overlays = this.store?.getState?.().overlays || [];
    const hasMenu = overlays.some((entry) => entry.type === 'mainMenu');

    if (hasMenu) {
      if (!this.ptReady) {
        this.queuedOpen = true;
        return;
      }
      this.mainMenu.open();
      this.glass?.classList?.add('on');
    } else {
      this.mainMenu.close();
      this.glass?.classList?.remove('on');
    }
  }
}
