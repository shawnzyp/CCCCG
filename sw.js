const MANIFEST_PATH = 'asset-manifest.json';

function resolveAssetUrl(pathname) {
  try {
    return new URL(pathname, self.registration?.scope ?? self.location.href).toString();
  } catch (err) {
    return pathname;
  }
}

const MANIFEST_URL = resolveAssetUrl(MANIFEST_PATH);

let manifestFetchPromise = null;
let cachedManifest = null;

function isValidManifest(manifest) {
  return (
    manifest &&
    typeof manifest === 'object' &&
    typeof manifest.version === 'string' &&
    manifest.version.length > 0 &&
    Array.isArray(manifest.assets)
  );
}

async function fetchManifestFromNetwork() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch asset manifest: HTTP ${response.status}`);
  }
  const manifest = await response.clone().json();
  if (!isValidManifest(manifest)) {
    throw new Error('Invalid asset manifest received');
  }
  return manifest;
}

async function fetchManifestFromCache() {
  const cachedResponse = await caches.match(MANIFEST_URL);
  if (!cachedResponse) return null;
  try {
    const manifest = await cachedResponse.clone().json();
    if (isValidManifest(manifest)) {
      return manifest;
    }
  } catch (err) {}
  return null;
}

async function loadManifest() {
  if (cachedManifest) {
    return cachedManifest;
  }
  if (!manifestFetchPromise) {
    manifestFetchPromise = (async () => {
      try {
        const manifest = await fetchManifestFromNetwork();
        cachedManifest = manifest;
        return manifest;
      } catch (networkError) {
        const fallback = await fetchManifestFromCache();
        if (fallback) {
          cachedManifest = fallback;
          return fallback;
        }
        throw networkError;
      }
    })().finally(() => {
      manifestFetchPromise = null;
    });
  }
  return manifestFetchPromise;
}

async function getCacheAndManifest() {
  const manifest = await loadManifest();
  const cache = await caches.open(manifest.version);
  return { cache, manifest };
}

async function precacheManifestAssets(cache, manifest) {
  if (!manifest || !Array.isArray(manifest.assets) || !cache) return;

  const skippedAssets = [];
  const assets = manifest.assets.filter(asset => typeof asset === 'string' && asset);

  await Promise.all(
    assets.map(async asset => {
      try {
        await cache.add(asset);
      } catch (err) {
        skippedAssets.push({ asset, error: err });
      }
    })
  );

  if (skippedAssets.length && typeof console !== 'undefined' && console?.warn) {
    const failed = skippedAssets.map(entry => entry.asset);
    console.warn('Skipped precaching assets due to fetch failures:', failed);
  }
}

const CLOUD_SAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves';
const CLOUD_HISTORY_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/history';
const CLOUD_PINS_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/pins';
const OUTBOX_DB = 'cccg-cloud-outbox';
const OUTBOX_VERSION = 2;
const OUTBOX_STORE = 'cloud-saves';
const OUTBOX_PINS_STORE = 'cloud-pins';

let flushPromise = null;
let notifyClientsOnActivate = false;

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
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  clients.forEach(client => client.postMessage(message));
}

async function ensureLaunchVideoReset(videoUrl) {
  const normalizedUrl = (typeof videoUrl === 'string' && videoUrl) ? resolveAssetUrl(videoUrl) : null;
  if (normalizedUrl) {
    try {
      const response = await fetch(normalizedUrl, { cache: 'reload' });
      if (response && (response.ok || response.type === 'opaque')) {
        try {
          const { cache } = await getCacheAndManifest();
          const request = new Request(normalizedUrl);
          await cache.put(request, response.clone());
        } catch (cacheError) {
          // ignore cache population failures for large media assets
        }
      }
    } catch (err) {
      try {
        const { cache } = await getCacheAndManifest();
        await cache.delete(normalizedUrl);
      } catch (cacheDeleteError) {
        // ignore cache cleanup failures
      }
    }
  }
  try {
    await broadcast({ type: 'reset-launch-video' });
  } catch (err) {
    // ignore broadcast failures
  }
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
  notifyClientsOnActivate = Boolean(self.registration?.active);
  self.skipWaiting();
  e.waitUntil(
    (async () => {
      const { cache, manifest } = await getCacheAndManifest();
      await precacheManifestAssets(cache, manifest);
    })()
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      let activeCacheName = null;
      try {
        const manifest = await loadManifest();
        activeCacheName = manifest.version;
      } catch (err) {}

      const cacheCleanup = activeCacheName
        ? caches
            .keys()
            .then(keys =>
              Promise.all(keys.filter(k => k !== activeCacheName).map(k => caches.delete(k)))
            )
        : Promise.resolve();

      await Promise.all([cacheCleanup, flushOutbox().catch(() => {})]);
      await self.clients.claim();
      if (notifyClientsOnActivate) {
        await broadcast({ type: 'sw-updated', message: 'New Codex content is available.', updatedAt: Date.now(), source: 'service-worker' });
        notifyClientsOnActivate = false;
      }
    })()
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const notifyClient = () => {
    if (e.clientId) {
      self.clients.get(e.clientId).then(client => {
        if (client) client.postMessage('cacheCloudSaves');
      });
    }
  };

  const cacheKey = request.url.split('?')[0];
  const isRangeRequest = request.headers.has('range');
  const isMediaRequest = request.destination === 'video' || request.destination === 'audio';

  e.respondWith(
    (async () => {
      let cache;
      try {
        ({ cache } = await getCacheAndManifest());
      } catch (err) {
        const fallback = await caches.match(cacheKey);
        if (fallback) {
          return fallback;
        }
        throw err;
      }

      try {
        const response = await fetch(request);
        if (!isRangeRequest && (!isMediaRequest || response.status === 200)) {
          const copy = response.clone();
          cache.put(cacheKey, copy).catch(() => {});
        }
        if (request.mode === 'navigate') {
          notifyClient();
        }
        return response;
      } catch (networkError) {
        if (!isRangeRequest) {
          const cached = await cache.match(cacheKey);
          if (cached) {
            return cached;
          }
        }
        if (isRangeRequest) {
          const cachedRangeFallback = await cache.match(cacheKey);
          if (cachedRangeFallback) {
            return cachedRangeFallback;
          }
        }
        throw networkError;
      }
    })()
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
  } else if (data.type === 'launch-video-played') {
    event.waitUntil(ensureLaunchVideoReset(data.videoUrl));
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'cloud-save-sync') {
    event.waitUntil(flushOutbox());
  }
});
