import { hasSyncConflict, shouldPullCloudCopy } from '../scripts/sync-utils.js';

describe('cloud index sync', () => {
  test('prefers newer cloud updatedAt', () => {
    expect(shouldPullCloudCopy(1000, 2000)).toBe(true);
    expect(shouldPullCloudCopy(2000, 1000)).toBe(false);
    expect(shouldPullCloudCopy(1000, 1000)).toBe(false);
  });

  test('detects conflicts when both sides changed since last sync', () => {
    expect(hasSyncConflict({ localUpdatedAt: 1200, cloudUpdatedAt: 1300, lastSyncedAt: 1100 })).toBe(true);
    expect(hasSyncConflict({ localUpdatedAt: 1200, cloudUpdatedAt: 1050, lastSyncedAt: 1100 })).toBe(false);
  });
});
