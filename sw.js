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
const MANIFEST_VERSION = '2025-01-22';
const ESSENTIAL_RUNTIME_ASSETS = ['./scripts/anim.js'];

function resolveAssetUrl(pathname) {
  try {
    return new URL(pathname, self.registration?.scope ?? self.location.href).toString();
  } catch (err) {
    return pathname;
  }
}

const MANIFEST_URL = resolveAssetUrl(`${MANIFEST_PATH}?v=${MANIFEST_VERSION}`);

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

  if (typeof MANIFEST_PATH === 'string' && MANIFEST_PATH) {
    assetSet.add(MANIFEST_PATH);
  }

  if (typeof MANIFEST_URL === 'string' && MANIFEST_URL) {
    assetSet.add(MANIFEST_URL);
  }

  const skippedAssets = [];

  await Promise.all(
    [...assetSet].map(async asset => {
      try {
        await cache.add(asset);
      } catch (err) {
        skippedAssets.push({ asset, error: err });
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

const SW_BUILD = 'autosave-key-v3';
let flushPromise = null;
let notifyClientsOnActivate = false;

function sanitizePathSegment(segment) {
  if (typeof segment !== 'string') return '';
  return segment
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[#$\[\]]/g, '_');
}

function encodePath(name) {
  if (typeof name !== 'string' || !name) return '';
  return name
    .split('/')
    .map(segment => sanitizePathSegment(typeof segment === 'string' ? segment : ''))
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment).replace(/\./g, '%2E'))
    .join('/');
}

function sanitizeForJson(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return { value: undefined };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { value: null };
  }
  if (value && typeof value === 'object') {
    if (typeof value.toJSON === 'function') {
      return sanitizeForJson(value.toJSON(), seen);
    }
    if (seen.has(value)) {
      return { error: new Error('Circular JSON value detected') };
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const next = [];
      for (const entry of value) {
        const result = sanitizeForJson(entry, seen);
        if (result.error) return result;
        next.push(result.value === undefined ? null : result.value);
      }
      seen.delete(value);
      return { value: next };
    }
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const result = sanitizeForJson(entry, seen);
      if (result.error) return result;
      if (result.value !== undefined) {
        next[key] = result.value;
      }
    }
    seen.delete(value);
    return { value: next };
  }
  return { value };
}

function safeJsonStringify(value) {
  const sanitized = sanitizeForJson(value);
  if (sanitized.error) {
    return { ok: false, error: sanitized.error, value: null, json: null };
  }
  try {
    return { ok: true, value: sanitized.value, json: JSON.stringify(sanitized.value) };
  } catch (err) {
    return { ok: false, error: err, value: null, json: null };
  }
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

function resolveAutosaveKey({ uid, characterId }) {
  const trimmedUid = typeof uid === 'string' ? uid.trim() : '';
  const trimmedCharacter = typeof characterId === 'string' ? characterId.trim() : '';
  if (trimmedUid && trimmedCharacter) {
    return `${trimmedUid}/${trimmedCharacter}`;
  }
  return '';
}

function normalizeAutosaveEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { action: 'drop', reason: 'Invalid autosave outbox entry' };
  }
  const name = typeof entry.name === 'string' ? entry.name : '';
  const rawCharacterId = typeof entry.characterId === 'string' && entry.characterId.trim()
    ? entry.characterId.trim()
    : '';
  let characterId = rawCharacterId;
  const payloadCharacterId = entry?.payload?.character?.characterId;
  if (!characterId && typeof payloadCharacterId === 'string' && payloadCharacterId.trim()) {
    characterId = payloadCharacterId.trim();
  }
  const uid = typeof entry.uid === 'string' && entry.uid.trim()
    ? entry.uid.trim()
    : '';
  if (!uid && !rawCharacterId && !payloadCharacterId && name && !name.includes('/')) {
    return { action: 'drop', reason: 'Legacy autosave entry missing identifiers' };
  }
  if (!characterId) {
    return { action: 'drop', reason: 'Missing characterId for autosave outbox entry' };
  }
  if (!uid) {
    return { action: 'drop', reason: 'Missing uid for autosave outbox entry' };
  }
  return {
    action: 'keep',
    entry: {
      ...entry,
      name,
      uid,
      characterId,
    },
  };
}

