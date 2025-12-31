const CLOUD_BASE_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com';
const EXPECTED_PROJECT_ID = 'ccccg-7d6b6';
const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId', 'databaseURL'];

let authInitPromise = null;
let authInstance = null;
let firebaseApp = null;
let firebaseDatabase = null;
let firebaseFirestore = null;
let firebaseNamespace = null;
let authReady = false;
let currentUser = null;
let authReadyResolve = null;
const authReadyPromise = new Promise(resolve => {
  authReadyResolve = resolve;
});
const authStateListeners = new Set();
let authState = {
  uid: '',
  user: null,
  isDm: false,
};
const authListeners = new Set();

function getFirebaseConfig() {
  if (typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID) {
    return {
      source: 'test',
      config: {
        apiKey: 'test',
        authDomain: 'test',
        projectId: 'test',
        appId: 'test',
        databaseURL: CLOUD_BASE_URL,
      },
    };
  }
  if (typeof window !== 'undefined' && window.__CCCG_FIREBASE_CONFIG__) {
    return {
      source: 'window',
      config: {
        ...window.__CCCG_FIREBASE_CONFIG__,
      },
    };
  }
  return {
    source: 'default',
    config: { databaseURL: CLOUD_BASE_URL },
  };
}

function validateFirebaseConfig(config, source) {
  const missing = REQUIRED_CONFIG_KEYS.filter(key => typeof config?.[key] !== 'string' || !config[key].trim());
  if (missing.length) {
    const prefix = source === 'window'
      ? 'Firebase configuration missing required keys in window.__CCCG_FIREBASE_CONFIG__.'
      : 'Firebase configuration missing required keys.';
    throw new Error(`${prefix} Missing: ${missing.join(', ')}. Paste the Firebase config in index.html.`);
  }
}

