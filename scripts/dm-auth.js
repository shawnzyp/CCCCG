const DM_USERNAME = 'SPeiris';
const DM_SALT_KEY = 'cccg:dm:salt';
const DM_HASH_KEY = 'cccg:dm:hash';
const DM_ITER_KEY = 'cccg:dm:iter';
const DEFAULT_ITERATIONS = 120000;
const MIN_PASSWORD_LENGTH = 8;

let dmUnlocked = false;

function getCrypto() {
  if (typeof crypto !== 'undefined' && crypto && crypto.subtle) return crypto;
  throw new Error('WebCrypto unavailable');
}

function toBase64(bytes) {
  if (!bytes) return '';
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  if (typeof value !== 'string' || !value) return new Uint8Array();
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getStoredCredentials() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const salt = localStorage.getItem(DM_SALT_KEY) || '';
    const hash = localStorage.getItem(DM_HASH_KEY) || '';
    const iterRaw = localStorage.getItem(DM_ITER_KEY) || '';
    const iterations = Number(iterRaw);
    if (!salt || !hash || !Number.isFinite(iterations)) return null;
    return { salt, hash, iterations };
  } catch {
    return null;
  }
}

async function deriveHash(password, saltBytes, iterations) {
  const cryptoApi = getCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await cryptoApi.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export function getDmUsername() {
  return DM_USERNAME;
}

export function dmHasPasswordSet() {
  return Boolean(getStoredCredentials());
}

export function dmIsUnlocked() {
  return dmUnlocked;
}

export function dmLock() {
  dmUnlocked = false;
}

export async function dmSetPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password must be at least 8 characters.');
  }
  const cryptoApi = getCrypto();
  const saltBytes = new Uint8Array(16);
  cryptoApi.getRandomValues(saltBytes);
  const iterations = DEFAULT_ITERATIONS;
  const hashBytes = await deriveHash(password, saltBytes, iterations);
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage unavailable');
  }
  try {
    localStorage.setItem(DM_SALT_KEY, toBase64(saltBytes));
    localStorage.setItem(DM_HASH_KEY, toBase64(hashBytes));
    localStorage.setItem(DM_ITER_KEY, String(iterations));
  } catch {
    throw new Error('Failed to store DM password');
  }
  dmUnlocked = true;
  return true;
}

export async function dmVerifyPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }
  const stored = getStoredCredentials();
  if (!stored) return false;
  const saltBytes = fromBase64(stored.salt);
  const expectedHash = fromBase64(stored.hash);
  const hashBytes = await deriveHash(password, saltBytes, stored.iterations);
  if (hashBytes.length !== expectedHash.length) return false;
  let match = 0;
  for (let i = 0; i < hashBytes.length; i += 1) {
    match |= hashBytes[i] ^ expectedHash[i];
  }
  const isValid = match === 0;
  if (isValid) dmUnlocked = true;
  return isValid;
}
