const DM_CREDENTIALS_CLOUD_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/dmCredentials';
const DM_CREDENTIAL_CACHE_KEY = 'cc:dm-credential-cache';
const DM_CREDENTIAL_CACHE_VERSION = 1;
const DM_PIN_DEFAULT_ITERATIONS = 120000;
const DM_PIN_DEFAULT_DIGEST = 'SHA-256';
const DM_PIN_DEFAULT_KEY_LENGTH = 32;
const DM_PIN_SALT_BYTES = 16;

let credentialCache = null;
let credentialCachePromise = null;
let nodeCryptoModulePromise = null;

function now() {
  return Date.now();
}

function getGlobalCrypto() {
  if (typeof globalThis === 'object' && globalThis && typeof globalThis.crypto === 'object') {
    return globalThis.crypto;
  }
  return null;
}

async function getNodeCryptoModule() {
  if (nodeCryptoModulePromise) {
    return nodeCryptoModulePromise;
  }
  if (typeof process === 'undefined' || !process?.versions?.node) {
    nodeCryptoModulePromise = Promise.resolve(null);
    return nodeCryptoModulePromise;
  }
  nodeCryptoModulePromise = import('node:crypto').catch(() => null);
  return nodeCryptoModulePromise;
}

async function getSubtleCrypto() {
  const globalCrypto = getGlobalCrypto();
  if (globalCrypto?.subtle) {
    return globalCrypto.subtle;
  }
  const nodeCrypto = await getNodeCryptoModule();
  if (nodeCrypto?.webcrypto?.subtle) {
    return nodeCrypto.webcrypto.subtle;
  }
  return null;
}

async function getRandomValues(byteLength) {
  const globalCrypto = getGlobalCrypto();
  if (globalCrypto?.getRandomValues) {
    const buffer = new Uint8Array(byteLength);
    globalCrypto.getRandomValues(buffer);
    return buffer;
  }
  const nodeCrypto = await getNodeCryptoModule();
  if (nodeCrypto?.webcrypto?.getRandomValues) {
    const buffer = new Uint8Array(byteLength);
    nodeCrypto.webcrypto.getRandomValues(buffer);
    return buffer;
  }
  if (nodeCrypto?.randomBytes) {
    return new Uint8Array(nodeCrypto.randomBytes(byteLength));
  }
  throw new Error('Unable to access secure random number generator');
}

function textEncoder() {
  if (typeof TextEncoder === 'function') {
    return new TextEncoder();
  }
  const encoder = {
    encode(value) {
      const stringValue = typeof value === 'string' ? value : String(value ?? '');
      const result = new Uint8Array(stringValue.length);
      for (let i = 0; i < stringValue.length; i += 1) {
        result[i] = stringValue.charCodeAt(i) & 0xff;
      }
      return result;
    },
  };
  return encoder;
}

function base64ToUint8Array(value) {
  if (typeof value !== 'string' || !value) return new Uint8Array();
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  }
  throw new Error('No base64 decoder available');
}

function uint8ArrayToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return '';
  }
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  throw new Error('No base64 encoder available');
}

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0;
    const bCode = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= aCode ^ bCode;
  }
  return mismatch === 0;
}

