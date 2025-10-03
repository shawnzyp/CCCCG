import { listCharacters, loadCharacter } from './characters.js';
import { DM_PIN, DM_DEVICE_FINGERPRINT } from './dm-pin.js';
import { show, hide } from './modal.js';
import {
  listMiniGames,
  getMiniGame,
  getDefaultConfig,
  loadMiniGameReadme,
  subscribeToDeployments as subscribeMiniGameDeployments,
  refreshDeployments as refreshMiniGameDeployments,
  deployMiniGame as deployMiniGameToCloud,
  updateDeployment as updateMiniGameDeployment,
  deleteDeployment as deleteMiniGameDeployment,
  MINI_GAME_STATUS_OPTIONS,
  summarizeConfig,
  getStatusLabel,
} from './mini-games.js';
const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
const MAX_STORED_NOTIFICATIONS = 100;

function computeDeviceFingerprint() {
  if (typeof navigator === 'undefined') return '';
  const { userAgent = '', language = '', platform = '' } = navigator;
  let screenInfo = '';
  if (typeof screen !== 'undefined') {
    const { width = '', height = '', colorDepth = '' } = screen;
    screenInfo = `${width}x${height}x${colorDepth}`;
  }
  let timeZone = '';
  try {
    timeZone = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || '';
  } catch {
    timeZone = '';
  }
  const raw = [userAgent, language, platform, screenInfo, timeZone].join('||');
  try {
    return btoa(raw);
  } catch {
    return raw;
  }
}

function isAuthorizedDevice() {
  if (!DM_DEVICE_FINGERPRINT) return true;
  return computeDeviceFingerprint() === DM_DEVICE_FINGERPRINT;
}

if (typeof window !== 'undefined' && !window.computeDmDeviceFingerprint) {
  window.computeDmDeviceFingerprint = computeDeviceFingerprint;
}

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function normalizeTimestamp(value) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toLocaleString();
  return new Date().toLocaleString();
}

function loadStoredNotifications() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(DM_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(entry => {
        if (!entry || typeof entry.detail !== 'string') return null;
        const ts = normalizeTimestamp(entry.ts);
        const char = typeof entry.char === 'string' ? entry.char : '';
        const html = typeof entry.html === 'string' ? entry.html : null;
        const record = { ts, char, detail: entry.detail };
        if (html) record.html = html;
        return record;
      })
      .filter(Boolean);
    if (normalized.length > MAX_STORED_NOTIFICATIONS) {
      return normalized.slice(normalized.length - MAX_STORED_NOTIFICATIONS);
    }
    return normalized;
  } catch {
    return [];
  }
}

const notifications = loadStoredNotifications();

function persistNotifications() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const trimmed = notifications.slice(-MAX_STORED_NOTIFICATIONS);
    sessionStorage.setItem(DM_NOTIFICATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore persistence errors */
  }
}

function deriveNotificationChar() {
  try {
    return sessionStorage.getItem('dmLoggedIn') === '1'
      ? 'DM'
      : localStorage.getItem('last-save') || '';
  } catch {
    return '';
  }
}

function buildNotification(detail, meta = {}) {
  const text = typeof detail === 'string' ? detail : String(detail ?? '');
  if (!text) return null;
  const ts = normalizeTimestamp(meta.ts);
  const char = typeof meta.char === 'string' && meta.char ? meta.char : deriveNotificationChar();
  const entry = { ts, char, detail: text };
  if (typeof meta.html === 'string' && meta.html) {
    entry.html = meta.html;
  }
  return entry;
}

function formatNotification(entry, { html = false } = {}) {
  const prefix = entry.char ? `${entry.char}: ` : '';
  if (html && entry.html) {
    const safeTs = escapeHtml(entry.ts);
    const safePrefix = escapeHtml(prefix);
    return `[${safeTs}] ${safePrefix}${entry.html}`;
  }
  return `[${entry.ts}] ${prefix}${entry.detail}`;
}

