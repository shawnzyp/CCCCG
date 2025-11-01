import { jest } from '@jest/globals';
import { saveLocal, loadLocal, deleteSave, listLocalSaves } from '../scripts/storage.js';

describe('saveLocal/loadLocal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('saves data and loads it back', async () => {
    const payload = { foo: 'bar', num: 42 };
    await saveLocal('test', payload);
    const loaded = await loadLocal('test');
    expect(loaded).toEqual(payload);
  });

  test('deletes saved data', async () => {
    const payload = { foo: 'baz' };
    await saveLocal('remove', payload);
    await deleteSave('remove');
    await expect(loadLocal('remove')).rejects.toThrow('No save found');
    expect(localStorage.getItem('save:remove')).toBeNull();
    expect(localStorage.getItem('last-save')).toBeNull();
  });

  test('lists local saves', async () => {
    await saveLocal('Player :Alpha', {});
    await saveLocal('Player :Beta', {});
    expect(listLocalSaves()).toEqual(['Player :Alpha', 'Player :Beta']);
  });

  test('prunes oldest saves when quota exceeded', async () => {
    await saveLocal('Oldest', { foo: 'old' });
    await saveLocal('Older', { foo: 'older' });
    expect(listLocalSaves()).toEqual(['Older', 'Oldest']);
    const realSetItem = Storage.prototype.setItem;
    const realRemoveItem = Storage.prototype.removeItem;
    const removeCalls = [];
    let shouldThrow = true;
    const setItemMock = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (shouldThrow) {
        shouldThrow = false;
        const quotaError = new Error('QuotaExceededError');
        quotaError.name = 'QuotaExceededError';
        quotaError.code = 22;
        throw quotaError;
      }
      return realSetItem.call(this, key, value);
    });
    const removeMock = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
      removeCalls.push(key);
      return realRemoveItem.call(this, key);
    });
    try {
      await saveLocal('Newest', { foo: 'new' });
    } finally {
      setItemMock.mockRestore();
      removeMock.mockRestore();
    }
    expect(localStorage.getItem('save:Newest')).not.toBeNull();
    expect(localStorage.getItem('last-save')).toBe('Newest');
    expect(removeCalls.length).toBeGreaterThan(0);
  });
});

