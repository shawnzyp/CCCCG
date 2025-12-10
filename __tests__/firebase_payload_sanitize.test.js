import { jest } from '@jest/globals';

describe('Firebase payload UI stripping', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('autosave removes selector-based UI keys before upload', async () => {
    const bodies = [];
    global.fetch = jest.fn((_url, init = {}) => {
      const parsed = init?.body ? JSON.parse(init.body) : null;
      bodies.push(parsed);
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

    const payload = {
      stats: { hp: 10 },
      ui: {
        inputs: { '#augment-search': 'visor' },
        scroll: { panels: { '#player-tools-drawer .pt-app__viewport': 42 } },
      },
    };

    await expect(saveCloudAutosave('Tester', payload)).resolves.toBeTruthy();

    const body = bodies[0];
    expect(body.ui).toBeUndefined();
    expect(body.stats).toEqual({ hp: 10 });
  });
});
