import { jest } from '@jest/globals';

const STATE_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/shardDeck.json';
const LOCK_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/shardDeckLock.json';

describe('Shard draws sync via cloud and prevent duplicates', () => {
  let remoteData;
  let lockVal;

  beforeEach(() => {
    remoteData = null;
    lockVal = null;
    localStorage.clear();
    const stub = () => ({
      addEventListener: jest.fn(),
      classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
      appendChild: jest.fn(),
      append: jest.fn(),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
      innerHTML: '',
      textContent: '',
      disabled: false
    });
    document.getElementById = jest.fn(stub);
    document.querySelector = jest.fn(stub);
    document.querySelectorAll = jest.fn(() => []);
    global.fetch = jest.fn(async (url, opts = {}) => {
      if (url === LOCK_URL) {
        if (opts.method === 'PUT') {
          const body = JSON.parse(opts.body);
          lockVal = body === 'null' ? null : body;
          return { ok: true, status: 200, headers: { get: () => 'etag' }, json: async () => null };
        }
        return { ok: true, status: 200, headers: { get: () => 'etag' }, json: async () => lockVal };
      }
      if (url === STATE_URL) {
        if (opts.method === 'PUT') {
          remoteData = JSON.parse(opts.body);
          return { ok: true, status: 200, headers: { get: () => 'etag' }, json: async () => null };
        }
        return { ok: true, status: 200, headers: { get: () => 'etag' }, json: async () => remoteData };
      }
      throw new Error('Unexpected fetch to ' + url);
    });
  });

  test('two players cannot draw the same card', async () => {
    await import('../shard-of-many-fates.js');
    const firstDraw = await window.CCShard.draw(1);
    const firstName = firstDraw[0].name;

    jest.resetModules();
    delete window.CCShard;
    await import('../shard-of-many-fates.js');
    const secondDraw = await window.CCShard.draw(1);
    const secondName = secondDraw[0].name;

    expect(secondName).not.toBe(firstName);
  });
});

