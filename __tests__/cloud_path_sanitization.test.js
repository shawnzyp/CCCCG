import { jest } from '@jest/globals';

function createFetchResponse({ ok = true, status = 200, jsonValue = null } = {}) {
  return {
    ok,
    status,
    json: jest.fn(() => Promise.resolve(jsonValue)),
    text: jest.fn(() => Promise.resolve('')),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(0))),
    blob: jest.fn(() => Promise.resolve({})),
  };
}

describe('cloud save path sanitization', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  });

  afterEach(() => {
    delete global.fetch;
    delete global.navigator;
  });

  test.each([
    ['../escape', '%252E%252E/escape'],
    ['./hero', '%252E/hero'],
    ['nested/name', 'nested/name'],
    ['multi//slash//name', 'multi/slash/name'],
    ['name/..//../escape', 'name/%252E%252E/%252E%252E/escape'],
  ])('saveCloud keeps %s under /saves', async (input, expectedPath) => {
    const responses = [
      createFetchResponse(),
      createFetchResponse(),
      createFetchResponse({ jsonValue: {} }),
    ];
    const fetchMock = jest.fn(() => {
      if (!responses.length) {
        throw new Error('Unexpected fetch call');
      }
      return Promise.resolve(responses.shift());
    });
    global.fetch = fetchMock;
    global.navigator = { onLine: true };

    const { saveCloud } = await import('../scripts/storage.js');

    await expect(saveCloud(input, { hp: 10 })).resolves.toBe('saved');
    expect(fetchMock).toHaveBeenCalled();

    const [firstUrl] = fetchMock.mock.calls[0];
    const parsed = new URL(firstUrl);

    expect(parsed.pathname.startsWith('/saves/')).toBe(true);
    expect(parsed.pathname.includes('/../')).toBe(false);
    expect(parsed.pathname.includes('/./')).toBe(false);
    expect(parsed.pathname).toBe(`/saves/${expectedPath}.json`);
  });
});