function encodeCredentialKey(username) {
  if (typeof username !== 'string' || !username) return '';
  return username
    .split('/')
    .map(segment => (typeof segment === 'string' ? segment : ''))
    .filter(Boolean)
    .map(segment => {
      if (segment === '.' || segment === '..') {
        return encodeURIComponent(segment.replace(/\./g, '%2E'));
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

function safeLocalStorageGet(key) {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Failed to read localStorage key ${key}`, error);
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') {
      return false;
    }
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Failed to persist localStorage key ${key}`, error);
    return false;
  }
}

function safeLocalStorageRemove(key) {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.removeItem !== 'function') {
      return false;
    }
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove localStorage key ${key}`, error);
    return false;
  }
}

function sanitizeUsername(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDigest(value) {
  if (typeof value !== 'string') return DM_PIN_DEFAULT_DIGEST;
  const trimmed = value.trim();
  if (!trimmed) return DM_PIN_DEFAULT_DIGEST;
  const normalized = trimmed.toUpperCase();
  if (normalized === 'SHA-256' || normalized === 'SHA256') return 'SHA-256';
  throw new Error(`Unsupported DM PIN digest: ${value}`);
}

function getNodeDigestIdentifier(digest) {
  if (typeof digest !== 'string' || !digest) {
    return '';
  }
  const normalized = digest.replace(/-/g, '').trim().toLowerCase();
  return normalized;
}

function normalizeIterations(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }
  return DM_PIN_DEFAULT_ITERATIONS;
}

function normalizeKeyLength(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }
  return DM_PIN_DEFAULT_KEY_LENGTH;
}

function cloneCredential(record) {
  if (!record) return null;
  return {
    username: record.username,
    hash: record.hash,
    salt: record.salt,
    iterations: record.iterations,
    keyLength: record.keyLength,
    digest: record.digest,
    updatedAt: record.updatedAt,
  };
}

function normalizeCredentialRecord(username, payload) {
  const normalizedUsername = sanitizeUsername(username);
  if (!normalizedUsername) return null;
  if (!payload || typeof payload !== 'object') return null;
  const hash = typeof payload.hash === 'string' ? payload.hash : '';
  const salt = typeof payload.salt === 'string' ? payload.salt : '';
  if (!hash || !salt) return null;
  try {
    const record = {
      username: normalizedUsername,
      hash,
      salt,
      iterations: normalizeIterations(payload.iterations),
      keyLength: normalizeKeyLength(payload.keyLength),
      digest: normalizeDigest(payload.digest),
      updatedAt: Number.isFinite(payload.updatedAt) ? payload.updatedAt : now(),
    };
    return record;
  } catch (error) {
    console.error('Failed to normalize DM credential record', error);
    return null;
  }
}

function ensureCredentialCache() {
  if (credentialCache && credentialCache.records instanceof Map) {
    return credentialCache;
  }
  credentialCache = {
    records: new Map(),
    updatedAt: now(),
  };
  return credentialCache;
}

function serializeCredentialCache(cache) {
  if (!cache || !(cache.records instanceof Map)) {
    return null;
  }
  const payload = {
    version: DM_CREDENTIAL_CACHE_VERSION,
    updatedAt: cache.updatedAt,
    credentials: Object.create(null),
  };
  cache.records.forEach((record, username) => {
    payload.credentials[username] = {
      hash: record.hash,
      salt: record.salt,
      iterations: record.iterations,
      keyLength: record.keyLength,
      digest: record.digest,
      updatedAt: record.updatedAt,
    };
  });
  return payload;
}

function persistCredentialCache(cache) {
  const serialized = serializeCredentialCache(cache);
  if (!serialized) return;
  try {
    safeLocalStorageSet(DM_CREDENTIAL_CACHE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.error('Failed to persist DM credential cache', error);
  }
}

function hydrateCredentialCacheFromLocalStorage() {
  const raw = safeLocalStorageGet(DM_CREDENTIAL_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== DM_CREDENTIAL_CACHE_VERSION) return null;
    const credentials = parsed.credentials;
    if (!credentials || typeof credentials !== 'object') return null;
    const cache = ensureCredentialCache();
    cache.records.clear();
    Object.keys(credentials).forEach(username => {
      const record = normalizeCredentialRecord(username, credentials[username]);
      if (record) {
        cache.records.set(record.username, record);
      }
    });
    cache.updatedAt = Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : now();
    return cache;
  } catch (error) {
    console.error('Failed to parse DM credential cache', error);
    return null;
  }
}

function updateCredentialCache(record) {
  if (!record) return;
  const cache = ensureCredentialCache();
  cache.records.set(record.username, record);
  cache.updatedAt = now();
  persistCredentialCache(cache);
}

function replaceCredentialCache(records) {
  const cache = ensureCredentialCache();
  cache.records.clear();
  if (records instanceof Map) {
    records.forEach((value, key) => {
      const record = normalizeCredentialRecord(key, value);
      if (record) {
        cache.records.set(record.username, record);
      }
    });
  } else if (records && typeof records === 'object') {
    Object.keys(records).forEach(username => {
      const record = normalizeCredentialRecord(username, records[username]);
      if (record) {
        cache.records.set(record.username, record);
      }
    });
  }
  cache.updatedAt = now();
  persistCredentialCache(cache);
  return cache;
}

async function fetchCloudCredentialRecords() {
  if (typeof fetch !== 'function') {
    throw new Error('fetch not supported');
  }
  const response = await fetch(`${DM_CREDENTIALS_CLOUD_URL}.json`);
  if (!response || typeof response.ok !== 'boolean') {
    throw new TypeError('Invalid DM credential response');
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  return payload;
}

async function putCloudCredentialRecord(username, record) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch not supported');
  }
  const encodedName = encodeCredentialKey(username);
  const payload = {
    hash: record.hash,
    salt: record.salt,
    iterations: record.iterations,
    keyLength: record.keyLength,
    digest: record.digest,
    updatedAt: record.updatedAt,
  };
  const response = await fetch(`${DM_CREDENTIALS_CLOUD_URL}/${encodedName}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response || typeof response.ok !== 'boolean') {
    throw new TypeError('Invalid DM credential response');
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function loadCredentialCache({ forceRefresh = false } = {}) {
  if (!forceRefresh && credentialCache && credentialCache.records instanceof Map) {
    return credentialCache;
  }
  if (!forceRefresh) {
    const hydrated = hydrateCredentialCacheFromLocalStorage();
    if (hydrated && hydrated.records.size > 0) {
      credentialCache = hydrated;
      return credentialCache;
    }
  }
  if (credentialCachePromise) {
    return credentialCachePromise;
  }
  credentialCachePromise = (async () => {
    try {
      const records = await fetchCloudCredentialRecords();
      const cache = replaceCredentialCache(records);
      return cache;
    } finally {
      credentialCachePromise = null;
    }
  })();
  return credentialCachePromise;
}

async function derivePinHash(pin, { salt, iterations, keyLength, digest }) {
  const normalizedIterations = normalizeIterations(iterations);
  const normalizedKeyLength = normalizeKeyLength(keyLength);
  const normalizedDigest = normalizeDigest(digest);
  const saltBytes = base64ToUint8Array(salt);
  const encoder = textEncoder();
  const subtle = await getSubtleCrypto();
  if (subtle) {
    const keyMaterial = await subtle.importKey('raw', encoder.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
    const derivedBits = await subtle.deriveBits({
      name: 'PBKDF2',
      hash: { name: normalizedDigest },
      salt: saltBytes,
      iterations: normalizedIterations,
    }, keyMaterial, normalizedKeyLength * 8);
    return uint8ArrayToBase64(new Uint8Array(derivedBits));
  }
  const nodeCrypto = await getNodeCryptoModule();
  if (nodeCrypto?.pbkdf2Sync || nodeCrypto?.pbkdf2) {
    const digestForNode = getNodeDigestIdentifier(normalizedDigest) || normalizedDigest.toLowerCase();
    const fn = nodeCrypto.pbkdf2Sync || nodeCrypto.pbkdf2;
    if (fn === nodeCrypto.pbkdf2) {
      const derived = await new Promise((resolve, reject) => {
        nodeCrypto.pbkdf2(pin, Buffer.from(saltBytes), normalizedIterations, normalizedKeyLength, digestForNode, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result);
        });
      });
      return Buffer.from(derived).toString('base64');
    }
    const derived = nodeCrypto.pbkdf2Sync(pin, Buffer.from(saltBytes), normalizedIterations, normalizedKeyLength, digestForNode);
    return Buffer.from(derived).toString('base64');
  }
  throw new Error('PBKDF2 not available');
}

export async function deriveDmPinHash(pin, config) {
  return derivePinHash(pin, config);
}

export async function generateDmSalt(byteLength = DM_PIN_SALT_BYTES) {
  const bytes = await getRandomValues(Math.max(8, Math.trunc(byteLength)));
  return uint8ArrayToBase64(bytes);
}

export async function upsertDmCredentialPin(username, pin, options = {}) {
  const normalizedUsername = sanitizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Username is required');
  }
  const salt = typeof options.salt === 'string' && options.salt
    ? options.salt
    : await generateDmSalt(DM_PIN_SALT_BYTES);
  const iterations = normalizeIterations(options.iterations);
  const keyLength = normalizeKeyLength(options.keyLength);
  const digest = normalizeDigest(options.digest);
  const hash = await derivePinHash(pin, { salt, iterations, keyLength, digest });
  const record = {
    username: normalizedUsername,
    hash,
    salt,
    iterations,
    keyLength,
    digest,
    updatedAt: now(),
  };
  await putCloudCredentialRecord(normalizedUsername, record);
  updateCredentialCache(record);
  return cloneCredential(record);
}

