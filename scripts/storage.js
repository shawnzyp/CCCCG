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
const CLOUD_AUTOSAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/autosaves';
const CLOUD_CAMPAIGN_LOG_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/campaignLogs';

const OUTBOX_DB = 'cccg-cloud-outbox';
const OUTBOX_VERSION = 2;
const OUTBOX_STORE = 'cloud-saves';

const LAST_SYNC_TS_KEY = 'cloud-sync-last-success';

let lastHistoryTimestamp = 0;
let offlineSyncToastShown = false;
let offlineQueueToastShown = false;
const SYNC_STATUS_STORAGE_KEY = 'cloud-sync-status';
const VALID_SYNC_STATUSES = new Set(['online', 'syncing', 'queued', 'reconnecting', 'offline']);

function normalizeSyncStatus(status, fallback = 'online') {
  if (typeof status !== 'string') return fallback;
  const normalized = status.trim().toLowerCase();
  return VALID_SYNC_STATUSES.has(normalized) ? normalized : fallback;
}

let lastSyncStatus = (() => {
  const fallback = isNavigatorOffline() ? 'offline' : 'online';
  try {
    if (typeof sessionStorage !== 'undefined') {
      const stored = sessionStorage.getItem(SYNC_STATUS_STORAGE_KEY);
      if (stored) {
        return normalizeSyncStatus(stored, fallback);
      }
    }
  } catch (err) {}
  return fallback;
})();

try {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SYNC_STATUS_STORAGE_KEY, lastSyncStatus);
  }
} catch (err) {}

const syncStatusListeners = new Set();

function emitSyncEvent(type, detail = {}) {
  if (typeof type !== 'string' || !type) return;
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      const payload = { ...detail };
      if (typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(`cloud-sync:${type}`, { detail: payload }));
      }
    }
  } catch (err) {
    console.error('Failed to emit sync event', err);
  }
}

function serializeSyncError(err) {
  if (!err) {
    return { message: 'Unknown error' };
  }
  if (err instanceof Error) {
    const { name, message, stack } = err;
    return {
      name,
      message: message || name || 'Unknown error',
      stack: typeof stack === 'string' ? stack : undefined,
    };
  }
  if (typeof err === 'object') {
    const message = typeof err.message === 'string' ? err.message : JSON.stringify(err);
    return { ...err, message };
  }
  return { message: String(err) };
}

function setLastSyncTimestamp(ts = Date.now()) {
  const value = Number.isFinite(ts) ? ts : Date.now();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SYNC_TS_KEY, String(value));
    }
  } catch {}
}

export function getLastSyncTimestamp() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LAST_SYNC_TS_KEY);
      if (stored) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  } catch {}
  return null;
}

function emitSyncStatus(status) {
  const normalized = normalizeSyncStatus(status, lastSyncStatus || 'online');
  if (normalized === lastSyncStatus) return;
  lastSyncStatus = normalized;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SYNC_STATUS_STORAGE_KEY, normalized);
    }
  } catch (err) {}
  syncStatusListeners.forEach(listener => {
    try {
      listener(normalized);
    } catch (err) {
      console.error('Sync status listener failed', err);
    }
  });
}

function setSyncStatus(status) {
  emitSyncStatus(status);
}

export function subscribeSyncStatus(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  syncStatusListeners.add(listener);
  try {
    listener(lastSyncStatus);
  } catch (err) {
    console.error('Sync status listener failed', err);
  }
  return () => {
    syncStatusListeners.delete(listener);
  };
}

export function getLastSyncStatus() {
  return lastSyncStatus;
}
let lastCampaignLogTimestamp = 0;

function nextHistoryTimestamp() {
  const now = Date.now();
  if (now <= lastHistoryTimestamp) {
    lastHistoryTimestamp += 1;
  } else {
    lastHistoryTimestamp = now;
  }
  return lastHistoryTimestamp;
}

function nextCampaignLogTimestamp() {
  const now = Date.now();
  if (now <= lastCampaignLogTimestamp) {
    lastCampaignLogTimestamp += 1;
  } else {
    lastCampaignLogTimestamp = now;
  }
  return lastCampaignLogTimestamp;
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
  setSyncStatus('offline');
}

function notifySaveQueued() {
  if (!offlineQueueToastShown) {
    showToast('Offline: changes will sync when you reconnect', 'info');
    offlineQueueToastShown = true;
  }
  setSyncStatus('queued');
}

function resetOfflineNotices() {
  offlineSyncToastShown = false;
  offlineQueueToastShown = false;
  setSyncStatus('online');
}

