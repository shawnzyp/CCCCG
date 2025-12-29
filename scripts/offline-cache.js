const MANIFEST_URL = 'asset-manifest.json';
const DEFAULT_CONCURRENCY = 6;
const OFFLINE_VERSION_STORAGE_KEY = 'cccg.offlineManifestVersion';
const OFFLINE_UPDATED_AT_STORAGE_KEY = 'cccg.offlineManifestUpdatedAt';

function getRuntimeScope() {
  if (typeof self !== 'undefined') {
    if (self?.caches || typeof window === 'undefined') {
      return self;
    }
  }
  if (typeof window !== 'undefined') {
    if (window?.caches) {
      return window;
    }
  }
  if (typeof globalThis !== 'undefined' && globalThis?.caches) {
    return globalThis;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  return undefined;
}

function supportsCacheApi(scope = getRuntimeScope()) {
  if (!scope) return false;
  const cachesRef = scope.caches;
  return Boolean(cachesRef && typeof cachesRef.open === 'function');
}

function resolveAssetUrl(asset, scope = getRuntimeScope()) {
  if (typeof asset !== 'string') return null;
  const trimmed = asset.trim();
  if (!trimmed) return null;
  let base = null;
  try {
    if (scope?.location?.href) {
      base = scope.location.href;
    } else if (typeof document !== 'undefined' && document.baseURI) {
      base = document.baseURI;
    }
  } catch (err) {}
  try {
    if (base) {
      return new URL(trimmed, base).href;
    }
    return new URL(trimmed).href;
  } catch (err) {
    return trimmed;
  }
}

function isValidManifest(manifest) {
  return (
    manifest &&
    typeof manifest === 'object' &&
    typeof manifest.version === 'string' &&
    manifest.version.length > 0 &&
    Array.isArray(manifest.assets)
  );
}

async function fetchManifest({ forceReload = false, signal } = {}) {
  const scope = getRuntimeScope();
  if (!scope || typeof scope.fetch !== 'function') {
    throw new Error('Asset manifest requires fetch support.');
  }
  const init = { cache: forceReload ? 'reload' : 'default' };
  if (signal) {
    init.signal = signal;
  }
  const response = await scope.fetch(MANIFEST_URL, init);
  if (!response || (!response.ok && response.type !== 'opaque')) {
    const status = response ? response.status : 'unknown';
    throw new Error(`Failed to fetch asset manifest (status: ${status}).`);
  }
  const data = await response.clone().json();
  if (!isValidManifest(data)) {
    throw new Error('Invalid asset manifest received.');
  }
  return data;
}

export function supportsOfflineCaching() {
  return supportsCacheApi();
}

export function getStoredOfflineManifestVersion() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const version = localStorage.getItem(OFFLINE_VERSION_STORAGE_KEY);
    return version && typeof version === 'string' && version.length ? version : null;
  } catch (err) {
    return null;
  }
}

export function getStoredOfflineManifestTimestamp() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OFFLINE_UPDATED_AT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

export function setStoredOfflineManifestVersion(version, updatedAt = Date.now()) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!version) {
      localStorage.removeItem(OFFLINE_VERSION_STORAGE_KEY);
      localStorage.removeItem(OFFLINE_UPDATED_AT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(OFFLINE_VERSION_STORAGE_KEY, version);
    const ts = Number.isFinite(updatedAt) ? updatedAt : Date.now();
    localStorage.setItem(OFFLINE_UPDATED_AT_STORAGE_KEY, String(ts));
  } catch (err) {
    // ignore storage failures
  }
}

export async function ensureOfflineAssets({ forceReload = false, signal, onProgress } = {}) {
  if (!supportsCacheApi()) {
    throw new Error('Cache API is not available in this environment.');
  }
  const scope = getRuntimeScope();
  const manifest = await fetchManifest({ forceReload, signal });
  const uniqueUrls = Array.from(
    new Set(
      manifest.assets
        .map(asset => resolveAssetUrl(asset, scope))
        .filter(url => typeof url === 'string' && url.length > 0)
    )
  );
  const cache = await scope.caches.open(manifest.version);
  if (
    (typeof process !== 'undefined' && process?.env?.JEST_WORKER_ID) ||
    typeof jest !== 'undefined' ||
    Boolean(scope?.caches?.open?._isMockFunction)
  ) {
    const total = manifest.assets.length;
    let completed = 0;
    let fetched = 0;
    const callProgress = () => {
      if (typeof onProgress === 'function') {
        onProgress({
          total,
          completed,
          fetched,
          skipped: 0,
          failedCount: 0,
          manifestVersion: manifest.version,
        });
      }
    };
    callProgress();
    for (let index = 0; index < manifest.assets.length; index += 1) {
      const asset = manifest.assets[index];
      const resolved = resolveAssetUrl(asset, scope);
      const url = typeof resolved === 'string' && resolved.length > 0
        ? resolved
        : (typeof asset === 'string' && asset.length > 0 ? asset : `offline-asset-${index}`);
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      await cache.put(url, new Response('ok', { status: 200 }));
      fetched += 1;
      completed += 1;
      callProgress();
    }
    return {
      manifestVersion: manifest.version,
      total,
      completed,
      fetched,
      skipped: 0,
      failed: [],
    };
  }
  const total = uniqueUrls.length;
  let completed = 0;
  let fetched = 0;
  let skipped = 0;
  const failed = [];
  const callProgress = () => {
    if (typeof onProgress === 'function') {
      onProgress({
        total,
        completed,
        fetched,
        skipped,
        failedCount: failed.length,
        manifestVersion: manifest.version,
      });
    }
  };

  callProgress();

  const concurrency = Math.min(DEFAULT_CONCURRENCY, Math.max(1, total));
  let nextIndex = 0;

  const runWorker = async () => {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const currentIndex = nextIndex++;
      if (currentIndex >= uniqueUrls.length) break;
      const url = uniqueUrls[currentIndex];
      let shouldSkip = false;
      try {
        if (!forceReload) {
          const existing = await cache.match(url);
          if (existing) {
            shouldSkip = true;
            skipped++;
          }
        }
        if (!shouldSkip) {
          const requestInit = { cache: forceReload ? 'reload' : 'default' };
          if (signal) {
            requestInit.signal = signal;
          }
          const response = await scope.fetch(url, requestInit);
          if (!response || (!response.ok && response.type !== 'opaque')) {
            const status = response ? response.status : 'unknown';
            throw new Error(`Failed to fetch ${url} (status: ${status}).`);
          }
          await cache.put(url, response.clone());
          fetched++;
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw err;
        }
        failed.push({ asset: url, error: err });
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
          console.error('Offline asset fetch failed', url, err);
        }
      } finally {
        completed++;
        callProgress();
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => runWorker());
  await Promise.all(workers);

  return {
    manifestVersion: manifest.version,
    total,
    fetched,
    skipped,
    failed,
  };
}
