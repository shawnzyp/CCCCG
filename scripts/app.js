import { createStore } from './core/store.js';
import { PhoneOS } from './ui/phoneOS.js';

function reducer(state, action) {
  if (!action || typeof action.type !== 'string') return state;
  switch (action.type) {
    case 'OPEN_MAIN_MENU':
      return { ...state, overlays: [{ type: 'mainMenu' }] };
    case 'OPEN_APP_MODAL': {
      const appId = action.payload?.appId;
      if (!appId) return state;
      const next = { type: 'appModal', appId, label: action.payload?.label || appId };
      const kept = (state.overlays || []).filter((o) => o.type !== 'appModal');
      return { ...state, overlays: [...kept, next] };
    }
    case 'CLOSE_OVERLAY':
      return { ...state, overlays: [] };
    case 'NAVIGATE': {
      const route = action.payload?.route || 'home';
      return { ...state, route };
    }
    default:
      return state;
  }
}

const initialState = {
  overlays: [],
  route: 'home',
  permissions: { shardsUnlocked: true },
};

const store = createStore(reducer, initialState);

function main() {
  const mountNode = document.getElementById('pt-root');
  if (!mountNode) throw new Error('Missing #pt-root');

  const phoneOS = new PhoneOS(store);
  phoneOS.mount(mountNode);

  // Keep PhoneOS in sync with the store.
  let lastRoute = store.getState().route;
  let lastOverlays = JSON.stringify(store.getState().overlays || []);

  store.subscribe(() => {
    const state = store.getState();
    if (!state) return;

    if (state.route && state.route !== lastRoute) {
      lastRoute = state.route;
      phoneOS.navigate(state.route);
    }

    const overlaysStr = JSON.stringify(state.overlays || []);
    if (overlaysStr !== lastOverlays) {
      lastOverlays = overlaysStr;
      phoneOS.updateOverlays();
    }
  });

  // Simulate a short launch sequence.
  document.body.classList.add('launching');
  setTimeout(() => {
    document.body.classList.remove('launching');
    window.dispatchEvent(new Event('cc:launch-sequence-complete'));
  }, 900);

  // Expose for debugging.
  window.__CC_STORE__ = store;
  window.__PHONE_OS__ = phoneOS;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