function assertExpectedProjectId(config) {
  const projectId = config?.projectId || '';
  if (projectId && projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Firebase projectId mismatch. Expected "${EXPECTED_PROJECT_ID}" but received "${projectId}". Clear caches and update index.html with the correct Firebase config.`);
  }
}

function logEffectiveFirebaseConfig(config) {
  if (!config || typeof console === 'undefined') return;
  let databaseHost = '';
  if (typeof config.databaseURL === 'string') {
    try {
      const url = new URL(config.databaseURL);
      databaseHost = url.hostname || '';
    } catch {
      databaseHost = config.databaseURL;
    }
  }
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey : '';
  const keyPrefix = apiKey ? apiKey.slice(0, 4) : 'missing';
  const keySuffix = apiKey ? apiKey.slice(-4) : 'missing';
  console.info('Firebase config (runtime):', {
    projectId: config.projectId || '',
    authDomain: config.authDomain || '',
    databaseHost,
    apiKey: `${keyPrefix}...${keySuffix}`,
  });
}

function exposeFirebaseDebugHelper() {
  if (typeof window === 'undefined') return;
  window.__CCCG_DEBUG_FIREBASE__ = () => {
    const { config, source } = getFirebaseConfig();
    logEffectiveFirebaseConfig(config);
    return { source, config };
  };
}

function warnIfProjectConfigMismatch(config) {
  if (!config) return;
  const projectId = config.projectId;
  const databaseURL = config.databaseURL;
  if (typeof projectId === 'string' && typeof databaseURL === 'string') {
    try {
      const url = new URL(databaseURL);
      const host = url.hostname;
      const isRtdbHost = host.endsWith('firebasedatabase.app') || host.endsWith('firebaseio.com');
      const looksRelated = host.includes(projectId)
        || host.startsWith(`${projectId}-`)
        || host.startsWith(`${projectId}.`);
      if (isRtdbHost && !looksRelated) {
        console.warn('Firebase project/database may not match:', { projectId, databaseURL });
      } else if (!isRtdbHost) {
        console.warn('Firebase databaseURL does not look like RTDB:', { projectId, databaseURL });
      }
    } catch {
      console.warn('Invalid Firebase databaseURL:', databaseURL);
    }
  }
  if (typeof window !== 'undefined' && window?.location) {
    const host = window.location.hostname;
    const authDomain = config.authDomain;
    const expectedDomains = new Set([
      authDomain,
      projectId ? `${projectId}.firebaseapp.com` : null,
      projectId ? `${projectId}.web.app` : null,
      'localhost',
      '127.0.0.1'
    ].filter(Boolean));
    if (host && authDomain && !expectedDomains.has(host)) {
      console.warn('Non-default hosting domain. Ensure this domain is added under Firebase Auth -> Authorized domains.', {
        host,
        authDomain
      });
    }
  }
}

async function loadFirebaseCompat() {
  if (typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID) {
    const authFn = () => ({
      currentUser: null,
      onAuthStateChanged: callback => {
        if (typeof callback === 'function') {
          callback(null);
        }
        return () => {};
      },
      setPersistence: async () => {},
      signInWithEmailAndPassword: async () => ({ user: null }),
      createUserWithEmailAndPassword: async () => ({ user: null }),
      signOut: async () => {},
    });
    authFn.Auth = { Persistence: { LOCAL: 'LOCAL' } };
    return {
      apps: [],
      app: () => ({}),
      initializeApp: () => ({}),
      auth: authFn,
      database: () => ({
        ref: () => ({
          transaction: async () => ({ committed: false }),
        }),
      }),
      firestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false, data: () => ({}) }),
            set: async () => {},
          }),
        }),
        runTransaction: async () => ({}),
      }),
    };
  }
  if (window.firebase?.auth) {
    return window.firebase;
  }
  await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js'),
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

export function usernameToEmail(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return '';
  return `${normalized}@ccccg.local`;
}

export function waitForAuthReady() {
  return authReadyPromise;
}

export function onAuthStateChange(listener) {
  if (typeof listener !== 'function') return () => {};
  authStateListeners.add(listener);
  if (authReady) {
    try {
      listener(currentUser);
    } catch (err) {
      console.error('Auth state listener error', err);
    }
  }
  return () => authStateListeners.delete(listener);
}

export function isSignedIn() {
  return !!currentUser;
}

export function getCurrentUser() {
  return currentUser;
}

async function initializeAuthInternal() {
  const firebase = await loadFirebaseCompat();
  const { config: firebaseConfig, source } = getFirebaseConfig();
  validateFirebaseConfig(firebaseConfig, source);
  logEffectiveFirebaseConfig(firebaseConfig);
  assertExpectedProjectId(firebaseConfig);
  warnIfProjectConfigMismatch(firebaseConfig);
  const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.database(app);
  const firestore = firebase.firestore(app);
  firebaseApp = app;
  firebaseDatabase = db;
  firebaseFirestore = firestore;
  firebaseNamespace = firebase;
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (err) {
    console.warn('Failed to set auth persistence', err);
  }
  auth.onAuthStateChanged(async user => {
    currentUser = user || null;
    if (!authReady) {
      authReady = true;
      if (authReadyResolve) {
        authReadyResolve(true);
      }
    }
    authStateListeners.forEach(listener => {
      try {
        listener(currentUser);
      } catch (err) {
        console.error('Auth state listener error', err);
      }
    });
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
    if (user) {
      syncProfileUsernameToFirestore(user).catch(err => {
        console.warn('Failed to sync profile username', err);
      });
    }
  });
  authInstance = auth;
  return auth;
}

exposeFirebaseDebugHelper();

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

export async function getFirebaseFirestore() {
  await initFirebaseAuth();
  if (!firebaseFirestore) {
    throw new Error('Firebase firestore not initialized');
  }
  return firebaseFirestore;
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

async function reserveUsernameAndProfile(firestore, normalizedUsername, uid) {
  if (!firestore) throw new Error('Firestore required');
  if (!normalizedUsername) throw new Error('Username required');
  if (!uid) throw new Error('User id required');
  const usernameRef = firestore.collection('usernames').doc(normalizedUsername);
  const userRef = firestore.collection('users').doc(uid);
  const serverTimestamp = firebaseNamespace?.firestore?.FieldValue?.serverTimestamp?.();
  await firestore.runTransaction(async transaction => {
    const existing = await transaction.get(usernameRef);
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.uid && data.uid !== uid) {
        throw new Error('Username already taken');
      }
    }
    transaction.set(usernameRef, {
      uid,
      username: normalizedUsername,
      createdAt: serverTimestamp || new Date(),
    }, { merge: true });
    transaction.set(userRef, {
      username: normalizedUsername,
      createdAt: serverTimestamp || new Date(),
    }, { merge: true });
  });
}

async function ensureUsernameReservation(firestore, normalizedUsername, uid) {
  return reserveUsernameAndProfile(firestore, normalizedUsername, uid);
}

async function syncProfileUsernameToFirestore(user) {
  if (!user || !firebaseDatabase) return;
  const uid = user.uid || '';
  if (!uid) return;
  const profileRef = firebaseDatabase.ref(`users/${uid}/profile`);
  const snapshot = await profileRef.once('value');
  const profile = snapshot?.val?.() || snapshot?.val || {};
  if (!profile || typeof profile !== 'object') return;
  if (profile.firestoreSyncedAt) return;
  const normalizedUsername = normalizeUsername(profile.username || profile.displayName || '');
  if (!normalizedUsername) return;
  try {
    const firestore = await getFirebaseFirestore();
    await reserveUsernameAndProfile(firestore, normalizedUsername, uid);
    await profileRef.update({
      firestoreSyncedAt: Date.now(),
    });
  } catch (err) {
    const isPermissionError = err?.code === 'permission-denied' || /permission/i.test(err?.message || '');
    if (!isPermissionError) {
      console.warn('Failed to migrate profile username to Firestore', err);
    }
  }
}

export async function checkUsernameAvailability(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return { available: false, normalized, reason: 'invalid' };
  }
  const firestore = await getFirebaseFirestore();
  const usernameRef = firestore.collection('usernames').doc(normalized);
  const snapshot = await usernameRef.get();
  if (!snapshot.exists) {
    return { available: true, normalized };
  }
  const data = snapshot.data() || {};
  if (!data.uid) {
    return { available: true, normalized };
  }
  return { available: false, normalized, reason: 'taken' };
}

export async function signInWithUsernamePassword(username, password) {
  const auth = await initFirebaseAuth();
  const normalized = normalizeUsername(username);
  const email = usernameToEmail(normalized);
  if (!email) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
  const credential = await auth.signInWithEmailAndPassword(email, password);
  const uid = credential?.user?.uid || '';
  if (!uid) throw new Error('Login failed');
  const firestore = await getFirebaseFirestore();
  try {
    await ensureUsernameReservation(firestore, normalized, uid);
  } catch (err) {
    await auth.signOut();
    throw err;
  }
  return credential;
}

export async function createAccountWithUsernamePassword(username, password) {
  const auth = await initFirebaseAuth();
  const normalized = normalizeUsername(username);
  const email = usernameToEmail(normalized);
  if (!email) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
  const credential = await auth.createUserWithEmailAndPassword(email, password);
  const uid = credential?.user?.uid || '';
  if (!uid) throw new Error('Account creation failed');
  try {
    const firestore = await getFirebaseFirestore();
    await reserveUsernameAndProfile(firestore, normalized, uid);
  } catch (err) {
    const isPermissionError = err?.code === 'permission-denied' || /permission/i.test(err?.message || '');
    if (isPermissionError) {
      console.warn('Username reservation skipped due to permissions. Proceeding with account creation.', err);
    } else {
      try {
        await credential?.user?.delete?.();
      } catch (cleanupErr) {
        console.error('Failed to clean up auth user after claim failure', cleanupErr);
      }
      throw err;
    }
  }
  return credential;
}

export async function signOut() {
  const auth = await initFirebaseAuth();
  return auth.signOut();
}
