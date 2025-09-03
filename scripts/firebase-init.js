// Initialize Firebase if the configuration and SDK are available.
function initFirebase() {
  if (!window.firebase || !window.firebaseConfig) return;
  try {
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(window.firebaseConfig);
    }
  } catch (e) {
    console.error('Firebase initialization failed', e);
  }
}

// Automatically initialize when running in the browser.
if (typeof window !== 'undefined') {
  window.initFirebase = initFirebase;
  initFirebase();
}
