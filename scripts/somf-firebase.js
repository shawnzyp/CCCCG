import { getFirebaseDatabase } from './auth.js';

let firebaseInitPromise = null;

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

async function initializeFirebaseInternal() {
  const db = await getFirebaseDatabase();
  attachDatabase(db);
}

export function ensureSomfFirebase() {
  if (!firebaseInitPromise) {
    firebaseInitPromise = initializeFirebaseInternal().catch(err => {
      console.error('Failed to initialize SOMF Firebase', err);
      firebaseInitPromise = null;
      throw err;
    });
  }
  return firebaseInitPromise;
}
