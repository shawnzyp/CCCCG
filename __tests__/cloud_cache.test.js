import { jest } from '@jest/globals';
import { cacheCloudSaves } from '../scripts/storage.js';

test('cacheCloudSaves stores only player character data locally', async () => {
  const listFn = jest
    .fn()
    .mockResolvedValue(['player:A', 'user:X', 'player:B', 'misc']);
  const loadFn = jest.fn(k => Promise.resolve({ key: k }));
  const saveFn = jest.fn();

  await cacheCloudSaves(listFn, loadFn, saveFn);

  expect(listFn).toHaveBeenCalled();
  // Only player-prefixed keys should be processed
  expect(loadFn).toHaveBeenCalledTimes(2);
  expect(loadFn).toHaveBeenCalledWith('player:A');
  expect(loadFn).toHaveBeenCalledWith('player:B');
  expect(saveFn).toHaveBeenCalledTimes(2);
  expect(saveFn).toHaveBeenCalledWith('player:A', { key: 'player:A' });
  expect(saveFn).toHaveBeenCalledWith('player:B', { key: 'player:B' });
});
