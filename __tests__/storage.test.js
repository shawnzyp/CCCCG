import { jest } from '@jest/globals';
import { saveCloud, loadCloud, deleteSave } from '../scripts/storage.js';

describe('saveCloud/loadCloud', () => {
  const mockGetRTDB = async () => null; // force localStorage path
  const mockToast = jest.fn();

  beforeEach(() => {
    localStorage.clear();
    mockToast.mockClear();
    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
  });

  test('saves data and loads it back', async () => {
    const payload = { foo: 'bar', num: 42 };
    await saveCloud('test', payload, { getRTDB: mockGetRTDB, toast: mockToast });
    const loaded = await loadCloud('test', { getRTDB: mockGetRTDB, toast: mockToast });
    expect(loaded).toEqual(payload);
  });

  test('deletes saved data', async () => {
    const payload = { foo: 'baz' };
    await saveCloud('remove', payload, { getRTDB: mockGetRTDB, toast: mockToast });
    await deleteSave('remove', { getRTDB: mockGetRTDB, toast: mockToast });
    await expect(loadCloud('remove', { getRTDB: mockGetRTDB, toast: mockToast })).rejects.toThrow('No save found');
    expect(localStorage.getItem('save:remove')).toBeNull();
    expect(localStorage.getItem('last-save')).toBeNull();
  });

  test('uses provided RTDB helpers when available', async () => {
    const store = {};
    const mockRemote = {
      db: {},
      ref: (db, path) => path,
      set: async (path, data) => { store[path] = data; },
      get: async (path) => ({ exists: () => path in store, val: () => store[path] }),
      remove: async (path) => { delete store[path]; }
    };
    const mockGetRTDB = async () => mockRemote;

    await saveCloud('remote', { zap: 1 }, { getRTDB: mockGetRTDB });
    expect(store['/saves/remote']).toBeTruthy();
    const loaded = await loadCloud('remote', { getRTDB: mockGetRTDB });
    expect(loaded).toEqual({ zap: 1 });
    await deleteSave('remote', { getRTDB: mockGetRTDB });
    await expect(loadCloud('remote', { getRTDB: mockGetRTDB })).rejects.toThrow('No save found');
  });
});
