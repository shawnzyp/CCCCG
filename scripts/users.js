import { saveLocal, loadLocal } from './storage.js';
import { $ } from './helpers.js';

const PLAYERS_KEY = 'players';
const PLAYER_SESSION = 'player-session';
const DM_SESSION = 'dm-session';
const DM_PASSWORD = 'Dragons22!';

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
function updatePlayerList() {
  const sel = $('player-select');
  if (!sel) return;
  const players = getPlayers();
  sel.innerHTML = players.map(p => `<option value="${p}">${p}</option>`).join('');
}

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

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    updatePlayerList();
    updatePlayerButton();

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
          hideModal();
        } else {
          toast('Invalid credentials','error');
        }
      });
    }

    function showDMUI() {
      const btn = $('btn-dm-edit');
      if (btn) btn.style.display = 'inline-flex';
    }

    const secret = $('dm-secret');
    if (secret) {
      secret.addEventListener('click', () => {
        const pass = prompt('DM Password');
        if (loginDM(pass)) {
          showDMUI();
        } else {
          console.error('Invalid password');
        }
      });
    }

    const dmEditBtn = $('btn-dm-edit');
    if (dmEditBtn) {
      dmEditBtn.addEventListener('click', () => {
        const modal = $('modal-player');
        if (modal) {
          modal.classList.remove('hidden');
          modal.setAttribute('aria-hidden','false');
        }
        const tools = $('dm-tools');
        if (tools) {
          tools.style.display = 'block';
          updatePlayerList();
        }
      });
    }

    if (isDM()) {
      showDMUI();
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

