import { jest } from '@jest/globals';

const notificationsMock = { toast: jest.fn() };

function createIndexedDbMock() {
  const databases = new Map();

  function cloneValue(value) {
    try {
      return value === undefined ? value : JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function createRequest(executor) {
    const request = { onsuccess: null, onerror: null, result: undefined, error: null };
    setTimeout(() => {
      try {
        request.result = executor();
        request.onsuccess?.({ target: request });
      } catch (err) {
        request.error = err;
        request.onerror?.({ target: request });
      }
    }, 0);
    return request;
  }

  function createDatabase(name, version) {
    const stores = new Map();

    const db = {
      name,
      version,
      objectStoreNames: {
        contains(storeName) {
          return stores.has(storeName);
        },
      },
      createObjectStore(storeName, options = {}) {
        if (stores.has(storeName)) {
          return stores.get(storeName);
        }
        const store = {
          data: new Map(),
          keyPath: options.keyPath || 'id',
          autoIncrement: Boolean(options.autoIncrement),
          counter: 0,
        };
        stores.set(storeName, store);
        return store;
      },
      transaction(storeNames, mode) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        const tx = {
          mode,
          oncomplete: null,
          onerror: null,
          objectStore(name) {
            if (!stores.has(name)) {
              if (mode !== 'readwrite') {
                throw new Error(`Object store ${name} not found`);
              }
              db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
            }
            const store = stores.get(name);
            return {
              add(value) {
                return createRequest(() => {
                  let record = cloneValue(value);
                  let key = record?.[store.keyPath];
                  if (store.autoIncrement && (key === undefined || key === null)) {
                    store.counter += 1;
                    key = store.counter;
                    if (record && typeof record === 'object') {
                      record[store.keyPath] = key;
                    }
                  }
                  store.data.set(key, cloneValue(record));
                  Promise.resolve().then(() => tx.oncomplete?.({ target: tx }));
                  return key;
                });
              },
              clear() {
                return createRequest(() => {
                  store.data.clear();
                  Promise.resolve().then(() => tx.oncomplete?.({ target: tx }));
                  return undefined;
                });
              },
              delete(key) {
                return createRequest(() => {
                  store.data.delete(key);
                  Promise.resolve().then(() => tx.oncomplete?.({ target: tx }));
                  return undefined;
                });
              },
              getAll() {
                return createRequest(() => Array.from(store.data.values()).map(cloneValue));
              },
            };
          },
        };
        return tx;
      },
    };

    return db;
  }

  return {
    open(name, version) {
      const request = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null, error: null };
      setTimeout(() => {
        let record = databases.get(name);
        if (!record || record.version !== version) {
          record = createDatabase(name, version);
          databases.set(name, record);
          if (request.onupgradeneeded) {
            request.result = record;
            try {
              request.onupgradeneeded({ target: request });
            } catch (err) {
              request.error = err;
              request.onerror?.({ target: request });
              return;
            }
          }
        }
        request.result = record;
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
}

function createFetchResponse({ json = null } = {}) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(json),
    text: jest.fn().mockResolvedValue(''),
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: jest.fn().mockResolvedValue(new Blob()),
    clone() {
      return createFetchResponse({ json });
    },
  };
}

async function importStorageWithMocks() {
  jest.resetModules();
  jest.unstable_mockModule('../scripts/notifications.js', () => notificationsMock);
  return import('../scripts/storage.js');
}

afterEach(() => {
  delete global.fetch;
  delete global.indexedDB;
  delete global.navigator;
  notificationsMock.toast.mockReset();
});

test('listCloudSaves fetches from cloud without auth', async () => {
  const fetchMock = jest.fn().mockResolvedValue(createFetchResponse());
  global.fetch = fetchMock;

  const { listCloudSaves } = await importStorageWithMocks();

  await listCloudSaves();

  expect(fetchMock).toHaveBeenCalled();
  const url = fetchMock.mock.calls[0][0];
  expect(url).toBe(
    'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves.json'
  );
});

test('queues cloud saves locally when no service worker is available', async () => {
  const idbMock = createIndexedDbMock();
  global.indexedDB = idbMock;
  global.navigator = { onLine: false };
  global.fetch = jest
    .fn()
    .mockRejectedValue(new TypeError('network offline'));

  const { saveCloud, getQueuedCloudSaves } = await importStorageWithMocks();

  const status = await saveCloud('Test Hero', { level: 5 });
  expect(status).toBe('queued');

  const queued = await getQueuedCloudSaves();
  expect(queued).toHaveLength(1);
  expect(queued[0].name).toBe('Test Hero');
});

test('stores pending save when controller is absent and flushes once available', async () => {
  const idbMock = createIndexedDbMock();
  global.indexedDB = idbMock;

  const controllerListeners = {};
  const postMessage = jest.fn();
  const registration = {
    active: { postMessage },
    sync: { register: jest.fn().mockResolvedValue(undefined) },
  };

  global.navigator = {
    onLine: false,
    serviceWorker: {
      controller: null,
      ready: Promise.resolve(registration),
      addEventListener: jest.fn((event, handler) => {
        controllerListeners[event] = handler;
      }),
      removeEventListener: jest.fn((event, handler) => {
        if (controllerListeners[event] === handler) {
          delete controllerListeners[event];
        }
      }),
    },
  };

  const fetchMock = jest
    .fn()
    .mockRejectedValueOnce(new TypeError('network offline'))
    .mockImplementation(() => Promise.resolve(createFetchResponse()));
  global.fetch = fetchMock;

  const { saveCloud, getQueuedCloudSaves } = await importStorageWithMocks();

  const status = await saveCloud('Controller Hero', { level: 7 });
  expect(status).toBe('queued');

  const queued = await getQueuedCloudSaves();
  expect(queued).toHaveLength(1);

  global.navigator.serviceWorker.controller = registration.active;
  controllerListeners.controllerchange?.();

  await Promise.resolve();

  expect(postMessage).toHaveBeenCalledWith({ type: 'flush-cloud-saves' });
});

test('local outbox flushes queued save when coming back online without service worker', async () => {
  jest.useRealTimers();
  const idbMock = createIndexedDbMock();
  global.indexedDB = idbMock;

  const fetchMock = jest
    .fn()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockImplementation(() => Promise.resolve(createFetchResponse()));
  global.fetch = fetchMock;

  const navigatorMock = { onLine: false };
  global.navigator = navigatorMock;

  const { saveCloud, getQueuedCloudSaves } = await importStorageWithMocks();

  const status = await saveCloud('Offline Hero', { level: 3 });
  expect(status).toBe('queued');

  let queued = await getQueuedCloudSaves();
  expect(queued).toHaveLength(1);

  navigatorMock.onLine = true;
  window.dispatchEvent(new Event('online'));

  await new Promise(resolve => setTimeout(resolve, 10));

  queued = await getQueuedCloudSaves();
  expect(queued).toHaveLength(0);
  expect(fetchMock).toHaveBeenCalled();
});

