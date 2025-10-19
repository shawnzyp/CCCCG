async function loadFirebaseCompat(){
  if (window.firebase?.database) {
    return window.firebase;
  }

  await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js'),
    import('https://www.gstatic.com/firebasejs/9.22.2/firebase-database-compat.js')
  ]);

  if (!window.firebase?.database) {
    throw new Error('Failed to load Firebase compat libraries.');
  }

  return window.firebase;
}

function attachDatabase(db) {
  window.SOMF_MIN = window.SOMF_MIN || {};
  if (typeof window.SOMF_MIN.setFirebase === 'function') {
    window.SOMF_MIN.setFirebase(db);
  } else {
    // Fallback for early load: store the db so the runtime can use it once
    // initialized.
    window._somf_db = db;
  }
}

async function initializeFirebase() {
  try {
    const firebase = await loadFirebaseCompat();

    const firebaseConfig = {
      databaseURL: 'https://ccccg-7d6b6-default-rtdb.firebaseio.com'
    };

    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = firebase.database(app);
    attachDatabase(db);
  } catch (err) {
    console.error('Failed to initialize SOMF Firebase', err);
  }
}

initializeFirebase();
