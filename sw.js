// Bump cache version whenever the pre-cached asset list changes so clients
// pick up the latest files on next load.
const CACHE = 'cccg-cache-v16';
const ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './scripts/main.js',
  './scripts/helpers.js',
  './scripts/funTips.js',
  './scripts/storage.js',
  './scripts/faction.js',
  // Additional scripts required for offline operation
  './scripts/characters.js',
  './scripts/modal.js',
  './codex-character.json',
  './codex-gear-class.json',
  './codex-gear-universal.json',
  './ruleshelp.txt',
  './ccccg.pdf',
  // background and other images
  './images/Dark.PNG',
  './images/Light.PNG',
  './images/High Contrast.PNG',
  './images/Forest.PNG',
  './images/Ocean.PNG',
  './images/Mutant.PNG',
  './images/Enhanced Human.PNG',
  './images/Magic User.PNG',
  './images/Alien:Extraterrestrial.PNG',
  './images/Mystical Being.PNG',
  './images/LOGO ICON.png',
  './images/LOGO.PNG'
];

const CLOUD_SAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves';
const CLOUD_HISTORY_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/history';
const CLOUD_PINS_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/pins';
const OUTBOX_DB = 'cccg-cloud-outbox';
const OUTBOX_VERSION = 2;
const OUTBOX_STORE = 'cloud-saves';
const OUTBOX_PINS_STORE = 'cloud-pins';

let flushPromise = null;

function encodePath(name) {
  return name
    .split('/')
    .map(s => encodeURIComponent(s))
    .join('/');
}

function isSwOffline() {
  return (
    typeof self.navigator !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(self.navigator, 'onLine') &&
    self.navigator.onLine === false
  );
}

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, OUTBOX_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(OUTBOX_PINS_STORE)) {
        db.createObjectStore(OUTBOX_PINS_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addOutboxEntry(entry, storeName = OUTBOX_STORE) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(storeName).add(entry);
  });
}

async function getOutboxEntries(storeName = OUTBOX_STORE) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOutboxEntry(id, storeName = OUTBOX_STORE) {
  const db = await openOutboxDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(storeName).delete(id);
  });
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage(message));
}

async function pushQueuedSave({ name, payload, ts }) {
  const encoded = encodePath(name);
  const body = JSON.stringify(payload);
  const res = await fetch(`${CLOUD_SAVES_URL}/${encoded}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  await fetch(`${CLOUD_HISTORY_URL}/${encoded}/${ts}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const listRes = await fetch(`${CLOUD_HISTORY_URL}/${encoded}.json`, { method: 'GET' });
  if (listRes.ok) {
    const val = await listRes.json();
    const keys = val ? Object.keys(val).map(k => Number(k)).sort((a, b) => b - a) : [];
    const excess = keys.slice(3);
    await Promise.all(
      excess.map(k =>
        fetch(`${CLOUD_HISTORY_URL}/${encoded}/${k}.json`, { method: 'DELETE' })
      )
    );
  }
}

async function pushQueuedPin({ name, hash, op }) {
  const encoded = encodePath(name);
  if (op === 'delete') {
    const res = await fetch(`${CLOUD_PINS_URL}/${encoded}.json`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return;
  }
  if (op === 'set') {
    const res = await fetch(`${CLOUD_PINS_URL}/${encoded}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hash ?? null),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}

async function flushOutbox() {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    if (isSwOffline()) {
      if (self.registration?.sync && typeof self.registration.sync.register === 'function') {
        try {
          await self.registration.sync.register('cloud-save-sync');
        } catch {}
      }
      return;
    }

    const [entries, pinEntries] = await Promise.all([
      getOutboxEntries(),
      getOutboxEntries(OUTBOX_PINS_STORE),
    ]);
    if (!entries.length && !pinEntries.length) return;

    entries.sort((a, b) => {
      if (a.ts !== b.ts) return a.ts - b.ts;
      if (a.queuedAt && b.queuedAt && a.queuedAt !== b.queuedAt) return a.queuedAt - b.queuedAt;
      if (a.id && b.id) return a.id - b.id;
      return 0;
    });

    let synced = false;
    for (const entry of entries) {
      try {
        await pushQueuedSave(entry);
        if (entry.id !== undefined) {
          await deleteOutboxEntry(entry.id);
        }
        synced = true;
      } catch (err) {
        console.error('Cloud outbox flush failed', err);
        if (self.registration?.sync && typeof self.registration.sync.register === 'function') {
          try {
            await self.registration.sync.register('cloud-save-sync');
          } catch {}
        }
        break;
      }
    }

    pinEntries.sort((a, b) => {
      if (a.queuedAt && b.queuedAt && a.queuedAt !== b.queuedAt) return a.queuedAt - b.queuedAt;
      if (a.id && b.id) return a.id - b.id;
      return 0;
    });

    let pinsSynced = false;
    for (const entry of pinEntries) {
      try {
        await pushQueuedPin(entry);
        if (entry.id !== undefined) {
          await deleteOutboxEntry(entry.id, OUTBOX_PINS_STORE);
        }
        pinsSynced = true;
      } catch (err) {
        console.error('Cloud pin flush failed', err);
        if (self.registration?.sync && typeof self.registration.sync.register === 'function') {
          try {
            await self.registration.sync.register('cloud-save-sync');
          } catch {}
        }
        break;
      }
    }

    if (synced) {
      await broadcast('cacheCloudSaves');
    }
    if (pinsSynced) {
      await broadcast('pins-updated');
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
      flushOutbox().catch(() => {}),
    ])
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const notifyClient = () => {
    if (e.clientId) {
      self.clients.get(e.clientId).then(client => {
        if (client) client.postMessage('cacheCloudSaves');
      });
    }
  };

  const cacheKey = request.url.split('?')[0];

  if (new URL(request.url).origin !== location.origin) return;

  e.respondWith(
    fetch(request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(cacheKey, copy));
        if (request.mode === 'navigate') {
          notifyClient();
        }
        return res;
      })
      .catch(() => caches.match(cacheKey))
  );
});

self.addEventListener('message', event => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'queue-cloud-save') {
    const { name, payload, ts } = data;
    if (!name || typeof ts !== 'number') return;
    const entry = { name, payload, ts, queuedAt: Date.now() };
    event.waitUntil(
      addOutboxEntry(entry)
        .then(() => flushOutbox())
        .catch(err => console.error('Failed to queue cloud save', err))
    );
  } else if (data.type === 'queue-pin') {
    const { name, hash = null, op } = data;
    if (!name || !op) return;
    if (op !== 'set' && op !== 'delete') return;
    const entry = { name, hash, op, queuedAt: Date.now() };
    event.waitUntil(
      addOutboxEntry(entry, OUTBOX_PINS_STORE)
        .then(() => flushOutbox())
        .catch(err => console.error('Failed to queue cloud pin', err))
    );
  } else if (data.type === 'flush-cloud-saves') {
    event.waitUntil(flushOutbox());
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'cloud-save-sync') {
    event.waitUntil(flushOutbox());
  }
});
