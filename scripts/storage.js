import { toast } from './notifications.js';

const LOCAL_STORAGE_QUOTA_ERROR_CODE = 'local-storage-quota-exceeded';

function isQuotaExceededError(err) {
  if (!err) return false;
  const code = typeof err.code === 'number' ? err.code : null;
  if (code === 22 || code === 1014) return true;
  const name = typeof err.name === 'string' ? err.name : '';
  const message = typeof err.message === 'string' ? err.message : '';
  if (/quotaexceedederror/i.test(name)) return true;
  if (/ns_error_dom_quota_reached/i.test(name)) return true;
  if (/quota/i.test(message) || /ns_error_dom_quota_reached/i.test(message)) return true;
  return false;
}

function pruneOldestLocalSave({ excludeKeys = new Set() } = {}) {
  if (typeof localStorage === 'undefined') return null;
  const candidates = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('save:')) continue;
    if (excludeKeys.has(key)) continue;
    candidates.push({ key, name: key.slice(5), order: candidates.length });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
  const target = candidates[0];
  try {
    localStorage.removeItem(target.key);
  } catch (err) {
    console.error('Failed to prune local save', err);
    return null;
  }
  try {
    if (localStorage.getItem('last-save') === target.name) {
      localStorage.removeItem('last-save');
    }
  } catch (err) {
    console.error('Failed to update last-save after pruning', err);
  }
  return target.name;
}

