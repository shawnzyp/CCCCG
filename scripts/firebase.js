// Utility for loading Firebase configuration.
// Separated from main.js so it can be unit tested in isolation without
// triggering DOM-heavy side effects.

let firebaseCfgPromise;

/**
 * Fetch the Firebase configuration JSON.
 *
 * The config file lives alongside index.html by default. A global
 * `FIREBASE_CONFIG_URL` can override the location and `FIREBASE_CONFIG`
 * can supply additional/override values.
 */
export async function loadFirebaseConfig() {
  if (!firebaseCfgPromise) {
    const url = globalThis.FIREBASE_CONFIG_URL || 'firebase-config.json';
    firebaseCfgPromise = fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }

  let cfg = await firebaseCfgPromise;
  if (globalThis.FIREBASE_CONFIG) {
    cfg = Object.assign({}, cfg, globalThis.FIREBASE_CONFIG);
  }
  return cfg;
}

