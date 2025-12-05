import { jest } from '@jest/globals';

describe('cloud autosave path encoding', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('encodes dots in character names before sending autosaves', async () => {
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

    await saveCloudAutosave('Al.ice.Bob', { foo: 'bar' });

    const encodedName = 'Al%2Eice%2EBob';
    expect(calls.some((url) => url.includes(`/autosaves/${encodedName}/`))).toBe(true);
    expect(calls.some((url) => url.includes('/autosaves/Al.ice.Bob/'))).toBe(false);
  });
});
