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

function sanitizeNamespace(ns) {
  if (typeof ns !== 'string') return '';
  const trimmed = ns.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_-]/g, '');
  return normalized.slice(0, 64);
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
    let anon = sanitizeNamespace(storage.getItem(ANON_NAMESPACE_KEY) || '');
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
