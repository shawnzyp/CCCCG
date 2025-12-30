import { canonicalCharacterKey, friendlyCharacterName } from './character-keys.js';
import { getFirebaseDatabase } from './auth.js';

const KEY_PREFIX = 'pin:';
const CLOUD_PINS_PATH = 'pins';

function key(name) {
  const n = canonicalCharacterKey(name);
  return n ? KEY_PREFIX + n : null;
}

function safeLocalStorageGet(itemKey) {
  if (!itemKey) return null;
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    return localStorage.getItem(itemKey);
  } catch (err) {
    console.error(`Failed to read localStorage key ${itemKey}`, err);
    return null;
  }
}

function safeLocalStorageSet(itemKey, value) {
  if (!itemKey) return false;
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
      return false;
    }
    localStorage.setItem(itemKey, value);
    return true;
  } catch (err) {
    console.error(`Failed to persist localStorage key ${itemKey}`, err);
    return false;
  }
}

function safeLocalStorageRemove(itemKey) {
  if (!itemKey) return false;
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.removeItem !== 'function') {
      return false;
    }
    localStorage.removeItem(itemKey);
    return true;
  } catch (err) {
    console.error(`Failed to remove localStorage key ${itemKey}`, err);
    return false;
  }
}

function encodeName(name) {
  if (typeof name !== 'string' || !name) return '';
  return name
    .split('/')
    .map(segment => (typeof segment === 'string' ? segment : ''))
    .filter(segment => segment.length > 0)
    .map(segment => {
      if (segment === '.' || segment === '..') {
        return encodeURIComponent(segment.replace(/\./g, '%2E'));
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

async function hashPin(pin) {
  try {
    if (crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  return pin;
}

async function saveCloudPin(name, hash) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) throw new Error('Missing pin name');
  const db = await getFirebaseDatabase();
  await db.ref(`${CLOUD_PINS_PATH}/${encodeName(normalized)}`).set(hash);
}

async function loadCloudPin(name) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) throw new Error('Missing pin name');
  const db = await getFirebaseDatabase();
  const snapshot = await db.ref(`${CLOUD_PINS_PATH}/${encodeName(normalized)}`).once('value');
  return snapshot.val();
}

async function deleteCloudPin(name) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) throw new Error('Missing pin name');
  const db = await getFirebaseDatabase();
  await db.ref(`${CLOUD_PINS_PATH}/${encodeName(normalized)}`).remove();
}

function isNavigatorOffline() {
  return (
    typeof navigator !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(navigator, 'onLine') &&
    navigator.onLine === false
  );
}

async function getPinsBaseUrl() {
  const db = await getFirebaseDatabase();
  const base = db?.app?.options?.databaseURL;
  if (!base) return '';
  return `${base.replace(/\/$/, '')}/${CLOUD_PINS_PATH}`;
}

async function enqueueCloudPin(op, name, hash = null) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const ready = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller || ready.active;
    if (!controller) return false;
    const pinsUrl = await getPinsBaseUrl();
    controller.postMessage({
      type: 'queue-pin',
      op,
      name,
      hash: hash ?? null,
      pinsUrl,
      queuedAt: Date.now(),
    });
    if (ready.sync && typeof ready.sync.register === 'function') {
      try {
        await ready.sync.register('cloud-save-sync');
      } catch {}
    } else {
      controller.postMessage({ type: 'flush-cloud-saves' });
    }
    return true;
  } catch (e) {
    console.error('Failed to queue cloud pin', e);
    return false;
  }
}

function shouldQueuePinError(err) {
  return isNavigatorOffline() || err?.name === 'TypeError';
}

function parseCloudPinRecord(record) {
  if (record === false || record == null) return { hash: null, revoked: true };
  if (record === true) return { hash: null, revoked: false, exists: true };
  if (typeof record === 'string') return { hash: record, revoked: false, exists: true };
  if (typeof record === 'object') {
    const hash = typeof record.hash === 'string' && record.hash ? record.hash : null;
    const revoked = record.revokedAt !== undefined && record.revokedAt !== null;
    const exists = record.exists === true || revoked || !!hash;
    return { hash, revoked, exists };
  }
  return { hash: null, revoked: true };
}

