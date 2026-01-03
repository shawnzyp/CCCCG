import { buildCloudSaveEnvelope, normalizeCloudSaveEnvelope } from '../scripts/cloud-save-service.js';

describe('cloud save service helpers', () => {
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
