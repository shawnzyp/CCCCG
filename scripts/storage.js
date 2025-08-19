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

// ===== Firebase Cloud Save =====
// Lazily load the Firebase SDK modules from the official CDN so tests
// and environments without Firebase still work.
const firebaseConfig = {
  apiKey: "AIzaSyA3DZNONr73L62eERENpVOnujzyxhoiydY",
  authDomain: "ccccg-7d6b6.firebaseapp.com",
  databaseURL: "https://ccccg-7d6b6-default-rtdb.firebaseio.com",
  projectId: "ccccg-7d6b6",
  storageBucket: "ccccg-7d6b6.firebasestorage.app",
  messagingSenderId: "705656976850",
  appId: "1:705656976850:web:eeca63f9f325e33f2b440b",
  measurementId: "G-DY7J7CNBVR"
};

let dbPromise = null;
async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const appMod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js');
      const { initializeApp } = appMod;
      const app = initializeApp(firebaseConfig);
      try {
        const analyticsMod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js');
        const { getAnalytics } = analyticsMod;
        getAnalytics(app);
      } catch (e) {
        // Analytics is optional; ignore errors in unsupported environments.
      }
      const dbMod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');
      const { getDatabase } = dbMod;
      return getDatabase(app);
    })();
  }
  return dbPromise;
}

export async function saveCloud(name, payload) {
  try {
    const db = await getDb();
    const { ref, set } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');
    await set(ref(db, 'saves/' + name), payload);
    localStorage.setItem('last-save', name);
  } catch (e) {
    console.error('Cloud save failed', e);
  }
}

export async function loadCloud(name) {
  try {
    const db = await getDb();
    const { ref, get } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');
    const snap = await get(ref(db, 'saves/' + name));
    const val = snap.val();
    if (val !== null) return val;
  } catch (e) {
    console.error('Cloud load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteCloud(name) {
  try {
    const db = await getDb();
    const { ref, remove } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');
    await remove(ref(db, 'saves/' + name));
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
    console.error('Cloud delete failed', e);
  }
}

