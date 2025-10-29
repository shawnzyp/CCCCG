const KEY_PREFIX = 'pin:';
const CLOUD_PINS_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/pins';

function key(name) {
  return KEY_PREFIX + name;
}

function safeLocalStorageGet(itemKey) {
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
  return name
    .split('/')
    .map((s) => encodeURIComponent(s))
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
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await fetch(`${CLOUD_PINS_URL}/${encodeName(name)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hash)
  });
  if (!res || typeof res.ok !== 'boolean') {
    throw new TypeError('invalid response');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function loadCloudPin(name) {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await fetch(`${CLOUD_PINS_URL}/${encodeName(name)}.json`);
  if (!res || typeof res.ok !== 'boolean') {
    throw new TypeError('invalid response');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function deleteCloudPin(name) {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await fetch(`${CLOUD_PINS_URL}/${encodeName(name)}.json`, { method: 'DELETE' });
  if (!res || typeof res.ok !== 'boolean') {
    throw new TypeError('invalid response');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function isNavigatorOffline() {
  return (
    typeof navigator !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(navigator, 'onLine') &&
    navigator.onLine === false
  );
}

async function enqueueCloudPin(op, name, hash = null) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const ready = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller || ready.active;
    if (!controller) return false;
    controller.postMessage({
      type: 'queue-pin',
      op,
      name,
      hash: hash ?? null,
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

export async function syncPin(name) {
  if (hasPin(name)) return true;
  try {
    const hash = await loadCloudPin(name);
    if (typeof hash === 'string' && hash) {
      return safeLocalStorageSet(key(name), hash);
    }
  } catch (e) {
    if (e && e.message !== 'fetch not supported' && e.name !== 'TypeError') {
      console.error('Cloud pin load failed', e);
    }
  }
  return false;
}

export async function setPin(name, pin) {
  try {
    const hash = await hashPin(pin);
    const stored = safeLocalStorageSet(key(name), hash);
    try {
      await saveCloudPin(name, hash);
    } catch (e) {
      if (e && e.message === 'fetch not supported') return stored;
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
  return safeLocalStorageGet(key(name)) !== null;
}

export async function verifyPin(name, pin) {
  const stored = safeLocalStorageGet(key(name));
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
  const removed = safeLocalStorageRemove(key(name));
  try {
    await deleteCloudPin(name);
  } catch (e) {
    if (e && e.message === 'fetch not supported') return removed;
    const queued = shouldQueuePinError(e) && (await enqueueCloudPin('delete', name));
    if (!queued && (e && e.name !== 'TypeError')) {
      console.error('Cloud pin delete failed', e);
    }
  }
  return removed;
}

export async function movePin(oldName, newName) {
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
      if (e && e.message !== 'fetch not supported' && e.name !== 'TypeError') {
        const queued = shouldQueuePinError(e) && (await enqueueCloudPin('set', newName, val));
        if (!queued) {
          console.error('Cloud pin move failed', e);
        }
      }
    }
    try {
      await deleteCloudPin(oldName);
    } catch (e) {
      if (e && e.message !== 'fetch not supported' && e.name !== 'TypeError') {
        const queued = shouldQueuePinError(e) && (await enqueueCloudPin('delete', oldName));
        if (!queued) {
          console.error('Cloud pin move failed', e);
        }
      }
    }
    return true;
  } catch (err) {
    console.error(`Failed to move PIN from ${oldName} to ${newName}`, err);
    return false;
  }
}
