// Firebase helper module
// Extracts initialization and database calls.

let appInstance;
let rtdb;
let api;
let authHandler = null;

export function setAuthHandler(fn){
  /* Provide custom auth, e.g., email/password or OAuth */

  authHandler = fn;
}

async function getRTDB(){
  if (rtdb) return rtdb;
  const cfgEl = document.getElementById('firebase-config');
  if (!cfgEl) throw new Error('Firebase config not found');
  let cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch(e) { throw new Error('Invalid Firebase config'); }
  if (!cfg.apiKey || !cfg.databaseURL) throw new Error('Incomplete Firebase config');

  const [{ initializeApp }, { getAuth, signInAnonymously, onAuthStateChanged }, { getDatabase, ref, get, set }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js')
  ]);
  api = { ref, get, set };
  try {
    appInstance = appInstance || initializeApp(cfg);
  } catch(e){ /* app already initialized */ }
  const auth = getAuth(appInstance);
  if (authHandler) {
    await authHandler(auth);
  } else {
    await new Promise(res => onAuthStateChanged(auth, res, res));
    if (!auth.currentUser){
      try { await signInAnonymously(auth); } catch(e){ console.error('Anonymous auth failed', e); }
    }
  }
  rtdb = getDatabase(appInstance);
  return rtdb;
}

const ENCODE = (s) => encodeURIComponent(String(s||''));

export async function saveCloud(name, payload){
  let remoteErr;
  try {
    const db = await getRTDB();
    const { ref, set } = api;
    await set(ref(db, '/saves/'+ENCODE(name)), { updatedAt: Date.now(), data: payload });
  } catch(e){
    remoteErr = e;
    console.error('saveCloud error', e);
  }
  try {
    localStorage.setItem('save:'+name, JSON.stringify(payload));
    localStorage.setItem('last-save', name);
  } catch(e){
    console.error('Local save failed', e);
    if (remoteErr) throw remoteErr;
  }
}

export async function loadCloud(name){
  try {
    const db = await getRTDB();
    const { ref, get } = api;
    let snap = await get(ref(db, '/saves/'+ENCODE(name)));
    if (!snap.exists()) snap = await get(ref(db, '/saves/'+name));
    if (snap.exists()){
      const v = snap.val();
      return v?.data || v?.character || v?.sheet || v;
    }
  } catch(e){
    console.error('loadCloud error', e);
  }
  try {
    const raw = localStorage.getItem('save:'+name);
    if (raw) return JSON.parse(raw);
  } catch(e){
    console.error('Local load failed', e);
  }
  throw new Error('No save found');
}
