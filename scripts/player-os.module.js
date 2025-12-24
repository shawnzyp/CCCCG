import { createAppController } from './core/appController.js';

export function initPlayerOSModule() {
  try { window.__CCCG_APP_CONTROLLER_BOOTING__ = true; } catch {}
  let readyFired = false;
  const launcher = document.querySelector('[data-pt-launcher]');
  if (!launcher) {
    try { console.warn('Player OS: [data-pt-launcher] not found in DOM'); } catch {}
    try { window.__CCCG_APP_CONTROLLER_BOOTING__ = false; } catch {}
    return;
  }
  try {
    launcher.hidden = false;
    launcher.classList?.remove?.('hidden');
    launcher.style?.removeProperty?.('display');
    launcher.setAttribute?.('aria-hidden', 'false');
  } catch {}

  // Prefer the modal host inside the launcher first (critical).
  const overlayRoot =
    launcher.querySelector('[data-pt-modal-host]') ||
    document.querySelector('[data-pt-modal-host]');

  const controller = createAppController({ appRoot: launcher, overlayRoot });
  window.__APP_STORE__ = controller.store;
  window.__CCCG_APP_CONTROLLER__ = controller;
  try { window.__CCCG_APP_CONTROLLER_BOOTING__ = false; } catch {}
  window.PlayerOSReady = false;

  try { window.dispatchEvent(new CustomEvent('cc:pt-controller-ready')); } catch {}

  // Legacy drawer API compatibility (no crashes, route into controller).
  try {
    window.openPlayerToolsDrawer = () => controller.store.dispatch({ type: 'NAVIGATE', route: 'playerTools' });
    window.closePlayerToolsDrawer = () => controller.store.dispatch({ type: 'NAVIGATE', route: 'home' });
    window.subscribePlayerToolsDrawer = () => () => {};
  } catch {}

  // Consolidation: Main Menu opens PhoneOS menu only, never legacy drawer.
  try {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      if (target.closest?.('#player-tools-gesture-exit')) {
        e.preventDefault?.();
        e.stopPropagation?.();
        controller.store.dispatch({ type: 'NAVIGATE', route: 'home' });
        return;
      }
      const opener = target.closest?.(
        '[aria-controls="player-tools-drawer"], [data-pt-open-drawer], #player-tools-toggle, #player-tools-button'
      );
      if (!opener) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      controller.store.dispatch({ type: 'OPEN_MAIN_MENU' });
    }, { capture: true });
  } catch {}

  // Route legacy menu-action events into controller navigation.
  try {
    window.addEventListener('cc:menu-action', (event) => {
      const action = event?.detail?.action;
      if (!action) return;
      const map = {
        'campaign-log': 'campaignLog',
        'credits-ledger': 'creditsLedger',
        rules: 'rules',
        help: 'help',
        messages: 'messages',
        'load-save': 'loadSave',
        settings: 'settings',
        'player-tools': 'playerTools',
      };
      const route = map[action] || action;
      controller.store.dispatch({ type: 'NAVIGATE', route });
      try { event.preventDefault?.(); } catch {}
      try { event.stopImmediatePropagation?.(); } catch {}
      try { event.stopPropagation?.(); } catch {}
    }, true);
  } catch {}

  try {
    launcher.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-pt-open-app]');
      if (!btn) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      const appId = btn.getAttribute('data-pt-open-app');
      if (!appId) return;
      const meta = window.APP_REGISTRY ? window.APP_REGISTRY[appId] : null;
      const route = meta?.route ? String(meta.route) : String(appId);
      controller.store.dispatch({ type: 'NAVIGATE', route });
    }, { capture: true });
  } catch {}

  try { controller.phone?.showLauncher?.(); } catch {}
  try { controller.phone?.setView?.('lock', null); } catch {}

  try { controller.overlays?.ensureBackdropPrepaint?.(); } catch {}
  queueMicrotask(() => {
    try { controller.store.dispatch({ type: 'INTRO_DONE' }); } catch {}
  });

  controller.store.subscribe((state) => {
    if (state.phase === 'PHONE_OS') {
      window.PlayerOSReady = true;
      if (!readyFired) {
        readyFired = true;
        try { window.dispatchEvent(new CustomEvent('cc:pt-welcome-dismissed')); } catch {}
      }
    }
  });
}
