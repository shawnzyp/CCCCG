import { normalizeSnapshotPayload, serializeSnapshotForExport } from '../scripts/save-transfer.js';

describe('save transfer utilities', () => {
  test('export and import round-trip preserves canonical payload', () => {
    const basePayload = {
      meta: { name: 'RoundTrip', savedAt: 1000 },
      character: { name: 'RoundTrip', level: 1 },
      ui: { viewMode: 'edit' },
    };
    const canonical = normalizeSnapshotPayload(basePayload);
    const serialized = serializeSnapshotForExport(canonical);
    const parsed = JSON.parse(serialized);
    const roundTrip = normalizeSnapshotPayload(parsed.payload);
    expect(roundTrip).toEqual(canonical);
  });
});
