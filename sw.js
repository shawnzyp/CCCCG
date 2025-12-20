importScripts('./scripts/cloud-outbox-shared.js');

const {
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
} = self.cccgCloudOutbox || {};

if (!OUTBOX_DB_NAME || !openOutboxDb) {
  throw new Error('Cloud outbox helpers unavailable in service worker');
}

const MANIFEST_PATH = './asset-manifest.json';
const MANIFEST_CACHE = 'cccg-manifest';
const MANIFEST_META_URL = `${MANIFEST_PATH}?meta=1`;
const MANIFEST_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const ESSENTIAL_RUNTIME_ASSETS = ['./scripts/anim.js'];
const SHELL_ASSETS = ['./', './index.html'];

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
  await cacheManifestResponse(response);
  return manifest;
}

async function fetchManifestFromCache() {
  const cache = await caches.open(MANIFEST_CACHE);
  const cachedResponse = await cache.match(MANIFEST_URL);
  const metaResponse = await cache.match(resolveAssetUrl(MANIFEST_META_URL));
  if (metaResponse) {
    try {
      const meta = await metaResponse.clone().json();
      const cachedAt = Number(meta?.cachedAt);
      if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > MANIFEST_MAX_AGE_MS) {
        return null;
      }
    } catch (err) {
      return null;
    }
  }
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
  if (!isValidManifest(manifest)) {
    throw new Error('Invalid manifest');
  }
  const cache = await caches.open(manifest.version);
  return { cache, manifest };
}

async function precacheAll(cache, manifest) {
  if (!cache) return;

  const assetSet = new Set(
    Array.isArray(manifest?.assets)
      ? manifest.assets.filter(asset => typeof asset === 'string' && asset)
      : []
  );

  ESSENTIAL_RUNTIME_ASSETS.forEach(asset => {
    if (typeof asset === 'string' && asset) {
      assetSet.add(asset);
    }
  });

  SHELL_ASSETS.forEach(asset => {
    if (typeof asset === 'string' && asset) {
      assetSet.add(asset);
    }
  });

  if (typeof MANIFEST_PATH === 'string' && MANIFEST_PATH) {
    assetSet.add(MANIFEST_PATH);
  }

  const skippedAssets = [];

  await Promise.all(
    [...assetSet].map(async asset => {
      const resolvedAsset = resolveAssetUrl(asset);
      try {
        await cache.add(resolvedAsset);
      } catch (err) {
        skippedAssets.push({ asset: resolvedAsset, error: err });
      }
    })
  );

  if (skippedAssets.length && typeof console !== 'undefined') {
    const failed = skippedAssets.map(entry => entry.asset);
    if (!isSwOffline() && console?.warn) {
      console.warn('Skipped precaching assets due to cache.add failures:', failed);
    } else if (console?.info) {
      console.info('Skipped precaching assets while offline:', failed);
    }
  }
}

const CLOUD_SAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves';
const CLOUD_HISTORY_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/history';
const CLOUD_AUTOSAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/autosaves';
const CLOUD_PINS_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/pins';
let flushPromise = null;

function encodePath(name) {
  if (typeof name !== 'string' || !name) return '';
  return name
    .split('/')
    .map(segment => (typeof segment === 'string' ? segment : ''))
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment).replace(/\./g, '%2E'))
    .join('/');
}

