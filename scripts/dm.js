import { listCharacters, loadCharacter } from './characters.js';
import { DM_PIN, DM_DEVICE_FINGERPRINT } from './dm-pin.js';
import { show, hide } from './modal.js';
import {
  listMiniGames,
  getMiniGame,
  getDefaultConfig,
  loadMiniGameReadme,
  formatKnobValue,
  subscribeToDeployments as subscribeMiniGameDeployments,
  refreshDeployments as refreshMiniGameDeployments,
  deployMiniGame as deployMiniGameToCloud,
  updateDeployment as updateMiniGameDeployment,
  deleteDeployment as deleteMiniGameDeployment,
  MINI_GAME_STATUS_OPTIONS,
  summarizeConfig,
  getStatusLabel,
} from './mini-games.js';
import { storeDmCatalogPayload } from './dm-catalog-sync.js';
import { saveCloud } from './storage.js';
import { toast, dismissToast } from './notifications.js';
import { FACTIONS, FACTION_NAME_MAP } from './faction.js';
const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
const MAX_STORED_NOTIFICATIONS = 100;
const DM_UNREAD_NOTIFICATIONS_KEY = 'cc:dm-notifications-unread';
const CLOUD_DM_NOTIFICATIONS_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/dm-notifications';
const DM_UNREAD_NOTIFICATIONS_LIMIT = 999;
const DM_LOGIN_FLAG_KEY = 'dmLoggedIn';
const DM_LOGIN_AT_KEY = 'dmLoggedInAt';
const DM_LOGIN_LAST_ACTIVE_KEY = 'dmLoggedInLastActive';
const DM_LOGIN_FAILURE_COUNT_KEY = 'dmLoginFailureCount';
const DM_LOGIN_LAST_FAILURE_KEY = 'dmLoginLastFailureAt';
const DM_LOGIN_LOCK_UNTIL_KEY = 'dmLoginLockUntil';
const DM_LOGIN_MAX_FAILURES = 3;
const DM_LOGIN_COOLDOWN_MS = 30_000;
const DM_DEFAULT_SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const DM_DEFAULT_SESSION_WARNING_THRESHOLD_MS = 60 * 1000;
const DM_INIT_ERROR_MESSAGE = 'Unable to initialize DM tools. Please try again.';
const FACTION_LOOKUP = new Map(Array.isArray(FACTIONS) ? FACTIONS.map(faction => [faction.id, faction]) : []);
const DM_USER_AGENT = typeof navigator === 'object' && navigator ? (navigator.userAgent || '') : '';
const DM_IS_JSDOM_ENV = /jsdom/i.test(DM_USER_AGENT);
const DM_CAN_USE_WINDOW_INTERVAL = typeof window !== 'undefined'
  && typeof window.setInterval === 'function'
  && typeof window.clearInterval === 'function';
const DM_GLOBAL_SCOPE = typeof globalThis === 'object' && globalThis
  ? globalThis
  : (typeof window !== 'undefined' ? window : {});
const DM_INTERVAL_REGISTRY_KEY = '__ccccg_dm_active_intervals__';
const DM_PREVIOUS_INTERVALS = Array.isArray(DM_GLOBAL_SCOPE[DM_INTERVAL_REGISTRY_KEY])
  ? DM_GLOBAL_SCOPE[DM_INTERVAL_REGISTRY_KEY]
  : null;
if (DM_PREVIOUS_INTERVALS && typeof clearInterval === 'function') {
  DM_PREVIOUS_INTERVALS.forEach(id => {
    try { clearInterval(id); } catch {}
  });
}
const DM_ACTIVE_INTERVALS = new Set();
DM_GLOBAL_SCOPE[DM_INTERVAL_REGISTRY_KEY] = [];

function registerDmInterval(id) {
  if (id !== null && id !== undefined) {
    DM_ACTIVE_INTERVALS.add(id);
    const registry = DM_GLOBAL_SCOPE[DM_INTERVAL_REGISTRY_KEY];
    if (Array.isArray(registry)) {
      registry.push(id);
    }
  }
  return id;
}

function dmSetInterval(callback, delay, ...args) {
  if (DM_CAN_USE_WINDOW_INTERVAL) {
    return registerDmInterval(window.setInterval(callback, delay, ...args));
  }
  if (typeof setInterval === 'function') {
    return registerDmInterval(setInterval(callback, delay, ...args));
  }
  return 0;
}

function dmClearInterval(id) {
  if (DM_ACTIVE_INTERVALS.delete(id)) {
    const registry = DM_GLOBAL_SCOPE[DM_INTERVAL_REGISTRY_KEY];
    if (Array.isArray(registry)) {
      const idx = registry.indexOf(id);
      if (idx !== -1) {
        registry.splice(idx, 1);
      }
    }
  }
  if (DM_CAN_USE_WINDOW_INTERVAL) {
    window.clearInterval(id);
  } else if (typeof clearInterval === 'function') {
    clearInterval(id);
  }
}

const DM_PIN_DEFAULT_DIGEST = 'SHA-256';
const DM_PIN_DEFAULT_KEY_LENGTH = 32;

