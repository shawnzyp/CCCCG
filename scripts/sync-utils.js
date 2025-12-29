export function shouldPullCloudCopy(localUpdatedAt, cloudUpdatedAt) {
  const local = Number(localUpdatedAt);
  const cloud = Number(cloudUpdatedAt);
  const localValue = Number.isFinite(local) ? local : 0;
  const cloudValue = Number.isFinite(cloud) ? cloud : 0;
  return cloudValue > localValue;
}

export function detectSyncConflict({ localUpdatedAt, cloudUpdatedAt, lastSyncedAt } = {}) {
  const local = Number(localUpdatedAt);
  const cloud = Number(cloudUpdatedAt);
  const synced = Number(lastSyncedAt);
  const localValue = Number.isFinite(local) ? local : 0;
  const cloudValue = Number.isFinite(cloud) ? cloud : 0;
  const syncedValue = Number.isFinite(synced) ? synced : 0;
  return localValue > syncedValue && cloudValue > syncedValue;
}
