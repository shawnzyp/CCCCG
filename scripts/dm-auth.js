const DM_LOGIN_FLAG_KEY = 'dmLoggedIn';
const DM_PIN_META_NAME = 'cc-dm-pin-sha256';

export function validateDmPin(pin) {
  const raw = typeof pin === 'string' || typeof pin === 'number' ? String(pin) : '';
  const digits = raw.replace(/\D+/g, '');
  if (digits.length < 4 || digits.length > 6) {
    return '';
  }
  return digits;
}

function readDmPinHash() {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector(`meta[name="${DM_PIN_META_NAME}"]`);
  const content = meta?.content || '';
  return typeof content === 'string' ? content.trim().toLowerCase() : '';
}

function getSubtleCrypto() {
  if (typeof crypto === 'undefined' || !crypto?.subtle) {
    return null;
  }
  return crypto.subtle;
}

async function sha256Hex(input) {
  const subtle = getSubtleCrypto();
  if (!subtle) {
    throw new Error('WebCrypto unavailable');
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const digest = await subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function dmIsUnlocked() {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(DM_LOGIN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export async function dmUnlockWithPin(pin) {
  const normalized = validateDmPin(pin);
  if (!normalized) return false;
  const expectedHash = readDmPinHash();
  if (!expectedHash) return false;
  const digest = await sha256Hex(normalized);
  if (!digest) return false;
  const matches = digest === expectedHash;
  if (matches && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(DM_LOGIN_FLAG_KEY, '1');
    } catch {
      /* ignore */
    }
  }
  return matches;
}

export function dmLock() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(DM_LOGIN_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

export function getDmAuthStatus() {
  return { unlocked: dmIsUnlocked() };
}
