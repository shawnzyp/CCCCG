const CLOUD_BASE_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com';
const EXPECTED_PROJECT_ID = 'ccccg-7d6b6';
const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId', 'databaseURL'];
const AUTH_DOMAIN_WARNING_MESSAGE = 'Firebase Auth may require this host to be added in Firebase Console -> Auth -> Authorized domains.';
const RESERVED_USERNAMES = new Set(['guest', 'admin', 'system', 'dm']);

let authInitPromise = null;
let authInstance = null;
let firebaseApp = null;
let firebaseDatabase = null;
let firebaseFirestore = null;
let firebaseNamespace = null;
let authReady = false;
let currentUser = null;
let authReadyResolve = null;
let authMode = 'firebase';
const authReadyPromise = new Promise(resolve => {
  authReadyResolve = resolve;
});
const authStateListeners = new Set();
let authState = {
  uid: '',
  user: null,
  isDm: false,
};
let authDomainWarningShown = false;
let pendingAuthDomainWarning = null;
const authListeners = new Set();
const LOCAL_USERS_KEY = 'cccg.localUsers';
const LOCAL_SESSION_KEY = 'cccg.localSession';
const LOCAL_GUEST_KEY = 'cccg.localGuestId';

function getLocalStorageSafe() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readLocalJson(key) {
  const storage = getLocalStorageSafe();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalJson(key, value) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Failed to persist local auth data', err);
  }
}

function removeLocalKey(key) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {}
}

function readLocalUsers() {
  const stored = readLocalJson(LOCAL_USERS_KEY);
  return stored && typeof stored === 'object' ? stored : {};
}

function writeLocalUsers(users) {
  writeLocalJson(LOCAL_USERS_KEY, users);
}

function readLocalSession() {
  const stored = readLocalJson(LOCAL_SESSION_KEY);
  if (!stored || typeof stored !== 'object') return null;
  return stored;
}

function writeLocalSession(session) {
  writeLocalJson(LOCAL_SESSION_KEY, session);
}

function clearLocalSession() {
  removeLocalKey(LOCAL_SESSION_KEY);
}

function setAuthReady() {
  if (authReady) return;
  authReady = true;
  if (authReadyResolve) {
    authReadyResolve(true);
  }
}

function notifyAuthListeners() {
  authStateListeners.forEach(listener => {
    try {
      listener(currentUser);
    } catch (err) {
      console.error('Auth state listener error', err);
    }
  });
  authListeners.forEach(listener => {
    try {
      listener({ ...authState });
    } catch (err) {
      console.error('Auth state listener failed', err);
    }
  });
}

function setAuthState({ uid = '', username = '', user = null, isDm = false, isGuest = false } = {}) {
  const resolvedUser = user || (uid ? {
    uid,
    displayName: username,
    isAnonymous: isGuest,
    isLocal: true,
  } : null);
  currentUser = resolvedUser;
  authState = {
    uid: uid || '',
    user: resolvedUser,
    isDm: !!isDm,
  };
  setAuthReady();
  notifyAuthListeners();
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return typeof btoa === 'function' ? btoa(binary) : binary;
}

function base64RandomBytes(length = 16) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64(Array.from(bytes));
}

function stringToBytes(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  return Uint8Array.from(text.split('').map(char => char.charCodeAt(0)));
}

