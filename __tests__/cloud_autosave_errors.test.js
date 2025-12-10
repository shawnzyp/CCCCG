import { jest } from '@jest/globals';

const noopResponse = {
  json: async () => ({}),
  text: async () => '',
  arrayBuffer: async () => new ArrayBuffer(0),
  blob: async () => (typeof Blob === 'function' ? new Blob() : null),
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

  test('includes response body text in error message', async () => {
    const responseText = 'Permission denied';
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      ...noopResponse,
      text: async () => responseText,
    }));

    const { saveCloudAutosave } = await import('../scripts/storage.js');

    await expect(saveCloudAutosave('Test Character', { foo: 'bar' }))
      .rejects.toThrow(`HTTP 400: ${responseText}`);
  });
});
