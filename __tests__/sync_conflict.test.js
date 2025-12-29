import { detectSyncConflict } from '../scripts/sync-utils.js';

describe('sync conflict detection', () => {
  test('detects conflict when both local and cloud updated after last sync', () => {
    expect(detectSyncConflict({
      localUpdatedAt: 2000,
      cloudUpdatedAt: 3000,
      lastSyncedAt: 1000,
    })).toBe(true);
  });

  test('does not flag conflict when one side is stale', () => {
    expect(detectSyncConflict({
      localUpdatedAt: 1000,
      cloudUpdatedAt: 3000,
      lastSyncedAt: 2000,
    })).toBe(false);
    expect(detectSyncConflict({
      localUpdatedAt: 3000,
      cloudUpdatedAt: 1000,
      lastSyncedAt: 2000,
    })).toBe(false);
  });
});
