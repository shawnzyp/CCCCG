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

export function normalizeUsername(username) {
  if (typeof username !== 'string') return '';
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (normalized.length < 3 || normalized.length > 20) {
    return '';
  }
  return normalized;
}

function randomRecoveryCode() {
  const bytes = new Uint8Array(6);
  if (typeof crypto === 'object' && crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function generateRecoveryCodes(count = 6) {
  const total = Number.isFinite(count) ? Math.max(1, count) : 6;
  const codes = new Set();
  while (codes.size < total) {
    codes.add(`${randomRecoveryCode().slice(0, 6)}-${randomRecoveryCode().slice(0, 6)}`);
  }
  return Array.from(codes);
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
        isDm = !!(
          tokenResult?.claims?.token?.admin === true ||
          tokenResult?.claims?.admin === true
        );
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

export async function getAuthToken() {
  const auth = await initFirebaseAuth();
  const user = auth?.currentUser;
  if (!user || typeof user.getIdToken !== 'function') return '';
  try {
    return await user.getIdToken();
  } catch (err) {
    console.warn('Failed to fetch auth token', err);
    return '';
  }
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
  const userRef = db.ref(`users/${uid}/profile`);
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

export async function storeRecoveryCodes(db, uid, codes) {
  if (!db || !uid || !Array.isArray(codes)) return;
  const record = {};
  const now = Date.now();
  codes.forEach(code => {
    if (typeof code !== 'string' || !code.trim()) return;
    record[code.trim()] = { createdAt: now, usedAt: 0 };
  });
  await db.ref(`users/${uid}/recoveryCodes`).set(record);
}

export async function signInWithUsernamePassword(username, password) {
  const auth = await initFirebaseAuth();
  const normalized = normalizeUsername(username);
  const email = usernameToEmail(username);
  if (!email) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
  const credential = await auth.signInWithEmailAndPassword(email, password);
  const uid = credential?.user?.uid || '';
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
  const normalized = normalizeUsername(username);
  const email = usernameToEmail(username);
  if (!email) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
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

export async function sendPasswordReset(username) {
  const auth = await initFirebaseAuth();
  const email = usernameToEmail(username);
  if (!email) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
  await auth.sendPasswordResetEmail(email);
  return true;
}
