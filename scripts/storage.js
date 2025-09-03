export async function saveLocal(name, payload) {
  try {
    localStorage.setItem('save:' + name, JSON.stringify(payload));
    localStorage.setItem('last-save', name);
  } catch (e) {
    console.error('Local save failed', e);
    throw e;
  }
}

export async function loadLocal(name) {
  try {
    const raw = localStorage.getItem('save:' + name);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Local load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteSave(name) {
  try {
    localStorage.removeItem('save:' + name);
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
    console.error('Local delete failed', e);
  }
}

export function listLocalSaves() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('save:')) keys.push(k.slice(5));
    }
    return keys.sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Local list failed', e);
    return [];
  }
}

// ===== Firebase Cloud Save =====
const CLOUD_SAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves';

export async function saveCloud(name, payload) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await fetch(`${CLOUD_SAVES_URL}/${encodeURIComponent(name)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    localStorage.setItem('last-save', name);
  } catch (e) {
    console.error('Cloud save failed', e);
    throw e;
  }
}

export async function loadCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await fetch(`${CLOUD_SAVES_URL}/${encodeURIComponent(name)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    console.error('Cloud load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await fetch(`${CLOUD_SAVES_URL}/${encodeURIComponent(name)}.json`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
    console.error('Cloud delete failed', e);
  }
}

export async function listCloudSaves() {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await fetch(`${CLOUD_SAVES_URL}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    // Keys in the realtime database are URL-encoded because we escape them when
    // saving. Decode them here so callers receive the original player names.
    return val ? Object.keys(val).map(k => decodeURIComponent(k)) : [];
  } catch (e) {
    console.error('Cloud list failed', e);
    return [];
  }
}
