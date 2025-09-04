import {
  saveLocal,
  loadLocal,
  listLocalSaves,
  deleteSave,
  saveCloud,
  loadCloud,
  listCloudSaves,
  deleteCloud,
} from './storage.js';

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
  await saveLocal(name, data);
  try {
    await saveCloud(name, data);
  } catch (e) {
    console.error('Cloud save failed', e);
  }
}

export async function deleteCharacter(name) {
  await deleteSave(name);
  try {
    await deleteCloud(name);
  } catch (e) {
    console.error('Cloud delete failed', e);
  }
}

export function currentPlayer() {
  return null;
}

export function isDM() {
  return false;
}
