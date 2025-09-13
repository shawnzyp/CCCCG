import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js';

const firebaseConfig = {
  databaseURL: 'https://ccccg-7d6b6-default-rtdb.firebaseio.com'
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

if (window.SOMF_MIN && typeof window.SOMF_MIN.setFirebase === 'function') {
  window.SOMF_MIN.setFirebase(db);
}
