import { buildCanonicalPayload, migrateSavePayload } from './characters.js';

export function normalizeSnapshotPayload(raw) {
  const migrated = migrateSavePayload(raw);
  const { payload } = buildCanonicalPayload(migrated);
  return payload;
}

export function serializeSnapshotForExport(snapshot) {
  const payload = normalizeSnapshotPayload(snapshot);
  return JSON.stringify(payload, null, 2);
}
