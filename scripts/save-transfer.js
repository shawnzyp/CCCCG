import { buildCanonicalPayload, migrateSavePayload } from './characters.js';
import { buildCloudSaveEnvelope, normalizeCloudSaveEnvelope } from './cloud-save-helpers.js';

function isEnvelopeShape(raw) {
  return !!(raw && typeof raw === 'object' && 'payload' in raw && ('updatedAt' in raw || 'schemaVersion' in raw));
}

export function normalizeSnapshotPayload(raw) {
  const source = isEnvelopeShape(raw) ? raw.payload : raw;
  const migrated = migrateSavePayload(source);
  const { payload } = buildCanonicalPayload(migrated);
  return payload;
}

export function normalizeImportedEnvelope(raw) {
  if (isEnvelopeShape(raw)) {
    return normalizeCloudSaveEnvelope(raw);
  }
  const payload = normalizeSnapshotPayload(raw);
  return buildCloudSaveEnvelope(payload, { updatedAt: Date.now() });
}

export function serializeSnapshotForExport(snapshot) {
  const payload = normalizeSnapshotPayload(snapshot);
  const envelope = buildCloudSaveEnvelope(payload, { updatedAt: Date.now() });
  return JSON.stringify(envelope, null, 2);
}