function fnv1aHash(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function getPolicyFlagsFromPasswordPolicy(policy) {
  const p = policy && typeof policy === 'object' ? policy : {};
  return {
    minLength: Number(p.minLength || p.minimumLength || 0) || 0,
    requireUppercase: !!(p.requireUppercase || p.uppercaseRequired),
    requireLowercase: !!(p.requireLowercase || p.lowercaseRequired),
    requireNumber: !!(p.requireNumber || p.numberRequired),
    requireSpecial: !!(p.requireSpecial || p.specialRequired),
    disallowSpaces: !!(p.disallowSpaces || p.noSpaces),
  };
}

function localPasswordBasicChecks(password, flags) {
  if (typeof password !== 'string') {
    return 'Password is required.';
  }
  const raw = password;
  if (!raw) {
    return 'Password is required.';
  }
  const minLen = flags.minLength > 0 ? flags.minLength : 8;
  if (raw.length < minLen) {
    return `Password must be at least ${minLen} characters.`;
  }
  if (flags.disallowSpaces && /\s/.test(raw)) {
    return 'Password cannot contain spaces.';
  }
  if (flags.requireUppercase && !/[A-Z]/.test(raw)) {
    return 'Password must include an uppercase letter.';
  }
  if (flags.requireLowercase && !/[a-z]/.test(raw)) {
    return 'Password must include a lowercase letter.';
  }
  if (flags.requireNumber && !/[0-9]/.test(raw)) {
    return 'Password must include a number.';
  }
  if (flags.requireSpecial && !/[^A-Za-z0-9]/.test(raw)) {
    return 'Password must include a special character.';
  }
  return '';
}

async function assertPasswordCompliant(password) {
  try {
    const mod = await import('./password-policy.js');
    const policy = mod?.PASSWORD_POLICY;
    const flags = getPolicyFlagsFromPasswordPolicy(policy);

    if (typeof mod?.getPasswordLengthError === 'function') {
      const lengthError = mod.getPasswordLengthError(password, policy);
      if (lengthError) {
        throw new Error(lengthError);
      }
    } else {
      const basicLenError = localPasswordBasicChecks(password, { ...flags, minLength: flags.minLength || 8 });
      if (basicLenError) throw new Error(basicLenError);
      return;
    }

    const otherError = localPasswordBasicChecks(password, flags);
    if (otherError) {
      throw new Error(otherError);
    }
    return;
  } catch (err) {
    const fallbackError = localPasswordBasicChecks(password, {
      minLength: 8,
      requireUppercase: false,
      requireLowercase: false,
      requireNumber: false,
      requireSpecial: false,
      disallowSpaces: false,
    });
    if (fallbackError) {
      throw new Error(fallbackError);
    }
  }
}

async function hashPasswordWithSalt(password, salt) {
  const input = `${salt}:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const digest = await crypto.subtle.digest('SHA-256', stringToBytes(input));
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return fnv1aHash(input);
}

function randomId(length = 12) {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => (byte % 36).toString(36)).join('');
  }
  return Math.random().toString(36).slice(2, 2 + length);
}

function restoreLocalSession() {
  const session = readLocalSession();
  if (!session || typeof session !== 'object') return;
  const uid = typeof session.uid === 'string' ? session.uid : '';
  const username = typeof session.username === 'string' ? session.username : '';
  if (!uid || !username) return;
  const normalized = normalizeUsernameLocal(username);
  const users = readLocalUsers();
  const record = normalized ? users[normalized] : null;
  const isGuest = uid.startsWith('guest-') || normalized === 'guest';
  if (!isGuest && (!record || record.uid !== uid)) {
    clearLocalSession();
    return;
  }
  authMode = 'local';
  setAuthState({ uid, username, isGuest });
}

function ensureGuestId() {
  const storage = getLocalStorageSafe();
  if (!storage) {
    return `guest-${randomId(10)}`;
  }
  try {
    const stored = storage.getItem(LOCAL_GUEST_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
    const next = `guest-${randomId(10)}`;
    storage.setItem(LOCAL_GUEST_KEY, next);
    return next;
  } catch {
    return `guest-${randomId(10)}`;
  }
}

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
    if (typeof window !== 'undefined' && typeof window.toast === 'function') {
      try {
        window.toast(`Firebase setup incomplete. Missing: ${missing.join(', ')}`, 'error');
      } catch {}
    }
    throw new Error(`${prefix} Missing: ${missing.join(', ')}. Paste the Firebase config in index.html.`);
  }
}

function assertExpectedProjectId(config) {
  if (typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID) {
    return;
  }
  const projectId = config?.projectId || '';
  if (projectId && projectId !== EXPECTED_PROJECT_ID) {
    if (typeof window !== 'undefined' && typeof window.toast === 'function') {
      try {
        window.toast(`Firebase project mismatch (expected ${EXPECTED_PROJECT_ID}). Clear caches and reload.`, 'error');
      } catch {}
    }
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

function shouldShowAuthDiagnostics() {
  if (typeof window === 'undefined') return false;
  const host = window?.location?.hostname || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const debugFlag = window.__CCCG_DEBUG__ === true;
  return isLocal || authState.isDm || debugFlag;
}

function showAuthDomainWarningBanner() {
  if (typeof document === 'undefined') return;
  const banner = document.querySelector('[data-sync-auth-domain-warning]');
  if (!banner) return false;
  banner.textContent = AUTH_DOMAIN_WARNING_MESSAGE;
  banner.hidden = false;
  banner.removeAttribute('hidden');
  return true;
}

function maybeShowAuthDomainWarning() {
  if (authDomainWarningShown || !pendingAuthDomainWarning) return;
  if (!shouldShowAuthDiagnostics()) return;
  const shown = showAuthDomainWarningBanner();
  if (shown) {
    authDomainWarningShown = true;
  }
}

export function renderAuthDomainDiagnostics() {
  maybeShowAuthDomainWarning();
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
      pendingAuthDomainWarning = { host };
      maybeShowAuthDomainWarning();
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

export function normalizeUsernameLocal(username) {
  if (typeof username !== 'string') return '';
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.length > 24) return '';
  if (!/^[a-z0-9._-]+$/.test(trimmed)) return '';
  if (RESERVED_USERNAMES.has(trimmed)) return '';
  return trimmed;
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
      setAuthReady();
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
    maybeShowAuthDomainWarning();
  });
  authInstance = auth;
  authMode = 'firebase';
  return auth;
}

exposeFirebaseDebugHelper();

export function initFirebaseAuth() {
  if (!authInitPromise) {
    authInitPromise = (async () => {
      restoreLocalSession();
      if (authMode === 'local') {
        setAuthReady();
        notifyAuthListeners();
        return null;
      }
      try {
        const auth = await initializeAuthInternal();
        return auth;
      } catch (err) {
        console.error('Failed to initialize auth', err);
        authMode = 'local';
        if (!currentUser) {
          setAuthState({ uid: '' });
        } else {
          setAuthReady();
          notifyAuthListeners();
        }
        return null;
      }
    })();
  }
  return authInitPromise;
}

export function getAuthState() {
  return { ...authState };
}

export function onAuthStateChanged(listener) {
  if (typeof listener === 'function') {
    authListeners.add(listener);
    if (authReady) {
      try {
        listener({ ...authState });
      } catch (err) {
        console.error('Auth state listener failed', err);
      }
    }
  }
  return () => authListeners.delete(listener);
}

export function getAuthMode() {
  return authMode;
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
  const normalized = authMode === 'local'
    ? normalizeUsernameLocal(username)
    : normalizeUsername(username);
  if (!normalized) {
    return { available: false, normalized, reason: 'invalid' };
  }
  if (authMode === 'local') {
    const users = readLocalUsers();
    const existing = users[normalized];
    if (!existing || !existing.uid) {
      return { available: true, normalized };
    }
    return { available: false, normalized, reason: 'taken' };
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
  await initFirebaseAuth();
  if (authMode === 'local') {
    const normalized = normalizeUsernameLocal(username);
    if (!normalized) {
      throw new Error('Username must use letters, numbers, periods, underscores, or dashes.');
    }
    if (typeof password !== 'string' || !password) {
      throw new Error('Invalid username or password.');
    }
    const users = readLocalUsers();
    const record = users[normalized];
    if (!record?.uid || !record?.salt || !record?.pwHash) {
      throw new Error('Invalid username or password.');
    }
    const hashed = await hashPasswordWithSalt(password, record.salt);
    if (hashed !== record.pwHash) {
      throw new Error('Invalid username or password.');
    }
    const session = {
      uid: record.uid,
      username: record.username,
      createdAt: record.createdAt || Date.now(),
    };
    writeLocalSession(session);
    setAuthState({ uid: record.uid, username: record.username });
    return { user: currentUser };
  }
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
  await initFirebaseAuth();
  if (authMode === 'local') {
    const normalized = normalizeUsernameLocal(username);
    if (!normalized) {
      throw new Error('Username must use letters, numbers, periods, underscores, or dashes.');
    }
    await assertPasswordCompliant(password);
    const users = readLocalUsers();
    if (users[normalized]) {
      throw new Error('Username unavailable');
    }
    const uid = `local-${randomId(12)}`;
    const salt = base64RandomBytes(16);
    const pwHash = await hashPasswordWithSalt(password, salt);
    const createdAt = Date.now();
    const record = { uid, username: normalized, salt, pwHash, createdAt };
    users[normalized] = record;
    writeLocalUsers(users);
    const session = {
      uid,
      username: normalized,
      createdAt,
    };
    writeLocalSession(session);
    setAuthState({ uid, username: normalized });
    return { user: currentUser };
  }
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
  await initFirebaseAuth();
  if (authMode === 'local') {
    clearLocalSession();
    setAuthState({ uid: '' });
    return null;
  }
  const auth = await initFirebaseAuth();
  return auth.signOut();
}

export function ensureGuestSession() {
  const { uid } = getAuthState();
  if (uid) return { uid };
  authMode = 'local';
  const guestUid = ensureGuestId();
  const session = {
    uid: guestUid,
    username: 'Guest',
    createdAt: Date.now(),
  };
  writeLocalSession(session);
  setAuthState({ uid: guestUid, username: 'Guest', isGuest: true });
  return { uid: guestUid };
}
