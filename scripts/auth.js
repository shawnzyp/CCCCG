const CLOUD_BASE_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com';

let authInitPromise = null;
let authInstance = null;
let firebaseApp = null;
let firebaseDatabase = null;
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
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js'),
  ]);
  if (!window.firebase?.auth) {
    throw new Error('Failed to load Firebase auth libraries.');
  }
  return window.firebase;
}

function normalizeUsername(username) {
  if (typeof username !== 'string') return '';
  return username.trim().toLowerCase();
}

export function usernameToEmail(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return '';
  return `${normalized}@ccccg.local`;
}

async function initializeAuthInternal() {
  const firebase = await loadFirebaseCompat();
  const firebaseConfig = getFirebaseConfig();
  const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.database(app);
  firebaseApp = app;
  firebaseDatabase = db;
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
        isDm = !!(tokenResult?.claims?.token?.dm === true || tokenResult?.claims?.dm === true);
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

export function initFirebaseAuth() {
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

export function onAuthStateChanged(listener) {
  if (typeof listener === 'function') {
    authListeners.add(listener);
  }
  return () => authListeners.delete(listener);
}

export async function getFirebaseDatabase() {
  await initFirebaseAuth();
  if (!firebaseDatabase) {
    throw new Error('Firebase database not initialized');
  }
  return firebaseDatabase;
}

export async function claimUsernameTransaction(db, normalizedUsername, uid) {
  if (!db) throw new Error('Database required');
  if (!normalizedUsername) throw new Error('Username required');
  if (!uid) throw new Error('User id required');
  const ref = db.ref(`usernames/${normalizedUsername}`);
  const result = await ref.transaction(current => {
    if (current && current !== uid) {
      return;
    }
    return uid;
  });
  if (!result.committed) {
    throw new Error('Username already taken');
  }
  return true;
}

async function ensureUserProfile(db, uid, username) {
  if (!db || !uid || !username) return;
  const userRef = db.ref(`users/${uid}`);
  await userRef.transaction(current => {
    if (current && current.username) {
      return current;
    }
    return {
      username,
      createdAt: Date.now(),
    };
  });
}

export async function signInWithUsernamePassword(username, password) {
  const auth = await initFirebaseAuth();
  const email = usernameToEmail(username);
  if (!email) {
    throw new Error('Username required');
  }
  const credential = await auth.signInWithEmailAndPassword(email, password);
  const uid = credential?.user?.uid || '';
  const normalized = normalizeUsername(username);
  const db = await getFirebaseDatabase();
  if (!uid) throw new Error('Login failed');
  const ref = db.ref(`usernames/${normalized}`);
  const result = await ref.transaction(current => {
    if (!current || current === uid) {
      return uid;
    }
    return;
  });
  if (!result.committed) {
    await auth.signOut();
    throw new Error('Username already linked to another account.');
  }
  await ensureUserProfile(db, uid, normalized);
  return credential;
}

export async function createAccountWithUsernamePassword(username, password) {
  const auth = await initFirebaseAuth();
  const email = usernameToEmail(username);
  if (!email) {
    throw new Error('Username required');
  }
  const normalized = normalizeUsername(username);
  const credential = await auth.createUserWithEmailAndPassword(email, password);
  const uid = credential?.user?.uid || '';
  if (!uid) throw new Error('Account creation failed');
  const db = await getFirebaseDatabase();
  try {
    await claimUsernameTransaction(db, normalized, uid);
    await ensureUserProfile(db, uid, normalized);
  } catch (err) {
    try {
      await credential?.user?.delete?.();
    } catch (cleanupErr) {
      console.error('Failed to clean up auth user after claim failure', cleanupErr);
    }
    throw err;
  }
  return credential;
}

export async function signOut() {
  const auth = await initFirebaseAuth();
  return auth.signOut();
}