export function beginQueuedSyncFlush() {
  if (lastSyncStatus === 'queued') {
    setSyncStatus('reconnecting');
  }
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

async function saveHistoryEntry(baseUrl, name, payload, ts) {
  const encodedName = encodePath(name);

  const res = await cloudFetch(
    `${baseUrl}/${encodedName}/${ts}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const parseKeys = (val) =>
    val
      ? Object.keys(val)
          .map((k) => Number(k))
          .filter((k) => Number.isFinite(k))
          .sort((a, b) => b - a)
      : [];

  let keys = [];

  try {
    const limitedRes = await cloudFetch(
      `${baseUrl}/${encodedName}.json?orderBy="$key"&limitToLast=4`,
      { method: 'GET' }
    );
    if (!limitedRes.ok) {
      throw new Error(`HTTP ${limitedRes.status}`);
    }
    const val = await limitedRes.json();
    keys = parseKeys(val);
  } catch (err) {
    try {
      const listRes = await cloudFetch(
        `${baseUrl}/${encodedName}.json`,
        { method: 'GET' }
      );
      if (!listRes.ok) return;
      const val = await listRes.json();
      keys = parseKeys(val);
    } catch (legacyErr) {
      return;
    }
  }

  const excess = keys.slice(3);
  await Promise.all(
    excess.map((k) =>
      cloudFetch(`${baseUrl}/${encodedName}/${k}.json`, {
        method: 'DELETE',
      })
    )
  );
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

  await saveHistoryEntry(CLOUD_HISTORY_URL, name, payload, ts);
}

export async function appendCampaignLogEntry(entry = {}) {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');

  const id = typeof entry.id === 'string' && entry.id ? entry.id : String(nextCampaignLogTimestamp());
  let ts = typeof entry.t === 'number' && Number.isFinite(entry.t) ? entry.t : Date.now();
  if (!Number.isFinite(ts) || ts <= 0) {
    ts = nextCampaignLogTimestamp();
  } else if (ts <= lastCampaignLogTimestamp) {
    ts = nextCampaignLogTimestamp();
  } else {
    lastCampaignLogTimestamp = ts;
  }

  const payload = {
    t: ts,
    name: typeof entry.name === 'string' ? entry.name : '',
    text: typeof entry.text === 'string' ? entry.text : '',
  };

  const res = await cloudFetch(`${CLOUD_CAMPAIGN_LOG_URL}/${encodePath(id)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return { ...payload, id };
}

export async function deleteCampaignLogEntry(id) {
  if (typeof id !== 'string' || !id) return;
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await cloudFetch(`${CLOUD_CAMPAIGN_LOG_URL}/${encodePath(id)}.json`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function fetchCampaignLogEntries() {
  if (typeof fetch !== 'function') throw new Error('fetch not supported');
  const res = await cloudFetch(`${CLOUD_CAMPAIGN_LOG_URL}.json`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data) return [];
  const entries = Object.entries(data).map(([id, value]) => {
    const record = value && typeof value === 'object' ? value : {};
    const rawTs = Number(record.t);
    const t = Number.isFinite(rawTs) && rawTs > 0 ? rawTs : Date.now();
    return {
      id,
      t,
      name: typeof record.name === 'string' ? record.name : '',
      text: typeof record.text === 'string' ? record.text : '',
    };
  }).sort((a, b) => a.t - b.t);

  if (entries.length) {
    const maxTs = entries[entries.length - 1].t;
    if (Number.isFinite(maxTs) && maxTs > lastCampaignLogTimestamp) {
      lastCampaignLogTimestamp = maxTs;
    }
  }

  return entries;
}

export function subscribeCampaignLog(onChange) {
  try {
    if (typeof EventSource !== 'function') {
      if (typeof onChange === 'function') {
        onChange();
      }
      return null;
    }

    const src = new EventSource(`${CLOUD_CAMPAIGN_LOG_URL}.json`);
    const handler = () => {
      if (typeof onChange === 'function') {
        onChange();
      }
    };

    src.addEventListener('put', handler);
    src.addEventListener('patch', handler);
    src.onerror = () => {
      try { src.close(); } catch {}
      setTimeout(() => subscribeCampaignLog(onChange), 2000);
    };

    if (typeof onChange === 'function') {
      onChange();
    }

    return src;
  } catch (e) {
    console.error('Failed to subscribe to campaign log', e);
    if (typeof onChange === 'function') {
      try { onChange(); } catch {}
    }
    return null;
  }
}

function openOutboxDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let resolved = false;
    const req = indexedDB.open(OUTBOX_DB, OUTBOX_VERSION);
    req.onupgradeneeded = () => {
      const { result: db } = req;
      if (!db) return;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      resolved = true;
      resolve(req.result || null);
    };
    req.onerror = () => {
      if (!resolved) {
        reject(req.error || new Error('Failed to open outbox database'));
      }
    };
  });
}

function sortQueuedEntries(entries) {
  return entries.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.queuedAt && b.queuedAt && a.queuedAt !== b.queuedAt) return a.queuedAt - b.queuedAt;
    if (a.id && b.id) return a.id - b.id;
    return 0;
  });
}

