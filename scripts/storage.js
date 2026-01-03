import { toast } from './notifications.js';
import { clearLastSaveName, readLastSaveName, writeLastSaveName } from './last-save.js';
import { getAuthMode, getFirebaseDatabase } from './auth.js';
import { canonicalCharacterKey, friendlyCharacterName } from './character-keys.js';
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
const LOCAL_CLOUD_INDEX_PREFIX = 'cccg.localCloud.index.';
const LOCAL_CLOUD_CHARACTER_PREFIX = 'cccg.localCloud.character.';
const LOCAL_CLOUD_AUTOSAVE_PREFIX = 'cccg.localCloud.autosave.';
const DEVICE_ID_STORAGE_KEY = 'cc:device-id';
const LAST_USER_UID_KEY = 'cc:last-user-uid';
const CHARACTER_ID_STORAGE_PREFIX = 'cc:character-id:';
const AUTOSAVE_DEBUG_KEY = 'cc:debug-autosave-url';
const LAST_SYNCED_PREFIX = 'cc:last-synced:';
const CONFLICT_SNAPSHOT_PREFIX = 'cc:conflict:';
const CLOUD_SYNC_SUPPORT_MESSAGE = 'Cloud sync requires a modern browser. Local saves will continue to work.';
let cloudSyncDisabled = false;
let cloudSyncUnsupported = false;
let cloudSyncDisabledReason = '';
let cloudSyncSupportToastShown = false;
let cloudAuthNoticeShown = false;
let localAuthNoticeShown = false;
let topLevelRefWarningShown = false;
let databaseRefFactory = null;

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

function showLocalAuthModeNotice() {
  if (localAuthNoticeShown) return;
  localAuthNoticeShown = true;
  try {
    toast('Cloud sync unavailable in local account mode. Using device storage.', 'info');
  } catch (err) {
    console.warn('Failed to show local auth notice', err);
  }
}

function safeJsonParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getLocalCloudIndexKey(uid) {
  return `${LOCAL_CLOUD_INDEX_PREFIX}${uid || 'anon'}`;
}

function getLocalCloudCharacterKey(uid, characterId) {
  return `${LOCAL_CLOUD_CHARACTER_PREFIX}${uid || 'anon'}.${characterId || 'unknown'}`;
}

function getLocalCloudAutosaveKey(uid, characterId, ts) {
  return `${LOCAL_CLOUD_AUTOSAVE_PREFIX}${uid || 'anon'}.${characterId || 'unknown'}.${ts || 0}`;
}

