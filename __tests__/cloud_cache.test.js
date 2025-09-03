import { jest } from '@jest/globals';
import { cacheCloudSaves } from '../scripts/storage.js';

test('cacheCloudSaves fetches all cloud data and saves locally', async () => {
  const listFn = jest.fn().mockResolvedValue(['player:A', 'player:B']);
  const loadFn = jest.fn(k => Promise.resolve({ key: k }));
  const saveFn = jest.fn();

  await cacheCloudSaves(listFn, loadFn, saveFn);

  expect(listFn).toHaveBeenCalled();
  expect(loadFn).toHaveBeenCalledWith('player:A');
  expect(loadFn).toHaveBeenCalledWith('player:B');
  expect(saveFn).toHaveBeenCalledWith('player:A', { key: 'player:A' });
  expect(saveFn).toHaveBeenCalledWith('player:B', { key: 'player:B' });
});
