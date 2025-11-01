const DM_CREDENTIALS_CLOUD_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/dmCredentials';
const DM_CREDENTIALS_CACHE_KEY = 'cc:dm-credential-cache';
const DM_CREDENTIALS_CACHE_VERSION = 1;
const DM_PIN_HASH_CACHE_LIMIT = 32;
const DM_PIN_DEFAULT_ITERATIONS = 120000;
const DM_PIN_SALT_BYTES = 16;

export const DM_CREDENTIAL_DEFAULT_USERNAME = 'primary';
export const DM_PIN_DEFAULT_DIGEST = 'SHA-256';
export const DM_PIN_DEFAULT_KEY_LENGTH = 32;

const DEFAULT_BOOTSTRAP_CREDENTIAL = {
  username: DM_CREDENTIAL_DEFAULT_USERNAME,
  hash: 'jnHUUj/vztK449EzTlSMvsFdIrvw24roOEo3g0i01Ls=',
  salt: 'yszLuHwFAXA5MuSscO+9vQ==',
  iterations: DM_PIN_DEFAULT_ITERATIONS,
  keyLength: DM_PIN_DEFAULT_KEY_LENGTH,
  digest: DM_PIN_DEFAULT_DIGEST,
  updatedAt: 0,
};

const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
let credentialState = null;
let fetchImplementation = typeof fetch === 'function' ? (...args) => fetch(...args) : null;
let storageAdapter = createDefaultStorageAdapter();
let bootstrapCredential = sanitizeCredentialRecord(DEFAULT_BOOTSTRAP_CREDENTIAL, 'bootstrap');
let syncPromise = null;
let nodeCryptoModulePromise = null;
const pinHashCache = new Map();

function createDefaultStorageAdapter() {
  return {
    async load() {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      try {
        const raw = localStorage.getItem(DM_CREDENTIALS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== DM_CREDENTIALS_CACHE_VERSION) {
          return null;
        }
        const records = new Map();
        if (parsed.credentials && typeof parsed.credentials === 'object') {
          Object.keys(parsed.credentials).forEach(username => {
            const record = sanitizeCredentialRecord({ ...parsed.credentials[username], username }, 'cache');
            if (record) {
              records.set(record.username, record);
            }
          });
        }
        if (records.size === 0) {
          return null;
        }
        return {
          updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
            ? parsed.updatedAt
            : Date.now(),
          credentials: records,
        };
      } catch (error) {
        console.error('Failed to load cached DM credentials', error);
        return null;
      }
    },
    async save(state) {
      if (typeof localStorage === 'undefined') {
        return;
      }
      try {
        const payload = {
          version: DM_CREDENTIALS_CACHE_VERSION,
          updatedAt: state?.updatedAt ?? Date.now(),
          credentials: {},
        };
        if (state && state.credentials instanceof Map) {
          state.credentials.forEach((record, username) => {
            payload.credentials[username] = serializeCredentialRecord(record);
          });
        }
        localStorage.setItem(DM_CREDENTIALS_CACHE_KEY, JSON.stringify(payload));
      } catch (error) {
        console.error('Failed to cache DM credentials', error);
      }
    },
    async clear() {
      if (typeof localStorage === 'undefined') {
        return;
      }
      try {
        localStorage.removeItem(DM_CREDENTIALS_CACHE_KEY);
      } catch (error) {
        console.error('Failed to clear cached DM credentials', error);
      }
    },
  };
}

function serializeCredentialRecord(record) {
  if (!record) return null;
  return {
    hash: record.hash,
    salt: record.salt,
    iterations: record.iterations,
    keyLength: record.keyLength,
    digest: record.digest,
    updatedAt: record.updatedAt,
  };
}

function cloneCredentialRecord(record) {
  if (!record) return null;
  return {
    username: record.username,
    hash: record.hash,
    salt: record.salt,
    iterations: record.iterations,
    keyLength: record.keyLength,
    digest: record.digest,
    updatedAt: record.updatedAt,
    source: record.source,
  };
}

