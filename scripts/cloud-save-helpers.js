export const CLOUD_SAVE_SCHEMA_VERSION = 1;

export function resolveUpdatedAt(entry) {
  if (!entry || typeof entry !== 'object') return 0;
  const direct = Number(entry.updatedAt);
  if (Number.isFinite(direct)) return direct;
  const nested = Number(entry?.meta?.updatedAt);
  return Number.isFinite(nested) ? nested : 0;
}

export function buildCloudSaveEnvelope(payload, { updatedAt = Date.now(), schemaVersion = CLOUD_SAVE_SCHEMA_VERSION, migratedAt, firestoreSyncedAt } = {}) {
  const envelope = {
    schemaVersion,
    updatedAt,
    payload,
  };
  if (typeof migratedAt === 'number' && Number.isFinite(migratedAt)) {
    envelope.migratedAt = migratedAt;
  }
  if (typeof firestoreSyncedAt === 'number' && Number.isFinite(firestoreSyncedAt)) {
    envelope.firestoreSyncedAt = firestoreSyncedAt;
  }
  return envelope;
}

export function normalizeCloudSaveEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.payload || typeof raw.payload !== 'object') return null;
  const updatedAt = resolveUpdatedAt(raw);
  return {
    schemaVersion: Number(raw.schemaVersion) || CLOUD_SAVE_SCHEMA_VERSION,
    updatedAt,
    payload: raw.payload,
    migratedAt: Number(raw.migratedAt) || 0,
    firestoreSyncedAt: Number(raw.firestoreSyncedAt) || 0,
  };
}

export function selectLatestCloudEntry(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries.reduce((latest, entry) => {
    if (!latest) return entry;
    return resolveUpdatedAt(entry) > resolveUpdatedAt(latest) ? entry : latest;
  }, null);
}