async function pushQueuedSave({ name, payload, ts, kind, uid, characterId, cloudUrls }) {
  const entryKind = kind === 'autosave' ? 'autosave' : 'manual';
  const serialized = safeJsonStringify(payload);
  if (!serialized.ok) {
    const error = new Error('Invalid JSON payload for cloud save');
    error.name = 'InvalidPayloadError';
    error.cause = serialized.error;
    throw error;
  }

  if (entryKind === 'autosave') {
    const autosaveKey = resolveAutosaveKey({ uid, characterId });
    if (!autosaveKey) {
      throw new Error('Invalid autosave key');
    }
    const autosaveBase = cloudUrls?.autosavesUrl;
    if (!autosaveBase) {
      throw new Error('Missing autosave base URL');
    }
    const autosaveRes = await fetch(`${autosaveBase}/${encodePath(autosaveKey)}/${ts}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: serialized.json,
    });
    if (!autosaveRes.ok) throw new Error(`HTTP ${autosaveRes.status}`);
    return;
  }

  const encoded = encodePath(name);
  const savesBase = cloudUrls?.savesUrl;
  const historyBase = cloudUrls?.historyUrl;
  if (!savesBase || !historyBase) {
    throw new Error('Missing cloud save base URL');
  }
  const res = await fetch(`${savesBase}/${encoded}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: serialized.json,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  await fetch(`${historyBase}/${encoded}/${ts}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: serialized.json,
  });

  const listRes = await fetch(`${historyBase}/${encoded}.json`, { method: 'GET' });
  if (listRes.ok) {
    const val = await listRes.json();
    const keys = val ? Object.keys(val).map(k => Number(k)).sort((a, b) => b - a) : [];
    const excess = keys.slice(3);
    await Promise.all(
      excess.map(k =>
        fetch(`${historyBase}/${encoded}/${k}.json`, { method: 'DELETE' })
      )
    );
  }
}

async function pushQueuedPin({ name, hash, op, pinsUrl }) {
  const encoded = encodePath(name);
  const pinsBase = pinsUrl;
  if (op === 'delete') {
    if (!pinsBase) {
      throw new Error('Missing pins base URL');
    }
    const res = await fetch(`${pinsBase}/${encoded}.json`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return;
  }
  if (op === 'set') {
    if (!pinsBase) {
      throw new Error('Missing pins base URL');
    }
    const res = await fetch(`${pinsBase}/${encoded}.json`, {
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
        if (entry?.kind === 'autosave') {
          const normalized = normalizeAutosaveEntry(entry);
          if (normalized.action === 'drop') {
            console.warn('Dropping legacy autosave outbox entry', normalized.reason, entry);
            if (entry.id !== undefined) {
              await deleteOutboxEntry(entry.id);
            }
            continue;
          }
          await pushQueuedSave(normalized.entry);
        } else {
          await pushQueuedSave(entry);
        }
        if (entry.id !== undefined) {
          await deleteOutboxEntry(entry.id);
        }
        synced = true;
      } catch (err) {
        if (err?.name === 'InvalidPayloadError') {
          console.warn('Dropping outbox entry with invalid payload', err, entry);
          if (entry.id !== undefined) {
            await deleteOutboxEntry(entry.id);
          }
          continue;
        }
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
              Promise.all(keys.filter(k => k !== activeCacheName).map(k => caches.delete(k)))
            )
        : Promise.resolve();

      await Promise.all([cacheCleanup, flushOutbox().catch(() => {})]);
      await self.clients.claim();
      await broadcast({ type: 'sw-build', build: SW_BUILD, updatedAt: Date.now() });
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
    const { name, payload, ts, uid = '', characterId = '', requestId = null } = data;
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
        uid,
        characterId,
        queuedAt: data.queuedAt,
        cloudUrls: data.cloudUrls || null,
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
    const { name, hash = null, op, pinsUrl } = data;
    if (!name || !op) return;
    let entry;
    try {
      entry = createCloudPinOutboxEntry({ name, hash, op, queuedAt: data.queuedAt, pinsUrl });
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
  } else if (data.type === 'launch-video-played') {
    event.waitUntil(ensureLaunchVideoReset(data.videoUrl));
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'cloud-save-sync') {
    event.waitUntil(flushOutbox());
  }
});