export async function listQueuedCloudSaves() {
  try {
    const db = await openOutboxDb();
    if (!db) return [];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readonly');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const entries = Array.isArray(req.result) ? req.result.slice() : [];
        resolve(sortQueuedEntries(entries));
      };
      req.onerror = () => reject(req.error || new Error('Failed to read queued saves'));
    });
  } catch (err) {
    console.error('Failed to list queued cloud saves', err);
    emitSyncEvent('error', { stage: 'list-queue', error: serializeSyncError(err) });
    return [];
  }
}

export async function deleteQueuedCloudSave(id) {
  if (typeof id === 'undefined' || id === null) return;
  try {
    const db = await openOutboxDb();
    if (!db) {
      emitSyncEvent('queuechange', { action: 'delete', id });
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to delete queued save'));
      tx.objectStore(OUTBOX_STORE).delete(id);
    });
    emitSyncEvent('queuechange', { action: 'delete', id });
  } catch (err) {
    console.error('Failed to delete queued cloud save', err);
    emitSyncEvent('error', { stage: 'delete-queue', error: serializeSyncError(err) });
    throw err;
  }
}

export async function clearQueuedCloudSaves() {
  try {
    const db = await openOutboxDb();
    if (!db) {
      emitSyncEvent('queuechange', { action: 'clear' });
      return;
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Failed to clear queued saves'));
      tx.objectStore(OUTBOX_STORE).clear();
    });
    emitSyncEvent('queuechange', { action: 'clear' });
  } catch (err) {
    console.error('Failed to clear queued cloud saves', err);
    emitSyncEvent('error', { stage: 'clear-queue', error: serializeSyncError(err) });
    throw err;
  }
}

export async function flushQueuedCloudSaves() {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller || reg.active;
    beginQueuedSyncFlush();
    if (reg.sync && typeof reg.sync.register === 'function') {
      try {
        await reg.sync.register('cloud-save-sync');
      } catch (err) {
        // ignore sync registration failures, we'll still post a message below
      }
    }
    worker?.postMessage({ type: 'flush-cloud-saves' });
    emitSyncEvent('flush-requested', { timestamp: Date.now() });
  } catch (err) {
    console.error('Failed to request queued cloud save flush', err);
    emitSyncEvent('error', { stage: 'flush-request', error: serializeSyncError(err) });
    throw err;
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
    const queuedAt = Date.now();
    controller.postMessage({ type: 'queue-cloud-save', name, payload: data, ts });
    if (ready.sync && typeof ready.sync.register === 'function') {
      await ready.sync.register('cloud-save-sync');
    } else {
      controller.postMessage({ type: 'flush-cloud-saves' });
    }
    emitSyncEvent('queued', { name, ts, queuedAt });
    emitSyncEvent('queuechange', { action: 'add', name, ts, queuedAt });
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
  const previousStatus = lastSyncStatus;
  setSyncStatus('syncing');
  try {
    await attemptCloudSave(name, payload, ts);
    resetOfflineNotices();
    const now = Date.now();
    setLastSyncTimestamp(now);
    emitSyncEvent('success', { name, timestamp: now, source: 'save-cloud' });
    return 'saved';
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    const shouldQueue = isNavigatorOffline() || e?.name === 'TypeError';
    if (shouldQueue && (await enqueueCloudSave(name, payload, ts))) {
      notifySaveQueued();
      emitSyncEvent('queued', {
        name,
        ts,
        queuedAt: Date.now(),
        source: 'save-cloud',
        error: serializeSyncError(e),
      });
      return 'queued';
    }
    if (shouldQueue) {
      setSyncStatus('offline');
    } else {
      setSyncStatus(previousStatus);
    }
    console.error('Cloud save failed', e);
    emitSyncEvent('error', { stage: 'save-cloud', name, ts, error: serializeSyncError(e) });
    throw e;
  }
}

export async function saveCloudAutosave(name, payload) {
  const ts = nextHistoryTimestamp();
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    await saveHistoryEntry(CLOUD_AUTOSAVES_URL, name, payload, ts);
    return ts;
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud autosave failed', e);
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

export async function listCloudAutosaves(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(
      `${CLOUD_AUTOSAVES_URL}/${encodePath(name)}.json`
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
    console.error('Cloud autosave list failed', e);
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

export async function listCloudAutosaveNames() {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(`${CLOUD_AUTOSAVES_URL}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    return val ? Object.keys(val).map(k => decodeURIComponent(k)) : [];
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud autosave names failed', e);
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

export async function loadCloudAutosave(name, ts) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(
      `${CLOUD_AUTOSAVES_URL}/${encodePath(name)}/${ts}.json`,
      { method: 'GET' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud autosave load failed', e);
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
    resetOfflineNotices();
    const now = Date.now();
    setLastSyncTimestamp(now);
    emitSyncEvent('success', { timestamp: now, source: 'cache-cloud-saves' });
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
