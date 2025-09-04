export async function saveLocal(name, payload) {
  try {
    localStorage.setItem('save:' + name, JSON.stringify(payload));
    localStorage.setItem('last-save', name);
  } catch (e) {
    console.error('Local save failed', e);
    throw e;
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

export function listLocalSaves() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('save:')) keys.push(k.slice(5));
    }
    return keys.sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Local list failed', e);
    return [];
  }
}

// ===== Firebase Cloud Save =====
const CLOUD_SAVES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves';

// Attempt to fetch a Firebase Auth token and cache it. The application can
// operate without Firebase (only local saves) so failures are logged but do not
// throw. Authentication is optional but when available the token is appended to
// database requests so security rules requiring `auth != null` are satisfied.
let idToken = null;
let tokenIsOAuth = false;

async function getIdToken() {
  if (idToken) return { token: idToken, oauth: tokenIsOAuth };
  try {
    if (typeof window !== 'undefined' && window.firebase?.auth) {
      const auth = window.firebase.auth();
      // signInAnonymously returns a UserCredential in Firebase v8. Access the
      // user property so we always end up with an actual User instance that
      // exposes getIdToken().
      let user = auth.currentUser;
      if (!user) {
        const cred = await auth.signInAnonymously();
        user = cred && cred.user ? cred.user : cred;
      }
      if (typeof user?.getIdToken === 'function') {
        idToken = await user.getIdToken();
        tokenIsOAuth = false;
        return { token: idToken, oauth: false };
      }
    }

    // When running in a Node environment, always use the service account key
    // from `serviceAccountKey.json` to generate an OAuth2 access token for the
    // realtime database.
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { resolve } = await import('path');
      const fs = await import('fs');
      const keyPath = resolve('serviceAccountKey.json');
      if (fs.existsSync(keyPath)) {
        // Ensure downstream libraries pick up the service account automatically
        // without overwriting an explicit path from the environment.
        process.env.GOOGLE_APPLICATION_CREDENTIALS =
          process.env.GOOGLE_APPLICATION_CREDENTIALS || keyPath;
        try {
          const { GoogleAuth } = await import('google-auth-library');
          const auth = new GoogleAuth({
            keyFilename: keyPath,
            scopes: [
              'https://www.googleapis.com/auth/firebase.database',
              'https://www.googleapis.com/auth/userinfo.email',
            ],
          });
          const client = await auth.getClient();
          const access = await client.getAccessToken();
          idToken = access.token || access;
          tokenIsOAuth = true;
          return { token: idToken, oauth: true };
        } catch (e) {
          // If service account auth fails, fall through to unauthenticated mode.
          console.error('Failed to acquire service account token', e);
        }
      }
    }
  } catch (e) {
    console.error('Failed to acquire auth token', e);
  }
  return { token: null, oauth: false };
}

async function authedFetch(url, options = {}) {
  const { token, oauth } = await getIdToken();
  if (token) {
    if (oauth) {
      options.headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    } else {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}auth=${token}`;
    }
  }
  return fetch(url, options);
}

// Encode each path segment separately so callers can supply hierarchical
// keys like `player:Alice/hero1` without worrying about Firebase escaping.
function encodePath(name) {
  return name
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

export async function saveCloud(name, payload) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(`${CLOUD_SAVES_URL}/${encodePath(name)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // If the request is rejected due to missing or invalid auth, treat it as a
    // soft failure. Cloud saves are optional and the app should continue
    // operating with local storage only.
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    localStorage.setItem('last-save', name);
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud save failed', e);
  }
}

export async function loadCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(
      `${CLOUD_SAVES_URL}/${encodePath(name)}.json`,
      { method: 'GET' }
    );
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    if (e && e.message !== 'fetch not supported') {
      console.error('Cloud load failed', e);
    }
  }
  throw new Error('No save found');
}

export async function deleteCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(`${CLOUD_SAVES_URL}/${encodePath(name)}.json`, {
      method: 'DELETE'
    });
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud delete failed', e);
  }
}

export async function listCloudSaves() {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(`${CLOUD_SAVES_URL}.json`);
    if (res.status === 401 || res.status === 403) return [];
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    // Keys in the realtime database are URL-encoded because we escape them when
    // saving. Decode them here so callers receive the original player names.
    return val ? Object.keys(val).map(k => decodeURIComponent(k)) : [];
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Cloud list failed', e);
    return [];
  }
}
export async function cacheCloudSaves(
  listFn = listCloudSaves,
  loadFn = loadCloud,
  saveFn = saveLocal
) {
  try {
    const keys = await listFn();
    // Only cache player character data. Other saves such as user credentials
    // are skipped to avoid polluting local storage with unnecessary entries.
    const playerKeys = keys.filter(
      k => typeof k === 'string' && /^player\s*:/i.test(k)
    );
    await Promise.all(
      playerKeys.map(async k => {
        try {
          const data = await loadFn(k);
          await saveFn(k, data);
        } catch (e) {
          if (e && e.message === 'fetch not supported') {
            throw e;
          }
          console.error('Failed to cache', k, e);
        }
      })
    );
  } catch (e) {
    if (e && e.message === 'fetch not supported') {
      throw e;
    }
    console.error('Failed to cache cloud saves', e);
  }
}
