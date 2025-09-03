import { saveLocal, loadLocal, loadCloud, saveCloud, listCloudSaves, listLocalSaves } from './storage.js';
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

function getPlayersRaw() {
  let raw;
  try {
    raw = localStorage.getItem(PLAYERS_KEY);
  } catch (e) {
    // Accessing localStorage can fail in some environments (e.g. disabled
    // storage or privacy modes). Treat this as no data rather than throwing an
    // uncaught exception that prevents the page from loading.
    console.error('Failed to access localStorage', e);
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
    console.error('Failed to parse players from localStorage', e);
    try { localStorage.removeItem(PLAYERS_KEY); } catch {}
    playersCache = {};
    playersCacheRaw = null;
    return playersCache;
  }
}

function setPlayersRaw(players) {
  playersCache = players;
  playersCacheRaw = JSON.stringify(players);
  localStorage.setItem(PLAYERS_KEY, playersCacheRaw);
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
  if (!name || !password || !question || !answer || players[name]) {
    return false;
  }
  players[name] = { password, question, answer };
  setPlayersRaw(players);
  return true;
}

export function getPlayerQuestion(name) {
  const p = getPlayersRaw()[name];
  return p ? p.question : null;
}

export function recoverPlayerPassword(name, answer) {
  const p = getPlayersRaw()[name];
  if (p && p.answer === answer) {
    return p.password;
  }
  return null;
}

export function loginPlayer(name, password) {
  const players = getPlayersRaw();
  const p = players[name];
  if (p && p.password === password) {
    // Logging in as a player should terminate any active DM session to avoid
    // concurrent logins. Use the standard logout helper so events are
    // dispatched consistently.
    logoutDM();
    localStorage.setItem(PLAYER_SESSION, name);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('playerChanged'));
    }
    return true;
  }
  return false;
}

export function currentPlayer() {
  return localStorage.getItem(PLAYER_SESSION);
}

export function logoutPlayer() {
  localStorage.removeItem(PLAYER_SESSION);
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
    localStorage.setItem(DM_SESSION, '1');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('playerChanged'));
    }
    return true;
  }
  return false;
}

export function isDM() {
  return localStorage.getItem(DM_SESSION) === '1';
}

export function logoutDM() {
  localStorage.removeItem(DM_SESSION);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('playerChanged'));
  }
}

export async function savePlayerCharacter(player, data) {
  if (currentPlayer() !== player && !isDM()) throw new Error('Not authorized');
  await saveLocal('player:' + player, data);
  // Persist to the shared cloud store so DMs and other devices see updates.
  saveCloud('player:' + player, data).catch(e => console.error('Cloud save failed', e));
}

export async function loadPlayerCharacter(player) {
  if (currentPlayer() !== player && !isDM()) throw new Error('Not authorized');
  try {
    const data = await loadCloud('player:' + player);
    // Cache the latest cloud version locally for offline access.
    try { await saveLocal('player:' + player, data); } catch {}
    return data;
  } catch (e) {
    // Cloud load failed (e.g. offline), fall back to local copy.
    return await loadLocal('player:' + player);
  }
}

export function editPlayerCharacter(player, data) {
  if (!isDM()) throw new Error('Not authorized');
  return savePlayerCharacter(player, data);
}

export async function listCharacters(listFn = listCloudSaves, localFn = listLocalSaves) {
  let cloud = [];
  try {
    cloud = await listFn();
  } catch (e) {
    console.error('Failed to list cloud saves', e);
  }
  let local = [];
  try {
    local = await localFn();
  } catch (e) {
    console.error('Failed to list local saves', e);
  }
  const saves = [...cloud, ...local];
  return Array.from(new Set(
    saves
      .filter(k => k.toLowerCase().startsWith('player:'))
      .map(k => k.slice(7))
  )).sort((a, b) => a.localeCompare(b));
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
      loginBtn.addEventListener('click', () => {
        const name = $('login-player-name').value.trim();
        const pass = $('login-player-password').value;
        if (loginPlayer(name, pass)) {
          toast(`Logged in as ${name}`,'success');
          updatePlayerButton();
          updateDMButton();
          hideModal('modal-player');
        } else {
          toast('Invalid credentials','error');
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
          try {
            window.location.reload();
          } catch (e) {
            // Ignore reload errors (e.g., during tests)
          }
        } else {
          toast('Invalid credentials','error');
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
        try {
          window.location.reload();
        } catch (e) {
          // Ignore reload errors (e.g., during tests)
        }
      });
    }
  });
}

