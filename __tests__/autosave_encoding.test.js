import { jest } from '@jest/globals';

describe('cloud autosave path encoding', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.removeItem('cc:device-id');
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('uses device and character ids in autosave paths', async () => {
    const calls = [];
    global.fetch = jest.fn((url) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        clone() {
          return this;
        },
      });
    });

    const { saveCloudAutosave } = await import('../scripts/storage.js');

    localStorage.setItem('cc:device-id', 'device-123');
    await saveCloudAutosave('Al.ice.Bob', { foo: 'bar', character: { characterId: 'character-456' } });

    const encodedDevice = 'device-123';
    const encodedCharacter = 'character-456';
    expect(calls.some((url) => url.includes(`/autosaves/${encodedDevice}/${encodedCharacter}/`))).toBe(true);
    expect(calls.some((url) => url.includes('/autosaves/Al.ice.Bob/'))).toBe(false);
  });

  test('lists autosaves using encoded device and character ids', async () => {
    const calls = [];
    global.fetch = jest.fn((url) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ 123: { foo: 'bar' } }),
        text: async () => '',
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        clone() {
          return this;
        },
      });
    });

    const { listCloudAutosavesByIds } = await import('../scripts/storage.js');

    await listCloudAutosavesByIds('device.id', 'char.id');

    const encodedDevice = 'device%2Eid';
    const encodedCharacter = 'char%2Eid';
    expect(calls.some((url) => url.includes(`/autosaves/${encodedDevice}/${encodedCharacter}.json`))).toBe(true);
  });
});
