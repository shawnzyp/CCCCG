import {
  saveLocal,
  loadLocal,
  listLocalSaves,
  deleteSave,
  saveCloud,
  loadCloud,
  listCloudSaves,
  listCloudBackups,
  loadCloudBackup,
  deleteCloud,
} from './storage.js';

// DM saves are protected by a login flow rather than a manual PIN entry.
// Only "The DM" character triggers this flow.

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

async function verifyPin(name) {
  if (name !== 'The DM') return;
  if (typeof window.dmRequireLogin === 'function') {
    await window.dmRequireLogin();
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
  const local = listLocalSaves().map(n => (n === 'DM' ? 'The DM' : n));
  try {
    const cloud = (await listCloudSaves()).map(n => (n === 'DM' ? 'The DM' : n));
    return Array.from(new Set([...local, ...cloud])).sort((a, b) =>
      a.localeCompare(b)
    );
  } catch (e) {
    console.error('Failed to list cloud saves', e);
    return Array.from(new Set(local)).sort((a, b) => a.localeCompare(b));
  }
}

export async function loadCharacter(name) {
  await verifyPin(name);
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
  try {
    return await listCloudBackups(name);
  } catch (e) {
    console.error('Failed to list backups', e);
    return [];
  }
}

export async function loadBackup(name, ts) {
  const data = await loadCloudBackup(name, ts);
  try { await saveLocal(name, data); } catch {}
  return data;
}
