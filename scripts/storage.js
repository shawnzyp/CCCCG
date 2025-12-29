import { toast } from './notifications.js';
import { clearLastSaveName, readLastSaveName, writeLastSaveName } from './last-save.js';
import {
  addOutboxEntry,
  createCloudSaveOutboxEntry,
  deleteOutboxEntry,
  getOutboxEntries,
  openOutboxDb,
  OUTBOX_PINS_STORE,
  OUTBOX_STORE,
} from './cloud-outbox.js';

const LOCAL_STORAGE_QUOTA_ERROR_CODE = 'local-storage-quota-exceeded';
const DEVICE_ID_STORAGE_KEY = 'cc:device-id';
const CLOUD_SYNC_SUPPORT_MESSAGE = 'Cloud sync requires a modern browser. Local saves will continue to work.';
const FETCH_SUPPORTED = typeof fetch === 'function';
const EVENTSOURCE_SUPPORTED = typeof EventSource === 'function';
let cloudSyncDisabled = !FETCH_SUPPORTED;
let cloudSyncUnsupported = !FETCH_SUPPORTED || !EVENTSOURCE_SUPPORTED;
let cloudSyncDisabledReason = (() => {
  if (!FETCH_SUPPORTED && !EVENTSOURCE_SUPPORTED) {
    return 'Cloud sync requires fetch and EventSource support.';
  }
  if (!FETCH_SUPPORTED) {
    return 'Cloud sync requires fetch support.';
  }
  if (!EVENTSOURCE_SUPPORTED) {
    return 'Cloud sync requires EventSource support.';
  }
  return '';
})();
let cloudSyncSupportToastShown = false;

if (cloudSyncUnsupported) {
  if (cloudSyncDisabledReason) {
    console.warn('Cloud sync disabled:', cloudSyncDisabledReason);
  } else {
    console.warn('Cloud sync disabled');
  }
}

