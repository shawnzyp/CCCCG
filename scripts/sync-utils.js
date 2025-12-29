export function shouldPullCloudCopy(localUpdatedAt, cloudUpdatedAt) {
  const local = Number(localUpdatedAt);
  const cloud = Number(cloudUpdatedAt);
  const localValue = Number.isFinite(local) ? local : 0;
  const cloudValue = Number.isFinite(cloud) ? cloud : 0;
  return cloudValue > localValue;
}
