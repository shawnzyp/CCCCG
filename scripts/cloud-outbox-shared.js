(function initCloudOutboxShared(global) {
  if (!global) return;

  const OUTBOX_DB_NAME = 'cccg-cloud-outbox';
  const OUTBOX_VERSION = 2;
  const OUTBOX_STORE = 'cloud-saves';
  const OUTBOX_PINS_STORE = 'cloud-pins';

  function getIndexedDb() {
    if (typeof global.indexedDB === 'undefined') {
      throw new Error('indexedDB not supported');
    }
    return global.indexedDB;
  }

  function openOutboxDb() {
    try {
      const idb = getIndexedDb();
      return new Promise((resolve, reject) => {
        const request = idb.open(OUTBOX_DB_NAME, OUTBOX_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
            db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains(OUTBOX_PINS_STORE)) {
            db.createObjectStore(OUTBOX_PINS_STORE, { keyPath: 'id', autoIncrement: true });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async function runStoreOperation(storeName, mode, executor) {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, mode);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore(storeName);
        executor(store, resolve, reject, tx);
      } catch (operationError) {
        reject(operationError);
      }
    });
  }

  async function addOutboxEntry(entry, storeName = OUTBOX_STORE) {
    const payload = entry && typeof entry === 'object' ? entry : {};
    await runStoreOperation(storeName, 'readwrite', (store, resolve, reject) => {
      const request = store.add(payload);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function getOutboxEntries(storeName = OUTBOX_STORE) {
    const db = await openOutboxDb();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => {
          const result = Array.isArray(request.result) ? request.result : [];
          resolve(result.map(entry => ({ ...entry })));
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function deleteOutboxEntry(id, storeName = OUTBOX_STORE) {
    await runStoreOperation(storeName, 'readwrite', (store, resolve, reject) => {
      try {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function createCloudSaveOutboxEntry({ name, payload, ts, kind, queuedAt, deviceId, uid, characterId, cloudUrls }) {
    if (typeof name !== 'string' || !name) {
      throw new TypeError('Invalid cloud save entry name');
    }
    const normalizedTs = Number(ts);
    if (!Number.isFinite(normalizedTs)) {
      throw new TypeError('Invalid cloud save entry timestamp');
    }
    const entryKind = kind === 'autosave' ? 'autosave' : 'manual';
    return {
      name,
      payload,
      ts: normalizedTs,
      queuedAt: Number.isFinite(queuedAt) ? queuedAt : Date.now(),
      kind: entryKind,
      deviceId: typeof deviceId === 'string' && deviceId ? deviceId : null,
      uid: typeof uid === 'string' && uid ? uid : null,
      characterId: typeof characterId === 'string' && characterId ? characterId : null,
      cloudUrls: cloudUrls && typeof cloudUrls === 'object' ? { ...cloudUrls } : null,
    };
  }

  function createCloudPinOutboxEntry({ name, hash, op, queuedAt }) {
    if (typeof name !== 'string' || !name) {
      throw new TypeError('Invalid cloud pin entry name');
    }
    if (op !== 'set' && op !== 'delete') {
      throw new TypeError('Invalid cloud pin operation');
    }
    return {
      name,
      hash: typeof hash === 'string' && hash ? hash : null,
      op,
      queuedAt: Number.isFinite(queuedAt) ? queuedAt : Date.now(),
    };
  }

  const shared = {
    OUTBOX_DB_NAME,
    OUTBOX_VERSION,
    OUTBOX_STORE,
    OUTBOX_PINS_STORE,
    openOutboxDb,
    addOutboxEntry,
    getOutboxEntries,
    deleteOutboxEntry,
    createCloudSaveOutboxEntry,
    createCloudPinOutboxEntry,
  };

  if (global.cccgCloudOutbox) {
    Object.assign(global.cccgCloudOutbox, shared);
  } else {
    Object.defineProperty(global, 'cccgCloudOutbox', {
      value: shared,
      writable: false,
      configurable: false,
    });
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