function getLocalStorageSafe() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function generateStableId() {
  try {
    if (typeof crypto === 'object' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 20; i++) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return token;
}

function getDeviceId() {
  const storage = getLocalStorageSafe();
  if (!storage) return '';
  try {
    const stored = storage.getItem(DEVICE_ID_STORAGE_KEY);
    if (typeof stored === 'string' && stored.trim()) {
      return stored.trim();
    }
    const fresh = generateStableId();
    storage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return '';
  }
}

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
    if (readLastSaveName() === target.name) {
      clearLastSaveName(target.name);
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
      writeLastSaveName(name);
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
    if (readLastSaveName() === name) {
      clearLastSaveName(name);
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
const VALID_SYNC_STATUSES = new Set([
  'online',
  'syncing',
  'queued',
  'reconnecting',
  'offline',
  'unsupported',
]);
const syncErrorListeners = new Set();
const syncActivityListeners = new Set();
const syncQueueListeners = new Set();
let lastSyncActivityAt = null;
let nextCloudQueueRequestId = 1;

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

export async function getQueuedCloudSaves() {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const entries = await getOutboxEntries(OUTBOX_STORE);
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

const INITIAL_SYNC_STATUS = (() => {
  if (cloudSyncUnsupported) return 'unsupported';
  if (
    typeof navigator !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(navigator, 'onLine') &&
    navigator.onLine === false
  ) {
    return 'offline';
  }
  return 'online';
})();

let lastSyncStatus = (() => {
  const fallback = INITIAL_SYNC_STATUS;
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
  const normalized = normalizeSyncStatus(status, lastSyncStatus || INITIAL_SYNC_STATUS);
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
  if (cloudSyncUnsupported && status !== 'unsupported') {
    emitSyncStatus('unsupported');
    return;
  }
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
  if (cloudSyncUnsupported) {
    showCloudSyncUnsupportedNotice();
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

function isCloudSyncAvailable() {
  return cloudSyncDisabled === false;
}

function showToast(message, type = 'info') {
  try {
    toast(message, type);
  } catch {}
}

function showCloudSyncUnsupportedNotice() {
  if (!cloudSyncUnsupported || cloudSyncSupportToastShown) return;
  cloudSyncSupportToastShown = true;
  try {
    toast(CLOUD_SYNC_SUPPORT_MESSAGE, { type: 'warning', duration: 10000 });
  } catch (err) {
    console.error('Failed to display cloud sync support notice', err);
  }
}

function disableCloudSync(reason) {
  if (cloudSyncDisabled) return;
  cloudSyncDisabled = true;
  cloudSyncUnsupported = true;
  cloudSyncDisabledReason = typeof reason === 'string' ? reason : '';
  if (cloudSyncDisabledReason) {
    console.warn('Cloud sync disabled:', cloudSyncDisabledReason);
  } else {
    console.warn('Cloud sync disabled');
  }
  emitSyncStatus('unsupported');
  showCloudSyncUnsupportedNotice();
}

function notifySyncPaused() {
  if (cloudSyncDisabled) return;
  if (!offlineSyncToastShown) {
    showToast('Cloud sync paused while offline', 'info');
    offlineSyncToastShown = true;
  }
  setSyncStatus('offline');
}

function notifySaveQueued() {
  if (cloudSyncDisabled) return;
  if (!offlineQueueToastShown) {
    showToast('Offline: changes will sync when you reconnect', 'info');
    offlineQueueToastShown = true;
  }
  setSyncStatus('queued');
}

function resetOfflineNotices() {
  offlineSyncToastShown = false;
  offlineQueueToastShown = false;
  if (!cloudSyncDisabled) {
    setSyncStatus('online');
  }
}

let controllerFlushListenerAttached = false;
let localOutboxFlushPromise = null;
let localOutboxOnlineListenerAttached = false;

function scheduleControllerFlush(registration) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const flush = () => {
    try {
      const worker =
        navigator.serviceWorker.controller ||
        registration?.active ||
        registration?.waiting ||
        registration?.installing ||
        null;
      worker?.postMessage({ type: 'flush-cloud-saves' });
    } catch (err) {
      console.error('Failed to request outbox flush', err);
    }
  };

  flush();

  if (navigator.serviceWorker.controller) {
    controllerFlushListenerAttached = false;
    return;
  }

  if (controllerFlushListenerAttached) return;
  if (typeof navigator.serviceWorker.addEventListener !== 'function') return;

  controllerFlushListenerAttached = true;
  const handler = () => {
    controllerFlushListenerAttached = false;
    try {
      if (typeof navigator.serviceWorker.removeEventListener === 'function') {
        navigator.serviceWorker.removeEventListener('controllerchange', handler);
      }
    } catch {}
    flush();
  };
  try {
    navigator.serviceWorker.addEventListener('controllerchange', handler);
  } catch (err) {
    controllerFlushListenerAttached = false;
    console.error('Failed to observe controller changes', err);
  }
}

function resolveAutosaveKey({ name, deviceId, characterId }) {
  const trimmedDevice = typeof deviceId === 'string' ? deviceId.trim() : '';
  const trimmedCharacter = typeof characterId === 'string' ? characterId.trim() : '';
  if (trimmedDevice && trimmedCharacter) {
    return `${trimmedDevice}/${trimmedCharacter}`;
  }
  if (trimmedCharacter) {
    return trimmedCharacter;
  }
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  return '';
}

function normalizeAutosaveOutboxEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { action: 'drop', reason: 'Invalid autosave outbox entry' };
  }
  const name = typeof entry.name === 'string' ? entry.name : '';
  let characterId = typeof entry.characterId === 'string' && entry.characterId.trim()
    ? entry.characterId.trim()
    : '';
  const payloadCharacterId = entry?.payload?.character?.characterId;
  if (!characterId && typeof payloadCharacterId === 'string' && payloadCharacterId.trim()) {
    characterId = payloadCharacterId.trim();
  }
  let deviceId = typeof entry.deviceId === 'string' && entry.deviceId.trim()
    ? entry.deviceId.trim()
    : '';
  if (!deviceId) {
    deviceId = getDeviceId();
  }
  if (!characterId) {
    return { action: 'drop', reason: 'Missing characterId for autosave outbox entry' };
  }
  if (!deviceId) {
    return { action: 'drop', reason: 'Missing deviceId for autosave outbox entry' };
  }
  return {
    action: 'keep',
    entry: {
      ...entry,
      name,
      deviceId,
      characterId,
    },
  };
}

async function pushQueuedAutosaveLocally({ name, payload, ts, deviceId, characterId }) {
  const autosaveKey = resolveAutosaveKey({ name, deviceId, characterId });
  if (!autosaveKey) {
    throw new Error('Invalid autosave key');
  }
  const encoded = encodePath(autosaveKey);
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for autosave');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const res = await cloudFetch(`${CLOUD_AUTOSAVES_URL}/${encoded}/${ts}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: serialized.json,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function flushLocalCloudOutbox() {
  if (typeof indexedDB === 'undefined') return;
  if (localOutboxFlushPromise) return localOutboxFlushPromise;
  if (isNavigatorOffline()) return;

  localOutboxFlushPromise = (async () => {
    const entries = await getOutboxEntries(OUTBOX_STORE).catch(() => []);
    if (!entries.length) return;

    entries.sort((a, b) => {
      if (Number.isFinite(a.ts) && Number.isFinite(b.ts) && a.ts !== b.ts) {
        return a.ts - b.ts;
      }
      if (Number.isFinite(a.queuedAt) && Number.isFinite(b.queuedAt) && a.queuedAt !== b.queuedAt) {
        return a.queuedAt - b.queuedAt;
      }
      if (Number.isFinite(a.id) && Number.isFinite(b.id)) {
        return a.id - b.id;
      }
      return 0;
    });

    let syncedAny = false;
    let lastSyncedEntry = null;
    for (const entry of entries) {
      try {
        if (entry?.kind === 'autosave') {
          const normalized = normalizeAutosaveOutboxEntry(entry);
          if (normalized.action === 'drop') {
            console.warn('Dropping legacy autosave outbox entry', normalized.reason, entry);
            if (entry?.id !== undefined) {
              await deleteOutboxEntry(entry.id, OUTBOX_STORE);
            }
            continue;
          }
          await pushQueuedAutosaveLocally(normalized.entry);
        } else {
          await attemptCloudSave(entry.name, entry.payload, entry.ts);
        }
        if (entry?.id !== undefined) {
          await deleteOutboxEntry(entry.id, OUTBOX_STORE);
        }
        syncedAny = true;
        lastSyncedEntry = entry;
      } catch (err) {
        if (err?.name === 'InvalidPayloadError') {
          console.warn('Dropping outbox entry with invalid payload', err, entry);
          if (entry?.id !== undefined) {
            await deleteOutboxEntry(entry.id, OUTBOX_STORE);
          }
          continue;
        }
        console.error('Local cloud outbox flush failed', err);
        break;
      }
    }

    if (syncedAny) {
      const activity = {
        type: lastSyncedEntry?.kind === 'autosave' ? 'cloud-autosave' : 'cloud-save',
        name: lastSyncedEntry?.name,
        queued: false,
        timestamp: Date.now(),
      };
      emitSyncActivity(activity);
      emitSyncQueueUpdate();
    }
  })()
    .catch(() => {})
    .finally(() => {
      localOutboxFlushPromise = null;
    });

  return localOutboxFlushPromise;
}

function ensureLocalOutboxOnlineListener() {
  if (localOutboxOnlineListenerAttached) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

  const handler = () => {
    flushLocalCloudOutbox().catch(() => {});
  };
  window.addEventListener('online', handler);
  localOutboxOnlineListenerAttached = true;
}

async function queueCloudSaveLocally(entry) {
  if (typeof indexedDB === 'undefined') return false;
  try {
    await addOutboxEntry(entry, OUTBOX_STORE);
    emitSyncQueueUpdate();
    ensureLocalOutboxOnlineListener();
    if (!isNavigatorOffline()) {
      flushLocalCloudOutbox().catch(() => {});
    }
    return true;
  } catch (err) {
    console.error('Failed to queue cloud save locally', err);
    emitSyncError({
      message: 'Failed to queue cloud save locally',
      error: err,
      timestamp: Date.now(),
    });
    return false;
  }
}

export function beginQueuedSyncFlush() {
  if (cloudSyncDisabled) {
    return;
  }
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
function sanitizePathSegment(segment) {
  if (typeof segment !== 'string') return '';
  return segment
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[#$\[\]]/g, '_');
}

function encodePath(name) {
  if (typeof name !== 'string' || !name) return '';
  return name
    .split('/')
    .map(segment => sanitizePathSegment(typeof segment === 'string' ? segment : ''))
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment).replace(/\./g, '%2E'))
    .join('/');
}

function sanitizeForJson(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return { value: undefined };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { value: null };
  }
  if (value && typeof value === 'object') {
    if (typeof value.toJSON === 'function') {
      return sanitizeForJson(value.toJSON(), seen);
    }
    if (seen.has(value)) {
      return { error: new Error('Circular JSON value detected') };
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const next = [];
      for (const entry of value) {
        const result = sanitizeForJson(entry, seen);
        if (result.error) return result;
        next.push(result.value === undefined ? null : result.value);
      }
      seen.delete(value);
      return { value: next };
    }
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const result = sanitizeForJson(entry, seen);
      if (result.error) return result;
      if (result.value !== undefined) {
        next[key] = result.value;
      }
    }
    seen.delete(value);
    return { value: next };
  }
  return { value };
}

function safeJsonStringify(value) {
  const sanitized = sanitizeForJson(value);
  if (sanitized.error) {
    return { ok: false, error: sanitized.error, value: null, json: null };
  }
  try {
    return { ok: true, value: sanitized.value, json: JSON.stringify(sanitized.value) };
  } catch (err) {
    return { ok: false, error: err, value: null, json: null };
  }
}

function decodePath(name) {
  if (typeof name !== 'string' || !name) return '';
  return name
    .split('/')
    .map(segment => {
      if (typeof segment !== 'string' || segment.length === 0) {
        return null;
      }
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => typeof segment === 'string' && segment.length > 0)
    .join('/');
}

async function saveHistoryEntry(baseUrl, name, payload, ts) {
  const encodedName = encodePath(name);
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for cloud save');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }

  const res = await cloudFetch(
    `${baseUrl}/${encodedName}/${ts}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: serialized.json,
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
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for cloud save');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const res = await cloudFetch(`${CLOUD_SAVES_URL}/${encodePath(name)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: serialized.json,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  try {
    writeLastSaveName(name);
  } catch (err) {
    console.warn('Failed to update last-save pointer after cloud save', err);
    emitSyncError({
      message: 'Failed to update last-save pointer after cloud save',
      error: err,
      name,
      severity: 'warning',
      timestamp: Date.now(),
    });
  }

  try {
    await saveHistoryEntry(CLOUD_HISTORY_URL, name, serialized.value, ts);
  } catch (err) {
    console.warn('Failed to update cloud save history after successful save', err);
    emitSyncError({
      message: 'Failed to update cloud save history after successful save',
      error: err,
      name,
      severity: 'warning',
      timestamp: Date.now(),
    });
    throw err;
  }
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

  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for campaign log');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const res = await cloudFetch(`${CLOUD_CAMPAIGN_LOG_URL}/${encodePath(id)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: serialized.json,
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
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    console.warn('Failed to serialize cloud save payload for queueing', serialized.error);
    return false;
  }
  const data = serialized.value;
  const deviceId = getDeviceId();
  const characterId = payload?.character?.characterId || payload?.characterId || '';

  let entry;
  try {
    entry = createCloudSaveOutboxEntry({
      name,
      payload: data,
      ts,
      kind,
      deviceId,
      characterId,
    });
  } catch (err) {
    console.error('Failed to prepare cloud save entry', err);
    return false;
  }

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return queueCloudSaveLocally(entry);
  }

  try {
    const ready = await navigator.serviceWorker.ready;
    const controller = navigator.serviceWorker.controller || null;
    const activeWorker = ready?.active || null;
    if (!controller) {
      const queued = await queueCloudSaveLocally(entry);
      if (ready?.sync && typeof ready.sync.register === 'function') {
        try {
          await ready.sync.register('cloud-save-sync');
        } catch {}
      }
      scheduleControllerFlush(ready);
      return queued;
    }

    const requestId = nextCloudQueueRequestId++;
    const message = {
      type: 'queue-cloud-save',
      name,
      payload: entry.payload,
      ts: entry.ts,
      deviceId,
      characterId,
      kind: entry.kind,
      queuedAt: entry.queuedAt,
      requestId,
    };

    const ackTimeoutMs = 5000;
    const waitForAck = () => {
      if (typeof MessageChannel === 'function') {
        const channel = new MessageChannel();
        const { port1, port2 } = channel;
        return new Promise(resolve => {
          let settled = false;
          const cleanup = () => {
            settled = true;
            try { port1.onmessage = null; } catch {}
            try { port1.close(); } catch {}
          };
          const timeoutId = setTimeout(() => {
            if (settled) return;
            cleanup();
            resolve({ ok: false, error: { message: 'Timed out waiting for service worker' }, timeout: true });
          }, ackTimeoutMs);
          port1.onmessage = event => {
            if (settled) return;
            clearTimeout(timeoutId);
            cleanup();
            resolve(event?.data ?? null);
          };
          controller.postMessage(message, [port2]);
        });
      }

      return new Promise(resolve => {
        let settled = false;
        let timeoutId = null;
        const cleanup = () => {
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (typeof navigator?.serviceWorker?.removeEventListener === 'function') {
            try { navigator.serviceWorker.removeEventListener('message', handler); } catch {}
          }
        };
        const handler = event => {
          const detail = event?.data;
          if (!detail || typeof detail !== 'object') return;
          if (detail.type !== 'queue-cloud-save-result') return;
          if (detail.requestId !== requestId) return;
          if (settled) return;
          settled = true;
          cleanup();
          resolve(detail);
        };
        if (typeof navigator?.serviceWorker?.addEventListener === 'function') {
          try { navigator.serviceWorker.addEventListener('message', handler, { once: false }); } catch {}
        }
        timeoutId = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ ok: false, error: { message: 'Timed out waiting for service worker' }, timeout: true });
        }, ackTimeoutMs);
        try {
          controller.postMessage(message);
        } catch (err) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ ok: false, error: err });
        }
      });
    };

    const response = await waitForAck();
    if (!response || response.ok !== true) {
      const responseError = response?.error ?? null;
      const normalizedError = (() => {
        if (responseError instanceof Error) return responseError;
        if (responseError && typeof responseError === 'object') {
          const err = new Error(responseError.message || 'Failed to queue cloud save');
          Object.assign(err, responseError);
          return err;
        }
        if (typeof responseError === 'string') {
          return new Error(responseError);
        }
        if (response?.timeout) {
          return new Error('Timed out waiting for service worker to queue save');
        }
        return new Error('Failed to queue cloud save');
      })();
      console.error('Service worker failed to queue cloud save', normalizedError);
      emitSyncError({
        message: 'Failed to queue cloud save',
        error: normalizedError,
        name,
        timestamp: Date.now(),
      });
      showToast('Failed to queue cloud save. Changes will retry when possible.', 'error');
      return false;
    }

    emitSyncQueueUpdate();
    if (ready.sync && typeof ready.sync.register === 'function') {
      await ready.sync.register('cloud-save-sync');
    } else {
      (controller || activeWorker)?.postMessage({ type: 'flush-cloud-saves' });
    }
    return true;
  } catch (e) {
    console.error('Failed to queue cloud save', e);
    emitSyncError({
      message: 'Failed to queue cloud save',
      error: e,
      timestamp: Date.now(),
    });
    if (typeof indexedDB !== 'undefined') {
      return queueCloudSaveLocally(entry);
    }
    return false;
  }
}

