import { hasPin, setPin, verifyPin, clearPin, syncPin } from './pin.js';

const DEFAULT_DM_PIN_STORAGE_KEY = '__dm__';

export const DM_PIN = {
  storageKey: DEFAULT_DM_PIN_STORAGE_KEY,
};

function resolveStorageKey() {
  if (typeof DM_PIN === 'string' && DM_PIN) {
    return DM_PIN;
  }
  if (DM_PIN && typeof DM_PIN === 'object' && typeof DM_PIN.storageKey === 'string' && DM_PIN.storageKey) {
    return DM_PIN.storageKey;
  }
  return DEFAULT_DM_PIN_STORAGE_KEY;
}

let syncInFlight = null;

export function getDmPinStorageKey() {
  return resolveStorageKey();
}

export function hasDmPin() {
  try {
    return hasPin(getDmPinStorageKey());
  } catch (error) {
    console.error('Failed to check DM PIN presence', error);
    return false;
  }
}

export async function syncDmPin() {
  const storageKey = getDmPinStorageKey();
  if (!syncInFlight) {
    syncInFlight = syncPin(storageKey)
      .catch(error => {
        if (error && error.message !== 'fetch not supported' && error.name !== 'TypeError') {
          console.error('Failed to sync DM PIN', error);
        }
        return false;
      })
      .finally(() => {
        syncInFlight = null;
      });
  }
  try {
    const result = await syncInFlight;
    return Boolean(result);
  } catch {
    return false;
  }
}

export async function ensureDmPinReady() {
  if (hasDmPin()) {
    return true;
  }
  const synced = await syncDmPin();
  return hasDmPin() || synced;
}

export async function verifyDmPin(pin) {
  const candidate = typeof pin === 'string' ? pin.trim() : String(pin ?? '');
  if (!candidate) {
    return false;
  }
  await ensureDmPinReady();
  try {
    return await verifyPin(getDmPinStorageKey(), candidate);
  } catch (error) {
    console.error('Failed to verify DM PIN', error);
    return false;
  }
}

export async function setDmPin(pin) {
  const candidate = typeof pin === 'string' ? pin.trim() : String(pin ?? '');
  if (!candidate) {
    return false;
  }
  try {
    const stored = await setPin(getDmPinStorageKey(), candidate);
    return Boolean(stored);
  } catch (error) {
    console.error('Failed to persist DM PIN', error);
    return false;
  }
}

export async function clearDmPin() {
  try {
    return await clearPin(getDmPinStorageKey());
  } catch (error) {
    console.error('Failed to clear DM PIN', error);
    return false;
  }
}

export function resetDmPinSyncState() {
  syncInFlight = null;
}
