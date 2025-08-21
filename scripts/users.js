import { saveLocal, loadLocal, loadCloud } from './storage.js';
import { $ } from './helpers.js';

const PLAYERS_KEY = 'players';
const PLAYER_SESSION = 'player-session';
const DM_SESSION = 'dm-session';
const DM_PASSWORD = 'Dragons22!';

function getPlayersRaw() {
  let raw;
  try {
    raw = localStorage.getItem(PLAYERS_KEY);
  } catch (e) {
    // Accessing localStorage can fail in some environments (e.g. disabled
    // storage or privacy modes). Treat this as no data rather than throwing an
    // uncaught exception that prevents the page from loading.
    console.error('Failed to access localStorage', e);
    return {};
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    // If the stored data is corrupted or invalid JSON, discard it so the
    // application can continue operating with a clean slate instead of
    // throwing a runtime error that breaks the page.
    console.error('Failed to parse players from localStorage', e);
    try { localStorage.removeItem(PLAYERS_KEY); } catch {}
    return {};
  }
}

export function getPlayers() {
  return Object.keys(getPlayersRaw());
}

export function registerPlayer(name, password, question, answer) {
  const players = getPlayersRaw();
  if (name && password && question && answer && !players[name]) {
    players[name] = { password, question, answer };
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }
  return Object.keys(players);
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
    localStorage.setItem(DM_SESSION, '1');
    return true;
  }
  return false;
}

export function isDM() {
  return localStorage.getItem(DM_SESSION) === '1';
}

export function logoutDM() {
  localStorage.removeItem(DM_SESSION);
}

export async function savePlayerCharacter(player, data) {
  if (currentPlayer() !== player && !isDM()) throw new Error('Not authorized');
  return saveLocal('player:' + player, data);
}

export async function loadPlayerCharacter(player) {
  if (currentPlayer() !== player && !isDM()) throw new Error('Not authorized');
  try {
    return await loadLocal('player:' + player);
  } catch (e) {
    // If the character isn't saved locally (e.g. attempting to view a player's
    // sheet from another device), fall back to the cloud save. This allows the
    // DM to load any player's character as long as it exists in the shared
    // database.
    return await loadCloud('player:' + player);
  }
}

export function editPlayerCharacter(player, data) {
  if (!isDM()) throw new Error('Not authorized');
  return savePlayerCharacter(player, data);
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

function showModal(id) {
  const m = $(id);
  if (m) {
    m.classList.remove('hidden');
    m.setAttribute('aria-hidden', 'false');
  }
}

function hideModal(id) {
  const m = $(id);
  if (m) {
    m.classList.add('hidden');
    m.setAttribute('aria-hidden', 'true');
  }
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

function updateDMLoginControls() {
  const logged = isDM();
  const loginBtn = $('login-dm');
  const logoutBtn = $('logout-dm');
  const passInput = $('dm-password');
  if (loginBtn) loginBtn.hidden = logged;
  if (logoutBtn) logoutBtn.hidden = !logged;
  if (passInput) passInput.hidden = logged;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    updatePlayerButton();
    updateDMButton();
    updateDMLoginControls();

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
        registerPlayer(name, pass, question, answer);
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

    const recoverName = $('recover-name');
    if (recoverName) {
      recoverName.addEventListener('input', () => {
        const q = getPlayerQuestion(recoverName.value.trim());
        const qEl = $('recover-question');
        if (qEl) qEl.textContent = q || '';
      });
    }

    const recoverBtn = $('recover-player');
    if (recoverBtn) {
      recoverBtn.addEventListener('click', () => {
        const name = $('recover-name').value.trim();
        const answer = $('recover-answer').value;
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
        const pass = $('dm-password').value;
        if (loginDM(pass)) {
          toast('DM logged in','success');
          $('dm-password').value = '';
          updateDMButton();
          updateDMLoginControls();
          const modal = $('modal-dm-login');
          if (modal) {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden','true');
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
        const modal = $('modal-dm-login');
        if (modal) {
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden','true');
        }
      });
    }
  });
}

