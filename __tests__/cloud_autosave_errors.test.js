import { jest } from '@jest/globals';

const noopResponse = {
  json: async () => ({}),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
  blob: async () => (typeof Blob === 'function' ? new Blob() : null),
  headers: { get: () => '' },
  clone() {
    return this;
  },
};

describe('cloud autosave error handling', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('includes JSON error bodies in thrown HTTP errors', async () => {
    const responseError = 'Permission denied';
    const url = 'https://example.test/autosaves/foo.json';
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      url,
      ...noopResponse,
      headers: { get: () => 'application/json; charset=utf-8' },
      json: async () => ({ error: responseError }),
    }));

    const { saveCloudAutosave } = await import('../scripts/storage.js');

    await expect(saveCloudAutosave('Test Character', { foo: 'bar' }))
      .rejects.toThrow(`HTTP 400: ${responseError} (${url})`);
  });

  test('rejects payloads with invalid Firebase keys before fetch', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    const { saveCloudAutosave } = await import('../scripts/storage.js');

    await expect(saveCloudAutosave('Test Character', { 'bad.key': { 'nested#bad': 1 } }))
      .rejects.toThrow(/Invalid Firebase keys in payload: bad\.key/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