export async function saveLocal(name, payload) {
  const storageKey = 'save:' + name;
  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    console.error('Failed to serialize local save payload', err);
    throw err;
  }
  const attemptPersist = () => {
    localStorage.setItem(storageKey, serialized);
    try {
      localStorage.setItem('last-save', name);
    } catch (err) {
      console.warn('Failed to update last-save pointer', err);
    }
  };
  try {
    attemptPersist();
    return;
  } catch (e) {
    if (!isQuotaExceededError(e)) {
      console.error('Local save failed', e);
      throw e;
    }
    const excludedKeys = new Set([storageKey]);
    const prunedNames = [];
    let lastError = e;
    while (true) {
      const prunedName = pruneOldestLocalSave({ excludeKeys: excludedKeys });
      if (!prunedName) break;
      prunedNames.push(prunedName);
      excludedKeys.add('save:' + prunedName);
      try {
        attemptPersist();
        if (prunedNames.length > 0) {
          try {
            const detail = prunedNames.length === 1
              ? `Removed the oldest save (${prunedNames[0]}) to free up space.`
              : `Removed the oldest saves (${prunedNames.join(', ')}) to free up space.`;
            toast(`Local storage was full. ${detail}`, {
              type: 'warning',
              duration: 8000,
            });
          } catch (toastErr) {
            console.error('Failed to display quota recovery toast', toastErr);
          }
        }
        return;
      } catch (err) {
        lastError = err;
        if (!isQuotaExceededError(err)) break;
      }
    }
    const quotaError = new Error('Local storage is full. Open Load/Save to export or delete old saves, then try again.');
    quotaError.name = 'LocalStorageQuotaError';
    quotaError.code = LOCAL_STORAGE_QUOTA_ERROR_CODE;
    quotaError.isQuotaExceeded = true;
    quotaError.pruned = prunedNames;
    quotaError.cause = lastError instanceof Error ? lastError : e;
    let quotaToastShown = false;
    try {
      toast('Local storage is full. Open Load/Save to export or delete old saves, then try again.', {
        type: 'error',
        duration: 8000,
      });
      quotaToastShown = true;
    } catch (toastErr) {
      console.error('Failed to display quota error toast', toastErr);
    }
    quotaError.toastShown = quotaToastShown;
    console.error('Local save failed', quotaError);
    throw quotaError;
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

let lastHistoryTimestamp = 0;
let offlineSyncToastShown = false;
let offlineQueueToastShown = false;
const SYNC_STATUS_STORAGE_KEY = 'cloud-sync-status';
const VALID_SYNC_STATUSES = new Set(['online', 'syncing', 'queued', 'reconnecting', 'offline']);
const OUTBOX_DB_NAME = 'cccg-cloud-outbox';
const OUTBOX_VERSION = 2;
const OUTBOX_STORE = 'cloud-saves';
const OUTBOX_PINS_STORE = 'cloud-pins';

const syncErrorListeners = new Set();
const syncActivityListeners = new Set();
const syncQueueListeners = new Set();
let lastSyncActivityAt = null;

function emitSyncError(payload = {}) {
  syncErrorListeners.forEach(listener => {
    try {
      listener(payload);
    } catch (err) {
      console.error('Sync error listener failed', err);
    }
  });
}

function emitSyncActivity(payload = {}) {
  const timestamp = Number.isFinite(payload?.timestamp)
    ? payload.timestamp
    : Date.now();
  lastSyncActivityAt = timestamp;
  const enriched = { ...payload, timestamp };
  syncActivityListeners.forEach(listener => {
    try {
      listener(enriched);
    } catch (err) {
      console.error('Sync activity listener failed', err);
    }
  });
}

function emitSyncQueueUpdate() {
  syncQueueListeners.forEach(listener => {
    try {
      listener();
    } catch (err) {
      console.error('Sync queue listener failed', err);
    }
  });
}

export function getLastSyncActivity() {
  return lastSyncActivityAt;
}

export function subscribeSyncErrors(listener) {
  if (typeof listener !== 'function') return () => {};
  syncErrorListeners.add(listener);
  return () => {
    syncErrorListeners.delete(listener);
  };
}

export function subscribeSyncActivity(listener) {
  if (typeof listener !== 'function') return () => {};
  syncActivityListeners.add(listener);
  if (lastSyncActivityAt !== null) {
    try {
      listener({ timestamp: lastSyncActivityAt, type: 'initial' });
    } catch (err) {
      console.error('Sync activity listener failed', err);
    }
  }
  return () => {
    syncActivityListeners.delete(listener);
  };
}

export function subscribeSyncQueue(listener) {
  if (typeof listener !== 'function') return () => {};
  syncQueueListeners.add(listener);
  try {
    listener();
  } catch (err) {
    console.error('Sync queue listener failed', err);
  }
  return () => {
    syncQueueListeners.delete(listener);
  };
}

function openOutboxDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('indexedDB not supported'));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(OUTBOX_PINS_STORE)) {
        db.createObjectStore(OUTBOX_PINS_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedCloudSaves() {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openOutboxDb();
    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readonly');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
    return entries
      .map(entry => ({
        id: entry?.id,
        name: typeof entry?.name === 'string' ? entry.name : '',
        ts: Number(entry?.ts),
        queuedAt: Number(entry?.queuedAt),
        kind: entry?.kind === 'autosave' ? 'autosave' : 'manual',
      }))
      .sort((a, b) => {
        if (Number.isFinite(a.queuedAt) && Number.isFinite(b.queuedAt) && a.queuedAt !== b.queuedAt) {
          return a.queuedAt - b.queuedAt;
        }
        if (Number.isFinite(a.ts) && Number.isFinite(b.ts) && a.ts !== b.ts) {
          return a.ts - b.ts;
        }
        if (Number.isFinite(a.id) && Number.isFinite(b.id)) {
          return a.id - b.id;
        }
        return 0;
      });
  } catch (err) {
    console.error('Failed to read queued cloud saves', err);
    return [];
  }
}

export async function clearQueuedCloudSaves({ includePins = false } = {}) {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openOutboxDb();
    await new Promise((resolve, reject) => {
      const stores = includePins ? [OUTBOX_STORE, OUTBOX_PINS_STORE] : [OUTBOX_STORE];
      const tx = db.transaction(stores, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      stores.forEach(storeName => {
        try {
          tx.objectStore(storeName).clear();
        } catch (storeErr) {
          reject(storeErr);
        }
      });
    });
    emitSyncQueueUpdate();
    return true;
  } catch (err) {
    console.error('Failed to clear queued cloud saves', err);
    emitSyncError({
      message: 'Failed to clear queued cloud saves',
      error: err,
      timestamp: Date.now(),
    });
    return false;
  }
}

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
  try {
    toast(message, type);
  } catch {}
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
  const res = await fetch(url, options);
  const ok = typeof res?.ok === 'boolean' ? res.ok : true;
  const status = typeof res?.status === 'number' ? res.status : 200;
  const json = typeof res?.json === 'function' ? res.json.bind(res) : async () => null;
  const text = typeof res?.text === 'function' ? res.text.bind(res) : async () => '';
  const arrayBuffer =
    typeof res?.arrayBuffer === 'function' ? res.arrayBuffer.bind(res) : async () => new ArrayBuffer(0);
  const blob = typeof res?.blob === 'function' ? res.blob.bind(res) : async () => new Blob();
  const clone = typeof res?.clone === 'function' ? res.clone.bind(res) : undefined;
  const headers = res?.headers ?? null;

  const normalized = { ok, status, json, text, arrayBuffer, blob, headers, raw: res ?? null };
  if (clone) {
    normalized.clone = clone;
  }
  if (res?.url) {
    normalized.url = res.url;
  }
  return normalized;
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

async function enqueueCloudSave(name, payload, ts, { kind = 'manual' } = {}) {
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
    controller.postMessage({ type: 'queue-cloud-save', name, payload: data, ts, kind });
    emitSyncQueueUpdate();
    if (ready.sync && typeof ready.sync.register === 'function') {
      await ready.sync.register('cloud-save-sync');
    } else {
      controller.postMessage({ type: 'flush-cloud-saves' });
    }
    return true;
  } catch (e) {
    console.error('Failed to queue cloud save', e);
    emitSyncError({
      message: 'Failed to queue cloud save',
      error: e,
      timestamp: Date.now(),
    });
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
    emitSyncActivity({ type: 'cloud-save', name, queued: false, timestamp: Date.now() });
    emitSyncQueueUpdate();
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
    if (shouldQueue) {
      setSyncStatus('offline');
    } else {
      setSyncStatus(previousStatus);
    }
    console.error('Cloud save failed', e);
    emitSyncError({
      message: 'Cloud save failed',
      error: e,
      name,
      timestamp: Date.now(),
    });
    throw e;
  }
}

export async function saveCloudAutosave(name, payload) {
  const ts = nextHistoryTimestamp();
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    await saveHistoryEntry(CLOUD_AUTOSAVES_URL, name, payload, ts);
    resetOfflineNotices();
    emitSyncActivity({ type: 'cloud-autosave', name, queued: false, timestamp: Date.now() });
    emitSyncQueueUpdate();
    return ts;
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    const shouldQueue = isNavigatorOffline() || e?.name === 'TypeError';
    if (shouldQueue && (await enqueueCloudSave(name, payload, ts, { kind: 'autosave' }))) {
      notifySaveQueued();
      emitSyncActivity({ type: 'cloud-autosave', name, queued: true, timestamp: Date.now() });
      return ts;
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
    emitSyncActivity({ type: 'cache-refresh', timestamp: Date.now() });
    emitSyncQueueUpdate();
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Failed to cache cloud saves', e);
    emitSyncError({
      message: 'Failed to refresh cloud saves',
      error: e,
      timestamp: Date.now(),
    });
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
