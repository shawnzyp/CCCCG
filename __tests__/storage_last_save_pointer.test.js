import { jest } from '@jest/globals';

describe('saveCloud', () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('resolves even when updating last-save fails', async () => {
    jest.resetModules();

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    });
    global.fetch = fetchMock;

    const originalSetItem = Storage.prototype.setItem;
    const setItemMock = jest.fn(function mockSetItem(key, value) {
      if (key === 'last-save') {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      return originalSetItem.call(this, key, value);
    });
    Storage.prototype.setItem = setItemMock;

    try {
      const { saveCloud } = await import('../scripts/storage.js');

      await expect(saveCloud('Remote Hero', { foo: 'bar' })).resolves.toBe('saved');

      expect(fetchMock).toHaveBeenCalled();
      expect(setItemMock).toHaveBeenCalledWith('last-save', 'Remote Hero');
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
