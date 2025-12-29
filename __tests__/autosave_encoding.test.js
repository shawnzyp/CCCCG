import { jest } from '@jest/globals';

describe('cloud autosave path encoding', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.removeItem('cc:device-id');
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('uses uid and character ids in autosave paths', async () => {
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

    const { saveCloudAutosave, setActiveAuthUserId } = await import('../scripts/storage.js');

    setActiveAuthUserId('user-123');
    await saveCloudAutosave('Al.ice.Bob', { foo: 'bar', character: { characterId: 'character-456' } });
    setActiveAuthUserId('');

    const encodedUid = 'user-123';
    const encodedCharacter = 'character-456';
    expect(calls.some((url) => url.includes(`/autosaves/${encodedUid}/${encodedCharacter}/`))).toBe(true);
  });

  test('lists autosaves using encoded uid and character ids', async () => {
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

    const { listCloudAutosaves, setActiveAuthUserId } = await import('../scripts/storage.js');

    setActiveAuthUserId('user.id');
    await listCloudAutosaves('MyChar', { characterId: 'char.id' });
    setActiveAuthUserId('');

    const encodedUid = 'user%2Eid';
    const encodedCharacter = 'char%2Eid';
    expect(calls.some((url) => url.includes(`/autosaves/${encodedUid}/${encodedCharacter}.json`))).toBe(true);
  });
});