export async function syncPin(name, { force = false } = {}) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) return false;
  name = normalized;
  if (!force && hasPin(name)) return true;
  try {
    const record = await loadCloudPin(name);
    const { hash, revoked } = parseCloudPinRecord(record);
    if (revoked || !hash) {
      safeLocalStorageRemove(key(name));
      return false;
    }
    return safeLocalStorageSet(key(name), hash);
  } catch (e) {
    console.error('Cloud pin load failed', e);
  }
  return false;
}

export async function setPin(name, pin) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) return false;
  name = normalized;
  try {
    const hash = await hashPin(pin);
    const stored = safeLocalStorageSet(key(name), hash);
    try {
      await saveCloudPin(name, hash);
    } catch (e) {
      const queued = shouldQueuePinError(e) && (await enqueueCloudPin('set', name, hash));
      if (!queued && (e && e.name !== 'TypeError')) {
        console.error('Cloud pin save failed', e);
      }
    }
    return stored;
  } catch (err) {
    console.error(`Failed to set PIN for ${name}`, err);
    return false;
  }
}

export function hasPin(name) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) return false;
  return safeLocalStorageGet(key(normalized)) !== null;
}

export async function verifyPin(name, pin) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) return false;
  const stored = safeLocalStorageGet(key(normalized));
  if (!stored) return false;
  try {
    const hash = await hashPin(pin);
    return stored === hash;
  } catch (err) {
    console.error(`Failed to verify PIN for ${name}`, err);
    return false;
  }
}

export async function clearPin(name) {
  const normalized = canonicalCharacterKey(name);
  if (!normalized) return false;
  name = normalized;
  const removed = safeLocalStorageRemove(key(name));
  try {
    await deleteCloudPin(name);
  } catch (e) {
    const queued = shouldQueuePinError(e) && (await enqueueCloudPin('delete', name));
    if (!queued && (e && e.name !== 'TypeError')) {
      console.error('Cloud pin delete failed', e);
    }
  }
  return removed;
}

export async function movePin(oldName, newName) {
  const normalizedOld = canonicalCharacterKey(oldName);
  const normalizedNew = canonicalCharacterKey(newName);
  if (!normalizedOld || !normalizedNew) return false;
  oldName = normalizedOld;
  newName = normalizedNew;
  try {
    await syncPin(oldName);
    const oldKey = key(oldName);
    const val = safeLocalStorageGet(oldKey);
    if (!val) {
      return false;
    }
    const stored = safeLocalStorageSet(key(newName), val);
    if (!stored) {
      return false;
    }
    safeLocalStorageRemove(oldKey);
    try {
      await saveCloudPin(newName, val);
    } catch (e) {
      const queued = shouldQueuePinError(e) && (await enqueueCloudPin('set', newName, val));
      if (!queued) {
        console.error('Cloud pin move failed', e);
      }
    }
    try {
      await deleteCloudPin(oldName);
    } catch (e) {
      const queued = shouldQueuePinError(e) && (await enqueueCloudPin('delete', oldName));
      if (!queued) {
        console.error('Cloud pin move failed', e);
      }
    }
    return true;
  } catch (err) {
    console.error(`Failed to move PIN from ${oldName} to ${newName}`, err);
    return false;
  }
}

export async function ensureAuthoritativePinState(name, { force = false } = {}) {
  const normalized = canonicalCharacterKey(name);
  const displayName = friendlyCharacterName(name);
  if (!normalized) return { pinned: false, source: 'local-fallback' };
  name = normalized;
  if (!force) {
    return { pinned: hasPin(name), source: 'local-cache', name: displayName || name };
  }
  const fallback = () => ({ pinned: hasPin(name), source: 'local-fallback', name: displayName || name });
  try {
    const record = await loadCloudPin(name);
    const { hash, revoked, exists } = parseCloudPinRecord(record);
    if (revoked || (!hash && exists !== true)) {
      safeLocalStorageRemove(key(name));
      return { pinned: false, source: 'cloud', name: displayName || name };
    }
    if (hash && (force || !hasPin(name))) {
      safeLocalStorageSet(key(name), hash);
    }
    if (hash) {
      return { pinned: true, source: 'cloud', name: displayName || name };
    }
    return fallback();
  } catch (err) {
    console.error('Authoritative PIN sync failed', err);
    return fallback();
  }
}
