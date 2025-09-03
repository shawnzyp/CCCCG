import { jest } from '@jest/globals';

const cacheCloudSaves = jest.fn().mockResolvedValue();
const listeners = {};
const serviceWorker = {
  addEventListener: jest.fn((type, cb) => {
    listeners[type] = cb;
  }),
};
Object.defineProperty(navigator, 'serviceWorker', {
  value: serviceWorker,
  configurable: true,
});

jest.unstable_mockModule('../scripts/storage.js', () => ({
  saveLocal: jest.fn(),
  loadLocal: jest.fn(),
  loadCloud: jest.fn(),
  saveCloud: jest.fn(),
  deleteCloud: jest.fn(),
  deleteSave: jest.fn(),
  listCloudSaves: jest.fn(),
  listLocalSaves: jest.fn(),
  cacheCloudSaves,
}));

await import('../scripts/users.js');

beforeEach(() => {
  cacheCloudSaves.mockClear();
});

test('caches cloud saves on every DOMContentLoaded', () => {
  const evt = new Event('DOMContentLoaded');
  document.dispatchEvent(evt);
  document.dispatchEvent(evt);
  expect(cacheCloudSaves).toHaveBeenCalledTimes(2);
});

test('caches cloud saves when requested by service worker', () => {
  listeners.message?.({ data: 'cacheCloudSaves' });
  expect(cacheCloudSaves).toHaveBeenCalledTimes(1);
});