export async function saveCloud(name, payload) {
  if (!isCloudSyncAvailable()) {
    showCloudSyncUnsupportedNotice();
    return 'disabled';
  }
  if (typeof fetch !== 'function') {
    disableCloudSync('fetch not supported');
    return 'disabled';
  }
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
      disableCloudSync('fetch not supported');
      return 'disabled';
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
  if (!isCloudSyncAvailable()) {
    showCloudSyncUnsupportedNotice();
    return null;
  }
  if (typeof fetch !== 'function') {
    disableCloudSync('fetch not supported');
    return null;
  }
  const ts = nextHistoryTimestamp();
  const deviceId = getDeviceId();
  const characterId = payload?.character?.characterId || payload?.characterId || '';
  const autosaveKey = resolveAutosaveKey({ name, deviceId, characterId });
  const autosavePath = autosaveKey
    ? `${CLOUD_AUTOSAVES_URL}/${encodePath(autosaveKey)}/${ts}.json`
    : `${CLOUD_AUTOSAVES_URL}/.json`;
  const payloadWithMeta = {
    ...payload,
    meta: {
      ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      name: typeof name === 'string' ? name : '',
    },
  };
  try {
    if (!autosaveKey) {
      throw new Error('Invalid autosave key');
    }
    if (!characterId) {
      console.warn('Autosave missing characterId; falling back to sanitized name path');
    }
    await saveHistoryEntry(CLOUD_AUTOSAVES_URL, autosaveKey, payloadWithMeta, ts);
    resetOfflineNotices();
    emitSyncActivity({ type: 'cloud-autosave', name, queued: false, timestamp: Date.now() });
    emitSyncQueueUpdate();
    return ts;
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      disableCloudSync('fetch not supported');
      return null;
    }
    const shouldQueue = isNavigatorOffline() || e?.name === 'TypeError';
    if (shouldQueue && (await enqueueCloudSave(name, payloadWithMeta, ts, { kind: 'autosave' }))) {
      notifySaveQueued();
      emitSyncActivity({ type: 'cloud-autosave', name, queued: true, timestamp: Date.now() });
      return ts;
    }
    console.error('Cloud autosave failed', autosavePath, e);
    throw e;
  }
}

