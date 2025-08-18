import { jest } from '@jest/globals';
import { saveCloud, loadCloud } from '../scripts/storage.js';

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
});
