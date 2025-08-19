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
});

describe('cloud backend integration', () => {
  const store = new Map();
  const mockToast = jest.fn();
  const mockGetRTDB = async () => ({
    db: {},
    ref: (_db, path) => path,
    set: async (path, value) => { store.set(path, value); },
    get: async (path) => ({
      exists: () => store.has(path),
      val: () => store.get(path),
    }),
    remove: async (path) => { store.delete(path); },
  });

  beforeEach(() => {
    localStorage.clear();
    store.clear();
    mockToast.mockClear();
    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });
  });

  test('saves to cloud and loads from it', async () => {
    const payload = { foo: 'bar', num: 7 };
    await saveCloud('cloud', payload, { getRTDB: mockGetRTDB, toast: mockToast });
    expect(store.get('/saves/cloud').data).toEqual(payload);
    const loaded = await loadCloud('cloud', { getRTDB: mockGetRTDB, toast: mockToast });
    expect(loaded).toEqual(payload);
  });

  test('deletes cloud data', async () => {
    const payload = { foo: 'baz' };
    await saveCloud('cloudremove', payload, { getRTDB: mockGetRTDB, toast: mockToast });
    await deleteSave('cloudremove', { getRTDB: mockGetRTDB, toast: mockToast });
    await expect(loadCloud('cloudremove', { getRTDB: mockGetRTDB, toast: mockToast })).rejects.toThrow('No save found');
    expect(store.has('/saves/cloudremove')).toBe(false);
  });
});