export async function loadCloud(name, { signal } = {}) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await cloudFetch(
      `${CLOUD_SAVES_URL}/${encodePath(name)}.json`,
      { method: 'GET', signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw e;
    }
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
    if (readLastSaveName() === name) {
      clearLastSaveName(name);
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
    return val ? Object.keys(val).map(k => decodePath(k)) : [];
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

export async function listCloudAutosaves(name, { characterId = '' } = {}) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const autosaveKey = resolveAutosaveKey({ name, deviceId: getDeviceId(), characterId });
    if (!autosaveKey) return [];
    const res = await cloudFetch(
      `${CLOUD_AUTOSAVES_URL}/${encodePath(autosaveKey)}.json`
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
    return val ? Object.keys(val).map(k => decodePath(k)) : [];
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
    const deviceId = getDeviceId();
    if (!deviceId) return [];
    const res = await cloudFetch(`${CLOUD_AUTOSAVES_URL}/${encodePath(deviceId)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (!val || typeof val !== 'object') return [];
    const names = [];
    for (const entry of Object.values(val)) {
      if (!entry || typeof entry !== 'object') continue;
      const timestamps = Object.keys(entry)
        .map(key => Number(key))
        .filter(ts => Number.isFinite(ts))
        .sort((a, b) => b - a);
      const latest = timestamps.length ? entry[timestamps[0]] : null;
      const name = latest?.meta?.name;
      if (typeof name === 'string' && name.trim()) {
        names.push(name.trim());
      }
    }
    return names;
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

export async function loadCloudAutosave(name, ts, { characterId = '' } = {}) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const autosaveKey = resolveAutosaveKey({ name, deviceId: getDeviceId(), characterId });
    if (!autosaveKey) throw new Error('Invalid autosave key');
    const res = await cloudFetch(
      `${CLOUD_AUTOSAVES_URL}/${encodePath(autosaveKey)}/${ts}.json`,
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

const CACHE_CLOUD_BATCH_SIZE = 5; // Limit concurrent cloud fetches per batch.
let cacheNavigationAbortController = null;
let cacheNavigationAbortListenersAttached = false;

function getCacheNavigationAbortController() {
  if (typeof AbortController !== 'function') return null;

  if (
    !cacheNavigationAbortListenersAttached &&
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    const abortActiveCache = () => {
      cacheNavigationAbortController?.abort();
    };

    window.addEventListener('pagehide', abortActiveCache);
    window.addEventListener('beforeunload', abortActiveCache);
    window.addEventListener('visibilitychange', () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        abortActiveCache();
      }
    });

    cacheNavigationAbortListenersAttached = true;
  }

  if (cacheNavigationAbortController && !cacheNavigationAbortController.signal.aborted) {
    cacheNavigationAbortController.abort();
  }

  cacheNavigationAbortController = new AbortController();
  return cacheNavigationAbortController;
}

export async function cacheCloudSaves(
  listFn = listCloudSaves,
  loadFn = loadCloud,
  saveFn = saveLocal
) {
  if (cloudSyncDisabled) {
    showCloudSyncUnsupportedNotice();
    return;
  }
  let abortController = null;
  try {
    if (isNavigatorOffline()) {
      notifySyncPaused();
      return;
    }
    offlineSyncToastShown = false;
    abortController = getCacheNavigationAbortController();
    const signal = abortController?.signal ?? null;

    const keys = await listFn();

    if (signal?.aborted) {
      return;
    }

    for (let i = 0; i < keys.length; i += CACHE_CLOUD_BATCH_SIZE) {
      if (signal?.aborted) {
        return;
      }

      const batch = keys.slice(i, i + CACHE_CLOUD_BATCH_SIZE);
      await Promise.all(
        batch.map(async k => {
          if (signal?.aborted) {
            return;
          }

          try {
            const data = await loadFn(k, { signal });
            if (signal?.aborted) {
              return;
            }
            await saveFn(k, data);
          } catch (e) {
            if (e?.name === 'AbortError' || signal?.aborted) {
              throw e;
            }
            if (e && e.message === 'fetch not supported') {
              throw e;
            }
            if (e && e.message === 'No save found') {
              return;
            }
            console.error('Failed to cache', k, e);
          }
        })
      );
    }

    if (signal?.aborted) {
      return;
    }

    resetOfflineNotices();
    emitSyncActivity({ type: 'cache-refresh', timestamp: Date.now() });
    emitSyncQueueUpdate();
  } catch (e) {
    if (e?.name === 'AbortError') {
      return;
    }
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    if (e && e.message === 'No save found') {
      return;
    }
    console.error('Failed to cache cloud saves', e);
    emitSyncError({
      message: 'Failed to refresh cloud saves',
      error: e,
      timestamp: Date.now(),
    });
  } finally {
    if (abortController && cacheNavigationAbortController === abortController) {
      cacheNavigationAbortController = null;
    }
  }
}

// Listen for realtime updates from the Firebase database and cache them
// locally. This keeps all open tabs in sync without manual refreshes.
export function subscribeCloudSaves(onChange = cacheCloudSaves) {
  try {
    if (cloudSyncDisabled || typeof EventSource !== 'function') {
      if (cloudSyncUnsupported) {
        showCloudSyncUnsupportedNotice();
      }
      return null;
    }

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
