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
const CLOUD_HISTORY_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/history';

let lastHistoryTimestamp = 0;
let offlineSyncToastShown = false;
let offlineQueueToastShown = false;

function nextHistoryTimestamp() {
  const now = Date.now();
  if (now <= lastHistoryTimestamp) {
    lastHistoryTimestamp += 1;
  } else {
    lastHistoryTimestamp = now;
  }
  return lastHistoryTimestamp;
}

function isNavigatorOffline() {
  return (
    typeof navigator !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(navigator, 'onLine') &&
    navigator.onLine === false
  );
}

function showToast(message, type = 'info') {
  if (typeof window !== 'undefined' && typeof window.toast === 'function') {
    window.toast(message, type);
  } else if (typeof toast === 'function') {
    toast(message, type);
  }
}

function notifySyncPaused() {
  if (!offlineSyncToastShown) {
    showToast('Cloud sync paused while offline', 'info');
    offlineSyncToastShown = true;
  }
}

function notifySaveQueued() {
  if (!offlineQueueToastShown) {
    showToast('Offline: changes will sync when you reconnect', 'info');
    offlineQueueToastShown = true;
  }
}

function resetOfflineNotices() {
  offlineSyncToastShown = false;
  offlineQueueToastShown = false;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', resetOfflineNotices);
}

// Direct fetch helper used by cloud save functions.
async function cloudFetch(url, options = {}) {
  return fetch(url, options);
}

// Encode each path segment separately so callers can supply hierarchical
// keys like `Alice/hero1` without worrying about Firebase escaping.
function encodePath(name) {
  return name
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

async function attemptCloudSave(name, payload, ts) {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await cloudFetch(`${CLOUD_SAVES_URL}/${encodePath(name)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  localStorage.setItem('last-save', name);

  await cloudFetch(
    `${CLOUD_HISTORY_URL}/${encodePath(name)}/${ts}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  const listRes = await cloudFetch(
    `${CLOUD_HISTORY_URL}/${encodePath(name)}.json`,
    { method: 'GET' }
  );
  if (listRes.ok) {
    const val = await listRes.json();
    const keys = val ? Object.keys(val).map(k => Number(k)).sort((a, b) => b - a) : [];
    const excess = keys.slice(3);
    await Promise.all(
      excess.map(k =>
        cloudFetch(
          `${CLOUD_HISTORY_URL}/${encodePath(name)}/${k}.json`,
          { method: 'DELETE' }
        )
      )
    );
  }
}

async function enqueueCloudSave(name, payload, ts) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const ready = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller || ready.active;
    if (!controller) return false;
    let data = payload;
    try {
      if (typeof structuredClone === 'function') {
        data = structuredClone(payload);
      } else {
        data = JSON.parse(JSON.stringify(payload));
      }
    } catch {
      // Fall back to original payload if cloning fails.
    }
    controller.postMessage({ type: 'queue-cloud-save', name, payload: data, ts });
    if (ready.sync && typeof ready.sync.register === 'function') {
      await ready.sync.register('cloud-save-sync');
    } else {
      controller.postMessage({ type: 'flush-cloud-saves' });
    }
    return true;
  } catch (e) {
    console.error('Failed to queue cloud save', e);
    return false;
  }
}

export async function saveCloud(name, payload) {
  if (!isNavigatorOffline()) {
    offlineQueueToastShown = false;
  }
  const ts = nextHistoryTimestamp();
  try {
    await attemptCloudSave(name, payload, ts);
    return 'saved';
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    const shouldQueue = isNavigatorOffline() || e?.name === 'TypeError';
    if (shouldQueue && (await enqueueCloudSave(name, payload, ts))) {
      notifySaveQueued();
      return 'queued';
    }
    console.error('Cloud save failed', e);
    throw e;
  }
}

export async function loadCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(
      `${CLOUD_SAVES_URL}/${encodePath(name)}.json`,
      { method: 'GET' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud load failed', e);
    }
  }
  throw new Error('No save found');
}

export async function deleteCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(`${CLOUD_SAVES_URL}/${encodePath(name)}.json`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud delete failed', e);
  }
}

export async function listCloudSaves() {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(`${CLOUD_SAVES_URL}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    // Keys in the realtime database are URL-encoded because we escape them when
    // saving. Decode them here so callers receive the original character names.
    return val ? Object.keys(val).map(k => decodeURIComponent(k)) : [];
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud list failed', e);
    return [];
  }
}

export async function listCloudBackups(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(
      `${CLOUD_HISTORY_URL}/${encodePath(name)}.json`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    return val
      ? Object.keys(val)
          .map(k => Number(k))
          .sort((a, b) => b - a)
          .map(ts => ({ ts }))
      : [];
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud history list failed', e);
    return [];
  }
}

export async function listCloudBackupNames() {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(`${CLOUD_HISTORY_URL}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    return val ? Object.keys(val).map(k => decodeURIComponent(k)) : [];
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud history names failed', e);
    return [];
  }
}

export async function loadCloudBackup(name, ts) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(
      `${CLOUD_HISTORY_URL}/${encodePath(name)}/${ts}.json`,
      { method: 'GET' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud history load failed', e);
    }
  }
  throw new Error('No backup found');
}

export async function cacheCloudSaves(
  listFn = listCloudSaves,
  loadFn = loadCloud,
  saveFn = saveLocal
) {
  try {
    if (isNavigatorOffline()) {
      notifySyncPaused();
      return;
    }
    offlineSyncToastShown = false;
    const keys = await listFn();
    // Cache all available saves so local storage reflects the cloud state.
    await Promise.all(
      keys.map(async k => {
        try {
          const data = await loadFn(k);
          await saveFn(k, data);
        } catch (e) {
          if (e && e.message === 'fetch not supported') {
            throw e;
          }
          console.error('Failed to cache', k, e);
        }
      })
    );
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Failed to cache cloud saves', e);
  }
}

// Listen for realtime updates from the Firebase database and cache them
// locally. This keeps all open tabs in sync without manual refreshes.
export function subscribeCloudSaves(onChange = cacheCloudSaves) {
  try {
    if (typeof EventSource !== 'function') return null;

    const src = new EventSource(`${CLOUD_SAVES_URL}.json`);
    const handler = () => onChange();

    src.addEventListener('put', handler);
    src.addEventListener('patch', handler);
    src.onerror = () => {
      try { src.close(); } catch {}
      setTimeout(() => subscribeCloudSaves(onChange), 2000);
    };

    // Prime local cache immediately on subscription.
    onChange();
    return src;
  } catch (e) {
    console.error('Failed to subscribe to cloud saves', e);
    return null;
  }
}