export async function loadDmCredentialRecords(options = {}) {
  const cache = await loadCredentialCache(options);
  const result = new Map();
  cache.records.forEach((record, username) => {
    result.set(username, cloneCredential(record));
  });
  return result;
}

export async function getDmCredential(username, options = {}) {
  const normalizedUsername = sanitizeUsername(username);
  if (!normalizedUsername) return null;
  const cache = await loadCredentialCache(options);
  const record = cache.records.get(normalizedUsername);
  return cloneCredential(record);
}

export async function verifyDmCredential(username, pin, options = {}) {
  const record = await getDmCredential(username, options);
  if (!record) return false;
  const derived = await derivePinHash(pin, record);
  return constantTimeEquals(derived, record.hash);
}

export function resetDmCredentialCache() {
  credentialCache = null;
  credentialCachePromise = null;
  safeLocalStorageRemove(DM_CREDENTIAL_CACHE_KEY);
}

export {
  DM_CREDENTIALS_CLOUD_URL,
  DM_CREDENTIAL_CACHE_KEY,
  DM_CREDENTIAL_CACHE_VERSION,
  DM_PIN_DEFAULT_DIGEST,
  DM_PIN_DEFAULT_ITERATIONS,
  DM_PIN_DEFAULT_KEY_LENGTH,
};
