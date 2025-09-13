const KEY_PREFIX = 'pin:';

function key(name) {
  return KEY_PREFIX + name;
}

async function hashPin(pin) {
  try {
    if (crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  return pin;
}

export async function setPin(name, pin) {
  const hash = await hashPin(pin);
  localStorage.setItem(key(name), hash);
}

export function hasPin(name) {
  return localStorage.getItem(key(name)) !== null;
}

export async function verifyPin(name, pin) {
  const stored = localStorage.getItem(key(name));
  if (!stored) return false;
  const hash = await hashPin(pin);
  return stored === hash;
}

export function clearPin(name) {
  localStorage.removeItem(key(name));
}

export function movePin(oldName, newName) {
  const oldKey = key(oldName);
  const val = localStorage.getItem(oldKey);
  if (val) {
    localStorage.setItem(key(newName), val);
    localStorage.removeItem(oldKey);
  }
}
