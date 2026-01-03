import { buildCloudSaveEnvelope, normalizeCloudSaveEnvelope, selectLatestCloudEntry } from '../scripts/cloud-save-service.js';

describe('cloud save service helpers', () => {
  test('selectLatestCloudEntry chooses the newest updatedAt', () => {
    const entries = [
      { characterId: 'a', updatedAt: 1000 },
      { characterId: 'b', updatedAt: 2500 },
      { characterId: 'c', updatedAt: 1200 },
    ];
    const latest = selectLatestCloudEntry(entries);
    expect(latest.characterId).toBe('b');
  });

  test('normalizeCloudSaveEnvelope returns null for invalid payload', () => {
    expect(normalizeCloudSaveEnvelope(null)).toBeNull();
    expect(normalizeCloudSaveEnvelope({ updatedAt: 100 })).toBeNull();
  });

  test('normalizeCloudSaveEnvelope preserves payload', () => {
    const payload = { meta: { name: 'Test' }, character: { name: 'Test' } };
    const envelope = buildCloudSaveEnvelope(payload, { updatedAt: 1234 });
    const normalized = normalizeCloudSaveEnvelope(envelope);
    expect(normalized.payload).toEqual(payload);
    expect(normalized.updatedAt).toBe(1234);
  });
});
