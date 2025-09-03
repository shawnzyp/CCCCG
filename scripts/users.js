import { saveLocal, loadLocal, loadCloud, saveCloud, listCloudSaves, listLocalSaves, cacheCloudSaves } from './storage.js';
import { $ } from './helpers.js';
import { show as showModal, hide as hideModal } from './modal.js';

const PLAYERS_KEY = 'players';
const PLAYER_SESSION = 'player-session';
const DM_SESSION = 'dm-session';
const DM_PASSWORD = 'Dragons22!';

// Cache frequently accessed DOM elements and player data to reduce repeated
// lookups and expensive JSON parsing of the players list.
let dmPasswordInput = null;
let playersCache = null;
let playersCacheRaw = null;
let storageBlocked = false;

// Helper to determine if cloud functionality is available. When `fetch` is not
// implemented (e.g. during tests or in very old browsers) cloud operations
// should be skipped silently rather than emitting noisy errors.
function canUseCloud() {
  return typeof fetch === 'function';
}

function getPlayersRaw() {
  let raw;
  try {
    raw = localStorage.getItem(PLAYERS_KEY);
    storageBlocked = false;
  } catch (e) {
    // Accessing localStorage can fail in some environments (e.g. disabled
    // storage or privacy modes). Treat this as no data rather than throwing an
    // uncaught exception that prevents the page from loading.
    console.warn('Failed to access localStorage', e);
    playersCache = {};
    playersCacheRaw = null;
    return playersCache;
  }

  // If the stored value hasn't changed, reuse the cached object rather than
  // parsing JSON again. This avoids work in hot paths like login checks.
  if (raw === playersCacheRaw && playersCache !== null) return playersCache;

  if (!raw) {
    playersCache = {};
    playersCacheRaw = null;
    return playersCache;
  }

  try {
    playersCache = JSON.parse(raw);
    playersCacheRaw = raw;
    return playersCache;
  } catch (e) {
    // If the stored data is corrupted or invalid JSON, discard it so the
    // application can continue operating with a clean slate instead of
    // throwing a runtime error that breaks the page.
    console.warn('Failed to parse players from localStorage', e);
    try { localStorage.removeItem(PLAYERS_KEY); } catch {}
    playersCache = {};
    playersCacheRaw = null;
    return playersCache;
  }
}

function setPlayersRaw(players) {
  playersCache = players;
  playersCacheRaw = JSON.stringify(players);
  try {
    localStorage.setItem(PLAYERS_KEY, playersCacheRaw);
    storageBlocked = false;
  } catch (e) {
    storageBlocked = true;
    console.warn('Failed to write players to localStorage', e);
  }
}

export function storageAvailable() {
  return !storageBlocked;
}

export function getPlayers() {
  // Return player names in a consistent alphabetical order so that UI
  // lists remain stable regardless of the registration sequence. Sorting
  // also makes unit tests deterministic when using Object keys which
  // otherwise preserve insertion order.
  return Object.keys(getPlayersRaw()).sort((a, b) => a.localeCompare(b));
}

export function registerPlayer(name, password, question, answer) {
  const players = getPlayersRaw();
  if (!name || !password || !question || !answer) {
    return false;
  }
  const lower = name.toLowerCase();
  for (const existing of Object.keys(players)) {
    if (existing.toLowerCase() === lower) {
      return false;
    }
  }
  const record = { password, question, answer };
  players[name] = record;
  setPlayersRaw(players);
  if (storageBlocked) return false;
  // Persist player credentials to the cloud so logins work across devices.
  if (canUseCloud()) {
    saveCloud('user:' + name, record).catch(e =>
      console.error('Cloud player save failed', e)
    );
  }
  return true;
}

export function getPlayerQuestion(name) {
  const players = getPlayersRaw();
  const lower = name.toLowerCase();
  for (const key of Object.keys(players)) {
    if (key.toLowerCase() === lower) {
      return players[key].question;
    }
  }
  return null;
}

export function recoverPlayerPassword(name, answer) {
  const players = getPlayersRaw();
  const lower = name.toLowerCase();
  for (const key of Object.keys(players)) {
    if (key.toLowerCase() === lower) {
      const p = players[key];
      return p.answer === answer ? p.password : null;
    }
  }
  return null;
}

