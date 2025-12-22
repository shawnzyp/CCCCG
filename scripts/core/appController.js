import { createStore } from './store.js';
import { OverlayManager } from '../ui/overlayManager.js';
import { PhoneOS } from '../os/phoneOS.js';

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
      return { ...state, phase: 'WELCOME_MODAL', overlays: [{ type: 'welcome' }] };
    case 'WELCOME_ACCEPT':
      return { ...state, phase: 'PHONE_OS', overlays: [] };
    case 'OPEN_MAIN_MENU':
      if (state.phase !== 'PHONE_OS') return state;
      if (state.overlays[state.overlays.length - 1]?.type === 'mainMenu') return state;
      return { ...state, overlays: [...state.overlays, { type: 'mainMenu' }] };
    case 'CLOSE_OVERLAY':
      if (state.overlays.length === 0) return state;
      if (state.overlays[state.overlays.length - 1]?.type === 'welcome') {
        return { ...state, phase: 'PHONE_OS', overlays: [] };
      }
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
  const overlayRegistry = {
    welcome: {
      show: () => {
        const modal = document.getElementById('modal-pt-welcome');
        const modalHost = overlayRoot || modal?.closest('[data-pt-modal-host]');
        if (!modal) return;
        if (modalHost) {
          modalHost.setAttribute('data-pt-modal-open', '1');
          modalHost.setAttribute('aria-hidden', 'false');
        }
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        modal.setAttribute('data-pt-modal-open', '1');
      },
      hide: () => {
        const modal = document.getElementById('modal-pt-welcome');
        const modalHost = overlayRoot || modal?.closest('[data-pt-modal-host]');
        if (modal) {
          modal.hidden = true;
          modal.setAttribute('aria-hidden', 'true');
          modal.removeAttribute('data-pt-modal-open');
        }
        if (modalHost) {
          modalHost.removeAttribute('data-pt-modal-open');
          modalHost.setAttribute('aria-hidden', 'true');
        }
      },
      focusRoot: overlayRoot?.querySelector('#modal-pt-welcome') || document.getElementById('modal-pt-welcome'),
    },
    mainMenu: {
      show: () => {
        phone.showMainMenu();
      },
      hide: () => {
        phone.hideMainMenu();
      },
      focusRoot: appRoot?.querySelector('#pt-main-menu') || document.getElementById('pt-main-menu'),
    },
  };

  const overlays = new OverlayManager({ appRoot, overlayRoot, overlays: overlayRegistry });

  let phoneMounted = false;

  store.subscribe((state) => {
    if (!phoneMounted) {
      phone.mount();
      phoneMounted = true;
    }

    const allowPhone = state.phase === 'PHONE_OS';
    phone.setInteractive(allowPhone);

    if (state.phase === 'WELCOME_MODAL') {
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
      if (state.phase !== 'WELCOME_MODAL') {
        phone.hideLauncher?.();
      }
    }

    if (state.phase === 'WELCOME_MODAL') {
      if (!document.getElementById('modal-pt-welcome')) {
        store.dispatch({ type: 'WELCOME_ACCEPT' });
      }
    }
  });

  return { store, phone, overlays };
}
