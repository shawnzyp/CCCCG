import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';

const firebaseConfig = {
  databaseURL: 'https://ccccg-7d6b6-default-rtdb.firebaseio.com'
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// The main runtime defines a global helper (SOMF_MIN.setFirebase) during its
// own initialization. This file loads before that script, so the helper may not
// exist yet. Previously this meant the database was never wired up, which
// caused the DM tools (shards toggle, shard/NPC/item lists) to silently fail
// because `window._somf_db` remained undefined. To support either load order we
// assign the database directly if the helper hasn't been registered yet.

window.SOMF_MIN = window.SOMF_MIN || {};
if (typeof window.SOMF_MIN.setFirebase === 'function') {
  window.SOMF_MIN.setFirebase(db);
} else {
  // Fallback for early load: store the db so the runtime can use it once
  // initialized.
  window._somf_db = db;
}
