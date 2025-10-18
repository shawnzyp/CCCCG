const DEFAULT_CONFIG_ENDPOINT = '/dm-config.json';

let configValue = null;
let configPromise = null;
let loaderOverride = null;

function normalizePinValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  try {
    const normalized = String(value);
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

function normalizeFingerprintValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return String(value);
  } catch {
    return '';
  }
}

function normalizeConfig(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  const pinCandidate =
    base.pin ??
    base.dmPin ??
    base.DM_PIN ??
    base.pinCode ??
    base.dm_pin ??
    base.dm_pin_code;
  const fingerprintCandidate =
    base.deviceFingerprint ??
    base.dmDeviceFingerprint ??
    base.DM_DEVICE_FINGERPRINT ??
    base.fingerprint ??
    base.dmFingerprint;

  return {
    pin: normalizePinValue(pinCandidate),
    deviceFingerprint: normalizeFingerprintValue(fingerprintCandidate),
  };
}

function readInlineConfig() {
  if (typeof document === 'undefined') return null;
  const element = document.querySelector('script[type="application/json"][data-dm-config]');
  if (!element) return null;
  const text = element.textContent?.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getGlobalConfigCandidate() {
  if (typeof globalThis !== 'undefined' && '__DM_CONFIG__' in globalThis) {
    return globalThis.__DM_CONFIG__;
  }
  if (typeof window !== 'undefined' && '__DM_CONFIG__' in window) {
    return window.__DM_CONFIG__;
  }
  return undefined;
}

async function resolveCandidate(candidate) {
  if (candidate == null) return candidate;
  if (typeof candidate === 'function') {
    try {
      return await resolveCandidate(candidate());
    } catch (error) {
      throw error;
    }
  }
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (typeof candidate.then === 'function') {
    return resolveCandidate(await candidate);
  }
  return candidate;
}

async function fetchConfig(endpoint, { signal } = {}) {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    });
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function loadFromRuntime(options = {}) {
  const candidate = getGlobalConfigCandidate();
  const resolvedGlobal = await resolveCandidate(candidate);
  if (resolvedGlobal != null) return resolvedGlobal;

  const inline = readInlineConfig();
  if (inline != null) return inline;

  const endpoint = typeof options.endpoint === 'string' && options.endpoint
    ? options.endpoint
    : DEFAULT_CONFIG_ENDPOINT;
  const fetched = await fetchConfig(endpoint, options);
  if (fetched != null) return fetched;

  return {};
}

export function resetDmConfig() {
  configValue = null;
  configPromise = null;
}

export function setDmConfig(value) {
  const normalized = normalizeConfig(value);
  configValue = normalized;
  configPromise = Promise.resolve(normalized);
  if (typeof globalThis !== 'undefined') {
    try {
      Object.defineProperty(globalThis, '__DM_CONFIG__', {
        configurable: true,
        writable: true,
        value: value,
      });
    } catch {
      globalThis.__DM_CONFIG__ = value;
    }
  }
  return normalized;
}

export function configureDmConfigLoader(loader) {
  loaderOverride = typeof loader === 'function' ? loader : null;
  configPromise = null;
  configValue = null;
}

export function isDmConfigLoaded() {
  return configValue !== null;
}

export function getDmConfigSync() {
  return configValue;
}

export function getDmPinSync() {
  return configValue?.pin ?? null;
}

export function getDmDeviceFingerprintSync() {
  return configValue?.deviceFingerprint ?? '';
}

export async function loadDmConfig(options = {}) {
  if (configPromise) {
    return configPromise;
  }
  const loader = loaderOverride;
  configPromise = Promise.resolve()
    .then(() => (loader ? loader(options) : loadFromRuntime(options)))
    .then(value => {
      const normalized = normalizeConfig(value);
      configValue = normalized;
      return normalized;
    })
    .catch(error => {
      configPromise = null;
      throw error;
    });
  return configPromise;
}

export async function getDmPin(options) {
  const config = await loadDmConfig(options);
  return config.pin ?? null;
}

export async function getDmDeviceFingerprint(options) {
  const config = await loadDmConfig(options);
  return config.deviceFingerprint ?? '';
}

export { DEFAULT_CONFIG_ENDPOINT };
