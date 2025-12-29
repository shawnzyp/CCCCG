import { isCloudNewer, shouldToastCloudUpdate } from '../scripts/characters.js';

describe('cloud refresh logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('identifies newer cloud payloads by updatedAt', () => {
    const local = { meta: { updatedAt: 1000 } };
    const cloud = { meta: { updatedAt: 2000 } };
    expect(isCloudNewer(local, cloud)).toBe(true);
    expect(isCloudNewer(cloud, local)).toBe(false);
  });

  test('dedupes cloud refresh toasts by updatedAt', () => {
    localStorage.setItem('cc:cloud-update-toast:char-1', '1000');
    expect(shouldToastCloudUpdate('char-1', 1000)).toBe(false);
    expect(shouldToastCloudUpdate('char-1', 1001)).toBe(true);
  });
});
