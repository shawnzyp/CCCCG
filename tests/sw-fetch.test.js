import { jest } from '@jest/globals';

function createCaches() {
  const stores = new Map();
  const getKey = request => {
    if (typeof request === 'string') return request;
    if (request && typeof request.url === 'string') return request.url;
    return String(request);
  };
  const open = async name => {
    if (!stores.has(name)) {
      const map = new Map();
      stores.set(name, {
        match: async request => map.get(getKey(request)) || undefined,
        put: async (request, response) => {
          map.set(getKey(request), response);
        },
        delete: async request => map.delete(getKey(request)),
        _map: map,
      });
    }
    return stores.get(name);
  };
  return {
    open,
    match: async request => {
      for (const cache of stores.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    _stores: stores,
  };
}

describe('service worker fetch handler', () => {
  beforeEach(() => {
    jest.resetModules();
    globalThis.importScripts = jest.fn();

    const handlers = {};
    globalThis.self = {
      location: new URL('https://example.com/'),
      registration: { scope: 'https://example.com/' },
      navigator: { onLine: true },
      clients: {
        matchAll: jest.fn(async () => []),
        get: jest.fn(),
      },
      addEventListener: (type, handler) => {
        handlers[type] = handler;
      },
      cccgCloudOutbox: {
        OUTBOX_DB_NAME: 'outbox',
        OUTBOX_VERSION: 1,
        OUTBOX_STORE: 'store',
        OUTBOX_PINS_STORE: 'pins',
        openOutboxDb: async () => ({}),
        addOutboxEntry: async () => {},
        getOutboxEntries: async () => [],
        deleteOutboxEntry: async () => {},
        createCloudSaveOutboxEntry: entry => entry,
        createCloudPinOutboxEntry: entry => entry,
      },
      __handlers: handlers,
    };

    globalThis.caches = createCaches();
  });

  test('returns cached shell on navigation fetch failure', async () => {
    const manifestUrl = 'https://example.com/asset-manifest.json';
    globalThis.fetch = jest.fn(async input => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === manifestUrl) {
        return new Response(JSON.stringify({ version: 'v1', assets: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('offline');
    });

    await import('../sw.js');

    const cache = await globalThis.caches.open('v1');
    await cache.put('https://example.com/index.html', new Response('shell'));

    const request = {
      url: 'https://example.com/app',
      method: 'GET',
      mode: 'navigate',
      headers: { has: () => false },
      destination: '',
    };

    let responsePromise;
    const event = {
      request,
      clientId: null,
      respondWith: promise => {
        responsePromise = promise;
      },
    };

    globalThis.self.__handlers.fetch(event);
    const response = await responsePromise;
    const text = await response.text();

    expect(text).toBe('shell');
  });
});
