import { jest } from '@jest/globals';

describe('loadFirebaseConfig', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('fetches default config file', async () => {
    const mockFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    global.fetch = mockFetch;
    const { loadFirebaseConfig } = await import('../scripts/firebase.js');
    await loadFirebaseConfig();
    expect(mockFetch).toHaveBeenCalledWith('firebase-config.json');
  });

  test('respects FIREBASE_CONFIG_URL override', async () => {
    const mockFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    global.fetch = mockFetch;
    global.FIREBASE_CONFIG_URL = 'alt-config.json';
    const { loadFirebaseConfig } = await import('../scripts/firebase.js');
    await loadFirebaseConfig();
    expect(mockFetch).toHaveBeenCalledWith('alt-config.json');
    delete global.FIREBASE_CONFIG_URL;
  });
});

