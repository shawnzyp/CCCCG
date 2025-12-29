const CLOUD_BASE_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com';

let authInitPromise = null;
let authInstance = null;
let authState = {
  uid: '',
  user: null,
  isDm: false,
};
const authListeners = new Set();

function getFirebaseConfig() {
  if (typeof window !== 'undefined' && window.CCCG_FIREBASE_CONFIG) {
    return window.CCCG_FIREBASE_CONFIG;
  }
  return { databaseURL: CLOUD_BASE_URL };
}

async function loadFirebaseCompat() {
  if (window.firebase?.auth) {
    return window.firebase;
  }
  await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js'),
  ]);
  if (!window.firebase?.auth) {
    throw new Error('Failed to load Firebase auth libraries.');
  }
  return window.firebase;
}

async function initializeAuthInternal() {
  const firebase = await loadFirebaseCompat();
  const firebaseConfig = getFirebaseConfig();
  const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (err) {
    console.warn('Failed to set auth persistence', err);
  }
  auth.onAuthStateChanged(async user => {
    let isDm = false;
    if (user && typeof user.getIdTokenResult === 'function') {
      try {
        const tokenResult = await user.getIdTokenResult(true);
        isDm = !!(tokenResult?.claims?.token?.isDM || tokenResult?.claims?.isDM);
      } catch (err) {
        console.warn('Failed to read auth claims', err);
      }
    }
    authState = {
      uid: user?.uid || '',
      user: user || null,
      isDm,
    };
    authListeners.forEach(listener => {
      try {
        listener({ ...authState });
      } catch (err) {
        console.error('Auth state listener failed', err);
      }
    });
  });
  authInstance = auth;
  return auth;
}

export function ensureAuth() {
  if (!authInitPromise) {
    authInitPromise = initializeAuthInternal().catch(err => {
      console.error('Failed to initialize auth', err);
      authInitPromise = null;
      throw err;
    });
  }
  return authInitPromise;
}

export function getAuthState() {
  return { ...authState };
}

export function subscribeAuthState(listener) {
  if (typeof listener === 'function') {
    authListeners.add(listener);
  }
  return () => authListeners.delete(listener);
}

export async function signInWithEmail(email, password) {
  const auth = await ensureAuth();
  return auth.signInWithEmailAndPassword(email, password);
}

export async function createAccount(email, password) {
  const auth = await ensureAuth();
  return auth.createUserWithEmailAndPassword(email, password);
}

export async function signOut() {
  const auth = await ensureAuth();
  return auth.signOut();
}
