import { beforeAll, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../scripts/auth.js', () => ({
  getFirebaseDatabase: () => null,
}));

let listLegacyLocalSaves;
let listLocalSaves;

beforeAll(async () => {
  const storageModule = await import('../scripts/storage.js');
  listLegacyLocalSaves = storageModule.listLegacyLocalSaves;
  listLocalSaves = storageModule.listLocalSaves;
});

function createStorageMock() {
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: key => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: index => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function installStorage() {
  const storage = createStorageMock();
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
  });
  return storage;
}

describe('listLocalSaves', () => {
  it('excludes legacy keys by default', () => {
    const storage = installStorage();
    storage.setItem('save:legacyName', '{}');
    storage.setItem('save:user123:Aria', '{}');
    storage.setItem('save:user456:Bram', '{}');
    storage.setItem('misc:key', '{}');

    expect(listLocalSaves()).toEqual(['user123:Aria', 'user456:Bram']);
  });

  it('includes legacy keys when includeLegacy is true', () => {
    const storage = installStorage();
    storage.setItem('save:legacyName', '{}');
    storage.setItem('save:user123:Aria', '{}');
    storage.setItem('save:user456:Bram', '{}');

    expect(listLocalSaves({ includeLegacy: true })).toEqual([
      'legacyName',
      'user123:Aria',
      'user456:Bram',
    ]);
  });
});

describe('listLegacyLocalSaves', () => {
  it('returns only legacy saves', () => {
    const storage = installStorage();
    storage.setItem('save:legacyName', '{}');
    storage.setItem('save:user123:Aria', '{}');
    storage.setItem('save:user456:Bram', '{}');

    expect(listLegacyLocalSaves()).toEqual(['legacyName']);
  });
});
