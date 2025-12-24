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

  try {
    launcher.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-pt-open-app]');
      if (!btn) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      const appId = btn.getAttribute('data-pt-open-app');
      if (!appId) return;
      controller.store.dispatch({ type: 'NAVIGATE', route: appId });
    }, { capture: true });
  } catch {}

  controller.store.dispatch({ type: 'BOOT_DONE' });
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