function readLocalCloudIndex(uid) {
  const storage = getLocalStorageSafe();
  if (!storage) return {};
  const key = getLocalCloudIndexKey(uid);
  const raw = storage.getItem(key);
  const parsed = safeJsonParse(raw, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeLocalCloudIndex(uid, indexObj) {
  const storage = getLocalStorageSafe();
  if (!storage) return false;
  const key = getLocalCloudIndexKey(uid);
  const serialized = safeJsonStringify(indexObj);
  if (!serialized.ok) return false;
  try {
    storage.setItem(key, serialized.json);
    return true;
  } catch (err) {
    console.warn('Failed to write local cloud index', err);
    return false;
  }
}

function writeLocalCloudCharacter(uid, characterId, payload) {
  const storage = getLocalStorageSafe();
  if (!storage) return false;
  const key = getLocalCloudCharacterKey(uid, characterId);
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) return false;
  try {
    storage.setItem(key, serialized.json);
    return true;
  } catch (err) {
    console.warn('Failed to write local cloud character snapshot', err);
    return false;
  }
}

function readLocalCloudCharacter(uid, characterId) {
  const storage = getLocalStorageSafe();
  if (!storage) return null;
  const key = getLocalCloudCharacterKey(uid, characterId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  return safeJsonParse(raw, null);
}

function collectCharacterNameVariants(name) {
  const variants = new Set();
  const raw = typeof name === 'string' ? name.trim() : '';
  if (raw) {
    variants.add(raw);
  }
  const canonical = canonicalCharacterKey(raw);
  if (canonical) {
    variants.add(canonical);
  }
  const friendly = friendlyCharacterName(raw);
  if (friendly) {
    variants.add(friendly);
  }
  return Array.from(variants);
}

function readCharacterIdForName(name) {
  const storage = getLocalStorageSafe();
  if (!storage) return '';
  try {
    const variants = collectCharacterNameVariants(name);
    for (const variant of variants) {
      const stored = storage.getItem(`${CHARACTER_ID_STORAGE_PREFIX}${variant}`);
      if (typeof stored === 'string' && stored.trim()) {
        return stored.trim();
      }
    }
    return '';
  } catch {
    return '';
  }
}

function writeCharacterIdForName(name, id) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  if (!normalizedId) return;
  const variants = collectCharacterNameVariants(name);
  if (variants.length === 0) return;
  variants.forEach(variant => {
    try {
      storage.setItem(`${CHARACTER_ID_STORAGE_PREFIX}${variant}`, normalizedId);
    } catch (err) {
      console.warn('Failed to persist character-id mapping', err);
    }
  });
}

function updateCharacterIdMappings({ name, payload, characterId }) {
  const resolvedId = typeof characterId === 'string' && characterId.trim()
    ? characterId.trim()
    : (payload?.character?.characterId || payload?.characterId || '');
  if (!resolvedId) return;
  const candidates = new Set([
    name,
    payload?.meta?.name,
    payload?.meta?.displayName,
    payload?.character?.name,
  ]);
  candidates.forEach(candidate => {
    if (typeof candidate !== 'string' || !candidate.trim()) return;
    writeCharacterIdForName(candidate, resolvedId);
  });
}

let activeUserId = '';
let activeAuthUserId = '';

export function setActiveUserId(uid) {
  activeUserId = typeof uid === 'string' ? uid.trim() : '';
}

export function setActiveAuthUserId(uid) {
  activeAuthUserId = typeof uid === 'string' ? uid.trim() : '';
}

export function getActiveUserId() {
  return activeUserId;
}

export function getActiveAuthUserId() {
  return activeAuthUserId;
}

export function readLastUserUid() {
  const storage = getLocalStorageSafe();
  if (!storage) return '';
  try {
    const stored = storage.getItem(LAST_USER_UID_KEY);
    return typeof stored === 'string' && stored.trim() ? stored.trim() : '';
  } catch {
    return '';
  }
}

export function writeLastUserUid(uid) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  const normalized = typeof uid === 'string' ? uid.trim() : '';
  try {
    if (normalized) {
      storage.setItem(LAST_USER_UID_KEY, normalized);
    } else {
      storage.removeItem(LAST_USER_UID_KEY);
    }
  } catch {}
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

export function getDeviceId() {
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

function getLocalSaveKey(name, { characterId } = {}) {
  const normalizedId = typeof characterId === 'string' ? characterId.trim() : '';
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const key = normalizedId || normalizedName;
  return key ? `save:${key}` : '';
}

function isScopedSaveKey(key) {
  if (!key) return false;
  return key.startsWith('save:');
}

function pruneOldestLocalSave({ excludeKeys = new Set() } = {}) {
  if (typeof localStorage === 'undefined') return null;
  const candidates = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isScopedSaveKey(key)) continue;
    if (excludeKeys.has(key)) continue;
    const name = key.slice(5);
    candidates.push({ key, name, order: candidates.length });
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

export async function saveLocal(name, payload, { characterId } = {}) {
  const storageKey = getLocalSaveKey(name, { characterId });
  if (!storageKey) {
    throw new Error('Missing character id');
  }
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
    try {
      updateCharacterIdMappings({ name, payload, characterId });
    } catch (err) {
      console.warn('Failed to update character-id mapping', err);
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
      excludedKeys.add(getLocalSaveKey(prunedName));
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

export async function loadLocal(name, { characterId } = {}) {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) {
      throw new Error('Local storage unavailable');
    }
    const idsToTry = [];
    const resolvedId = typeof characterId === 'string' ? characterId.trim() : '';
    if (resolvedId) {
      idsToTry.push(resolvedId);
    } else if (typeof name === 'string' && name.trim()) {
      const mapped = readCharacterIdForName(name.trim());
      if (mapped) idsToTry.push(mapped);
    }
    if (typeof name === 'string' && name.trim()) {
      idsToTry.push(name.trim());
    }
    if (activeUserId && name) {
      idsToTry.push(`${activeUserId}:${name.trim()}`);
    }
    for (const id of idsToTry) {
      const raw = storage.getItem(`save:${id}`);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Local load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteSave(name, { characterId } = {}) {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return;
    const storageKey = getLocalSaveKey(name, { characterId });
    if (storageKey) {
      storage.removeItem(storageKey);
    }
    if (readLastSaveName() === name) {
      clearLastSaveName(name);
    }
  } catch (e) {
    console.error('Local delete failed', e);
  }
}

export function listLocalSaves({ includeLegacy = false } = {}) {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return [];
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k) continue;
      if (k.startsWith('save:')) {
        keys.push(k.slice(5));
        continue;
      }
      if (includeLegacy && k.startsWith('save:')) {
        keys.push(k.slice(5));
      }
    }
    return keys.sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Local list failed', e);
    return [];
  }
}

export async function loadLegacyLocal(name) {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) {
      throw new Error('Local storage unavailable');
    }
    const raw = storage.getItem(`save:${name}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Legacy local load failed', e);
  }
  throw new Error('No legacy save found');
}

export function listLegacyLocalSaves() {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return [];
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith('save:')) continue;
      if (/^save:[^:]+:.+/.test(k)) continue;
      keys.push(k.slice(5));
    }
    return keys.sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Legacy local list failed', e);
    return [];
  }
}

// ===== Firebase Cloud Save =====
const CLOUD_SAVES_PATH = 'saves';
const CLOUD_HISTORY_PATH = 'history';
const CLOUD_AUTOSAVES_PATH = 'autosaves';
const CLOUD_CAMPAIGN_LOG_PATH = 'campaignLogs';
const CLOUD_CHARACTERS_PATH = 'characters';
const CLOUD_USERS_PATH = 'users';

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
    toast(message, { type });
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

function showCloudAuthRequiredNotice() {
  if (cloudAuthNoticeShown) return;
  cloudAuthNoticeShown = true;
  showToast('Cloud sync requires sign-in.', 'info');
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
let autosaveDebugLogged = false;

function shouldLogAutosaveDebug() {
  const storage = getLocalStorageSafe();
  if (!storage) return false;
  try {
    return storage.getItem(AUTOSAVE_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

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

function resolveAutosaveKey({ uid, characterId }) {
  const trimmedUid = typeof uid === 'string' ? uid.trim() : '';
  const trimmedCharacter = typeof characterId === 'string' ? characterId.trim() : '';
  if (trimmedUid && trimmedCharacter) {
    return `${trimmedUid}/${trimmedCharacter}`;
  }
  return '';
}

function normalizeAutosaveOutboxEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { action: 'drop', reason: 'Invalid autosave outbox entry' };
  }
  const name = typeof entry.name === 'string' ? entry.name : '';
  const rawUid = typeof entry.uid === 'string' && entry.uid.trim()
    ? entry.uid.trim()
    : '';
  const rawCharacterId = typeof entry.characterId === 'string' && entry.characterId.trim()
    ? entry.characterId.trim()
    : '';
  let characterId = rawCharacterId;
  const payloadCharacterId = entry?.payload?.character?.characterId;
  if (!characterId && typeof payloadCharacterId === 'string' && payloadCharacterId.trim()) {
    characterId = payloadCharacterId.trim();
  }
  if (!rawUid && !rawCharacterId && !payloadCharacterId && name && !name.includes('/')) {
    return { action: 'drop', reason: 'Legacy autosave entry missing identifiers' };
  }
  const uid = rawUid || activeAuthUserId;
  if (!characterId) {
    return { action: 'drop', reason: 'Missing characterId for autosave outbox entry' };
  }
  if (!uid) {
    return { action: 'drop', reason: 'Missing uid for autosave outbox entry' };
  }
  return {
    action: 'keep',
    entry: {
      ...entry,
      name,
      uid,
      characterId,
    },
  };
}

async function pushQueuedAutosaveLocally({ name, payload, ts, uid, characterId }) {
  const autosaveKey = resolveAutosaveKey({ uid, characterId });
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
  const ref = await getDatabaseRef(`${CLOUD_AUTOSAVES_PATH}/${encoded}/${ts}`);
  await ref.set(serialized.value);
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

async function getDatabaseRef(path) {
  const isDevHost = typeof window !== 'undefined'
    && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');
  if (isDevHost && !topLevelRefWarningShown) {
    if (path === CLOUD_SAVES_PATH || path === CLOUD_CAMPAIGN_LOG_PATH) {
      topLevelRefWarningShown = true;
      console.warn('Detected top-level RTDB ref. Use UID-scoped paths for saves and campaign logs.', { path });
    }
  }
  if (typeof databaseRefFactory === 'function') {
    return databaseRefFactory(path);
  }
  const db = await getFirebaseDatabase();
  return db.ref(path);
}

export function setDatabaseRefFactory(factory) {
  databaseRefFactory = typeof factory === 'function' ? factory : null;
}

function getServerTimestampValue() {
  return window.firebase?.database?.ServerValue?.TIMESTAMP ?? Date.now();
}

async function getCloudUrlsForOutbox() {
  const db = await getFirebaseDatabase();
  const databaseURL = db?.app?.options?.databaseURL;
  if (!databaseURL) return null;
  const userPaths = getActiveUserPaths({ notify: false });
  if (!userPaths) return null;
  const base = databaseURL.replace(/\/$/, '');
  return {
    savesUrl: `${base}/${userPaths.savesPath}`,
    historyUrl: `${base}/${userPaths.historyPath}`,
    autosavesUrl: `${base}/${userPaths.autosavesPath}`,
  };
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

function getUserPaths(uid) {
  const normalizedUid = typeof uid === 'string' ? uid.trim() : '';
  if (!normalizedUid) return null;
  const encodedUid = encodePath(normalizedUid);
  return {
    charactersPath: `${CLOUD_CHARACTERS_PATH}/${encodedUid}`,
    autosavesPath: `${CLOUD_AUTOSAVES_PATH}/${encodedUid}`,
    historyPath: `${CLOUD_HISTORY_PATH}/${encodedUid}`,
    savesPath: `${CLOUD_SAVES_PATH}/${encodedUid}`,
    campaignLogPath: `${CLOUD_CAMPAIGN_LOG_PATH}/${encodedUid}`,
    profilePath: `${CLOUD_USERS_PATH}/${encodedUid}/profile`,
    charactersIndexPath: `${CLOUD_USERS_PATH}/${encodedUid}/charactersIndex`,
    autosaveIndexPath: `${CLOUD_USERS_PATH}/${encodedUid}/autosaves`,
  };
}

function getActiveUserPaths({ notify = false } = {}) {
  const uid = activeAuthUserId;
  if (!uid) {
    if (notify) {
      showCloudAuthRequiredNotice();
    }
    return null;
  }
  return getUserPaths(uid);
}

export function buildUserCharacterPath(uid, characterId) {
  const paths = getUserPaths(uid);
  if (!paths) return '';
  const encodedCharacterId = encodePath(characterId || '');
  if (!encodedCharacterId) return '';
  return `${paths.charactersPath}/${encodedCharacterId}`;
}

export function buildUserCharacterIndexPath(uid, characterId) {
  const paths = getUserPaths(uid);
  if (!paths) return '';
  const encodedCharacterId = encodePath(characterId || '');
  if (!encodedCharacterId) return '';
  return `${paths.charactersIndexPath}/${encodedCharacterId}`;
}

export function buildUserAutosaveIndexPath(uid, characterId) {
  const paths = getUserPaths(uid);
  if (!paths) return '';
  const encodedCharacterId = encodePath(characterId || '');
  if (!encodedCharacterId) return '';
  return `${paths.autosaveIndexPath}/${encodedCharacterId}`;
}

export function readLastSyncedAt(characterId) {
  const storage = getLocalStorageSafe();
  if (!storage) return 0;
  const key = typeof characterId === 'string' ? characterId.trim() : '';
  if (!key) return 0;
  try {
    const raw = storage.getItem(`${LAST_SYNCED_PREFIX}${key}`);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function writeLastSyncedAt(characterId, timestamp) {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  const key = typeof characterId === 'string' ? characterId.trim() : '';
  const value = Number(timestamp);
  if (!key || !Number.isFinite(value)) return;
  try {
    storage.setItem(`${LAST_SYNCED_PREFIX}${key}`, String(value));
  } catch {}
}

export function storeConflictSnapshot(characterId, payload, { label = '' } = {}) {
  const storage = getLocalStorageSafe();
  if (!storage || !characterId || !payload) return '';
  const ts = Date.now();
  const safeLabel = typeof label === 'string' ? label.trim() : '';
  const key = `${CONFLICT_SNAPSHOT_PREFIX}${characterId}:${ts}${safeLabel ? `:${safeLabel}` : ''}`;
  try {
    storage.setItem(key, JSON.stringify({ ts, label: safeLabel, payload }));
    return key;
  } catch {
    return '';
  }
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

async function saveHistoryEntry(basePath, name, payload, ts) {
  const encodedName = encodePath(name);
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for cloud save');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }

  const entryRef = await getDatabaseRef(`${basePath}/${encodedName}/${ts}`);
  await entryRef.set(serialized.value);

  const parseKeys = (val) =>
    val
      ? Object.keys(val)
          .map((k) => Number(k))
          .filter((k) => Number.isFinite(k))
          .sort((a, b) => b - a)
      : [];

  let keys = [];

  try {
    const historyRef = await getDatabaseRef(`${basePath}/${encodedName}`);
    const snapshot = await historyRef.orderByKey().limitToLast(4).once('value');
    keys = parseKeys(snapshot.val());
  } catch (err) {
    return;
  }

  const excess = keys.slice(3);
  if (!excess.length) return;
  const historyRef = await getDatabaseRef(`${basePath}/${encodedName}`);
  await Promise.all(excess.map((k) => historyRef.child(String(k)).remove()));
}

async function attemptCloudSave(name, payload, ts) {
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for cloud save');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const userPaths = getActiveUserPaths();
  if (!userPaths) {
    const error = new Error('Cloud sync requires sign-in.');
    error.name = 'AuthRequired';
    throw error;
  }
  const ref = await getDatabaseRef(`${userPaths.savesPath}/${encodePath(name)}`);
  await ref.set(serialized.value);

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
    await saveHistoryEntry(userPaths.historyPath, name, serialized.value, ts);
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
  const userPaths = getActiveUserPaths();
  if (!userPaths) return null;
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
  const ref = await getDatabaseRef(`${userPaths.campaignLogPath}/${encodePath(id)}`);
  await ref.set(serialized.value);

  return { ...payload, id };
}

export async function deleteCampaignLogEntry(id) {
  if (typeof id !== 'string' || !id) return;
  const userPaths = getActiveUserPaths();
  if (!userPaths) return;
  const ref = await getDatabaseRef(`${userPaths.campaignLogPath}/${encodePath(id)}`);
  await ref.remove();
}

export async function fetchCampaignLogEntries() {
  const userPaths = getActiveUserPaths();
  if (!userPaths) return [];
  const ref = await getDatabaseRef(userPaths.campaignLogPath);
  const snapshot = await ref.once('value');
  const data = snapshot.val();
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
    const userPaths = getActiveUserPaths();
    if (!userPaths) {
      if (typeof onChange === 'function') {
        onChange();
      }
      return null;
    }
    const handler = () => {
      if (typeof onChange === 'function') {
        onChange();
      }
    };
    getDatabaseRef(userPaths.campaignLogPath)
      .then(ref => {
        ref.on('value', handler);
      })
      .catch(err => {
        console.error('Failed to subscribe to campaign log', err);
      });

    if (typeof onChange === 'function') {
      onChange();
    }

    return () => {
      getDatabaseRef(userPaths.campaignLogPath)
        .then(ref => ref.off('value', handler))
        .catch(() => {});
    };
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
  const uid = activeAuthUserId;
  const characterId = payload?.character?.characterId || payload?.characterId || '';

  let entry;
  try {
    const cloudUrls = await getCloudUrlsForOutbox();
    entry = createCloudSaveOutboxEntry({
      name,
      payload: data,
      ts,
      kind,
      deviceId,
      uid,
      characterId,
      cloudUrls,
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
      uid,
      characterId,
      kind: entry.kind,
      queuedAt: entry.queuedAt,
      cloudUrls: entry.cloudUrls || null,
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
  if (getAuthMode && getAuthMode() === 'local') {
    showLocalAuthModeNotice();
    try {
      await saveLocal(name, payload);
      emitSyncActivity({ type: 'local-cloud-save', name, queued: false, timestamp: Date.now() });
      return 'saved';
    } catch (err) {
      console.error('Local cloud save emulation failed', err);
      throw err;
    }
  }
  if (!isCloudSyncAvailable()) {
    showCloudSyncUnsupportedNotice();
    return 'disabled';
  }
  if (!activeAuthUserId) {
    showCloudAuthRequiredNotice();
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
  if (getAuthMode && getAuthMode() === 'local') {
    showLocalAuthModeNotice();
    const ts = nextHistoryTimestamp();
    const characterId = payload?.character?.characterId || payload?.characterId || '';
    if (!characterId) return ts;
    const uid = activeAuthUserId || 'local';
    try {
      const storage = getLocalStorageSafe();
      if (!storage) return ts;
      const key = getLocalCloudAutosaveKey(uid, characterId, ts);
      const serialized = safeJsonStringify({
        ...payload,
        meta: {
          ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
          updatedAt: Date.now(),
        },
      });
      if (serialized.ok) storage.setItem(key, serialized.json);
      emitSyncActivity({ type: 'local-cloud-autosave', name, queued: false, timestamp: Date.now() });
      return ts;
    } catch (err) {
      console.warn('Local cloud autosave emulation failed', err);
      return ts;
    }
  }
  if (!isCloudSyncAvailable()) {
    showCloudSyncUnsupportedNotice();
    return null;
  }
  const ts = nextHistoryTimestamp();
  const characterId = payload?.character?.characterId || payload?.characterId || '';
  const uid = activeAuthUserId;
  const userPaths = uid ? getUserPaths(uid) : null;
  if (!characterId) {
    const error = new Error('Autosave requires characterId');
    error.name = 'InvalidAutosaveKey';
    throw error;
  }
  if (!userPaths) {
    showCloudAuthRequiredNotice();
    return null;
  }
  const autosaveKey = characterId;
  const autosavePath = autosaveKey
    ? `${userPaths.autosavesPath}/${encodePath(autosaveKey)}/${ts}`
    : `${userPaths.autosavesPath}`;
  const payloadWithMeta = {
    ...payload,
    meta: {
      ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      name: typeof name === 'string' ? name : '',
      uid,
      deviceId: getDeviceId(),
      updatedAt: Date.now(),
    },
  };
  try {
    if (!autosaveKey) {
      throw new Error('Invalid autosave key');
    }
    if (!autosaveDebugLogged && shouldLogAutosaveDebug()) {
      autosaveDebugLogged = true;
      console.info('Autosave debug path', { autosaveKey, autosavePath });
    }
    await saveHistoryEntry(userPaths.autosavesPath, autosaveKey, payloadWithMeta, ts);
    if (userPaths?.autosaveIndexPath) {
      const autosaveIndexPayload = {
        latestTs: ts,
        name: typeof name === 'string' ? name : '',
        updatedAt: Date.now(),
        updatedAtServer: getServerTimestampValue(),
      };
      const autosaveIndexRef = await getDatabaseRef(
        `${userPaths.autosaveIndexPath}/${encodePath(autosaveKey)}`
      );
      await autosaveIndexRef.set(autosaveIndexPayload);
    }
    resetOfflineNotices();
    emitSyncActivity({ type: 'cloud-autosave', name, queued: false, timestamp: Date.now() });
    emitSyncQueueUpdate();
    return ts;
  } catch (e) {
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

export async function saveCloudCharacter(uid, characterId, payload) {
  if (getAuthMode && getAuthMode() === 'local') {
    showLocalAuthModeNotice();
    const resolvedUid = uid || activeAuthUserId || 'local';
    const resolvedCharacterId = characterId || payload?.character?.characterId || payload?.characterId || '';
    if (!resolvedCharacterId) throw new Error('Missing character id');

    const updatedAt = Date.now();
    const payloadWithMeta = {
      ...payload,
      meta: {
        ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
        updatedAt,
      },
      updatedAt,
    };

    const wrote = writeLocalCloudCharacter(resolvedUid, resolvedCharacterId, payloadWithMeta);
    if (!wrote) throw new Error('Failed to persist character snapshot locally');

    const index = readLocalCloudIndex(resolvedUid);
    const entryName =
      payloadWithMeta?.character?.name ||
      payloadWithMeta?.character?.identityName ||
      payloadWithMeta?.name ||
      'Unnamed Character';
    index[resolvedCharacterId] = {
      ...(index[resolvedCharacterId] && typeof index[resolvedCharacterId] === 'object' ? index[resolvedCharacterId] : {}),
      characterId: resolvedCharacterId,
      name: entryName,
      updatedAt,
    };
    writeLocalCloudIndex(resolvedUid, index);

    emitSyncActivity({ type: 'local-cloud-character-save', name: entryName, queued: false, timestamp: updatedAt });
    return 'saved';
  }
  if (!isCloudSyncAvailable()) {
    showCloudSyncUnsupportedNotice();
    return 'disabled';
  }
  if (!getUserPaths(uid)) throw new Error('Missing user id');
  const targetPath = buildUserCharacterPath(uid, characterId);
  if (!targetPath) throw new Error('Missing character id');
  const payloadWithServerTime = {
    ...payload,
    meta: {
      ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      updatedAtServer: getServerTimestampValue(),
    },
    updatedAtServer: getServerTimestampValue(),
  };
  const serialized = safeJsonStringify(payloadWithServerTime);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for cloud save');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const ref = await getDatabaseRef(targetPath);
  await ref.set(serialized.value);
  return 'saved';
}

export async function loadCloudCharacter(uid, characterId, { signal } = {}) {
  if (getAuthMode && getAuthMode() === 'local') {
    const resolvedUid = uid || activeAuthUserId || 'local';
    const resolvedCharacterId = characterId || '';
    if (!resolvedCharacterId) throw new Error('Missing character id');
    const payload = readLocalCloudCharacter(resolvedUid, resolvedCharacterId);
    if (!payload) {
      const err = new Error('Character snapshot not found');
      err.name = 'NotFoundError';
      throw err;
    }
    return payload;
  }
  const targetPath = buildUserCharacterPath(uid, characterId);
  if (!targetPath) throw new Error('Missing user id or character id');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const ref = await getDatabaseRef(targetPath);
  const snapshot = await ref.once('value');
  const val = snapshot.val();
  if (val !== null) return val;
  throw new Error('No character found');
}

export async function listCloudCharacters(uid) {
  try {
    const paths = getUserPaths(uid);
    if (!paths) return [];
    const ref = await getDatabaseRef(paths.charactersPath);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    if (!val || typeof val !== 'object') return [];
    return Object.entries(val).map(([characterId, payload]) => ({
      characterId,
      payload,
    }));
  } catch (e) {
    console.error('Cloud character list failed', e);
    return [];
  }
}

export async function saveUserProfile(uid, profile) {
  const paths = getUserPaths(uid);
  if (!paths) throw new Error('Missing user id');
  const serialized = safeJsonStringify(profile);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for profile');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const ref = await getDatabaseRef(paths.profilePath);
  await ref.set(serialized.value);
}

export async function saveCharacterIndexEntry(uid, characterId, entry) {
  if (getAuthMode && getAuthMode() === 'local') {
    const resolvedUid = uid || activeAuthUserId || 'local';
    const resolvedCharacterId = characterId || entry?.characterId || entry?.id || '';
    if (!resolvedCharacterId) return false;
    const updatedAt = Number(entry?.updatedAt || Date.now());
    const index = readLocalCloudIndex(resolvedUid);
    index[resolvedCharacterId] = {
      ...(index[resolvedCharacterId] && typeof index[resolvedCharacterId] === 'object' ? index[resolvedCharacterId] : {}),
      ...(entry && typeof entry === 'object' ? entry : {}),
      characterId: resolvedCharacterId,
      updatedAt,
    };
    return writeLocalCloudIndex(resolvedUid, index);
  }
  const path = buildUserCharacterIndexPath(uid, characterId);
  if (!path) throw new Error('Missing user id or character id');
  const payload = {
    name: entry?.name || '',
    updatedAt: Number(entry?.updatedAt) || 0,
    updatedAtServer: getServerTimestampValue(),
  };
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for index');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }
  const ref = await getDatabaseRef(path);
  await ref.set(serialized.value);
}

export async function saveCloudConflictBackup(uid, characterId, payload, { label = '' } = {}) {
  const paths = getUserPaths(uid);
  if (!paths) throw new Error('Missing user id');
  const safeLabel = typeof label === 'string' ? label.trim() : '';
  const entryPayload = {
    ...payload,
    meta: {
      ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      conflictLabel: safeLabel,
      conflictRecordedAt: Date.now(),
    },
  };
  const ts = nextHistoryTimestamp();
  await saveHistoryEntry(`${paths.historyPath}/${encodePath(characterId)}`, 'conflict', entryPayload, ts);
  return ts;
}

export async function deleteCharacterIndexEntry(uid, characterId) {
  const path = buildUserCharacterIndexPath(uid, characterId);
  if (!path) throw new Error('Missing user id or character id');
  const ref = await getDatabaseRef(path);
  await ref.remove();
}

export async function listCharacterIndex(uid) {
  if (getAuthMode && getAuthMode() === 'local') {
    const resolvedUid = uid || activeAuthUserId || 'local';
    const indexObj = readLocalCloudIndex(resolvedUid);
    const entries = Object.values(indexObj || {}).filter(v => v && typeof v === 'object');
    entries.sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
    return entries;
  }
  try {
    const paths = getUserPaths(uid);
    if (!paths) return [];
    const ref = await getDatabaseRef(paths.charactersIndexPath);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    if (!val || typeof val !== 'object') return [];
    return Object.entries(val).map(([characterId, entry]) => ({
      characterId,
      name: entry?.name || '',
      updatedAt: Number(entry?.updatedAt) || 0,
      updatedAtServer: Number(entry?.updatedAtServer) || 0,
    }));
  } catch (err) {
    console.error('Character index list failed', err);
    return [];
  }
}

export async function deleteCloudCharacter(uid, characterId) {
  const targetPath = buildUserCharacterPath(uid, characterId);
  if (!targetPath) throw new Error('Missing user id or character id');
  const ref = await getDatabaseRef(targetPath);
  await ref.remove();
}

export async function loadCloud(name, { signal } = {}) {
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const userPaths = getActiveUserPaths({ notify: true });
    if (!userPaths) {
      throw new Error('Cloud sync requires sign-in.');
    }
    const ref = await getDatabaseRef(`${userPaths.savesPath}/${encodePath(name)}`);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    if (val !== null) return val;
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw e;
    }
    console.error('Cloud load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteCloud(name) {
  try {
    const userPaths = getActiveUserPaths({ notify: true });
    if (!userPaths) return;
    const ref = await getDatabaseRef(`${userPaths.savesPath}/${encodePath(name)}`);
    await ref.remove();
    if (readLastSaveName() === name) {
      clearLastSaveName(name);
    }
  } catch (e) {
    console.error('Cloud delete failed', e);
  }
}

export async function listCloudSaves({ notify = false } = {}) {
  try {
    const userPaths = getActiveUserPaths({ notify });
    if (!userPaths) return [];
    const ref = await getDatabaseRef(userPaths.savesPath);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    // Keys in the realtime database are URL-encoded because we escape them when
    // saving. Decode them here so callers receive the original character names.
    return val ? Object.keys(val).map(k => decodePath(k)) : [];
  } catch (e) {
    console.error('Cloud list failed', e);
    return [];
  }
}

export async function listCloudBackups(name, { notify = true } = {}) {
  try {
    const userPaths = getActiveUserPaths({ notify });
    if (!userPaths) return [];
    const ref = await getDatabaseRef(`${userPaths.historyPath}/${encodePath(name)}`);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    return val
      ? Object.keys(val)
          .map(k => Number(k))
          .sort((a, b) => b - a)
          .map(ts => ({ ts }))
      : [];
  } catch (e) {
    console.error('Cloud history list failed', e);
    return [];
  }
}

export async function listCloudAutosaves(name, { characterId = '' } = {}) {
  try {
    const userPaths = getActiveUserPaths();
    if (!userPaths) return [];
    const autosaveKey = characterId;
    if (!autosaveKey) return [];
    const ref = await getDatabaseRef(`${userPaths.autosavesPath}/${encodePath(autosaveKey)}`);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    return val
      ? Object.keys(val)
          .map(k => Number(k))
          .sort((a, b) => b - a)
          .map(ts => ({ ts }))
      : [];
  } catch (e) {
    console.error('Cloud autosave list failed', e);
    return [];
  }
}


export async function listCloudBackupNames() {
  try {
    const userPaths = getActiveUserPaths();
    if (!userPaths) return [];
    const ref = await getDatabaseRef(userPaths.historyPath);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    return val ? Object.keys(val).map(k => decodePath(k)) : [];
  } catch (e) {
    console.error('Cloud history names failed', e);
    return [];
  }
}

export async function listCloudAutosaveNames() {
  try {
    const userPaths = getActiveUserPaths();
    if (!userPaths) return [];
    const indexRef = await getDatabaseRef(userPaths.autosaveIndexPath);
    const indexSnapshot = await indexRef.once('value');
    const indexVal = indexSnapshot.val();
    if (indexVal && typeof indexVal === 'object') {
      const names = Object.values(indexVal)
        .map(entry => entry?.name)
        .filter(name => typeof name === 'string' && name.trim())
        .map(name => name.trim());
      if (names.length) {
        return names;
      }
    }
    const ref = await getDatabaseRef(userPaths.autosavesPath);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
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
    console.error('Cloud autosave names failed', e);
    return [];
  }
}

export async function loadCloudBackup(name, ts) {
  try {
    const userPaths = getActiveUserPaths();
    if (!userPaths) {
      throw new Error('Cloud sync requires sign-in.');
    }
    const ref = await getDatabaseRef(`${userPaths.historyPath}/${encodePath(name)}/${ts}`);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    if (val !== null) return val;
  } catch (e) {
    console.error('Cloud history load failed', e);
  }
  throw new Error('No backup found');
}

export async function loadCloudAutosave(name, ts, { characterId = '' } = {}) {
  try {
    const urls = getActiveUserPaths();
    const autosaveKey = characterId;
    if (!urls || !autosaveKey) throw new Error('Invalid autosave key');
    const ref = await getDatabaseRef(`${urls.autosavesPath}/${encodePath(autosaveKey)}/${ts}`);
    const snapshot = await ref.once('value');
    const val = snapshot.val();
    if (val !== null) return val;
  } catch (e) {
    console.error('Cloud autosave load failed', e);
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
    const uid = activeAuthUserId;
    if (uid && listFn === listCloudSaves && loadFn === loadCloud) {
      const entries = await listCloudCharacters(uid);
      if (signal?.aborted) {
        return;
      }
      for (const entry of entries) {
        if (signal?.aborted) {
          return;
        }
        const payload = entry?.payload;
        const name = payload?.meta?.name || payload?.character?.name || entry.characterId;
        if (!payload || !name) continue;
        await saveFn(name, payload, { uid });
      }
      return;
    }

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
    if (cloudSyncDisabled) {
      if (cloudSyncUnsupported) {
        showCloudSyncUnsupportedNotice();
      }
      return null;
    }
    const userPaths = getActiveUserPaths();
    if (!userPaths) {
      return null;
    }
    const handler = () => onChange();
    getDatabaseRef(userPaths.savesPath)
      .then(ref => {
        ref.on('value', handler);
      })
      .catch(err => {
        console.error('Failed to subscribe to cloud saves', err);
      });

    onChange();
    return () => {
      getDatabaseRef(userPaths.savesPath)
        .then(ref => ref.off('value', handler))
        .catch(() => {});
    };
  } catch (e) {
    console.error('Failed to subscribe to cloud saves', e);
    return null;
  }
}
