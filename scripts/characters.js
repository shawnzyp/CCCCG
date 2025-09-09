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

const PINNED = { 'DM': '1231' };

// Migrate legacy save named "Shawn" to the new DM name.
try {
  const legacy = localStorage.getItem('save:Shawn');
  if (legacy && !localStorage.getItem('save:DM')) {
    localStorage.setItem('save:DM', legacy);
    localStorage.removeItem('save:Shawn');
    if (localStorage.getItem('last-save') === 'Shawn') {
      localStorage.setItem('last-save', 'DM');
    }
  }
} catch {}

async function verifyPin(name) {
  const pin = PINNED[name];
  if (!pin) return;
  if (name === 'DM' && typeof window.dmRequireLogin === 'function') {
    await window.dmRequireLogin();
    return;
  }
  const entered = typeof prompt === 'function'
    ? prompt(`Enter PIN for ${name}`)
    : null;
  if (entered !== pin) {
    throw new Error('Invalid PIN');
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
  try { localStorage.setItem('last-save', name); } catch {}
}

export async function listCharacters() {
  const local = listLocalSaves();
  try {
    const cloud = await listCloudSaves();
    return Array.from(new Set([...local, ...cloud])).sort((a, b) =>
      a.localeCompare(b)
    );
  } catch (e) {
    console.error('Failed to list cloud saves', e);
    return local;
  }
}

export async function loadCharacter(name) {
  await verifyPin(name);
  try {
    return await loadLocal(name);
  } catch {}
  const data = await loadCloud(name);
  try {
    await saveLocal(name, data);
  } catch {}
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
}

export async function deleteCharacter(name) {
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
