import {
  saveLocal,
  loadLocal,
  listLocalSaves,
  deleteSave,
  saveCloud,
  loadCloud,
  listCloudSaves,
  listCloudBackups,
  listCloudBackupNames,
  loadCloudBackup,
  saveCloudAutosave,
  listCloudAutosaves,
  listCloudAutosaveNames,
  loadCloudAutosave,
  deleteCloud,
} from './storage.js';
import { hasPin, verifyPin as verifyStoredPin, clearPin, movePin, syncPin } from './pin.js';

// Migrate legacy DM saves to the new "The DM" name.
// Older versions stored the DM character under names like "Shawn",
// "Player :Shawn", or simply "DM". Ensure any of these variants are renamed.
try {
  const legacyNames = ['Shawn', 'Player :Shawn', 'DM'];
  for (const name of legacyNames) {
    const legacy = localStorage.getItem(`save:${name}`);
    if (!legacy) continue;
    // Only create the The DM save if it doesn't already exist to avoid
    // overwriting newer data.
    if (!localStorage.getItem('save:The DM')) {
      localStorage.setItem('save:The DM', legacy);
    }
    localStorage.removeItem(`save:${name}`);
    if (localStorage.getItem('last-save') === name) {
      localStorage.setItem('last-save', 'The DM');
    }
  }
} catch {}

function getPinPrompt(message) {
  if (typeof window !== 'undefined' && typeof window.pinPrompt === 'function') {
    return window.pinPrompt(message);
  }
  if (typeof prompt === 'function') {
    return Promise.resolve(prompt(message));
  }
  return Promise.resolve(null);
}

async function verifyPin(name) {
  await syncPin(name);
  if (!hasPin(name)) return;

  const toastFn = typeof window !== 'undefined' && typeof window.toast === 'function'
    ? window.toast
    : null;
  const dismissFn = typeof window !== 'undefined' && typeof window.dismissToast === 'function'
    ? window.dismissToast
    : null;
  let showedToast = false;

  const showToast = (message, type = 'info') => {
    if (!toastFn) return;
    try {
      toastFn(message, { type, duration: 0 });
      showedToast = true;
    } catch {}
  };

  const hideToast = () => {
    if (!showedToast || !dismissFn) return;
    try {
      dismissFn();
    } catch {}
    showedToast = false;
  };

  const promptLabel = 'Enter PIN';
  const suffix = typeof name === 'string' && name ? ` for ${name}` : '';
  showToast(`${promptLabel}${suffix}`, 'info');

  while (true) {
    const pin = await getPinPrompt(promptLabel);
    if (pin === null) {
      hideToast();
      throw new Error('Invalid PIN');
    }
    if (await verifyStoredPin(name, pin)) {
      hideToast();
      return;
    }
    showToast('Invalid PIN. Try again.', 'error');
  }
}

let currentName = null;

export function currentCharacter() {
  if (currentName) return currentName;
  try {
    const last = localStorage.getItem('last-save');
    if (last) currentName = last;
  } catch {}
  return currentName;
}

export function setCurrentCharacter(name) {
  currentName = name;
  try {
    if (name === null) {
      localStorage.removeItem('last-save');
    } else {
      localStorage.setItem('last-save', name);
    }
  } catch {}
}

export async function listCharacters() {
  try {
    const cloud = (await listCloudSaves()).map((n) => (n === 'DM' ? 'The DM' : n));
    return cloud.sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Failed to list cloud saves', e);
    return [];
  }
}

export async function listRecoverableCharacters() {
  try {
    const saves = await listCharacters();
    const backups = (await listCloudBackupNames()).map(n => (n === 'DM' ? 'The DM' : n));
    const autos = (await listCloudAutosaveNames()).map(n => (n === 'DM' ? 'The DM' : n));
    const set = new Set([...saves, ...backups, ...autos]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Failed to list recoverable characters', e);
    return [];
  }
}

export async function loadCharacter(name, { bypassPin = false } = {}) {
  if (!bypassPin) {
    await verifyPin(name);
  }
  let data;
  try {
    data = await loadLocal(name);
  } catch {}
  if (!data) {
    data = await loadCloud(name);
    try {
      await saveLocal(name, data);
    } catch {}
  }
  window.dmNotify?.(`Loaded character ${name}`);
  return data;
}

export async function saveCharacter(data, name = currentCharacter()) {
  if (!name) throw new Error('No character selected');
  await verifyPin(name);
  await saveLocal(name, data);
  try {
    await saveCloud(name, data);
  } catch (e) {
    console.error('Cloud save failed', e);
  }
  try {
    document.dispatchEvent(new CustomEvent('character-saved', { detail: name }));
  } catch {}
}

export async function renameCharacter(oldName, newName, data) {
  if (!oldName || oldName === newName) {
    setCurrentCharacter(newName);
    await saveCharacter(data, newName);
    return;
  }
  await verifyPin(oldName);
  await saveLocal(newName, data);
  try {
    await saveCloud(newName, data);
  } catch (e) {
    console.error('Cloud save failed', e);
  }
  await movePin(oldName, newName);
  await deleteSave(oldName);
  try {
    await deleteCloud(oldName);
  } catch (e) {
    console.error('Cloud delete failed', e);
  }
  setCurrentCharacter(newName);
  try {
    document.dispatchEvent(new CustomEvent('character-saved', { detail: newName }));
  } catch {}
}

export async function deleteCharacter(name) {
  if (name === 'The DM') {
    throw new Error('Cannot delete The DM');
  }
  await verifyPin(name);
  let data = null;
  try {
    data = await loadLocal(name);
  } catch {}
  if (data === null) {
    try { data = await loadCloud(name); } catch {}
  }
  if (data !== null) {
    try { await saveCloud(name, data); } catch (e) { console.error('Cloud backup failed', e); }
  }
  await deleteSave(name);
  await clearPin(name);
  try {
    await deleteCloud(name);
  } catch (e) {
    console.error('Cloud delete failed', e);
  }
  try {
    document.dispatchEvent(new CustomEvent('character-deleted', { detail: name }));
  } catch {}
}

export async function listBackups(name) {
  let manual = [];
  let autos = [];
  try {
    manual = await listCloudBackups(name);
  } catch (e) {
    console.error('Failed to list backups', e);
  }
  try {
    autos = await listCloudAutosaves(name);
  } catch (e) {
    console.error('Failed to list autosaves', e);
  }
  return [
    ...manual.map(entry => ({ ...entry, type: 'manual' })),
    ...autos.map(entry => ({ ...entry, type: 'auto' })),
  ];
}

export async function loadBackup(name, ts, type = 'manual') {
  const loader = type === 'auto' ? loadCloudAutosave : loadCloudBackup;
  const data = await loader(name, ts);
  try { await saveLocal(name, data); } catch {}
  return data;
}

export async function saveAutoBackup(data, name = currentCharacter()) {
  if (!name) return null;
  try {
    const ts = await saveCloudAutosave(name, data);
    try {
      document.dispatchEvent(new CustomEvent('character-autosaved', { detail: { name, ts } }));
    } catch {}
    return ts;
  } catch (e) {
    console.error('Failed to autosave character', e);
    return null;
  }
}
