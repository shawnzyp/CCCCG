import { jest } from '@jest/globals';
import { cacheCloudSaves } from '../scripts/storage.js';

test('cacheCloudSaves stores all character data locally in batches', async () => {
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const listFn = jest.fn().mockResolvedValue(keys);
  const loadFn = jest.fn(k => Promise.resolve({ key: k }));
  const saveFn = jest.fn();

  await cacheCloudSaves(listFn, loadFn, saveFn);

  expect(listFn).toHaveBeenCalled();
  expect(loadFn).toHaveBeenCalledTimes(keys.length);
  expect(loadFn.mock.calls.map(([key]) => key)).toEqual(keys);
  loadFn.mock.calls.forEach(([, options]) => {
    if (typeof AbortController === 'function') {
      expect(options).toEqual(expect.objectContaining({ signal: expect.any(Object) }));
    }
  });
  keys.forEach(key => {
    expect(saveFn).toHaveBeenCalledWith(key, { key });
  });
  expect(saveFn).toHaveBeenCalledTimes(keys.length);
});

test('cacheCloudSaves continues caching when some loads fail', async () => {
  const keys = ['A', 'B', 'C'];
  const listFn = jest.fn().mockResolvedValue(keys);
  const loadFn = jest.fn(key => {
    if (key === 'B') {
      return Promise.reject(new Error('boom'));
    }
    return Promise.resolve({ key });
  });
  const saveFn = jest.fn();
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  await cacheCloudSaves(listFn, loadFn, saveFn);

  expect(loadFn).toHaveBeenCalledTimes(keys.length);
  expect(saveFn).toHaveBeenCalledTimes(keys.length - 1);
  expect(saveFn).toHaveBeenCalledWith('A', { key: 'A' });
  expect(saveFn).toHaveBeenCalledWith('C', { key: 'C' });

  consoleError.mockRestore();
});
