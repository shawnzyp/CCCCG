import { jest } from '@jest/globals';
import { cacheCloudSaves } from '../scripts/storage.js';

test('cacheCloudSaves stores all character data locally', async () => {
  const listFn = jest.fn().mockResolvedValue(['A', 'B']);
  const loadFn = jest.fn(k => Promise.resolve({ key: k }));
  const saveFn = jest.fn();

  await cacheCloudSaves(listFn, loadFn, saveFn);

  expect(listFn).toHaveBeenCalled();
  expect(loadFn).toHaveBeenCalledTimes(2);
  expect(loadFn).toHaveBeenCalledWith('A');
  expect(loadFn).toHaveBeenCalledWith('B');
  expect(saveFn).toHaveBeenCalledTimes(2);
  expect(saveFn).toHaveBeenCalledWith('A', { key: 'A' });
  expect(saveFn).toHaveBeenCalledWith('B', { key: 'B' });
});
