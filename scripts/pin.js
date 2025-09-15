const KEY_PREFIX = 'pin:';
const CLOUD_PINS_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/pins';

function key(name) {
  return KEY_PREFIX + name;
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function loadCloudPin(name) {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await fetch(`${CLOUD_PINS_URL}/${encodeName(name)}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function deleteCloudPin(name) {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await fetch(`${CLOUD_PINS_URL}/${encodeName(name)}.json`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function syncPin(name) {
  if (hasPin(name)) return;
  try {
    const hash = await loadCloudPin(name);
    if (typeof hash === 'string' && hash) {
      localStorage.setItem(key(name), hash);
    }
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud pin load failed', e);
    }
  }
}

export async function setPin(name, pin) {
  const hash = await hashPin(pin);
  localStorage.setItem(key(name), hash);
  try {
    await saveCloudPin(name, hash);
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud pin save failed', e);
    }
  }
}

export function hasPin(name) {
  return localStorage.getItem(key(name)) !== null;
}

export async function verifyPin(name, pin) {
  const stored = localStorage.getItem(key(name));
  if (!stored) return false;
  const hash = await hashPin(pin);
  return stored === hash;
}

export async function clearPin(name) {
  localStorage.removeItem(key(name));
  try {
    await deleteCloudPin(name);
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud pin delete failed', e);
    }
  }
}

export async function movePin(oldName, newName) {
  await syncPin(oldName);
  const oldKey = key(oldName);
  const val = localStorage.getItem(oldKey);
  if (val) {
    localStorage.setItem(key(newName), val);
    localStorage.removeItem(oldKey);
    try {
      await saveCloudPin(newName, val);
      await deleteCloudPin(oldName);
    } catch (e) {
      if (e && e.message !== 'fetch not supported') {
        console.error('Cloud pin move failed', e);
      }
    }
  }
}