function isHashedDmPinConfig(candidate) {
  return candidate && typeof candidate === 'object' && typeof candidate.hash === 'string' && typeof candidate.salt === 'string' && Number.isFinite(candidate.iterations);
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

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

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

let nodePbkdf2Sync = null;
if (typeof process !== 'undefined' && process?.versions?.node) {
  try {
    const getRequire = Function('try { return (1,eval)("require"); } catch (e) { return null; }');
    const req = getRequire();
    if (req) {
      const nodeCrypto = req('node:crypto');
      if (nodeCrypto && typeof nodeCrypto.pbkdf2Sync === 'function') {
        nodePbkdf2Sync = nodeCrypto.pbkdf2Sync;
      }
    }
  } catch {
    nodePbkdf2Sync = null;
  }
}

function encodeUtf8(value) {
  const stringValue = typeof value === 'string' ? value : String(value ?? '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(stringValue);
  }
  const result = new Uint8Array(stringValue.length);
  for (let i = 0; i < stringValue.length; i += 1) {
    result[i] = stringValue.charCodeAt(i) & 0xff;
  }
  return result;
}

function base64ToUint8Array(value) {
  if (typeof value !== 'string' || !value) return new Uint8Array();
  if (typeof atob === 'function') {
    const binary = atob(value);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
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

const pinHashCache = new Map();

function deriveDmPinHash(pin, config) {
  try {
    const { salt, iterations } = config;
    const keyLength = Number.isFinite(config.keyLength) && config.keyLength > 0 ? config.keyLength : DM_PIN_DEFAULT_KEY_LENGTH;
    const digest = typeof config.digest === 'string' && config.digest ? config.digest : DM_PIN_DEFAULT_DIGEST;
    if (digest && digest.toUpperCase() !== 'SHA-256') {
      throw new Error(`Unsupported DM PIN digest: ${digest}`);
    }
    const cacheKey = `${digest}|${config.hash}|${pin}`;
    if (pinHashCache.has(cacheKey)) {
      return pinHashCache.get(cacheKey);
    }
    const saltBytes = base64ToUint8Array(salt);
    if (nodePbkdf2Sync && typeof Buffer !== 'undefined') {
      const derivedBuffer = nodePbkdf2Sync(pin, Buffer.from(saltBytes), iterations, keyLength, 'sha256');
      const encoded = Buffer.from(derivedBuffer).toString('base64');
      pinHashCache.set(cacheKey, encoded);
      return encoded;
    }
    const passwordBytes = encodeUtf8(pin);
    const derived = pbkdf2Sha256(passwordBytes, saltBytes, iterations, keyLength);
    const encoded = uint8ArrayToBase64(derived);
    pinHashCache.set(cacheKey, encoded);
    return encoded;
  } catch (error) {
    console.error('Failed to derive DM PIN hash', error);
    return null;
  }
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

function verifyDmPin(candidate) {
  const pinInput = typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '');
  if (!pinInput) return false;
  if (isHashedDmPinConfig(DM_PIN)) {
    const expectedHash = DM_PIN.hash;
    const derived = deriveDmPinHash(pinInput, DM_PIN);
    if (!derived) {
      return false;
    }
    return constantTimeEquals(derived, expectedHash);
  }
  return pinInput === DM_PIN;
}

function parseSessionTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSessionTimestamp(key) {
  try {
    return parseSessionTimestamp(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function setSessionTimestamp(key, value) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function clearSessionTimestamp(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function getSessionTimeoutMs() {
  if (typeof window !== 'undefined') {
    const candidate = window?.dmLoginTimeoutMs;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    if (candidate === 0 || candidate === '0') {
      return 0;
    }
  }
  return DM_DEFAULT_SESSION_TIMEOUT_MS;
}

function getSessionWarningThresholdMs() {
  if (typeof window !== 'undefined') {
    const msCandidate = window?.dmSessionWarningThresholdMs;
    const parsedMs = Number(msCandidate);
    if (Number.isFinite(parsedMs)) {
      return Math.max(0, parsedMs);
    }
    const secondsCandidate = window?.dmSessionWarningThresholdSeconds;
    const parsedSeconds = Number(secondsCandidate);
    if (Number.isFinite(parsedSeconds)) {
      return Math.max(0, parsedSeconds * 1000);
    }
  }
  return DM_DEFAULT_SESSION_WARNING_THRESHOLD_MS;
}

function touchSessionActivity(timestamp = Date.now()) {
  try {
    if (sessionStorage.getItem(DM_LOGIN_FLAG_KEY) !== '1') return;
    sessionStorage.setItem(DM_LOGIN_LAST_ACTIVE_KEY, String(timestamp));
  } catch {
    /* ignore */
  }
}

function loadStoredUnreadCount() {
  if (typeof sessionStorage === 'undefined') return 0;
  try {
    const raw = sessionStorage.getItem(DM_UNREAD_NOTIFICATIONS_KEY);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(DM_UNREAD_NOTIFICATIONS_LIMIT, parsed);
  } catch {
    return 0;
  }
}

let unreadNotificationCount = loadStoredUnreadCount();
let dmToggleButtonRef = null;
let dmNotificationsButtonRef = null;
let dmToggleBadgeRef = null;
let dmNotificationsBadgeRef = null;
let dmToggleBaseLabel = '';
let dmNotificationsBaseLabel = '';
let dmNotificationsHadExplicitAriaLabel = false;
let notifyModalRef = null;
let notifyExportFormatRef = null;

function persistUnreadCount() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(DM_UNREAD_NOTIFICATIONS_KEY, String(unreadNotificationCount));
  } catch {
    /* ignore persistence errors */
  }
}

function formatUnreadBadgeLabel(count) {
  if (count <= 0) return '0';
  return count > 99 ? '99+' : String(count);
}

function describeUnreadCount(count) {
  if (count <= 0) return '';
  return count === 1 ? '1 unread notification' : `${count} unread notifications`;
}

function updateUnreadIndicators() {
  const attrValue = String(unreadNotificationCount);
  const badgeLabel = formatUnreadBadgeLabel(unreadNotificationCount);
  const ariaDescription = describeUnreadCount(unreadNotificationCount);
  if (dmToggleButtonRef) {
    dmToggleButtonRef.setAttribute('data-unread', attrValue);
    const base = dmToggleBaseLabel || dmToggleButtonRef.getAttribute('aria-label') || 'DM tools menu';
    if (ariaDescription) {
      dmToggleButtonRef.setAttribute('aria-label', `${base} (${ariaDescription})`);
    } else {
      dmToggleButtonRef.setAttribute('aria-label', base);
    }
    if (dmToggleBadgeRef) {
      if (unreadNotificationCount > 0) {
        dmToggleBadgeRef.textContent = badgeLabel;
        dmToggleBadgeRef.hidden = false;
      } else {
        dmToggleBadgeRef.textContent = '0';
        dmToggleBadgeRef.hidden = true;
      }
    }
  }
  if (dmNotificationsButtonRef) {
    dmNotificationsButtonRef.setAttribute('data-unread', attrValue);
    const base = dmNotificationsBaseLabel || dmNotificationsButtonRef.getAttribute('aria-label') || dmNotificationsButtonRef.textContent?.trim() || 'Notifications';
    if (ariaDescription) {
      dmNotificationsButtonRef.setAttribute('aria-label', `${base} (${ariaDescription})`);
    } else if (dmNotificationsHadExplicitAriaLabel) {
      dmNotificationsButtonRef.setAttribute('aria-label', base);
    } else {
      dmNotificationsButtonRef.removeAttribute('aria-label');
    }
    if (dmNotificationsBadgeRef) {
      if (unreadNotificationCount > 0) {
        dmNotificationsBadgeRef.textContent = badgeLabel;
        dmNotificationsBadgeRef.hidden = false;
      } else {
        dmNotificationsBadgeRef.textContent = '0';
        dmNotificationsBadgeRef.hidden = true;
      }
    }
  }
}

function setUnreadCount(value) {
  let next = Number.isFinite(value) ? value : parseInt(value, 10);
  if (!Number.isFinite(next) || next <= 0) {
    next = 0;
  }
  next = Math.min(DM_UNREAD_NOTIFICATIONS_LIMIT, Math.max(0, Math.floor(next)));
  unreadNotificationCount = next;
  persistUnreadCount();
  updateUnreadIndicators();
}

function incrementUnreadCount() {
  setUnreadCount(unreadNotificationCount + 1);
}

function resetUnreadCountValue() {
  setUnreadCount(0);
}

function isNotificationsModalHidden() {
  if (!notifyModalRef) return true;
  return notifyModalRef.classList.contains('hidden');
}

async function writeTextToClipboard(text) {
  if (typeof text !== 'string') text = String(text ?? '');
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall back */
    }
  }
  if (typeof document === 'undefined') return false;
  const root = document.body || document.documentElement;
  if (!root) return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.top = '0';
  textarea.style.left = '0';
  root.appendChild(textarea);
  let success = false;
  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    success = document.execCommand('copy');
  } catch {
    success = false;
  }
  root.removeChild(textarea);
  return success;
}

function buildExportFilename(base, extension = 'txt') {
  const prefix = typeof base === 'string' && base ? base : 'export';
  const normalizedExtension = typeof extension === 'string' && extension
    ? extension.replace(/^\.+/, '')
    : 'txt';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${normalizedExtension}`;
}

function downloadTextFile(filename, text, options = {}) {
  if (typeof document === 'undefined') return false;
  const root = document.body || document.documentElement;
  if (!root) return false;
  try {
    const type = typeof options.type === 'string' && options.type ? options.type : 'text/plain';
    const blob = new Blob([text], { type });
    const url = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
      ? URL.createObjectURL(blob)
      : null;
    if (!url) return false;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'export.txt';
    link.style.display = 'none';
    root.appendChild(link);
    link.click();
    root.removeChild(link);
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    return true;
  } catch {
    return false;
  }
}

function computeDeviceFingerprint() {
  if (typeof navigator === 'undefined') return '';
  const { userAgent = '', language = '', platform = '' } = navigator;
  let screenInfo = '';
  if (typeof screen !== 'undefined') {
    const { width = '', height = '', colorDepth = '' } = screen;
    screenInfo = `${width}x${height}x${colorDepth}`;
  }
  let timeZone = '';
  try {
    timeZone = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || '';
  } catch {
    timeZone = '';
  }
  const raw = [userAgent, language, platform, screenInfo, timeZone].join('||');
  try {
    return btoa(raw);
  } catch {
    return raw;
  }
}

function isAuthorizedDevice() {
  if (!DM_DEVICE_FINGERPRINT) return true;
  return computeDeviceFingerprint() === DM_DEVICE_FINGERPRINT;
}

if (typeof window !== 'undefined' && !window.computeDmDeviceFingerprint) {
  window.computeDmDeviceFingerprint = computeDeviceFingerprint;
}

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function normalizeTimestamp(value) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toLocaleString();
  return new Date().toLocaleString();
}

function normalizeStoredNotification(entry, { id, fallbackCreatedAt } = {}) {
  if (!entry || typeof entry.detail !== 'string') return null;
  const ts = normalizeTimestamp(entry.ts);
  const char = typeof entry.char === 'string' ? entry.char : '';
  const html = typeof entry.html === 'string' ? entry.html : null;
  const severityValue = typeof entry.severity === 'string' ? entry.severity.trim().toLowerCase() : '';
  const resolved = entry.resolved === true
    || entry.resolved === 'true'
    || entry.resolved === 1;

  let createdAt = null;
  if (typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)) {
    createdAt = entry.createdAt;
  } else if (typeof fallbackCreatedAt === 'number' && Number.isFinite(fallbackCreatedAt)) {
    createdAt = fallbackCreatedAt;
  } else if (typeof entry.ts === 'number' && Number.isFinite(entry.ts)) {
    createdAt = entry.ts;
  } else {
    const parsed = typeof entry.ts === 'string' ? Date.parse(entry.ts) : Number(entry.createdAt);
    if (Number.isFinite(parsed)) {
      createdAt = parsed;
    }
  }
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    createdAt = Date.now();
  }

  let actionScope = normalizeNotificationActionScope(
    entry.actionScope ?? entry.scope ?? entry.kind ?? entry.actionType,
    entry.detail,
  );
  if (!actionScope) actionScope = 'major';

  const record = { ts, char, detail: entry.detail, resolved: Boolean(resolved), createdAt, actionScope };
  if (severityValue) record.severity = severityValue;
  if (html) record.html = html;
  if (typeof id === 'string' && id) record.id = id;
  return record;
}

function loadStoredNotifications() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(DM_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(entry => normalizeStoredNotification(entry))
      .filter(Boolean);
    if (normalized.length > MAX_STORED_NOTIFICATIONS) {
      return normalized.slice(normalized.length - MAX_STORED_NOTIFICATIONS);
    }
    return normalized;
  } catch {
    return [];
  }
}

const DM_NOTIFICATIONS_FORCE_CLOUD = typeof window !== 'undefined' && window.dmNotificationsForceCloud === true;
const DM_NOTIFICATIONS_DISABLE_CLOUD = typeof window !== 'undefined' && window.dmNotificationsDisableCloud === true;

function shouldUseCloudNotifications() {
  if (DM_NOTIFICATIONS_FORCE_CLOUD) {
    return typeof fetch === 'function';
  }
  if (DM_NOTIFICATIONS_DISABLE_CLOUD) {
    return false;
  }
  if (typeof fetch !== 'function' || typeof window === 'undefined') {
    return false;
  }
  const protocol = window.location?.protocol || '';
  return protocol === 'http:' || protocol === 'https:';
}

function loadStoredNotificationFilters() {
  const defaults = { ...NOTIFICATION_FILTER_DEFAULTS };
  if (typeof localStorage === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(DM_NOTIFICATION_FILTER_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const next = { ...defaults };
    if (typeof parsed.character === 'string') next.character = parsed.character;
    if (typeof parsed.severity === 'string') next.severity = parsed.severity;
    if (typeof parsed.search === 'string') next.search = parsed.search;
    if (typeof parsed.resolved === 'string') next.resolved = parsed.resolved;
    return next;
  } catch {
    return defaults;
  }
}

const notifications = loadStoredNotifications();

function countUnresolvedNotifications() {
  return notifications.reduce((count, entry) => {
    return count + (entry?.resolved ? 0 : 1);
  }, 0);
}

function clampUnreadCountToUnresolved() {
  const unresolvedCount = countUnresolvedNotifications();
  if (unreadNotificationCount > unresolvedCount) {
    setUnreadCount(unresolvedCount);
  }
  return unresolvedCount;
}

const DM_NOTIFICATION_FILTER_STORAGE_KEY = 'cc_dm_notification_filters';
const NOTIFICATION_FILTER_DEFAULTS = Object.freeze({ character: 'all', severity: 'all', search: '', resolved: 'all' });
const KNOWN_NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'error'];
const DM_NOTIFICATION_ACTION_SCOPES = new Set(['major', 'minor']);

function normalizeNotificationActionScope(value, detail = '') {
  let scope = '';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (DM_NOTIFICATION_ACTION_SCOPES.has(normalized)) {
      scope = normalized;
    }
  }
  if (!scope && typeof detail === 'string' && detail) {
    const lowered = detail.trim().toLowerCase();
    if (lowered.includes('major action')) {
      scope = 'major';
    } else if (lowered.includes('minor action')) {
      scope = 'minor';
    }
  }
  return scope;
}
let notificationFilterState = loadStoredNotificationFilters();

clampUnreadCountToUnresolved();

const AUDIO_DISABLED_VALUES = new Set(['off', 'mute', 'muted', 'disabled', 'false', 'quiet', 'silent', 'none', '0']);
const AUDIO_ENABLED_VALUES = new Set(['on', 'enabled', 'true', 'sound', 'audible', '1', 'default']);
const AUDIO_PREFERENCE_STORAGE_KEYS = [
  'cc:audio-preference',
  'cc:audioPreference',
  'cc:audio',
  'ccccg:audio',
];
const DM_NOTIFICATION_TONE_DEBOUNCE_MS = 220;
let lastNotificationToneAt = Number.NEGATIVE_INFINITY;
let pendingNotificationTone = null;

function interpretAudioPreference(value) {
  if (value == null) return null;
  if (typeof value === 'function') {
    try {
      const scoped = value('notifications');
      const interpretedScoped = interpretAudioPreference(scoped);
      if (interpretedScoped !== null) return interpretedScoped;
    } catch {
      /* ignore */
    }
    try {
      return interpretAudioPreference(value());
    } catch {
      return null;
    }
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    if (AUDIO_DISABLED_VALUES.has(normalized)) return false;
    if (AUDIO_ENABLED_VALUES.has(normalized)) return true;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return interpretAudioPreference(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    if ('notifications' in value) return interpretAudioPreference(value.notifications);
    if ('enabled' in value) return interpretAudioPreference(value.enabled);
    if ('sound' in value) return interpretAudioPreference(value.sound);
    if ('audio' in value) return interpretAudioPreference(value.audio);
    if ('value' in value) return interpretAudioPreference(value.value);
  }
  return null;
}

function getStoredAudioPreference() {
  if (typeof localStorage === 'undefined') return null;
  for (const key of AUDIO_PREFERENCE_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (typeof raw !== 'string') continue;
      const interpreted = interpretAudioPreference(raw);
      if (interpreted !== null) return interpreted;
    } catch {
      /* ignore storage errors */
    }
  }
  return null;
}

function shouldPlayNotificationTone() {
  if (typeof window === 'undefined') return false;
  const stored = getStoredAudioPreference();
  if (stored === false) return false;
  let hasExplicitPreference = stored !== null;
  let allow = stored === true;
  const sources = [
    window.ccAudioPreference,
    window.audioPreference,
    window?.ccPreferences?.audio,
  ];
  for (const source of sources) {
    const result = interpretAudioPreference(source);
    if (result === null) continue;
    hasExplicitPreference = true;
    if (result === false) return false;
    if (result === true) allow = true;
  }
  return hasExplicitPreference ? allow : true;
}

function getNotificationAudioHelper() {
  if (typeof window === 'undefined') return null;
  const candidates = [
    window.ccPlayNotificationSound,
    window.playNotificationSound,
    window.dmPlayNotificationSound,
    window.playTone,
  ];
  return candidates.find(fn => typeof fn === 'function') || null;
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function playNotificationTone() {
  if (!shouldPlayNotificationTone()) return;
  const helper = getNotificationAudioHelper();
  if (!helper) return;
  const invoke = () => {
    pendingNotificationTone = null;
    lastNotificationToneAt = now();
    try {
      helper('info');
    } catch {
      try {
        helper();
      } catch {
        /* ignore helper errors */
      }
    }
  };
  const elapsed = now() - lastNotificationToneAt;
  if (elapsed >= DM_NOTIFICATION_TONE_DEBOUNCE_MS) {
    invoke();
    return;
  }
  if (pendingNotificationTone) {
    clearTimeout(pendingNotificationTone);
  }
  pendingNotificationTone = setTimeout(invoke, DM_NOTIFICATION_TONE_DEBOUNCE_MS - elapsed);
}

function persistNotifications() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const trimmed = notifications.slice(-MAX_STORED_NOTIFICATIONS);
    sessionStorage.setItem(DM_NOTIFICATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore persistence errors */
  }
}

function persistNotificationFilterState() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DM_NOTIFICATION_FILTER_STORAGE_KEY, JSON.stringify(notificationFilterState));
  } catch {
    /* ignore persistence errors */
  }
}

function deriveNotificationChar() {
  try {
    return sessionStorage.getItem(DM_LOGIN_FLAG_KEY) === '1'
      ? 'DM'
      : localStorage.getItem('last-save') || '';
  } catch {
    return '';
  }
}

function buildNotification(detail, meta = {}) {
  const text = typeof detail === 'string' ? detail : String(detail ?? '');
  if (!text) return null;
  const ts = normalizeTimestamp(meta.ts);
  const char = typeof meta.char === 'string' && meta.char ? meta.char : deriveNotificationChar();
  const entry = { ts, char, detail: text };
  let createdAt = null;
  if (typeof meta.createdAt === 'number' && Number.isFinite(meta.createdAt)) {
    createdAt = meta.createdAt;
  } else if (typeof meta.ts === 'number' && Number.isFinite(meta.ts)) {
    createdAt = meta.ts;
  }
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    createdAt = Date.now();
  }
  entry.createdAt = createdAt;
  let resolved = false;
  if (typeof meta.resolved === 'string') {
    resolved = meta.resolved.trim().toLowerCase() === 'true';
  } else if (typeof meta.resolved === 'number') {
    resolved = Number.isFinite(meta.resolved) ? meta.resolved !== 0 : Boolean(meta.resolved);
  } else if (typeof meta.resolved === 'boolean') {
    resolved = meta.resolved;
  } else if (meta.resolved != null) {
    resolved = Boolean(meta.resolved);
  }
  entry.resolved = resolved;
  const severity = typeof meta.severity === 'string' ? meta.severity.trim().toLowerCase() : '';
  if (severity) entry.severity = severity;
  if (typeof meta.html === 'string' && meta.html) {
    entry.html = meta.html;
  }
  const actionScope = normalizeNotificationActionScope(
    meta.actionScope ?? meta.scope ?? meta.kind ?? meta.actionType,
    text,
  );
  if (!actionScope) return null;
  entry.actionScope = actionScope;
  return entry;
}

function formatNotification(entry, { html = false } = {}) {
  const prefix = entry.char ? `${entry.char}: ` : '';
  const resolutionLabel = entry.resolved ? '[resolved] ' : '';
  if (html && entry.html) {
    const safeTs = escapeHtml(entry.ts);
    const safePrefix = escapeHtml(prefix);
    const safeResolution = escapeHtml(resolutionLabel);
    return `[${safeTs}] ${safeResolution}${safePrefix}${entry.html}`;
  }
  return `[${entry.ts}] ${resolutionLabel}${prefix}${entry.detail}`;
}

const DEFAULT_NOTIFICATION_EXPORT_FORMAT = 'text';
const NOTIFICATION_EXPORT_FORMATS = new Set(['text', 'csv', 'json']);
const NOTIFICATION_EXPORT_META = {
  text: { extension: 'txt', mimeType: 'text/plain', toastSuffix: '' },
  csv: { extension: 'csv', mimeType: 'text/csv', toastSuffix: ' (CSV)' },
  json: { extension: 'json', mimeType: 'application/json', toastSuffix: ' (JSON)' },
};

function normalizeNotificationExportFormat(value) {
  if (typeof value !== 'string') return DEFAULT_NOTIFICATION_EXPORT_FORMAT;
  const normalized = value.trim().toLowerCase();
  return NOTIFICATION_EXPORT_FORMATS.has(normalized) ? normalized : DEFAULT_NOTIFICATION_EXPORT_FORMAT;
}

function getSelectedNotificationExportFormat() {
  if (!notifyExportFormatRef) return DEFAULT_NOTIFICATION_EXPORT_FORMAT;
  return normalizeNotificationExportFormat(notifyExportFormatRef.value);
}

function mapNotificationForStructuredExport(entry) {
  if (!entry) {
    return { ts: '', char: '', severity: '', detail: '' };
  }
  const ts = typeof entry.ts === 'string' ? entry.ts : String(entry.ts ?? '');
  const char = typeof entry.char === 'string' ? entry.char : String(entry.char ?? '');
  const severity = typeof entry.severity === 'string' ? entry.severity : String(entry.severity ?? '');
  const detailValue = typeof entry.detail === 'string' ? entry.detail : String(entry.detail ?? '');
  const prefix = entry.resolved ? '[resolved] ' : '';
  const detail = prefix ? `${prefix}${detailValue}` : detailValue;
  return { ts, char, severity, detail };
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

let dmTestHooks = null;

function initDMLogin(){
  const dmBtn = document.getElementById('dm-login');
  const dmToggleBtn = document.getElementById('dm-tools-toggle');
  const menu = document.getElementById('dm-tools-menu');
  const dmPortal = document.querySelector('.dm-tools-portal');
  const sessionStatus = document.getElementById('dm-session-status');
  const sessionExtendBtn = document.getElementById('dm-session-extend');

  if (dmPortal && document.body && dmPortal.parentElement !== document.body) {
    try {
      document.body.appendChild(dmPortal);
    } catch (err) {
      console.warn('Unable to reparent DM tools portal', err);
    }
  }
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const notifyBtn = document.getElementById('dm-tools-notifications');
  const charBtn = document.getElementById('dm-tools-characters');
  const miniGamesBtn = document.getElementById('dm-tools-mini-games');
  const logoutBtn = document.getElementById('dm-tools-logout');
  const loginModal = document.getElementById('dm-login-modal');
  const loginPin = document.getElementById('dm-login-pin');
  const loginSubmit = document.getElementById('dm-login-submit');
  const loginClose = document.getElementById('dm-login-close');
  const loginSubmitDefaultLabel = loginSubmit?.textContent ?? '';
  const loginSubmitBaseLabel = loginSubmitDefaultLabel || 'Enter';
  let loginCooldownTimerId = null;
  let loginWaitMessageRef = null;
  const setIntervalFn = (fn, ms, ...args) => dmSetInterval(fn, ms, ...args);
  const clearIntervalFn = id => dmClearInterval(id);
  let sessionStatusIntervalId = null;
  let sessionWarningToastShown = false;

  function parseStoredNumber(value){
    if (typeof value !== 'string' || !value) return 0;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function stopSessionStatusUpdates() {
    if (sessionStatusIntervalId !== null) {
      clearIntervalFn(sessionStatusIntervalId);
      sessionStatusIntervalId = null;
    }
  }

  function hideSessionStatus() {
    stopSessionStatusUpdates();
    if (sessionStatus) {
      sessionStatus.textContent = '';
      sessionStatus.hidden = true;
    }
    if (sessionExtendBtn) {
      sessionExtendBtn.hidden = true;
      sessionExtendBtn.disabled = true;
    }
    sessionWarningToastShown = false;
  }

  function formatSessionRemaining(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `Session expires in ${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    if (minutes > 0) {
      return `Session expires in ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `Session expires in ${seconds}s`;
  }

  function updateSessionStatusDisplay({ loggedIn, now } = {}) {
    if (!sessionStatus) return;
    const resolvedLoggedIn = typeof loggedIn === 'boolean' ? loggedIn : isLoggedIn();
    if (!resolvedLoggedIn) {
      hideSessionStatus();
      return;
    }
    const timeoutMs = getSessionTimeoutMs();
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      hideSessionStatus();
      return;
    }
    const reference = getSessionTimestamp(DM_LOGIN_LAST_ACTIVE_KEY) ?? getSessionTimestamp(DM_LOGIN_AT_KEY);
    if (!Number.isFinite(reference)) {
      hideSessionStatus();
      return;
    }
    const currentTime = Number.isFinite(now) ? now : Date.now();
    const elapsed = Math.max(0, currentTime - reference);
    const remaining = timeoutMs - elapsed;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      hideSessionStatus();
      return;
    }
    const warningThreshold = getSessionWarningThresholdMs();
    if (
      !sessionWarningToastShown &&
      Number.isFinite(warningThreshold) &&
      warningThreshold > 0 &&
      remaining <= warningThreshold
    ) {
      toast('DM session will expire soon. Extend to stay logged in.', 'warning');
      sessionWarningToastShown = true;
    }
    sessionStatus.hidden = false;
    sessionStatus.textContent = formatSessionRemaining(remaining);
    if (sessionExtendBtn) {
      sessionExtendBtn.hidden = false;
      sessionExtendBtn.disabled = false;
    }
  }

  function ensureSessionStatusUpdates(loggedIn) {
    if (!sessionStatus) return;
    const resolvedLoggedIn = typeof loggedIn === 'boolean' ? loggedIn : isLoggedIn();
    const timeoutMs = getSessionTimeoutMs();
    if (!resolvedLoggedIn || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      hideSessionStatus();
      return;
    }
    updateSessionStatusDisplay({ loggedIn: resolvedLoggedIn });
    if (sessionStatusIntervalId === null) {
      sessionStatusIntervalId = setIntervalFn(() => {
        updateSessionStatusDisplay();
      }, 1000);
    }
  }

  function normalizeLoginFailureState(state = {}) {
    return {
      count: Number.isFinite(state.count) && state.count > 0 ? Math.floor(state.count) : 0,
      lastFailureAt: Number.isFinite(state.lastFailureAt) && state.lastFailureAt > 0 ? Math.floor(state.lastFailureAt) : 0,
      lockUntil: Number.isFinite(state.lockUntil) && state.lockUntil > 0 ? Math.floor(state.lockUntil) : 0,
    };
  }

  let loginFailureStateCache = { count: 0, lastFailureAt: 0, lockUntil: 0 };

  function readLoginFailureState(){
    if (typeof sessionStorage !== 'undefined') {
      try {
        const state = {
          count: parseStoredNumber(sessionStorage.getItem(DM_LOGIN_FAILURE_COUNT_KEY)),
          lastFailureAt: parseStoredNumber(sessionStorage.getItem(DM_LOGIN_LAST_FAILURE_KEY)),
          lockUntil: parseStoredNumber(sessionStorage.getItem(DM_LOGIN_LOCK_UNTIL_KEY)),
        };
        loginFailureStateCache = normalizeLoginFailureState(state);
      } catch {
        // ignore storage read failures and fall back to cache
      }
    }
    return { ...loginFailureStateCache };
  }

  function writeLoginFailureState(nextState = {}){
    const normalized = normalizeLoginFailureState(nextState);
    loginFailureStateCache = normalized;
    if (typeof sessionStorage === 'undefined') return;
    try {
      if (normalized.count > 0) {
        sessionStorage.setItem(DM_LOGIN_FAILURE_COUNT_KEY, String(normalized.count));
      } else {
        sessionStorage.removeItem(DM_LOGIN_FAILURE_COUNT_KEY);
      }
      if (normalized.lastFailureAt > 0) {
        sessionStorage.setItem(DM_LOGIN_LAST_FAILURE_KEY, String(normalized.lastFailureAt));
      } else {
        sessionStorage.removeItem(DM_LOGIN_LAST_FAILURE_KEY);
      }
      if (normalized.lockUntil > 0) {
        sessionStorage.setItem(DM_LOGIN_LOCK_UNTIL_KEY, String(normalized.lockUntil));
      } else {
        sessionStorage.removeItem(DM_LOGIN_LOCK_UNTIL_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  function resetLoginFailureState(){
    writeLoginFailureState({ count: 0, lastFailureAt: 0, lockUntil: 0 });
  }

  function recordLoginFailure(){
    const now = Date.now();
    const state = readLoginFailureState();
    const nextCount = Math.max(0, state.count) + 1;
    const lockUntil = nextCount >= DM_LOGIN_MAX_FAILURES ? now + DM_LOGIN_COOLDOWN_MS : 0;
    const nextState = {
      count: nextCount,
      lastFailureAt: now,
      lockUntil,
    };
    writeLoginFailureState(nextState);
    return nextState;
  }

  function getLoginCooldownRemainingMs(now = Date.now()){
    const state = readLoginFailureState();
    if (state.lockUntil && state.lockUntil > now) {
      return state.lockUntil - now;
    }
    if (state.lockUntil && state.lockUntil <= now) {
      resetLoginFailureState();
    }
    return 0;
  }

  function formatLoginCooldownMessage(remainingMs){
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return `Too many failed attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  function ensureLoginWaitMessage(){
    if (!loginModal) return null;
    if (loginWaitMessageRef?.isConnected) return loginWaitMessageRef;
    const existing = loginModal.querySelector('[data-login-wait]');
    if (existing) {
      loginWaitMessageRef = existing;
      return loginWaitMessageRef;
    }
    const node = document.createElement('p');
    node.setAttribute('data-login-wait', '');
    node.className = 'dm-login__wait';
    node.hidden = true;
    const actions = loginModal.querySelector('.actions');
    if (actions && actions.parentNode) {
      actions.parentNode.insertBefore(node, actions.nextSibling);
    } else {
      loginModal.appendChild(node);
    }
    loginWaitMessageRef = node;
    return loginWaitMessageRef;
  }

  function setLoginWaitMessage(text){
    const target = ensureLoginWaitMessage();
    if (!target) return;
    target.textContent = text || '';
    target.hidden = !text;
  }

  function clearLoginCooldownTimer(){
    if (loginCooldownTimerId !== null) {
      clearIntervalFn(loginCooldownTimerId);
      loginCooldownTimerId = null;
    }
  }

  function updateLoginCooldownUI(remainingMs){
    if (!loginModal) return;
    const message = formatLoginCooldownMessage(remainingMs);
    setLoginWaitMessage(message);
    if (loginPin) {
      loginPin.disabled = true;
      loginPin.setAttribute('aria-disabled', 'true');
    }
    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.setAttribute('aria-disabled', 'true');
      const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
      loginSubmit.textContent = `${loginSubmitBaseLabel} (${seconds}s)`;
    }
  }

  function lockLoginControls(){
    if (loginPin) {
      loginPin.disabled = true;
      loginPin.setAttribute('aria-disabled', 'true');
    }
    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.setAttribute('aria-disabled', 'true');
    }
  }

  function clearLoginCooldownUI(){
    if (loginPin) {
      loginPin.disabled = false;
      loginPin.removeAttribute('aria-disabled');
    }
    if (loginSubmit) {
      loginSubmit.disabled = false;
      loginSubmit.removeAttribute('aria-disabled');
      loginSubmit.textContent = loginSubmitBaseLabel;
    }
    setLoginWaitMessage('');
  }

  function startLoginCooldownCountdown(initialRemaining){
    if (!initialRemaining || initialRemaining <= 0) {
      clearLoginCooldownTimer();
      clearLoginCooldownUI();
      return;
    }
    updateLoginCooldownUI(initialRemaining);
    clearLoginCooldownTimer();
    loginCooldownTimerId = setIntervalFn(() => {
      const remaining = getLoginCooldownRemainingMs();
      if (remaining <= 0) {
        clearLoginCooldownTimer();
        clearLoginCooldownUI();
        try {
          if (loginPin && typeof loginPin.focus === 'function') {
            loginPin.focus({ preventScroll: true });
          }
        } catch {
          if (loginPin && typeof loginPin.focus === 'function') {
            loginPin.focus();
          }
        }
        return;
      }
      updateLoginCooldownUI(remaining);
    }, 1000);
  }

  function notifyLoginCooldown(remainingMs){
    toast(formatLoginCooldownMessage(remainingMs), 'error');
  }

  const notifyModal = document.getElementById('dm-notifications-modal');
  const notifyList = document.getElementById('dm-notifications-list');
  const notifyClose = document.getElementById('dm-notifications-close');
  const notifyExportBtn = document.getElementById('dm-notifications-export');
  notifyExportFormatRef = document.getElementById('dm-notifications-export-format');
  const notifyMarkReadBtn = document.getElementById('dm-notifications-mark-read');
  const notifyClearBtn = document.getElementById('dm-notifications-clear');
  const notifyFiltersForm = document.getElementById('dm-notifications-filters');
  const notifyFilterCharacter = document.getElementById('dm-notifications-filter-character');
  const notifyFilterSeverity = document.getElementById('dm-notifications-filter-severity');
  const notifyFilterResolved = document.getElementById('dm-notifications-filter-resolved');
  const notifyFilterSearch = document.getElementById('dm-notifications-filter-search');
  const cloudNotificationsState = {
    enabled: shouldUseCloudNotifications(),
    available: false,
    cache: new Map(),
    subscription: null,
    pruning: false,
    initializing: false,
  };
  const charModal = document.getElementById('dm-characters-modal');
  const charList = document.getElementById('dm-characters-list');
  const charClose = document.getElementById('dm-characters-close');
  const charSearch = document.getElementById('dm-characters-search');
  const charSortButtons = charModal ? Array.from(charModal.querySelectorAll('[data-char-sort]')) : [];
  const charViewModal = document.getElementById('dm-character-modal');
  const charViewClose = document.getElementById('dm-character-close');
  const charView = document.getElementById('dm-character-sheet');
  const miniGamesModal = document.getElementById('dm-mini-games-modal');
  const miniGamesClose = document.getElementById('dm-mini-games-close');
  const miniGamesList = document.getElementById('dm-mini-games-list');
  const miniGamesTitle = document.getElementById('dm-mini-games-title');
  const miniGamesTagline = document.getElementById('dm-mini-games-tagline');
  const miniGamesLaunch = document.getElementById('dm-mini-games-launch');
  const miniGamesIntro = document.getElementById('dm-mini-games-steps');
  const miniGamesKnobsHint = document.getElementById('dm-mini-games-knobs-hint');
  const miniGamesKnobs = document.getElementById('dm-mini-games-knobs');
  const miniGamesPlayerHint = document.getElementById('dm-mini-games-player-hint');
  const miniGamesPlayerSelect = document.getElementById('dm-mini-games-player-select')
    || document.getElementById('dm-mini-games-player');
  const miniGamesPlayerCustom = document.getElementById('dm-mini-games-player-custom');
  const miniGamesAddRecipientBtn = document.getElementById('dm-mini-games-add-recipient');
  const miniGamesAddCustomBtn = document.getElementById('dm-mini-games-add-custom');
  const miniGamesClearRecipientsBtn = document.getElementById('dm-mini-games-clear-recipients');
  const miniGamesRecipientList = document.getElementById('dm-mini-games-recipients');
  const miniGamesScheduledFor = document.getElementById('dm-mini-games-scheduled-for');
  const miniGamesExpiry = document.getElementById('dm-mini-games-expiry');
  const miniGamesNotes = document.getElementById('dm-mini-games-notes');
  const miniGamesRefreshPlayers = document.getElementById('dm-mini-games-refresh-players');
  const miniGamesDeployBtn = document.getElementById('dm-mini-games-deploy');
  const miniGamesDeployProgress = document.getElementById('dm-mini-games-deploy-progress');
  const miniGamesReadme = document.getElementById('dm-mini-games-readme');
  const miniGamesRefreshBtn = document.getElementById('dm-mini-games-refresh');
  const miniGamesDeployments = document.getElementById('dm-mini-games-deployments');
  const miniGamesFiltersForm = document.getElementById('dm-mini-games-filters');
  const miniGamesFilterStatus = document.getElementById('dm-mini-games-filter-status');
  const miniGamesFilterAssignee = document.getElementById('dm-mini-games-filter-assignee');
  const miniGamesFilterSearch = document.getElementById('dm-mini-games-filter-search');
  const rewardsBtn = document.getElementById('dm-tools-rewards');
  const rewardsModal = document.getElementById('dm-rewards-modal');
  const rewardsClose = document.getElementById('dm-rewards-close');
  const rewardsTabs = document.getElementById('dm-rewards-tabs');
  const rewardsPanels = document.getElementById('dm-rewards-panels');
  const catalogTabs = document.getElementById('dm-catalog-tabs');
  const catalogPanels = document.getElementById('dm-catalog-panels');
  const creditCard = document.getElementById('dm-credit-card');
  const creditAccountSelect = document.getElementById('dm-credit-account');
  const creditTxnType = document.getElementById('dm-credit-type');
  const creditAmountInput = document.getElementById('dm-credit-amount');
  const creditSenderSelect = document.getElementById('dm-credit-sender');
  const creditSubmit = document.getElementById('dm-credit-submit');
  const creditRef = document.getElementById('dm-credit-ref');
  const creditTxid = document.getElementById('dm-credit-txid');
  const creditFooterDate = document.getElementById('dm-credit-footerDate');
  const creditFooterTime = document.getElementById('dm-credit-footerTime');
  const creditStatus = document.getElementById('dm-credit-status');
  const creditCurrentBalanceDisplay = document.getElementById('dm-credit-currentBalance');
  const creditProjectedBalanceDisplay = document.getElementById('dm-credit-projectedBalance');
  const creditMemoInput = document.getElementById('dm-credit-memo');
  const creditMemoPreview = document.getElementById('dm-credit-memo-preview');
  const creditMemoPreviewText = document.getElementById('dm-credit-memo-previewText');
  const creditHistoryList = document.getElementById('dm-credit-history');
  const creditHistoryFilterCharacter = document.getElementById('dm-credit-history-filter-character');
  const creditHistoryFilterType = document.getElementById('dm-credit-history-filter-type');
  const creditHistoryExportBtn = document.getElementById('dm-credit-history-export');
  const creditHistoryClearBtn = document.getElementById('dm-credit-history-clear');
  const rewardHistoryList = document.getElementById('dm-reward-history');
  const rewardHistoryExportBtn = document.getElementById('dm-reward-history-export');
  const rewardHistoryClearBtn = document.getElementById('dm-reward-history-clear');
  const quickRewardTargetSelect = document.getElementById('dm-reward-target');
  const quickXpForm = document.getElementById('dm-reward-xp-form');
  const quickXpMode = document.getElementById('dm-reward-xp-mode');
  const quickXpAmount = document.getElementById('dm-reward-xp-amount');
  const quickHpSpForm = document.getElementById('dm-reward-hpsp-form');
  const quickHpMode = document.getElementById('dm-reward-hp-mode');
  const quickHpValue = document.getElementById('dm-reward-hp-value');
  const quickHpTempMode = document.getElementById('dm-reward-hp-temp-mode');
  const quickHpTemp = document.getElementById('dm-reward-hp-temp');
  const quickSpMode = document.getElementById('dm-reward-sp-mode');
  const quickSpValue = document.getElementById('dm-reward-sp-value');
  const quickSpTempMode = document.getElementById('dm-reward-sp-temp-mode');
  const quickSpTemp = document.getElementById('dm-reward-sp-temp');
  const quickResonanceForm = document.getElementById('dm-reward-resonance-form');
  const quickResonancePointsMode = document.getElementById('dm-reward-resonance-points-mode');
  const quickResonancePoints = document.getElementById('dm-reward-resonance-points');
  const quickResonanceBankedMode = document.getElementById('dm-reward-resonance-banked-mode');
  const quickResonanceBanked = document.getElementById('dm-reward-resonance-banked');
  const quickFactionForm = document.getElementById('dm-reward-faction-form');
  const quickFactionSelect = document.getElementById('dm-reward-faction-select');
  const quickFactionMode = document.getElementById('dm-reward-faction-mode');
  const quickFactionValue = document.getElementById('dm-reward-faction-value');
  const quickXpPresetSelect = document.getElementById('dm-reward-xp-preset');
  const quickXpPresetSaveBtn = document.getElementById('dm-reward-xp-preset-save');
  const quickXpPresetDeleteBtn = document.getElementById('dm-reward-xp-preset-delete');
  const quickHpSpPresetSelect = document.getElementById('dm-reward-hpsp-preset');
  const quickHpSpPresetSaveBtn = document.getElementById('dm-reward-hpsp-preset-save');
  const quickHpSpPresetDeleteBtn = document.getElementById('dm-reward-hpsp-preset-delete');
  const quickResonancePresetSelect = document.getElementById('dm-reward-resonance-preset');
  const quickResonancePresetSaveBtn = document.getElementById('dm-reward-resonance-preset-save');
  const quickResonancePresetDeleteBtn = document.getElementById('dm-reward-resonance-preset-delete');
  const quickFactionPresetSelect = document.getElementById('dm-reward-faction-preset');
  const quickFactionPresetSaveBtn = document.getElementById('dm-reward-faction-preset-save');
  const quickFactionPresetDeleteBtn = document.getElementById('dm-reward-faction-preset-delete');
  const rewardsTabButtons = new Map();
  const rewardsPanelMap = new Map();
  let activeRewardsTab = 'resource';
  let allCharacters = [];
  let activeCharacterFilter = '';
  let activeCharacterSort = 'asc';
  let lastFocusedCharacter = '';

  dmToggleButtonRef = dmToggleBtn;
  dmToggleBadgeRef = dmToggleBtn ? dmToggleBtn.querySelector('[data-role="dm-unread-badge"]') : null;
  if (dmToggleBtn && !dmToggleBaseLabel) {
    dmToggleBaseLabel = dmToggleBtn.getAttribute('aria-label') || 'DM tools menu';
  }
  dmNotificationsButtonRef = notifyBtn;
  dmNotificationsBadgeRef = notifyBtn ? notifyBtn.querySelector('[data-role="dm-unread-badge"]') : null;
  if (notifyBtn) {
    dmNotificationsHadExplicitAriaLabel = notifyBtn.hasAttribute('aria-label');
    if (!dmNotificationsBaseLabel) {
      dmNotificationsBaseLabel = notifyBtn.getAttribute('aria-label') || notifyBtn.textContent?.trim() || 'Notifications';
    }
  }
  notifyModalRef = notifyModal;
  updateUnreadIndicators();

  if (rewardsTabs) {
    rewardsTabs.querySelectorAll('[data-tab]').forEach(btn => {
      const tabId = btn?.dataset?.tab;
      if (!tabId) return;
      rewardsTabButtons.set(tabId, btn);
      if (btn.classList.contains('is-active')) {
        activeRewardsTab = tabId;
      }
    });
  }

  if (rewardsPanels) {
    rewardsPanels.querySelectorAll('[data-panel]').forEach(panel => {
      const panelId = panel?.dataset?.panel;
      if (!panelId) return;
      rewardsPanelMap.set(panelId, panel);
      if (panel.classList.contains('is-active')) {
        activeRewardsTab = panelId;
      }
    });
  }

  if (!rewardsTabButtons.has(activeRewardsTab)) {
    const firstTab = rewardsTabButtons.keys().next();
    activeRewardsTab = firstTab?.value || 'resource';
  }

  updateRewardsTabState();
  populateFactionOptions();
  updateQuickRewardFormsState();

  function updateRewardsTabState() {
    rewardsTabButtons.forEach((btn, tabId) => {
      const active = tabId === activeRewardsTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    rewardsPanelMap.forEach((panel, panelId) => {
      const active = panelId === activeRewardsTab;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  }

  function getAdjacentRewardsTab(currentId, offset) {
    const keys = Array.from(rewardsTabButtons.keys());
    if (!keys.length) return currentId;
    let index = keys.indexOf(currentId);
    if (index === -1) index = 0;
    const nextIndex = (index + offset + keys.length) % keys.length;
    return keys[nextIndex];
  }

  const CATALOG_RECIPIENT_FIELD_KEY = 'recipient';
  const CATALOG_RECIPIENT_PLACEHOLDER = 'Assign to hero (optional)';

  const CATALOG_TYPES = [
    { id: 'gear', label: 'Gear', blurb: 'Outfit your operatives with surveillance, support, and survival tech.' },
    { id: 'weapons', label: 'Weapons', blurb: 'Detail signature arsenals, from close-quarters tools to experimental ordnance.' },
    { id: 'armor', label: 'Armor', blurb: 'Describe layered defenses, hardlight plating, and reactive shielding.' },
    { id: 'items', label: 'Items', blurb: 'Track consumables, mission-critical widgets, and bespoke creations.' },
    { id: 'powers', label: 'Powers', blurb: 'Capture advanced techniques, psionics, or shard-channeling abilities.' },
    { id: 'signature-moves', label: 'Signature Moves', blurb: 'Script cinematic finishers and team-defining maneuvers.' },
  ];

  const CATALOG_WEAPON_ABILITY_OPTIONS = [
    { value: '', label: 'Auto (based on range)' },
    { value: 'str', label: 'Strength' },
    { value: 'dex', label: 'Dexterity' },
    { value: 'con', label: 'Constitution' },
    { value: 'int', label: 'Intelligence' },
    { value: 'wis', label: 'Wisdom' },
    { value: 'cha', label: 'Charisma' },
  ];

  const CATALOG_ARMOR_SLOT_OPTIONS = [
    { value: 'Body', label: 'Body' },
    { value: 'Head', label: 'Head' },
    { value: 'Shield', label: 'Shield' },
    { value: 'Accessory', label: 'Accessory' },
    { value: 'Other', label: 'Other' },
  ];

  const CATALOG_BASE_SHORT_FIELDS = [
    { key: 'name', label: 'Name', kind: 'input', type: 'text', required: true, placeholder: 'Entry name', autocomplete: 'off' },
    { key: 'tier', label: 'Tier / Level', kind: 'input', type: 'text', placeholder: 'Tier or recommended level' },
    { key: 'price', label: 'Price / Cost', kind: 'input', type: 'text', placeholder: 'Credits, barter, or opportunity cost' },
    { key: 'rarity', label: 'Rarity', kind: 'input', type: 'text', placeholder: 'Common, rare, prototype…' },
    { key: 'tags', label: 'Tags', kind: 'input', type: 'text', placeholder: 'Comma-separated keywords' },
  ];

  const CATALOG_BASE_LONG_FIELDS = [
    { key: 'description', label: 'Overview', kind: 'textarea', rows: 4, placeholder: 'Describe the entry and how it appears in play.' },
    { key: 'mechanics', label: 'Mechanical Effects', kind: 'textarea', rows: 3, placeholder: 'Summarize bonuses, checks, and rules interactions.' },
    { key: 'dmNotes', label: 'DM Notes', kind: 'textarea', rows: 3, placeholder: 'Secret hooks, escalation paths, or reminders.', hint: 'Only visible to you when drafting entries.' },
  ];

  const CATALOG_TYPE_SHORT_FIELDS = {
    gear: [
      { key: 'function', label: 'Primary Function', kind: 'input', type: 'text', placeholder: 'Utility, infiltration, support, etc.' },
      { key: 'availability', label: 'Availability', kind: 'input', type: 'text', placeholder: 'Common, restricted, prototype…' },
    ],
    weapons: [
      { key: 'damage', label: 'Damage Profile', kind: 'input', type: 'text', placeholder: 'e.g. 2d6 kinetic + 1 burn' },
      { key: 'range', label: 'Range', kind: 'input', type: 'text', placeholder: 'Reach, 20m, etc.' },
      { key: 'attackAbility', label: 'Attack Ability', kind: 'select', options: CATALOG_WEAPON_ABILITY_OPTIONS, placeholder: 'Select ability (optional)' },
      { key: 'proficient', label: 'Proficient', kind: 'input', type: 'checkbox', hint: 'Check if the hero is proficient with this weapon.' },
      { key: CATALOG_RECIPIENT_FIELD_KEY, label: 'Recipient', kind: 'select', placeholder: CATALOG_RECIPIENT_PLACEHOLDER },
    ],
    armor: [
      { key: 'defense', label: 'Defense Bonus', kind: 'input', type: 'text', placeholder: '+2 Guard, Resist Energy' },
      { key: 'capacity', label: 'Capacity / Slots', kind: 'input', type: 'text', placeholder: 'Light, 2 slots, etc.' },
      { key: 'slot', label: 'Armor Slot', kind: 'select', options: CATALOG_ARMOR_SLOT_OPTIONS, placeholder: 'Select slot' },
      { key: 'bonusValue', label: 'Bonus Value', kind: 'input', type: 'number', inputMode: 'numeric', step: 1, placeholder: '0' },
      { key: 'equipped', label: 'Mark Equipped', kind: 'input', type: 'checkbox', hint: 'Deliver equipped on receipt.' },
      { key: CATALOG_RECIPIENT_FIELD_KEY, label: 'Recipient', kind: 'select', placeholder: CATALOG_RECIPIENT_PLACEHOLDER },
    ],
    items: [
      { key: 'uses', label: 'Uses', kind: 'input', type: 'text', placeholder: 'Single-use, 3 charges, etc.' },
      { key: 'size', label: 'Size / Carry', kind: 'input', type: 'text', placeholder: 'Handheld, pack, etc.' },
      { key: 'quantity', label: 'Quantity', kind: 'input', type: 'number', inputMode: 'numeric', min: 1, step: 1, placeholder: '1' },
      { key: CATALOG_RECIPIENT_FIELD_KEY, label: 'Recipient', kind: 'select', placeholder: CATALOG_RECIPIENT_PLACEHOLDER },
    ],
    powers: [
      { key: 'cost', label: 'Cost / Resource', kind: 'input', type: 'text', placeholder: 'SP cost, cooldown, etc.' },
      { key: 'duration', label: 'Duration', kind: 'input', type: 'text', placeholder: 'Instant, sustain, scene, etc.' },
    ],
    'signature-moves': [
      { key: 'trigger', label: 'Trigger', kind: 'input', type: 'text', placeholder: 'Describe when the move activates' },
      { key: 'reward', label: 'Reward / Impact', kind: 'input', type: 'text', placeholder: 'Damage, status, or story payoff' },
    ],
  };

  const CATALOG_TYPE_LONG_FIELDS = {
    gear: [
      { key: 'operation', label: 'Operating Notes', kind: 'textarea', rows: 3, placeholder: 'Setup, requirements, and failure modes.' },
    ],
    weapons: [
      { key: 'special', label: 'Special Rules', kind: 'textarea', rows: 3, placeholder: 'Alternate fire modes, reload steps, complications.' },
    ],
    armor: [
      { key: 'coverage', label: 'Coverage & Traits', kind: 'textarea', rows: 3, placeholder: 'Systems protected, energy channels, or resistances.' },
    ],
    items: [
      { key: 'usage', label: 'Usage Notes', kind: 'textarea', rows: 3, placeholder: 'How and when players can use this item.' },
    ],
    powers: [
      { key: 'effect', label: 'Power Effect', kind: 'textarea', rows: 3, placeholder: 'Describe outcomes, saves, and failure states.' },
    ],
    'signature-moves': [
      { key: 'narrative', label: 'Narrative Beats', kind: 'textarea', rows: 3, placeholder: 'Paint the cinematic moment for the move.' },
    ],
  };

  const creditAccountNumbers = new Map();
  const creditAmountFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PLAYER_CREDIT_STORAGE_KEY = 'cc_dm_card';
  const PLAYER_CREDIT_BROADCAST_CHANNEL = 'cc:player-credit';
  const PLAYER_REWARD_BROADCAST_CHANNEL = 'cc:player-rewards';
  const PLAYER_CREDIT_HISTORY_LIMIT = 10;
  const DM_REWARD_HISTORY_STORAGE_KEY = 'cc:dm-reward-history';
  const DM_REWARD_HISTORY_LIMIT = 20;
  let playerCreditBroadcastChannel = null;
  let playerCreditBroadcastListenerAttached = false;
  let playerRewardBroadcastChannel = null;
  let playerCreditHistory = [];
  const DEFAULT_CREDIT_HISTORY_FILTERS = Object.freeze({ character: '', type: '' });
  let creditHistoryFilters = { ...DEFAULT_CREDIT_HISTORY_FILTERS };
  let quickRewardHistory = [];
  let creditSelectedPlayerBalance = null;
  let creditBalanceRequestId = 0;

  function creditPad(n) {
    return String(n).padStart(2, '0');
  }

  function creditFormatDate(d) {
    return `${creditPad(d.getMonth() + 1)}-${creditPad(d.getDate())}-${d.getFullYear()}`;
  }

  function creditFormatTime(d) {
    return `${creditPad(d.getHours())}:${creditPad(d.getMinutes())}:${creditPad(d.getSeconds())}`;
  }

  function computeCreditAccountNumber(name = '') {
    if (creditAccountNumbers.has(name)) {
      return creditAccountNumbers.get(name);
    }
    const normalized = name.normalize?.('NFKD')?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PLAYER';
    let hash = 1469598103934665603n;
    const PRIME = 1099511628211n;
    for (let i = 0; i < normalized.length; i += 1) {
      hash ^= BigInt(normalized.charCodeAt(i));
      hash = (hash * PRIME) % 10000000000000000n;
    }
    if (hash === 0n) {
      hash = 982451653n;
    }
    const digits = hash.toString().padStart(16, '0');
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1-');
    creditAccountNumbers.set(name, formatted);
    return formatted;
  }

  function sanitizeCreditAmount(value) {
    const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value);
    const cleaned = stringValue.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length <= 2) return cleaned;
    return `${parts.shift()}.${parts.join('')}`;
  }

  function getCreditAmountNumber() {
    if (!creditAmountInput) return 0;
    const sanitized = sanitizeCreditAmount(creditAmountInput.value);
    if (sanitized === '') return 0;
    const num = Number(sanitized);
    return Number.isFinite(num) ? num : 0;
  }

  function formatCreditAmountDisplay(value) {
    const numeric = Number.isFinite(value) ? value : 0;
    return creditAmountFormatter.format(numeric);
  }

  function normalizeCreditBalance(value) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.round(numeric * 100) / 100);
  }

  function setCreditBalanceText(node, value) {
    if (!node) return;
    if (typeof value === 'string') {
      node.textContent = value;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      node.textContent = `₡${formatCreditAmountDisplay(value)}`;
      return;
    }
    node.textContent = '—';
  }

  function updateCreditBalanceDisplays({ current, projected } = {}) {
    if (current !== undefined) {
      setCreditBalanceText(creditCurrentBalanceDisplay, current);
    }
    if (projected !== undefined) {
      setCreditBalanceText(creditProjectedBalanceDisplay, projected);
    }
  }

  function computeProjectedCreditBalance(currentBalance) {
    if (!Number.isFinite(currentBalance)) return null;
    const amount = getCreditAmountNumber();
    if (!Number.isFinite(amount) || amount <= 0) {
      return currentBalance;
    }
    const transactionType = creditTxnType?.value === 'Debit' ? 'Debit' : 'Deposit';
    const delta = transactionType === 'Debit' ? -Math.abs(amount) : Math.abs(amount);
    const projected = currentBalance + delta;
    return Math.max(0, Math.round(projected * 100) / 100);
  }

  function updateCreditProjectedBalanceDisplay() {
    if (!creditProjectedBalanceDisplay) return;
    if (!Number.isFinite(creditSelectedPlayerBalance)) {
      updateCreditBalanceDisplays({ projected: '—' });
      return;
    }
    const projected = computeProjectedCreditBalance(creditSelectedPlayerBalance);
    if (projected == null) {
      updateCreditBalanceDisplays({ projected: '—' });
    } else {
      updateCreditBalanceDisplays({ projected });
    }
  }

  async function loadSelectedCreditBalance(player, requestId) {
    try {
      const data = await loadCharacter(player, { bypassPin: true });
      if (creditBalanceRequestId !== requestId) return;
      const normalized = normalizeCreditBalance(parseStoredCredits(data?.credits));
      creditSelectedPlayerBalance = typeof normalized === 'number' ? normalized : null;
      if (creditSelectedPlayerBalance == null) {
        updateCreditBalanceDisplays({ current: '—' });
      } else {
        updateCreditBalanceDisplays({ current: creditSelectedPlayerBalance });
      }
      updateCreditProjectedBalanceDisplay();
    } catch (err) {
      if (creditBalanceRequestId !== requestId) return;
      creditSelectedPlayerBalance = null;
      updateCreditBalanceDisplays({ current: '—', projected: '—' });
      updateCreditProjectedBalanceDisplay();
      console.error('Failed to load player credits', err);
    }
  }

  function updateCreditCardAmountDisplay(value) {
    if (!creditCard) return;
    const numeric = Number.isFinite(value) ? value : 0;
    creditCard.setAttribute('data-amount', numeric.toFixed(2));
  }

  function sanitizeCreditMemo(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function updateCreditMemoPreview(value) {
    const memo = sanitizeCreditMemo(value);
    if (creditCard) {
      creditCard.setAttribute('data-memo', memo);
    }
    if (creditMemoPreviewText) {
      creditMemoPreviewText.textContent = memo || '—';
    }
    if (creditMemoPreview) {
      creditMemoPreview.hidden = memo === '';
    }
  }

  function ensurePlayerCreditBroadcastChannel() {
    if (playerCreditBroadcastChannel || typeof BroadcastChannel !== 'function') {
      if (playerCreditBroadcastChannel && !playerCreditBroadcastListenerAttached) {
        try {
          playerCreditBroadcastChannel.addEventListener('message', handlePlayerCreditBroadcastMessage);
          playerCreditBroadcastListenerAttached = true;
        } catch {
          /* ignore listener failures */
        }
      }
      return playerCreditBroadcastChannel;
    }
    try {
      playerCreditBroadcastChannel = new BroadcastChannel(PLAYER_CREDIT_BROADCAST_CHANNEL);
    } catch {
      playerCreditBroadcastChannel = null;
    }
    if (playerCreditBroadcastChannel && !playerCreditBroadcastListenerAttached) {
      try {
        playerCreditBroadcastChannel.addEventListener('message', handlePlayerCreditBroadcastMessage);
        playerCreditBroadcastListenerAttached = true;
      } catch {
        playerCreditBroadcastListenerAttached = false;
      }
    }
    return playerCreditBroadcastChannel;
  }

  function sanitizeCreditHistoryFilters(filters) {
    const sanitized = { ...DEFAULT_CREDIT_HISTORY_FILTERS };
    if (!filters || typeof filters !== 'object') return sanitized;
    if (typeof filters.character === 'string') {
      sanitized.character = filters.character.trim();
    }
    if (typeof filters.type === 'string') {
      sanitized.type = filters.type.trim();
    }
    return sanitized;
  }

  function isDefaultCreditHistoryFilters(filters = creditHistoryFilters) {
    if (!filters || typeof filters !== 'object') return true;
    const normalized = sanitizeCreditHistoryFilters(filters);
    return !normalized.character && !normalized.type;
  }

  function syncCreditHistoryFilterControls() {
    if (creditHistoryFilterCharacter && creditHistoryFilterCharacter.value !== creditHistoryFilters.character) {
      creditHistoryFilterCharacter.value = creditHistoryFilters.character;
    }
    if (creditHistoryFilterType && creditHistoryFilterType.value !== creditHistoryFilters.type) {
      creditHistoryFilterType.value = creditHistoryFilters.type;
    }
  }

  function setCreditHistoryFilters(updates = {}, { persist = true } = {}) {
    if (!updates || typeof updates !== 'object') return creditHistoryFilters;
    const next = { ...creditHistoryFilters };
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(updates, 'character')) {
      const value = typeof updates.character === 'string' ? updates.character.trim() : '';
      if (next.character !== value) {
        next.character = value;
        changed = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      const value = typeof updates.type === 'string' ? updates.type.trim() : '';
      if (next.type !== value) {
        next.type = value;
        changed = true;
      }
    }
    if (!changed) return creditHistoryFilters;
    creditHistoryFilters = next;
    if (persist) persistPlayerCreditHistory(playerCreditHistory);
    syncCreditHistoryFilterControls();
    return creditHistoryFilters;
  }

  function getFilteredPlayerCreditHistory() {
    if (!Array.isArray(playerCreditHistory) || !playerCreditHistory.length) return [];
    const { character, type } = creditHistoryFilters;
    return playerCreditHistory.filter(entry => {
      if (!entry) return false;
      if (character && entry.player !== character) return false;
      if (type && entry.type !== type) return false;
      return true;
    });
  }

  function reconcileCreditHistoryFiltersWithEntries({ persist = true } = {}) {
    let changed = false;
    const characterOptions = new Set();
    playerCreditHistory.forEach(entry => {
      if (entry && typeof entry.player === 'string' && entry.player) {
        characterOptions.add(entry.player);
      }
    });
    if (creditHistoryFilters.character && !characterOptions.has(creditHistoryFilters.character)) {
      creditHistoryFilters = { ...creditHistoryFilters, character: DEFAULT_CREDIT_HISTORY_FILTERS.character };
      changed = true;
    }
    const typeOptions = new Set(['Deposit', 'Debit']);
    playerCreditHistory.forEach(entry => {
      if (entry && typeof entry.type === 'string' && entry.type) {
        typeOptions.add(entry.type);
      }
    });
    if (creditHistoryFilters.type && !typeOptions.has(creditHistoryFilters.type)) {
      creditHistoryFilters = { ...creditHistoryFilters, type: DEFAULT_CREDIT_HISTORY_FILTERS.type };
      changed = true;
    }
    if (changed && persist) {
      persistPlayerCreditHistory(playerCreditHistory);
    }
    return changed;
  }

  function updateCreditHistoryFilterOptions() {
    let filtersAdjusted = false;
    const playerOptions = new Set();
    playerCreditHistory.forEach(entry => {
      if (entry && typeof entry.player === 'string' && entry.player) {
        playerOptions.add(entry.player);
      }
    });
    if (creditHistoryFilterCharacter) {
      creditHistoryFilterCharacter.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = DEFAULT_CREDIT_HISTORY_FILTERS.character;
      allOption.textContent = 'All characters';
      creditHistoryFilterCharacter.appendChild(allOption);
      Array.from(playerOptions)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          creditHistoryFilterCharacter.appendChild(option);
        });
      if (creditHistoryFilters.character && !playerOptions.has(creditHistoryFilters.character)) {
        creditHistoryFilters = { ...creditHistoryFilters, character: DEFAULT_CREDIT_HISTORY_FILTERS.character };
        filtersAdjusted = true;
      }
    }
    const typeSet = new Set(['Deposit', 'Debit']);
    playerCreditHistory.forEach(entry => {
      if (entry && typeof entry.type === 'string' && entry.type) {
        typeSet.add(entry.type);
      }
    });
    if (creditHistoryFilters.type && !typeSet.has(creditHistoryFilters.type)) {
      creditHistoryFilters = { ...creditHistoryFilters, type: DEFAULT_CREDIT_HISTORY_FILTERS.type };
      filtersAdjusted = true;
    }
    if (creditHistoryFilterType) {
      creditHistoryFilterType.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = DEFAULT_CREDIT_HISTORY_FILTERS.type;
      allOption.textContent = 'All types';
      creditHistoryFilterType.appendChild(allOption);
      Array.from(typeSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .forEach(type => {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type === 'Debit' ? 'Debits' : type === 'Deposit' ? 'Deposits' : type;
          creditHistoryFilterType.appendChild(option);
        });
    }
    syncCreditHistoryFilterControls();
    if (filtersAdjusted) {
      persistPlayerCreditHistory(playerCreditHistory);
    }
  }

  function sanitizePlayerCreditPayload(payload = {}) {
    const amountValue = Number(payload.amount);
    const timestamp = (() => {
      if (payload.timestamp instanceof Date) return payload.timestamp.toISOString();
      if (typeof payload.timestamp === 'string' && payload.timestamp) {
        const parsed = new Date(payload.timestamp);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
      return new Date().toISOString();
    })();
    return {
      account: typeof payload.account === 'string' ? payload.account : '',
      amount: Number.isFinite(amountValue) ? amountValue : 0,
      type: typeof payload.type === 'string' ? payload.type : '',
      sender: typeof payload.sender === 'string' ? payload.sender : '',
      ref: typeof payload.ref === 'string' ? payload.ref : '',
      txid: typeof payload.txid === 'string' ? payload.txid : '',
      timestamp,
      player: typeof payload.player === 'string' ? payload.player : '',
      memo: sanitizeCreditMemo(payload.memo),
    };
  }

  function parseStoredPlayerCreditHistory(raw) {
    if (!raw) return { entries: [], filters: null };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { entries: parsed, filters: null };
      }
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.entries) || parsed.filters) {
          const entries = Array.isArray(parsed.entries)
            ? parsed.entries
            : parsed.entries && typeof parsed.entries === 'object'
              ? [parsed.entries]
              : [];
          return {
            entries,
            filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : null,
          };
        }
        return { entries: [parsed], filters: null };
      }
    } catch {
      return { entries: [], filters: null };
    }
    return { entries: [], filters: null };
  }

  function loadPlayerCreditHistoryFromStorage() {
    if (typeof localStorage === 'undefined') {
      return { entries: [], filters: sanitizeCreditHistoryFilters() };
    }
    try {
      const raw = localStorage.getItem(PLAYER_CREDIT_STORAGE_KEY);
      const { entries: storedEntries, filters } = parseStoredPlayerCreditHistory(raw);
      const normalized = (Array.isArray(storedEntries) ? storedEntries : [])
        .map(item => sanitizePlayerCreditPayload(item))
        .filter(item => item && typeof item.timestamp === 'string');
      return {
        entries: normalized.slice(0, PLAYER_CREDIT_HISTORY_LIMIT),
        filters: sanitizeCreditHistoryFilters(filters),
      };
    } catch {
      return { entries: [], filters: sanitizeCreditHistoryFilters() };
    }
  }

  function playerCreditHistoryKey(entry = {}) {
    return `${entry.txid || entry.ref || ''}|${entry.timestamp || ''}`;
  }

  function persistPlayerCreditHistory(entries) {
    if (typeof localStorage === 'undefined') return;
    try {
      const sanitizedFilters = sanitizeCreditHistoryFilters(creditHistoryFilters);
      creditHistoryFilters = sanitizedFilters;
      const hasEntries = Array.isArray(entries) && entries.length > 0;
      if (!hasEntries && isDefaultCreditHistoryFilters(sanitizedFilters)) {
        localStorage.removeItem(PLAYER_CREDIT_STORAGE_KEY);
        return;
      }
      const payload = {
        entries: Array.isArray(entries) ? entries : [],
        filters: sanitizedFilters,
      };
      localStorage.setItem(PLAYER_CREDIT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore persistence failures */
    }
  }

  function setPlayerCreditHistory(entries, { persist = true } = {}) {
    const normalized = Array.isArray(entries) ? entries.map(item => sanitizePlayerCreditPayload(item)) : [];
    const deduped = [];
    const seen = new Set();
    normalized.forEach(item => {
      if (!item) return;
      const key = playerCreditHistoryKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(item);
    });
    playerCreditHistory = deduped.slice(0, PLAYER_CREDIT_HISTORY_LIMIT);
    reconcileCreditHistoryFiltersWithEntries({ persist: false });
    if (persist) {
      persistPlayerCreditHistory(playerCreditHistory);
    }
    return playerCreditHistory;
  }

  {
    const storedCreditState = loadPlayerCreditHistoryFromStorage();
    creditHistoryFilters = sanitizeCreditHistoryFilters(storedCreditState.filters);
    playerCreditHistory = setPlayerCreditHistory(storedCreditState.entries, { persist: false });
  }

  function appendPlayerCreditHistory(entry) {
    const sanitized = sanitizePlayerCreditPayload(entry);
    const key = playerCreditHistoryKey(sanitized);
    const filtered = playerCreditHistory.filter(item => playerCreditHistoryKey(item) !== key);
    filtered.unshift(sanitized);
    return setPlayerCreditHistory(filtered);
  }

  function formatCreditHistoryTimestamp(value) {
    let date = null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      date = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      date = new Date(value);
    } else if (typeof value === 'string' && value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
    if (!date) {
      return typeof value === 'string' && value ? value : new Date().toLocaleString();
    }
    return `${creditFormatDate(date)} • ${creditFormatTime(date)}`;
  }

  function formatCreditHistoryEntry(entry) {
    if (!entry) return '';
    const timestampLabel = formatCreditHistoryTimestamp(entry.timestamp);
    const amountValue = Number(entry.amount);
    const amount = Number.isFinite(amountValue) ? Math.abs(amountValue) : 0;
    const type = entry.type === 'Debit' ? 'Debited' : 'Deposited';
    const direction = entry.type === 'Debit' ? 'from' : 'to';
    const playerName = entry.player ? entry.player : 'player';
    const sender = entry.sender ? entry.sender : 'DM';
    const memo = entry.memo ? entry.memo.replace(/\s+/g, ' ').trim() : '';
    const memoSuffix = memo ? ` Memo: ${memo}` : '';
    return `${timestampLabel} — ${type} ₡${formatCreditAmountDisplay(amount)} ${direction} ${playerName} via ${sender}.${memoSuffix}`;
  }

  function updateCreditHistoryActionState(filteredEntries = getFilteredPlayerCreditHistory()) {
    const hasEntries = Array.isArray(playerCreditHistory) && playerCreditHistory.length > 0;
    const hasFilteredEntries = Array.isArray(filteredEntries) && filteredEntries.length > 0;
    if (creditHistoryClearBtn) creditHistoryClearBtn.disabled = !hasEntries;
    if (creditHistoryExportBtn) creditHistoryExportBtn.disabled = !hasFilteredEntries;
  }

  function renderPlayerCreditHistory() {
    updateCreditHistoryFilterOptions();
    const entries = getFilteredPlayerCreditHistory();
    if (creditHistoryList) {
      creditHistoryList.innerHTML = '';
      if (entries.length) {
        const frag = document.createDocumentFragment();
        entries.forEach(entry => {
          const item = document.createElement('li');
          const description = formatCreditHistoryEntry(entry);
          const text = document.createElement('span');
          text.textContent = description;
          item.appendChild(text);
          const copyBtn = document.createElement('button');
          copyBtn.type = 'button';
          copyBtn.className = 'btn-sm';
          copyBtn.dataset.creditHistoryCopy = 'true';
          copyBtn.dataset.creditHistoryText = description;
          copyBtn.textContent = 'Copy';
          copyBtn.setAttribute('aria-label', `Copy entry recorded ${formatCreditHistoryTimestamp(entry.timestamp)}`);
          item.appendChild(copyBtn);
          frag.appendChild(item);
        });
        creditHistoryList.appendChild(frag);
      }
    }
    updateCreditHistoryActionState(entries);
  }

  function clearPlayerCreditHistory({ announce = true } = {}) {
    if (!playerCreditHistory.length) {
      if (announce) {
        toast('Credit history is already empty', 'info');
      }
      return false;
    }
    setPlayerCreditHistory([]);
    renderPlayerCreditHistory();
    if (announce) {
      toast('Credit history cleared', 'info');
    }
    return true;
  }

  async function exportPlayerCreditHistory() {
    const entries = getFilteredPlayerCreditHistory();
    if (!entries.length) {
      const message = playerCreditHistory.length
        ? 'No credit history entries match the current filters'
        : 'Credit history is empty';
      toast(message, 'info');
      return false;
    }
    const lines = entries.map(entry => formatCreditHistoryEntry(entry));
    const payload = lines.join('\n');
    if (!payload) {
      toast('Nothing to export', 'info');
      return false;
    }
    if (await writeTextToClipboard(payload)) {
      toast('Credit history copied to clipboard', 'success');
      return true;
    }
    if (downloadTextFile(buildExportFilename('dm-credit-history'), payload)) {
      toast('Credit history exported', 'success');
      return true;
    }
    toast('Unable to export credit history', 'error');
    return false;
  }

  function rewardHistoryKey(entry = {}) {
    if (entry && typeof entry.id === 'string' && entry.id) {
      return entry.id;
    }
    const timestamp = entry && (entry.t ?? entry.timestamp ?? '');
    const name = entry && entry.name ? entry.name : '';
    const text = entry && entry.text ? entry.text : '';
    return `${timestamp}|${name}|${text}`;
  }

  function sanitizeQuickRewardHistoryEntry(entry = {}) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const id = typeof entry.id === 'string' && entry.id
      ? entry.id
      : `dm-reward-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    let timestamp = entry.t;
    if (timestamp instanceof Date) {
      timestamp = timestamp.getTime();
    } else if (typeof timestamp === 'string' && timestamp) {
      const numeric = Number(timestamp);
      if (Number.isFinite(numeric)) {
        timestamp = numeric;
      } else {
        const parsed = new Date(timestamp);
        timestamp = Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
      }
    } else if (!Number.isFinite(timestamp)) {
      if (entry.timestamp instanceof Date) {
        timestamp = entry.timestamp.getTime();
      } else if (typeof entry.timestamp === 'string' && entry.timestamp) {
        const parsed = new Date(entry.timestamp);
        timestamp = Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
      } else if (Number.isFinite(entry.timestamp)) {
        timestamp = Number(entry.timestamp);
      } else {
        timestamp = Date.now();
      }
    }
    if (!Number.isFinite(timestamp)) {
      timestamp = Date.now();
    }
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    return { id, t: timestamp, name, text };
  }

  function parseStoredQuickRewardHistory(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      return [];
    }
    return [];
  }

  function loadQuickRewardHistoryFromStorage() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(DM_REWARD_HISTORY_STORAGE_KEY);
      const parsed = parseStoredQuickRewardHistory(raw);
      const normalized = parsed
        .map(item => sanitizeQuickRewardHistoryEntry(item))
        .filter(Boolean);
      return normalized.slice(0, DM_REWARD_HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  function persistQuickRewardHistory(entries) {
    if (typeof localStorage === 'undefined') return;
    try {
      if (!entries || !entries.length) {
        localStorage.removeItem(DM_REWARD_HISTORY_STORAGE_KEY);
      } else {
        localStorage.setItem(DM_REWARD_HISTORY_STORAGE_KEY, JSON.stringify(entries));
      }
    } catch {
      /* ignore persistence failures */
    }
  }

  function setQuickRewardHistory(entries, { persist = true } = {}) {
    const normalized = Array.isArray(entries)
      ? entries.map(item => sanitizeQuickRewardHistoryEntry(item)).filter(Boolean)
      : [];
    const deduped = [];
    const seen = new Set();
    normalized.forEach(item => {
      if (!item) return;
      const key = rewardHistoryKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(item);
    });
    quickRewardHistory = deduped.slice(0, DM_REWARD_HISTORY_LIMIT);
    if (persist) {
      persistQuickRewardHistory(quickRewardHistory);
    }
    return quickRewardHistory;
  }

  function appendQuickRewardHistory(entries, { persist = true } = {}) {
    const list = Array.isArray(entries) ? entries : [entries];
    const normalized = list
      .map(item => sanitizeQuickRewardHistoryEntry(item))
      .filter(Boolean);
    if (!normalized.length) return quickRewardHistory;
    return setQuickRewardHistory([...normalized, ...quickRewardHistory], { persist });
  }

  function formatQuickRewardHistoryTimestamp(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${creditFormatDate(value)} • ${creditFormatTime(value)}`;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const fromNumber = new Date(numeric);
      if (!Number.isNaN(fromNumber.getTime())) {
        return `${creditFormatDate(fromNumber)} • ${creditFormatTime(fromNumber)}`;
      }
    }
    if (typeof value === 'string' && value) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return `${creditFormatDate(parsed)} • ${creditFormatTime(parsed)}`;
      }
      return value;
    }
    const now = new Date();
    return `${creditFormatDate(now)} • ${creditFormatTime(now)}`;
  }

  function formatQuickRewardHistoryEntry(entry) {
    if (!entry) return '';
    const parts = [formatQuickRewardHistoryTimestamp(entry.t)];
    if (entry.name) parts.push(entry.name);
    if (entry.text) parts.push(entry.text);
    return parts.join(' — ');
  }

  function updateQuickRewardHistoryActionState() {
    const isEmpty = !quickRewardHistory.length;
    if (rewardHistoryClearBtn) rewardHistoryClearBtn.disabled = isEmpty;
    if (rewardHistoryExportBtn) rewardHistoryExportBtn.disabled = isEmpty;
  }

  function renderQuickRewardHistory() {
    if (!rewardHistoryList) {
      updateQuickRewardHistoryActionState();
      return;
    }
    rewardHistoryList.innerHTML = '';
    if (!quickRewardHistory.length) {
      updateQuickRewardHistoryActionState();
      return;
    }
    const frag = document.createDocumentFragment();
    quickRewardHistory.forEach(entry => {
      const item = document.createElement('li');
      const description = formatQuickRewardHistoryEntry(entry);
      const text = document.createElement('span');
      text.textContent = description;
      item.appendChild(text);
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-sm';
      copyBtn.dataset.rewardHistoryCopy = 'true';
      copyBtn.dataset.rewardHistoryText = description;
      copyBtn.textContent = 'Copy';
      copyBtn.setAttribute('aria-label', `Copy entry recorded ${formatQuickRewardHistoryTimestamp(entry.t)}`);
      item.appendChild(copyBtn);
      frag.appendChild(item);
    });
    rewardHistoryList.appendChild(frag);
    updateQuickRewardHistoryActionState();
  }

  function clearQuickRewardHistory({ announce = true } = {}) {
    if (!quickRewardHistory.length) {
      if (announce) {
        toast('Reward history is already empty', 'info');
      }
      return false;
    }
    setQuickRewardHistory([]);
    renderQuickRewardHistory();
    if (announce) {
      toast('Reward history cleared', 'info');
    }
    return true;
  }

  async function exportQuickRewardHistory() {
    if (!quickRewardHistory.length) {
      toast('Reward history is empty', 'info');
      return false;
    }
    const lines = quickRewardHistory.map(entry => formatQuickRewardHistoryEntry(entry));
    const payload = lines.join('\n');
    if (!payload) {
      toast('Nothing to export', 'info');
      return false;
    }
    if (await writeTextToClipboard(payload)) {
      toast('Reward history copied to clipboard', 'success');
      return true;
    }
    if (downloadTextFile(buildExportFilename('dm-reward-history'), payload)) {
      toast('Reward history exported', 'success');
      return true;
    }
    toast('Unable to export reward history', 'error');
    return false;
  }

  quickRewardHistory = setQuickRewardHistory(loadQuickRewardHistoryFromStorage(), { persist: false });

  function handlePlayerCreditUpdateMessage(payload) {
    if (!payload) return;
    appendPlayerCreditHistory(payload);
    renderPlayerCreditHistory();
  }

  function handlePlayerCreditBroadcastMessage(event) {
    if (!event) return;
    const data = event.data;
    if (!data || data.type !== 'CC_PLAYER_UPDATE') return;
    handlePlayerCreditUpdateMessage(data.payload);
  }

  function handlePlayerCreditWindowMessage(event) {
    if (!event) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'CC_PLAYER_UPDATE') return;
    handlePlayerCreditUpdateMessage(data.payload);
  }

  function broadcastPlayerCreditUpdate(payload) {
    if (typeof window === 'undefined') return;
    const sanitized = sanitizePlayerCreditPayload(payload);
    appendPlayerCreditHistory(sanitized);
    renderPlayerCreditHistory();
    const channel = ensurePlayerCreditBroadcastChannel();
    if (channel) {
      try {
        channel.postMessage({ type: 'CC_PLAYER_UPDATE', payload: sanitized });
      } catch {
        /* ignore broadcast failures */
      }
    }
    try {
      const origin = window.location?.origin || '*';
      window.postMessage({ type: 'CC_PLAYER_UPDATE', payload: sanitized }, origin);
    } catch {
      try {
        window.postMessage({ type: 'CC_PLAYER_UPDATE', payload: sanitized }, '*');
      } catch {
        /* ignore postMessage failures */
      }
    }
    if (typeof window.setPlayerTransaction === 'function') {
      try {
        window.setPlayerTransaction(sanitized, { reveal: false });
      } catch {
        /* ignore preview failures */
      }
    }
  }

  function ensurePlayerRewardBroadcastChannel() {
    if (playerRewardBroadcastChannel || typeof BroadcastChannel !== 'function') {
      return playerRewardBroadcastChannel;
    }
    try {
      playerRewardBroadcastChannel = new BroadcastChannel(PLAYER_REWARD_BROADCAST_CHANNEL);
    } catch {
      playerRewardBroadcastChannel = null;
    }
    return playerRewardBroadcastChannel;
  }

  function sanitizePlayerRewardPayload(payload = {}) {
    const kind = typeof payload.kind === 'string' ? payload.kind : '';
    const player = typeof payload.player === 'string' ? payload.player : '';
    const message = typeof payload.message === 'string' ? payload.message : '';
    const timestamp = (() => {
      if (payload.timestamp instanceof Date) return payload.timestamp.toISOString();
      if (typeof payload.timestamp === 'string' && payload.timestamp) {
        const parsed = new Date(payload.timestamp);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
      return new Date().toISOString();
    })();
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    return { kind, player, message, timestamp, data };
  }

  function broadcastPlayerReward(payload) {
    if (typeof window === 'undefined') return;
    const sanitized = sanitizePlayerRewardPayload(payload);
    const channel = ensurePlayerRewardBroadcastChannel();
    if (channel) {
      try {
        channel.postMessage({ type: 'CC_REWARD_UPDATE', payload: sanitized });
      } catch {
        /* ignore broadcast failures */
      }
    }
    try {
      const origin = window.location?.origin || '*';
      window.postMessage({ type: 'CC_REWARD_UPDATE', payload: sanitized }, origin);
    } catch {
      try {
        window.postMessage({ type: 'CC_REWARD_UPDATE', payload: sanitized }, '*');
      } catch {
        /* ignore postMessage failures */
      }
    }
  }

  function applyCreditAccountSelection() {
    const option = creditAccountSelect?.selectedOptions?.[0] || null;
    const player = option?.value?.trim() || '';
    const accountNumber = option?.dataset?.accountNumber || '';
    if (creditCard) {
      creditCard.setAttribute('data-player', player);
      creditCard.setAttribute('data-account', accountNumber);
    }
    const requestId = ++creditBalanceRequestId;
    creditSelectedPlayerBalance = null;
    if (player) {
      updateCreditBalanceDisplays({ current: 'Loading…', projected: '—' });
      loadSelectedCreditBalance(player, requestId);
    } else {
      updateCreditBalanceDisplays({ current: '—', projected: '—' });
    }
    updateCreditProjectedBalanceDisplay();
  }

  function updateCreditSubmitState() {
    if (!creditSubmit) return;
    const playerSelected = !!(creditAccountSelect && creditAccountSelect.value);
    const amount = getCreditAmountNumber();
    const isValidAmount = Number.isFinite(amount) && amount > 0;
    creditSubmit.disabled = !(playerSelected && isValidAmount);
  }

  function getRewardTarget() {
    if (!quickRewardTargetSelect) return [];
    const selectedOptions = quickRewardTargetSelect.selectedOptions;
    const names = selectedOptions
      ? Array.from(selectedOptions, option => (typeof option.value === 'string' ? option.value.trim() : ''))
      : [typeof quickRewardTargetSelect.value === 'string' ? quickRewardTargetSelect.value.trim() : ''];
    const unique = [];
    names.forEach(name => {
      if (!name) return;
      if (!unique.includes(name)) unique.push(name);
    });
    return unique;
  }

  function cloneQuickRewardOperations(operations = []) {
    return operations.map(operation => {
      if (!operation || typeof operation !== 'object') return operation;
      const clone = { ...operation };
      if (operation.data && typeof operation.data === 'object') {
        clone.data = { ...operation.data };
      }
      return clone;
    });
  }

  function formatPlayerList(names = []) {
    const filtered = names.filter(name => typeof name === 'string' && name.trim());
    if (!filtered.length) return '';
    if (filtered.length === 1) return filtered[0];
    if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
    return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`;
  }

  function reportRewardError(message) {
    toast(message, 'error');
  }

  function updateQuickRewardFormsState() {
    const hasTarget = getRewardTarget().length > 0;
    const targetDisabled = !!quickRewardTargetSelect?.disabled;
    [quickXpForm, quickHpSpForm, quickResonanceForm, quickFactionForm].forEach(form => {
      if (!form) return;
      if (form.dataset.pending === 'true') return;
      const submit = form.querySelector('button[type="submit"]');
      if (!submit) return;
      submit.disabled = targetDisabled || !hasTarget;
    });
  }

  const QUICK_REWARD_PRESETS_STORAGE_KEY = 'cc:dm-quick-reward-presets';
  const QUICK_REWARD_PRESET_VERSION = 1;
  const QUICK_REWARD_PRESET_LIMIT = 20;
  const QUICK_REWARD_MAX_TARGETS = 20;
  const QUICK_REWARD_CARD_IDS = ['xp', 'hpsp', 'resonance', 'faction'];
  const QUICK_REWARD_CARD_LABELS = new Map([
    ['xp', 'XP'],
    ['hpsp', 'HP/SP'],
    ['resonance', 'Resonance'],
    ['faction', 'Faction'],
  ]);

  const quickRewardPresetState = new Map();
  QUICK_REWARD_CARD_IDS.forEach(cardId => {
    quickRewardPresetState.set(cardId, []);
  });

  const quickRewardPresetConfig = {
    xp: { form: quickXpForm, select: quickXpPresetSelect, saveBtn: quickXpPresetSaveBtn, deleteBtn: quickXpPresetDeleteBtn },
    hpsp: { form: quickHpSpForm, select: quickHpSpPresetSelect, saveBtn: quickHpSpPresetSaveBtn, deleteBtn: quickHpSpPresetDeleteBtn },
    resonance: {
      form: quickResonanceForm,
      select: quickResonancePresetSelect,
      saveBtn: quickResonancePresetSaveBtn,
      deleteBtn: quickResonancePresetDeleteBtn,
    },
    faction: {
      form: quickFactionForm,
      select: quickFactionPresetSelect,
      saveBtn: quickFactionPresetSaveBtn,
      deleteBtn: quickFactionPresetDeleteBtn,
    },
  };

  const quickRewardPresetFormLookup = new Map();
  Object.entries(quickRewardPresetConfig).forEach(([cardId, config]) => {
    if (config.form) {
      quickRewardPresetFormLookup.set(config.form, cardId);
    }
  });

  function getQuickRewardPresetLabel(cardId) {
    return QUICK_REWARD_CARD_LABELS.get(cardId) || 'Preset';
  }

  function sanitizeQuickRewardNumericValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value !== 'string') return '';
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) return '';
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? normalized : '';
  }

  function sanitizeQuickRewardTargets(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    list.forEach(value => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      result.push(trimmed);
    });
    return result.slice(0, QUICK_REWARD_MAX_TARGETS);
  }

  function sanitizeQuickRewardPresetName(name, fallback) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed) {
      return trimmed.slice(0, 80);
    }
    return fallback || 'Preset';
  }

  function createQuickRewardPresetId() {
    return `qrp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }

  function sanitizeQuickRewardPresetValues(cardId, values) {
    const data = values && typeof values === 'object' ? values : {};
    switch (cardId) {
      case 'xp': {
        const amountRaw = sanitizeQuickRewardNumericValue(data.amount);
        const amountNumeric = Number(amountRaw);
        if (!Number.isFinite(amountNumeric)) return null;
        const rounded = Math.round(Math.abs(amountNumeric));
        if (rounded <= 0) return null;
        return {
          mode: data.mode === 'remove' ? 'remove' : 'add',
          amount: String(rounded),
        };
      }
      case 'hpsp': {
        const hpModeValue = data.hpMode === 'set' ? 'set' : 'delta';
        const hpRaw = sanitizeQuickRewardNumericValue(data.hpValue);
        const hpNumeric = Number(hpRaw);
        let hpValue = '';
        if (hpRaw !== '' && Number.isFinite(hpNumeric)) {
          const rounded = Math.round(hpNumeric);
          if (hpModeValue === 'set') {
            hpValue = String(Math.max(0, rounded));
          } else if (rounded !== 0) {
            hpValue = String(rounded);
          }
        }
        const hpTempModeInput = data.hpTempMode === 'set' ? 'set' : data.hpTempMode === 'delta' ? 'delta' : '';
        const hpTempRaw = sanitizeQuickRewardNumericValue(data.hpTempValue);
        const hpTempNumeric = Number(hpTempRaw);
        let hpTempModeValue = '';
        let hpTempValue = '';
        if (hpTempRaw !== '' && Number.isFinite(hpTempNumeric) && hpTempModeInput) {
          const rounded = Math.round(hpTempNumeric);
          if (hpTempModeInput === 'set') {
            hpTempModeValue = 'set';
            hpTempValue = String(Math.max(0, rounded));
          } else if (rounded !== 0) {
            hpTempModeValue = 'delta';
            hpTempValue = String(rounded);
          }
        }
        const spModeValue = data.spMode === 'set' ? 'set' : 'delta';
        const spRaw = sanitizeQuickRewardNumericValue(data.spValue);
        const spNumeric = Number(spRaw);
        let spValue = '';
        if (spRaw !== '' && Number.isFinite(spNumeric)) {
          const rounded = Math.round(spNumeric);
          if (spModeValue === 'set') {
            spValue = String(Math.max(0, rounded));
          } else if (rounded !== 0) {
            spValue = String(rounded);
          }
        }
        const spTempModeInput = data.spTempMode === 'set' ? 'set' : data.spTempMode === 'delta' ? 'delta' : '';
        const spTempRaw = sanitizeQuickRewardNumericValue(data.spTempValue);
        const spTempNumeric = Number(spTempRaw);
        let spTempModeValue = '';
        let spTempValue = '';
        if (spTempRaw !== '' && Number.isFinite(spTempNumeric) && spTempModeInput) {
          const rounded = Math.round(spTempNumeric);
          if (spTempModeInput === 'set') {
            spTempModeValue = 'set';
            spTempValue = String(Math.max(0, rounded));
          } else if (rounded !== 0) {
            spTempModeValue = 'delta';
            spTempValue = String(rounded);
          }
        }
        if (!hpValue && !hpTempValue && !spValue && !spTempValue) return null;
        return {
          hpMode: hpModeValue,
          hpValue,
          hpTempMode: hpTempModeValue,
          hpTempValue,
          spMode: spModeValue,
          spValue,
          spTempMode: spTempModeValue,
          spTempValue,
        };
      }
      case 'resonance': {
        const pointsModeInput = data.pointsMode === 'set' ? 'set' : 'delta';
        const pointsRaw = sanitizeQuickRewardNumericValue(data.pointsValue ?? data.points);
        const pointsNumeric = Number(pointsRaw);
        let pointsModeValue = 'delta';
        let pointsValue = '';
        if (pointsRaw !== '' && Number.isFinite(pointsNumeric)) {
          const rounded = Math.round(pointsNumeric);
          if (pointsModeInput === 'set') {
            pointsModeValue = 'set';
            pointsValue = String(Math.max(0, rounded));
          } else if (rounded !== 0) {
            pointsModeValue = 'delta';
            pointsValue = String(rounded);
          }
        }
        const bankedModeInput = data.bankedMode === 'set' ? 'set' : 'delta';
        const bankedRaw = sanitizeQuickRewardNumericValue(data.bankedValue ?? data.banked);
        const bankedNumeric = Number(bankedRaw);
        let bankedModeValue = 'delta';
        let bankedValue = '';
        if (bankedRaw !== '' && Number.isFinite(bankedNumeric)) {
          const rounded = Math.round(bankedNumeric);
          if (bankedModeInput === 'set') {
            bankedModeValue = 'set';
            bankedValue = String(Math.max(0, rounded));
          } else if (rounded !== 0) {
            bankedModeValue = 'delta';
            bankedValue = String(rounded);
          }
        }
        if (!pointsValue && !bankedValue) return null;
        return {
          pointsMode: pointsModeValue,
          pointsValue,
          bankedMode: bankedModeValue,
          bankedValue,
        };
      }
      case 'faction': {
        const factionId = typeof data.factionId === 'string' ? data.factionId.trim() : '';
        if (!factionId) return null;
        const mode = data.mode === 'set' ? 'set' : 'delta';
        const rawValue = sanitizeQuickRewardNumericValue(data.value);
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return null;
        const rounded = Math.round(numeric);
        if (mode !== 'set' && rounded === 0) return null;
        return {
          factionId,
          mode,
          value: String(rounded),
        };
      }
      default:
        return null;
    }
  }

  function sanitizeQuickRewardPresetEntry(cardId, entry) {
    if (!entry || typeof entry !== 'object') return null;
    const values = sanitizeQuickRewardPresetValues(cardId, entry.values || entry.data || {});
    if (!values) return null;
    const targets = sanitizeQuickRewardTargets(entry.targets || entry.players || []);
    const name = sanitizeQuickRewardPresetName(entry.name, getQuickRewardPresetLabel(cardId));
    const id = typeof entry.id === 'string' && entry.id ? entry.id : createQuickRewardPresetId();
    return { id, name, targets, values };
  }

  function cloneQuickRewardPresetEntry(entry) {
    if (!entry) return null;
    return {
      id: entry.id,
      name: entry.name,
      targets: Array.isArray(entry.targets) ? [...entry.targets] : [],
      values: entry.values && typeof entry.values === 'object' ? { ...entry.values } : {},
    };
  }

  function persistQuickRewardPresetState() {
    if (typeof localStorage === 'undefined') return;
    const payload = { version: QUICK_REWARD_PRESET_VERSION, cards: {} };
    let hasAny = false;
    QUICK_REWARD_CARD_IDS.forEach(cardId => {
      const list = quickRewardPresetState.get(cardId) || [];
      if (list.length) {
        payload.cards[cardId] = list.map(entry => cloneQuickRewardPresetEntry(entry));
        hasAny = true;
      }
    });
    try {
      if (hasAny) {
        localStorage.setItem(QUICK_REWARD_PRESETS_STORAGE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(QUICK_REWARD_PRESETS_STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to persist quick reward presets', err);
    }
  }

  function loadQuickRewardPresetsFromStorage() {
    QUICK_REWARD_CARD_IDS.forEach(cardId => {
      quickRewardPresetState.set(cardId, []);
    });
    if (typeof localStorage === 'undefined') return;
    let raw;
    try {
      raw = localStorage.getItem(QUICK_REWARD_PRESETS_STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    let container = null;
    if (parsed && typeof parsed === 'object') {
      if (parsed.cards && typeof parsed.cards === 'object') {
        container = parsed.cards;
      } else if (parsed.presets && typeof parsed.presets === 'object') {
        container = parsed.presets;
      } else {
        container = parsed;
      }
    }
    if (!container || typeof container !== 'object') return;
    QUICK_REWARD_CARD_IDS.forEach(cardId => {
      const list = Array.isArray(container[cardId]) ? container[cardId] : [];
      const sanitized = list
        .map(entry => sanitizeQuickRewardPresetEntry(cardId, entry))
        .filter(Boolean)
        .slice(0, QUICK_REWARD_PRESET_LIMIT);
      quickRewardPresetState.set(cardId, sanitized);
    });
  }

  function updateQuickRewardPresetControls(cardId) {
    const config = quickRewardPresetConfig[cardId];
    if (!config) return;
    const presets = quickRewardPresetState.get(cardId) || [];
    const pending = config.form?.dataset?.pending === 'true';
    if (config.select) {
      config.select.disabled = pending || presets.length === 0;
    }
    if (config.saveBtn) {
      config.saveBtn.disabled = pending;
    }
    if (config.deleteBtn) {
      const hasSelection = !!(config.select && config.select.value);
      config.deleteBtn.disabled = pending || !hasSelection;
    }
  }

  function updateAllQuickRewardPresetControls() {
    QUICK_REWARD_CARD_IDS.forEach(updateQuickRewardPresetControls);
  }

  function renderQuickRewardPresetOptions(cardId, { selectedId } = {}) {
    const config = quickRewardPresetConfig[cardId];
    if (!config?.select) {
      updateQuickRewardPresetControls(cardId);
      return;
    }
    const select = config.select;
    const presets = quickRewardPresetState.get(cardId) || [];
    const previousValue = typeof selectedId === 'string' ? selectedId : select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Load preset…';
    select.appendChild(placeholder);
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name;
      select.appendChild(option);
    });
    if (presets.some(entry => entry.id === previousValue)) {
      select.value = previousValue;
    } else {
      select.value = '';
    }
    updateQuickRewardPresetControls(cardId);
  }

  function refreshQuickRewardPresets({ maintainSelection = false } = {}) {
    const selections = new Map();
    if (maintainSelection) {
      QUICK_REWARD_CARD_IDS.forEach(cardId => {
        const select = quickRewardPresetConfig[cardId]?.select;
        if (select && select.value) {
          selections.set(cardId, select.value);
        }
      });
    }
    loadQuickRewardPresetsFromStorage();
    QUICK_REWARD_CARD_IDS.forEach(cardId => {
      const selectedId = maintainSelection ? selections.get(cardId) : undefined;
      renderQuickRewardPresetOptions(cardId, { selectedId });
    });
    updateAllQuickRewardPresetControls();
  }

  function buildQuickRewardPresetSnapshot(cardId) {
    const targets = sanitizeQuickRewardTargets(getRewardTarget());
    if (cardId === 'xp') {
      const amountRaw = sanitizeQuickRewardNumericValue(quickXpAmount?.value ?? '');
      const numeric = Number(amountRaw);
      if (!Number.isFinite(numeric) || Math.round(Math.abs(numeric)) <= 0) {
        reportRewardError('Set an XP amount greater than zero before saving a preset');
        return null;
      }
      return {
        targets,
        values: {
          mode: quickXpMode?.value === 'remove' ? 'remove' : 'add',
          amount: String(Math.round(Math.abs(numeric))),
        },
      };
    }
    if (cardId === 'hpsp') {
      const hpModeValue = quickHpMode?.value === 'set' ? 'set' : 'delta';
      const hpRaw = sanitizeQuickRewardNumericValue(quickHpValue?.value ?? '');
      const hpNumeric = Number(hpRaw);
      let hpValue = '';
      if (hpRaw !== '' && Number.isFinite(hpNumeric)) {
        const rounded = Math.round(hpNumeric);
        if (hpModeValue === 'set') {
          hpValue = String(Math.max(0, rounded));
        } else if (rounded !== 0) {
          hpValue = String(rounded);
        }
      }
      const hpTempModeInput = quickHpTempMode?.value === 'set' ? 'set' : quickHpTempMode?.value === 'delta' ? 'delta' : '';
      const hpTempRaw = sanitizeQuickRewardNumericValue(quickHpTemp?.value ?? '');
      const hpTempNumeric = Number(hpTempRaw);
      let hpTempModeValue = '';
      let hpTempValue = '';
      if (hpTempRaw !== '' && Number.isFinite(hpTempNumeric) && hpTempModeInput) {
        const rounded = Math.round(hpTempNumeric);
        if (hpTempModeInput === 'set') {
          hpTempModeValue = 'set';
          hpTempValue = String(Math.max(0, rounded));
        } else if (rounded !== 0) {
          hpTempModeValue = 'delta';
          hpTempValue = String(rounded);
        }
      }
      const spModeValue = quickSpMode?.value === 'set' ? 'set' : 'delta';
      const spRaw = sanitizeQuickRewardNumericValue(quickSpValue?.value ?? '');
      const spNumeric = Number(spRaw);
      let spValue = '';
      if (spRaw !== '' && Number.isFinite(spNumeric)) {
        const rounded = Math.round(spNumeric);
        if (spModeValue === 'set') {
          spValue = String(Math.max(0, rounded));
        } else if (rounded !== 0) {
          spValue = String(rounded);
        }
      }
      const spTempModeInput = quickSpTempMode?.value === 'set' ? 'set' : quickSpTempMode?.value === 'delta' ? 'delta' : '';
      const spTempRaw = sanitizeQuickRewardNumericValue(quickSpTemp?.value ?? '');
      const spTempNumeric = Number(spTempRaw);
      let spTempModeValue = '';
      let spTempValue = '';
      if (spTempRaw !== '' && Number.isFinite(spTempNumeric) && spTempModeInput) {
        const rounded = Math.round(spTempNumeric);
        if (spTempModeInput === 'set') {
          spTempModeValue = 'set';
          spTempValue = String(Math.max(0, rounded));
        } else if (rounded !== 0) {
          spTempModeValue = 'delta';
          spTempValue = String(rounded);
        }
      }
      if (!hpValue && !hpTempValue && !spValue && !spTempValue) {
        reportRewardError('Set at least one HP or SP change before saving a preset');
        return null;
      }
      return {
        targets,
        values: {
          hpMode: hpModeValue,
          hpValue,
          hpTempMode: hpTempModeValue,
          hpTempValue,
          spMode: spModeValue,
          spValue,
          spTempMode: spTempModeValue,
          spTempValue,
        },
      };
    }
    if (cardId === 'resonance') {
      const pointsModeInput = quickResonancePointsMode?.value === 'set' ? 'set' : 'delta';
      const pointsRaw = sanitizeQuickRewardNumericValue(quickResonancePoints?.value ?? '');
      const pointsNumeric = Number(pointsRaw);
      let pointsModeValue = 'delta';
      let pointsValue = '';
      if (pointsRaw !== '' && Number.isFinite(pointsNumeric)) {
        const rounded = Math.round(pointsNumeric);
        if (pointsModeInput === 'set') {
          pointsModeValue = 'set';
          pointsValue = String(Math.max(0, rounded));
        } else if (rounded !== 0) {
          pointsModeValue = 'delta';
          pointsValue = String(rounded);
        }
      }
      const bankedModeInput = quickResonanceBankedMode?.value === 'set' ? 'set' : 'delta';
      const bankedRaw = sanitizeQuickRewardNumericValue(quickResonanceBanked?.value ?? '');
      const bankedNumeric = Number(bankedRaw);
      let bankedModeValue = 'delta';
      let bankedValue = '';
      if (bankedRaw !== '' && Number.isFinite(bankedNumeric)) {
        const rounded = Math.round(bankedNumeric);
        if (bankedModeInput === 'set') {
          bankedModeValue = 'set';
          bankedValue = String(Math.max(0, rounded));
        } else if (rounded !== 0) {
          bankedModeValue = 'delta';
          bankedValue = String(rounded);
        }
      }
      if (!pointsValue && !bankedValue) {
        reportRewardError('Enter a resonance change before saving a preset');
        return null;
      }
      return {
        targets,
        values: {
          pointsMode: pointsModeValue,
          pointsValue,
          bankedMode: bankedModeValue,
          bankedValue,
        },
      };
    }
    if (cardId === 'faction') {
      const factionId = typeof quickFactionSelect?.value === 'string' ? quickFactionSelect.value.trim() : '';
      if (!factionId) {
        reportRewardError('Select a faction before saving a preset');
        return null;
      }
      const mode = quickFactionMode?.value === 'set' ? 'set' : 'delta';
      const rawValue = sanitizeQuickRewardNumericValue(quickFactionValue?.value ?? '');
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        reportRewardError('Enter a valid reputation amount before saving a preset');
        return null;
      }
      const rounded = Math.round(numeric);
      if (mode !== 'set' && rounded === 0) {
        reportRewardError('Enter a non-zero reputation adjustment before saving a preset');
        return null;
      }
      return {
        targets,
        values: {
          factionId,
          mode,
          value: String(rounded),
        },
      };
    }
    return null;
  }

  function applyQuickRewardPresetValues(cardId, values) {
    if (!values || typeof values !== 'object') return;
    switch (cardId) {
      case 'xp':
        if (quickXpMode) quickXpMode.value = values.mode === 'remove' ? 'remove' : 'add';
        if (quickXpAmount) quickXpAmount.value = typeof values.amount === 'string' ? values.amount : '';
        break;
      case 'hpsp':
        if (quickHpMode) quickHpMode.value = values.hpMode === 'set' ? 'set' : 'delta';
        if (quickHpValue) quickHpValue.value = typeof values.hpValue === 'string' ? values.hpValue : '';
        if (quickHpTempMode) quickHpTempMode.value = values.hpTempMode === 'set' ? 'set' : values.hpTempMode === 'delta' ? 'delta' : '';
        if (quickHpTemp) quickHpTemp.value = typeof values.hpTempValue === 'string' ? values.hpTempValue : '';
        if (quickSpMode) quickSpMode.value = values.spMode === 'set' ? 'set' : 'delta';
        if (quickSpValue) quickSpValue.value = typeof values.spValue === 'string' ? values.spValue : '';
        if (quickSpTempMode) quickSpTempMode.value = values.spTempMode === 'set' ? 'set' : values.spTempMode === 'delta' ? 'delta' : '';
        if (quickSpTemp) quickSpTemp.value = typeof values.spTempValue === 'string' ? values.spTempValue : '';
        break;
      case 'resonance':
        if (quickResonancePointsMode) quickResonancePointsMode.value = values.pointsMode === 'set' ? 'set' : 'delta';
        if (quickResonancePoints) quickResonancePoints.value = typeof values.pointsValue === 'string' ? values.pointsValue : '';
        if (quickResonanceBankedMode) quickResonanceBankedMode.value = values.bankedMode === 'set' ? 'set' : 'delta';
        if (quickResonanceBanked) quickResonanceBanked.value = typeof values.bankedValue === 'string' ? values.bankedValue : '';
        break;
      case 'faction':
        if (quickFactionSelect) {
          const desired = typeof values.factionId === 'string' ? values.factionId : '';
          const option = desired
            ? Array.from(quickFactionSelect.options || []).find(opt => opt.value === desired)
            : null;
          quickFactionSelect.value = option ? desired : '';
        }
        if (quickFactionMode) quickFactionMode.value = values.mode === 'set' ? 'set' : 'delta';
        if (quickFactionValue) quickFactionValue.value = typeof values.value === 'string' ? values.value : '';
        break;
      default:
        break;
    }
  }

  function applyQuickRewardTargets(targets) {
    if (!quickRewardTargetSelect) return { missing: [], hadOptions: false };
    const sanitized = sanitizeQuickRewardTargets(targets);
    const optionMap = new Map();
    Array.from(quickRewardTargetSelect.options || []).forEach(option => {
      if (typeof option.value === 'string' && option.value) {
        optionMap.set(option.value, option);
      }
    });
    const desired = new Set();
    const missing = [];
    sanitized.forEach(name => {
      if (optionMap.has(name)) {
        desired.add(name);
      } else {
        missing.push(name);
      }
    });
    optionMap.forEach((option, value) => {
      option.selected = desired.has(value);
    });
    if (!desired.size) {
      quickRewardTargetSelect.selectedIndex = -1;
    }
    let dispatched = false;
    try {
      dispatched = quickRewardTargetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      updateQuickRewardFormsState();
    }
    if (!dispatched) {
      updateQuickRewardFormsState();
    }
    return { missing, hadOptions: optionMap.size > 0 };
  }

  function applyQuickRewardPreset(cardId, preset) {
    if (!preset) return;
    const label = getQuickRewardPresetLabel(cardId);
    const { missing, hadOptions } = applyQuickRewardTargets(preset.targets);
    applyQuickRewardPresetValues(cardId, preset.values);
    updateQuickRewardFormsState();
    toast(`Loaded ${label} preset "${preset.name}"`, 'info');
    if (hadOptions && missing.length) {
      toast('Some preset recipients are unavailable', 'info');
      console.info('Missing preset recipients:', missing);
    }
  }

  function handleQuickRewardPresetSave(cardId) {
    const config = quickRewardPresetConfig[cardId];
    if (!config) return;
    if (config.form?.dataset?.pending === 'true') return;
    const snapshot = buildQuickRewardPresetSnapshot(cardId);
    if (!snapshot) return;
    const label = getQuickRewardPresetLabel(cardId);
    const existing = quickRewardPresetState.get(cardId) || [];
    const defaultName = `${label} preset ${existing.length + 1}`;
    const input = typeof prompt === 'function' ? prompt('Name this preset', defaultName) : defaultName;
    if (input == null) return;
    const name = sanitizeQuickRewardPresetName(input, defaultName);
    if (!name) {
      toast('Preset name cannot be empty', 'error');
      return;
    }
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast('Preset name cannot be empty', 'error');
      return;
    }
    const newPreset = {
      id: createQuickRewardPresetId(),
      name: normalizedName,
      targets: snapshot.targets,
      values: snapshot.values,
    };
    const next = [
      newPreset,
      ...existing.filter(entry => entry.name.toLowerCase() !== normalizedName.toLowerCase()),
    ].slice(0, QUICK_REWARD_PRESET_LIMIT);
    quickRewardPresetState.set(cardId, next);
    persistQuickRewardPresetState();
    renderQuickRewardPresetOptions(cardId, { selectedId: newPreset.id });
    toast(`Saved ${label} preset "${normalizedName}"`, 'success');
  }

  function handleQuickRewardPresetDelete(cardId) {
    const config = quickRewardPresetConfig[cardId];
    if (!config?.select) return;
    const presetId = config.select.value;
    if (!presetId) return;
    const presets = quickRewardPresetState.get(cardId) || [];
    const preset = presets.find(entry => entry.id === presetId);
    if (!preset) {
      renderQuickRewardPresetOptions(cardId);
      return;
    }
    const label = getQuickRewardPresetLabel(cardId);
    const confirmed = typeof confirm === 'function'
      ? confirm(`Delete ${label} preset "${preset.name}"?`)
      : true;
    if (!confirmed) return;
    const remaining = presets.filter(entry => entry.id !== presetId);
    quickRewardPresetState.set(cardId, remaining);
    persistQuickRewardPresetState();
    renderQuickRewardPresetOptions(cardId);
    if (config.select) config.select.value = '';
    updateQuickRewardPresetControls(cardId);
    toast(`Deleted ${label} preset "${preset.name}"`, 'info');
  }

  function handleQuickRewardPresetSelection(cardId) {
    const config = quickRewardPresetConfig[cardId];
    if (!config?.select) return;
    const presetId = config.select.value;
    if (!presetId) {
      updateQuickRewardPresetControls(cardId);
      return;
    }
    const presets = quickRewardPresetState.get(cardId) || [];
    const preset = presets.find(entry => entry.id === presetId);
    if (!preset) {
      renderQuickRewardPresetOptions(cardId);
      return;
    }
    applyQuickRewardPreset(cardId, preset);
    updateQuickRewardPresetControls(cardId);
  }

  refreshQuickRewardPresets();

  function setRewardFormPending(form, pending) {
    if (!form) return;
    form.dataset.pending = pending ? 'true' : 'false';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      if (pending) {
        if (!submit.dataset.originalLabel) {
          submit.dataset.originalLabel = submit.textContent || submit.value || 'Submit';
        }
        submit.textContent = 'Sending…';
        submit.disabled = true;
      } else {
        const original = submit.dataset.originalLabel;
        if (original) {
          submit.textContent = original;
        }
        submit.disabled = false;
        delete submit.dataset.originalLabel;
        updateQuickRewardFormsState();
      }
    }
    const cardId = quickRewardPresetFormLookup.get(form);
    if (cardId) {
      updateQuickRewardPresetControls(cardId);
    }
  }

  function focusQuickRewardTarget() {
    if (!quickRewardTargetSelect || quickRewardTargetSelect.disabled) return false;
    try {
      quickRewardTargetSelect.focus({ preventScroll: true });
    } catch {
      try {
        quickRewardTargetSelect.focus();
      } catch {
        return false;
      }
    }
    return document.activeElement === quickRewardTargetSelect;
  }

  async function loadRewardRoster() {
    try {
      const names = await listCharacters();
      const seen = new Set();
      return names
        .filter(name => {
          if (typeof name !== 'string') return false;
          const trimmed = name.trim();
          if (!trimmed || trimmed === 'The DM') return false;
          if (seen.has(trimmed)) return false;
          seen.add(trimmed);
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
    } catch (err) {
      console.error('Failed to load character roster', err);
      toast('Unable to load players', 'error');
      return [];
    }
  }

  async function refreshCreditAccounts({ preserveSelection = true, roster: rosterInput = null } = {}) {
    if (!creditAccountSelect) return Array.isArray(rosterInput) ? rosterInput : [];
    const previous = preserveSelection ? creditAccountSelect.value : '';
    creditAccountSelect.disabled = true;
    creditAccountSelect.innerHTML = '<option value="">Loading players…</option>';
    applyCreditAccountSelection();
    updateCreditSubmitState();
    let roster = Array.isArray(rosterInput) ? [...rosterInput] : null;
    try {
      if (!roster) {
        roster = await loadRewardRoster();
      }
      creditAccountSelect.innerHTML = '';
      if (!roster.length) {
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'No players available';
        none.disabled = true;
        creditAccountSelect.appendChild(none);
        creditAccountSelect.value = '';
        creditAccountSelect.disabled = true;
        applyCreditAccountSelection();
        updateCreditSubmitState();
        return roster;
      }
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a player';
      creditAccountSelect.appendChild(placeholder);
      roster.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        const accountNumber = computeCreditAccountNumber(name);
        option.dataset.accountNumber = accountNumber;
        option.textContent = `${name} — ${accountNumber}`;
        creditAccountSelect.appendChild(option);
      });
      creditAccountSelect.disabled = false;
      if (previous && roster.includes(previous)) {
        creditAccountSelect.value = previous;
      } else {
        creditAccountSelect.value = '';
      }
      applyCreditAccountSelection();
      updateCreditSubmitState();
      return roster;
    } catch (err) {
      console.error('Failed to load characters for credit tool', err);
      creditAccountSelect.innerHTML = '<option value="">Unable to load players</option>';
      creditAccountSelect.value = '';
      creditAccountSelect.disabled = true;
      applyCreditAccountSelection();
      updateCreditSubmitState();
      toast('Unable to load players', 'error');
      return Array.isArray(roster) ? roster : [];
    }
  }

  async function refreshQuickRewardTargets({ preserveSelection = true, roster: rosterInput = null } = {}) {
    if (!quickRewardTargetSelect) return Array.isArray(rosterInput) ? rosterInput : [];
    const previousSelection = preserveSelection ? new Set(getRewardTarget()) : new Set();
    quickRewardTargetSelect.disabled = true;
    quickRewardTargetSelect.innerHTML = '<option value="">Loading players…</option>';
    let roster = Array.isArray(rosterInput) ? [...rosterInput] : null;
    try {
      if (!roster) {
        roster = await loadRewardRoster();
      }
      quickRewardTargetSelect.innerHTML = '';
      if (!roster.length) {
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'No players available';
        none.disabled = true;
        none.selected = true;
        quickRewardTargetSelect.appendChild(none);
        quickRewardTargetSelect.disabled = true;
        updateQuickRewardFormsState();
        return roster;
      }
      let hasSelection = false;
      roster.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (previousSelection.has(name)) {
          option.selected = true;
          hasSelection = true;
        }
        quickRewardTargetSelect.appendChild(option);
      });
      if (!hasSelection) {
        quickRewardTargetSelect.selectedIndex = -1;
      }
      quickRewardTargetSelect.disabled = false;
      updateQuickRewardFormsState();
      return roster;
    } catch (err) {
      console.error('Failed to load characters for quick rewards', err);
      quickRewardTargetSelect.innerHTML = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Unable to load players';
      option.disabled = true;
      option.selected = true;
      quickRewardTargetSelect.appendChild(option);
      quickRewardTargetSelect.disabled = true;
      updateQuickRewardFormsState();
      toast('Unable to load players', 'error');
      return Array.isArray(roster) ? roster : [];
    }
  }

  function populateFactionOptions() {
    if (!quickFactionSelect) return;
    const previous = quickFactionSelect.value;
    const placeholderLabel = quickFactionSelect.querySelector('option[value=""]')?.textContent || 'Select a faction';
    quickFactionSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = placeholderLabel;
    quickFactionSelect.appendChild(placeholder);
    const seen = new Set();
    FACTIONS.forEach(faction => {
      if (!faction || typeof faction.id !== 'string' || !faction.id) return;
      if (seen.has(faction.id)) return;
      seen.add(faction.id);
      const option = document.createElement('option');
      option.value = faction.id;
      option.textContent = faction.name || faction.id;
      quickFactionSelect.appendChild(option);
    });
    if (previous && seen.has(previous)) {
      quickFactionSelect.value = previous;
    }
  }

  function captureCreditTimestamp() {
    if (!creditCard) return;
    const now = new Date();
    if (creditFooterDate) creditFooterDate.textContent = creditFormatDate(now);
    if (creditFooterTime) creditFooterTime.textContent = creditFormatTime(now);
    creditCard.setAttribute('data-timestamp', now.toISOString());
  }

  function generateCreditReference(senderId) {
    const map = { OMNI: 'OMNI', PFV: 'PFV', GREY: 'GREY', ANON: 'ANON' };
    const prefix = map[senderId] || (senderId || 'DM').toUpperCase();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(Math.random() * 900000) + 100000;
    return `TXN-${prefix}-${datePart}-${randomPart}`;
  }

  function generateCreditTxid(senderId) {
    const map = { OMNI: 'OMNI', PFV: 'PFV', GREY: 'GREY', ANON: 'ANON' };
    const prefix = map[senderId] || (senderId || 'DM').toUpperCase();
    const randomPart = Math.floor(Math.random() * 90000000) + 10000000;
    return `ID-${prefix}-${randomPart}`;
  }

  function updateCreditSenderDataset() {
    if (!creditCard) return;
    creditCard.setAttribute('data-sender', creditSenderSelect?.value || '');
  }

  function randomizeCreditIdentifiers() {
    if (!creditCard) return;
    const senderId = creditSenderSelect?.value || '';
    const ref = generateCreditReference(senderId);
    const txId = generateCreditTxid(senderId);
    if (creditRef) creditRef.textContent = ref;
    if (creditTxid) creditTxid.textContent = txId;
    creditCard.setAttribute('data-ref', ref);
    creditCard.setAttribute('data-txid', txId);
  }

  function getCreditSenderLabel() {
    const option = creditSenderSelect?.selectedOptions?.[0];
    if (option && option.textContent) return option.textContent.trim();
    if (creditSenderSelect && creditSenderSelect.value) return creditSenderSelect.value;
    return 'DM';
  }

  function getCreditDebitState() {
    if (!creditCard) return '';
    return creditCard.getAttribute('data-debit-state') || '';
  }

  function setCreditDebitState(state) {
    if (!creditCard) return;
    if (!state) {
      creditCard.removeAttribute('data-debit-state');
      return;
    }
    creditCard.setAttribute('data-debit-state', state);
  }

  function updateCreditTransactionType() {
    if (!creditCard) return;
    const type = creditTxnType?.value || 'Deposit';
    creditCard.setAttribute('data-transaction-type', type);
    if (creditStatus) {
      if (type === 'Debit') {
        let debitState = getCreditDebitState();
        if (!debitState) {
          debitState = 'pending';
          setCreditDebitState(debitState);
        }
        const isCompleted = debitState === 'completed';
        creditStatus.textContent = isCompleted ? 'Debit Completed' : 'Debit Pending';
        creditStatus.classList.toggle('dm-credit__status--debit', !isCompleted);
      } else {
        setCreditDebitState('');
        creditStatus.textContent = 'Completed';
        creditStatus.classList.remove('dm-credit__status--debit');
      }
    }
  }

  function resetCreditForm({ preserveAccount = true } = {}) {
    if (!preserveAccount && creditAccountSelect) {
      creditAccountSelect.value = '';
    }
    applyCreditAccountSelection();
    if (creditAmountInput) {
      creditAmountInput.value = formatCreditAmountDisplay(0);
    }
    updateCreditCardAmountDisplay(0);
    if (creditSubmit) {
      creditSubmit.textContent = 'Submit';
      creditSubmit.disabled = true;
    }
    updateCreditSenderDataset();
    setCreditDebitState('');
    updateCreditTransactionType();
    captureCreditTimestamp();
    randomizeCreditIdentifiers();
    if (creditMemoInput) {
      creditMemoInput.value = '';
    }
    updateCreditMemoPreview('');
    if (creditCard) {
      creditCard.removeAttribute('data-submitted');
      creditCard.removeAttribute('data-submitted-at');
    }
    updateCreditSubmitState();
  }

  function parseStoredCredits(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : 0;
    }
    return 0;
  }

  function createRewardLogEntry(prefix, timestamp, title, text) {
    return {
      id: `${prefix}-${timestamp}-${Math.floor(Math.random() * 1e6)}`,
      t: timestamp,
      name: title,
      text,
    };
  }

  async function executeRewardTransaction({ player, operations = [] } = {}) {
    const target = typeof player === 'string' ? player.trim() : '';
    if (!target) throw new Error('Select a player to target');
    const normalizedOps = Array.isArray(operations)
      ? operations.filter(op => op && typeof op.type === 'string')
      : [];
    if (!normalizedOps.length) throw new Error('No reward operations specified');
    const save = await loadCharacter(target, { bypassPin: true });
    const now = Date.now();
    const timestampIso = new Date(now).toISOString();
    const logEntries = [];
    const postSaveActions = [];
    const notifications = [];
    const results = {};
    let applied = false;

    const ensureCampaignLog = () => {
      if (!Array.isArray(save.campaignLog)) {
        save.campaignLog = [];
      }
    };

    normalizedOps.forEach(op => {
      switch (op.type) {
        case 'credits': {
          const amount = Number(op.amount);
          if (!Number.isFinite(amount) || amount <= 0) break;
          const transactionType = op.transactionType === 'Debit' ? 'Debit' : 'Deposit';
          const delta = transactionType === 'Debit' ? -Math.abs(amount) : Math.abs(amount);
          const currentCredits = parseStoredCredits(save?.credits);
          const nextTotal = Math.max(0, Math.round((currentCredits + delta) * 100) / 100);
          save.credits = Number.isInteger(nextTotal) ? String(nextTotal) : nextTotal.toFixed(2);
          applied = true;
          const senderLabel = typeof op.senderLabel === 'string' && op.senderLabel
            ? op.senderLabel
            : (typeof op.sender === 'string' && op.sender ? op.sender : 'DM');
          const memo = sanitizeCreditMemo(op.memo || '');
          const summaryParts = [`${transactionType === 'Debit' ? 'Debited' : 'Deposited'} ₡${formatCreditAmountDisplay(Math.abs(delta))} ${transactionType === 'Debit' ? 'from' : 'to'} ${target}.`];
          if (memo) summaryParts.push(`Memo: ${memo.replace(/\s*\n\s*/g, ' ').trim()}`);
          const summary = summaryParts.join(' ');
          logEntries.push(createRewardLogEntry('dm-credit', now, 'DM Credit Transfer', summary));
          notifications.push(summary);
          toast(summary, transactionType === 'Debit' ? 'info' : 'success');
          const accountNumber = typeof op.accountNumber === 'string' && op.accountNumber
            ? op.accountNumber
            : computeCreditAccountNumber(target);
          const refValue = typeof op.ref === 'string' ? op.ref : '';
          const txidValue = typeof op.txid === 'string' ? op.txid : '';
          postSaveActions.push(() => broadcastPlayerCreditUpdate({
            account: accountNumber,
            amount: delta,
            type: transactionType,
            sender: senderLabel,
            ref: refValue,
            txid: txidValue,
            timestamp: timestampIso,
            player: target,
            memo,
          }));
          results.credits = {
            total: nextTotal,
            delta,
            transactionType,
            sender: senderLabel,
            memo,
            account: accountNumber,
            ref: refValue,
            txid: txidValue,
          };
          break;
        }
        case 'xp': {
          const amount = Number(op.amount);
          if (!Number.isFinite(amount) || Math.trunc(amount) === 0) break;
          const delta = Math.trunc(amount);
          const currentXp = parseCatalogInteger(save?.xp, 0);
          let nextXp = currentXp + delta;
          if (nextXp < 0) nextXp = 0;
          save.xp = String(nextXp);
          applied = true;
          const summary = `${delta >= 0 ? 'Granted' : 'Removed'} ${Math.abs(delta).toLocaleString()} XP (Total: ${nextXp.toLocaleString()})`;
          logEntries.push(createRewardLogEntry('dm-xp', now, 'DM XP Reward', summary));
          notifications.push(summary);
          toast(summary, delta >= 0 ? 'success' : 'info');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'xp',
            message: summary,
            timestamp: timestampIso,
            data: { delta, total: nextXp },
          }));
          results.xp = { total: nextXp, delta };
          break;
        }
        case 'hp': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const prevCurrentRaw = Number(save?.['hp-bar']);
          const prevCurrent = Number.isFinite(prevCurrentRaw) ? prevCurrentRaw : 0;
          const prevTempRaw = Number(save?.['hp-temp']);
          const prevTemp = Number.isFinite(prevTempRaw) ? prevTempRaw : 0;
          let nextCurrent = prevCurrent;
          if (Number.isFinite(data.delta)) nextCurrent = prevCurrent + Number(data.delta);
          if (Number.isFinite(data.value)) nextCurrent = Number(data.value);
          nextCurrent = Math.max(0, Math.round(nextCurrent));
          let nextTemp = prevTemp;
          if (Number.isFinite(data.tempDelta)) nextTemp = prevTemp + Number(data.tempDelta);
          if (Number.isFinite(data.tempValue)) nextTemp = Number(data.tempValue);
          nextTemp = Math.max(0, Math.round(nextTemp));
          if (nextCurrent === prevCurrent && nextTemp === prevTemp) break;
          save['hp-bar'] = nextCurrent;
          save['hp-temp'] = nextTemp;
          applied = true;
          const label = typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'HP';
          const summaryParts = [`${label}: ${nextCurrent}`];
          if (nextTemp > 0) summaryParts.push(`Temp +${nextTemp}`);
          const summary = summaryParts.join(' · ');
          logEntries.push(createRewardLogEntry('dm-hp', now, 'DM HP Update', summary));
          notifications.push(summary);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'hp',
            message: summary,
            timestamp: timestampIso,
            data: { current: nextCurrent, temp: nextTemp },
          }));
          results.hp = { current: nextCurrent, temp: nextTemp };
          break;
        }
        case 'sp': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const prevCurrentRaw = Number(save?.['sp-bar']);
          const prevCurrent = Number.isFinite(prevCurrentRaw) ? prevCurrentRaw : 0;
          const prevTempRaw = Number(save?.['sp-temp']);
          const prevTemp = Number.isFinite(prevTempRaw) ? prevTempRaw : 0;
          let nextCurrent = prevCurrent;
          if (Number.isFinite(data.delta)) nextCurrent = prevCurrent + Number(data.delta);
          if (Number.isFinite(data.value)) nextCurrent = Number(data.value);
          nextCurrent = Math.max(0, Math.round(nextCurrent));
          let nextTemp = prevTemp;
          if (Number.isFinite(data.tempDelta)) nextTemp = prevTemp + Number(data.tempDelta);
          if (Number.isFinite(data.tempValue)) nextTemp = Number(data.tempValue);
          nextTemp = Math.max(0, Math.round(nextTemp));
          if (nextCurrent === prevCurrent && nextTemp === prevTemp) break;
          save['sp-bar'] = nextCurrent;
          save['sp-temp'] = nextTemp;
          applied = true;
          const label = typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'SP';
          const summaryParts = [`${label}: ${nextCurrent}`];
          if (nextTemp > 0) summaryParts.push(`Temp +${nextTemp}`);
          const summary = summaryParts.join(' · ');
          logEntries.push(createRewardLogEntry('dm-sp', now, 'DM SP Update', summary));
          notifications.push(summary);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'sp',
            message: summary,
            timestamp: timestampIso,
            data: { current: nextCurrent, temp: nextTemp },
          }));
          results.sp = { current: nextCurrent, temp: nextTemp };
          break;
        }
        case 'resonance': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const partials = save.partials && typeof save.partials === 'object' ? save.partials : {};
          const existingRes = partials.resonance && typeof partials.resonance === 'object' ? partials.resonance : {};
          let points = Number(existingRes.resonancePoints);
          if (!Number.isFinite(points)) points = 0;
          if (Number.isFinite(data.pointsDelta)) points += Number(data.pointsDelta);
          if (Number.isFinite(data.points)) points = Number(data.points);
          points = Math.max(0, Math.min(4, Math.round(points)));
          let banked = Number(existingRes.resonanceBanked);
          if (!Number.isFinite(banked)) banked = 0;
          if (Number.isFinite(data.bankedDelta)) banked += Number(data.bankedDelta);
          if (Number.isFinite(data.banked)) banked = Number(data.banked);
          banked = Math.max(0, Math.round(banked));
          const surgePrev = existingRes.resonanceSurge && typeof existingRes.resonanceSurge === 'object'
            ? existingRes.resonanceSurge
            : {};
          const surgeData = data.surge && typeof data.surge === 'object' ? data.surge : {};
          const surge = {
            active: typeof surgeData.active === 'boolean' ? surgeData.active : !!surgePrev.active,
            startedAt: surgeData.startedAt !== undefined ? surgeData.startedAt : (surgePrev.startedAt ?? null),
            mode: typeof surgeData.mode === 'string' ? surgeData.mode : (surgePrev.mode || 'encounter'),
            endsAt: surgeData.endsAt !== undefined ? surgeData.endsAt : (surgePrev.endsAt ?? null),
            aftermathPending: typeof surgeData.aftermathPending === 'boolean' ? surgeData.aftermathPending : !!surgePrev.aftermathPending,
          };
          const nextPenalty = typeof data.nextCombatRegenPenalty === 'boolean'
            ? data.nextCombatRegenPenalty
            : !!existingRes.resonanceNextCombatRegenPenalty;
          partials.resonance = {
            resonancePoints: points,
            resonanceBanked: banked,
            resonanceSurge: surge,
            resonanceNextCombatRegenPenalty: nextPenalty,
          };
          save.partials = partials;
          applied = true;
          const summary = `RP set to ${points} (Banked ${banked})`;
          logEntries.push(createRewardLogEntry('dm-resonance', now, 'DM Resonance Update', summary));
          notifications.push(summary);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'resonance',
            message: summary,
            timestamp: timestampIso,
            data: partials.resonance,
          }));
          results.resonance = { points, banked, surge, nextCombatRegenPenalty: nextPenalty };
          break;
        }
        case 'faction': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const factionId = typeof data.factionId === 'string' ? data.factionId.trim() : '';
          if (!factionId) throw new Error('Faction ID is required');
          const faction = FACTION_LOOKUP.get(factionId);
          if (!faction) throw new Error(`Unknown faction: ${factionId}`);
          const valueKey = `${faction.id}-rep`;
          const progressKey = `${faction.id}-rep-bar`;
          const partials = save.partials && typeof save.partials === 'object' ? save.partials : {};
          const factions = partials.factions && typeof partials.factions === 'object' ? { ...partials.factions } : {};
          const existing = factions[factionId] && typeof factions[factionId] === 'object' ? factions[factionId] : {};
          const name = faction.name || existing.name || (FACTION_NAME_MAP && FACTION_NAME_MAP[factionId]) || factionId;
          const prevRaw = save?.[valueKey] ?? existing.value ?? existing.score ?? existing.rep ?? existing.amount;
          let previous = Number(prevRaw);
          if (!Number.isFinite(previous)) {
            previous = typeof faction.defaultValue === 'number' ? faction.defaultValue : 0;
          }
          if (!Number.isFinite(previous)) {
            previous = typeof faction.min === 'number' ? faction.min : 0;
          }
          previous = Math.round(faction.clamp(previous));
          const valueNumber = Number(data.value);
          const deltaNumber = Number(data.delta);
          const hasValue = Number.isFinite(valueNumber);
          const hasDelta = Number.isFinite(deltaNumber);
          if (!hasValue && !hasDelta) throw new Error('Invalid faction reputation change');
          const candidate = hasValue ? valueNumber : previous + deltaNumber;
          const next = Math.round(faction.clamp(candidate));
          const delta = next - previous;
          if (delta === 0) break;
          const tierInfo = faction.getTier(next) || {};
          const tierName = typeof tierInfo.name === 'string' ? tierInfo.name : '';
          const tierPerks = Array.isArray(tierInfo.perks) ? [...tierInfo.perks] : [];
          save[valueKey] = String(next);
          save[progressKey] = String(next);
          factions[factionId] = {
            value: next,
            updatedAt: timestampIso,
            name,
            tier: tierName,
          };
          partials.factions = factions;
          save.partials = partials;
          applied = true;
          const summaryParts = [`${name} reputation ${delta >= 0 ? '+' : ''}${delta}`, `Now ${next}`];
          if (tierName) summaryParts.push(tierName);
          const summary = summaryParts.join(' — ');
          logEntries.push(createRewardLogEntry('dm-faction', now, 'DM Faction Reputation', summary));
          notifications.push(summary);
          toast(summary, delta >= 0 ? 'success' : 'info');
          const payload = {
            id: faction.id,
            name,
            value: next,
            delta,
            tier: { name: tierName, perks: tierPerks },
          };
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'faction',
            message: summary,
            timestamp: timestampIso,
            data: payload,
          }));
          if (!results.faction) results.faction = [];
          results.faction.push({ ...payload, previous });
          break;
        }
        case 'item': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const name = typeof data.name === 'string' ? data.name.trim() : '';
          if (!name) break;
          const qty = Math.max(1, parseCatalogInteger(data.qty ?? data.quantity, 1));
          const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
          const dmLock = getCatalogBoolean(data.dmLock);
          if (!Array.isArray(save.items)) save.items = [];
          save.items.push({ name, qty, notes, dmLock });
          applied = true;
          const summary = `Granted item: ${name}${qty > 1 ? ` ×${qty}` : ''}`;
          const summaryWithNotes = notes ? `${summary} — ${notes}` : summary;
          logEntries.push(createRewardLogEntry('dm-item', now, 'DM Item Reward', summaryWithNotes));
          notifications.push(summaryWithNotes);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'item',
            message: summaryWithNotes,
            timestamp: timestampIso,
            data: { name, qty, notes, dmLock },
          }));
          results.item = { name, qty, notes, dmLock };
          break;
        }
        case 'weapon': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const name = typeof data.name === 'string' ? data.name.trim() : '';
          if (!name) break;
          const damage = typeof data.damage === 'string' ? data.damage.trim() : '';
          const range = typeof data.range === 'string' ? data.range.trim() : '';
          const attackAbility = sanitizeAttackAbility(data.attackAbility);
          const proficient = getCatalogBoolean(data.proficient);
          const dmLock = getCatalogBoolean(data.dmLock);
          if (!Array.isArray(save.weapons)) save.weapons = [];
          save.weapons.push({ name, damage, range, attackAbility, proficient, dmLock });
          applied = true;
          const detailParts = [];
          if (damage) detailParts.push(damage);
          if (range) detailParts.push(range);
          const detail = detailParts.length ? ` (${detailParts.join(' · ')})` : '';
          const summary = `Granted weapon: ${name}${detail}`;
          logEntries.push(createRewardLogEntry('dm-weapon', now, 'DM Weapon Reward', summary));
          notifications.push(summary);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'weapon',
            message: summary,
            timestamp: timestampIso,
            data: { name, damage, range, attackAbility, proficient, dmLock },
          }));
          results.weapon = { name, damage, range, attackAbility, proficient, dmLock };
          break;
        }
        case 'armor': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const name = typeof data.name === 'string' ? data.name.trim() : '';
          if (!name) break;
          const slot = typeof data.slot === 'string' && data.slot.trim() ? data.slot.trim() : 'Body';
          const bonus = parseCatalogInteger(data.bonus ?? data.bonusValue, 0);
          const equipped = getCatalogBoolean(data.equipped);
          const dmLock = getCatalogBoolean(data.dmLock);
          if (!Array.isArray(save.armor)) save.armor = [];
          save.armor.push({ name, slot, bonus, equipped, dmLock });
          applied = true;
          const summary = `Granted armor: ${name}${bonus ? ` (Bonus ${bonus})` : ''}`;
          logEntries.push(createRewardLogEntry('dm-armor', now, 'DM Armor Reward', summary));
          notifications.push(summary);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'armor',
            message: summary,
            timestamp: timestampIso,
            data: { name, slot, bonus, equipped, dmLock },
          }));
          results.armor = { name, slot, bonus, equipped, dmLock };
          break;
        }
        case 'medal': {
          const data = op.data && typeof op.data === 'object' ? op.data : op;
          const medalName = typeof data.name === 'string' ? data.name.trim() : '';
          if (!medalName) throw new Error('Medal name is required');
          const description = typeof data.description === 'string' ? data.description.trim() : '';
          const artwork = typeof data.artwork === 'string' && data.artwork.trim() ? data.artwork.trim() : null;
          if (!Array.isArray(save.medals)) save.medals = [];
          const medalEntry = {
            id: data.id || `medal-${now}-${Math.floor(Math.random() * 1e6)}`,
            name: medalName,
            description,
            artwork,
            awardedAt: timestampIso,
            awardedBy: typeof data.awardedBy === 'string' && data.awardedBy ? data.awardedBy : 'DM',
          };
          save.medals.push(medalEntry);
          applied = true;
          const summary = `Awarded medal: ${medalName}${description ? ` — ${description}` : ''}`;
          logEntries.push(createRewardLogEntry('dm-medal', now, 'DM Medal', summary));
          notifications.push(summary);
          toast(summary, 'success');
          postSaveActions.push(() => broadcastPlayerReward({
            player: target,
            kind: 'medal',
            message: summary,
            timestamp: timestampIso,
            data: medalEntry,
          }));
          results.medal = medalEntry;
          break;
        }
        default:
          break;
      }
    });

    if (!applied) {
      throw new Error('No reward changes applied');
    }

    if (logEntries.length) {
      ensureCampaignLog();
      logEntries.forEach(entry => save.campaignLog.push(entry));
      appendQuickRewardHistory(logEntries);
      renderQuickRewardHistory();
    }

    await saveCloud(target, save);

    postSaveActions.forEach(action => {
      try {
        action();
      } catch (err) {
        console.error('Reward broadcast failed', err);
      }
    });

    notifications.forEach(message => {
      try {
        window.dmNotify?.(message, { ts: timestampIso, char: target, actionScope: 'major' });
      } catch {}
    });

    return { player: target, save, now, timestampIso, notifications, results };
  }

  let rewardExecutor = executeRewardTransaction;

  function setRewardExecutor(fn) {
    rewardExecutor = typeof fn === 'function' ? fn : executeRewardTransaction;
  }

  async function handleCreditRewardSubmit(event) {
    if (event) event.preventDefault();
    if (!creditSubmit || creditSubmit.disabled) return;
    const player = creditAccountSelect?.value?.trim();
    if (!player) {
      toast('Select a player to target', 'error');
      return;
    }
    const rawAmount = getCreditAmountNumber();
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      toast('Enter an amount greater than zero', 'error');
      return;
    }
    const transactionType = creditTxnType?.value === 'Debit' ? 'Debit' : 'Deposit';
    const amount = Math.abs(rawAmount);
    const accountNumber = computeCreditAccountNumber(player);
    const senderLabel = getCreditSenderLabel();
    const memo = sanitizeCreditMemo(creditMemoInput?.value || '');
    const refValue = creditCard?.getAttribute('data-ref') || creditRef?.textContent || '';
    const txidValue = creditCard?.getAttribute('data-txid') || creditTxid?.textContent || '';
    const originalLabel = creditSubmit.textContent;
    creditSubmit.disabled = true;
    creditSubmit.textContent = 'Sending…';
    try {
      const result = await rewardExecutor({
        player,
        operations: [
          {
            type: 'credits',
            amount,
            transactionType,
            memo,
            senderLabel,
            accountNumber,
            ref: refValue,
            txid: txidValue,
          },
        ],
      });
      const resolvedTotal = normalizeCreditBalance(result?.results?.credits?.total);
      if (typeof resolvedTotal === 'number') {
        creditSelectedPlayerBalance = resolvedTotal;
        updateCreditBalanceDisplays({ current: creditSelectedPlayerBalance });
      }
      const timestampIso = result?.timestampIso || new Date().toISOString();
      const stampDate = new Date(timestampIso);
      if (creditFooterDate) creditFooterDate.textContent = creditFormatDate(stampDate);
      if (creditFooterTime) creditFooterTime.textContent = creditFormatTime(stampDate);
      if (creditCard) {
        creditCard.setAttribute('data-timestamp', timestampIso);
        creditCard.setAttribute('data-submitted', 'true');
        creditCard.setAttribute('data-submitted-at', timestampIso);
        creditCard.setAttribute('data-player', player);
        creditCard.setAttribute('data-account', accountNumber);
        creditCard.setAttribute('data-memo', memo);
      }
      updateCreditMemoPreview(memo);
      randomizeCreditIdentifiers();
      updateCreditSenderDataset();
      if (creditCard) {
        if (transactionType === 'Debit') {
          setCreditDebitState('completed');
        } else {
          setCreditDebitState('');
        }
      }
      updateCreditTransactionType();
      if (creditAmountInput) {
        creditAmountInput.value = formatCreditAmountDisplay(0);
      }
      updateCreditCardAmountDisplay(0);
      if (creditMemoInput) {
        creditMemoInput.value = '';
      }
      updateCreditMemoPreview('');
      updateCreditProjectedBalanceDisplay();
      creditSubmit.textContent = 'Submit';
      creditSubmit.disabled = true;
      updateCreditSubmitState();
    } catch (err) {
      console.error('Failed to deliver rewards', err);
      toast('Failed to deliver rewards', 'error');
      creditSubmit.textContent = originalLabel || 'Submit';
      creditSubmit.disabled = false;
      updateCreditSubmitState();
    }
  }

    function focusCreditAmountInput() {
      if (!creditAmountInput) return;
      try {
        creditAmountInput.focus({ preventScroll: true });
      } catch {
        try {
          creditAmountInput.focus();
        } catch {}
      }
      try {
        if (typeof creditAmountInput.select === 'function') {
          creditAmountInput.select();
        }
      } catch {}
    }

    function focusActiveRewardsContent(tabId = activeRewardsTab) {
      if (tabId === 'resource') {
        if (!focusQuickRewardTarget()) {
          focusCreditAmountInput();
        }
      } else if (tabId === 'catalog') {
        focusCatalogForm();
      }
    }

    async function prepareCreditTab({ focusAmount = false, refreshAccounts = true } = {}) {
      refreshQuickRewardPresets({ maintainSelection: true });
      let roster = null;
      if (refreshAccounts) {
        resetCreditForm({ preserveAccount: false });
        roster = await refreshCreditAccounts({ preserveSelection: false });
      }
      resetCreditForm({ preserveAccount: true });
      renderPlayerCreditHistory();
      await refreshQuickRewardTargets({ preserveSelection: true, roster: roster });
      if (focusAmount) {
        setTimeout(() => {
          focusCreditAmountInput();
        }, 0);
      } else {
        setTimeout(() => {
          focusActiveRewardsContent('resource');
        }, 0);
    }
  }

  function readNumericInput(input) {
    if (!input) return { empty: true, value: null };
    const raw = typeof input.value === 'string' ? input.value.trim() : '';
    if (!raw) return { empty: true, value: null };
    const num = Number(raw);
    if (!Number.isFinite(num)) return { empty: false, value: null };
    return { empty: false, value: num };
  }

  async function handleQuickXpSubmit(event) {
    if (event) event.preventDefault();
    if (!quickXpForm) return;
    const players = getRewardTarget();
    if (!players.length) {
      reportRewardError('Select a player to target');
      return;
    }
    const amountInfo = readNumericInput(quickXpAmount);
    if (amountInfo.empty || amountInfo.value === null) {
      reportRewardError('Enter a valid XP amount');
      return;
    }
    const rounded = Math.round(Math.abs(amountInfo.value));
    if (rounded <= 0) {
      reportRewardError('Enter an XP amount greater than zero');
      return;
    }
    const multiplier = quickXpMode?.value === 'remove' ? -1 : 1;
    setRewardFormPending(quickXpForm, true);
    try {
      const successes = [];
      const failures = [];
      for (const player of players) {
        try {
          await rewardExecutor({
            player,
            operations: [{ type: 'xp', amount: rounded * multiplier }],
          });
          successes.push(player);
        } catch (err) {
          console.error(`Failed to apply XP reward for ${player}`, err);
          failures.push(player);
        }
      }
      if (successes.length && players.length > 1) {
        toast(`XP reward applied to ${formatPlayerList(successes)}`, 'success');
      }
      if (failures.length) {
        const message = failures.length === players.length
          ? 'Failed to apply XP reward'
          : `Unable to apply XP reward for ${formatPlayerList(failures)}`;
        if (failures.length === players.length) {
          reportRewardError(message);
        } else {
          toast(message, 'error');
        }
      }
      if (failures.length === 0 && successes.length) {
        quickXpForm.reset();
        updateQuickRewardFormsState();
        if (quickXpAmount) {
          try {
            quickXpAmount.focus({ preventScroll: true });
          } catch {
            quickXpAmount.focus?.();
          }
        }
      }
    } catch (err) {
      console.error('Failed to apply XP reward', err);
      reportRewardError('Failed to apply XP reward');
    } finally {
      setRewardFormPending(quickXpForm, false);
    }
  }

  async function handleQuickHpSpSubmit(event) {
    if (event) event.preventDefault();
    if (!quickHpSpForm) return;
    const players = getRewardTarget();
    if (!players.length) {
      reportRewardError('Select a player to target');
      return;
    }
    const hpData = {};
    const hpInfo = readNumericInput(quickHpValue);
    if (!hpInfo.empty) {
      if (hpInfo.value === null) {
        reportRewardError('Enter a valid HP value');
        return;
      }
      const hpModeValue = quickHpMode?.value === 'set' ? 'set' : 'delta';
      const roundedHp = Math.round(hpInfo.value);
      if (hpModeValue === 'set') {
        hpData.value = Math.max(0, roundedHp);
      } else if (roundedHp !== 0) {
        hpData.delta = roundedHp;
      }
    }
    const hpTempModeValue = quickHpTempMode?.value || '';
    const hpTempInfo = readNumericInput(quickHpTemp);
    if (hpTempModeValue === 'set') {
      if (!hpTempInfo.empty) {
        if (hpTempInfo.value === null) {
          reportRewardError('Enter a valid HP temp value');
          return;
        }
        hpData.tempValue = Math.max(0, Math.round(hpTempInfo.value));
      }
    } else if (hpTempModeValue === 'delta') {
      if (!hpTempInfo.empty) {
        if (hpTempInfo.value === null) {
          reportRewardError('Enter a valid HP temp value');
          return;
        }
        const roundedTemp = Math.round(hpTempInfo.value);
        if (roundedTemp !== 0) {
          hpData.tempDelta = roundedTemp;
        }
      }
    }

    const spData = {};
    const spInfo = readNumericInput(quickSpValue);
    if (!spInfo.empty) {
      if (spInfo.value === null) {
        reportRewardError('Enter a valid SP value');
        return;
      }
      const spModeValue = quickSpMode?.value === 'set' ? 'set' : 'delta';
      const roundedSp = Math.round(spInfo.value);
      if (spModeValue === 'set') {
        spData.value = Math.max(0, roundedSp);
      } else if (roundedSp !== 0) {
        spData.delta = roundedSp;
      }
    }
    const spTempModeValue = quickSpTempMode?.value || '';
    const spTempInfo = readNumericInput(quickSpTemp);
    if (spTempModeValue === 'set') {
      if (!spTempInfo.empty) {
        if (spTempInfo.value === null) {
          reportRewardError('Enter a valid SP temp value');
          return;
        }
        spData.tempValue = Math.max(0, Math.round(spTempInfo.value));
      }
    } else if (spTempModeValue === 'delta') {
      if (!spTempInfo.empty) {
        if (spTempInfo.value === null) {
          reportRewardError('Enter a valid SP temp value');
          return;
        }
        const roundedTemp = Math.round(spTempInfo.value);
        if (roundedTemp !== 0) {
          spData.tempDelta = roundedTemp;
        }
      }
    }

    const operations = [];
    if (Object.keys(hpData).length) {
      operations.push({ type: 'hp', data: hpData });
    }
    if (Object.keys(spData).length) {
      operations.push({ type: 'sp', data: spData });
    }
    if (!operations.length) {
      reportRewardError('Enter at least one HP or SP change');
      return;
    }
    setRewardFormPending(quickHpSpForm, true);
    try {
      const successes = [];
      const failures = [];
      for (const player of players) {
        try {
          await rewardExecutor({ player, operations: cloneQuickRewardOperations(operations) });
          successes.push(player);
        } catch (err) {
          console.error(`Failed to apply HP/SP reward for ${player}`, err);
          failures.push(player);
        }
      }
      if (successes.length && players.length > 1) {
        toast(`HP/SP update applied to ${formatPlayerList(successes)}`, 'success');
      }
      if (failures.length) {
        const message = failures.length === players.length
          ? 'Failed to apply HP/SP reward'
          : `Unable to apply HP/SP reward for ${formatPlayerList(failures)}`;
        if (failures.length === players.length) {
          reportRewardError(message);
        } else {
          toast(message, 'error');
        }
      }
      if (failures.length === 0 && successes.length) {
        quickHpSpForm.reset();
        updateQuickRewardFormsState();
        if (quickHpValue) {
          try {
            quickHpValue.focus({ preventScroll: true });
          } catch {
            quickHpValue.focus?.();
          }
        }
      }
    } catch (err) {
      console.error('Failed to apply HP/SP reward', err);
      reportRewardError('Failed to apply HP/SP reward');
    } finally {
      setRewardFormPending(quickHpSpForm, false);
    }
  }

  async function handleQuickResonanceSubmit(event) {
    if (event) event.preventDefault();
    if (!quickResonanceForm) return;
    const players = getRewardTarget();
    if (!players.length) {
      reportRewardError('Select a player to target');
      return;
    }
    const data = {};
    const pointsInfo = readNumericInput(quickResonancePoints);
    if (!pointsInfo.empty) {
      if (pointsInfo.value === null) {
        reportRewardError('Enter a valid resonance points value');
        return;
      }
      const pointsModeValue = quickResonancePointsMode?.value === 'set' ? 'set' : 'delta';
      const roundedPoints = Math.round(pointsInfo.value);
      if (pointsModeValue === 'set') {
        data.points = Math.max(0, roundedPoints);
      } else if (roundedPoints !== 0) {
        data.pointsDelta = roundedPoints;
      }
    }
    const bankedInfo = readNumericInput(quickResonanceBanked);
    if (!bankedInfo.empty) {
      if (bankedInfo.value === null) {
        reportRewardError('Enter a valid resonance banked value');
        return;
      }
      const bankedModeValue = quickResonanceBankedMode?.value === 'set' ? 'set' : 'delta';
      const roundedBanked = Math.round(bankedInfo.value);
      if (bankedModeValue === 'set') {
        data.banked = Math.max(0, roundedBanked);
      } else if (roundedBanked !== 0) {
        data.bankedDelta = roundedBanked;
      }
    }
    if (!('points' in data) && !('pointsDelta' in data) && !('banked' in data) && !('bankedDelta' in data)) {
      reportRewardError('Enter a resonance change');
      return;
    }
    setRewardFormPending(quickResonanceForm, true);
    try {
      const successes = [];
      const failures = [];
      for (const player of players) {
        try {
          await rewardExecutor({ player, operations: [{ type: 'resonance', data: { ...data } }] });
          successes.push(player);
        } catch (err) {
          console.error(`Failed to apply resonance reward for ${player}`, err);
          failures.push(player);
        }
      }
      if (successes.length && players.length > 1) {
        toast(`Resonance update applied to ${formatPlayerList(successes)}`, 'success');
      }
      if (failures.length) {
        const message = failures.length === players.length
          ? 'Failed to apply resonance reward'
          : `Unable to apply resonance reward for ${formatPlayerList(failures)}`;
        if (failures.length === players.length) {
          reportRewardError(message);
        } else {
          toast(message, 'error');
        }
      }
      if (failures.length === 0 && successes.length) {
        quickResonanceForm.reset();
        updateQuickRewardFormsState();
        if (quickResonancePoints) {
          try {
            quickResonancePoints.focus({ preventScroll: true });
          } catch {
            quickResonancePoints.focus?.();
          }
        }
      }
    } catch (err) {
      console.error('Failed to apply resonance reward', err);
      reportRewardError('Failed to apply resonance reward');
    } finally {
      setRewardFormPending(quickResonanceForm, false);
    }
  }

  async function handleQuickFactionSubmit(event) {
    if (event) event.preventDefault();
    if (!quickFactionForm) return;
    const players = getRewardTarget();
    if (!players.length) {
      reportRewardError('Select a player to target');
      return;
    }
    const factionId = typeof quickFactionSelect?.value === 'string' ? quickFactionSelect.value.trim() : '';
    if (!factionId) {
      reportRewardError('Select a faction');
      return;
    }
    const valueInfo = readNumericInput(quickFactionValue);
    if (valueInfo.empty || valueInfo.value === null) {
      reportRewardError('Enter a valid reputation amount');
      return;
    }
    const mode = quickFactionMode?.value === 'set' ? 'set' : 'delta';
    const roundedValue = Math.round(valueInfo.value);
    if (mode !== 'set' && roundedValue === 0) {
      reportRewardError('Enter a non-zero reputation adjustment');
      return;
    }
    const payload = { factionId };
    if (mode === 'set') {
      payload.value = roundedValue;
    } else {
      payload.delta = roundedValue;
    }
    const previousFaction = quickFactionSelect?.value || '';
    setRewardFormPending(quickFactionForm, true);
    try {
      const successes = [];
      const failures = [];
      for (const player of players) {
        try {
          await rewardExecutor({ player, operations: cloneQuickRewardOperations([{ type: 'faction', data: payload }]) });
          successes.push(player);
        } catch (err) {
          console.error(`Failed to apply faction reputation reward for ${player}`, err);
          failures.push(player);
        }
      }
      if (successes.length && players.length > 1) {
        toast(`Reputation update applied to ${formatPlayerList(successes)}`, 'success');
      }
      if (failures.length) {
        const message = failures.length === players.length
          ? 'Failed to apply faction reputation reward'
          : `Unable to apply faction reputation reward for ${formatPlayerList(failures)}`;
        if (failures.length === players.length) {
          reportRewardError(message);
        } else {
          toast(message, 'error');
        }
      }
      if (failures.length === 0 && successes.length) {
        quickFactionForm.reset();
        if (previousFaction) {
          quickFactionSelect.value = previousFaction;
        }
        updateQuickRewardFormsState();
        if (quickFactionValue) {
          try {
            quickFactionValue.focus({ preventScroll: true });
          } catch {
            quickFactionValue.focus?.();
          }
        }
      }
    } catch (err) {
      console.error('Failed to apply faction reputation reward', err);
      reportRewardError('Failed to apply faction reputation reward');
    } finally {
      setRewardFormPending(quickFactionForm, false);
    }
  }

  async function prepareCatalogTab({ focusForm = false, refreshRecipients = true } = {}) {
      ensureCatalogUI();
      if (refreshRecipients) {
        await populateCatalogRecipients();
      }
      if (!activeCatalogType || !catalogTypeLookup.has(activeCatalogType)) {
        activeCatalogType = CATALOG_TYPES[0]?.id || null;
      }
      updateCatalogTabState();
      if (focusForm) {
        Promise.resolve().then(() => focusCatalogForm());
      }
    }

    async function activateRewardsTab(tabId, { force = false } = {}) {
      if (!rewardsTabButtons.size) return;
      const defaultTab = rewardsTabButtons.keys().next().value || 'resource';
      const normalized = rewardsTabButtons.has(tabId) ? tabId : defaultTab;
      const isSame = normalized === activeRewardsTab;
      activeRewardsTab = normalized;
      updateRewardsTabState();
      if (normalized === 'resource') {
        if (force || !isSame) {
          await prepareCreditTab({ focusAmount: false, refreshAccounts: force || !isSame });
        }
      } else if (normalized === 'catalog') {
        if (force || !isSame) {
          await prepareCatalogTab({ focusForm: false, refreshRecipients: force || !isSame });
        }
      }
    }

    async function openRewards({ tab = 'resource' } = {}) {
      if (!rewardsModal) return;
      const defaultTab = rewardsTabButtons.keys().next().value || 'resource';
      const targetTab = rewardsTabButtons.has(tab) ? tab : defaultTab;
      await activateRewardsTab(targetTab, { force: true });
      show('dm-rewards-modal');
      if (typeof rewardsModal.scrollTo === 'function') {
        rewardsModal.scrollTo({ top: 0 });
      } else {
        rewardsModal.scrollTop = 0;
      }
      const activePanel = rewardsPanelMap.get(targetTab);
      if (activePanel) {
        const content = activePanel.querySelector('.dm-rewards__panelContent');
        if (content) {
          if (typeof content.scrollTo === 'function') {
            content.scrollTo({ top: 0 });
          } else {
            content.scrollTop = 0;
          }
        }
      }
      Promise.resolve().then(() => focusActiveRewardsContent(targetTab));
    }

    function closeRewards() {
      if (!rewardsModal) return;
      hide('dm-rewards-modal');
    }

  const catalogTypeLookup = new Map(CATALOG_TYPES.map(type => [type.id, type]));
  let activeCatalogType = CATALOG_TYPES[0]?.id || null;
  const catalogTabButtons = new Map();
  const catalogPanelMap = new Map();
  const catalogForms = new Map();
  let catalogInitialized = false;

    if (!isAuthorizedDevice()) {
      dmBtn?.remove();
      dmToggleBtn?.remove();
      menu?.remove();
      loginModal?.remove();
      notifyModal?.remove();
      charModal?.remove();
      charViewModal?.remove();
      rewardsBtn?.remove();
      rewardsModal?.remove();
      return;
    }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handlePlayerCreditWindowMessage);
  }

  const MENU_OPEN_CLASS = 'is-open';
  let menuHideTimer = null;
  let menuTransitionHandler = null;

  if (menu) {
    const isOpen = menu.classList.contains(MENU_OPEN_CLASS);
    menu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }

  const miniGamesLibrary = listMiniGames();
  const knobStateByGame = new Map();
  const knobPresetsByGame = new Map();
  const KNOB_STATE_STORAGE_PREFIX = 'cc:mini-game:preset:';
  const KNOB_PRESETS_STORAGE_KEY = 'cc_dm_knob_presets';
  const KNOB_PRESET_LIMIT = 20;
  const MINI_GAME_FILTER_STORAGE_KEY = 'cc_dm_mini_game_filters';
  const MINI_GAME_STALE_THRESHOLD_MS = 30 * 60 * 1000;
  const MINI_GAME_STATUS_PRIORITY = new Map([
    ['active', 0],
    ['pending', 1],
    ['scheduled', 2],
    ['expired', 3],
    ['completed', 4],
    ['cancelled', 5],
  ]);
  const MINI_GAME_RECIPIENT_LIMIT = 20;
  const DEPLOYMENT_BATCH_DELAY_MS = 350;
  const MINI_GAME_AUTO_STATUS_INTERVAL_MS = 60 * 1000;
  const deploymentRecipients = new Map();
  const autoStatusTracker = new Map();
  const FINAL_DEPLOYMENT_STATUSES = new Set(['completed', 'cancelled', 'expired']);
  let miniGameFilterState = { status: 'all', assignee: 'all', query: '' };
  miniGamesLibrary.forEach(game => {
    if (!game || !game.id) return;
    const stored = readKnobStateFromStorage(game.id);
    if (stored) {
      knobStateByGame.set(game.id, stored);
      return;
    }
    try {
      const defaults = getDefaultConfig(game.id);
      knobStateByGame.set(game.id, sanitizeKnobStateSnapshot(game.id, defaults));
    } catch {
      knobStateByGame.set(game.id, {});
    }
  });

  const normalizeRecipientName = (name = '') => name.trim().replace(/\s+/g, ' ');
  const getRecipientKey = name => normalizeRecipientName(name).toLowerCase();
  const collectRecipientNames = input => {
    if (Array.isArray(input)) {
      return input.reduce((acc, value) => acc.concat(collectRecipientNames(value)), []);
    }
    if (input && typeof input === 'object' && typeof input[Symbol.iterator] === 'function') {
      return Array.from(input).reduce((acc, value) => acc.concat(collectRecipientNames(value)), []);
    }
    if (typeof input === 'string') {
      return input
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    }
    return [];
  };

  const updateRecipientControlsState = () => {
    const hasRecipients = deploymentRecipients.size > 0;
    if (miniGamesDeployBtn) {
      miniGamesDeployBtn.disabled = !hasRecipients;
    }
    if (miniGamesClearRecipientsBtn) {
      miniGamesClearRecipientsBtn.disabled = !hasRecipients;
      miniGamesClearRecipientsBtn.setAttribute('aria-disabled', hasRecipients ? 'false' : 'true');
    }
  };

  const renderRecipientList = () => {
    if (!miniGamesRecipientList) return;
    miniGamesRecipientList.innerHTML = '';
    const recipients = Array.from(deploymentRecipients.values());
    if (!recipients.length) {
      const empty = document.createElement('p');
      empty.className = 'dm-mini-games__recipients-empty';
      empty.textContent = 'No recipients added yet.';
      miniGamesRecipientList.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'dm-mini-games__recipient-list';
      recipients.forEach(entry => {
        const item = document.createElement('li');
        item.className = `dm-mini-games__recipient-chip dm-mini-games__recipient-chip--${entry.source || 'manual'}`;
        item.dataset.recipientKey = entry.key;
        const label = document.createElement('span');
        label.className = 'dm-mini-games__recipient-name';
        label.textContent = entry.name;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'dm-mini-games__recipient-remove';
        removeBtn.dataset.recipientKey = entry.key;
        removeBtn.setAttribute('aria-label', `Remove ${entry.name}`);
        removeBtn.textContent = '×';
        item.append(label, removeBtn);
        list.appendChild(item);
      });
      miniGamesRecipientList.appendChild(list);
    }
    updateRecipientControlsState();
  };

  const getRosterSelection = () => {
    if (!miniGamesPlayerSelect) return [];
    const selectedOptions = miniGamesPlayerSelect.selectedOptions
      ? Array.from(miniGamesPlayerSelect.selectedOptions)
      : [];
    const values = selectedOptions
      .map(option => option.value)
      .filter(value => typeof value === 'string' && value.trim().length);
    if (!values.length && !miniGamesPlayerSelect.multiple) {
      const single = miniGamesPlayerSelect.value;
      return single && single.trim() ? [single] : [];
    }
    return values;
  };

  const setRosterSelection = names => {
    if (!miniGamesPlayerSelect) return;
    const targetNames = Array.isArray(names) ? names : [];
    if (!miniGamesPlayerSelect.multiple) {
      miniGamesPlayerSelect.value = targetNames[0] || '';
      return;
    }
    const targetSet = new Set(targetNames);
    Array.from(miniGamesPlayerSelect.options || []).forEach(option => {
      if (!option) return;
      option.selected = targetSet.has(option.value) && option.value !== '';
    });
  };

  const clearRosterSelection = () => {
    if (!miniGamesPlayerSelect) return;
    if (miniGamesPlayerSelect.multiple) {
      Array.from(miniGamesPlayerSelect.options || []).forEach(option => {
        if (!option) return;
        option.selected = false;
      });
    } else {
      miniGamesPlayerSelect.value = '';
    }
  };

  const addRecipient = (value, { source = 'manual' } = {}) => {
    const rawNames = collectRecipientNames(value);
    if (!rawNames.length) return false;
    let addedAny = false;
    let limitReached = false;
    const duplicates = [];
    for (const rawName of rawNames) {
      const normalized = normalizeRecipientName(rawName);
      if (!normalized) continue;
      const key = getRecipientKey(normalized);
      if (deploymentRecipients.has(key)) {
        duplicates.push(normalized);
        continue;
      }
      if (deploymentRecipients.size >= MINI_GAME_RECIPIENT_LIMIT) {
        limitReached = true;
        break;
      }
      deploymentRecipients.set(key, { key, name: normalized, source });
      addedAny = true;
    }
    if (limitReached) {
      toast(`Recipient limit reached (${MINI_GAME_RECIPIENT_LIMIT})`, 'error');
    }
    if (duplicates.length) {
      const label = duplicates.join(', ');
      toast(`${label} ${duplicates.length === 1 ? 'is' : 'are'} already queued`, 'info');
    }
    if (addedAny) {
      renderRecipientList();
    }
    return addedAny;
  };

  const removeRecipientByKey = key => {
    if (!key) return;
    deploymentRecipients.delete(key);
    renderRecipientList();
  };

  const clearRecipients = value => {
    if (typeof value === 'undefined') {
      if (!deploymentRecipients.size) return false;
      deploymentRecipients.clear();
      renderRecipientList();
      return true;
    }
    const rawNames = collectRecipientNames(value);
    if (!rawNames.length) return false;
    let removed = false;
    rawNames.forEach(name => {
      const key = getRecipientKey(name);
      if (deploymentRecipients.delete(key)) {
        removed = true;
      }
    });
    if (removed) {
      renderRecipientList();
    }
    return removed;
  };

  const getDeploymentRecipients = () => {
    return Array.from(deploymentRecipients.values()).map(entry => entry.name);
  };

  renderRecipientList();
  if (miniGamesDeployProgress) {
    miniGamesDeployProgress.hidden = true;
  }

  function getKnobStateStorageKey(gameId) {
    if (!gameId) return '';
    return `${KNOB_STATE_STORAGE_PREFIX}${gameId}`;
  }

  function cloneKnobState(values) {
    if (!values || typeof values !== 'object') return {};
    return Object.keys(values).reduce((acc, key) => {
      acc[key] = values[key];
      return acc;
    }, {});
  }

  function sanitizeKnobStateSnapshot(gameId, values) {
    if (!gameId) return {};
    const game = getMiniGame(gameId);
    if (!game) {
      return cloneKnobState(values);
    }
    const plain = cloneKnobState(values);
    let defaults = {};
    try {
      defaults = getDefaultConfig(gameId);
    } catch {
      defaults = {};
    }
    if (!Array.isArray(game.knobs) || game.knobs.length === 0) {
      return Object.keys(defaults).length ? { ...defaults } : plain;
    }
    const sanitized = {};
    game.knobs.forEach(knob => {
      const recommended = Object.prototype.hasOwnProperty.call(defaults, knob.key)
        ? defaults[knob.key]
        : undefined;
      if (Object.prototype.hasOwnProperty.call(plain, knob.key)) {
        sanitized[knob.key] = sanitizeKnobValue(knob, plain[knob.key], recommended);
      } else if (Object.prototype.hasOwnProperty.call(defaults, knob.key)) {
        sanitized[knob.key] = defaults[knob.key];
      }
    });
    return sanitized;
  }

  function readKnobStateFromStorage(gameId) {
    if (!gameId || typeof localStorage === 'undefined') return null;
    try {
      const key = getKnobStateStorageKey(gameId);
      if (!key) return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return sanitizeKnobStateSnapshot(gameId, parsed);
    } catch {
      return null;
    }
  }

  function hasKnobStateChanged(prev = {}, next = {}) {
    const prevKeys = Object.keys(prev || {});
    const nextKeys = Object.keys(next || {});
    if (prevKeys.length !== nextKeys.length) return true;
    for (const key of nextKeys) {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return true;
      if (prev[key] !== next[key]) return true;
    }
    return false;
  }

  function persistKnobStateToStorage(gameId, state) {
    if (!gameId || typeof localStorage === 'undefined') return;
    const key = getKnobStateStorageKey(gameId);
    if (!key) return;
    try {
      const snapshot = cloneKnobState(state);
      const hasValues = Object.keys(snapshot).length > 0;
      if (hasValues) {
        let defaults = {};
        try {
          defaults = getDefaultConfig(gameId);
        } catch {
          defaults = {};
        }
        const defaultSnapshot = sanitizeKnobStateSnapshot(gameId, defaults);
        if (!hasKnobStateChanged(defaultSnapshot, snapshot)) {
          localStorage.removeItem(key);
          return;
        }
        localStorage.setItem(key, JSON.stringify(snapshot));
        return;
      }
      localStorage.removeItem(key);
    } catch {
      /* ignore knob persistence errors */
    }
  }

  const sanitizePresetValues = (values) => {
    if (!values || typeof values !== 'object') return {};
    return Object.keys(values).reduce((acc, key) => {
      acc[key] = values[key];
      return acc;
    }, {});
  };

  const loadKnobPresetsFromStorage = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(KNOB_PRESETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      Object.entries(parsed).forEach(([gameId, list]) => {
        if (!Array.isArray(list)) return;
        const sanitized = list
          .map(entry => {
            if (!entry || typeof entry !== 'object') return null;
            const id = typeof entry.id === 'string' ? entry.id : `preset-${Math.random().toString(36).slice(2)}`;
            const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Preset';
            const values = sanitizePresetValues(entry.values);
            return { id, name, values };
          })
          .filter(Boolean)
          .slice(0, KNOB_PRESET_LIMIT);
        if (sanitized.length) {
          knobPresetsByGame.set(gameId, sanitized);
        }
      });
    } catch {
      /* ignore preset load errors */
    }
  };

  const persistKnobPresets = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = {};
      knobPresetsByGame.forEach((list, gameId) => {
        if (!Array.isArray(list) || !list.length) return;
        payload[gameId] = list.slice(0, KNOB_PRESET_LIMIT).map(entry => ({
          id: entry.id,
          name: entry.name,
          values: sanitizePresetValues(entry.values),
        }));
      });
      localStorage.setItem(KNOB_PRESETS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore preset persistence errors */
    }
  };

  const getKnobPresets = (gameId) => {
    if (!gameId) return [];
    const list = knobPresetsByGame.get(gameId);
    if (!Array.isArray(list)) return [];
    return list.slice();
  };

  const setKnobPresets = (gameId, presets) => {
    if (!gameId) return;
    const list = Array.isArray(presets) ? presets.slice(0, KNOB_PRESET_LIMIT) : [];
    if (list.length) {
      knobPresetsByGame.set(gameId, list);
    } else {
      knobPresetsByGame.delete(gameId);
    }
    persistKnobPresets();
  };

  const createPresetId = () => `preset-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  loadKnobPresetsFromStorage();

  const persistMiniGameFilterState = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(MINI_GAME_FILTER_STORAGE_KEY, JSON.stringify(miniGameFilterState));
    } catch {
      /* ignore filter persistence errors */
    }
  };

  const loadMiniGameFilterState = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(MINI_GAME_FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const status = typeof parsed.status === 'string' ? parsed.status : 'all';
      const assignee = typeof parsed.assignee === 'string' ? parsed.assignee : 'all';
      const query = typeof parsed.query === 'string' ? parsed.query : '';
      miniGameFilterState = {
        status: status || 'all',
        assignee: assignee || 'all',
        query: query || '',
      };
    } catch {
      miniGameFilterState = { status: 'all', assignee: 'all', query: '' };
    }
  };

  loadMiniGameFilterState();

  const applyFilterStateToControls = () => {
    if (miniGamesFilterStatus) {
      const allowedStatuses = new Set(['all', ...MINI_GAME_STATUS_OPTIONS.map(opt => opt.value)]);
      if (!allowedStatuses.has(miniGameFilterState.status)) {
        miniGameFilterState.status = 'all';
      }
      miniGamesFilterStatus.value = miniGameFilterState.status;
    }
    if (miniGamesFilterAssignee) {
      const optionValues = Array.from(miniGamesFilterAssignee.options || []).map(opt => opt.value);
      if (!optionValues.includes(miniGameFilterState.assignee)) {
        miniGameFilterState.assignee = 'all';
      }
      miniGamesFilterAssignee.value = miniGameFilterState.assignee;
    }
    if (miniGamesFilterSearch) {
      miniGamesFilterSearch.value = miniGameFilterState.query || '';
    }
  };

  if (miniGamesFilterStatus) {
    const existingValues = new Set(Array.from(miniGamesFilterStatus.options || []).map(opt => opt.value));
    MINI_GAME_STATUS_OPTIONS.forEach(opt => {
      if (existingValues.has(opt.value)) return;
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      miniGamesFilterStatus.appendChild(option);
    });
  }

  applyFilterStateToControls();
  let selectedMiniGameId = miniGamesLibrary.length ? miniGamesLibrary[0].id : null;
  let miniGamesInitialized = false;
  let miniGamesUnsubscribe = null;
  let miniGameDeploymentsCache = [];

  function ensureKnobState(gameId) {
    if (!gameId) return {};
    const existing = knobStateByGame.get(gameId);
    if (!existing) {
      let base = {};
      try {
        base = getDefaultConfig(gameId);
      } catch {
        base = {};
      }
      const stored = readKnobStateFromStorage(gameId);
      if (stored) {
        base = { ...base, ...stored };
      }
      const normalized = sanitizeKnobStateSnapshot(gameId, base);
      knobStateByGame.set(gameId, normalized);
      persistKnobStateToStorage(gameId, normalized);
      return { ...normalized };
    }
    const normalized = sanitizeKnobStateSnapshot(gameId, existing);
    const changed = hasKnobStateChanged(existing, normalized);
    if (changed) {
      knobStateByGame.set(gameId, normalized);
      persistKnobStateToStorage(gameId, normalized);
      return { ...normalized };
    }
    return { ...existing };
  }

  function writeKnobState(gameId, state) {
    if (!gameId) return;
    const normalized = sanitizeKnobStateSnapshot(gameId, state);
    knobStateByGame.set(gameId, normalized);
    persistKnobStateToStorage(gameId, normalized);
  }

  function updateMiniGameGuidance(game) {
    const hasKnobs = Array.isArray(game?.knobs) && game.knobs.length > 0;
    if (miniGamesIntro) {
      miniGamesIntro.textContent = game
        ? `Step 1 complete: ${game.name} is loaded and ready to deploy.`
        : 'Step 1: Choose a mini-game from the library to get started.';
    }
    if (miniGamesKnobsHint) {
      miniGamesKnobsHint.textContent = game
        ? hasKnobs
          ? 'Adjust these DM-only controls with confidence—every knob shows safe ranges and defaults. Your tweaks auto-save for each mini-game, and "Save preset" keeps your favourite loadouts handy.'
          : 'This mission has no optional tuning—skip straight to sending it to a player.'
        : 'Choose a mini-game to unlock DM-only tuning controls.';
    }
    if (miniGamesPlayerHint) {
      miniGamesPlayerHint.textContent = game
        ? 'Add one or more recipients, schedule the launch or set an expiry, then deploy.'
        : 'Queue recipients once your mission is tuned, and plan a schedule or expiry window if needed.';
    }
  }

  function displayKnobValue(knob, value) {
    const formatted = formatKnobValue(knob, value);
    if (typeof formatted === 'string' && formatted.trim() !== '') return formatted;
    if (knob.type === 'toggle') return value ? 'Enabled' : 'Disabled';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '(empty)';
  }

  function buildKnobStatusText(knob, current, recommended) {
    const currentLabel = displayKnobValue(knob, current);
    const defaultLabel = displayKnobValue(knob, recommended);
    if (knobValuesMatch(knob, current, recommended)) {
      return `Current: ${currentLabel} (default)`;
    }
    return `Current: ${currentLabel} · Default: ${defaultLabel}`;
  }

  function buildKnobMetaText(knob, recommended) {
    const parts = [];
    if (knob.type === 'number') {
      const hasMin = typeof knob.min === 'number' && Number.isFinite(knob.min);
      const hasMax = typeof knob.max === 'number' && Number.isFinite(knob.max);
      if (hasMin && hasMax) {
        parts.push(`Range: ${knob.min} – ${knob.max}`);
      } else if (hasMin) {
        parts.push(`Minimum: ${knob.min}`);
      } else if (hasMax) {
        parts.push(`Maximum: ${knob.max}`);
      }
      if (typeof knob.step === 'number' && Number.isFinite(knob.step) && knob.step > 0) {
        parts.push(`Step: ${knob.step}`);
      }
    }
    if (knob.type === 'select' && Array.isArray(knob.options) && knob.options.length > 0) {
      parts.push(`${knob.options.length} choices`);
    }
    if (typeof recommended !== 'undefined') {
      parts.push(`Default: ${displayKnobValue(knob, recommended)}`);
    }
    return parts.join(' · ');
  }

  function knobValuesMatch(knob, a, b) {
    if (typeof a === 'undefined' && typeof b === 'undefined') return true;
    switch (knob.type) {
      case 'number':
        return Number(a) === Number(b);
      case 'toggle':
        return Boolean(a) === Boolean(b);
      default:
        return String(a ?? '') === String(b ?? '');
    }
  }

  function sanitizeNumberValue(knob, raw, recommended) {
    let next;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      next = raw;
    } else {
      const parsed = Number(raw);
      next = Number.isFinite(parsed) ? parsed : undefined;
    }
    if (!Number.isFinite(next)) {
      if (typeof recommended === 'number' && Number.isFinite(recommended)) {
        next = recommended;
      } else if (typeof knob.min === 'number' && Number.isFinite(knob.min)) {
        next = knob.min;
      } else {
        next = 0;
      }
    }
    if (typeof knob.min === 'number' && Number.isFinite(knob.min)) {
      next = Math.max(next, knob.min);
    }
    if (typeof knob.max === 'number' && Number.isFinite(knob.max)) {
      next = Math.min(next, knob.max);
    }
    if (typeof knob.step === 'number' && Number.isFinite(knob.step) && knob.step > 0) {
      const base = typeof knob.min === 'number' && Number.isFinite(knob.min) ? knob.min : 0;
      const steps = Math.round((next - base) / knob.step);
      next = base + steps * knob.step;
      if (typeof knob.min === 'number' && Number.isFinite(knob.min)) {
        next = Math.max(next, knob.min);
      }
      if (typeof knob.max === 'number' && Number.isFinite(knob.max)) {
        next = Math.min(next, knob.max);
      }
      next = Number(Number(next).toFixed(5));
    }
    return next;
  }

  function sanitizeKnobValue(knob, raw, recommended) {
    switch (knob.type) {
      case 'toggle':
        return Boolean(raw);
      case 'number':
        return sanitizeNumberValue(knob, raw, recommended);
      case 'select': {
        const value = String(raw ?? '');
        const options = Array.isArray(knob.options) ? knob.options : [];
        const hasOption = options.some(opt => String(opt.value) === value);
        if (hasOption) return value;
        if (typeof recommended !== 'undefined') return String(recommended ?? '');
        return options.length ? String(options[0].value ?? '') : '';
      }
      default:
        return String(raw ?? '');
    }
  }

  function buildMiniGamesList() {
    if (!miniGamesList || miniGamesInitialized) return;
    miniGamesList.innerHTML = '';
    miniGamesLibrary.forEach(game => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.gameId = game.id;
      btn.setAttribute('aria-selected', game.id === selectedMiniGameId ? 'true' : 'false');
      const title = document.createElement('span');
      title.className = 'dm-mini-games__list-title';
      title.textContent = game.name;
      btn.appendChild(title);
      if (game.tagline) {
        const tagline = document.createElement('span');
        tagline.className = 'dm-mini-games__list-tagline';
        tagline.textContent = game.tagline;
        btn.appendChild(tagline);
      }
      li.appendChild(btn);
      miniGamesList.appendChild(li);
    });
    miniGamesInitialized = true;
  }

  function updateMiniGamesListSelection() {
    if (!miniGamesList) return;
    miniGamesList.querySelectorAll('button[data-game-id]').forEach(btn => {
      const selected = btn.dataset.gameId === selectedMiniGameId;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function resetMiniGameDetails() {
    if (miniGamesTitle) miniGamesTitle.textContent = 'Select a mini-game';
    if (miniGamesTagline) miniGamesTagline.textContent = '';
    if (miniGamesLaunch) miniGamesLaunch.hidden = true;
    if (miniGamesKnobs) {
      miniGamesKnobs.innerHTML = '<p class="dm-mini-games__empty">Pick a mini-game to unlock DM tools.</p>';
    }
    if (miniGamesReadme) {
      miniGamesReadme.textContent = 'Select a mini-game to review the player-facing briefing.';
    }
    updateMiniGameGuidance(null);
  }

  function renderMiniGameKnobs(game) {
    if (!miniGamesKnobs) return;
    const defaults = getDefaultConfig(game.id) || {};
    let state = ensureKnobState(game.id);
    let stateMutated = false;
    miniGamesKnobs.innerHTML = '';
    if (!Array.isArray(game.knobs) || game.knobs.length === 0) {
      miniGamesKnobs.innerHTML = '<p class="dm-mini-games__empty">This mission has no DM tuning controls.</p>';
      return;
    }

    const dirtyKnobs = new Set();
    let resetAllButton = null;
    const updateResetAllState = () => {
      if (!resetAllButton) return;
      const disabled = dirtyKnobs.size === 0;
      resetAllButton.disabled = disabled;
      resetAllButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    };

    const toolbar = document.createElement('div');
    toolbar.className = 'dm-mini-games__knobs-toolbar';
    const toolbarCopy = document.createElement('p');
    toolbarCopy.textContent = 'Every control shows its safe range and recommended defaults. Reset anything if you need to undo tweaks.';
    toolbar.appendChild(toolbarCopy);
    const presetControls = document.createElement('div');
    presetControls.className = 'dm-mini-games__preset-controls';
    const savePresetBtn = document.createElement('button');
    savePresetBtn.type = 'button';
    savePresetBtn.className = 'btn-sm dm-mini-games__preset-save';
    savePresetBtn.textContent = 'Save preset';
    const loadPresetBtn = document.createElement('button');
    loadPresetBtn.type = 'button';
    loadPresetBtn.className = 'btn-sm dm-mini-games__preset-load';
    loadPresetBtn.textContent = 'Load preset';
    loadPresetBtn.setAttribute('aria-haspopup', 'true');
    loadPresetBtn.setAttribute('aria-expanded', 'false');
    const presetMenuId = `dm-mini-games-presets-${game.id}`;
    loadPresetBtn.setAttribute('aria-controls', presetMenuId);
    presetControls.appendChild(savePresetBtn);
    presetControls.appendChild(loadPresetBtn);
    toolbar.appendChild(presetControls);
    const presetMenu = document.createElement('div');
    presetMenu.id = presetMenuId;
    presetMenu.className = 'dm-mini-games__preset-menu';
    presetMenu.hidden = true;
    presetMenu.tabIndex = -1;
    presetMenu.setAttribute('role', 'menu');
    presetMenu.setAttribute('aria-label', 'Saved presets');
    toolbar.appendChild(presetMenu);
    const closePresetMenu = () => {
      loadPresetBtn.setAttribute('aria-expanded', 'false');
      presetMenu.hidden = true;
    };
    const refreshPresetMenu = () => {
      const presets = getKnobPresets(game.id);
      loadPresetBtn.disabled = presets.length === 0;
      loadPresetBtn.setAttribute('aria-disabled', loadPresetBtn.disabled ? 'true' : 'false');
      presetMenu.innerHTML = '';
      if (!presets.length) {
        const empty = document.createElement('p');
        empty.className = 'dm-mini-games__preset-empty';
        empty.textContent = 'No presets saved yet.';
        presetMenu.appendChild(empty);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'dm-mini-games__preset-list';
      presets.forEach(preset => {
        const item = document.createElement('li');
        item.className = 'dm-mini-games__preset-item';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'dm-mini-games__preset-apply';
        applyBtn.dataset.presetId = preset.id;
        applyBtn.dataset.presetAction = 'apply';
        applyBtn.setAttribute('role', 'menuitem');
        applyBtn.textContent = preset.name;
        item.appendChild(applyBtn);
        const actions = document.createElement('div');
        actions.className = 'dm-mini-games__preset-actions';
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'dm-mini-games__preset-rename';
        renameBtn.dataset.presetId = preset.id;
        renameBtn.dataset.presetAction = 'rename';
        renameBtn.textContent = 'Rename';
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'dm-mini-games__preset-delete';
        deleteBtn.dataset.presetId = preset.id;
        deleteBtn.dataset.presetAction = 'delete';
        deleteBtn.textContent = 'Delete';
        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(actions);
        list.appendChild(item);
      });
      presetMenu.appendChild(list);
    };
    refreshPresetMenu();
    savePresetBtn.addEventListener('click', () => {
      const stateSnapshot = ensureKnobState(game.id);
      const defaultsCount = getKnobPresets(game.id).length + 1;
      const defaultName = `${game.name} preset ${defaultsCount}`;
      const nameInput = typeof prompt === 'function' ? prompt('Name this preset', defaultName) : defaultName;
      if (nameInput == null) return;
      const trimmed = nameInput.trim();
      if (!trimmed) {
        toast('Preset name cannot be empty', 'error');
        return;
      }
      const newPreset = { id: createPresetId(), name: trimmed, values: sanitizePresetValues(stateSnapshot) };
      const existing = getKnobPresets(game.id).filter(preset => preset.id !== newPreset.id && preset.name.toLowerCase() !== trimmed.toLowerCase());
      const next = [newPreset, ...existing].slice(0, KNOB_PRESET_LIMIT);
      setKnobPresets(game.id, next);
      refreshPresetMenu();
      closePresetMenu();
      toast(`Saved preset "${trimmed}"`, 'success');
    });
    loadPresetBtn.addEventListener('click', () => {
      if (loadPresetBtn.disabled) return;
      const expanded = loadPresetBtn.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        closePresetMenu();
      } else {
        refreshPresetMenu();
        presetMenu.hidden = false;
        loadPresetBtn.setAttribute('aria-expanded', 'true');
        presetMenu.focus();
      }
    });
    presetMenu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePresetMenu();
        loadPresetBtn.focus();
      }
    });
    presetMenu.addEventListener('click', (event) => {
      const target = event.target.closest('button[data-preset-action]');
      if (!target) return;
      const action = target.dataset.presetAction;
      const presetId = target.dataset.presetId;
      const presets = getKnobPresets(game.id);
      const preset = presets.find(entry => entry.id === presetId);
      if (!preset) return;
      if (action === 'apply') {
        closePresetMenu();
        writeKnobState(game.id, sanitizePresetValues(preset.values));
        shouldFocusMiniGameKnobs = true;
        renderMiniGameKnobs(game);
        toast(`Loaded preset "${preset.name}"`, 'info');
      } else if (action === 'rename') {
        const nextName = typeof prompt === 'function' ? prompt('Rename preset', preset.name) : preset.name;
        if (nextName == null) return;
        const trimmed = nextName.trim();
        if (!trimmed) {
          toast('Preset name cannot be empty', 'error');
          return;
        }
        const updated = presets.map(entry => (entry.id === presetId ? { ...entry, name: trimmed } : entry));
        setKnobPresets(game.id, updated);
        refreshPresetMenu();
        toast(`Renamed preset to "${trimmed}"`, 'info');
      } else if (action === 'delete') {
        const confirmed = typeof confirm === 'function' ? confirm(`Delete preset "${preset.name}"?`) : true;
        if (!confirmed) return;
        const remaining = presets.filter(entry => entry.id !== presetId);
        setKnobPresets(game.id, remaining);
        refreshPresetMenu();
        if (!remaining.length) {
          closePresetMenu();
        }
        toast(`Deleted preset "${preset.name}"`, 'info');
      }
    });
    resetAllButton = document.createElement('button');
    resetAllButton.type = 'button';
    resetAllButton.className = 'dm-mini-games__knob-reset dm-mini-games__knob-reset--all';
    resetAllButton.textContent = 'Reset all to defaults';
    resetAllButton.setAttribute('aria-label', 'Reset all DM controls to their defaults');
    resetAllButton.addEventListener('click', () => {
      writeKnobState(game.id, { ...defaults });
      renderMiniGameKnobs(game);
      focusMiniGameKnobs();
    });
    toolbar.appendChild(resetAllButton);
    miniGamesKnobs.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'dm-mini-games__knob-grid';
    miniGamesKnobs.appendChild(grid);

    game.knobs.forEach(knob => {
      const recommended = defaults[knob.key];
      const storedValue = state[knob.key];
      const initialValue = sanitizeKnobValue(knob, storedValue, recommended);
      if (!knobValuesMatch(knob, storedValue, initialValue)) {
        state[knob.key] = initialValue;
        stateMutated = true;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'dm-mini-games__knob';
      wrapper.dataset.knob = knob.key;

      const controlId = `dm-mini-games-${game.id}-${knob.key}`;
      const labelId = `${controlId}-label`;

      const header = document.createElement('div');
      header.className = 'dm-mini-games__knob-header';

      const title = document.createElement('label');
      title.className = 'dm-mini-games__knob-title';
      title.id = labelId;
      title.setAttribute('for', controlId);
      title.textContent = knob.label;
      header.appendChild(title);

      const badge = document.createElement('span');
      badge.className = 'dm-mini-games__knob-badge';
      badge.textContent = 'Adjusted';
      badge.hidden = true;
      header.appendChild(badge);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'dm-mini-games__knob-reset';
      resetBtn.textContent = 'Reset';
      resetBtn.title = 'Reset to default';
      resetBtn.setAttribute('aria-label', `Reset ${knob.label} to its default value`);
      header.appendChild(resetBtn);

      wrapper.appendChild(header);

      const body = document.createElement('div');
      body.className = 'dm-mini-games__knob-body';
      wrapper.appendChild(body);

      let control;
      let toggleStatus = null;

      if (knob.type === 'toggle') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = controlId;
        input.dataset.knob = knob.key;
        input.checked = Boolean(initialValue);
        input.setAttribute('role', 'switch');
        control = input;
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'dm-mini-games__knob-toggle';
        toggleLabel.setAttribute('for', controlId);
        toggleStatus = document.createElement('span');
        toggleStatus.className = 'dm-mini-games__knob-toggle-status';
        toggleStatus.textContent = displayKnobValue(knob, initialValue);
        toggleLabel.append(input, toggleStatus);
        body.appendChild(toggleLabel);
      } else if (knob.type === 'select') {
        const select = document.createElement('select');
        select.id = controlId;
        select.dataset.knob = knob.key;
        (knob.options || []).forEach(opt => {
          const option = document.createElement('option');
          option.value = String(opt.value);
          option.textContent = opt.label;
          select.appendChild(option);
        });
        select.value = String(initialValue);
        body.appendChild(select);
        control = select;
      } else {
        const input = document.createElement('input');
        input.id = controlId;
        input.dataset.knob = knob.key;
        if (knob.type === 'number') {
          input.type = 'number';
          if (typeof knob.min === 'number') input.min = String(knob.min);
          if (typeof knob.max === 'number') input.max = String(knob.max);
          if (typeof knob.step === 'number') input.step = String(knob.step);
          input.inputMode = 'decimal';
          input.value = String(initialValue);
        } else {
          input.type = 'text';
          input.autocomplete = 'off';
          input.value = String(initialValue ?? '');
          if (typeof knob.placeholder === 'string') {
            input.placeholder = knob.placeholder;
          }
        }
        body.appendChild(input);
        control = input;
      }

      const describedBy = [];

      if (knob.description) {
        const hint = document.createElement('small');
        hint.className = 'dm-mini-games__knob-description';
        hint.id = `${controlId}-description`;
        hint.textContent = knob.description;
        body.appendChild(hint);
        describedBy.push(hint.id);
      }

      const metaText = buildKnobMetaText(knob, recommended);
      if (metaText) {
        const meta = document.createElement('small');
        meta.className = 'dm-mini-games__knob-meta';
        meta.id = `${controlId}-meta`;
        meta.textContent = metaText;
        body.appendChild(meta);
        describedBy.push(meta.id);
      }

      const status = document.createElement('small');
      status.className = 'dm-mini-games__knob-status';
      status.id = `${controlId}-status`;
      body.appendChild(status);
      describedBy.push(status.id);

      if (control) {
        if (!control.id) control.id = controlId;
        control.setAttribute('aria-labelledby', labelId);
        if (describedBy.length) {
          control.setAttribute('aria-describedby', describedBy.join(' '));
        }
      }

      let currentValue = initialValue;

      const updateVisualState = value => {
        const dirty = !knobValuesMatch(knob, value, recommended);
        if (dirty) {
          dirtyKnobs.add(knob.key);
        } else {
          dirtyKnobs.delete(knob.key);
        }
        wrapper.classList.toggle('dm-mini-games__knob--dirty', dirty);
        resetBtn.disabled = !dirty;
        resetBtn.setAttribute('aria-disabled', resetBtn.disabled ? 'true' : 'false');
        badge.hidden = !dirty;
        status.textContent = buildKnobStatusText(knob, value, recommended);
        if (toggleStatus) {
          toggleStatus.textContent = displayKnobValue(knob, value);
        }
        updateResetAllState();
      };

      const commitValue = raw => {
        const sanitized = sanitizeKnobValue(knob, raw, recommended);
        if (knob.type === 'toggle') {
          control.checked = Boolean(sanitized);
        } else if (knob.type === 'number') {
          control.value = String(sanitized);
        } else if (control) {
          control.value = String(sanitized ?? '');
        }
        if (!knobValuesMatch(knob, sanitized, currentValue)) {
          currentValue = sanitized;
          const next = ensureKnobState(game.id);
          next[knob.key] = sanitized;
          writeKnobState(game.id, next);
        }
        updateVisualState(sanitized);
        return sanitized;
      };

      if (knob.type === 'toggle') {
        control.addEventListener('change', () => {
          commitValue(control.checked);
        });
      } else if (knob.type === 'select') {
        control.addEventListener('change', () => {
          commitValue(control.value);
        });
      } else if (knob.type === 'number') {
        control.addEventListener('input', () => {
          const raw = Number(control.value);
          const sanitized = sanitizeNumberValue(knob, raw, recommended);
          const valid = Number.isFinite(raw) && sanitized === raw;
          wrapper.classList.toggle('dm-mini-games__knob--invalid', !valid);
        });
        control.addEventListener('change', () => {
          wrapper.classList.remove('dm-mini-games__knob--invalid');
          commitValue(control.value);
        });
        control.addEventListener('blur', () => {
          wrapper.classList.remove('dm-mini-games__knob--invalid');
          const sanitized = sanitizeNumberValue(knob, control.value, recommended);
          control.value = String(sanitized);
          if (!knobValuesMatch(knob, sanitized, currentValue)) {
            commitValue(sanitized);
          } else {
            updateVisualState(sanitized);
          }
        });
      } else {
        control.addEventListener('input', () => {
          commitValue(control.value);
        });
      }

      resetBtn.addEventListener('click', () => {
        commitValue(recommended);
        if (typeof control?.focus === 'function') {
          control.focus();
        }
      });

      updateVisualState(initialValue);
      grid.appendChild(wrapper);
    });

    if (stateMutated) {
      writeKnobState(game.id, state);
    }
    updateResetAllState();
  }

  function renderMiniGameDetails() {
    if (!selectedMiniGameId) {
      resetMiniGameDetails();
      return;
    }
    const game = getMiniGame(selectedMiniGameId);
    if (!game) {
      resetMiniGameDetails();
      return;
    }
    if (miniGamesTitle) miniGamesTitle.textContent = game.name;
    if (miniGamesTagline) miniGamesTagline.textContent = game.tagline || '';
    if (miniGamesLaunch) {
      if (game.url) {
        miniGamesLaunch.href = game.url;
        miniGamesLaunch.hidden = false;
      } else {
        miniGamesLaunch.hidden = true;
      }
    }
    renderMiniGameKnobs(game);
    if (shouldFocusMiniGameKnobs) {
      shouldFocusMiniGameKnobs = false;
      Promise.resolve().then(() => focusMiniGameKnobs());
    }
    updateMiniGameGuidance(game);
    if (miniGamesReadme) {
      miniGamesReadme.textContent = 'Loading briefing…';
      loadMiniGameReadme(game.id)
        .then(text => {
          if (selectedMiniGameId === game.id) {
            miniGamesReadme.textContent = text;
          }
        })
        .catch(() => {
          if (selectedMiniGameId === game.id) {
            miniGamesReadme.textContent = 'Failed to load briefing.';
          }
        });
    }
  }

  function formatTimestamp(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '';
    }
  }

  const getDeploymentTimestamp = (entry) => {
    const status = entry?.status;
    const numeric = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    if (status === 'scheduled') {
      const scheduled = numeric(entry?.scheduledFor);
      if (scheduled) return scheduled;
    }
    if (status === 'active') {
      const started = numeric(entry?.startedAt);
      if (started) return started;
    }
    if (status === 'expired') {
      const expired = numeric(entry?.expiredAt);
      if (expired) return expired;
    }
    if (status === 'completed') {
      const completed = numeric(entry?.completedAt);
      if (completed) return completed;
    }
    if (status === 'cancelled') {
      const cancelled = numeric(entry?.cancelledAt);
      if (cancelled) return cancelled;
    }
    const raw = entry?.updatedAt ?? entry?.lastClientUpdateAt ?? entry?.updated ?? entry?.createdAt ?? entry?.created ?? null;
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'string' && raw) {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return Date.now();
  };

  const getDeploymentAssignee = (entry) => {
    const raw = typeof entry?.player === 'string' && entry.player.trim()
      ? entry.player
      : typeof entry?.assignee === 'string'
        ? entry.assignee
        : '';
    return raw.trim();
  };

  const filterDeployments = (entries = []) => {
    return entries.filter(entry => {
      const status = entry?.status || 'pending';
      if (miniGameFilterState.status !== 'all' && status !== miniGameFilterState.status) {
        return false;
      }
      if (miniGameFilterState.assignee !== 'all') {
        const assignee = getDeploymentAssignee(entry);
        if (assignee.toLowerCase() !== miniGameFilterState.assignee.toLowerCase()) {
          return false;
        }
      }
      const query = (miniGameFilterState.query || '').trim().toLowerCase();
      if (query) {
        const player = typeof entry?.player === 'string' ? entry.player : '';
        const notes = typeof entry?.notes === 'string' ? entry.notes : '';
        let gameName = '';
        if (typeof entry?.gameName === 'string') {
          gameName = entry.gameName;
        } else if (typeof entry?.gameId === 'string' && entry.gameId) {
          const game = getMiniGame(entry.gameId);
          if (game && typeof game.name === 'string') {
            gameName = game.name;
          } else {
            gameName = entry.gameId;
          }
        }
        const haystacks = [player, gameName, notes]
          .filter(value => typeof value === 'string' && value.trim() !== '')
          .map(value => value.toLowerCase());
        if (!haystacks.some(text => text.includes(query))) {
          return false;
        }
      }
      return true;
    });
  };

  const sortDeploymentsByUrgency = (entries = []) => {
    return entries.slice().sort((a, b) => {
      const priorityA = MINI_GAME_STATUS_PRIORITY.get(a?.status) ?? 99;
      const priorityB = MINI_GAME_STATUS_PRIORITY.get(b?.status) ?? 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const timeA = getDeploymentTimestamp(a);
      const timeB = getDeploymentTimestamp(b);
      return timeA - timeB;
    });
  };

  const updateAssigneeFilterOptions = (entries = []) => {
    if (!miniGamesFilterAssignee) return;
    const selectedBefore = miniGameFilterState.assignee;
    const names = Array.from(new Set(entries.map(getDeploymentAssignee).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    miniGamesFilterAssignee.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All recipients';
    miniGamesFilterAssignee.appendChild(allOption);
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      miniGamesFilterAssignee.appendChild(option);
    });
    if (selectedBefore !== 'all' && !names.includes(selectedBefore)) {
      miniGameFilterState.assignee = 'all';
      persistMiniGameFilterState();
    }
    applyFilterStateToControls();
  };

  const isDeploymentStale = (entry) => {
    const status = entry?.status;
    if (status !== 'pending' && status !== 'active') return false;
    const ts = getDeploymentTimestamp(entry);
    return Number.isFinite(ts) && (Date.now() - ts) > MINI_GAME_STALE_THRESHOLD_MS;
  };

  function renderMiniGameDeployments(entries = []) {
    if (!miniGamesDeployments) return;
    const arrayEntries = Array.isArray(entries) ? entries : [];
    updateAssigneeFilterOptions(arrayEntries);
    const filtered = filterDeployments(arrayEntries);
    const sorted = sortDeploymentsByUrgency(filtered);
    if (!sorted.length) {
      miniGamesDeployments.innerHTML = arrayEntries.length
        ? '<li class="dm-mini-games__empty">No deployments match the selected filters.</li>'
        : '<li class="dm-mini-games__empty">Launched missions will appear here for quick status updates.</li>';
      return;
    }
    miniGamesDeployments.innerHTML = '';
    sorted.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'dm-mini-games__deployment';
      li.dataset.player = entry.player || '';
      li.dataset.deploymentId = entry.id || '';
      const statusValue = entry.status || 'pending';
      li.dataset.status = statusValue;
      const assignee = getDeploymentAssignee(entry);
      if (assignee) {
        li.dataset.assignee = assignee;
      } else {
        delete li.dataset.assignee;
      }
      const scheduledForTs = Number(entry.scheduledFor);
      const expiresAtTs = Number(entry.expiresAt);
      const isScheduled = statusValue === 'scheduled';
      const isExpired = statusValue === 'expired' || (Number.isFinite(expiresAtTs) && expiresAtTs <= Date.now());
      if (isScheduled) {
        li.classList.add('dm-mini-games__deployment--scheduled');
        if (Number.isFinite(scheduledForTs) && scheduledForTs > Date.now() && (scheduledForTs - Date.now()) <= 60 * 60 * 1000) {
          li.classList.add('dm-mini-games__deployment--upcoming');
        }
      }
      if (isExpired) {
        li.classList.add('dm-mini-games__deployment--expired');
      }
      const stale = isDeploymentStale(entry);
      li.classList.toggle('dm-mini-games__deployment--stale', stale);
      const outcome = entry.outcome && typeof entry.outcome === 'object' ? entry.outcome : null;

      const header = document.createElement('div');
      header.className = 'dm-mini-games__deployment-header';
      const title = document.createElement('strong');
      const gameName = entry.gameName || getMiniGame(entry.gameId)?.name || entry.gameId || 'Mini-game';
      li.dataset.gameName = gameName;
      title.textContent = `${entry.player || 'Unknown'} • ${gameName}`;
      header.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'dm-mini-games__deployment-meta';
      const status = document.createElement('span');
      status.textContent = `Status: ${getStatusLabel(entry.status || 'pending')}`;
      meta.appendChild(status);
      const tsValue = getDeploymentTimestamp(entry);
      const tsLabel = formatTimestamp(tsValue);
      if (tsLabel) {
        const tsSpan = document.createElement('span');
        tsSpan.textContent = `Updated: ${tsLabel}`;
        tsSpan.className = 'dm-mini-games__deployment-time';
        if (stale) {
          tsSpan.classList.add('dm-mini-games__deployment-time--stale');
        }
        meta.appendChild(tsSpan);
      }
      if (Number.isFinite(scheduledForTs)) {
        const scheduledSpan = document.createElement('span');
        const scheduledLabel = formatTimestamp(scheduledForTs) || '—';
        scheduledSpan.textContent = `${scheduledForTs > Date.now() ? 'Launches' : 'Scheduled'}: ${scheduledLabel}`;
        scheduledSpan.className = 'dm-mini-games__deployment-time dm-mini-games__deployment-time--scheduled';
        if (scheduledForTs > Date.now()) {
          scheduledSpan.classList.add('dm-mini-games__deployment-time--upcoming');
        }
        meta.appendChild(scheduledSpan);
      }
      if (Number.isFinite(expiresAtTs)) {
        const expiresSpan = document.createElement('span');
        const expiresLabel = formatTimestamp(expiresAtTs) || '—';
        expiresSpan.textContent = `${expiresAtTs <= Date.now() ? 'Expired' : 'Expires'}: ${expiresLabel}`;
        expiresSpan.className = 'dm-mini-games__deployment-time dm-mini-games__deployment-time--expires';
        meta.appendChild(expiresSpan);
      }
      if (entry.issuedBy) {
        const issuer = document.createElement('span');
        issuer.textContent = `Issued by: ${entry.issuedBy}`;
        meta.appendChild(issuer);
      }
      header.appendChild(meta);
      li.appendChild(header);

      const summary = document.createElement('div');
      summary.className = 'dm-mini-games__deployment-summary';
      const summaryText = summarizeConfig(entry.gameId, entry.config || {});
      summary.textContent = summaryText || 'No configuration specified.';
      li.appendChild(summary);

      if (entry.notes) {
        const notes = document.createElement('div');
        notes.className = 'dm-mini-games__deployment-notes';
        notes.textContent = `Notes: ${entry.notes}`;
        li.appendChild(notes);
      }

      if (outcome) {
        const outcomeNote = typeof outcome.note === 'string' && outcome.note.trim()
          ? outcome.note.trim()
          : typeof outcome.detail === 'string' && outcome.detail.trim()
            ? outcome.detail.trim()
            : typeof outcome.body === 'string' && outcome.body.trim()
              ? outcome.body.trim()
              : '';
        if (outcomeNote) {
          const outcomeEl = document.createElement('div');
          outcomeEl.className = 'dm-mini-games__deployment-outcome';
          if (outcome.success === true) outcomeEl.classList.add('dm-mini-games__deployment-outcome--success');
          else if (outcome.success === false) outcomeEl.classList.add('dm-mini-games__deployment-outcome--failure');
          if (isExpired) outcomeEl.classList.add('dm-mini-games__deployment-outcome--expired');
          const heading = typeof outcome.heading === 'string' && outcome.heading.trim()
            ? outcome.heading.trim()
            : outcome.success === true
              ? 'Mission success'
              : outcome.success === false
                ? 'Mission failed'
                : 'Mission update';
          outcomeEl.innerHTML = `<strong>${escapeHtml(heading)}</strong>: ${escapeHtml(outcomeNote)}`;
          const recordedAt = typeof outcome.recordedAt === 'number' && Number.isFinite(outcome.recordedAt)
            ? outcome.recordedAt
            : null;
          if (recordedAt) {
            const recordedLabel = formatTimestamp(recordedAt);
            if (recordedLabel) {
              const metaSpan = document.createElement('span');
              metaSpan.className = 'dm-mini-games__deployment-outcome-meta';
              metaSpan.textContent = recordedLabel;
              outcomeEl.appendChild(metaSpan);
            }
          }
          li.appendChild(outcomeEl);
        }
      }

      const actions = document.createElement('div');
      actions.className = 'dm-mini-games__deployment-actions';

      const statusSelect = document.createElement('select');
      statusSelect.setAttribute('data-action', 'status');
      statusSelect.ariaLabel = 'Deployment status';
      MINI_GAME_STATUS_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        statusSelect.appendChild(option);
      });
      statusSelect.value = entry.status || 'pending';
      actions.appendChild(statusSelect);

      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn-sm';
      updateBtn.dataset.action = 'update';
      updateBtn.textContent = 'Update';
      actions.appendChild(updateBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-sm';
      removeBtn.dataset.action = 'delete';
      removeBtn.textContent = 'Remove';
      actions.appendChild(removeBtn);

      if (entry.gameUrl) {
        const openLink = document.createElement('a');
        openLink.href = entry.gameUrl;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        openLink.className = 'btn-sm';
        openLink.textContent = 'Open Player View';
        actions.appendChild(openLink);
      }

      if (typeof window.dmNotify === 'function' && assignee) {
        const nudgeBtn = document.createElement('button');
        nudgeBtn.type = 'button';
        nudgeBtn.className = 'btn-sm dm-mini-games__deployment-nudge';
        nudgeBtn.dataset.action = 'nudge';
        nudgeBtn.textContent = 'Nudge Player';
        nudgeBtn.setAttribute('aria-label', `Send a nudge to ${assignee}`);
        actions.appendChild(nudgeBtn);
      }

      li.appendChild(actions);
      miniGamesDeployments.appendChild(li);
    });
  }

  function ensureMiniGameSubscription() {
    if (miniGamesUnsubscribe) return;
    miniGamesUnsubscribe = subscribeMiniGameDeployments(entries => {
      miniGameDeploymentsCache = Array.isArray(entries) ? entries : [];
      autoUpdateDeploymentStatuses(miniGameDeploymentsCache);
      if (miniGamesModal && !miniGamesModal.classList.contains('hidden')) {
        renderMiniGameDeployments(miniGameDeploymentsCache);
      }
    });
  }

  function teardownMiniGameSubscription() {
    if (typeof miniGamesUnsubscribe === 'function') {
      try { miniGamesUnsubscribe(); } catch {}
      miniGamesUnsubscribe = null;
    }
  }

  async function refreshMiniGameCharacters({ preserveSelection = true } = {}) {
    if (!miniGamesPlayerSelect) return;
    const previous = preserveSelection ? getRosterSelection() : [];
    miniGamesPlayerSelect.innerHTML = '<option value="">Loading…</option>';
    try {
      const names = await listCharacters();
      miniGamesPlayerSelect.innerHTML = '';
      if (!miniGamesPlayerSelect.multiple || !names.length) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = miniGamesPlayerSelect.multiple ? 'No characters available' : 'Select a character';
        if (miniGamesPlayerSelect.multiple) {
          placeholder.disabled = true;
          placeholder.hidden = true;
        }
        miniGamesPlayerSelect.appendChild(placeholder);
      }
      names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        miniGamesPlayerSelect.appendChild(option);
      });
      if (previous.length) {
        const allowed = previous.filter(name => names.includes(name));
        if (allowed.length) {
          setRosterSelection(allowed);
        } else {
          clearRosterSelection();
        }
      } else {
        clearRosterSelection();
      }
    } catch (err) {
      console.error('Failed to load characters for mini-games', err);
      miniGamesPlayerSelect.innerHTML = '<option value="">Unable to load characters</option>';
    }
  }

  async function forceRefreshMiniGameDeployments() {
    try {
      const entries = await refreshMiniGameDeployments();
      miniGameDeploymentsCache = Array.isArray(entries) ? entries : [];
      if (miniGamesModal && !miniGamesModal.classList.contains('hidden')) {
        renderMiniGameDeployments(miniGameDeploymentsCache);
      }
      autoUpdateDeploymentStatuses(miniGameDeploymentsCache);
    } catch (err) {
      console.error('Failed to refresh mini-game deployments', err);
      toast('Failed to refresh mini-games', 'error');
    }
  }

  const markAutoStatus = (key, field, value) => {
    const record = autoStatusTracker.get(key) || {};
    record[field] = value;
    autoStatusTracker.set(key, record);
  };

  const canAutoUpdateStatus = (key, field, now) => {
    const record = autoStatusTracker.get(key);
    const last = record?.[field] || 0;
    return !last || (now - last) >= MINI_GAME_AUTO_STATUS_INTERVAL_MS;
  };

  function autoUpdateDeploymentStatuses(entries = []) {
    const now = Date.now();
    entries.forEach(entry => {
      const player = typeof entry?.player === 'string' ? entry.player : '';
      const deploymentId = typeof entry?.id === 'string' ? entry.id : '';
      if (!player || !deploymentId) return;
      const key = `${player}::${deploymentId}`;
      const statusValue = entry?.status || 'pending';
      const expiresAt = Number(entry?.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt <= now && !FINAL_DEPLOYMENT_STATUSES.has(statusValue)) {
        if (!canAutoUpdateStatus(key, 'expiredAt', now)) return;
        markAutoStatus(key, 'expiredAt', now);
        const outcomePayload = entry.outcome && typeof entry.outcome === 'object'
          ? { ...entry.outcome }
          : {};
        if (!outcomePayload.note) {
          outcomePayload.note = 'Mission expired before launch.';
        }
        if (!outcomePayload.heading) {
          outcomePayload.heading = 'Mission expired';
        }
        outcomePayload.status = 'expired';
        outcomePayload.success = false;
        outcomePayload.recordedAt = now;
        updateMiniGameDeployment(player, deploymentId, {
          status: 'expired',
          expiredAt: now,
          outcome: outcomePayload,
        }).catch(err => {
          console.error('Failed to auto-expire deployment', err);
          const record = autoStatusTracker.get(key) || {};
          record.expiredAt = 0;
          autoStatusTracker.set(key, record);
        });
        return;
      }
      if (statusValue === 'scheduled') {
        const scheduledFor = Number(entry?.scheduledFor);
        if (Number.isFinite(scheduledFor) && scheduledFor <= now) {
          if (!canAutoUpdateStatus(key, 'releasedAt', now)) return;
          markAutoStatus(key, 'releasedAt', now);
          updateMiniGameDeployment(player, deploymentId, {
            status: 'pending',
            releasedAt: now,
          }).catch(err => {
            console.error('Failed to release scheduled deployment', err);
            const record = autoStatusTracker.get(key) || {};
            record.releasedAt = 0;
            autoStatusTracker.set(key, record);
          });
        }
      }
    });
  }

  const delay = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));

  async function handleMiniGameDeploy() {
    if (!selectedMiniGameId) {
      toast('Choose a mini-game first', 'error');
      return false;
    }
    const recipients = getDeploymentRecipients();
    if (!recipients.length) {
      toast('Add at least one recipient', 'error');
      return false;
    }
    const config = ensureKnobState(selectedMiniGameId);
    const notes = miniGamesNotes?.value?.trim() || '';
    let scheduledForTs = null;
    if (miniGamesScheduledFor && miniGamesScheduledFor.value) {
      const parsed = Date.parse(miniGamesScheduledFor.value);
      if (Number.isNaN(parsed)) {
        toast('Enter a valid scheduled time', 'error');
        return false;
      }
      if (parsed > Date.now()) {
        scheduledForTs = parsed;
      }
    }
    let expiresAtTs = null;
    const expiryValue = Number(miniGamesExpiry?.value || '');
    if (Number.isFinite(expiryValue) && expiryValue > 0) {
      const base = scheduledForTs && scheduledForTs > Date.now() ? scheduledForTs : Date.now();
      expiresAtTs = base + expiryValue * 60 * 1000;
    }
    const progressEntries = recipients.map(name => ({ name, status: 'queued', message: '' }));
    const renderProgress = () => {
      if (!miniGamesDeployProgress) return;
      miniGamesDeployProgress.innerHTML = '';
      if (!progressEntries.length) {
        miniGamesDeployProgress.hidden = true;
        return;
      }
      miniGamesDeployProgress.hidden = false;
      const list = document.createElement('ul');
      list.className = 'dm-mini-games__deploy-progress-list';
      progressEntries.forEach(entry => {
        const item = document.createElement('li');
        item.className = `dm-mini-games__deploy-progress-item dm-mini-games__deploy-progress-item--${entry.status}`;
        const nameEl = document.createElement('span');
        nameEl.className = 'dm-mini-games__deploy-progress-name';
        nameEl.textContent = entry.name;
        const statusEl = document.createElement('span');
        statusEl.className = 'dm-mini-games__deploy-progress-status';
        if (entry.message) {
          statusEl.textContent = entry.message;
        } else {
          statusEl.textContent = entry.status === 'queued'
            ? 'Queued'
            : entry.status === 'sending'
              ? 'Sending…'
              : entry.status === 'success'
                ? 'Sent'
                : 'Failed';
        }
        item.append(nameEl, statusEl);
        list.appendChild(item);
      });
      miniGamesDeployProgress.appendChild(list);
    };
    renderProgress();
    let successCount = 0;
    let failureCount = 0;
    const succeededKeys = [];
    try {
      if (miniGamesDeployBtn) miniGamesDeployBtn.disabled = true;
      const game = getMiniGame(selectedMiniGameId);
      const gameName = game?.name || selectedMiniGameId;
      for (let index = 0; index < recipients.length; index += 1) {
        const name = recipients[index];
        const key = getRecipientKey(name);
        const entry = progressEntries[index];
        entry.status = 'sending';
        entry.message = scheduledForTs ? 'Scheduling…' : 'Sending…';
        renderProgress();
        if (index > 0) {
          await delay(DEPLOYMENT_BATCH_DELAY_MS);
        }
        try {
          await deployMiniGameToCloud({
            gameId: selectedMiniGameId,
            player: name,
            config,
            notes,
            issuedBy: 'DM',
            scheduledFor: scheduledForTs,
            expiresAt: expiresAtTs,
          });
          entry.status = 'success';
          entry.message = scheduledForTs
            ? `Scheduled for ${formatTimestamp(scheduledForTs) || 'launch window set'}`
            : 'Deployment sent';
          successCount += 1;
          succeededKeys.push(key);
        } catch (err) {
          entry.status = 'error';
          entry.message = err?.message ? err.message : 'Request failed';
          failureCount += 1;
          console.error('Failed to deploy mini-game', err);
        }
        renderProgress();
      }
      if (successCount > 0) {
        const successMsg = successCount === recipients.length && failureCount === 0
          ? `Mini-game deployed to ${successCount} recipient${successCount === 1 ? '' : 's'}`
          : `Mini-game deployed to ${successCount} of ${recipients.length} recipients`;
        toast(successMsg, failureCount === 0 ? 'success' : 'info');
        const notifyMsg = scheduledForTs
          ? `Scheduled ${gameName} for ${successCount} recipient${successCount === 1 ? '' : 's'}`
          : `Deployed ${gameName} to ${successCount} recipient${successCount === 1 ? '' : 's'}`;
        window.dmNotify?.(notifyMsg, { actionScope: 'major' });
      }
      if (failureCount > 0) {
        toast(`Failed to deploy to ${failureCount} recipient${failureCount === 1 ? '' : 's'}`, 'error');
      }
      if (successCount > 0) {
        succeededKeys.forEach(removeRecipientByKey);
        if (miniGamesNotes && failureCount === 0) {
          miniGamesNotes.value = '';
        }
      }
      return successCount > 0;
    } catch (err) {
      console.error('Failed to deploy mini-game', err);
      toast('Failed to deploy mini-game', 'error');
      return false;
    } finally {
      if (miniGamesDeployBtn) miniGamesDeployBtn.disabled = false;
      renderProgress();
    }
  }

  function focusMiniGameKnobs() {
    if (!miniGamesModal || miniGamesModal.classList.contains('hidden')) return;
    const knobInput = miniGamesKnobs?.querySelector('.dm-mini-games__knob input:not([disabled]), .dm-mini-games__knob select:not([disabled]), .dm-mini-games__knob textarea:not([disabled])');
    const knobTarget = knobInput || miniGamesKnobs?.querySelector('.dm-mini-games__knob button:not([disabled])');
    const fallbackTarget = miniGamesPlayerSelect || miniGamesPlayerCustom || miniGamesNotes || miniGamesDeployBtn;
    const focusTarget = knobTarget || fallbackTarget;
    if (!focusTarget || typeof focusTarget.focus !== 'function') return;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      focusTarget.focus();
    }
  }

  let shouldFocusMiniGameKnobs = false;

  async function openMiniGames() {
    if (!miniGamesModal) return;
    ensureMiniGameSubscription();
    buildMiniGamesList();
    updateMiniGamesListSelection();
    shouldFocusMiniGameKnobs = true;
    renderMiniGameDetails();
    await refreshMiniGameCharacters();
    renderMiniGameDeployments(miniGameDeploymentsCache);
    show('dm-mini-games-modal');
    if (typeof miniGamesModal?.scrollTo === 'function') {
      miniGamesModal.scrollTo({ top: 0 });
    } else if (miniGamesModal) {
      miniGamesModal.scrollTop = 0;
    }
    const modalContent = miniGamesModal?.querySelector?.('.modal');
    if (modalContent) {
      if (typeof modalContent.scrollTo === 'function') {
        modalContent.scrollTo({ top: 0 });
      } else {
        modalContent.scrollTop = 0;
      }
    }
    if (shouldFocusMiniGameKnobs) {
      shouldFocusMiniGameKnobs = false;
      Promise.resolve().then(() => focusMiniGameKnobs());
    }
  }

  function closeMiniGames() {
    if (!miniGamesModal) return;
    hide('dm-mini-games-modal');
  }

  function getCatalogFieldSets(typeId) {
    const short = [...CATALOG_BASE_SHORT_FIELDS, ...(CATALOG_TYPE_SHORT_FIELDS[typeId] || [])];
    const long = [...CATALOG_BASE_LONG_FIELDS, ...(CATALOG_TYPE_LONG_FIELDS[typeId] || [])];
    return { short, long };
  }

  function sanitizeCatalogValue(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  function createCatalogField(definition) {
    const wrapper = document.createElement('label');
    wrapper.className = 'dm-catalog__field';
    wrapper.dataset.field = definition.key;

    const title = document.createElement('span');
    title.className = 'dm-catalog__field-label';
    title.textContent = definition.label;
    wrapper.appendChild(title);

    let control;
    if (definition.kind === 'textarea') {
      control = document.createElement('textarea');
      control.rows = definition.rows || 3;
    } else if (definition.kind === 'select') {
      control = document.createElement('select');
      const placeholderText = (definition.placeholder || '').trim() || 'Select an option';
      control.dataset.placeholder = placeholderText;
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = placeholderText;
      control.appendChild(placeholderOption);
      if (Array.isArray(definition.options)) {
        definition.options.forEach(option => {
          if (!option) return;
          const opt = document.createElement('option');
          if (typeof option === 'string') {
            opt.value = option;
            opt.textContent = option;
          } else {
            const value = typeof option.value === 'string' ? option.value : '';
            const label = typeof option.label === 'string' ? option.label : value;
            opt.value = value;
            opt.textContent = label;
          }
          control.appendChild(opt);
        });
      }
    } else {
      control = document.createElement('input');
      control.type = definition.type || 'text';
      if (definition.autocomplete) control.autocomplete = definition.autocomplete;
      if (definition.inputMode) control.inputMode = definition.inputMode;
      if (definition.pattern) control.pattern = definition.pattern;
    }
    control.name = definition.key;
    control.dataset.catalogField = definition.key;
    if (definition.placeholder) control.placeholder = definition.placeholder;
    if (definition.required) control.required = true;
    if (definition.maxlength) control.maxLength = definition.maxlength;
    if (definition.spellcheck === false) control.spellcheck = false;
    if (definition.min != null) control.min = String(definition.min);
    if (definition.max != null) control.max = String(definition.max);
    if (definition.step != null) control.step = String(definition.step);
    if (definition.defaultValue != null) control.value = definition.defaultValue;
    if (definition.type === 'checkbox' && definition.defaultChecked) control.checked = true;
    wrapper.appendChild(control);

    if (definition.hint) {
      const hint = document.createElement('span');
      hint.className = 'dm-catalog__hint';
      hint.textContent = definition.hint;
      wrapper.appendChild(hint);
    }

    return { wrapper, control };
  }

  function buildCatalogForm(typeId, form) {
    if (!form || form.dataset.catalogBuilt === 'true') return;
    const typeMeta = catalogTypeLookup.get(typeId);
    const { short, long } = getCatalogFieldSets(typeId);
    form.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'dm-catalog__card';

    const heading = document.createElement('h4');
    heading.className = 'dm-catalog__panel-title';
    heading.textContent = `${typeMeta?.label ?? 'Catalog'} Entry`;
    card.appendChild(heading);

    if (typeMeta?.blurb) {
      const intro = document.createElement('p');
      intro.className = 'dm-catalog__hint';
      intro.textContent = typeMeta.blurb;
      card.appendChild(intro);
    }

    if (short.length) {
      const grid = document.createElement('div');
      grid.className = 'dm-catalog__grid';
      short.forEach(field => {
        const { wrapper } = createCatalogField(field);
        grid.appendChild(wrapper);
      });
      card.appendChild(grid);
    }

    long.forEach(field => {
      const { wrapper } = createCatalogField(field);
      card.appendChild(wrapper);
    });

    const lock = document.createElement('label');
    lock.className = 'dm-catalog__lock';
    const lockInput = document.createElement('input');
    lockInput.type = 'checkbox';
    lockInput.name = 'dmLock';
    lockInput.value = 'locked';
    lock.appendChild(lockInput);
    const lockCopy = document.createElement('div');
    lockCopy.className = 'dm-catalog__lock-copy';
    const lockTitle = document.createElement('span');
    lockTitle.className = 'dm-catalog__field-label';
    lockTitle.textContent = 'DM lock this entry';
    lockCopy.appendChild(lockTitle);
    const lockHint = document.createElement('span');
    lockHint.className = 'dm-catalog__hint';
    lockHint.textContent = 'Prevent players from editing this entry after deployment.';
    lockCopy.appendChild(lockHint);
    lock.appendChild(lockCopy);
    card.appendChild(lock);

    const actions = document.createElement('div');
    actions.className = 'dm-catalog__actions';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'reset';
    resetBtn.className = 'btn-sm';
    resetBtn.textContent = 'Clear';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'somf-btn somf-primary';
    submitBtn.textContent = 'Create Entry';
    actions.appendChild(resetBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    form.appendChild(card);
    form.dataset.catalogBuilt = 'true';
    form.addEventListener('submit', handleCatalogSubmit);
    form.addEventListener('reset', handleCatalogReset);
  }

  async function populateCatalogRecipients() {
    const recipientFields = [];
    catalogForms.forEach(form => {
      if (!form) return;
      const selects = form.querySelectorAll(`select[data-catalog-field="${CATALOG_RECIPIENT_FIELD_KEY}"]`);
      selects.forEach(select => {
        recipientFields.push({
          select,
          previous: typeof select.value === 'string' ? select.value : '',
          placeholder: select.dataset.placeholder || CATALOG_RECIPIENT_PLACEHOLDER,
        });
      });
    });
    if (!recipientFields.length) return;
    let characters = [];
    try {
      const listed = await listCharacters();
      if (Array.isArray(listed)) {
        characters = listed;
      }
    } catch (err) {
      console.error('Failed to load character list for catalog recipients', err);
    }
    const uniqueNames = [];
    const seen = new Set();
    characters.forEach(name => {
      if (typeof name !== 'string') return;
      const trimmed = name.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      uniqueNames.push(trimmed);
    });
    const rosterSet = new Set(uniqueNames);
    recipientFields.forEach(({ select, previous, placeholder }) => {
      const trimmedPrevious = typeof previous === 'string' ? previous.trim() : '';
      select.innerHTML = '';
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = placeholder || CATALOG_RECIPIENT_PLACEHOLDER;
      select.appendChild(placeholderOption);
      uniqueNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
      if (trimmedPrevious && !rosterSet.has(trimmedPrevious)) {
        const retained = document.createElement('option');
        retained.value = trimmedPrevious;
        retained.textContent = trimmedPrevious;
        select.appendChild(retained);
      }
      if (trimmedPrevious) {
        select.value = trimmedPrevious;
        if (select.value !== trimmedPrevious) {
          select.value = '';
        }
      }
    });
  }

  function updateCatalogTabState() {
    CATALOG_TYPES.forEach(type => {
      const btn = catalogTabButtons.get(type.id);
      const panel = catalogPanelMap.get(type.id);
      const active = type.id === activeCatalogType;
      if (btn) {
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      }
      if (panel) {
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
        panel.hidden = !active;
      }
    });
  }

    function focusCatalogForm() {
      if (activeRewardsTab !== 'catalog') return;
      if (!rewardsModal || rewardsModal.classList.contains('hidden')) return;
      const form = catalogForms.get(activeCatalogType);
      if (!form) return;
      const focusTarget = form.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    if (!focusTarget || typeof focusTarget.focus !== 'function') return;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      focusTarget.focus();
    }
  }

  function getAdjacentCatalogType(currentId, offset) {
    if (!CATALOG_TYPES.length) return currentId;
    const index = CATALOG_TYPES.findIndex(type => type.id === currentId);
    if (index === -1) {
      return CATALOG_TYPES[0].id;
    }
    const nextIndex = (index + offset + CATALOG_TYPES.length) % CATALOG_TYPES.length;
    return CATALOG_TYPES[nextIndex].id;
  }

  function setActiveCatalogTab(typeId, { focusTab = false, suppressPanelFocus = false } = {}) {
    const hasType = typeId && catalogTypeLookup.has(typeId);
    if (!hasType) {
      typeId = CATALOG_TYPES[0]?.id || activeCatalogType;
    }
    if (!typeId) return;
    activeCatalogType = typeId;
    updateCatalogTabState();
    if (focusTab) {
      const btn = catalogTabButtons.get(typeId);
      if (btn && typeof btn.focus === 'function') {
        try {
          btn.focus({ preventScroll: true });
        } catch {
          btn.focus();
        }
      }
    }
    if (!suppressPanelFocus) {
      Promise.resolve().then(() => focusCatalogForm());
    }
  }

  function ensureCatalogUI() {
    if (!catalogTabs || !catalogPanels) return;
    if (!catalogInitialized) {
      const tabButtons = catalogTabs.querySelectorAll('button[data-tab]');
      tabButtons.forEach(btn => {
        const typeId = btn.dataset.tab;
        if (!typeId) return;
        catalogTabButtons.set(typeId, btn);
        if (!activeCatalogType) activeCatalogType = typeId;
      });
      const panels = catalogPanels.querySelectorAll('[data-panel]');
      panels.forEach(panel => {
        const typeId = panel.dataset.panel;
        if (!typeId) return;
        catalogPanelMap.set(typeId, panel);
        const form = panel.querySelector('form[data-catalog-form]');
        if (form) {
          catalogForms.set(typeId, form);
          buildCatalogForm(typeId, form);
        }
      });
      catalogTabs.addEventListener('click', handleCatalogTabClick);
      catalogTabs.addEventListener('keydown', handleCatalogTabKeydown);
      catalogInitialized = true;
    } else {
      catalogForms.forEach((form, typeId) => {
        if (form && form.dataset.catalogBuilt !== 'true') {
          buildCatalogForm(typeId, form);
        }
      });
    }
    if (!activeCatalogType || !catalogTypeLookup.has(activeCatalogType)) {
      activeCatalogType = CATALOG_TYPES[0]?.id || null;
    }
    updateCatalogTabState();
  }

  function handleCatalogTabClick(event) {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    event.preventDefault();
    const typeId = button.dataset.tab;
    if (!typeId) return;
    setActiveCatalogTab(typeId);
  }

  function handleCatalogTabKeydown(event) {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    const typeId = button.dataset.tab;
    if (!typeId) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = getAdjacentCatalogType(typeId, 1);
      setActiveCatalogTab(next, { focusTab: true, suppressPanelFocus: true });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = getAdjacentCatalogType(typeId, -1);
      setActiveCatalogTab(prev, { focusTab: true, suppressPanelFocus: true });
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = CATALOG_TYPES[0]?.id;
      if (first) {
        setActiveCatalogTab(first, { focusTab: true, suppressPanelFocus: true });
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = CATALOG_TYPES[CATALOG_TYPES.length - 1]?.id;
      if (last) {
        setActiveCatalogTab(last, { focusTab: true, suppressPanelFocus: true });
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveCatalogTab(typeId);
    }
  }

  function buildCatalogPayload(typeId, form) {
    if (!form) return null;
    const { short, long } = getCatalogFieldSets(typeId);
    const fields = [...short, ...long];
    const data = new FormData(form);
    const metadata = {};
    fields.forEach(field => {
      const raw = data.get(field.key);
      metadata[field.key] = sanitizeCatalogValue(raw);
    });
    metadata.category = typeId;
    const typeMeta = catalogTypeLookup.get(typeId);
    if (typeMeta?.label) metadata.categoryLabel = typeMeta.label;
    const locked = data.get('dmLock') != null;
    const recipient = typeof metadata[CATALOG_RECIPIENT_FIELD_KEY] === 'string'
      ? metadata[CATALOG_RECIPIENT_FIELD_KEY]
      : '';
    const payload = {
      type: typeId,
      label: typeMeta?.label || typeId,
      metadata,
      locked,
      timestamp: new Date().toISOString(),
      recipient: recipient || null,
    };
    if (!metadata.name) return null;
    return payload;
  }

  function parseCatalogInteger(value, fallback = 0) {
    if (Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return fallback;
      const match = trimmed.match(/-?\d+/);
      if (match) {
        const parsed = Number(match[0]);
        if (Number.isFinite(parsed)) return Math.trunc(parsed);
      }
    }
    return fallback;
  }

  function getCatalogBoolean(value) {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'on' || normalized === 'true' || normalized === 'yes' || normalized === 'y' || normalized === '1';
    }
    return Boolean(value);
  }

  function sanitizeAttackAbility(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().toLowerCase();
    const allowed = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    return allowed.includes(normalized) ? normalized : '';
  }

  function compileCatalogNotes(metadata = {}) {
    const sections = [];
    const pushSection = (label, value, { prefixLabel = true } = {}) => {
      if (!value) return;
      const text = String(value).trim();
      if (!text) return;
      sections.push(prefixLabel ? `${label}: ${text}` : text);
    };
    pushSection('Overview', metadata.description, { prefixLabel: false });
    pushSection('Mechanical Effects', metadata.mechanics, { prefixLabel: false });
    pushSection('Function', metadata.function);
    pushSection('Availability', metadata.availability);
    pushSection('Operation', metadata.operation);
    pushSection('Usage', metadata.usage);
    pushSection('Special', metadata.special);
    pushSection('Coverage', metadata.coverage);
    pushSection('Duration', metadata.duration);
    pushSection('Tags', metadata.tags);
    pushSection('Cost', metadata.price);
    pushSection('Rarity', metadata.rarity);
    pushSection('Tier', metadata.tier);
    pushSection('Uses', metadata.uses);
    pushSection('Size', metadata.size);
    pushSection('Capacity', metadata.capacity);
    return sections.join('\n\n').trim();
  }

  function convertCatalogPayloadToEquipment(payload) {
    if (!payload || !payload.metadata) return null;
    const { type, metadata } = payload;
    const dmLock = !!payload.locked;
    const metadataWithLock = { ...metadata, dmLock };
    const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
    if (!name) return null;
    if (type === 'items') {
      const qty = Math.max(1, parseCatalogInteger(metadata.quantity ?? metadata.qty, 1));
      const notes = compileCatalogNotes(metadata);
      return {
        type: 'item',
        data: {
          name,
          qty,
          notes,
          dmLock,
        },
        metadata: metadataWithLock,
      };
    }
    if (type === 'weapons') {
      return {
        type: 'weapon',
        data: {
          name,
          damage: typeof metadata.damage === 'string' ? metadata.damage.trim() : '',
          range: typeof metadata.range === 'string' ? metadata.range.trim() : '',
          attackAbility: sanitizeAttackAbility(metadata.attackAbility),
          proficient: getCatalogBoolean(metadata.proficient),
          dmLock,
        },
        metadata: metadataWithLock,
      };
    }
    if (type === 'armor') {
      const bonus = parseCatalogInteger(metadata.bonusValue ?? metadata.defense, 0);
      const slot = typeof metadata.slot === 'string' && metadata.slot.trim() ? metadata.slot.trim() : 'Body';
      return {
        type: 'armor',
        data: {
          name,
          slot,
          bonus,
          equipped: getCatalogBoolean(metadata.equipped),
          dmLock,
        },
        metadata: metadataWithLock,
      };
    }
    return null;
  }

  async function deliverCatalogEquipment(payload) {
    if (!payload || !payload.recipient) return null;
    const equipment = convertCatalogPayloadToEquipment(payload);
    if (!equipment) return null;
    try {
      return await rewardExecutor({
        player: payload.recipient,
        operations: [
          {
            type: equipment.type,
            data: equipment.data,
            metadata: equipment.metadata,
            source: 'catalog',
            label: payload.label || payload.type,
          },
        ],
      });
    } catch (err) {
      throw err;
    }
  }

  function emitCatalogPayload(payload) {
    if (!payload) return;
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent('dm:catalog-submit', { detail: payload }));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('dm:catalog-submit', { detail: payload }));
    }
    const typeLabel = payload.label || payload.type;
    const entryName = payload.metadata?.name || 'Untitled';
    const recipientName = typeof payload.recipient === 'string' && payload.recipient.trim()
      ? payload.recipient.trim()
      : (typeof payload.metadata?.[CATALOG_RECIPIENT_FIELD_KEY] === 'string'
        ? payload.metadata[CATALOG_RECIPIENT_FIELD_KEY].trim()
        : '');
    const recipientSuffix = recipientName ? ` → ${recipientName}` : '';
    toast(`${typeLabel} entry staged: ${entryName}${recipientSuffix}`, 'success');
    window.dmNotify?.(`Catalog entry staged · ${typeLabel}: ${entryName}${recipientSuffix}`, {
      actionScope: 'minor',
    });
    try {
      storeDmCatalogPayload(payload);
    } catch (err) {
      console.error('Failed to persist DM catalog payload', err);
    }
  }

  async function handleCatalogSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;
    const typeId = form.dataset.catalogForm;
    if (!typeId) return;
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
      return;
    }
    const payload = buildCatalogPayload(typeId, form);
    if (!payload) return;
    emitCatalogPayload(payload);
    if (payload.recipient && (payload.type === 'items' || payload.type === 'weapons' || payload.type === 'armor')) {
      try {
        await deliverCatalogEquipment(payload);
      } catch (err) {
        console.error('Failed to deliver catalog equipment', err);
        toast('Failed to deliver catalog reward', 'error');
      }
    }
    form.reset();
    Promise.resolve().then(() => focusCatalogForm());
  }

  function handleCatalogReset(event) {
    const form = event.currentTarget;
    if (!form) return;
    Promise.resolve().then(() => {
      if (form.dataset.catalogForm === activeCatalogType) {
        focusCatalogForm();
      }
    });
  }

  async function openCatalog() {
    await openRewards({ tab: 'catalog' });
  }

  function closeCatalog() {
    closeRewards();
  }

  if (loginPin) {
    loginPin.type = 'password';
    loginPin.autocomplete = 'one-time-code';
    loginPin.inputMode = 'numeric';
    loginPin.pattern = '[0-9]*';
  }

  function applyNotificationContent(node, entry) {
    if (!node) return;
    const resolvedValue = entry?.resolved ? '1' : '0';
    if (typeof node.setAttribute === 'function') {
      node.setAttribute('data-resolved', resolvedValue);
    }
    if (node.classList && typeof node.classList.toggle === 'function') {
      node.classList.toggle('dm-notifications__content--resolved', Boolean(entry?.resolved));
    }
    node.innerHTML = '';

    const message = document.createElement('div');
    message.className = 'dm-notifications__itemMessage';

    if (entry?.html) {
      const htmlWrapper = document.createElement('div');
      htmlWrapper.className = 'dm-notifications__itemHtml';
      htmlWrapper.innerHTML = formatNotification(entry, { html: true });
      message.appendChild(htmlWrapper);
    } else {
      const textWrapper = document.createElement('div');
      textWrapper.className = 'dm-notifications__itemText';
      textWrapper.textContent = formatNotification(entry);
      message.appendChild(textWrapper);
    }

    node.appendChild(message);
  }

  function updateNotificationActionState() {
    const isEmpty = notifications.length === 0;
    const hasUnread = unreadNotificationCount > 0;
    if (notifyClearBtn) notifyClearBtn.disabled = isEmpty;
    if (notifyExportBtn) notifyExportBtn.disabled = isEmpty;
    if (notifyExportFormatRef) notifyExportFormatRef.disabled = isEmpty;
    if (notifyMarkReadBtn) notifyMarkReadBtn.disabled = !hasUnread;
  }

  function clearNotifications({ announce = true } = {}) {
    if (notifications.length === 0) {
      if (announce) toast('Notification log is already empty', 'info');
      return false;
    }
    notifications.length = 0;
    persistNotifications();
    renderStoredNotifications();
    resetUnreadCountValue();
    if (cloudNotificationsState.available) {
      clearCloudNotificationsRemote().catch(() => {});
    }
    if (announce) toast('Notification log cleared', 'info');
    return true;
  }

  async function exportNotifications(formatOverride = null) {
    if (!notifications.length) {
      toast('Notification log is empty', 'info');
      return false;
    }
    const format = normalizeNotificationExportFormat(
      formatOverride != null ? formatOverride : getSelectedNotificationExportFormat()
    );
    const meta = NOTIFICATION_EXPORT_META[format] || NOTIFICATION_EXPORT_META.text;
    const newestFirst = [...notifications].reverse();
    let payload = '';

    if (format === 'text') {
      payload = newestFirst.map(entry => formatNotification(entry)).join('\n');
    } else if (format === 'csv') {
      const headers = ['ts', 'char', 'severity', 'detail'];
      const rows = newestFirst
        .map(entry => mapNotificationForStructuredExport(entry))
        .map(record => headers.map(key => escapeCsvValue(record[key])));
      const csvLines = [headers.join(','), ...rows.map(row => row.join(','))];
      payload = csvLines.join('\n');
    } else {
      const rows = newestFirst.map(entry => mapNotificationForStructuredExport(entry));
      payload = JSON.stringify(rows, ['ts', 'char', 'severity', 'detail'], 2);
    }

    if (!payload) {
      toast('Nothing to export', 'info');
      return false;
    }

    const toastSuffix = meta?.toastSuffix || '';
    if (await writeTextToClipboard(payload)) {
      toast(`Notification log copied to clipboard${toastSuffix}`, 'success');
      return true;
    }

    const filename = buildExportFilename('dm-notifications', meta?.extension);
    const downloadSucceeded = format === 'text'
      ? downloadTextFile(filename, payload)
      : downloadTextFile(filename, payload, { type: meta?.mimeType });
    if (downloadSucceeded) {
      toast(`Notification log exported${toastSuffix}`, 'success');
      return true;
    }
    toast('Unable to export notifications', 'error');
    return false;
  }

  function setNotificationResolved(entry, resolved) {
    if (!entry) return false;
    const next = Boolean(resolved);
    if (!!entry.resolved === next) return false;
    entry.resolved = next;
    persistNotifications();
    clampUnreadCountToUnresolved();
    renderStoredNotifications();
    if (cloudNotificationsState.available) {
      updateCloudNotification(entry);
    }
    return true;
  }

  function renderStoredNotifications() {
    if (!notifyList || !isLoggedIn()) {
      updateNotificationActionState();
      return;
    }
    const characters = new Set();
    let hasEmptySeverity = false;
    const dynamicSeverities = new Set();
    notifications.forEach(entry => {
      const charValue = typeof entry?.char === 'string' ? entry.char.trim() : '';
      characters.add(charValue);
      const severityValue = typeof entry?.severity === 'string' ? entry.severity.trim().toLowerCase() : '';
      if (severityValue) {
        dynamicSeverities.add(severityValue);
      } else {
        hasEmptySeverity = true;
      }
    });

    const characterOptions = ['all', ...Array.from(characters).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
    const severityOptions = Array.from(new Set([
      'all',
      ...KNOWN_NOTIFICATION_SEVERITIES,
      ...Array.from(dynamicSeverities),
      ...(hasEmptySeverity ? [''] : []),
    ]));
    const resolutionOptions = ['all', 'unresolved', 'resolved'];

    const normalizedCharacter = typeof notificationFilterState.character === 'string'
      ? notificationFilterState.character
      : 'all';
    const normalizedSeverity = typeof notificationFilterState.severity === 'string'
      ? notificationFilterState.severity
      : 'all';
    const normalizedSearch = typeof notificationFilterState.search === 'string'
      ? notificationFilterState.search
      : '';
    const normalizedResolved = typeof notificationFilterState.resolved === 'string'
      ? notificationFilterState.resolved
      : 'all';

    const characterSet = new Set(characterOptions);
    const severitySet = new Set(severityOptions);
    const resolutionSet = new Set(resolutionOptions);

    let selectedCharacter = characterSet.has(normalizedCharacter) ? normalizedCharacter : 'all';
    let selectedSeverity = severitySet.has(normalizedSeverity) ? normalizedSeverity : 'all';
    let selectedSearch = normalizedSearch;
    let selectedResolved = resolutionSet.has(normalizedResolved) ? normalizedResolved : 'all';

    const sanitizedStateChanged = (
      selectedCharacter !== notificationFilterState.character
      || selectedSeverity !== notificationFilterState.severity
      || selectedSearch !== notificationFilterState.search
      || selectedResolved !== notificationFilterState.resolved
    );

    notificationFilterState = {
      character: selectedCharacter,
      severity: selectedSeverity,
      search: selectedSearch,
      resolved: selectedResolved,
    };
    if (sanitizedStateChanged) {
      persistNotificationFilterState();
    }

    if (notifyFilterCharacter) {
      const fragment = document.createDocumentFragment();
      characterOptions.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'all' ? 'All characters' : (value || 'Unassigned');
        fragment.appendChild(option);
      });
      notifyFilterCharacter.innerHTML = '';
      notifyFilterCharacter.appendChild(fragment);
      if (characterSet.has(notificationFilterState.character)) {
        notifyFilterCharacter.value = notificationFilterState.character;
      } else {
        notifyFilterCharacter.value = 'all';
        notificationFilterState.character = 'all';
        persistNotificationFilterState();
      }
    }

    if (notifyFilterSeverity) {
      const fragment = document.createDocumentFragment();
      severityOptions.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === 'all'
          ? 'All severities'
          : (value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unspecified');
        fragment.appendChild(option);
      });
      notifyFilterSeverity.innerHTML = '';
      notifyFilterSeverity.appendChild(fragment);
      if (severitySet.has(notificationFilterState.severity)) {
        notifyFilterSeverity.value = notificationFilterState.severity;
      } else {
        notifyFilterSeverity.value = 'all';
        notificationFilterState.severity = 'all';
        persistNotificationFilterState();
      }
    }

    if (notifyFilterResolved) {
      const fragment = document.createDocumentFragment();
      resolutionOptions.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        if (value === 'all') {
          option.textContent = 'All notifications';
        } else if (value === 'resolved') {
          option.textContent = 'Resolved only';
        } else {
          option.textContent = 'Unresolved only';
        }
        fragment.appendChild(option);
      });
      notifyFilterResolved.innerHTML = '';
      notifyFilterResolved.appendChild(fragment);
      if (resolutionSet.has(notificationFilterState.resolved)) {
        notifyFilterResolved.value = notificationFilterState.resolved;
      } else {
        notifyFilterResolved.value = 'all';
        notificationFilterState.resolved = 'all';
        persistNotificationFilterState();
      }
    }

    if (notifyFilterSearch && notifyFilterSearch.value !== notificationFilterState.search) {
      notifyFilterSearch.value = notificationFilterState.search;
    }

    const trimmedSearch = notificationFilterState.search.trim().toLowerCase();
    const filteredNotifications = notifications.filter(entry => {
      const charValue = typeof entry?.char === 'string' ? entry.char.trim() : '';
      if (notificationFilterState.character !== 'all' && charValue !== notificationFilterState.character) {
        return false;
      }
      const severityValue = typeof entry?.severity === 'string' ? entry.severity.trim().toLowerCase() : '';
      if (notificationFilterState.severity !== 'all' && severityValue !== notificationFilterState.severity) {
        return false;
      }
      if (notificationFilterState.resolved === 'resolved' && !entry.resolved) {
        return false;
      }
      if (notificationFilterState.resolved === 'unresolved' && entry.resolved) {
        return false;
      }
      if (trimmedSearch) {
        const haystack = [
          entry.detail,
          entry.html,
          entry.char,
          entry.severity,
          entry.ts,
        ]
          .filter(value => typeof value === 'string' && value)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(trimmedSearch)) {
          return false;
        }
      }
      return true;
    });

    notifyList.innerHTML = '';
    const buildSeverityModifier = severityValue => {
      if (!severityValue) return '';
      const sanitized = severityValue.replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      return sanitized || 'custom';
    };

    filteredNotifications.forEach(entry => {
      const li = document.createElement('li');
      li.classList.add('dm-notifications__item');
      li.classList.toggle('dm-notifications__item--resolved', Boolean(entry.resolved));
      li.setAttribute('data-resolved', entry.resolved ? '1' : '0');

      const severityValue = typeof entry?.severity === 'string' ? entry.severity.trim().toLowerCase() : '';
      if (severityValue) {
        li.setAttribute('data-severity', severityValue);
        const severityModifier = buildSeverityModifier(severityValue);
        li.classList.add('dm-notifications__item--hasSeverity', `dm-notifications__item--severity-${severityModifier}`);
      }

      const content = document.createElement('div');
      content.className = 'dm-notifications__itemContent';
      applyNotificationContent(content, entry);

      if (severityValue) {
        content.setAttribute('data-severity', severityValue);
        const badge = document.createElement('span');
        badge.className = 'dm-notifications__severityBadge';
        badge.textContent = severityValue.charAt(0).toUpperCase() + severityValue.slice(1);
        content.prepend(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'dm-notifications__itemActions';

      const status = document.createElement('span');
      status.className = 'dm-notifications__itemStatus';
      status.textContent = entry.resolved ? 'Resolved' : 'Unresolved';
      status.classList.toggle('dm-notifications__itemStatus--resolved', Boolean(entry.resolved));
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn-sm dm-notifications__toggleResolved';
      toggleBtn.textContent = entry.resolved ? 'Mark unresolved' : 'Mark resolved';
      toggleBtn.setAttribute('aria-pressed', entry.resolved ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', entry.resolved ? 'Mark notification unresolved' : 'Mark notification resolved');
      toggleBtn.addEventListener('click', () => {
        setNotificationResolved(entry, !entry.resolved);
      });

      actions.appendChild(status);
      actions.appendChild(toggleBtn);

      li.appendChild(content);
      li.appendChild(actions);

      notifyList.prepend(li);
    });
    updateNotificationActionState();
  }

  function rebuildNotificationsFromCloudCache({ fallback } = {}) {
    const entries = Array.from(cloudNotificationsState.cache.values());
    if (entries.length > 0) {
      entries.sort((a, b) => {
        const aCreated = Number.isFinite(a?.createdAt) ? a.createdAt : 0;
        const bCreated = Number.isFinite(b?.createdAt) ? b.createdAt : 0;
        if (aCreated !== bCreated) return aCreated - bCreated;
        const aTs = typeof a?.ts === 'string' ? a.ts : '';
        const bTs = typeof b?.ts === 'string' ? b.ts : '';
        return aTs.localeCompare(bTs, undefined, { sensitivity: 'base' });
      });
      const trimmed = entries.slice(Math.max(0, entries.length - MAX_STORED_NOTIFICATIONS));
      notifications.splice(0, notifications.length, ...trimmed);
    } else if (Array.isArray(fallback) && fallback.length) {
      const copy = fallback.slice(Math.max(0, fallback.length - MAX_STORED_NOTIFICATIONS));
      notifications.splice(0, notifications.length, ...copy);
    } else {
      notifications.length = 0;
    }
    persistNotifications();
    clampUnreadCountToUnresolved();
    renderStoredNotifications();
    updateNotificationActionState();
  }

  function applyCloudSnapshot(snapshot, { fallback } = {}) {
    cloudNotificationsState.cache.clear();
    if (snapshot && typeof snapshot === 'object') {
      Object.entries(snapshot).forEach(([id, value]) => {
        const normalized = normalizeStoredNotification(value, { id });
        if (normalized) {
          cloudNotificationsState.cache.set(id, normalized);
        }
      });
    }
    rebuildNotificationsFromCloudCache({ fallback });
  }

  function applyCloudDelta(path, data) {
    if (!cloudNotificationsState.available) return;
    if (!path || path === '/' || path === '') {
      applyCloudSnapshot(data, { fallback: notifications.slice() });
      return;
    }
    const key = path.replace(/^\/+/, '');
    if (!key) {
      applyCloudSnapshot(data, { fallback: notifications.slice() });
      return;
    }
    if (data === null) {
      cloudNotificationsState.cache.delete(key);
    } else {
      const normalized = normalizeStoredNotification(data, { id: key });
      if (normalized) {
        cloudNotificationsState.cache.set(key, normalized);
      } else {
        cloudNotificationsState.cache.delete(key);
      }
    }
    rebuildNotificationsFromCloudCache({ fallback: notifications.slice() });
  }

  async function enforceCloudNotificationLimit() {
    if (!cloudNotificationsState.available || cloudNotificationsState.pruning) return;
    if (typeof fetch !== 'function') return;
    const entries = Array.from(cloudNotificationsState.cache.entries());
    if (entries.length <= MAX_STORED_NOTIFICATIONS) return;
    cloudNotificationsState.pruning = true;
    entries.sort((a, b) => {
      const aCreated = Number.isFinite(a[1]?.createdAt) ? a[1].createdAt : 0;
      const bCreated = Number.isFinite(b[1]?.createdAt) ? b[1].createdAt : 0;
      if (aCreated !== bCreated) return aCreated - bCreated;
      return String(a[0]).localeCompare(String(b[0]));
    });
    const overflow = entries.slice(0, entries.length - MAX_STORED_NOTIFICATIONS);
    const removed = [];
    overflow.forEach(([id, record]) => {
      removed.push([id, record]);
      cloudNotificationsState.cache.delete(id);
    });
    rebuildNotificationsFromCloudCache({ fallback: notifications.slice() });
    try {
      await Promise.all(removed.map(([id]) => fetch(`${CLOUD_DM_NOTIFICATIONS_URL}/${encodeURIComponent(id)}.json`, { method: 'DELETE' })));
    } catch (err) {
      console.error('Failed to trim DM notifications in cloud', err);
      removed.forEach(([id, record]) => {
        cloudNotificationsState.cache.set(id, record);
      });
      rebuildNotificationsFromCloudCache({ fallback: notifications.slice() });
    } finally {
      cloudNotificationsState.pruning = false;
    }
  }

  async function pushCloudNotification(entry) {
    if (!cloudNotificationsState.available || typeof fetch !== 'function') return null;
    if (!entry || typeof entry.detail !== 'string') return null;
    const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now();
    entry.createdAt = createdAt;
    const payload = {
      ts: entry.ts,
      char: entry.char,
      detail: entry.detail,
      resolved: entry.resolved === true,
      createdAt,
    };
    if (typeof entry.severity === 'string' && entry.severity) payload.severity = entry.severity;
    if (typeof entry.html === 'string' && entry.html) payload.html = entry.html;
    try {
      const res = await fetch(`${CLOUD_DM_NOTIFICATIONS_URL}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const ok = typeof res?.ok === 'boolean' ? res.ok : true;
      if (!ok) {
        const status = typeof res?.status === 'number' ? res.status : 'unknown';
        throw new Error(`HTTP ${status}`);
      }
      const data = typeof res?.json === 'function' ? await res.json() : null;
      const id = typeof data?.name === 'string' ? data.name : null;
      if (id) {
        const normalized = normalizeStoredNotification(payload, { id, fallbackCreatedAt: createdAt });
        if (normalized) {
          if (payload.html && !normalized.html) normalized.html = payload.html;
          cloudNotificationsState.cache.set(id, normalized);
          entry.id = id;
          entry.createdAt = normalized.createdAt;
          rebuildNotificationsFromCloudCache({ fallback: notifications.slice() });
        }
        await enforceCloudNotificationLimit();
      }
      return id;
    } catch (err) {
      console.error('Failed to write DM notification to cloud', err);
      throw err;
    }
  }

  async function updateCloudNotification(entry) {
    if (!cloudNotificationsState.available || typeof fetch !== 'function') return;
    if (!entry?.id) return;
    try {
      await fetch(`${CLOUD_DM_NOTIFICATIONS_URL}/${encodeURIComponent(entry.id)}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: entry.resolved === true }),
      });
      const cached = cloudNotificationsState.cache.get(entry.id);
      if (cached) {
        cached.resolved = entry.resolved === true;
        cloudNotificationsState.cache.set(entry.id, cached);
        rebuildNotificationsFromCloudCache({ fallback: notifications.slice() });
      }
    } catch (err) {
      console.error('Failed to update DM notification in cloud', err);
    }
  }

  async function clearCloudNotificationsRemote() {
    if (!cloudNotificationsState.available || typeof fetch !== 'function') return;
    try {
      await fetch(`${CLOUD_DM_NOTIFICATIONS_URL}.json`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear DM notifications in cloud', err);
    } finally {
      cloudNotificationsState.cache.clear();
    }
  }

  function subscribeToCloudNotifications() {
    if (!cloudNotificationsState.available) return null;
    if (cloudNotificationsState.subscription || typeof EventSource !== 'function') {
      return cloudNotificationsState.subscription;
    }
    try {
      const src = new EventSource(`${CLOUD_DM_NOTIFICATIONS_URL}.json`);
      const handler = event => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload) return;
          applyCloudDelta(payload.path, payload.data);
          enforceCloudNotificationLimit().catch(err => {
            console.error('Failed to enforce DM notification limit', err);
          });
        } catch (err) {
          console.error('Failed to process DM notification update', err);
        }
      };
      src.addEventListener('put', handler);
      src.addEventListener('patch', handler);
      src.onerror = () => {
        try { src.close(); } catch {}
        cloudNotificationsState.subscription = null;
        setTimeout(() => {
          if (cloudNotificationsState.available) {
            subscribeToCloudNotifications();
          }
        }, 2000);
      };
      cloudNotificationsState.subscription = src;
      return src;
    } catch (err) {
      console.error('Failed to subscribe to DM notifications', err);
      return null;
    }
  }

  async function migrateLegacyNotificationsToCloud(legacyEntries = []) {
    if (!cloudNotificationsState.available || !Array.isArray(legacyEntries) || legacyEntries.length === 0) {
      return false;
    }
    let migratedCount = 0;
    for (const entry of legacyEntries) {
      const normalized = normalizeStoredNotification(entry, { fallbackCreatedAt: entry?.createdAt });
      if (!normalized) continue;
      Object.assign(entry, normalized);
      try {
        const id = await pushCloudNotification(entry);
        if (id) migratedCount += 1;
      } catch (err) {
        console.error('Failed to migrate legacy DM notification', err);
      }
    }
    if (migratedCount > 0) {
      try {
        sessionStorage.removeItem(DM_NOTIFICATIONS_KEY);
        persistNotifications();
      } catch { /* ignore */ }
    }
    return migratedCount === legacyEntries.length;
  }

  async function initializeCloudNotifications() {
    if (!cloudNotificationsState.enabled) return;
    if (cloudNotificationsState.initializing) return;
    if (typeof fetch !== 'function') return;
    cloudNotificationsState.initializing = true;
    const fallbackSnapshot = notifications.slice();
    const legacyEntries = notifications.filter(entry => !entry?.id).map(entry => ({ ...entry }));
    try {
      const res = await fetch(`${CLOUD_DM_NOTIFICATIONS_URL}.json`);
      const ok = typeof res?.ok === 'boolean' ? res.ok : true;
      if (!ok) {
        const status = typeof res?.status === 'number' ? res.status : 'unknown';
        throw new Error(`HTTP ${status}`);
      }
      const snapshot = typeof res?.json === 'function' ? await res.json() : null;
      cloudNotificationsState.available = true;
      applyCloudSnapshot(snapshot, { fallback: fallbackSnapshot });
      await enforceCloudNotificationLimit();
      if (legacyEntries.length) {
        await migrateLegacyNotificationsToCloud(legacyEntries);
      }
      subscribeToCloudNotifications();
    } catch (err) {
      if (cloudNotificationsState.enabled) {
        console.warn('Cloud DM notifications unavailable', err);
      }
    } finally {
      cloudNotificationsState.initializing = false;
    }
  }

  function storePendingNotification(entry) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      let pending = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) pending = parsed;
      }
      pending.push({
        ts: entry.ts,
        char: entry.char,
        detail: entry.detail,
        severity: entry.severity,
        html: entry.html,
        createdAt: entry.createdAt,
        resolved: entry.resolved === true,
        actionScope: entry.actionScope,
      });
      const MAX_PENDING = 20;
      if (pending.length > MAX_PENDING) {
        pending = pending.slice(pending.length - MAX_PENDING);
      }
      sessionStorage.setItem(PENDING_DM_NOTIFICATIONS_KEY, JSON.stringify(pending));
    } catch {
      /* ignore persistence errors */
    }
  }

  function pushNotification(entry) {
    const actionScope = normalizeNotificationActionScope(
      entry?.actionScope ?? entry?.scope ?? entry?.kind ?? entry?.actionType,
      entry?.detail,
    );
    if (!actionScope) return;
    entry.actionScope = actionScope;
    if (cloudNotificationsState.enabled && !cloudNotificationsState.available) {
      initializeCloudNotifications();
    }
    if (!isLoggedIn()) {
      storePendingNotification(entry);
      return;
    }
    const resolved = entry?.resolved === true
      || entry?.resolved === 'true'
      || entry?.resolved === 1;
    entry.resolved = Boolean(resolved);
    notifications.push(entry);
    if (notifications.length > MAX_STORED_NOTIFICATIONS) {
      notifications.splice(0, notifications.length - MAX_STORED_NOTIFICATIONS);
    }
    persistNotifications();
    renderStoredNotifications();
    const isResolved = entry.resolved === true;
    if (!isResolved) {
      playNotificationTone();
      if (isNotificationsModalHidden()) {
        incrementUnreadCount();
      } else {
        resetUnreadCountValue();
      }
    }
    clampUnreadCountToUnresolved();
    updateNotificationActionState();
    if (cloudNotificationsState.available) {
      pushCloudNotification(entry).catch(err => {
        console.error('Failed to sync DM notification to cloud', err);
      });
    }
  }

  persistNotifications();
  updateNotificationActionState();
  clampUnreadCountToUnresolved();
  if (cloudNotificationsState.enabled) {
    initializeCloudNotifications();
  }

  window.dmNotify = function(detail, meta = {}) {
    const entry = buildNotification(detail, meta);
    if (!entry) return;
    pushNotification(entry);
  };

  function drainPendingNotifications() {
    if (!isLoggedIn()) return;
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach(item => {
        if (!item || typeof item.detail !== 'string') return;
        window.dmNotify(item.detail, {
          ts: item.ts,
          char: item.char,
          severity: item.severity,
          html: item.html,
          createdAt: item.createdAt,
          resolved: item.resolved,
          actionScope: item.actionScope,
        });
      });
      sessionStorage.removeItem(PENDING_DM_NOTIFICATIONS_KEY);
    } catch {
      /* ignore draining errors */
    }
  }

  drainPendingNotifications();

  function isLoggedIn(){
    try {
      if (sessionStorage.getItem(DM_LOGIN_FLAG_KEY) !== '1') return false;
      const timeoutMs = getSessionTimeoutMs();
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        if (!getSessionTimestamp(DM_LOGIN_AT_KEY)) {
          const now = Date.now();
          setSessionTimestamp(DM_LOGIN_AT_KEY, now);
          touchSessionActivity(now);
        }
        return true;
      }
      const lastActive = getSessionTimestamp(DM_LOGIN_LAST_ACTIVE_KEY);
      const loggedAt = getSessionTimestamp(DM_LOGIN_AT_KEY);
      const reference = lastActive ?? loggedAt;
      if (!reference) {
        const now = Date.now();
        setSessionTimestamp(DM_LOGIN_AT_KEY, now);
        touchSessionActivity(now);
        return true;
      }
      if (Date.now() - reference > timeoutMs) {
        logout({ reason: 'expired' });
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function setLoggedIn(){
    try {
      const now = Date.now();
      sessionStorage.setItem(DM_LOGIN_FLAG_KEY,'1');
      setSessionTimestamp(DM_LOGIN_AT_KEY, now);
      touchSessionActivity(now);
      sessionWarningToastShown = false;
    } catch {
      /* ignore */
    }
  }

  function clearLoggedIn(){
    try {
      sessionStorage.removeItem(DM_LOGIN_FLAG_KEY);
      clearSessionTimestamp(DM_LOGIN_AT_KEY);
      clearSessionTimestamp(DM_LOGIN_LAST_ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }

  function clearNotificationDisplay() {
    if (notifyList) notifyList.innerHTML = '';
    updateNotificationActionState();
    closeNotifications();
  }

  function updateButtons(){
    const loggedIn = isLoggedIn();
    if (!loggedIn) closeMenu();
    if (!loggedIn) {
      clearNotificationDisplay();
    } else {
      renderStoredNotifications();
    }
    if (dmBtn){
      dmBtn.hidden = loggedIn;
      if (loggedIn) {
        dmBtn.style.opacity = '1';
        dmBtn.setAttribute('aria-hidden', 'true');
      } else {
        dmBtn.style.opacity = '';
        dmBtn.removeAttribute('aria-hidden');
      }
    }
    if (dmToggleBtn) {
      dmToggleBtn.hidden = !loggedIn;
      const expanded = loggedIn && menu && menu.classList.contains(MENU_OPEN_CLASS);
      dmToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    ensureSessionStatusUpdates(loggedIn);
  }

  function logDmInitError(error) {
    console.error('Failed to init DM tools', error);
    try {
      dismissToast();
    } catch {
      /* ignore */
    }
    try {
      toast(DM_INIT_ERROR_MESSAGE, 'error');
    } catch {
      /* ignore */
    }
  }

  function initTools(){
    try {
      if (typeof window.initSomfDM !== 'function') return;
      const maybePromise = window.initSomfDM();
      if (maybePromise && typeof maybePromise.then === 'function') {
        Promise.resolve(maybePromise).catch(logDmInitError);
      }
    } catch (e) {
      logDmInitError(e);
    }
  }

  function openLogin(){
    if(!loginModal || !loginPin) return;
    show('dm-login-modal');
    loginPin.value='';
    loginPin.focus();
  }

  function closeLogin(){
    if(!loginModal) return;
    hide('dm-login-modal');
  }

  function requireLogin(){
    return new Promise((resolve, reject) => {
      if (isLoggedIn()) {
        updateButtons();
        resolve(true);
        return;
      }

      if (!isAuthorizedDevice()) {
        closeLogin();
        const error = new Error('unauthorized-device');
        error.code = 'unauthorized-device';
        toast('This device is not authorized to access the DM tools.', 'error');
        reject(error);
        return;
      }

      // If the modal elements are missing, fall back to a simple prompt so
      // the promise always resolves and loading doesn't hang.
      if (!loginModal || !loginPin || !loginSubmit) {
        const remaining = getLoginCooldownRemainingMs();
        if (remaining > 0) {
          notifyLoginCooldown(remaining);
          reject(new Error('throttled'));
          return;
        }
        (async () => {
          const entered = window.pinPrompt ? await window.pinPrompt('Enter DM PIN') : (typeof prompt === 'function' ? prompt('Enter DM PIN') : null);
          if (await verifyDmPin(entered)) {
            resetLoginFailureState();
            clearLoginCooldownTimer();
            clearLoginCooldownUI();
            onLoginSuccess();
            dismissToast();
            toast('DM tools unlocked','success');
            resolve(true);
          } else {
            recordLoginFailure();
            toast('Invalid PIN','error');
            const cooldown = getLoginCooldownRemainingMs();
            if (cooldown > 0) {
              notifyLoginCooldown(cooldown);
            }
            reject(new Error('Invalid PIN'));
          }
        })();
        return;
      }

      openLogin();
      const initialRemaining = getLoginCooldownRemainingMs();
      if (initialRemaining > 0) {
        startLoginCooldownCountdown(initialRemaining);
        notifyLoginCooldown(initialRemaining);
      } else {
        clearLoginCooldownUI();
        toast('Enter DM PIN','info');
      }
      function cleanup(){
        loginSubmit?.removeEventListener('click', onSubmit);
        loginPin?.removeEventListener('keydown', onKey);
        loginModal?.removeEventListener('click', onOverlay);
        loginClose?.removeEventListener('click', onCancel);
        clearLoginCooldownTimer();
      }
      async function onSubmit(){
        const activeCooldown = getLoginCooldownRemainingMs();
        if (activeCooldown > 0) {
          startLoginCooldownCountdown(activeCooldown);
          notifyLoginCooldown(activeCooldown);
          return;
        }
        lockLoginControls();
        const isValid = verifyDmPin(loginPin.value);
        if(isValid){
          resetLoginFailureState();
          clearLoginCooldownTimer();
          clearLoginCooldownUI();
          onLoginSuccess();
          closeLogin();
          dismissToast();
          toast('DM tools unlocked','success');
          cleanup();
          resolve(true);
        } else {
          loginPin.value='';
          if (!loginPin.disabled) {
            try {
              loginPin.focus({ preventScroll: true });
            } catch {
              if (typeof loginPin.focus === 'function') loginPin.focus();
            }
          }
          toast('Invalid PIN','error');
          const failureState = recordLoginFailure();
          const cooldown = failureState.lockUntil > Date.now()
            ? failureState.lockUntil - Date.now()
            : getLoginCooldownRemainingMs();
          if (cooldown > 0) {
            startLoginCooldownCountdown(cooldown);
            notifyLoginCooldown(cooldown);
          } else {
            clearLoginCooldownUI();
          }
        }
      }
      function onKey(e){ if(e.key==='Enter') onSubmit(); }
      function onCancel(){ closeLogin(); cleanup(); reject(new Error('cancel')); }
      function onOverlay(e){ if(e.target===loginModal) onCancel(); }
      loginSubmit?.addEventListener('click', onSubmit);
      loginPin?.addEventListener('keydown', onKey);
      loginModal?.addEventListener('click', onOverlay);
      loginClose?.addEventListener('click', onCancel);
    });
  }

  function logout(reason){
    if (reason && typeof reason.preventDefault === 'function') {
      try {
        reason.preventDefault();
      } catch {
        /* ignore */
      }
    }
    const cause = typeof reason === 'string'
      ? reason
      : typeof reason === 'object' && reason && typeof reason.reason === 'string'
        ? reason.reason
        : null;
    clearLoggedIn();
    teardownMiniGameSubscription();
    closeMiniGames();
      closeRewards();
    catalogForms.forEach(form => {
      try {
        form.reset();
      } catch {
        /* ignore reset errors */
      }
    });
    updateButtons();
    if (cause === 'expired') {
      toast('DM session expired. Please log in again.', 'warning');
    } else {
      toast('Logged out','info');
    }
  }

  function clearMenuHideJobs(){
    if (menuTransitionHandler && menu) {
      menu.removeEventListener('transitionend', menuTransitionHandler);
    }
    menuTransitionHandler = null;
    if (menuHideTimer !== null) {
      const clearTimer = typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
        ? window.clearTimeout
        : clearTimeout;
      clearTimer(menuHideTimer);
      menuHideTimer = null;
    }
  }

  function finalizeMenuHide(){
    clearMenuHideJobs();
    if (menu) {
      menu.hidden = true;
    }
  }

  function scheduleMenuHide(){
    clearMenuHideJobs();
    if (!menu) return;
    menuTransitionHandler = event => {
      if (event?.target !== menu) return;
      finalizeMenuHide();
    };
    menu.addEventListener('transitionend', menuTransitionHandler);
    const setTimer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout
      : setTimeout;
    menuHideTimer = setTimer(finalizeMenuHide, 360);
  }

  function closeMenu(){
    if (!menu || !menu.classList.contains(MENU_OPEN_CLASS)) return;
    const restoreToggleFocus = menu.contains(document.activeElement);
    menu.classList.remove(MENU_OPEN_CLASS);
    menu.setAttribute('aria-hidden','true');
    scheduleMenuHide();
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', 'false');
      if (restoreToggleFocus && !dmToggleBtn.hidden && typeof dmToggleBtn.focus === 'function') {
        try {
          dmToggleBtn.focus({ preventScroll: true });
        } catch {
          dmToggleBtn.focus();
        }
      }
    }
  }

  function openMenu({ focusFirst = false } = {}){
    if (!menu || menu.classList.contains(MENU_OPEN_CLASS)) return;
    clearMenuHideJobs();
    menu.hidden = false;
    menu.setAttribute('aria-hidden','false');
    menu.classList.add(MENU_OPEN_CLASS);
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (focusFirst) {
      const firstItem = menu.querySelector('button');
      if (firstItem) {
        try {
          firstItem.focus({ preventScroll: true });
        } catch {
          firstItem.focus();
        }
      }
    }
  }

  function toggleMenu({ focusMenu = false } = {}){
    if (!menu) return;
    if (menu.classList.contains(MENU_OPEN_CLASS)) {
      closeMenu();
    } else {
      openMenu({ focusFirst: focusMenu });
    }
  }

  function openNotifications(){
    if(!notifyModal) return;
    resetUnreadCountValue();
    renderStoredNotifications();
    updateNotificationActionState();
    show('dm-notifications-modal');
  }

  function closeNotifications(){
    if(!notifyModal) return;
    resetUnreadCountValue();
    updateNotificationActionState();
    hide('dm-notifications-modal');
  }

  function onLoginSuccess(){
    resetLoginFailureState();
    clearLoginCooldownTimer();
    clearLoginCooldownUI();
    setLoggedIn();
    updateButtons();
    drainPendingNotifications();
    ensureMiniGameSubscription();
    initTools();
  }

  const characterNameCollator = typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
    ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
    : null;

  function updateCharacterSortButtons(){
    if (!charSortButtons || !charSortButtons.length) return;
    charSortButtons.forEach(btn => {
      const mode = btn?.dataset?.charSort === 'desc' ? 'desc' : 'asc';
      const isActive = mode === activeCharacterSort;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function sortCharacterNames(names){
    const list = Array.isArray(names) ? names.slice() : [];
    if (characterNameCollator) {
      list.sort((a, b) => characterNameCollator.compare(a, b));
    } else {
      list.sort((a, b) => String(a).localeCompare(String(b)));
    }
    if (activeCharacterSort === 'desc') {
      list.reverse();
    }
    return list;
  }

  function focusCharacterLink(name){
    if (!name || !charList) return false;
    const links = Array.from(charList.querySelectorAll('.dm-characters__link'));
    const target = links.find(link => (link.dataset?.characterName || link.textContent?.trim()) === name);
    if (!target) return false;
    lastFocusedCharacter = name;
    if (typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    }
    return true;
  }

  function renderCharacterList({ focus = 'auto' } = {}){
    if (!charList) return;
    const base = Array.isArray(allCharacters)
      ? allCharacters.filter(name => typeof name === 'string' && name)
      : [];
    const query = activeCharacterFilter.trim().toLowerCase();
    let filtered = base;
    if (query) {
      filtered = base.filter(name => name.toLowerCase().includes(query));
    }
    if (!filtered.length) {
      const message = base.length
        ? 'No matching characters.'
        : 'No characters available.';
      charList.innerHTML = `<li class="dm-characters__placeholder">${message}</li>`;
      return;
    }
    const ordered = sortCharacterNames(filtered);
    charList.innerHTML = '';
    const frag = document.createDocumentFragment();
    ordered.forEach(name => {
      const item = document.createElement('li');
      item.className = 'dm-characters__item';
      const link = document.createElement('a');
      link.href = '#';
      link.setAttribute('role', 'button');
      link.className = 'dm-characters__link';
      link.dataset.characterName = name;
      link.textContent = name;
      item.appendChild(link);
      frag.appendChild(item);
    });
    charList.appendChild(frag);

    if (document.activeElement === charSearch || focus === 'none') {
      return;
    }

    if (focus === 'preserve' && lastFocusedCharacter) {
      if (ordered.includes(lastFocusedCharacter) && focusCharacterLink(lastFocusedCharacter)) {
        return;
      }
    }

    if (ordered.length && (focus === 'first' || focus === 'auto' || focus === 'preserve')) {
      focusCharacterLink(ordered[0]);
    }
  }

  charList?.addEventListener('focusin', event => {
    const link = event.target?.closest?.('.dm-characters__link');
    if (!link) return;
    const name = link.dataset?.characterName || link.textContent?.trim();
    if (name) {
      lastFocusedCharacter = name;
    }
  });

  charSearch?.addEventListener('input', () => {
    activeCharacterFilter = charSearch.value || '';
    renderCharacterList({ focus: document.activeElement === charSearch ? 'none' : 'preserve' });
  });

  charSortButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn?.dataset?.charSort === 'desc' ? 'desc' : 'asc';
      if (activeCharacterSort === mode) {
        updateCharacterSortButtons();
        renderCharacterList({ focus: 'preserve' });
        return;
      }
      activeCharacterSort = mode;
      updateCharacterSortButtons();
      renderCharacterList({ focus: 'preserve' });
    });
  });

    async function openCharacters(){
      if(!charModal || !charList) return;
      closeCharacterView();
      show('dm-characters-modal');
      charList.innerHTML = '<li class="dm-characters__placeholder">Loading characters…</li>';
      let names = [];
      try {
        names = await listCharacters();
      }
      catch(e){
        console.error('Failed to list characters', e);
        charList.innerHTML = '<li class="dm-characters__placeholder">Unable to load characters.</li>';
        allCharacters = [];
        activeCharacterFilter = '';
        updateCharacterSortButtons();
        return;
      }
      if (!Array.isArray(names) || names.length === 0) {
        charList.innerHTML = '<li class="dm-characters__placeholder">No characters available.</li>';
        allCharacters = [];
        activeCharacterFilter = '';
        if (charSearch) {
          charSearch.value = '';
        }
        updateCharacterSortButtons();
        return;
      }
      allCharacters = names
        .map(name => {
          if (typeof name === 'string') return name.trim();
          if (name == null) return '';
          return String(name).trim();
        })
        .filter(Boolean);
      if (!allCharacters.length) {
        charList.innerHTML = '<li class="dm-characters__placeholder">No characters available.</li>';
        updateCharacterSortButtons();
        return;
      }
      activeCharacterFilter = '';
      lastFocusedCharacter = '';
      if (charSearch) {
        charSearch.value = '';
      }
      updateCharacterSortButtons();
      renderCharacterList({ focus: 'first' });
    }

  function closeCharacters(){
    if(!charModal) return;
    hide('dm-characters-modal');
  }

  function openCharacterView(){
    if(!charViewModal) return;
    show('dm-character-modal');
  }

  function closeCharacterView(){
    if(!charViewModal) return;
    hide('dm-character-modal');
  }

    function characterCard(data, name){
      const card=document.createElement('div');
      card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
      const labeled=(l,v)=>v?`<div><span style="opacity:.8;font-size:12px">${l}</span><div>${v}</div></div>`:'';
      const abilityGrid=['STR','DEX','CON','INT','WIS','CHA']
        .map(k=>labeled(k,data[k.toLowerCase()]||''))
        .join('');
      const perkGrid=[
        ['Alignment', data.alignment],
        ['Classification', data.classification],
        ['Power Style', data['power-style']],
        ['Origin', data.origin],
        ['Tier', data.tier]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      const statsGrid=[
        ['Init', data.initiative],
        ['Speed', data.speed],
        ['PP', data.pp]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      card.innerHTML=`
        <div><strong>${name}</strong></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
          ${labeled('HP', data['hp-bar']||'')}
          ${labeled('TC', data.tc||'')}
          ${labeled('SP', data['sp-bar']||'')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
        ${perkGrid?`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px">${perkGrid}</div>`:''}
        ${statsGrid?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${statsGrid}</div>`:''}
      `;
      const renderList=(title, items)=>`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">${title}</span><ul style=\"margin:4px 0 0 18px;padding:0\">${items.join('')}</ul></div>`;
      const renderPowerEntry = (entry, { fallback = 'Power' } = {}) => {
        if (entry && typeof entry === 'object') {
          const isModern = (
            entry.rulesText !== undefined
            || entry.effectTag !== undefined
            || entry.spCost !== undefined
            || entry.intensity !== undefined
            || entry.actionType !== undefined
            || entry.signature
          );
          if (isModern) {
            const costValue = Number(entry.spCost);
            const costLabel = Number.isFinite(costValue) && costValue > 0 ? `${costValue} SP` : '';
            return `<li>${
              labeled('Name', entry.name || fallback)
              + labeled('Style', entry.style)
              + labeled('Action', entry.actionType)
              + labeled('Intensity', entry.intensity)
              + labeled('Uses', entry.uses)
              + labeled('Cost', costLabel)
              + labeled('Save', entry.requiresSave ? entry.saveAbilityTarget : '')
              + labeled('Rules', entry.rulesText || '')
              + labeled('Description', entry.description)
              + labeled('Special', entry.special)
            }</li>`;
          }
          const legacyDesc = entry.description ?? entry.desc;
          return `<li>${labeled('Name', entry.name || fallback)}${labeled('SP', entry.sp)}${labeled('Save', entry.save)}${labeled('Special', entry.special)}${labeled('Description', legacyDesc)}</li>`;
        }
        return `<li>${labeled('Name', fallback)}</li>`;
      };
      if(data.powers?.length){
        const powers=data.powers.map(p=>renderPowerEntry(p,{fallback:'Power'}));
        card.innerHTML+=renderList('Powers',powers);
      }
      if(data.signatures?.length){
        const sigs=data.signatures.map(s=>renderPowerEntry(s,{fallback:'Signature'}));
        card.innerHTML+=renderList('Signatures',sigs);
      }
      if(data.weapons?.length){
        const weapons=data.weapons.map(w=>`<li>${labeled('Name',w.name)}${labeled('Damage',w.damage)}${labeled('Range',w.range)}</li>`);
        card.innerHTML+=renderList('Weapons',weapons);
      }
      if(data.armor?.length){
        const armor=data.armor.map(a=>`<li>${labeled('Name',a.name)}${labeled('Slot',a.slot)}${a.bonus?labeled('Bonus',`+${a.bonus}`):''}${a.equipped?labeled('Equipped','Yes'):''}</li>`);
        card.innerHTML+=renderList('Armor',armor);
      }
      if(data.items?.length){
        const items=data.items.map(i=>`<li>${labeled('Name',i.name)}${labeled('Qty',i.qty)}${labeled('Notes',i.notes)}</li>`);
        card.innerHTML+=renderList('Items',items);
      }
      if(data['story-notes']){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Backstory / Notes</span><div>${data['story-notes']}</div></div>`;
      }
      const qMap={
        'q-mask':'Who are you behind the mask?',
        'q-justice':'What does justice mean to you?',
        'q-fear':'What is your biggest fear or unresolved trauma?',
        'q-first-power':'What moment first defined your sense of power—was it thrilling, terrifying, or tragic?',
        'q-origin-meaning':'What does your Origin Story mean to you now?',
        'q-before-powers':'What was your life like before you had powers or before you remembered having them?',
        'q-power-scare':'What is one way your powers scare even you?',
        'q-signature-move':'What is your signature move or ability, and how does it reflect who you are?',
        'q-emotional':'What happens to your powers when you are emotionally compromised?',
        'q-no-line':'What line will you never cross even if the world burns around you?'
      };
      const qList=Object.entries(qMap)
        .filter(([k])=>data[k])
        .map(([k,q])=>`<li><strong>${q}</strong> ${data[k]}</li>`)
        .join('');
      if(qList){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Character Questions</span><ul style=\"margin:4px 0 0 18px;padding:0\">${qList}</ul></div>`;
      }
      return card;
    }

    charList?.addEventListener('click', async e => {
      const trigger = e.target.closest('[data-character-name], a');
      if (!trigger) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      const name = trigger.dataset?.characterName || trigger.textContent?.trim();
      if (!name || !charView) return;
      try {
        const data = await loadCharacter(name, { bypassPin: true });
        charView.innerHTML='';
        charView.appendChild(characterCard(data, name));
        openCharacterView();
      } catch (err) {
        console.error('Failed to load character', err);
      }
    });

  if (dmBtn) dmBtn.addEventListener('click', () => {
    if (!isLoggedIn()) {
      requireLogin().catch(() => {});
    }
  });

  if (dmToggleBtn) {
    let skipClick = false;
    const activateToggle = (opts = {}) => {
      if (!isLoggedIn()) {
        requireLogin().catch(() => {});
        return;
      }
      toggleMenu(opts);
    };

    dmToggleBtn.addEventListener('click', () => {
      if (skipClick) {
        skipClick = false;
        return;
      }
      activateToggle();
    });

    dmToggleBtn.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        e.preventDefault();
        skipClick = true;
        activateToggle();
      }
    });

    dmToggleBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateToggle({ focusMenu: true });
      }
    });
  }

  const closeMenuIfOutside = e => {
    if (!menu || !menu.classList.contains(MENU_OPEN_CLASS)) return;
    if (!menu.contains(e.target) && !dmBtn?.contains(e.target) && !dmToggleBtn?.contains(e.target)) {
      closeMenu();
    }
  };

  document.addEventListener('click', closeMenuIfOutside);
  document.addEventListener('pointerdown', closeMenuIfOutside);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  creditAccountSelect?.addEventListener('change', () => {
    applyCreditAccountSelection();
    updateCreditSubmitState();
  });

  creditAmountInput?.addEventListener('input', () => {
    const amount = getCreditAmountNumber();
    updateCreditCardAmountDisplay(amount);
    updateCreditSubmitState();
    updateCreditProjectedBalanceDisplay();
  });

  creditAmountInput?.addEventListener('blur', () => {
    const amount = getCreditAmountNumber();
    if (creditAmountInput) creditAmountInput.value = formatCreditAmountDisplay(amount);
    updateCreditCardAmountDisplay(amount);
    updateCreditProjectedBalanceDisplay();
  });

  creditAmountInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreditRewardSubmit(e);
    }
  });

  creditSenderSelect?.addEventListener('change', () => {
    randomizeCreditIdentifiers();
    updateCreditSenderDataset();
    captureCreditTimestamp();
  });

  creditTxnType?.addEventListener('change', () => {
    if (creditTxnType?.value === 'Debit') {
      setCreditDebitState('pending');
    } else {
      setCreditDebitState('');
    }
    updateCreditTransactionType();
    updateCreditSubmitState();
    updateCreditProjectedBalanceDisplay();
  });

  creditMemoInput?.addEventListener('input', () => {
    updateCreditMemoPreview(creditMemoInput.value);
  });

  creditSubmit?.addEventListener('click', handleCreditRewardSubmit);

  quickRewardTargetSelect?.addEventListener('change', () => {
    updateQuickRewardFormsState();
  });

  quickXpPresetSaveBtn?.addEventListener('click', () => handleQuickRewardPresetSave('xp'));
  quickXpPresetDeleteBtn?.addEventListener('click', () => handleQuickRewardPresetDelete('xp'));
  quickXpPresetSelect?.addEventListener('change', () => handleQuickRewardPresetSelection('xp'));
  quickHpSpPresetSaveBtn?.addEventListener('click', () => handleQuickRewardPresetSave('hpsp'));
  quickHpSpPresetDeleteBtn?.addEventListener('click', () => handleQuickRewardPresetDelete('hpsp'));
  quickHpSpPresetSelect?.addEventListener('change', () => handleQuickRewardPresetSelection('hpsp'));
  quickResonancePresetSaveBtn?.addEventListener('click', () => handleQuickRewardPresetSave('resonance'));
  quickResonancePresetDeleteBtn?.addEventListener('click', () => handleQuickRewardPresetDelete('resonance'));
  quickResonancePresetSelect?.addEventListener('change', () => handleQuickRewardPresetSelection('resonance'));
  quickFactionPresetSaveBtn?.addEventListener('click', () => handleQuickRewardPresetSave('faction'));
  quickFactionPresetDeleteBtn?.addEventListener('click', () => handleQuickRewardPresetDelete('faction'));
  quickFactionPresetSelect?.addEventListener('change', () => handleQuickRewardPresetSelection('faction'));

  quickXpForm?.addEventListener('submit', handleQuickXpSubmit);
  quickHpSpForm?.addEventListener('submit', handleQuickHpSpSubmit);
  quickResonanceForm?.addEventListener('submit', handleQuickResonanceSubmit);
  quickFactionForm?.addEventListener('submit', handleQuickFactionSubmit);

  creditHistoryFilterCharacter?.addEventListener('change', event => {
    const value = typeof event?.target?.value === 'string' ? event.target.value : '';
    setCreditHistoryFilters({ character: value });
    renderPlayerCreditHistory();
  });

  creditHistoryFilterType?.addEventListener('change', event => {
    const value = typeof event?.target?.value === 'string' ? event.target.value : '';
    setCreditHistoryFilters({ type: value });
    renderPlayerCreditHistory();
  });

  creditHistoryClearBtn?.addEventListener('click', () => {
    clearPlayerCreditHistory();
  });

  creditHistoryExportBtn?.addEventListener('click', () => {
    exportPlayerCreditHistory();
  });

  creditHistoryList?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-credit-history-copy]');
    if (!button) return;
    event.preventDefault();
    const text = button.dataset.creditHistoryText || '';
    if (!text) {
      toast('Unable to copy entry', 'error');
      return;
    }
    if (await writeTextToClipboard(text)) {
      toast('Entry copied to clipboard', 'success');
      return;
    }
    if (downloadTextFile(buildExportFilename('dm-credit-entry'), text)) {
      toast('Entry exported', 'success');
      return;
    }
    toast('Unable to copy entry', 'error');
  });

  rewardHistoryClearBtn?.addEventListener('click', () => {
    clearQuickRewardHistory();
  });

  rewardHistoryExportBtn?.addEventListener('click', () => {
    exportQuickRewardHistory();
  });

  rewardHistoryList?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-reward-history-copy]');
    if (!button) return;
    event.preventDefault();
    const text = button.dataset.rewardHistoryText || '';
    if (!text) {
      toast('Unable to copy entry', 'error');
      return;
    }
    if (await writeTextToClipboard(text)) {
      toast('Entry copied to clipboard', 'success');
      return;
    }
    if (downloadTextFile(buildExportFilename('dm-reward-entry'), text)) {
      toast('Entry exported', 'success');
      return;
    }
    toast('Unable to copy entry', 'error');
  });

  rewardsTabs?.addEventListener('click', async event => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    const tabId = button.dataset.tab;
    if (!tabId) return;
    event.preventDefault();
    try {
      await activateRewardsTab(tabId);
      focusActiveRewardsContent(tabId);
    } catch (err) {
      console.error('Failed to switch rewards tab', err);
    }
  });

  rewardsTabs?.addEventListener('keydown', event => {
    const currentButton = event.target.closest('[data-tab]');
    if (!currentButton) return;
    const currentId = currentButton.dataset.tab || activeRewardsTab;
    let targetId = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      targetId = getAdjacentRewardsTab(currentId, -1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      targetId = getAdjacentRewardsTab(currentId, 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = rewardsTabButtons.keys().next();
      targetId = first?.value || currentId;
    } else if (event.key === 'End') {
      event.preventDefault();
      const keys = Array.from(rewardsTabButtons.keys());
      targetId = keys[keys.length - 1] || currentId;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      targetId = currentId;
    }
    if (!targetId) return;
    activateRewardsTab(targetId).then(() => {
      const targetButton = rewardsTabButtons.get(targetId);
      if (targetButton) {
        try {
          targetButton.focus({ preventScroll: true });
        } catch {
          targetButton.focus();
        }
      }
      focusActiveRewardsContent(targetId);
    }).catch(err => {
      console.error('Failed to switch rewards tab', err);
    });
  });

    renderPlayerCreditHistory();
    renderQuickRewardHistory();
    ensurePlayerCreditBroadcastChannel();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && rewardsModal && !rewardsModal.classList.contains('hidden') && activeRewardsTab === 'resource') {
        captureCreditTimestamp();
        randomizeCreditIdentifiers();
      }
    });

    window.addEventListener('focus', () => {
      if (rewardsModal && !rewardsModal.classList.contains('hidden') && activeRewardsTab === 'resource') {
        captureCreditTimestamp();
        randomizeCreditIdentifiers();
      }
    });

  if (tsomfBtn) {
    tsomfBtn.addEventListener('click', () => {
      closeMenu();
      if (window.openSomfDM) window.openSomfDM();
    });
  }

  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      closeMenu();
      openNotifications();
    });
  }

  notifyMarkReadBtn?.addEventListener('click', () => {
    resetUnreadCountValue();
    updateNotificationActionState();
  });

  notifyClearBtn?.addEventListener('click', () => {
    clearNotifications();
  });

  notifyExportBtn?.addEventListener('click', () => {
    exportNotifications();
  });

  notifyFiltersForm?.addEventListener('submit', event => {
    event.preventDefault();
  });

  notifyFilterCharacter?.addEventListener('change', () => {
    const value = notifyFilterCharacter.value || 'all';
    if (notificationFilterState.character === value) return;
    notificationFilterState = { ...notificationFilterState, character: value };
    persistNotificationFilterState();
    renderStoredNotifications();
  });

  notifyFilterSeverity?.addEventListener('change', () => {
    const value = notifyFilterSeverity.value || 'all';
    if (notificationFilterState.severity === value) return;
    notificationFilterState = { ...notificationFilterState, severity: value };
    persistNotificationFilterState();
    renderStoredNotifications();
  });

  notifyFilterResolved?.addEventListener('change', () => {
    const value = notifyFilterResolved.value || 'all';
    if (notificationFilterState.resolved === value) return;
    notificationFilterState = { ...notificationFilterState, resolved: value };
    persistNotificationFilterState();
    renderStoredNotifications();
  });

  const handleNotificationSearchInput = () => {
    const value = notifyFilterSearch?.value ?? '';
    if (notificationFilterState.search === value) return;
    notificationFilterState = { ...notificationFilterState, search: value };
    persistNotificationFilterState();
    renderStoredNotifications();
  };

  notifyFilterSearch?.addEventListener('input', handleNotificationSearchInput);
  notifyFilterSearch?.addEventListener('search', handleNotificationSearchInput);

    if (charBtn) {
      charBtn.addEventListener('click', () => {
        closeMenu();
        openCharacters();
      });
    }

  if (miniGamesBtn) {
    miniGamesBtn.addEventListener('click', async () => {
      closeMenu();
      try {
        await openMiniGames();
      } catch (err) {
        console.error('Failed to open mini-games', err);
        toast('Failed to open mini-games', 'error');
      }
    });
  }

    if (rewardsBtn) {
      rewardsBtn.addEventListener('click', async () => {
        closeMenu();
        try {
          await openRewards({ tab: 'resource' });
        } catch (err) {
          console.error('Failed to open rewards hub', err);
          toast('Failed to open rewards hub', 'error');
        }
      });
    }

    miniGamesClose?.addEventListener('click', closeMiniGames);
    rewardsClose?.addEventListener('click', closeRewards);

  miniGamesList?.addEventListener('click', e => {
    const button = e.target.closest('button[data-game-id]');
    if (!button) return;
    selectedMiniGameId = button.dataset.gameId || null;
    updateMiniGamesListSelection();
    shouldFocusMiniGameKnobs = true;
    renderMiniGameDetails();
  });

  miniGamesPlayerSelect?.addEventListener('change', () => {
    const values = getRosterSelection();
    if (!values.length) return;
    const added = addRecipient(values, { source: 'roster' });
    if (added) {
      clearRosterSelection();
    }
  });

  miniGamesAddRecipientBtn?.addEventListener('click', () => {
    const values = getRosterSelection();
    if (!values.length) return;
    const added = addRecipient(values, { source: 'roster' });
    if (added) {
      clearRosterSelection();
    }
  });

  miniGamesPlayerCustom?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const added = addRecipient(miniGamesPlayerCustom.value, { source: 'custom' });
      if (added) {
        miniGamesPlayerCustom.value = '';
      }
    }
  });

  miniGamesAddCustomBtn?.addEventListener('click', () => {
    const added = addRecipient(miniGamesPlayerCustom?.value || '', { source: 'custom' });
    if (added && miniGamesPlayerCustom) {
      miniGamesPlayerCustom.value = '';
    }
  });

  miniGamesClearRecipientsBtn?.addEventListener('click', () => {
    const cleared = clearRecipients();
    if (cleared) {
      clearRosterSelection();
    }
  });

  miniGamesRecipientList?.addEventListener('click', event => {
    const button = event.target.closest('button.dm-mini-games__recipient-remove');
    if (!button) return;
    const key = button.dataset.recipientKey;
    removeRecipientByKey(key);
  });

  miniGamesRefreshPlayers?.addEventListener('click', () => {
    refreshMiniGameCharacters({ preserveSelection: false });
  });

  miniGamesDeployBtn?.addEventListener('click', async () => {
    const deployed = await handleMiniGameDeploy();
    if (deployed) {
      await forceRefreshMiniGameDeployments();
    }
  });

  miniGamesRefreshBtn?.addEventListener('click', () => {
    forceRefreshMiniGameDeployments();
  });

  dmSetInterval(() => {
    autoUpdateDeploymentStatuses(miniGameDeploymentsCache);
  }, MINI_GAME_AUTO_STATUS_INTERVAL_MS);

  miniGamesDeployments?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const item = btn.closest('.dm-mini-games__deployment');
    if (!item) return;
    const player = item.dataset.player;
    const deploymentId = item.dataset.deploymentId;
    if (!player || !deploymentId) return;
    if (btn.dataset.action === 'update') {
      const select = item.querySelector('select[data-action="status"]');
      const status = select?.value || 'pending';
      btn.disabled = true;
      try {
        await updateMiniGameDeployment(player, deploymentId, { status });
        toast('Mini-game updated', 'success');
        window.dmNotify?.(`Updated mini-game ${deploymentId} to ${status}`, { actionScope: 'major' });
      } catch (err) {
        console.error('Failed to update mini-game deployment', err);
        toast('Failed to update mini-game', 'error');
      } finally {
        btn.disabled = false;
        await forceRefreshMiniGameDeployments();
      }
    } else if (btn.dataset.action === 'delete') {
      btn.disabled = true;
      try {
        await deleteMiniGameDeployment(player, deploymentId);
        toast('Mini-game deployment removed', 'info');
        window.dmNotify?.(`Removed mini-game ${deploymentId}`, { actionScope: 'major' });
      } catch (err) {
        console.error('Failed to remove mini-game deployment', err);
        toast('Failed to remove mini-game', 'error');
      } finally {
        btn.disabled = false;
        await forceRefreshMiniGameDeployments();
      }
    } else if (btn.dataset.action === 'nudge') {
      btn.disabled = true;
      try {
        const playerName = item.dataset.player || item.dataset.assignee || 'player';
        const missionName = item.dataset.gameName || 'mini-game';
        toast(`Nudged ${playerName}`, 'info');
        window.dmNotify?.(`Nudged ${playerName} about ${missionName}`, { actionScope: 'minor' });
      } finally {
        btn.disabled = false;
      }
    }
  });

  miniGamesFilterStatus?.addEventListener('change', () => {
    const value = miniGamesFilterStatus.value || 'all';
    miniGameFilterState.status = value;
    persistMiniGameFilterState();
    renderMiniGameDeployments(miniGameDeploymentsCache);
  });

  miniGamesFilterAssignee?.addEventListener('change', () => {
    const value = miniGamesFilterAssignee.value || 'all';
    miniGameFilterState.assignee = value;
    persistMiniGameFilterState();
    renderMiniGameDeployments(miniGameDeploymentsCache);
  });

  const handleMiniGameFilterQuery = () => {
    if (!miniGamesFilterSearch) return;
    const value = miniGamesFilterSearch.value || '';
    miniGameFilterState.query = value;
    persistMiniGameFilterState();
    renderMiniGameDeployments(miniGameDeploymentsCache);
  };

  miniGamesFilterSearch?.addEventListener('input', handleMiniGameFilterQuery);
  miniGamesFilterSearch?.addEventListener('search', handleMiniGameFilterQuery);


  notifyModal?.addEventListener('click', e => { if(e.target===notifyModal) closeNotifications(); });
  notifyClose?.addEventListener('click', closeNotifications);
  if (notifyModal && typeof MutationObserver !== 'undefined') {
    const modalObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && notifyModal.classList.contains('hidden')) {
          resetUnreadCountValue();
          break;
        }
      }
    });
    modalObserver.observe(notifyModal, { attributes: true, attributeFilter: ['class'] });
  }
  charModal?.addEventListener('click', e => { if(e.target===charModal) closeCharacters(); });
  charClose?.addEventListener('click', closeCharacters);
  charViewModal?.addEventListener('click', e => { if(e.target===charViewModal) closeCharacterView(); });
  charViewClose?.addEventListener('click', closeCharacterView);
  rewardsModal?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closeRewards(); } });
  rewardsModal?.addEventListener('click', e => { if (e.target === rewardsModal) closeRewards(); });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      closeMenu();
      logout();
    });
  }

  sessionExtendBtn?.addEventListener('click', event => {
    try {
      event?.preventDefault?.();
    } catch {
      /* ignore */
    }
    const now = Date.now();
    touchSessionActivity(now);
    sessionWarningToastShown = false;
    updateSessionStatusDisplay({ loggedIn: true, now });
    ensureSessionStatusUpdates();
  });

  updateButtons();
  if (isLoggedIn()) initTools();

  document.addEventListener('click', e => {
    const t = e.target.closest('button,a');
    if(!t) return;
    touchSessionActivity();
  });

  window.dmRequireLogin = requireLogin;
  window.openRewards = openRewards;
  window.closeRewards = closeRewards;

  dmTestHooks = {
    populateCatalogRecipients,
    buildCatalogPayload,
    handleCatalogSubmit,
    deliverCatalogEquipment,
    catalogForms,
    CATALOG_RECIPIENT_FIELD_KEY,
    CATALOG_RECIPIENT_PLACEHOLDER,
    compileCatalogNotes,
    convertCatalogPayloadToEquipment,
    executeRewardTransaction,
    setRewardExecutor,
    exportNotifications,
    getQuickRewardHistory: () => [...quickRewardHistory],
    clearQuickRewardHistory,
    renderQuickRewardHistory,
    getQuickRewardPresets: () => {
      const snapshot = {};
      quickRewardPresetState.forEach((list, cardId) => {
        snapshot[cardId] = list.map(entry => ({
          id: entry.id,
          name: entry.name,
          targets: Array.isArray(entry.targets) ? [...entry.targets] : [],
          values: entry.values && typeof entry.values === 'object' ? { ...entry.values } : {},
        }));
      });
      return snapshot;
    },
    setStoredNotifications(entries = []) {
      notifications.length = 0;
      if (Array.isArray(entries)) {
        entries.forEach((entry, idx) => {
          const normalized = normalizeStoredNotification(entry, {
            fallbackCreatedAt: Date.now() + idx,
          });
          if (normalized) notifications.push(normalized);
        });
      }
      if (notifications.length > MAX_STORED_NOTIFICATIONS) {
        notifications.splice(0, notifications.length - MAX_STORED_NOTIFICATIONS);
      }
      persistNotifications();
      renderStoredNotifications();
      updateNotificationActionState();
    },
    setNotificationFilters(filters = {}) {
      const next = {
        character: typeof filters.character === 'string' ? filters.character : 'all',
        severity: typeof filters.severity === 'string' ? filters.severity : 'all',
        search: typeof filters.search === 'string' ? filters.search : '',
        resolved: typeof filters.resolved === 'string' ? filters.resolved : 'all',
      };
      notificationFilterState = next;
      persistNotificationFilterState();
      renderStoredNotifications();
      updateNotificationActionState();
    },
    QUICK_REWARD_PRESETS_STORAGE_KEY,
  };
}
if (typeof window !== 'undefined' && !Object.getOwnPropertyDescriptor(window, '__dmTestHooks')) {
  Object.defineProperty(window, '__dmTestHooks', {
    configurable: true,
    get() {
      if (!dmTestHooks) {
        initDMLogin();
      }
      return dmTestHooks;
    },
  });
}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initDMLogin);
} else {
  initDMLogin();
}
