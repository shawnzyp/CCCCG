export function shouldPullCloudCopy(localUpdatedAt, cloudUpdatedAt) {
  const local = Number(localUpdatedAt);
  const cloud = Number(cloudUpdatedAt);
  const localValue = Number.isFinite(local) ? local : 0;
  const cloudValue = Number.isFinite(cloud) ? cloud : 0;
  return cloudValue > localValue;
}

const LAST_SYNC_PREFIX = 'cc:last-synced:';

function getLocalStorageSafe() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readLastSyncedAt(characterId) {
  const storage = getLocalStorageSafe();
  if (!storage || !characterId) return 0;
  try {
    const raw = storage.getItem(`${LAST_SYNC_PREFIX}${characterId}`);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function writeLastSyncedAt(characterId, timestamp) {
  const storage = getLocalStorageSafe();
  if (!storage || !characterId) return;
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return;
  try {
    storage.setItem(`${LAST_SYNC_PREFIX}${characterId}`, String(value));
  } catch {}
}

export function hasSyncConflict({ localUpdatedAt, cloudUpdatedAt, lastSyncedAt }) {
  const local = Number(localUpdatedAt);
  const cloud = Number(cloudUpdatedAt);
  const lastSynced = Number(lastSyncedAt);
  if (!Number.isFinite(local) || !Number.isFinite(cloud) || !Number.isFinite(lastSynced)) {
    return false;
  }
  return local > lastSynced && cloud > lastSynced;
}
