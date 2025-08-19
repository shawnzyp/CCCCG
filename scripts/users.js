import { saveLocal, loadLocal } from './storage.js';
import { $ } from './helpers.js';

const PLAYERS_KEY = 'players';
const PLAYER_SESSION = 'player-session';
const DM_SESSION = 'dm-session';
const DM_PASSWORD = 'Dragons22!';

function getPlayersRaw() {
  const raw = localStorage.getItem(PLAYERS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    // If the stored data is corrupted or invalid JSON, discard it so the
    // application can continue operating with a clean slate instead of
    // throwing a runtime error that breaks the page.
    console.error('Failed to parse players from localStorage', e);
    return {};
  }
}

export function getPlayers() {
  return Object.keys(getPlayersRaw());
}

export function registerPlayer(name, password) {
  const players = getPlayersRaw();
  if (name && password && !players[name]) {
    players[name] = { password };
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }
  return Object.keys(players);
}

export function loginPlayer(name, password) {
  const players = getPlayersRaw();
  const p = players[name];
  if (p && p.password === password) {
    localStorage.setItem(PLAYER_SESSION, name);
    return true;
  }
  return false;
}

export function currentPlayer() {
  return localStorage.getItem(PLAYER_SESSION);
}

export function logoutPlayer() {
  localStorage.removeItem(PLAYER_SESSION);
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
  return loadLocal('player:' + player);
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

function hideModal() {
  const m = $('modal-player');
  if (m) {
    m.classList.add('hidden');
    m.setAttribute('aria-hidden', 'true');
  }
}

function updatePlayerButton() {
  const btn = $('btn-player');
  if (btn) {
    const p = currentPlayer();
    btn.textContent = p ? p : 'Log In';
  }
}

function updateDMButton() {
  const btn = $('btn-dm');
  if (btn) {
    btn.hidden = !isDM();
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    updatePlayerButton();
    updateDMButton();

    const regBtn = $('register-player');
    if (regBtn) {
      regBtn.addEventListener('click', () => {
        const nameInput = $('player-name');
        const passInput = $('player-password');
        const name = nameInput.value.trim();
        const pass = passInput.value;
        registerPlayer(name, pass);
        nameInput.value = '';
        passInput.value = '';
        toast('Player registered','success');
      });
    }

    const loginBtn = $('login-player');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const name = $('player-name').value.trim();
        const pass = $('player-password').value;
        if (loginPlayer(name, pass)) {
          toast(`Logged in as ${name}`,'success');
          updatePlayerButton();
          updateDMButton();
          hideModal();
        } else {
          toast('Invalid credentials','error');
        }
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
          const box = $('dm-login');
          if (box) box.hidden = true;
          hideModal();
        } else {
          toast('Invalid credentials','error');
        }
      });
    }
  });
}

