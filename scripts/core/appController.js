import { createStore } from './store.js';
import { OverlayManager } from '../ui/overlayManager.js';
import { PhoneOS } from '../os/phoneOS.js';

function hardUnlockUI(reason = 'controller') {
  try { document.body?.classList?.remove?.('touch-controls-disabled', 'modal-open', 'launching'); } catch {}
  try { document.documentElement?.setAttribute?.('data-pt-touch-locked', '0'); } catch {}
  // Clean up any stale legacy marker that might remain in cached DOM sessions.
  try { document.documentElement?.removeAttribute?.('data-pt-drawer-open'); } catch {}
  try {
    document.querySelectorAll?.('[inert]').forEach((el) => {
      try { el.inert = false; } catch {}
      try { el.removeAttribute('inert'); } catch {}
    });
  } catch {}
  try {
    const launchEl = document.getElementById('launch-animation');
    if (launchEl) {
      try { launchEl.hidden = true; } catch {}
      try { launchEl.style.display = 'none'; } catch {}
      try { launchEl.style.pointerEvents = 'none'; } catch {}
      try { launchEl.setAttribute('aria-hidden', 'true'); } catch {}
    }
  } catch {}
  try {
    const shell = document.querySelector?.('[data-launch-shell]');
    if (shell) {
      try { shell.style.pointerEvents = ''; } catch {}
      try { shell.style.visibility = ''; } catch {}
      try { shell.style.opacity = ''; } catch {}
      try { shell.inert = false; } catch {}
      try { shell.removeAttribute('inert'); } catch {}
    }
  } catch {}
  try {
    if (typeof globalThis.safeUnlockTouchControls === 'function') {
      globalThis.safeUnlockTouchControls({ immediate: true, reason });
    } else if (typeof globalThis.unlockTouchControls === 'function') {
      globalThis.unlockTouchControls({ immediate: true, reason });
    }
  } catch {}
}

// Controller mode should always force the UI usable.

function showNode(node) {
  if (!node) return false;
  try { node.classList.remove('hidden'); } catch {}
  try { node.hidden = false; } catch {}
  try { node.style.display = ''; } catch {}
  try { node.style.removeProperty('display'); } catch {}
  try { node.setAttribute('aria-hidden', 'false'); } catch {}
  return true;
}

const initialState = { phase: 'PHONE_OS', overlays: [], route: 'home' };

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN_MAIN_MENU':
      if (state.phase !== 'PHONE_OS') return state;
      if (state.overlays[state.overlays.length - 1]?.type === 'mainMenu') return state;
      return { ...state, overlays: [...state.overlays, { type: 'mainMenu' }] };
    case 'CLOSE_OVERLAY':
      return { ...state, overlays: state.overlays.slice(0, -1) };
    case 'NAVIGATE':
      if (state.phase !== 'PHONE_OS') return state;
      return { ...state, route: action.payload?.route || action.route };
    default:
      return state;
  }
}

export function createAppController({ appRoot, overlayRoot } = {}) {
  const store = createStore(initialState, reducer);
  const phone = new PhoneOS({ appRoot, store });
  hardUnlockUI('controller-init');
  try { showNode(appRoot); } catch {}
  const overlayRegistry = {
    mainMenu: {
      show: () => {
        phone.showMainMenu();
      },
      hide: () => {
        phone.hideMainMenu();
      },
      focusRoot: () => appRoot?.querySelector?.('#pt-main-menu') || document.getElementById('pt-main-menu'),
    },
  };

  const overlays = new OverlayManager({ appRoot, overlayRoot, overlays: overlayRegistry, store });

  let phoneMounted = false;

  store.subscribe((state) => {
    if (!phoneMounted) {
      phone.mount();
      phoneMounted = true;
    }

    phone.setInteractive(true);
    hardUnlockUI('controller-tick');

    overlays.render(state.overlays, store);
    hardUnlockUI('controller-post-render');

    const hasMainMenu = state.overlays.some((entry) => entry.type === 'mainMenu');
    if (!hasMainMenu) {
      phone.hideMainMenu();
      phone.navigate(state.route);
    }

  });

  return { store, phone, overlays };
}
