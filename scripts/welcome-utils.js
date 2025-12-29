export function hasBootableLocalState({ storage, lastSaveName, uid } = {}) {
  if (!storage) return false;
  const name = typeof lastSaveName === 'string' ? lastSaveName.trim() : '';
  if (name) {
    const mappedId = storage.getItem(`cc:character-id:${name}`);
    if (mappedId && storage.getItem(`save:${mappedId}`)) {
      return true;
    }
    if (storage.getItem(`save:${name}`)) {
      return true;
    }
  }
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith('save:')) continue;
      return true;
    }
  } catch {}
  return false;
}