async function loadPlayerRecord(name) {
  const players = getPlayersRaw();
  const lower = name.toLowerCase();
  let canonical = name;
  for (const key of Object.keys(players)) {
    if (key.toLowerCase() === lower) {
      canonical = key;
      break;
    }
  }
  let record = players[canonical] || null;
  if (canUseCloud()) {
    let remote = null;
    try {
      remote = await loadCloud('user:' + canonical);
    } catch (e) {
      if (e && e.message === 'No save found') {
        try {
          const keys = await listCloudSaves();
          const match = keys.find(
            k => k.toLowerCase() === ('user:' + name).toLowerCase()
          );
          if (match) {
            canonical = match.slice(5);
            remote = await loadCloud(match);
          }
        } catch (e2) {
          if (e2 && e2.message !== 'fetch not supported') {
            console.error('Failed to load player from cloud', e2);
          }
        }
      } else if (e && e.message !== 'fetch not supported') {
        console.error('Failed to load player from cloud', e);
      }
    }
    if (remote && typeof remote.password === 'string') {
      players[canonical] = remote;
      try {
        setPlayersRaw(players);
      } catch {}
      record = remote;
    }
  }
  return { record, canonical };
}

export async function loginPlayer(name, password) {
  const { record: p, canonical } = await loadPlayerRecord(name);
  if (p && p.password === password) {
    // Logging in as a player should terminate any active DM session to avoid
    // concurrent logins. Use the standard logout helper so events are
    // dispatched consistently.
    logoutDM();
    try {
      localStorage.setItem(PLAYER_SESSION, canonical);
      storageBlocked = false;
    } catch (e) {
      storageBlocked = true;
      console.warn('Failed to access localStorage', e);
      return false;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('playerChanged'));
    }
    return true;
  }
  return false;
}

export function currentPlayer() {
  try {
    const v = localStorage.getItem(PLAYER_SESSION);
    storageBlocked = false;
    return v;
  } catch (e) {
    storageBlocked = true;
    console.warn('Failed to access localStorage', e);
    return null;
  }
}

export function logoutPlayer() {
  try {
    localStorage.removeItem(PLAYER_SESSION);
    storageBlocked = false;
  } catch (e) {
    storageBlocked = true;
    console.warn('Failed to access localStorage', e);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('playerChanged'));
  }
}

export function loginDM(password) {
  if (password === DM_PASSWORD) {
    // Signing in as the DM should terminate any existing player session so
    // that the DM is the only account with an active login. Reuse the normal
    // logout helper to ensure events are dispatched and session storage is
    // cleared consistently.
    logoutPlayer();
    try {
      localStorage.setItem(DM_SESSION, '1');
      storageBlocked = false;
    } catch (e) {
      storageBlocked = true;
      console.warn('Failed to access localStorage', e);
      return false;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('playerChanged'));
    }
    return true;
  }
  return false;
}

export function isDM() {
  try {
    const v = localStorage.getItem(DM_SESSION) === '1';
    storageBlocked = false;
    return v;
  } catch (e) {
    storageBlocked = true;
    console.warn('Failed to access localStorage', e);
    return false;
  }
}

export function logoutDM() {
  try {
    localStorage.removeItem(DM_SESSION);
    storageBlocked = false;
  } catch (e) {
    storageBlocked = true;
    console.warn('Failed to access localStorage', e);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('playerChanged'));
  }
}

export async function savePlayerCharacter(player, data) {
  if (currentPlayer() !== player && !isDM()) throw new Error('Not authorized');
  await saveLocal('Player :' + player, data);
  // Persist to the shared cloud store so DMs and other devices see updates.
  if (canUseCloud()) {
    saveCloud('Player :' + player, data).catch(e => console.error('Cloud save failed', e));
  }
}

export async function loadPlayerCharacter(player) {
  if (currentPlayer() !== player && !isDM()) throw new Error('Not authorized');
  try {
    const data = await loadCloud('Player :' + player);
    // Cache the latest cloud version locally for offline access.
    try { await saveLocal('Player :' + player, data); } catch {}
    return data;
  } catch (e) {
    // Cloud load failed (e.g. offline), fall back to local copy.
    return await loadLocal('Player :' + player);
  }
}