function isSwOffline() {
  return (
    typeof self.navigator !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(self.navigator, 'onLine') &&
    self.navigator.onLine === false
  );
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  clients.forEach(client => client.postMessage(message));
}
async function cacheManifestResponse(response) {
  try {
    const cache = await caches.open(MANIFEST_CACHE);
    await cache.put(MANIFEST_URL, response.clone());
    await cache.put(
      resolveAssetUrl(MANIFEST_META_URL),
      new Response(JSON.stringify({ cachedAt: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (err) {}
}

async function pushQueuedSave({ name, payload, ts, kind }) {
  const encoded = encodePath(name);
  const body = JSON.stringify(payload);
  const entryKind = kind === 'autosave' ? 'autosave' : 'manual';

  if (entryKind === 'autosave') {
    const autosaveRes = await fetch(`${CLOUD_AUTOSAVES_URL}/${encoded}/${ts}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!autosaveRes.ok) throw new Error(`HTTP ${autosaveRes.status}`);
    return;
  }

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
  e.waitUntil(
    (async () => {
      const { cache, manifest } = await getCacheAndManifest();
      await precacheAll(cache, manifest);
    })()
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      let activeCacheName = null;
      try {
        const manifest = await loadManifest();
        if (isValidManifest(manifest)) {
          activeCacheName = manifest.version;
        }
      } catch (err) {}

      const cacheCleanup = activeCacheName
        ? caches
            .keys()
            .then(keys =>
              Promise.all(
                keys
                  .filter(k => k !== activeCacheName && k !== MANIFEST_CACHE)
                  .map(k => caches.delete(k))
              )
            )
        : Promise.resolve();

      await Promise.all([cacheCleanup, flushOutbox().catch(() => {})]);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.url === MANIFEST_URL) {
    e.respondWith(
      (async () => {
        try {
          const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`Failed to fetch asset manifest: HTTP ${response.status}`);
          }
          await cacheManifestResponse(response);
          return response;
        } catch (err) {
          const manifestCache = await caches.open(MANIFEST_CACHE);
          const cached = await manifestCache.match(MANIFEST_URL);
          if (cached) {
            return cached;
          }
          throw err;
        }
      })()
    );
    return;
  }

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
        if (request.mode === 'navigate') {
          const cachedShell = await cache.match(resolveAssetUrl('./index.html'));
          if (cachedShell) {
            return cachedShell;
          }
        }
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
    const { name, payload, ts, requestId = null } = data;
    const port = Array.isArray(event.ports) && event.ports.length ? event.ports[0] : null;
    const respond = message => {
      if (!message || typeof message !== 'object') return;
      const payload = { ...message };
      if (requestId !== null && !Object.prototype.hasOwnProperty.call(payload, 'requestId')) {
        payload.requestId = requestId;
      }
      if (port && typeof port.postMessage === 'function') {
        try {
          port.postMessage(payload);
        } catch {}
        return;
      }
      if (event.source && typeof event.source.postMessage === 'function') {
        try {
          event.source.postMessage({
            type: 'queue-cloud-save-result',
            ...payload,
          });
        } catch {}
      }
    };

    const serializeError = err => {
      if (!err) return { message: 'Unknown error' };
      if (err instanceof Error) {
        const { name: errorName = 'Error', message = 'Error', stack = '' } = err;
        return { name: errorName, message, stack };
      }
      if (typeof err === 'object') {
        try {
          return { ...err };
        } catch {}
      }
      return { message: String(err) };
    };

    if (!name || typeof ts !== 'number') {
      respond({ ok: false, error: { message: 'Invalid cloud save payload' } });
      return;
    }
    let entry;
    try {
      entry = createCloudSaveOutboxEntry({
        name,
        payload,
        ts,
        kind: data.kind === 'autosave' ? 'autosave' : 'manual',
        queuedAt: data.queuedAt,
      });
    } catch (err) {
      console.error('Failed to normalize cloud save entry', err);
      respond({ ok: false, error: serializeError(err) });
      return;
    }
    event.waitUntil(
      (async () => {
        try {
          await addOutboxEntry(entry);
        } catch (err) {
          console.error('Failed to queue cloud save', err);
          respond({ ok: false, error: serializeError(err) });
          return;
        }
        try {
          await flushOutbox();
        } catch (err) {
          console.error('Failed to flush cloud outbox after queueing save', err);
        }
        respond({ ok: true });
      })()
    );
  } else if (data.type === 'queue-pin') {
    const { name, hash = null, op } = data;
    if (!name || !op) return;
    let entry;
    try {
      entry = createCloudPinOutboxEntry({ name, hash, op, queuedAt: data.queuedAt });
    } catch (err) {
      console.error('Failed to normalize cloud pin entry', err);
      return;
    }
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
