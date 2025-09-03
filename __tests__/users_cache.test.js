import { jest } from '@jest/globals';

const cacheCloudSaves = jest.fn().mockResolvedValue();

jest.unstable_mockModule('../scripts/storage.js', () => ({
  saveLocal: jest.fn(),
  loadLocal: jest.fn(),
  loadCloud: jest.fn(),
  saveCloud: jest.fn(),
  listCloudSaves: jest.fn(),
  listLocalSaves: jest.fn(),
  cacheCloudSaves,
}));

await import('../scripts/users.js');

test('caches cloud saves on DOMContentLoaded', () => {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  expect(cacheCloudSaves).toHaveBeenCalled();
});
