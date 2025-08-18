const ENCODE = (s) => encodeURIComponent(String(s || ''));

export async function saveCloud(name, payload, { getRTDB, toast } = {}) {
  const r = getRTDB ? await getRTDB().catch(err => { console.error('RTDB init failed', err); return null; }) : null;
  if (r) {
    const { db, ref, set } = r;
    let tries = 2;
    while (tries--) {
      try {
        await set(ref(db, '/saves/' + ENCODE(name)), { updatedAt: Date.now(), data: payload });
        break;
      } catch (e) {
        console.error('Firebase set failed', e);
        if (!tries && typeof toast === 'function') { toast('Cloud save failed. Data saved locally.', 'error'); }
        else await new Promise(res => setTimeout(res, 1000));
      }
    }
  } else {
    if (!navigator.onLine) { if (typeof toast === 'function') toast('Offline: saved locally only', 'error'); }
    else { if (typeof toast === 'function') toast('Cloud unavailable; saved locally', 'error'); }
  }
  try {
    localStorage.setItem('save:' + name, JSON.stringify(payload));
    localStorage.setItem('last-save', name);
  } catch (e) {
    console.error('Local save failed', e);
  }
}

export async function loadCloud(name, { getRTDB, toast } = {}) {
  const r = getRTDB ? await getRTDB().catch(err => { console.error('RTDB init failed', err); return null; }) : null;
  if (r) {
    const { db, ref, get } = r;
    let snap = null, tries = 2;
    while (tries--) {
      try {
        snap = await get(ref(db, '/saves/' + ENCODE(name)));
        if (!snap.exists()) snap = await get(ref(db, '/saves/' + name));
        break;
      } catch (e) {
        console.error('Firebase get failed', e);
        if (!tries && typeof toast === 'function') { toast('Cloud load failed. Trying local save.', 'error'); }
        else await new Promise(res => setTimeout(res, 1000));
      }
    }
    if (snap && snap.exists()) {
      const v = snap.val();
      return (v && v.data) || (v && v.character) || (v && v.sheet) || v;
    }
  } else {
    if (!navigator.onLine) { if (typeof toast === 'function') toast('Offline: using local save', 'error'); }
    else { if (typeof toast === 'function') toast('Cloud unavailable; using local save', 'error'); }
  }
  try {
    const raw = localStorage.getItem('save:' + name);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Local load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteSave(name, { getRTDB, toast } = {}) {
  const r = getRTDB ? await getRTDB().catch(err => { console.error('RTDB init failed', err); return null; }) : null;
  if (r) {
    const { db, ref, remove } = r;
    let tries = 2;
    while (tries--) {
      try {
        await remove(ref(db, '/saves/' + ENCODE(name)));
        break;
      } catch (e) {
        console.error('Firebase delete failed', e);
        if (!tries && typeof toast === 'function') { toast('Cloud delete failed. Local save removed.', 'error'); }
        else await new Promise(res => setTimeout(res, 1000));
      }
    }
  } else {
    if (!navigator.onLine) { if (typeof toast === 'function') toast('Offline: deleted local save only', 'error'); }
    else { if (typeof toast === 'function') toast('Cloud unavailable; deleted local save only', 'error'); }
  }
  try {
    localStorage.removeItem('save:' + name);
    if (localStorage.getItem('last-save') === name) localStorage.removeItem('last-save');
  } catch (e) {
    console.error('Local delete failed', e);
  }
}
