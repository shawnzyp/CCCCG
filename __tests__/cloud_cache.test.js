import { jest } from '@jest/globals';
import { cacheCloudSaves } from '../scripts/storage.js';

test('cacheCloudSaves stores only player character data locally', async () => {
  const listFn = jest
    .fn()
    .mockResolvedValue(['Player :A', 'user:X', 'Player :B', 'misc']);
  const loadFn = jest.fn(k => Promise.resolve({ key: k }));
  const saveFn = jest.fn();

  await cacheCloudSaves(listFn, loadFn, saveFn);

  expect(listFn).toHaveBeenCalled();
  // Only player-prefixed keys should be processed
  expect(loadFn).toHaveBeenCalledTimes(2);
  expect(loadFn).toHaveBeenCalledWith('Player :A');
  expect(loadFn).toHaveBeenCalledWith('Player :B');
  expect(saveFn).toHaveBeenCalledTimes(2);
  expect(saveFn).toHaveBeenCalledWith('Player :A', { key: 'Player :A' });
  expect(saveFn).toHaveBeenCalledWith('Player :B', { key: 'Player :B' });
});