function sanitizeCredentialRecord(candidate, source = 'cloud') {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const username = typeof candidate.username === 'string' && candidate.username
    ? candidate.username
    : (typeof candidate.id === 'string' ? candidate.id : null);
  if (!username) {
    return null;
  }
  const hash = typeof candidate.hash === 'string' && candidate.hash ? candidate.hash : null;
  const salt = typeof candidate.salt === 'string' && candidate.salt ? candidate.salt : null;
  const iterations = Number.isFinite(candidate.iterations) && candidate.iterations > 0
    ? Math.floor(candidate.iterations)
    : DM_PIN_DEFAULT_ITERATIONS;
  const keyLength = Number.isFinite(candidate.keyLength) && candidate.keyLength > 0
    ? Math.floor(candidate.keyLength)
    : DM_PIN_DEFAULT_KEY_LENGTH;
  const digest = typeof candidate.digest === 'string' && candidate.digest
    ? candidate.digest
    : DM_PIN_DEFAULT_DIGEST;
  const updatedAt = Number.isFinite(candidate.updatedAt) && candidate.updatedAt > 0
    ? candidate.updatedAt
    : Date.now();
  if (!hash || !salt) {
    return null;
  }
  return {
    username,
    hash,
    salt,
    iterations,
    keyLength,
    digest,
    updatedAt,
    source,
  };
}

function ensureCredentialStateInitialized() {
  if (credentialState && credentialState.credentials instanceof Map) {
    return;
  }
  credentialState = {
    updatedAt: Date.now(),
    credentials: new Map(),
  };
}

function getCryptoImplementation() {
  if (typeof globalThis === 'object' && globalThis && typeof globalThis.crypto === 'object' && globalThis.crypto) {
    return globalThis.crypto;
  }
  return null;
}

async function getNodeCryptoModule() {
  if (nodeCryptoModulePromise) {
    return nodeCryptoModulePromise;
  }
  if (typeof globalThis !== 'object') {
    nodeCryptoModulePromise = Promise.resolve(null);
    return nodeCryptoModulePromise;
  }
  nodeCryptoModulePromise = (async () => {
    try {
      return await import('crypto');
    } catch (importError) {
      try {
        const nodeRequire = typeof eval === 'function' ? eval('require') : null;
        if (typeof nodeRequire === 'function') {
          return nodeRequire('crypto');
        }
      } catch (requireError) {
        console.warn('Failed to load crypto module via require fallback', requireError);
      }
      return null;
    }
  })();
  return nodeCryptoModulePromise;
}

function uint8ArrayToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return '';
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return '';
}

function base64ToUint8Array(base64) {
  if (typeof base64 !== 'string' || !base64) {
    return new Uint8Array(0);
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(0);
}

function encodeUtf8(value) {
  const stringValue = typeof value === 'string' ? value : String(value ?? '');
  if (!encoder) {
    const bytes = new Uint8Array(stringValue.length);
    for (let i = 0; i < stringValue.length; i += 1) {
      bytes[i] = stringValue.charCodeAt(i) & 0xff;
    }
    return bytes;
  }
  return encoder.encode(stringValue);
}

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

const SHA256_INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(bytes) {
  const length = bytes.length;
  const bitLength = length * 8;
  const paddedLength = (((length + 9) + 63) & ~63);
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[length] = 0x80;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength & 0xffffffff, false);

  const hash = new Uint32Array(SHA256_INITIAL_HASH);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const output = new Uint8Array(32);
  for (let i = 0; i < 8; i += 1) {
    output[i * 4] = hash[i] >>> 24;
    output[i * 4 + 1] = (hash[i] >>> 16) & 0xff;
    output[i * 4 + 2] = (hash[i] >>> 8) & 0xff;
    output[i * 4 + 3] = hash[i] & 0xff;
  }
  return output;
}

function hmacSha256(keyBytes, dataBytes) {
  const blockSize = 64;
  let key = keyBytes;
  if (key.length > blockSize) {
    key = sha256(key);
  }
  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    const byte = key[i] ?? 0;
    oKeyPad[i] = byte ^ 0x5c;
    iKeyPad[i] = byte ^ 0x36;
  }
  const inner = new Uint8Array(blockSize + dataBytes.length);
  inner.set(iKeyPad);
  inner.set(dataBytes, blockSize);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(blockSize + innerHash.length);
  outer.set(oKeyPad);
  outer.set(innerHash, blockSize);
  return sha256(outer);
}

