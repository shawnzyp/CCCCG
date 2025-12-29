import { toast } from './notifications.js';

let firebaseInitPromise = null;
let authInitPromise = null;
let authState = { user: null };
let authReadyResolve = null;
let authReadyPromise = new Promise(resolve => {
  authReadyResolve = resolve;
});
const authListeners = new Set();
let anonymousSignInAttempted = false;
let cachedAuthToken = null;
let cachedAuthTokenExpiry = 0;

function getFirebaseConfig() {
  if (typeof window !== 'undefined') {
    const candidate = window.CC_FIREBASE_CONFIG || window.CCCG_FIREBASE_CONFIG || null;
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }
  return {
    databaseURL: 'https://ccccg-7d6b6-default-rtdb.firebaseio.com',
    authDomain: 'ccccg-7d6b6.firebaseapp.com',
  };
}

async function loadFirebaseAuthCompat() {
  if (window.firebase?.auth) {
    return window.firebase;
  }

  await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js'),
  ]);

  if (!window.firebase?.auth) {
    throw new Error('Failed to load Firebase Auth compat libraries.');
  }

  return window.firebase;
}

async function ensureFirebaseApp() {
  if (firebaseInitPromise) {
    return firebaseInitPromise;
  }
  firebaseInitPromise = (async () => {
    const firebase = await loadFirebaseAuthCompat();
    const config = getFirebaseConfig();
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config);
    return { firebase, app };
  })().catch(err => {
    firebaseInitPromise = null;
    throw err;
  });
  return firebaseInitPromise;
}

async function ensureAuth() {
  if (authInitPromise) {
    return authInitPromise;
  }
  authInitPromise = (async () => {
    const { firebase, app } = await ensureFirebaseApp();
    const auth = firebase.auth(app);
    auth.onAuthStateChanged(async (user) => {
      authState = { user: user || null };
      if (authReadyResolve) {
        authReadyResolve(authState.user);
        authReadyResolve = null;
      }
      authListeners.forEach(listener => {
        try {
          listener(authState.user);
        } catch (err) {
          console.error('Auth listener failed', err);
        }
      });
      if (!authState.user && !anonymousSignInAttempted) {
        anonymousSignInAttempted = true;
        try {
          await auth.signInAnonymously();
        } catch (err) {
          console.error('Anonymous auth failed', err);
          toast('Anonymous login failed. You can still continue offline.', { type: 'warning', duration: 6000 });
        }
      }
    });
    return auth;
  })().catch(err => {
    authInitPromise = null;
    console.error('Failed to initialize Firebase Auth', err);
    throw err;
  });
  return authInitPromise;
}

export async function initializeAuth() {
  await ensureAuth();
  return authReadyPromise;
}

export function onAuthStateChanged(listener) {
  if (typeof listener !== 'function') return () => {};
  authListeners.add(listener);
  if (authState.user) {
    try {
      listener(authState.user);
    } catch (err) {
      console.error('Auth listener failed', err);
    }
  }
  return () => {
    authListeners.delete(listener);
  };
}

export function getCurrentUser() {
  return authState.user || null;
}

export function getCurrentUserUid() {
  return authState.user?.uid || '';
}

export function isAnonymousUser() {
  return Boolean(authState.user?.isAnonymous);
}

export async function getAuthToken() {
  const user = authState.user;
  if (!user || typeof user.getIdToken !== 'function') return '';
  const now = Date.now();
  if (cachedAuthToken && cachedAuthTokenExpiry > now + 10000) {
    return cachedAuthToken;
  }
  try {
    const token = await user.getIdToken();
    cachedAuthToken = token;
    cachedAuthTokenExpiry = now + 50 * 60 * 1000;
    return token;
  } catch (err) {
    console.error('Failed to fetch auth token', err);
    return '';
  }
}

export async function signInWithGoogle() {
  const auth = await ensureAuth();
  const { firebase } = await ensureFirebaseApp();
  const provider = new firebase.auth.GoogleAuthProvider();
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    try {
      await current.linkWithPopup(provider);
      return;
    } catch (err) {
      const credential = err?.credential || null;
      if (credential) {
        await auth.signInWithCredential(credential);
        return;
      }
      throw err;
    }
  }
  await auth.signInWithPopup(provider);
}

export async function signInWithEmail(email, password) {
  const auth = await ensureAuth();
  const { firebase } = await ensureFirebaseApp();
  const current = auth.currentUser;
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }
  const credential = firebase.auth.EmailAuthProvider.credential(email, password);
  if (current && current.isAnonymous) {
    try {
      await current.linkWithCredential(credential);
      return;
    } catch (err) {
      if (err?.code === 'auth/email-already-in-use' || err?.code === 'auth/credential-already-in-use') {
        await auth.signInWithCredential(credential);
        return;
      }
      throw err;
    }
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      await auth.createUserWithEmailAndPassword(email, password);
      return;
    }
    throw err;
  }
}