function initDMLogin(){
  const dmBtn = document.getElementById('dm-login');
  const dmToggleBtn = document.getElementById('dm-tools-toggle');
  const menu = document.getElementById('dm-tools-menu');
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const notifyBtn = document.getElementById('dm-tools-notifications');
  const charBtn = document.getElementById('dm-tools-characters');
  const miniGamesBtn = document.getElementById('dm-tools-mini-games');
  const logoutBtn = document.getElementById('dm-tools-logout');
  const loginModal = document.getElementById('dm-login-modal');
  const loginPin = document.getElementById('dm-login-pin');
  const loginSubmit = document.getElementById('dm-login-submit');
  const loginClose = document.getElementById('dm-login-close');
  const notifyModal = document.getElementById('dm-notifications-modal');
  const notifyList = document.getElementById('dm-notifications-list');
  const notifyClose = document.getElementById('dm-notifications-close');
  const charModal = document.getElementById('dm-characters-modal');
  const charList = document.getElementById('dm-characters-list');
  const charClose = document.getElementById('dm-characters-close');
  const charViewModal = document.getElementById('dm-character-modal');
  const charViewClose = document.getElementById('dm-character-close');
  const charView = document.getElementById('dm-character-sheet');
  const miniGamesModal = document.getElementById('dm-mini-games-modal');
  const miniGamesClose = document.getElementById('dm-mini-games-close');
  const miniGamesList = document.getElementById('dm-mini-games-list');
  const miniGamesTitle = document.getElementById('dm-mini-games-title');
  const miniGamesTagline = document.getElementById('dm-mini-games-tagline');
  const miniGamesLaunch = document.getElementById('dm-mini-games-launch');
  const miniGamesIntro = document.getElementById('dm-mini-games-steps');
  const miniGamesKnobsHint = document.getElementById('dm-mini-games-knobs-hint');
  const miniGamesKnobs = document.getElementById('dm-mini-games-knobs');
  const miniGamesPlayerHint = document.getElementById('dm-mini-games-player-hint');
  const miniGamesPlayerSelect = document.getElementById('dm-mini-games-player');
  const miniGamesPlayerCustom = document.getElementById('dm-mini-games-player-custom');
  const miniGamesNotes = document.getElementById('dm-mini-games-notes');
  const miniGamesRefreshPlayers = document.getElementById('dm-mini-games-refresh-players');
  const miniGamesDeployBtn = document.getElementById('dm-mini-games-deploy');
  const miniGamesReadme = document.getElementById('dm-mini-games-readme');
  const miniGamesRefreshBtn = document.getElementById('dm-mini-games-refresh');
  const miniGamesDeployments = document.getElementById('dm-mini-games-deployments');

  if (menu) {
    menu.setAttribute('aria-hidden', menu.hidden ? 'true' : 'false');
  }

  if (!isAuthorizedDevice()) {
    dmBtn?.remove();
    dmToggleBtn?.remove();
    menu?.remove();
    loginModal?.remove();
    notifyModal?.remove();
    charModal?.remove();
    charViewModal?.remove();
    return;
  }

  const miniGamesLibrary = listMiniGames();
  const knobStateByGame = new Map();
  miniGamesLibrary.forEach(game => {
    try {
      knobStateByGame.set(game.id, getDefaultConfig(game.id));
    } catch {
      knobStateByGame.set(game.id, {});
    }
  });
  let selectedMiniGameId = miniGamesLibrary.length ? miniGamesLibrary[0].id : null;
  let miniGamesInitialized = false;
  let miniGamesUnsubscribe = null;
  let miniGameDeploymentsCache = [];

  function ensureKnobState(gameId) {
    if (!gameId) return {};
    if (!knobStateByGame.has(gameId)) {
      try {
        knobStateByGame.set(gameId, getDefaultConfig(gameId));
      } catch {
        knobStateByGame.set(gameId, {});
      }
    }
    const stored = knobStateByGame.get(gameId) || {};
    return { ...stored };
  }

  function writeKnobState(gameId, state) {
    knobStateByGame.set(gameId, { ...state });
  }

  function updateMiniGameGuidance(game) {
    const hasKnobs = Array.isArray(game?.knobs) && game.knobs.length > 0;
    if (miniGamesIntro) {
      miniGamesIntro.textContent = game
        ? `Step 1 complete: ${game.name} is loaded and ready to deploy.`
        : 'Step 1: Choose a mini-game from the library to get started.';
    }
    if (miniGamesKnobsHint) {
      miniGamesKnobsHint.textContent = game
        ? hasKnobs
          ? 'Adjust these DM-only controls to fit the moment. Players will never see them.'
          : 'This mission has no optional tuning—skip straight to sending it to a player.'
        : 'Choose a mini-game to unlock DM-only tuning controls.';
    }
    if (miniGamesPlayerHint) {
      miniGamesPlayerHint.textContent = game
        ? 'Choose the hero to receive this mission and add any quick instructions before deploying.'
        : 'Pick who should receive the mission once you have it tuned.';
    }
  }

  function buildMiniGamesList() {
    if (!miniGamesList || miniGamesInitialized) return;
    miniGamesList.innerHTML = '';
    miniGamesLibrary.forEach(game => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.gameId = game.id;
      btn.setAttribute('aria-selected', game.id === selectedMiniGameId ? 'true' : 'false');
      const title = document.createElement('span');
      title.className = 'dm-mini-games__list-title';
      title.textContent = game.name;
      btn.appendChild(title);
      if (game.tagline) {
        const tagline = document.createElement('span');
        tagline.className = 'dm-mini-games__list-tagline';
        tagline.textContent = game.tagline;
        btn.appendChild(tagline);
      }
      li.appendChild(btn);
      miniGamesList.appendChild(li);
    });
    miniGamesInitialized = true;
  }

  function updateMiniGamesListSelection() {
    if (!miniGamesList) return;
    miniGamesList.querySelectorAll('button[data-game-id]').forEach(btn => {
      const selected = btn.dataset.gameId === selectedMiniGameId;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function resetMiniGameDetails() {
    if (miniGamesTitle) miniGamesTitle.textContent = 'Select a mini-game';
    if (miniGamesTagline) miniGamesTagline.textContent = '';
    if (miniGamesLaunch) miniGamesLaunch.hidden = true;
    if (miniGamesKnobs) {
      miniGamesKnobs.innerHTML = '<p class="dm-mini-games__empty">Pick a mini-game to unlock DM tools.</p>';
    }
    if (miniGamesReadme) {
      miniGamesReadme.textContent = 'Select a mini-game to review the player-facing briefing.';
    }
    updateMiniGameGuidance(null);
  }

  function renderMiniGameKnobs(game) {
    if (!miniGamesKnobs) return;
    const state = ensureKnobState(game.id);
    miniGamesKnobs.innerHTML = '';
    if (!Array.isArray(game.knobs) || game.knobs.length === 0) {
      miniGamesKnobs.innerHTML = '<p class="dm-mini-games__empty">This mission has no DM tuning controls.</p>';
      return;
    }
    game.knobs.forEach(knob => {
      const wrapper = document.createElement('div');
      wrapper.className = 'dm-mini-games__knob';
      wrapper.dataset.knob = knob.key;
      if (knob.type === 'toggle') {
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'dm-mini-games__knob-toggle';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(state[knob.key]);
        input.addEventListener('change', () => {
          const next = ensureKnobState(game.id);
          next[knob.key] = input.checked;
          writeKnobState(game.id, next);
        });
        toggleLabel.append(input, document.createTextNode(knob.label));
        wrapper.appendChild(toggleLabel);
      } else {
        const label = document.createElement('label');
        const labelText = document.createElement('span');
        labelText.textContent = knob.label;
        label.appendChild(labelText);
        let control;
        if (knob.type === 'select') {
          control = document.createElement('select');
          control.setAttribute('data-knob', knob.key);
          (knob.options || []).forEach(opt => {
            const option = document.createElement('option');
            option.value = String(opt.value);
            option.textContent = opt.label;
            control.appendChild(option);
          });
          const currentValue = state[knob.key] ?? knob.default ?? (knob.options?.[0]?.value ?? '');
          control.value = String(currentValue);
          control.addEventListener('change', () => {
            const next = ensureKnobState(game.id);
            next[knob.key] = control.value;
            writeKnobState(game.id, next);
          });
        } else {
          control = document.createElement('input');
          control.setAttribute('data-knob', knob.key);
          if (knob.type === 'number') {
            control.type = 'number';
            if (typeof knob.min === 'number') control.min = String(knob.min);
            if (typeof knob.max === 'number') control.max = String(knob.max);
            if (typeof knob.step === 'number') control.step = String(knob.step);
            const raw = state[knob.key];
            const value = typeof raw === 'number' && Number.isFinite(raw)
              ? raw
              : typeof knob.default === 'number'
                ? knob.default
                : typeof knob.min === 'number'
                  ? knob.min
                  : 0;
            control.value = String(value);
            control.addEventListener('change', () => {
              const parsed = Number(control.value);
              if (Number.isFinite(parsed)) {
                const next = ensureKnobState(game.id);
                next[knob.key] = parsed;
                writeKnobState(game.id, next);
              }
            });
          } else {
            control.type = 'text';
            const raw = state[knob.key] ?? knob.default ?? '';
            control.value = String(raw);
            control.addEventListener('change', () => {
              const next = ensureKnobState(game.id);
              next[knob.key] = control.value;
              writeKnobState(game.id, next);
            });
          }
        }
        label.appendChild(control);
        wrapper.appendChild(label);
      }
      if (knob.description) {
        const hint = document.createElement('small');
        hint.textContent = knob.description;
        wrapper.appendChild(hint);
      }
      miniGamesKnobs.appendChild(wrapper);
    });
  }

  function renderMiniGameDetails() {
    if (!selectedMiniGameId) {
      resetMiniGameDetails();
      return;
    }
    const game = getMiniGame(selectedMiniGameId);
    if (!game) {
      resetMiniGameDetails();
      return;
    }
    if (miniGamesTitle) miniGamesTitle.textContent = game.name;
    if (miniGamesTagline) miniGamesTagline.textContent = game.tagline || '';
    if (miniGamesLaunch) {
      if (game.url) {
        miniGamesLaunch.href = game.url;
        miniGamesLaunch.hidden = false;
      } else {
        miniGamesLaunch.hidden = true;
      }
    }
    renderMiniGameKnobs(game);
    if (shouldFocusMiniGameKnobs) {
      shouldFocusMiniGameKnobs = false;
      Promise.resolve().then(() => focusMiniGameKnobs());
    }
    updateMiniGameGuidance(game);
    if (miniGamesReadme) {
      miniGamesReadme.textContent = 'Loading briefing…';
      loadMiniGameReadme(game.id)
        .then(text => {
          if (selectedMiniGameId === game.id) {
            miniGamesReadme.textContent = text;
          }
        })
        .catch(() => {
          if (selectedMiniGameId === game.id) {
            miniGamesReadme.textContent = 'Failed to load briefing.';
          }
        });
    }
  }

  function formatTimestamp(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '';
    }
  }

  function renderMiniGameDeployments(entries = []) {
    if (!miniGamesDeployments) return;
    if (!Array.isArray(entries) || entries.length === 0) {
      miniGamesDeployments.innerHTML = '<li class="dm-mini-games__empty">Launched missions will appear here for quick status updates.</li>';
      return;
    }
    miniGamesDeployments.innerHTML = '';
    entries.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'dm-mini-games__deployment';
      li.dataset.player = entry.player || '';
      li.dataset.deploymentId = entry.id || '';
      li.dataset.status = entry.status || 'pending';

      const header = document.createElement('div');
      header.className = 'dm-mini-games__deployment-header';
      const title = document.createElement('strong');
      const gameName = entry.gameName || getMiniGame(entry.gameId)?.name || entry.gameId || 'Mini-game';
      title.textContent = `${entry.player || 'Unknown'} • ${gameName}`;
      header.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'dm-mini-games__deployment-meta';
      const status = document.createElement('span');
      status.textContent = `Status: ${getStatusLabel(entry.status || 'pending')}`;
      meta.appendChild(status);
      const tsLabel = formatTimestamp(entry.updatedAt ?? entry.createdAt);
      if (tsLabel) {
        const tsSpan = document.createElement('span');
        tsSpan.textContent = `Updated: ${tsLabel}`;
        meta.appendChild(tsSpan);
      }
      if (entry.issuedBy) {
        const issuer = document.createElement('span');
        issuer.textContent = `Issued by: ${entry.issuedBy}`;
        meta.appendChild(issuer);
      }
      header.appendChild(meta);
      li.appendChild(header);

      const summary = document.createElement('div');
      summary.className = 'dm-mini-games__deployment-summary';
      const summaryText = summarizeConfig(entry.gameId, entry.config || {});
      summary.textContent = summaryText || 'No configuration specified.';
      li.appendChild(summary);

      if (entry.notes) {
        const notes = document.createElement('div');
        notes.className = 'dm-mini-games__deployment-notes';
        notes.textContent = `Notes: ${entry.notes}`;
        li.appendChild(notes);
      }

      const actions = document.createElement('div');
      actions.className = 'dm-mini-games__deployment-actions';

      const statusSelect = document.createElement('select');
      statusSelect.setAttribute('data-action', 'status');
      statusSelect.ariaLabel = 'Deployment status';
      MINI_GAME_STATUS_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        statusSelect.appendChild(option);
      });
      statusSelect.value = entry.status || 'pending';
      actions.appendChild(statusSelect);

      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn-sm';
      updateBtn.dataset.action = 'update';
      updateBtn.textContent = 'Update';
      actions.appendChild(updateBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-sm';
      removeBtn.dataset.action = 'delete';
      removeBtn.textContent = 'Remove';
      actions.appendChild(removeBtn);

      if (entry.gameUrl) {
        const openLink = document.createElement('a');
        openLink.href = entry.gameUrl;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        openLink.className = 'btn-sm';
        openLink.textContent = 'Open Player View';
        actions.appendChild(openLink);
      }

      li.appendChild(actions);
      miniGamesDeployments.appendChild(li);
    });
  }

  function ensureMiniGameSubscription() {
    if (miniGamesUnsubscribe) return;
    miniGamesUnsubscribe = subscribeMiniGameDeployments(entries => {
      miniGameDeploymentsCache = Array.isArray(entries) ? entries : [];
      if (miniGamesModal && !miniGamesModal.classList.contains('hidden')) {
        renderMiniGameDeployments(miniGameDeploymentsCache);
      }
    });
  }

  function teardownMiniGameSubscription() {
    if (typeof miniGamesUnsubscribe === 'function') {
      try { miniGamesUnsubscribe(); } catch {}
      miniGamesUnsubscribe = null;
    }
  }

  async function refreshMiniGameCharacters({ preserveSelection = true } = {}) {
    if (!miniGamesPlayerSelect) return;
    const previous = preserveSelection ? miniGamesPlayerSelect.value : '';
    miniGamesPlayerSelect.innerHTML = '<option value="">Loading…</option>';
    try {
      const names = await listCharacters();
      miniGamesPlayerSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a character';
      miniGamesPlayerSelect.appendChild(placeholder);
      names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        miniGamesPlayerSelect.appendChild(option);
      });
      if (previous && names.includes(previous)) {
        miniGamesPlayerSelect.value = previous;
      }
    } catch (err) {
      console.error('Failed to load characters for mini-games', err);
      miniGamesPlayerSelect.innerHTML = '<option value="">Unable to load characters</option>';
    }
  }

  async function forceRefreshMiniGameDeployments() {
    try {
      const entries = await refreshMiniGameDeployments();
      miniGameDeploymentsCache = Array.isArray(entries) ? entries : [];
      if (miniGamesModal && !miniGamesModal.classList.contains('hidden')) {
        renderMiniGameDeployments(miniGameDeploymentsCache);
      }
    } catch (err) {
      console.error('Failed to refresh mini-game deployments', err);
      if (typeof toast === 'function') toast('Failed to refresh mini-games', 'error');
    }
  }

  function getMiniGameTargetPlayer() {
    const custom = miniGamesPlayerCustom?.value?.trim();
    if (custom) return custom;
    const selected = miniGamesPlayerSelect?.value?.trim();
    return selected || '';
  }

  async function handleMiniGameDeploy() {
    if (!selectedMiniGameId) {
      if (typeof toast === 'function') toast('Choose a mini-game first', 'error');
      return false;
    }
    const playerName = getMiniGameTargetPlayer();
    if (!playerName) {
      if (typeof toast === 'function') toast('Select or enter a player target', 'error');
      return false;
    }
    const config = ensureKnobState(selectedMiniGameId);
    const notes = miniGamesNotes?.value?.trim() || '';
    try {
      if (miniGamesDeployBtn) miniGamesDeployBtn.disabled = true;
      await deployMiniGameToCloud({
        gameId: selectedMiniGameId,
        player: playerName,
        config,
        notes,
        issuedBy: 'DM'
      });
      if (miniGamesNotes) miniGamesNotes.value = '';
      if (typeof toast === 'function') toast('Mini-game deployed', 'success');
      window.dmNotify?.(`Deployed ${selectedMiniGameId} to ${playerName}`);
      return true;
    } catch (err) {
      console.error('Failed to deploy mini-game', err);
      if (typeof toast === 'function') toast('Failed to deploy mini-game', 'error');
      return false;
    } finally {
      if (miniGamesDeployBtn) miniGamesDeployBtn.disabled = false;
    }
  }

  function focusMiniGameKnobs() {
    if (!miniGamesModal || miniGamesModal.classList.contains('hidden')) return;
    const knobTarget = miniGamesKnobs?.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])');
    const fallbackTarget = miniGamesPlayerSelect || miniGamesPlayerCustom || miniGamesNotes || miniGamesDeployBtn;
    const focusTarget = knobTarget || fallbackTarget;
    if (!focusTarget || typeof focusTarget.focus !== 'function') return;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      focusTarget.focus();
    }
  }

  let shouldFocusMiniGameKnobs = false;

  async function openMiniGames() {
    if (!miniGamesModal) return;
    ensureMiniGameSubscription();
    buildMiniGamesList();
    updateMiniGamesListSelection();
    shouldFocusMiniGameKnobs = true;
    renderMiniGameDetails();
    await refreshMiniGameCharacters();
    renderMiniGameDeployments(miniGameDeploymentsCache);
    show('dm-mini-games-modal');
    if (typeof miniGamesModal?.scrollTo === 'function') {
      miniGamesModal.scrollTo({ top: 0 });
    } else if (miniGamesModal) {
      miniGamesModal.scrollTop = 0;
    }
    const modalContent = miniGamesModal?.querySelector?.('.modal');
    if (modalContent) {
      if (typeof modalContent.scrollTo === 'function') {
        modalContent.scrollTo({ top: 0 });
      } else {
        modalContent.scrollTop = 0;
      }
    }
    if (shouldFocusMiniGameKnobs) {
      shouldFocusMiniGameKnobs = false;
      Promise.resolve().then(() => focusMiniGameKnobs());
    }
  }

  function closeMiniGames() {
    if (!miniGamesModal) return;
    hide('dm-mini-games-modal');
  }

  if (loginPin) {
    loginPin.type = 'password';
    loginPin.autocomplete = 'one-time-code';
    loginPin.inputMode = 'numeric';
    loginPin.pattern = '[0-9]*';
  }

  function applyNotificationContent(node, entry) {
    if (!node) return;
    if (entry?.html) {
      node.innerHTML = formatNotification(entry, { html: true });
    } else {
      node.textContent = formatNotification(entry);
    }
  }

  function renderStoredNotifications() {
    if (!notifyList || !isLoggedIn()) return;
    notifyList.innerHTML = '';
    notifications.forEach(entry => {
      const li = document.createElement('li');
      applyNotificationContent(li, entry);
      notifyList.prepend(li);
    });
  }

  function storePendingNotification(entry) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      let pending = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) pending = parsed;
      }
      pending.push(entry);
      const MAX_PENDING = 20;
      if (pending.length > MAX_PENDING) {
        pending = pending.slice(pending.length - MAX_PENDING);
      }
      sessionStorage.setItem(PENDING_DM_NOTIFICATIONS_KEY, JSON.stringify(pending));
    } catch {
      /* ignore persistence errors */
    }
  }

  function pushNotification(entry) {
    if (!isLoggedIn()) {
      storePendingNotification(entry);
      return;
    }
    notifications.push(entry);
    if (notifications.length > MAX_STORED_NOTIFICATIONS) {
      notifications.splice(0, notifications.length - MAX_STORED_NOTIFICATIONS);
    }
    persistNotifications();
    if (notifyList) {
      const li = document.createElement('li');
      applyNotificationContent(li, entry);
      notifyList.prepend(li);
    }
  }

  persistNotifications();

  window.dmNotify = function(detail, meta = {}) {
    const entry = buildNotification(detail, meta);
    if (!entry) return;
    pushNotification(entry);
  };

  function drainPendingNotifications() {
    if (!isLoggedIn()) return;
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach(item => {
        if (!item || typeof item.detail !== 'string') return;
        window.dmNotify(item.detail, { ts: item.ts, char: item.char });
      });
      sessionStorage.removeItem(PENDING_DM_NOTIFICATIONS_KEY);
    } catch {
      /* ignore draining errors */
    }
  }

  drainPendingNotifications();

  function isLoggedIn(){
    try {
      return sessionStorage.getItem('dmLoggedIn') === '1';
    } catch {
      return false;
    }
  }

  function setLoggedIn(){
    try {
      sessionStorage.setItem('dmLoggedIn','1');
    } catch {
      /* ignore */
    }
  }

  function clearLoggedIn(){
    try {
      sessionStorage.removeItem('dmLoggedIn');
    } catch {
      /* ignore */
    }
  }

  function clearNotificationDisplay() {
    if (notifyList) notifyList.innerHTML = '';
    closeNotifications();
  }

  function updateButtons(){
    const loggedIn = isLoggedIn();
    if (!loggedIn) closeMenu();
    if (!loggedIn) {
      clearNotificationDisplay();
    } else {
      renderStoredNotifications();
    }
    if (dmBtn){
      dmBtn.hidden = loggedIn;
      if (loggedIn) {
        dmBtn.style.opacity = '1';
        dmBtn.setAttribute('aria-hidden', 'true');
      } else {
        dmBtn.style.opacity = '';
        dmBtn.removeAttribute('aria-hidden');
      }
    }
    if (dmToggleBtn) {
      dmToggleBtn.hidden = !loggedIn;
      const expanded = loggedIn && menu && !menu.hidden;
      dmToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  function initTools(){
    try {
      if (window.initSomfDM) window.initSomfDM();
    } catch (e) {
      console.error('Failed to init DM tools', e);
    }
  }

  function openLogin(){
    if(!loginModal || !loginPin) return;
    show('dm-login-modal');
    loginPin.value='';
    loginPin.focus();
  }

  function closeLogin(){
    if(!loginModal) return;
    hide('dm-login-modal');
  }

  function requireLogin(){
    return new Promise((resolve, reject) => {
      if (isLoggedIn()) {
        updateButtons();
        resolve(true);
        return;
      }

      // If the modal elements are missing, fall back to a simple prompt so
      // the promise always resolves and loading doesn't hang.
      if (!loginModal || !loginPin || !loginSubmit) {
        (async () => {
          const entered = window.pinPrompt ? await window.pinPrompt('Enter DM PIN') : (typeof prompt === 'function' ? prompt('Enter DM PIN') : null);
          if (entered === DM_PIN) {
            onLoginSuccess();
            if (typeof dismissToast === 'function') dismissToast();
            if (typeof toast === 'function') toast('DM tools unlocked','success');
            resolve(true);
          } else {
            if (typeof toast === 'function') toast('Invalid PIN','error');
            reject(new Error('Invalid PIN'));
          }
        })();
        return;
      }

      openLogin();
      if (typeof toast === 'function') toast('Enter DM PIN','info');
      function cleanup(){
        loginSubmit?.removeEventListener('click', onSubmit);
        loginPin?.removeEventListener('keydown', onKey);
        loginModal?.removeEventListener('click', onOverlay);
        loginClose?.removeEventListener('click', onCancel);
      }
      function onSubmit(){
        if(loginPin.value === DM_PIN){
          onLoginSuccess();
          closeLogin();
          if (typeof dismissToast === 'function') dismissToast();
          if (typeof toast === 'function') toast('DM tools unlocked','success');
          cleanup();
          resolve(true);
        } else {
          loginPin.value='';
          loginPin.focus();
          if (typeof toast === 'function') toast('Invalid PIN','error');
        }
      }
      function onKey(e){ if(e.key==='Enter') onSubmit(); }
      function onCancel(){ closeLogin(); cleanup(); reject(new Error('cancel')); }
      function onOverlay(e){ if(e.target===loginModal) onCancel(); }
      loginSubmit?.addEventListener('click', onSubmit);
      loginPin?.addEventListener('keydown', onKey);
      loginModal?.addEventListener('click', onOverlay);
      loginClose?.addEventListener('click', onCancel);
    });
  }

  function logout(){
    clearLoggedIn();
    teardownMiniGameSubscription();
    closeMiniGames();
    updateButtons();
    if (typeof toast === 'function') toast('Logged out','info');
  }

  function closeMenu(){
    if (!menu || menu.hidden) return;
    const restoreToggleFocus = menu.contains(document.activeElement);
    menu.hidden = true;
    menu.setAttribute('aria-hidden','true');
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', 'false');
      if (restoreToggleFocus && !dmToggleBtn.hidden && typeof dmToggleBtn.focus === 'function') {
        try {
          dmToggleBtn.focus({ preventScroll: true });
        } catch {
          dmToggleBtn.focus();
        }
      }
    }
  }

  function openMenu({ focusFirst = false } = {}){
    if (!menu || !menu.hidden) return;
    menu.hidden = false;
    menu.setAttribute('aria-hidden','false');
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (focusFirst) {
      const firstItem = menu.querySelector('button');
      if (firstItem) {
        try {
          firstItem.focus({ preventScroll: true });
        } catch {
          firstItem.focus();
        }
      }
    }
  }

  function toggleMenu({ focusMenu = false } = {}){
    if (!menu) return;
    if (menu.hidden) {
      openMenu({ focusFirst: focusMenu });
    } else {
      closeMenu();
    }
  }

  function openNotifications(){
    if(!notifyModal) return;
    show('dm-notifications-modal');
  }

  function closeNotifications(){
    if(!notifyModal) return;
    hide('dm-notifications-modal');
  }

  function onLoginSuccess(){
    setLoggedIn();
    updateButtons();
    drainPendingNotifications();
    ensureMiniGameSubscription();
    initTools();
  }

    async function openCharacters(){
      if(!charModal || !charList) return;
      closeCharacterView();
      show('dm-characters-modal');
      charList.innerHTML = '<li class="dm-characters__placeholder">Loading characters…</li>';
      let names = [];
      try {
        names = await listCharacters();
      }
      catch(e){
        console.error('Failed to list characters', e);
        charList.innerHTML = '<li class="dm-characters__placeholder">Unable to load characters.</li>';
        return;
      }
      if (!Array.isArray(names) || names.length === 0) {
        charList.innerHTML = '<li class="dm-characters__placeholder">No characters available.</li>';
        return;
      }
      charList.innerHTML = '';
      const frag = document.createDocumentFragment();
      names.forEach(n => {
        if (!n) return;
        const li = document.createElement('li');
        li.className = 'dm-characters__item';
        const link = document.createElement('a');
        link.href = '#';
        link.setAttribute('role', 'button');
        link.className = 'dm-characters__link';
        link.dataset.characterName = n;
        link.textContent = n;
        li.appendChild(link);
        frag.appendChild(li);
      });
      charList.appendChild(frag);
      const firstLink = charList.querySelector('.dm-characters__link');
      if (firstLink && typeof firstLink.focus === 'function') {
        try {
          firstLink.focus({ preventScroll: true });
        } catch {
          firstLink.focus();
        }
      }
    }

  function closeCharacters(){
    if(!charModal) return;
    hide('dm-characters-modal');
  }

  function openCharacterView(){
    if(!charViewModal) return;
    show('dm-character-modal');
  }

  function closeCharacterView(){
    if(!charViewModal) return;
    hide('dm-character-modal');
  }

    function characterCard(data, name){
      const card=document.createElement('div');
      card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
      const labeled=(l,v)=>v?`<div><span style="opacity:.8;font-size:12px">${l}</span><div>${v}</div></div>`:'';
      const abilityGrid=['STR','DEX','CON','INT','WIS','CHA']
        .map(k=>labeled(k,data[k.toLowerCase()]||''))
        .join('');
      const perkGrid=[
        ['Alignment', data.alignment],
        ['Classification', data.classification],
        ['Power Style', data['power-style']],
        ['Origin', data.origin],
        ['Tier', data.tier]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      const statsGrid=[
        ['Init', data.initiative],
        ['Speed', data.speed],
        ['PP', data.pp]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      card.innerHTML=`
        <div><strong>${name}</strong></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
          ${labeled('HP', data['hp-bar']||'')}
          ${labeled('TC', data.tc||'')}
          ${labeled('SP', data['sp-bar']||'')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
        ${perkGrid?`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px">${perkGrid}</div>`:''}
        ${statsGrid?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${statsGrid}</div>`:''}
      `;
      const renderList=(title, items)=>`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">${title}</span><ul style=\"margin:4px 0 0 18px;padding:0\">${items.join('')}</ul></div>`;
      if(data.powers?.length){
        const powers=data.powers.map(p=>`<li>${labeled('Name',p.name)}${labeled('SP',p.sp)}${labeled('Range',p.range)}${labeled('Effect',p.effect)}${labeled('Save',p.save)}</li>`);
        card.innerHTML+=renderList('Powers',powers);
      }
      if(data.signatures?.length){
        const sigs=data.signatures.map(s=>`<li>${labeled('Name',s.name)}${labeled('SP',s.sp)}${labeled('Save',s.save)}${labeled('Special',s.special)}${labeled('Description',s.desc)}</li>`);
        card.innerHTML+=renderList('Signatures',sigs);
      }
      if(data.weapons?.length){
        const weapons=data.weapons.map(w=>`<li>${labeled('Name',w.name)}${labeled('Damage',w.damage)}${labeled('Range',w.range)}</li>`);
        card.innerHTML+=renderList('Weapons',weapons);
      }
      if(data.armor?.length){
        const armor=data.armor.map(a=>`<li>${labeled('Name',a.name)}${labeled('Slot',a.slot)}${a.bonus?labeled('Bonus',`+${a.bonus}`):''}${a.equipped?labeled('Equipped','Yes'):''}</li>`);
        card.innerHTML+=renderList('Armor',armor);
      }
      if(data.items?.length){
        const items=data.items.map(i=>`<li>${labeled('Name',i.name)}${labeled('Qty',i.qty)}${labeled('Notes',i.notes)}</li>`);
        card.innerHTML+=renderList('Items',items);
      }
      if(data['story-notes']){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Backstory / Notes</span><div>${data['story-notes']}</div></div>`;
      }
      const qMap={
        'q-mask':'Who are you behind the mask?',
        'q-justice':'What does justice mean to you?',
        'q-fear':'What is your biggest fear or unresolved trauma?',
        'q-first-power':'What moment first defined your sense of power—was it thrilling, terrifying, or tragic?',
        'q-origin-meaning':'What does your Origin Story mean to you now?',
        'q-before-powers':'What was your life like before you had powers or before you remembered having them?',
        'q-power-scare':'What is one way your powers scare even you?',
        'q-signature-move':'What is your signature move or ability, and how does it reflect who you are?',
        'q-emotional':'What happens to your powers when you are emotionally compromised?',
        'q-no-line':'What line will you never cross even if the world burns around you?'
      };
      const qList=Object.entries(qMap)
        .filter(([k])=>data[k])
        .map(([k,q])=>`<li><strong>${q}</strong> ${data[k]}</li>`)
        .join('');
      if(qList){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Character Questions</span><ul style=\"margin:4px 0 0 18px;padding:0\">${qList}</ul></div>`;
      }
      return card;
    }

    charList?.addEventListener('click', async e => {
      const trigger = e.target.closest('[data-character-name], a');
      if (!trigger) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      const name = trigger.dataset?.characterName || trigger.textContent?.trim();
      if (!name || !charView) return;
      try {
        const data = await loadCharacter(name, { bypassPin: true });
        charView.innerHTML='';
        charView.appendChild(characterCard(data, name));
        openCharacterView();
      } catch (err) {
        console.error('Failed to load character', err);
      }
    });

  if (dmBtn) dmBtn.addEventListener('click', () => {
    if (!isLoggedIn()) {
      requireLogin().catch(() => {});
    }
  });

  if (dmToggleBtn) {
    let skipClick = false;
    const activateToggle = (opts = {}) => {
      if (!isLoggedIn()) {
        requireLogin().catch(() => {});
        return;
      }
      toggleMenu(opts);
    };

    dmToggleBtn.addEventListener('click', () => {
      if (skipClick) {
        skipClick = false;
        return;
      }
      activateToggle();
    });

    dmToggleBtn.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        e.preventDefault();
        skipClick = true;
        activateToggle();
      }
    });

    dmToggleBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateToggle({ focusMenu: true });
      }
    });
  }

  const closeMenuIfOutside = e => {
    if (!menu || menu.hidden) return;
    if (!menu.contains(e.target) && !dmBtn?.contains(e.target) && !dmToggleBtn?.contains(e.target)) {
      closeMenu();
    }
  };

  document.addEventListener('click', closeMenuIfOutside);
  document.addEventListener('pointerdown', closeMenuIfOutside);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  if (tsomfBtn) {
    tsomfBtn.addEventListener('click', () => {
      closeMenu();
      if (window.openSomfDM) window.openSomfDM();
    });
  }

  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      closeMenu();
      openNotifications();
    });
  }

    if (charBtn) {
      charBtn.addEventListener('click', () => {
        closeMenu();
        openCharacters();
      });
    }

  if (miniGamesBtn) {
    miniGamesBtn.addEventListener('click', async () => {
      closeMenu();
      try {
        await openMiniGames();
      } catch (err) {
        console.error('Failed to open mini-games', err);
        if (typeof toast === 'function') toast('Failed to open mini-games', 'error');
      }
    });
  }

  miniGamesClose?.addEventListener('click', closeMiniGames);

  miniGamesList?.addEventListener('click', e => {
    const button = e.target.closest('button[data-game-id]');
    if (!button) return;
    selectedMiniGameId = button.dataset.gameId || null;
    updateMiniGamesListSelection();
    shouldFocusMiniGameKnobs = true;
    renderMiniGameDetails();
  });

  miniGamesRefreshPlayers?.addEventListener('click', () => {
    refreshMiniGameCharacters({ preserveSelection: false });
  });

  miniGamesDeployBtn?.addEventListener('click', async () => {
    const deployed = await handleMiniGameDeploy();
    if (deployed) {
      await forceRefreshMiniGameDeployments();
    }
  });

  miniGamesRefreshBtn?.addEventListener('click', () => {
    forceRefreshMiniGameDeployments();
  });

  miniGamesDeployments?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const item = btn.closest('.dm-mini-games__deployment');
    if (!item) return;
    const player = item.dataset.player;
    const deploymentId = item.dataset.deploymentId;
    if (!player || !deploymentId) return;
    if (btn.dataset.action === 'update') {
      const select = item.querySelector('select[data-action="status"]');
      const status = select?.value || 'pending';
      btn.disabled = true;
      try {
        await updateMiniGameDeployment(player, deploymentId, { status });
        if (typeof toast === 'function') toast('Mini-game updated', 'success');
        window.dmNotify?.(`Updated mini-game ${deploymentId} to ${status}`);
      } catch (err) {
        console.error('Failed to update mini-game deployment', err);
        if (typeof toast === 'function') toast('Failed to update mini-game', 'error');
      } finally {
        btn.disabled = false;
        await forceRefreshMiniGameDeployments();
      }
    } else if (btn.dataset.action === 'delete') {
      btn.disabled = true;
      try {
        await deleteMiniGameDeployment(player, deploymentId);
        if (typeof toast === 'function') toast('Mini-game deployment removed', 'info');
        window.dmNotify?.(`Removed mini-game ${deploymentId}`);
      } catch (err) {
        console.error('Failed to remove mini-game deployment', err);
        if (typeof toast === 'function') toast('Failed to remove mini-game', 'error');
      } finally {
        btn.disabled = false;
        await forceRefreshMiniGameDeployments();
      }
    }
  });


  notifyModal?.addEventListener('click', e => { if(e.target===notifyModal) closeNotifications(); });
  notifyClose?.addEventListener('click', closeNotifications);
  charModal?.addEventListener('click', e => { if(e.target===charModal) closeCharacters(); });
  charClose?.addEventListener('click', closeCharacters);
  charViewModal?.addEventListener('click', e => { if(e.target===charViewModal) closeCharacterView(); });
  charViewClose?.addEventListener('click', closeCharacterView);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      closeMenu();
      logout();
    });
  }

  updateButtons();
  if (isLoggedIn()) initTools();

  document.addEventListener('click', e => {
    const t = e.target.closest('button,a');
    if(!t) return;
    const id = t.id || t.textContent?.trim() || 'interaction';
    window.dmNotify?.(`Clicked ${id}`);
  });

  window.dmRequireLogin = requireLogin;
}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initDMLogin);
} else {
  initDMLogin();
}
