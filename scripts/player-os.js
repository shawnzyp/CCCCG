import { createAppController } from './core/appController.js';

// Prevent legacy boot wiring from racing the controller.
try { window.__CCCG_APP_CONTROLLER_BOOTING__ = true; } catch {}

const init = () => {
  let readyFired = false;
  const launcher = document.querySelector('[data-pt-launcher]');
  if (!launcher) {
    console.warn('Player OS: [data-pt-launcher] not found in DOM');
    return;
  }

  // Prefer the modal host inside the launcher first (critical).
  const overlayRoot =
    launcher.querySelector('[data-pt-modal-host]') ||
    document.querySelector('[data-pt-modal-host]');
  const controller = createAppController({ appRoot: launcher, overlayRoot });

  window.__APP_STORE__ = controller.store;
  window.__CCCG_APP_CONTROLLER__ = controller;
  try { window.__CCCG_APP_CONTROLLER_BOOTING__ = false; } catch {}
  window.PlayerOSReady = false;
  try {
    window.dispatchEvent(new CustomEvent('cc:pt-controller-ready'));
  } catch {}

  controller.store.dispatch({ type: 'BOOT_DONE' });

  let introDoneScheduled = false;
  const scheduleIntroDone = () => {
    if (introDoneScheduled) return;
    introDoneScheduled = true;
    controller.overlays?.ensureBackdropPrepaint?.();
    controller.store.dispatch({ type: 'INTRO_DONE' });
    if (!document.getElementById('modal-pt-welcome')) {
      controller.store.dispatch({ type: 'WELCOME_ACCEPT' });
    }
  };

  const launchComplete = window.__ccLaunchComplete;
  if (launchComplete || !document.body?.classList?.contains('launching')) {
    scheduleIntroDone();
  } else {
    // Listen to all known launch completion event names.
    window.addEventListener('cc:launch:done', scheduleIntroDone, { once: true });
    window.addEventListener('cc:launch-complete', scheduleIntroDone, { once: true });
    window.addEventListener('cc:launch:complete', scheduleIntroDone, { once: true });

    // Also fire when body drops "launching".
    try {
      const body = document.body;
      if (body && typeof MutationObserver === 'function') {
        const obs = new MutationObserver(() => {
          if (!document.body?.classList?.contains('launching')) {
            obs.disconnect();
            scheduleIntroDone();
          }
        });
        obs.observe(body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch {}
  }

  setTimeout(() => {
    try {
      const state = controller.store.getState?.();
      if (!state || state.phase !== 'INTRO') return;
      const launching = !!document.body?.classList?.contains('launching');
      if (!launching) {
        scheduleIntroDone();
      }
    } catch {}
  }, 2500);

  const welcomeModal = document.getElementById('modal-pt-welcome');
  if (welcomeModal) {
    welcomeModal.addEventListener('click', (event) => {
      const action = event.target.closest('[data-pt-modal-close]');
      if (action) {
        controller.store.dispatch({ type: 'WELCOME_ACCEPT' });
      }
    });
  }

  controller.store.subscribe((state) => {
    if (state.phase === 'PHONE_OS') {
      window.PlayerOSReady = true;
      if (!readyFired) {
        readyFired = true;
        try {
          window.dispatchEvent(new CustomEvent('cc:pt-welcome-dismissed'));
        } catch {}
      }
    }
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
