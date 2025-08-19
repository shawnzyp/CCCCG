export async function saveLocal(name, payload) {
  try {
    localStorage.setItem('save:' + name, JSON.stringify(payload));
    localStorage.setItem('last-save', name);
  } catch (e) {
    console.error('Local save failed', e);
  }
}

export async function loadLocal(name) {
  try {
    const raw = localStorage.getItem('save:' + name);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Local load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteSave(name) {
  try {
    localStorage.removeItem('save:' + name);
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
    console.error('Local delete failed', e);
  }
}

