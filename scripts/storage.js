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
        if (!tries) toast?.('Cloud save failed. Data saved locally.', 'error');
        else await new Promise(res => setTimeout(res, 1000));
      }
    }
  } else {
    if (!navigator.onLine) toast?.('Offline: saved locally only', 'error');
    else toast?.('Cloud unavailable; saved locally', 'error');
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
        if (!tries) toast?.('Cloud load failed. Trying local save.', 'error');
        else await new Promise(res => setTimeout(res, 1000));
      }
    }
    if (snap && snap.exists()) {
      const v = snap.val();
      return v?.data || v?.character || v?.sheet || v;
    }
  } else {
    if (!navigator.onLine) toast?.('Offline: using local save', 'error');
    else toast?.('Cloud unavailable; using local save', 'error');
  }
  try {
    const raw = localStorage.getItem('save:' + name);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Local load failed', e);
  }
  throw new Error('No save found');
}