export function editPlayerCharacter(player, data) {
  if (!isDM()) throw new Error('Not authorized');
  return savePlayerCharacter(player, data);
}

export async function listCharacters(listFn = listCloudSaves, localFn = listLocalSaves) {
  let cloud = [];
  if (canUseCloud() || listFn !== listCloudSaves) {
    try {
      cloud = await listFn();
    } catch (e) {
      console.error('Failed to list cloud saves', e);
    }
  }
  let local = [];
  try {
    local = await localFn();
  } catch (e) {
    console.error('Failed to list local saves', e);
  }

  // Combine cloud and local keys. Some keys may be URL-encoded (for example
  // legacy saves or Firebase keys) while others are stored verbatim. To avoid
  // mangling player names that legitimately contain "%" characters, only
  // decode keys when the player prefix itself is encoded. Names are then
  // de-duplicated case-insensitively.
  const names = [];
  const seen = new Set();
  for (const raw of [...cloud, ...local]) {
    if (!raw) continue;
    let key = raw;
    if (!/^player\s*:/i.test(key)) {
      try {
        key = decodeURIComponent(key);
      } catch {}
    }
    const match = /^player\s*:(.*)$/i.exec(key);
    if (!match) continue;
    const name = match[1];
    const lower = name.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      names.push(name);
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}

export async function syncPlayersFromCloud(
  listFn = listCloudSaves,
  loadFn = loadCloud
) {
  if (!canUseCloud() && listFn === listCloudSaves && loadFn === loadCloud) return;
  try {
    const keys = await listFn();
    const arr = Array.isArray(keys) ? keys : [];
    const userKeys = arr.filter(k => typeof k === 'string' && k.startsWith('user:'));
    if (userKeys.length === 0) return;
    const players = getPlayersRaw();
    await Promise.all(
      userKeys.map(async k => {
        const name = k.slice(5);
        try {
          const data = await loadFn(k);
          if (data && typeof data.password === 'string') {
            players[name] = data;
          }
        } catch (e) {
          console.error('Failed to sync player', k, e);
        }
      })
    );
    try { setPlayersRaw(players); } catch {}
  } catch (e) {
    console.error('Failed to sync players from cloud', e);
  }
}

// ===== DOM Wiring =====
function toast(msg, type = 'info') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1200);
}

function updatePlayerButton() {
  const btn = $('btn-player');
  const logoutBtn = $('logout-player');
  const p = currentPlayer();
  if (btn) {
    btn.textContent = p ? p : 'Log In';
  }
  if (logoutBtn) {
    logoutBtn.hidden = !p;
  }
}

function updateDMButton() {
  const btn = $('btn-dm');
  if (btn) {
    btn.hidden = !isDM();
  }
}

/**
 * Show or hide DM login controls based on current authorization state.
 * Reuses cached password input element to minimize DOM lookups.
 */
