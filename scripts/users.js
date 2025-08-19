import { saveLocal, loadLocal } from './storage.js';
import { $ } from './helpers.js';

const PLAYERS_KEY = 'players';
const DM_KEY = 'dm-account';
const DM_SESSION = 'dm-session';

export function getPlayers() {
  const raw = localStorage.getItem(PLAYERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function registerPlayer(name) {
  const players = getPlayers();
  if (name && !players.includes(name)) {
    players.push(name);
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }
  return players;
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

export function savePlayerCharacter(player, data) {
  return saveLocal('player:' + player, data);
}

export function loadPlayerCharacter(player) {
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
        const name = nameInput.value.trim();
        registerPlayer(name);
        nameInput.value = '';
        updatePlayerList();
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

