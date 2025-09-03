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

// Attempt to fetch a Firebase Auth ID token and cache it. The application can
// operate without Firebase (only local saves) so failures are logged but do not
// throw. Authentication is optional but when available the token is appended to
// database requests so security rules requiring `auth != null` are satisfied.
let idToken = null;

async function getIdToken() {
  if (idToken) return idToken;
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
        return idToken;
      }
    }
  } catch (e) {
    console.error('Failed to acquire auth token', e);
  }
  return null;
}

async function authedFetch(url, options) {
  const token = await getIdToken();
  if (token) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}auth=${token}`;
  }
  return options ? fetch(url, options) : fetch(url);
}

export async function saveCloud(name, payload) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(`${CLOUD_SAVES_URL}/${encodeURIComponent(name)}.json`, {
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
    console.error('Cloud save failed', e);
    throw e;
  }
}

export async function loadCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(`${CLOUD_SAVES_URL}/${encodeURIComponent(name)}.json`);
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const val = await res.json();
    if (val !== null) return val;
  } catch (e) {
    console.error('Cloud load failed', e);
  }
  throw new Error('No save found');
}

export async function deleteCloud(name) {
  try {
    if (typeof fetch !== 'function') throw new Error('fetch not supported');
    const res = await authedFetch(`${CLOUD_SAVES_URL}/${encodeURIComponent(name)}.json`, {
      method: 'DELETE'
    });
    if (res.status === 401 || res.status === 403) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (localStorage.getItem('last-save') === name) {
      localStorage.removeItem('last-save');
    }
  } catch (e) {
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
    const playerKeys = keys.filter(k => typeof k === 'string' && k.startsWith('player:'));
    await Promise.all(
      playerKeys.map(async k => {
        try {
          const data = await loadFn(k);
          await saveFn(k, data);
        } catch (e) {
          console.error('Failed to cache', k, e);
        }
      })
    );
  } catch (e) {
    console.error('Failed to cache cloud saves', e);
  }
}
