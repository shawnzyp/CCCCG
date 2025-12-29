import { shouldPullCloudCopy } from '../scripts/sync-utils.js';

describe('cloud index sync', () => {
  test('prefers newer cloud updatedAt', () => {
    expect(shouldPullCloudCopy(1000, 2000)).toBe(true);
    expect(shouldPullCloudCopy(2000, 1000)).toBe(false);
    expect(shouldPullCloudCopy(1000, 1000)).toBe(false);
  });
});
