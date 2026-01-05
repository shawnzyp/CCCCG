import { TestResponse } from './test-response.js';

if (typeof globalThis.Response !== 'function') {
  globalThis.Response = TestResponse;
}

if (typeof globalThis.IntersectionObserver !== 'function') {
  class IntersectionObserverMock {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  globalThis.IntersectionObserver = IntersectionObserverMock;
  if (typeof window !== 'undefined') {
    window.IntersectionObserver = IntersectionObserverMock;
  }
}

if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = async (_input, init = {}) => {
    const { status = 200, statusText = '', headers = {} } = init ?? {};
    const body = init && Object.prototype.hasOwnProperty.call(init, 'body') ? init.body : '{}';
    return new TestResponse(body, { status, statusText, headers });
  };
}

if (typeof window !== 'undefined') {
  window.__CCCG_FORCE_FIREBASE_AUTH__ = true;
  if (!window.firebase) {
    const appStub = { options: { databaseURL: 'https://ccccg-7d6b6-default-rtdb.firebaseio.com' } };
    const authInstance = {
      currentUser: null,
      async setPersistence() {},
      onAuthStateChanged(callback) {
        if (typeof callback === 'function') {
          try {
            callback(null);
          } catch {}
        }
        return () => {};
      },
    };
    const authFn = () => authInstance;
    authFn.Auth = { Persistence: { LOCAL: 'LOCAL' } };

    const createRef = () => ({
      set: async () => {},
      once: async () => ({ val: () => null }),
      remove: async () => {},
      update: async () => {},
      on: () => {},
      off: () => {},
      child: () => createRef(),
      orderByKey: () => createRef(),
      limitToLast: () => createRef(),
    });
    const databaseFn = () => ({ ref: () => createRef(), app: appStub });
    databaseFn.ServerValue = { TIMESTAMP: Date.now() };
    const firestoreFn = () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
        }),
      }),
      runTransaction: async () => {},
    });

    window.firebase = {
      apps: [],
      app: () => appStub,
      initializeApp: () => {
        window.firebase.apps = [appStub];
        return appStub;
      },
      auth: authFn,
      database: databaseFn,
      firestore: firestoreFn,
    };
  }
}
