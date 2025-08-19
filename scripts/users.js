import { saveLocal, loadLocal } from './storage.js';
import { $ } from './helpers.js';

const PLAYERS_KEY = 'players';
const PLAYER_SESSION = 'player-session';
const DM_KEY = 'dm-account';
const DM_SESSION = 'dm-session';

function getPlayersRaw() {
  const raw = localStorage.getItem(PLAYERS_KEY);
  return raw ? JSON.parse(raw) : {};
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

export function registerDM(password) {
  if (localStorage.getItem(DM_KEY)) throw new Error('DM already registered');
  localStorage.setItem(DM_KEY, JSON.stringify({ password }));
}

export function loginDM(password) {
  const dm = JSON.parse(localStorage.getItem(DM_KEY) || '{}');
  if (dm.password === password) {
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
function updatePlayerList() {
  const sel = $('player-select');
  if (!sel) return;
  const players = getPlayers();
  sel.innerHTML = players.map(p => `<option value="${p}">${p}</option>`).join('');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    updatePlayerList();

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
        updatePlayerList();
      });
    }

    const loginBtn = $('login-player');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const name = $('player-name').value.trim();
        const pass = $('player-password').value;
        if (!loginPlayer(name, pass)) {
          console.error('Invalid credentials');
        }
      });
    }

    const dmRegBtn = $('dm-register');
    if (dmRegBtn) {
      dmRegBtn.addEventListener('click', () => {
        const pass = $('dm-password').value;
        try {
          registerDM(pass);
          console.log('DM registered');
        } catch (e) {
          console.error('DM already registered');
        }
      });
    }

    const dmLoginBtn = $('dm-login');
    if (dmLoginBtn) {
      dmLoginBtn.addEventListener('click', () => {
        const pass = $('dm-password').value;
        if (loginDM(pass)) {
          const tools = $('dm-tools');
          if (tools) tools.style.display = 'block';
          updatePlayerList();
        } else {
          console.error('Invalid password');
        }
      });
    }

    if (isDM()) {
      const tools = $('dm-tools');
      if (tools) tools.style.display = 'block';
      updatePlayerList();
    }

    const loadBtn = $('load-player');
    if (loadBtn) {
      loadBtn.addEventListener('click', async () => {
        const sel = $('player-select');
        if (!sel || !sel.value) return;
        try {
          const data = await loadPlayerCharacter(sel.value);
          localStorage.setItem('autosave', JSON.stringify(data));
          location.reload();
        } catch (e) {
          console.error('Could not load player', e);
        }
      });
    }
  });
}

