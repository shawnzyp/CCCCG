import { createStore } from './store.js';
import { OverlayManager } from '../ui/overlayManager.js';
import { PhoneOS } from '../os/phoneOS.js';

function hardUnlockUI(reason = 'controller') {
  try { document.body?.classList?.remove?.('touch-controls-disabled', 'modal-open', 'launching'); } catch {}
  try { document.documentElement?.setAttribute?.('data-pt-touch-locked', '0'); } catch {}
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
    if (typeof globalThis.safeUnlockTouchControls === 'function') {
      globalThis.safeUnlockTouchControls({ immediate: true, reason });
    } else if (typeof globalThis.unlockTouchControls === 'function') {
      globalThis.unlockTouchControls({ immediate: true, reason });
    }
  } catch {}
}

function unlockGlobalTouch(reason = 'controller') {
  try { document.documentElement?.setAttribute?.('data-pt-touch-locked', '0'); } catch {}
  try { document.body?.classList?.remove?.('touch-controls-disabled'); } catch {}
  try { document.body?.classList?.remove?.('modal-open'); } catch {}
  try {
    document.querySelectorAll?.('[inert]').forEach((el) => {
      try { el.inert = false; } catch {}
      try { el.removeAttribute('inert'); } catch {}
    });
  } catch {}
  try {
    if (typeof globalThis.safeUnlockTouchControls === 'function') {
      globalThis.safeUnlockTouchControls({ immediate: true, reason });
    } else if (typeof globalThis.unlockTouchControls === 'function') {
      globalThis.unlockTouchControls({ immediate: true, reason });
    }
  } catch {}
}

function lockGlobalTouch(reason = 'controller') {
  try { document.documentElement?.setAttribute?.('data-pt-touch-locked', '1'); } catch {}
  try { document.body?.classList?.add?.('touch-controls-disabled'); } catch {}
  try {
    if (typeof globalThis.lockTouchControls === 'function') {
      globalThis.lockTouchControls({ reason });
    }
  } catch {}
}

function showNode(node) {
  if (!node) return false;
  try { node.classList.remove('hidden'); } catch {}
  try { node.hidden = false; } catch {}
  try { node.style.display = ''; } catch {}
  try { node.style.removeProperty('display'); } catch {}
  try { node.setAttribute('aria-hidden', 'false'); } catch {}
  return true;
}

const initialState = {
  phase: 'BOOT',
  overlays: [],
  route: 'home',
};

function reducer(state, action) {
  switch (action.type) {
    case 'BOOT_DONE':
      return { ...state, phase: 'INTRO' };
    case 'INTRO_DONE':
      return { ...state, phase: 'PHONE_OS', overlays: [] };
    case 'WELCOME_ACCEPT':
      return { ...state, phase: 'PHONE_OS', overlays: [] };
    case 'OPEN_MAIN_MENU':
      if (state.phase !== 'PHONE_OS') return state;
      if (state.overlays[state.overlays.length - 1]?.type === 'mainMenu') return state;
      return { ...state, overlays: [...state.overlays, { type: 'mainMenu' }] };
    case 'CLOSE_OVERLAY':
      return { ...state, overlays: state.overlays.slice(0, -1) };
    case 'NAVIGATE':
      if (state.phase !== 'PHONE_OS') return state;
      return { ...state, route: action.route };
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

    const allowPhone = state.phase === 'PHONE_OS';
    phone.setInteractive(allowPhone);

    if (state.phase === 'PHONE_OS') {
      hardUnlockUI('phone-os');
    } else if (state.phase === 'BOOT' || state.phase === 'INTRO') {
      lockGlobalTouch(state.phase.toLowerCase());
    } else {
      unlockGlobalTouch(state.phase.toLowerCase());
    }

    // Prepaint blur as early as possible so it never "pops" in.
    if (state.phase === 'INTRO') {
      overlays.ensureBackdropPrepaint();
    }

    overlays.render(state.overlays, store);

    if (allowPhone) {
      const hasMainMenu = state.overlays.some((entry) => entry.type === 'mainMenu');
      if (!hasMainMenu) {
        phone.hideMainMenu();
        phone.navigate(state.route);
      }
    } else {
      phone.hideMainMenu();
      phone.setView?.('lock', null);
      if (state.phase === 'INTRO' || state.phase === 'BOOT') {
        phone.showLauncher?.();
      } else {
        phone.hideLauncher?.();
      }
    }

  });

  return { store, phone, overlays };
}