function updateDMLoginControls() {
  const logged = isDM();
  const loginBtn = $('login-dm');
  const logoutBtn = $('logout-dm');
  if (loginBtn) loginBtn.hidden = logged;
  if (logoutBtn) logoutBtn.hidden = !logged;
  if (dmPasswordInput) dmPasswordInput.hidden = logged;
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      cacheCloudSaves().catch(e => console.error('Failed to cache cloud saves', e));
      syncPlayersFromCloud().catch(e => console.error('Failed to sync players from cloud', e));
      dmPasswordInput = $('dm-password');
      const modalDMLogin = $('modal-dm-login');
      const recoverName = $('recover-name');
      const recoverAnswer = $('recover-answer');
      const recoverQuestion = $('recover-question');
    updatePlayerButton();
    updateDMButton();
    updateDMLoginControls();

    window.addEventListener('playerChanged', () => {
      updatePlayerButton();
      updateDMButton();
      updateDMLoginControls();
    });

    const regBtn = $('register-player');
    if (regBtn) {
      regBtn.addEventListener('click', () => {
        const nameInput = $('register-player-name');
        const passInput = $('register-player-password');
        const questionInput = $('register-player-question');
        const answerInput = $('register-player-answer');
        const name = nameInput.value.trim();
        const pass = passInput.value;
        const question = questionInput.value.trim();
        const answer = answerInput.value;
        if (!name && !pass && !question && !answer) {
          toast('Player name, password, question, and answer required','error');
          return;
        }
        if (!name) {
          toast('Player name required','error');
          return;
        }
        if (!pass) {
          toast('Password required','error');
          return;
        }
        if (!question) {
          toast('Security question required','error');
          return;
        }
        if (!answer) {
          toast('Security answer required','error');
          return;
        }
        if (!registerPlayer(name, pass, question, answer)) {
          toast('Player already exists','error');
          return;
        }
        nameInput.value = '';
        passInput.value = '';
        questionInput.value = '';
        answerInput.value = '';
        toast('Player registered','success');
        hideModal('modal-register');
      });
    }

    const loginBtn = $('login-player');
    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        const name = $('login-player-name').value.trim();
        const pass = $('login-player-password').value;
        if (await loginPlayer(name, pass)) {
          toast(`Logged in as ${name}`,'success');
          updatePlayerButton();
          updateDMButton();
          hideModal('modal-player');
        } else {
          toast(
            storageAvailable() ? 'Invalid credentials' : 'Storage access denied',
            'error'
          );
        }
      });
    }

    const regLink = $('open-register');
    if (regLink) {
      regLink.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('modal-register');
      });
    }

    const recoverLink = $('open-recover');
    if (recoverLink) {
      recoverLink.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('modal-recover');
      });
    }

    if (recoverName && recoverQuestion) {
      recoverName.addEventListener('input', () => {
        const q = getPlayerQuestion(recoverName.value.trim());
        recoverQuestion.textContent = q || '';
      });
    }

    const recoverBtn = $('recover-player');
    if (recoverBtn) {
      recoverBtn.addEventListener('click', () => {
        const name = recoverName ? recoverName.value.trim() : '';
        const answer = recoverAnswer ? recoverAnswer.value : '';
        const pass = recoverPlayerPassword(name, answer);
        if (pass) {
          toast(`Password: ${pass}`,'info');
          hideModal('modal-recover');
        } else {
          toast('Incorrect answer','error');
        }
      });
    }

    const logoutBtn = $('logout-player');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        logoutPlayer();
        toast('Logged out','info');
        updatePlayerButton();
        hideModal('modal-player');
      });
    }

    const dmBtn = $('login-dm');
    if (dmBtn) {
      dmBtn.addEventListener('click', () => {
        const pass = dmPasswordInput ? dmPasswordInput.value : '';
        if (loginDM(pass)) {
          toast('DM logged in','success');
          if (dmPasswordInput) dmPasswordInput.value = '';
          updateDMButton();
          updateDMLoginControls();
            if (modalDMLogin) {
              modalDMLogin.classList.add('hidden');
              modalDMLogin.setAttribute('aria-hidden','true');
            }
            if (
              typeof window !== 'undefined' &&
              window.location &&
              typeof window.location.reload === 'function' &&
              !/jsdom/i.test(window.navigator?.userAgent || '')
            ) {
              try {
                window.location.reload();
              } catch (e) {
                // Ignore reload errors (e.g., during tests)
              }
            }
        } else {
          toast(
            storageAvailable() ? 'Invalid credentials' : 'Storage access denied',
            'error'
          );
        }
      });
    }

    const dmLogoutBtn = $('logout-dm');
    if (dmLogoutBtn) {
      dmLogoutBtn.addEventListener('click', () => {
        logoutDM();
        toast('DM logged out','info');
        updateDMButton();
        updateDMLoginControls();
        if (modalDMLogin) {
          modalDMLogin.classList.add('hidden');
          modalDMLogin.setAttribute('aria-hidden','true');
        }
        if (
          typeof window !== 'undefined' &&
          window.location &&
          typeof window.location.reload === 'function' &&
          !/jsdom/i.test(window.navigator?.userAgent || '')
        ) {
          try {
            window.location.reload();
          } catch (e) {
            // Ignore reload errors (e.g., during tests)
          }
        }
      });
    }
  });
}