function pbkdf2Sha256(passwordBytes, saltBytes, iterations, keyLength) {
  const hLen = 32;
  const blockCount = Math.ceil(keyLength / hLen);
  const result = new Uint8Array(blockCount * hLen);
  const blockSalt = new Uint8Array(saltBytes.length + 4);
  blockSalt.set(saltBytes);

  for (let block = 1; block <= blockCount; block += 1) {
    blockSalt[saltBytes.length] = (block >>> 24) & 0xff;
    blockSalt[saltBytes.length + 1] = (block >>> 16) & 0xff;
    blockSalt[saltBytes.length + 2] = (block >>> 8) & 0xff;
    blockSalt[saltBytes.length + 3] = block & 0xff;
    let u = hmacSha256(passwordBytes, blockSalt);
    const t = new Uint8Array(u);
    for (let i = 1; i < iterations; i += 1) {
      u = hmacSha256(passwordBytes, u);
      for (let j = 0; j < hLen; j += 1) {
        t[j] ^= u[j];
      }
    }
    result.set(t, (block - 1) * hLen);
  }
  return result.slice(0, keyLength);
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

function generateSalt(byteLength = DM_PIN_SALT_BYTES) {
  const cryptoImpl = getCryptoImplementation();
  const saltBytes = new Uint8Array(byteLength);
  if (cryptoImpl && typeof cryptoImpl.getRandomValues === 'function') {
    cryptoImpl.getRandomValues(saltBytes);
  } else {
    for (let i = 0; i < byteLength; i += 1) {
      saltBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return uint8ArrayToBase64(saltBytes);
}

async function deriveCredentialHash(pin, record) {
  const cacheKey = `${record.username}:${pin}`;
  if (pinHashCache.has(cacheKey)) {
    return pinHashCache.get(cacheKey);
  }
  const saltBytes = base64ToUint8Array(record.salt);
  const iterations = record.iterations || DM_PIN_DEFAULT_ITERATIONS;
  const keyLength = record.keyLength || DM_PIN_DEFAULT_KEY_LENGTH;
  const digest = typeof record.digest === 'string' && record.digest ? record.digest : DM_PIN_DEFAULT_DIGEST;
  const cryptoImpl = getCryptoImplementation();

  if (cryptoImpl && cryptoImpl.subtle && typeof cryptoImpl.subtle.importKey === 'function') {
    try {
      const passwordBytes = encodeUtf8(pin);
      const keyMaterial = await cryptoImpl.subtle.importKey('raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveBits']);
      const derivedBits = await cryptoImpl.subtle.deriveBits({
        name: 'PBKDF2',
        salt: saltBytes,
        iterations,
        hash: digest,
      }, keyMaterial, keyLength * 8);
      const derivedBytes = new Uint8Array(derivedBits);
      const encoded = uint8ArrayToBase64(derivedBytes);
      cacheDerivedHash(cacheKey, encoded);
      return encoded;
    } catch (error) {
      console.warn('WebCrypto PBKDF2 derivation failed, falling back to software implementation', error);
    }
  }

  const nodeCrypto = await getNodeCryptoModule();
  if (nodeCrypto && typeof nodeCrypto.pbkdf2Sync === 'function') {
    try {
      const derivedBuffer = nodeCrypto.pbkdf2Sync(pin, Buffer.from(saltBytes), iterations, keyLength, digest.toLowerCase());
      const encoded = Buffer.from(derivedBuffer).toString('base64');
      cacheDerivedHash(cacheKey, encoded);
      return encoded;
    } catch (error) {
      console.warn('Node PBKDF2 derivation failed, falling back to software implementation', error);
    }
  }

  const passwordBytes = encodeUtf8(pin);
  const derived = pbkdf2Sha256(passwordBytes, saltBytes, iterations, keyLength);
  const encoded = uint8ArrayToBase64(derived);
  cacheDerivedHash(cacheKey, encoded);
  return encoded;
}

function cacheDerivedHash(cacheKey, hash) {
  if (!cacheKey || typeof cacheKey !== 'string') return;
  pinHashCache.set(cacheKey, hash);
  if (pinHashCache.size > DM_PIN_HASH_CACHE_LIMIT) {
    const keys = pinHashCache.keys();
    const first = keys.next();
    if (!first.done) {
      pinHashCache.delete(first.value);
    }
  }
}

function mergeCredentialMaps(baseMap, updates) {
  const next = new Map(baseMap);
  updates.forEach((record, username) => {
    next.set(username, record);
  });
  return next;
}

async function fetchCloudCredentials() {
  if (!fetchImplementation) {
    return null;
  }
  const url = `${DM_CREDENTIALS_CLOUD_URL}.json`;
  try {
    const response = await fetchImplementation(url, { method: 'GET', cache: 'no-store' });
    if (!response || !response.ok) {
      return null;
    }
    const payload = typeof response.json === 'function' ? await response.json() : null;
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const records = new Map();
    Object.keys(payload).forEach(username => {
      const record = sanitizeCredentialRecord({ ...payload[username], username }, 'cloud');
      if (record) {
        records.set(record.username, record);
      }
    });
    if (records.size === 0) {
      return null;
    }
    return {
      credentials: records,
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.error('Failed to fetch DM credentials', error);
    return null;
  }
}

async function writeCloudCredential(username, record) {
  if (!fetchImplementation) {
    throw new Error('Cloud credential sync unavailable');
  }
  const target = `${DM_CREDENTIALS_CLOUD_URL}/${encodeURIComponent(username)}.json`;
  const body = JSON.stringify(serializeCredentialRecord(record));
  const response = await fetchImplementation(target, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
  if (!response || !response.ok) {
    throw new Error(`Failed to persist DM credential for ${username}`);
  }
  return true;
}

async function ensureCredentialState({ forceRefresh = false } = {}) {
  if (credentialState && !forceRefresh) {
    return credentialState;
  }
  if (syncPromise) {
    return syncPromise;
  }
  syncPromise = (async () => {
    ensureCredentialStateInitialized();
    if (!forceRefresh && credentialState.credentials.size > 0) {
      return credentialState;
    }
    let cacheInvalidated = false;
    let loaded = null;
    try {
      loaded = await storageAdapter.load();
    } catch (error) {
      console.error('Failed to load DM credential cache', error);
    }
    if (loaded && loaded.credentials instanceof Map && loaded.credentials.size > 0) {
      credentialState = {
        updatedAt: loaded.updatedAt,
        credentials: loaded.credentials,
      };
      cacheInvalidated = true;
    }
    const fetched = await fetchCloudCredentials();
    if (fetched && fetched.credentials instanceof Map && fetched.credentials.size > 0) {
      credentialState = {
        updatedAt: fetched.updatedAt,
        credentials: mergeCredentialMaps(credentialState.credentials, fetched.credentials),
      };
      cacheInvalidated = true;
    }
    if ((!credentialState || credentialState.credentials.size === 0) && bootstrapCredential) {
      credentialState = {
        updatedAt: Date.now(),
        credentials: new Map([[bootstrapCredential.username, bootstrapCredential]]),
      };
      cacheInvalidated = true;
    }
    if (!credentialState || credentialState.credentials.size === 0) {
      credentialState = {
        updatedAt: Date.now(),
        credentials: new Map(),
      };
      cacheInvalidated = true;
    }
    if (cacheInvalidated) {
      pinHashCache.clear();
    }
    try {
      await storageAdapter.save(credentialState);
    } catch (error) {
      console.error('Failed to persist DM credential cache', error);
    }
    return credentialState;
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

function setCredentialState(nextState) {
  credentialState = nextState;
  pinHashCache.clear();
  if (credentialState) {
    try {
      storageAdapter.save(credentialState);
    } catch (error) {
      console.error('Failed to update DM credential cache', error);
    }
  }
}

export async function configureDmCredentialEnvironment({ fetch: nextFetch, storage, bootstrap } = {}) {
  fetchImplementation = typeof nextFetch === 'function' ? nextFetch : (typeof fetch === 'function' ? (...args) => fetch(...args) : null);
  storageAdapter = storage && typeof storage.load === 'function' && typeof storage.save === 'function'
    ? storage
    : createDefaultStorageAdapter();
  if (bootstrap === null) {
    bootstrapCredential = null;
  } else if (bootstrap) {
    const candidate = sanitizeCredentialRecord(bootstrap, 'bootstrap');
    bootstrapCredential = candidate;
  } else {
    bootstrapCredential = sanitizeCredentialRecord(DEFAULT_BOOTSTRAP_CREDENTIAL, 'bootstrap');
  }
  clearDmCredentialCache();
}

export function clearDmCredentialCache() {
  credentialState = null;
  pinHashCache.clear();
  syncPromise = null;
}

export async function refreshDmCredentialCache() {
  const state = await ensureCredentialState({ forceRefresh: true });
  return getCredentialRecordsFromState(state);
}

function getCredentialRecordsFromState(state) {
  if (!state || !(state.credentials instanceof Map)) {
    return new Map();
  }
  return new Map(state.credentials);
}

export async function loadDmCredentialRecords(options = {}) {
  const state = await ensureCredentialState(options);
  return getCredentialRecordsFromState(state);
}

export async function getDmCredentialRecord(username, options = {}) {
  const records = await loadDmCredentialRecords(options);
  return records.get(username) || null;
}

export async function hasDmCredential({ username = DM_CREDENTIAL_DEFAULT_USERNAME } = {}) {
  const record = await getDmCredentialRecord(username);
  return !!record;
}

export async function verifyDmCredentialPin({ username = DM_CREDENTIAL_DEFAULT_USERNAME, pin }) {
  const candidate = typeof pin === 'string' ? pin.trim() : '';
  if (!candidate) {
    return false;
  }
  const record = await getDmCredentialRecord(username);
  if (!record) {
    return false;
  }
  try {
    const derived = await deriveCredentialHash(candidate, record);
    return constantTimeEquals(derived, record.hash);
  } catch (error) {
    console.error('Failed to verify DM credential', error);
    return false;
  }
}

function prepareCredentialRecord({ username, pin, iterations, keyLength, digest }) {
  const normalizedIterations = Number.isFinite(iterations) && iterations > 0
    ? Math.floor(iterations)
    : DM_PIN_DEFAULT_ITERATIONS;
  const normalizedKeyLength = Number.isFinite(keyLength) && keyLength > 0
    ? Math.floor(keyLength)
    : DM_PIN_DEFAULT_KEY_LENGTH;
  const normalizedDigest = typeof digest === 'string' && digest ? digest : DM_PIN_DEFAULT_DIGEST;
  const salt = generateSalt();
  return {
    username,
    pin,
    salt,
    iterations: normalizedIterations,
    keyLength: normalizedKeyLength,
    digest: normalizedDigest,
  };
}

async function persistCredentialRecord({ username, pin, iterations, keyLength, digest, allowOverwrite }) {
  const existing = await getDmCredentialRecord(username);
  if (existing && !allowOverwrite && (!existing.source || existing.source !== 'bootstrap')) {
    throw new Error('Credential already exists');
  }
  const prepared = prepareCredentialRecord({ username, pin, iterations, keyLength, digest });
  const derived = await deriveCredentialHash(pin, prepared);
  const record = {
    username,
    hash: derived,
    salt: prepared.salt,
    iterations: prepared.iterations,
    keyLength: prepared.keyLength,
    digest: prepared.digest,
    updatedAt: Date.now(),
    source: 'local',
  };
  await writeCloudCredential(username, record);
  await ensureCredentialState();
  const nextState = {
    updatedAt: Date.now(),
    credentials: new Map(credentialState.credentials),
  };
  nextState.credentials.set(username, record);
  setCredentialState(nextState);
  return cloneCredentialRecord(record);
}

export async function setDmCredentialPin({
  username = DM_CREDENTIAL_DEFAULT_USERNAME,
  pin,
  iterations,
  keyLength,
  digest,
  allowOverwrite = false,
} = {}) {
  const candidatePin = typeof pin === 'string' ? pin.trim() : '';
  if (!candidatePin) {
    throw new Error('PIN is required');
  }
  return persistCredentialRecord({ username, pin: candidatePin, iterations, keyLength, digest, allowOverwrite });
}

export async function resetDmCredentialPin({
  username = DM_CREDENTIAL_DEFAULT_USERNAME,
  pin,
  iterations,
  keyLength,
  digest,
} = {}) {
  return setDmCredentialPin({ username, pin, iterations, keyLength, digest, allowOverwrite: true });
}

export function getDmCredentialBootstrap() {
  return cloneCredentialRecord(bootstrapCredential);
}
