const DM_PERSISTENT_SESSION_KEY = 'cc:dm:persistent-session';
const ANON_NAMESPACE_KEY = 'cc:last-save:anon-id';
const LAST_SAVE_LEGACY_KEY = 'last-save';

function getLocalStorageSafe() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function hashNamespace(ns) {
  if (typeof ns !== 'string' || !ns) return '';
  let hash = 0;
  for (let i = 0; i < ns.length; i++) {
    hash = (hash << 5) - hash + ns.charCodeAt(i);
    hash |= 0; // Keep as 32-bit int
  }
  return Math.abs(hash >>> 0).toString(36);
}

function sanitizeNamespace(ns) {
  if (typeof ns !== 'string') return '';
  const trimmed = ns.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
  const hashed = hashNamespace(trimmed);
  const segments = [normalized || 'user', hashed].filter(Boolean);
  return segments.join('-').slice(0, 64);
}

function isValidStoredNamespaceToken(ns) {
  return typeof ns === 'string' && /^[a-z0-9_-]{1,64}$/.test(ns);
}

function readStoredNamespace(storage, key) {
  if (!storage) return '';
  try {
    const raw = storage.getItem(key);
    return isValidStoredNamespaceToken(raw) ? raw : '';
  } catch {
    return '';
  }
}

function generateAnonId() {
  try {
    if (typeof crypto === 'object' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return token;
}

function resolveNamespace(storage) {
  if (!storage) return '';
  try {
    const raw = storage.getItem(DM_PERSISTENT_SESSION_KEY);
    if (typeof raw === 'string' && raw) {
      try {
        const parsed = JSON.parse(raw);
        const username = sanitizeNamespace(parsed?.username);
        if (username) return `dm:${username}`;
      } catch {}
    }
  } catch {}

  try {
    let anon = readStoredNamespace(storage, ANON_NAMESPACE_KEY);
    if (!anon) {
      anon = sanitizeNamespace(generateAnonId());
      if (anon) storage.setItem(ANON_NAMESPACE_KEY, anon);
    }
    if (anon) return `anon:${anon}`;
  } catch {}

  return '';
}

function getLastSaveKey(storage = getLocalStorageSafe()) {
  const namespace = resolveNamespace(storage);
  return namespace ? `${LAST_SAVE_LEGACY_KEY}:${namespace}` : LAST_SAVE_LEGACY_KEY;
}

export function readLastSaveName() {
  const storage = getLocalStorageSafe();
  if (!storage) return '';
  const key = getLastSaveKey(storage);
  try {
    const current = storage.getItem(key);
    if (typeof current === 'string' && current.trim()) {
      return current.trim();
    }

    const legacy = storage.getItem(LAST_SAVE_LEGACY_KEY);
    if (typeof legacy === 'string' && legacy.trim()) {
      const normalized = legacy.trim();
      if (key !== LAST_SAVE_LEGACY_KEY) {
        try {
          storage.setItem(key, normalized);
          storage.removeItem(LAST_SAVE_LEGACY_KEY);
        } catch {}
      }
      return normalized;
    }
    return '';
  } catch {
    return '';
  }
}

export function writeLastSaveName(name) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  const normalized = typeof name === 'string' ? name.trim() : '';
  if (!normalized) {
    clearLastSaveName();
    return;
  }
  const key = getLastSaveKey(storage);
  try {
    storage.setItem(key, normalized);
    if (key !== LAST_SAVE_LEGACY_KEY) {
      storage.removeItem(LAST_SAVE_LEGACY_KEY);
    }
  } catch {}
}

export function clearLastSaveName(targetName = '') {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  const key = getLastSaveKey(storage);
  try {
    if (!targetName || storage.getItem(key) === targetName) {
      storage.removeItem(key);
    }
  } catch {}
  try {
    if (!targetName || storage.getItem(LAST_SAVE_LEGACY_KEY) === targetName) {
      storage.removeItem(LAST_SAVE_LEGACY_KEY);
    }
  } catch {}
}

export function getLastSaveStorageKey() {
  return getLastSaveKey();
}
