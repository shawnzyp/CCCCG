import {
  clueLibrary,
  cipherLibrary,
  lockdownSubsystemLibrary,
  powerSurgeEventLibrary,
  stratagemLibrary,
  techLockpickLibrary,
} from './library.js';

const STORAGE_PREFIX = 'cc:mini-game:deployment:';
const LAST_DEPLOYMENT_KEY = 'cc:mini-game:last-deployment';

const rootDocument = typeof document !== 'undefined' ? document : null;
const shell = document.getElementById('mini-game-shell');
const errorEl = document.getElementById('mini-game-error');
const titleEl = document.getElementById('mini-game-title');
const taglineEl = document.getElementById('mini-game-tagline');
const playerEl = document.getElementById('mini-game-player');
const issuedEl = document.getElementById('mini-game-issued');
const deploymentRowEl = document.getElementById('mini-game-deployment-row');
const deploymentEl = document.getElementById('mini-game-deployment');
const briefEl = document.getElementById('mini-game-brief');
const configEl = document.getElementById('mini-game-config');
const notesEl = document.getElementById('mini-game-notes');
const notesTextEl = document.getElementById('mini-game-notes-text');
const previewBannerEl = document.getElementById('mini-game-preview-banner');
let launchEl = document.getElementById('mini-game-launch');
let launchTextEl = document.getElementById('mini-game-launch-text');
let startButtonEl = document.getElementById('mini-game-start');
const rootEl = document.getElementById('mini-game-root');
const outcomeEl = document.getElementById('mini-game-outcome');
const outcomeHeadingEl = document.getElementById('mini-game-outcome-heading');
const outcomeBodyEl = document.getElementById('mini-game-outcome-body');
const dismissButtonEl = document.getElementById('mini-game-dismiss');
const dismissedEl = document.getElementById('mini-game-dismissed');
const dismissedTextEl = document.getElementById('mini-game-dismissed-text');
const dismissedReopenBtn = document.getElementById('mini-game-dismissed-reopen');

const MINI_GAME_VIEWPORT_VAR = '--mini-game-vh';
const MINI_GAME_TOAST_ID = 'mini-game-toast';
let toastHideTimer = null;
let activeMissionContext = null;

function updateViewportUnit() {
  if (!rootDocument || typeof window === 'undefined') return;
  const innerHeight = window.innerHeight;
  if (typeof innerHeight !== 'number' || !Number.isFinite(innerHeight) || innerHeight <= 0) {
    return;
  }
  const vhUnit = (innerHeight * 0.01).toFixed(4);
  rootDocument.documentElement.style.setProperty(MINI_GAME_VIEWPORT_VAR, `${vhUnit}px`);
}

function setupViewportUnitListener() {
  if (!rootDocument || typeof window === 'undefined') return;
  updateViewportUnit();
  const handler = () => updateViewportUnit();
  window.addEventListener('resize', handler, { passive: true });
  window.addEventListener('orientationchange', handler, { passive: true });
  window.addEventListener('pageshow', event => {
    if (event && event.persisted) {
      updateViewportUnit();
    }
  });
}

setupViewportUnitListener();

function getToastElement() {
  if (!rootDocument) return null;
  return rootDocument.getElementById(MINI_GAME_TOAST_ID);
}

function ensureToastElement() {
  if (!rootDocument || !rootDocument.body) return null;
  let el = getToastElement();
  if (!el) {
    el = rootDocument.createElement('div');
    el.id = MINI_GAME_TOAST_ID;
    el.className = 'mini-game-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.tabIndex = -1;
    el.addEventListener('click', () => hideToastMessage());
    rootDocument.body.appendChild(el);
  }
  return el;
}

function hideToastMessage() {
  const el = getToastElement();
  if (!el) return;
  el.classList.remove('mini-game-toast--visible');
  el.classList.remove('mini-game-toast--success');
  el.classList.remove('mini-game-toast--error');
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
}

function showToastMessage(message, { type = 'info', duration = 4000 } = {}) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return;
  const el = ensureToastElement();
  if (!el) return;
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  const normalizedType = type === 'success'
    ? 'success'
    : type === 'error' || type === 'danger' || type === 'failure'
      ? 'error'
      : 'info';
  const classNames = ['mini-game-toast', 'mini-game-toast--visible'];
  if (normalizedType === 'success') {
    classNames.push('mini-game-toast--success');
  } else if (normalizedType === 'error') {
    classNames.push('mini-game-toast--error');
  }
  const cueIdentifiers = {
    info: 'info',
    success: 'success',
    error: 'error',
  };
  const cueIdentifier = cueIdentifiers[normalizedType] || cueIdentifiers.info;
  el.className = classNames.join(' ');
  activeMissionContext?.playCue?.(`toast-${cueIdentifier}`);
  el.textContent = text;
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* ignore focus errors */
  }
  const timeout = typeof duration === 'number' && duration > 0 ? duration : 0;
  if (timeout > 0) {
    toastHideTimer = setTimeout(() => {
      hideToastMessage();
    }, timeout);
  }
}

const CLOUD_MINI_GAMES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/miniGames';
const DEPLOYMENT_STATUS_VALUES = new Set(['pending', 'active', 'completed', 'cancelled', 'scheduled', 'expired']);

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function hideOutcome() {
  if (!outcomeEl) return;
  outcomeEl.hidden = true;
  if (outcomeEl.dataset) {
    delete outcomeEl.dataset.state;
  }
  if (outcomeHeadingEl) outcomeHeadingEl.textContent = '';
  if (outcomeBodyEl) outcomeBodyEl.textContent = '';
}

function getOutcomeCopy({ success, heading, body } = {}) {
  const headingText = typeof heading === 'string' && heading.trim()
    ? heading.trim()
    : success === true
      ? 'Mission accomplished'
      : success === false
        ? 'Mission concluded'
        : 'Mission update';
  const bodyText = typeof body === 'string' && body.trim()
    ? body.trim()
    : success === true
      ? 'Great work. You can replay the mission or dismiss this console.'
      : success === false
        ? 'The mission failed. Debrief with your DM before trying again.'
        : 'Mission status updated.';
  return { headingText, bodyText };
}

function showOutcome({ success, heading, body } = {}) {
  if (!outcomeEl) return;
  const { headingText, bodyText } = getOutcomeCopy({ success, heading, body });
  if (outcomeHeadingEl) {
    outcomeHeadingEl.textContent = headingText;
  }
  if (outcomeBodyEl) {
    outcomeBodyEl.textContent = bodyText;
  }
  if (success === true) {
    outcomeEl.dataset.state = 'success';
  } else if (success === false) {
    outcomeEl.dataset.state = 'failure';
  } else if (outcomeEl.dataset && 'state' in outcomeEl.dataset) {
    delete outcomeEl.dataset.state;
  }
  outcomeEl.hidden = false;
}

function hideDismissedNotice() {
  if (dismissedEl) {
    dismissedEl.hidden = true;
  }
}

function showDismissedNotice(message) {
  if (!dismissedEl) return;
  if (dismissedTextEl && typeof message === 'string' && message.trim()) {
    dismissedTextEl.textContent = message.trim();
  }
  dismissedEl.hidden = false;
}

function autoDismissMission({ dismissMessage = '', toastMessage = '', toastType = 'info' } = {}) {
  hideOutcome();
  if (launchEl) {
    launchEl.hidden = true;
  }
  if (shell) {
    shell.hidden = true;
  }
  if (typeof dismissMessage === 'string' && dismissMessage.trim()) {
    showDismissedNotice(dismissMessage);
  } else {
    hideDismissedNotice();
  }
  if (dismissedReopenBtn) {
    try { dismissedReopenBtn.focus(); } catch {}
  }
  if (typeof toastMessage === 'string' && toastMessage.trim()) {
    showToastMessage(toastMessage, {
      type: toastType,
      duration: 5000,
    });
  }
}

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitizePlayerName(name = '') {
  return name.trim().replace(/\s+/g, ' ');
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/%2F/g, '/');
}

function encodePath(path) {
  return path
    .split('/')
    .map(encodePathSegment)
    .join('/');
}

function loadPayloadFromStorage(deploymentId) {
  if (!deploymentId) return null;
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${deploymentId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistPayloadToStorage(payload) {
  if (!payload || !payload.id) return;
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(`${STORAGE_PREFIX}${payload.id}`, JSON.stringify(payload));
    storage.setItem(LAST_DEPLOYMENT_KEY, payload.id);
  } catch {
    /* ignore storage errors */
  }
}

async function fetchDeploymentPayload(player, deploymentId) {
  const trimmedPlayer = sanitizePlayerName(player);
  const trimmedDeployment = String(deploymentId ?? '').trim();
  if (!trimmedPlayer || !trimmedDeployment) return null;
  if (typeof fetch !== 'function') return null;
  const url = `${CLOUD_MINI_GAMES_URL}/${encodePath(trimmedPlayer)}/${encodePath(trimmedDeployment)}.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || typeof data !== 'object') return null;
  return data;
}

function sanitizeOutcomeMetadata(outcome = {}) {
  const now = Date.now();
  const cleanString = value => (typeof value === 'string' ? value.trim() : '');
  const normalized = {
    success: typeof outcome.success === 'boolean' ? outcome.success : null,
    heading: cleanString(outcome.heading),
    body: cleanString(outcome.body),
    note: cleanString(outcome.note),
    detail: cleanString(outcome.detail),
    status: DEPLOYMENT_STATUS_VALUES.has(outcome.status) ? outcome.status : undefined,
    recordedAt: typeof outcome.recordedAt === 'number' && Number.isFinite(outcome.recordedAt)
      ? outcome.recordedAt
      : now,
  };
  if (outcome.metrics && typeof outcome.metrics === 'object') {
    normalized.metrics = JSON.parse(JSON.stringify(outcome.metrics));
  }
  if (!normalized.note) {
    normalized.note = normalized.body || normalized.heading || '';
  }
  if (!normalized.detail) {
    normalized.detail = normalized.body || normalized.note || '';
  }
  return normalized;
}

function stripUndefined(obj = {}) {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}

async function patchDeploymentStatus(player, deploymentId, patch = {}) {
  const trimmedPlayer = sanitizePlayerName(player);
  const trimmedDeployment = String(deploymentId ?? '').trim();
  if (!trimmedPlayer || !trimmedDeployment) return false;
  if (typeof fetch !== 'function') return false;
  const payload = stripUndefined({ ...patch, updatedAt: Date.now() });
  const url = `${CLOUD_MINI_GAMES_URL}/${encodePath(trimmedPlayer)}/${encodePath(trimmedDeployment)}.json`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to update deployment status', err);
    return false;
  }
}

function createDeploymentReporter(context = {}) {
  const player = sanitizePlayerName(context.player || '');
  const deploymentId = String(context.deploymentId || '').trim();
  if (!player || !deploymentId) return null;
  let startedAt = null;
  let finalized = false;
  let lastOutcome = null;

  const recordOutcome = (payload = {}) => {
    if (finalized) return;
    lastOutcome = sanitizeOutcomeMetadata(payload);
  };

  const startMission = () => {
    if (finalized) return;
    const now = Date.now();
    startedAt = now;
    patchDeploymentStatus(player, deploymentId, {
      status: 'active',
      startedAt: now,
      lastClientUpdateAt: now,
    }).catch(() => {});
  };

  const resolveFinalOutcome = (result = {}) => {
    const now = Date.now();
    const baseOutcome = lastOutcome ? { ...lastOutcome } : sanitizeOutcomeMetadata(result);
    const resolvedSuccess = typeof baseOutcome.success === 'boolean'
      ? baseOutcome.success
      : typeof result.success === 'boolean'
        ? result.success
        : null;
    baseOutcome.success = resolvedSuccess;
    if (!baseOutcome.heading) {
      baseOutcome.heading = typeof result.heading === 'string' ? result.heading.trim() : '';
    }
    if (!baseOutcome.body) {
      baseOutcome.body = typeof result.body === 'string' ? result.body.trim() : '';
    }
    if (!baseOutcome.note) {
      const fallbackNote = baseOutcome.body || baseOutcome.heading;
      baseOutcome.note = fallbackNote ? fallbackNote.trim() : '';
    }
    if (!baseOutcome.detail) {
      const fallbackDetail = baseOutcome.body || baseOutcome.note;
      baseOutcome.detail = fallbackDetail ? fallbackDetail.trim() : '';
    }
    baseOutcome.completedAt = now;
    if (startedAt && Number.isFinite(startedAt)) {
      baseOutcome.durationMs = Math.max(0, now - startedAt);
    }
    const statusHint = baseOutcome.status && DEPLOYMENT_STATUS_VALUES.has(baseOutcome.status)
      ? baseOutcome.status
      : null;
    const status = statusHint || 'completed';
    const patch = {
      status,
      completedAt: status === 'completed' ? now : undefined,
      cancelledAt: status === 'cancelled' ? now : undefined,
      expiredAt: status === 'expired' ? now : undefined,
      startedAt: startedAt || undefined,
      lastClientUpdateAt: now,
      outcome: baseOutcome,
    };
    patchDeploymentStatus(player, deploymentId, patch).catch(() => {});
  };

  const cancelMission = (reason = '') => {
    if (finalized) return;
    finalized = true;
    const now = Date.now();
    const payload = lastOutcome ? { ...lastOutcome } : {};
    payload.status = 'cancelled';
    payload.success = false;
    payload.note = payload.note || reason || 'Mission dismissed before completion.';
    payload.detail = payload.detail || payload.note;
    payload.heading = payload.heading || 'Mission dismissed';
    payload.recordedAt = now;
    if (startedAt && Number.isFinite(startedAt)) {
      payload.durationMs = Math.max(0, now - startedAt);
    }
    patchDeploymentStatus(player, deploymentId, {
      status: 'cancelled',
      cancelledAt: now,
      startedAt: startedAt || undefined,
      lastClientUpdateAt: now,
      outcome: payload,
    }).catch(() => {});
  };

  const completeMission = (result = {}) => {
    if (finalized) return;
    finalized = true;
    resolveFinalOutcome(result);
  };

  return {
    startMission,
    recordOutcome,
    completeMission,
    cancelMission,
    getMeta() {
      return { player, deploymentId };
    },
  };
}

function formatKnobValue(knob, value) {
  switch (knob.type) {
    case 'toggle':
      return value ? 'Enabled' : 'Disabled';
    case 'select': {
      const opt = knob.options?.find(option => option.value === value);
      return opt ? opt.label : String(value ?? '');
    }
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? value.toString()
        : String(value ?? '');
    default:
      return String(value ?? '');
  }
}

function getDefaultConfig(game) {
  const config = {};
  (game.knobs || []).forEach(knob => {
    if (Object.prototype.hasOwnProperty.call(knob, 'default')) {
      config[knob.key] = knob.default;
    } else if (knob.type === 'toggle') {
      config[knob.key] = false;
    } else if (knob.type === 'number') {
      config[knob.key] = knob.min ?? 0;
    } else {
      config[knob.key] = '';
    }
  });
  return config;
}

function renderConfigSummary(game, config) {
  if (!configEl) return;
  configEl.innerHTML = '';
  const knobs = (game.knobs || []).filter(knob => knob && knob.playerFacing === true);
  if (!knobs.length) {
    const p = document.createElement('p');
    p.className = 'mini-game-shell__configHint';
    p.textContent = 'Your DM already set the mission parameters. Focus on the briefing and tap “Start Mission” when you are ready.';
    configEl.appendChild(p);
    return;
  }
  const heading = document.createElement('h3');
  heading.textContent = 'Mission Parameters';
  configEl.appendChild(heading);
  const dl = document.createElement('dl');
  knobs.forEach(knob => {
    const dt = document.createElement('dt');
    dt.textContent = knob.playerLabel || knob.label;
    const dd = document.createElement('dd');
    const raw = Object.prototype.hasOwnProperty.call(config, knob.key)
      ? config[knob.key]
      : knob.default;
    const displayValue = typeof knob.playerFormat === 'function'
      ? knob.playerFormat(raw, config)
      : formatKnobValue(knob, raw);
    dd.textContent = displayValue;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  configEl.appendChild(dl);
}

function ensureLaunchPanel() {
  if (!shell) {
    launchEl = null;
    startButtonEl = null;
    launchTextEl = null;
    return { launch: null, start: null, text: null };
  }

  if (!launchEl) {
    launchEl = document.createElement('div');
    launchEl.id = 'mini-game-launch';
    launchEl.className = 'mini-game-shell__launch';
  }

  if (!launchTextEl) {
    launchTextEl = document.createElement('p');
    launchTextEl.id = 'mini-game-launch-text';
    launchTextEl.className = 'mini-game-shell__launch-text';
  }

  if (!startButtonEl) {
    startButtonEl = document.createElement('button');
    startButtonEl.id = 'mini-game-start';
    startButtonEl.type = 'button';
    startButtonEl.className = 'mg-button mini-game-shell__launch-button';
    startButtonEl.textContent = 'Start Mission';
  }

  if (!launchTextEl.parentElement || launchTextEl.parentElement !== launchEl) {
    if (launchTextEl.parentElement) {
      launchTextEl.parentElement.removeChild(launchTextEl);
    }
    launchEl.appendChild(launchTextEl);
  }

  if (!startButtonEl.parentElement || startButtonEl.parentElement !== launchEl) {
    if (startButtonEl.parentElement) {
      startButtonEl.parentElement.removeChild(startButtonEl);
    }
    launchEl.appendChild(startButtonEl);
  }

  if (!launchEl.parentElement) {
    const briefingSection = document.querySelector('.mini-game-shell__briefing');
    if (briefingSection && briefingSection.parentElement === shell) {
      briefingSection.insertAdjacentElement('afterend', launchEl);
    } else if (rootEl && rootEl.parentElement === shell) {
      shell.insertBefore(launchEl, rootEl);
    } else {
      shell.appendChild(launchEl);
    }
  }

  launchEl.hidden = true;

  return { launch: launchEl, start: startButtonEl, text: launchTextEl };
}

function readMetaContent(name) {
  try {
    const meta = document.querySelector(`meta[name="${name}"]`);
    const value = meta?.getAttribute('content');
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function readDataAttribute(key) {
  const sources = [document.body, document.documentElement];
  for (const el of sources) {
    const value = el?.dataset?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function readWindowFallback(key) {
  try {
    const value = window?.[key];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function withFallback(initial, fallbacks = []) {
  if (typeof initial === 'string' && initial.trim()) {
    return initial.trim();
  }
  for (const getter of fallbacks) {
    try {
      const value = getter();
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const gameId = withFallback(params.get('game'), [
    () => readDataAttribute('miniGameId'),
    () => readMetaContent('mini-game-id'),
    () => readMetaContent('game-id'),
    () => readWindowFallback('MINI_GAME_ID'),
    () => readWindowFallback('MINI_GAME_LEGACY_ID'),
  ]);
  const deploymentId = withFallback(params.get('deployment'), [
    () => readDataAttribute('miniGameDeployment'),
    () => readMetaContent('mini-game-deployment'),
    () => readWindowFallback('MINI_GAME_DEPLOYMENT'),
  ]);
  const player = withFallback(params.get('player'), [
    () => readDataAttribute('miniGamePlayer'),
    () => readMetaContent('mini-game-player'),
    () => readWindowFallback('MINI_GAME_PLAYER'),
  ]);
  return { gameId, deploymentId, player };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function pickRandom(array) {
  if (!Array.isArray(array) || array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const CLUE_CONNECTION_GROUPS = [
  {
    id: 'quantum-breach',
    label: 'Quantum Breach Circuit',
    hint: 'Phase anomalies, time skips, and quantum breadcrumbs outline the escape corridor.',
    leads: ['Phase Residue', 'Temporal Drift', 'Quantum Breadcrumb', 'Polarity Burn'],
  },
  {
    id: 'vault-infiltration',
    label: 'Vault Infiltration Chain',
    hint: 'Vault hardware damage and counterfeit keys chart the breach pathway.',
    leads: ['Holo-Key Fragment', 'Broken Restraints', 'Locksmith Chip', 'Vault Echo Map', 'Fractured Gauntlet'],
  },
  {
    id: 'forensic-imprint',
    label: 'Forensic Imprint Trail',
    hint: 'Residual heat signatures and alloy scrapes tie to the getaway rig.',
    leads: ['Thermal Residue', 'Arc Reactor Core', 'Resonant Footprint', 'Mag-Rail Scrape'],
  },
  {
    id: 'surveillance-loop',
    label: 'Surveillance Loopback',
    hint: 'Looped camera feeds and drifted holograms reveal tampered oversight.',
    leads: ['City Cam Snapshot', 'Sky Patrol Report', 'Streetlight Archive', 'Hologram Drift'],
  },
  {
    id: 'logistics-diversion',
    label: 'Logistics Diversion Route',
    hint: 'Rerouted freight and dummy crates expose the smuggling pipeline.',
    leads: ['Courier Route', 'Dusting Drone', 'Warehouse Ledger', 'Displaced Crate'],
  },
  {
    id: 'financial-shell',
    label: 'Financial Shell Game',
    hint: 'Phantom ledgers and proxy accounts bankroll the operation.',
    leads: ['Atlas Transit Pass', 'Quantum Ledger', 'Civic Ledger', 'Intercepted Invoice'],
  },
  {
    id: 'system-intrusion',
    label: 'System Intrusion Plot',
    hint: 'Security overrides and rail hacks point to a coordinated systems breach.',
    leads: ['Dispatch Log', 'Encrypted Badge', 'Rail Schedule Hack', 'Jailbreak Packet'],
  },
  {
    id: 'biohazard-trail',
    label: 'Biohazard Extraction Trail',
    hint: 'Toxic samples and pheromone tricks suggest a biochemical objective.',
    leads: ['Accelerant Sample', 'Residue Lace', 'Pheromone Lure', 'Volatile Coolant'],
  },
  {
    id: 'drone-hijack',
    label: 'Drone Hijack Network',
    hint: 'Compromised drones and servos map out a hijacked automation grid.',
    leads: ['Nanite Swarm', 'Microdrone Hull', 'Collapsed Drone Swarm', 'Exposed Servos'],
  },
  {
    id: 'environmental-shift',
    label: 'Environmental Shift Pattern',
    hint: 'Sensor anomalies and flooded locks expose environmental tampering.',
    leads: ['Eco Sensor Alert', 'Aqua Lock Override', 'Civic Sensor Ping', 'Meteoric Dust'],
  },
  {
    id: 'witness-network',
    label: 'Witness Network Chatter',
    hint: 'Field reports and psychic impressions point to a coordinated cell.',
    leads: ['Anonymous Tip', 'Crowdsourced Clip', 'Mind-Link Trace', 'Tactical Memo'],
  },
  {
    id: 'comms-ghost',
    label: 'Ghosted Communications',
    hint: 'Dead drops and ghost signals track the relay that guided the heist.',
    leads: ['Encrypted Page', 'Recovered Sat-Phone', 'Signal Ghost', 'Submerged Drive'],
  },
  {
    id: 'arcane-veil',
    label: 'Arcane Veil Riddle',
    hint: 'Arcane resonances and glyphwork show a mystic masking layer.',
    leads: ['Harmonic Crystal', 'Spectral Echo', 'Runic Seal', 'Glyph-stamped Card'],
  },
  {
    id: 'crowd-diversion',
    label: 'Crowd Diversion Gambit',
    hint: 'Public distractions and rerouted evac paths hide the true objective.',
    leads: ['Arcade Token', 'Evac Route Overlay', 'Vandalised Billboard', 'Emergency Beacon'],
  },
  {
    id: 'aerial-ambush',
    label: 'Aerial Ambush Ensemble',
    hint: 'Airspace sabotage and cloaked gear uncover the skyward assault vector.',
    leads: ['Sky Harpoon', 'Thermal Cloak Tear', 'Shield Fragment', 'Evacuation Badge'],
  },
];

const CLUE_CONNECTION_GROUP_INDEX = new Map(
  CLUE_CONNECTION_GROUPS.map(group => [group.id, group]),
);

const CASE_FOCUS_THREAD_MAP = new Map([
  ['Biohazard Theft', ['biohazard-trail']],
  ['Psychic Coordination', ['witness-network']],
  ['Tunnel Infiltration', ['logistics-diversion']],
  ['Signal Hijack', ['comms-ghost']],
  ['Power Grid Disruption', ['system-intrusion']],
  ['Energy Theft', ['quantum-breach', 'system-intrusion']],
  ['Explosive Diversion', ['crowd-diversion']],
  ['Aquatic Escape', ['environmental-shift']],
  ['Orbital Manipulation', ['aerial-ambush']],
  ['Chronal Sabotage', ['quantum-breach']],
  ['Logistics Hijack', ['logistics-diversion']],
  ['Market Manipulation', ['financial-shell']],
  ['Illusion Warfare', ['arcane-veil']],
  ['Solar Sabotage', ['aerial-ambush', 'quantum-breach']],
  ['Weather Control', ['environmental-shift']],
  ['Chemical Assault', ['biohazard-trail']],
  ['Energy Camouflage', ['aerial-ambush', 'quantum-breach']],
  ['Digital Erasure', ['system-intrusion']],
  ['Mass Hallucination', ['arcane-veil']],
  ['Subliminal Messaging', ['witness-network']],
  ['Gravity Distortion', ['aerial-ambush', 'quantum-breach']],
  ['Polar Diversion', ['environmental-shift']],
  ['Duplicity Network', ['financial-shell']],
  ['Event Cover', ['crowd-diversion']],
  ['Optical Signalling', ['surveillance-loop', 'comms-ghost']],
  ['Spatial Distortion', ['quantum-breach', 'vault-infiltration']],
  ['Hypnotic Transmission', ['witness-network', 'arcane-veil']],
  ['Glamour Diversion', ['crowd-diversion']],
  ['Acoustic Cover', ['comms-ghost']],
  ['Carceral Breach', ['vault-infiltration']],
  ['Financial Obfuscation', ['financial-shell']],
  ['Automation Hijack', ['drone-hijack']],
  ['Beacon Subversion', ['comms-ghost']],
  ['Botanical Trap', ['biohazard-trail', 'environmental-shift']],
  ['Urban Manipulation', ['crowd-diversion']],
  ['Quantum Swap', ['quantum-breach']],
  ['Genomic Theft', ['biohazard-trail']],
  ['Temporal Masking', ['quantum-breach']],
  ['Structural Manipulation', ['logistics-diversion', 'forensic-imprint']],
  ['Vibrational Command', ['arcane-veil']],
  ['Maritime Diversion', ['environmental-shift']],
  ['Festival Cover', ['crowd-diversion']],
  ['Medical Diversion', ['biohazard-trail']],
  ['Phase Assault', ['quantum-breach', 'vault-infiltration']],
  ['Orbital Blind', ['aerial-ambush']],
  ['Media Cutaway', ['crowd-diversion']],
  ['Aquatic Coordination', ['environmental-shift']],
  ['Atmospheric Siege', ['aerial-ambush']],
  ['Civic Camouflage', ['crowd-diversion']],
  ['Astral Diversion', ['arcane-veil']],
  ['Botanical Sabotage', ['biohazard-trail', 'environmental-shift']],
  ['AI Manipulation', ['system-intrusion']],
]);

function secondsToClock(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function setupClueTracker(root, context) {
  const card = document.createElement('section');
  card.className = 'mg-card';
  const intro = document.createElement('div');
  intro.className = 'clue-tracker__summary';
  const progress = document.createElement('span');
  progress.className = 'mg-status';
  progress.textContent = 'Revealed 0 clues';
  const timer = document.createElement('span');
  timer.className = 'clue-tracker__timer';
  intro.appendChild(progress);
  intro.appendChild(timer);
  card.appendChild(intro);

  const objective = document.createElement('p');
  objective.className = 'clue-tracker__objective';
  card.appendChild(objective);

  const caseDeck = Array.isArray(clueLibrary?.cases) ? clueLibrary.cases : [];
  const caseFile = caseDeck.length ? caseDeck[Math.floor(Math.random() * caseDeck.length)] : null;

  if (caseFile) {
    const caseSummary = document.createElement('p');
    caseSummary.className = 'clue-tracker__case';
    caseSummary.innerHTML = `<strong>Case file:</strong> ${caseFile.name} — ${caseFile.summary}`;
    card.appendChild(caseSummary);
  }

  const body = document.createElement('p');
  body.className = 'clue-tracker__instruction';
  body.textContent = 'Reveal clues, prove which ones connect, and quarantine misinformation before it derails the case.';
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'mg-actions';
  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'mg-button';
  revealBtn.textContent = 'Reveal next clue';
  actions.appendChild(revealBtn);
  card.appendChild(actions);

  const outcome = document.createElement('div');
  outcome.className = 'clue-tracker__outcome';
  outcome.hidden = true;
  card.appendChild(outcome);

  const grid = document.createElement('div');
  grid.className = 'clue-grid';

  root.appendChild(card);
  root.appendChild(grid);

  const config = context.config || {};
  const initialReveal = clamp(Number(config.cluesToReveal ?? 3), 1, 8);
  const includeRed = Boolean(config.includeRedHerrings);
  const availableClues = Array.isArray(clueLibrary?.leads) ? clueLibrary.leads : [];
  const requiredConnections = clamp(Number(config.connectionsRequired ?? 3), 1, Math.max(1, availableClues.length));
  const timePerClue = clamp(Number(config.timePerClue ?? 90), 15, 900);

  const leadLookup = new Map(availableClues.map(lead => [lead.title, lead]));
  const focusGroups = caseFile?.focus
    ? (CASE_FOCUS_THREAD_MAP.get(caseFile.focus) || [])
        .map(id => CLUE_CONNECTION_GROUP_INDEX.get(id))
        .filter(Boolean)
    : [];

  let connectionGroup = focusGroups.length ? pickRandom(focusGroups) : pickRandom(CLUE_CONNECTION_GROUPS);
  let connectedLeads = [];
  if (connectionGroup) {
    const resolved = connectionGroup.leads
      .map(title => leadLookup.get(title))
      .filter(Boolean);
    if (resolved.length >= requiredConnections) {
      connectedLeads = shuffle([...resolved]);
    } else {
      connectionGroup = null;
    }
  }

  const connectedLeadTitles = new Set(connectedLeads.map(lead => lead.title));
  const connectionThread = connectionGroup && connectedLeads.length
    ? {
        id: connectionGroup.id,
        label: connectionGroup.label,
        hint: connectionGroup.hint,
        leads: Array.from(connectedLeadTitles),
      }
    : null;

  const fillerCandidates = availableClues.filter(lead => !connectedLeadTitles.has(lead.title));
  let pool = [];
  if (connectedLeads.length) {
    pool = shuffle([...connectedLeads, ...fillerCandidates]);
    const initialWindow = Math.min(initialReveal, pool.length);
    if (initialWindow > 0 && !pool.slice(0, initialWindow).some(lead => connectedLeadTitles.has(lead.title))) {
      const firstConnectedIndex = pool.findIndex(lead => connectedLeadTitles.has(lead.title));
      if (firstConnectedIndex >= 0) {
        const swapIndex = Math.floor(Math.random() * initialWindow);
        [pool[swapIndex], pool[firstConnectedIndex]] = [pool[firstConnectedIndex], pool[swapIndex]];
      }
    }
  } else {
    pool = shuffle([...availableClues]);
  }

  const caseFocus = caseFile?.focus ? ` Case focus: ${caseFile.focus}.` : '';
  const objectiveSegments = [`Objective: Confirm ${requiredConnections} connected lead${requiredConnections === 1 ? '' : 's'} before intel runs dry.${caseFocus}`];
  if (connectionThread) {
    const hintText = connectionThread.hint || connectionThread.label;
    objectiveSegments.push(`Connection intel: ${hintText}`);
  }
  if (includeRed) {
    objectiveSegments.push("Flag planted red herrings so they can't poison the evidence chain.");
  }
  objective.textContent = objectiveSegments.join(' ');

  const threadMessage = connectionThread?.label ? ` Connection thread: ${connectionThread.label}.` : '';
  const successMessage = caseFile
    ? `You triangulated the villain's route for ${caseFile.name}.${threadMessage} Relay the confirmed sequence to HQ.`
    : `You triangulated the villain's route.${threadMessage} Relay the confirmed sequence to HQ.`;
  const exhaustionMessage = caseFile
    ? `All intel exhausted before you could confirm the full sequence for ${caseFile.name}.${threadMessage}`
    : `All intel exhausted before you could confirm the full sequence.${threadMessage}`;

  const redDeck = includeRed ? shuffle([...(clueLibrary?.redHerrings ?? [])]) : [];
  const revealOrder = pool.slice(0, Math.min(initialReveal, pool.length));
  const hiddenDeck = shuffle([...pool.slice(revealOrder.length), ...redDeck]);

  const state = {
    revealed: 0,
    confirmed: 0,
    disproved: 0,
    timer: timePerClue,
    interval: null,
    required: requiredConnections,
    solved: false,
    success: false,
    connectionThread,
  };

  const cards = [];

  function completeCase(success, message) {
    if (state.solved) return;
    state.solved = true;
    state.success = success;
    stopTimer();
    revealBtn.disabled = true;
    revealBtn.textContent = success ? 'Case closed' : 'Investigation failed';
    timer.textContent = success ? 'Case closed' : 'Intel compromised';
    outcome.hidden = false;
    outcome.textContent = message;
    outcome.className = success
      ? 'clue-tracker__outcome clue-tracker__outcome--success'
      : 'clue-tracker__outcome clue-tracker__outcome--failure';
    cards.forEach(entry => {
      entry.data.confirmBtn.disabled = true;
      entry.data.disproveBtn.disabled = true;
    });
    updateProgress();
    if (typeof context?.reportOutcome === 'function') {
      const metrics = {
        revealed: state.revealed,
        confirmed: state.confirmed,
        required: state.required,
        redHerringsFlagged: state.disproved,
      };
      context.reportOutcome({
        success,
        heading: success ? 'Case closed' : 'Intel compromised',
        body: message,
        detail: message,
        note: success ? successMessage : exhaustionMessage,
        metrics,
      });
    }
    if (context?.completeMission) {
      const heading = success ? 'Case closed' : 'Intel compromised';
      context.completeMission({
        success,
        heading,
        body: message,
        dismissMessage: success
          ? 'Mission dismissed. Debrief the findings with HQ.'
          : 'Mission dismissed. Debrief with your DM before attempting a new trace.',
      });
    }
  }

  function updateProgress() {
    const segments = [`Revealed ${state.revealed} clue${state.revealed === 1 ? '' : 's'}`];
    if (state.connectionThread?.label) {
      segments.push(`Thread: ${state.connectionThread.label}`);
    }
    segments.push(`Connections ${Math.min(state.confirmed, state.required)}/${state.required}`);
    if (includeRed) {
      segments.push(`Red herrings flagged ${state.disproved}`);
    }
    if (state.solved) {
      segments.push(state.success ? 'Case closed' : 'Case compromised');
    }
    progress.textContent = segments.join(' · ');
    if (!hiddenDeck.length && !state.solved) {
      revealBtn.disabled = true;
      revealBtn.textContent = 'All clues revealed';
    }
  }

  function updateTimerDisplay() {
    if (state.solved) {
      timer.textContent = state.success ? 'Case closed' : 'Intel compromised';
      return;
    }
    timer.textContent = hiddenDeck.length
      ? `Auto reveal in ${secondsToClock(state.timer)}`
      : 'All intel deployed';
  }

  function resetTimer() {
    if (state.solved) return;
    state.timer = timePerClue;
    updateTimerDisplay();
  }

  function tickTimer() {
    if (state.solved) {
      stopTimer();
      return;
    }
    if (!hiddenDeck.length) {
      timer.textContent = 'All intel deployed';
      return;
    }
    state.timer -= 1;
    updateTimerDisplay();
    if (state.timer <= 0) {
      revealNext();
    }
  }

  function ensureTimer() {
    if (state.solved) return;
    if (state.interval) return;
    state.interval = window.setInterval(tickTimer, 1000);
  }

  function stopTimer() {
    if (state.interval) {
      window.clearInterval(state.interval);
      state.interval = null;
    }
  }

  function renderCard(clue, index, revealed, connected) {
    const el = document.createElement('article');
    el.className = 'clue-card';
    el.dataset.index = `#${index}`;

    const title = document.createElement('h4');
    title.className = 'clue-card__title';
    const bodyText = document.createElement('p');
    bodyText.className = 'clue-card__body';
    const tags = document.createElement('div');
    tags.className = 'clue-card__tags';
    const status = document.createElement('span');
    status.className = 'clue-card__status';
    status.hidden = true;
    const actionsRow = document.createElement('div');
    actionsRow.className = 'mg-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'mg-button mg-button--ghost';
    confirmBtn.textContent = 'Mark connected';
    confirmBtn.setAttribute('aria-pressed', 'false');
    const disproveBtn = document.createElement('button');
    disproveBtn.type = 'button';
    disproveBtn.className = 'mg-button mg-button--ghost';
    disproveBtn.textContent = 'Flag red herring';
    disproveBtn.setAttribute('aria-pressed', 'false');
    actionsRow.appendChild(confirmBtn);
    actionsRow.appendChild(disproveBtn);

    el.appendChild(title);
    el.appendChild(bodyText);
    el.appendChild(tags);
    el.appendChild(status);
    el.appendChild(actionsRow);

    const data = {
      clue,
      element: el,
      revealed: false,
      confirmed: false,
      disproved: false,
      compromised: false,
      index,
      confirmBtn,
      disproveBtn,
      title,
      bodyText,
      tags,
      status,
      connected: Boolean(connected),
    };

    function updateStatus() {
      if (!data.revealed) {
        status.hidden = true;
        status.textContent = '';
        status.className = 'clue-card__status';
        el.classList.remove('clue-card--confirmed', 'clue-card--disproved');
        return;
      }
      if (data.compromised) {
        status.hidden = false;
        status.textContent = 'Red herring locked in';
        status.className = 'clue-card__status clue-card__status--disproved';
        el.classList.add('clue-card--disproved');
        el.classList.remove('clue-card--confirmed');
        return;
      }
      if (data.confirmed) {
        status.hidden = false;
        const connectionLabel = state.connectionThread?.label;
        status.textContent = connectionLabel ? `Confirmed link — ${connectionLabel}` : 'Confirmed link';
        status.className = 'clue-card__status clue-card__status--confirmed';
        el.classList.add('clue-card--confirmed');
        el.classList.remove('clue-card--disproved');
      } else if (data.disproved) {
        status.hidden = false;
        status.textContent = 'Flagged red herring';
        status.className = 'clue-card__status clue-card__status--disproved';
        el.classList.add('clue-card--disproved');
        el.classList.remove('clue-card--confirmed');
      } else {
        status.hidden = true;
        status.textContent = '';
        status.className = 'clue-card__status';
        el.classList.remove('clue-card--confirmed', 'clue-card--disproved');
      }
    }

    function updateButtons() {
      if (data.confirmed) {
        confirmBtn.textContent = 'Undo connection';
        confirmBtn.className = 'mg-button';
        confirmBtn.setAttribute('aria-pressed', 'true');
      } else {
        confirmBtn.textContent = 'Mark connected';
        confirmBtn.className = 'mg-button mg-button--ghost';
        confirmBtn.setAttribute('aria-pressed', 'false');
      }

      if (data.disproved) {
        disproveBtn.textContent = 'Undo flag';
        disproveBtn.className = 'mg-button mg-button--danger';
        disproveBtn.setAttribute('aria-pressed', 'true');
      } else {
        disproveBtn.textContent = 'Flag red herring';
        disproveBtn.className = 'mg-button mg-button--ghost';
        disproveBtn.setAttribute('aria-pressed', 'false');
      }
    }

    function setConfirmed(value) {
      if (state.solved || !data.revealed || value === data.confirmed) return;
      if (value) {
        if (data.clue?.redHerring) {
          data.confirmed = true;
          data.compromised = true;
          state.confirmed += 1;
          updateButtons();
          updateStatus();
          completeCase(false, 'A planted red herring poisoned the intel. Debrief with HQ and reset the trace.');
          return;
        }
        state.confirmed += 1;
        if (data.disproved) {
          data.disproved = false;
          state.disproved = Math.max(0, state.disproved - 1);
        }
        data.confirmed = true;
        data.compromised = false;
      } else {
        data.confirmed = false;
        state.confirmed = Math.max(0, state.confirmed - 1);
        data.compromised = false;
      }
      updateButtons();
      updateStatus();
      updateProgress();
      if (value && state.confirmed >= state.required) {
        completeCase(true, successMessage);
      }
    }

    function setDisproved(value) {
      if (state.solved || !data.revealed || value === data.disproved) return;
      if (value) {
        state.disproved += 1;
        if (data.confirmed) {
          data.confirmed = false;
          state.confirmed = Math.max(0, state.confirmed - 1);
        }
        data.disproved = true;
        data.compromised = false;
      } else {
        data.disproved = false;
        data.compromised = false;
        state.disproved = Math.max(0, state.disproved - 1);
      }
      updateButtons();
      updateStatus();
      updateProgress();
    }

    confirmBtn.addEventListener('click', () => {
      setConfirmed(!data.confirmed);
    });

    disproveBtn.addEventListener('click', () => {
      setDisproved(!data.disproved);
    });

    function applyReveal() {
      data.revealed = true;
      el.classList.add('clue-card--revealed');
      el.classList.remove('clue-card--hidden');
      title.textContent = clue.title;
      bodyText.textContent = clue.detail;
      tags.innerHTML = '';
      const list = Array.isArray(clue.tags) ? clue.tags : [];
      list.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'clue-card__tag';
        pill.textContent = tag;
        tags.appendChild(pill);
      });
      if (clue.redHerring) {
        el.classList.add('clue-card--red');
        const pill = document.createElement('span');
        pill.className = 'clue-card__tag';
        pill.textContent = 'Red Herring';
        tags.appendChild(pill);
      }
      confirmBtn.disabled = false;
      disproveBtn.disabled = false;
      state.revealed += 1;
      updateProgress();
      resetTimer();
      ensureTimer();
      updateButtons();
      updateStatus();
    }

    if (revealed) {
      applyReveal();
    } else {
      el.classList.add('clue-card--hidden');
      bodyText.textContent = 'Encrypted dossier awaiting clearance.';
      confirmBtn.disabled = true;
      disproveBtn.disabled = true;
      updateButtons();
      updateStatus();
    }

    grid.appendChild(el);
    cards.push({ data, reveal: applyReveal });
  }

  revealOrder.forEach((clue, idx) => {
    renderCard(clue, idx + 1, true, connectedLeadTitles.has(clue.title));
  });

  hiddenDeck.forEach((clue, idx) => {
    renderCard(clue, revealOrder.length + idx + 1, false, connectedLeadTitles.has(clue.title));
  });

  function revealNext() {
    if (state.solved) return;
    const hidden = cards.find(entry => !entry.data.revealed);
    if (!hidden) {
      stopTimer();
      if (!state.solved) {
        if (state.confirmed >= state.required) {
          completeCase(true, successMessage);
        } else {
          completeCase(false, exhaustionMessage);
        }
      }
      return;
    }
    hiddenDeck.shift();
    hidden.reveal();
    if (!cards.some(entry => !entry.data.revealed) && !state.solved) {
      stopTimer();
      if (state.confirmed >= state.required) {
        completeCase(true, successMessage);
      } else {
        timer.textContent = 'All intel deployed';
      }
    }
  }

  revealBtn.addEventListener('click', () => {
    revealNext();
  });

  updateProgress();
  resetTimer();
  ensureTimer();
}

function normaliseCipherSet(set) {
  if (Array.isArray(set)) {
    return [...set];
  }
  return Array.from(set);
}

function randomFromSet(set, length) {
  if (Array.isArray(set)) {
    const arr = [];
    for (let i = 0; i < length; i += 1) {
      arr.push(set[Math.floor(Math.random() * set.length)]);
    }
    return arr.join('');
  }
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += set.charAt(Math.floor(Math.random() * set.length));
  }
  return result;
}

function startCipherRotation(displayEl, secret, symbolSet) {
  const timers = [];
  const symbols = normaliseCipherSet(symbolSet);
  if (!symbols.length) {
    return {
      stop() {},
    };
  }
  displayEl.textContent = '';
  displayEl.classList.add('code-breaker__display--active');

  Array.from(secret).forEach(secretChar => {
    const slot = document.createElement('span');
    slot.className = 'code-breaker__slot';
    displayEl.appendChild(slot);
    let pointer = Math.floor(Math.random() * symbols.length);
    slot.textContent = symbols[pointer];
    const interval = setInterval(() => {
      pointer = (pointer + 1) % symbols.length;
      const symbol = symbols[pointer];
      slot.textContent = symbol;
      if (symbol === secretChar) {
        slot.classList.add('code-breaker__slot--hint');
      } else {
        slot.classList.remove('code-breaker__slot--hint');
      }
    }, 140 + Math.floor(Math.random() * 80));
    timers.push(interval);
  });

  return {
    stop() {
      timers.forEach(id => clearInterval(id));
      displayEl.classList.remove('code-breaker__display--active');
    },
  };
}

function setupCodeBreaker(root, context) {
  const card = document.createElement('section');
  card.className = 'mg-card code-breaker';
  const intro = document.createElement('p');
  intro.textContent = 'Crack the rotating cipher before the console locks. Watch for highlighted glyphs—each flash reveals a true symbol while console feedback narrows their order.';
  card.appendChild(intro);

  const display = document.createElement('div');
  display.className = 'code-breaker__display';
  display.textContent = '????';
  card.appendChild(display);

  const cipherMeta = document.createElement('div');
  cipherMeta.className = 'mg-status code-breaker__meta';
  card.appendChild(cipherMeta);

  const inputRow = document.createElement('div');
  inputRow.className = 'code-breaker__input';
  const input = document.createElement('input');
  input.autocomplete = 'off';
  input.spellcheck = false;
  inputRow.appendChild(input);
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'mg-button';
  submit.textContent = 'Submit code';
  inputRow.appendChild(submit);
  card.appendChild(inputRow);

  const attemptsLabel = document.createElement('div');
  attemptsLabel.className = 'code-breaker__attempts';
  card.appendChild(attemptsLabel);

  const log = document.createElement('div');
  log.className = 'mg-card';
  const logTitle = document.createElement('h3');
  logTitle.textContent = 'Console Feedback';
  log.appendChild(logTitle);
  const logList = document.createElement('ul');
  logList.style.listStyle = 'none';
  logList.style.margin = '0';
  logList.style.padding = '0';
  log.appendChild(logList);

  root.appendChild(card);
  root.appendChild(log);

  const config = context.config || {};
  const cipherPool = Array.isArray(cipherLibrary) && cipherLibrary.length
    ? cipherLibrary
    : [{
      id: 'fallback',
      name: 'Fallback Cipher',
      symbols: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      hint: 'Standard cipher engaged. Watch for repeated letters.',
      defaultLength: 5,
      defaultAttempts: 6,
    }];
  const cipherMap = new Map(cipherPool.map(entry => [entry.id, entry]));
  let selectedCipher = null;
  if (typeof config.cipherSet === 'string' && cipherMap.has(config.cipherSet)) {
    selectedCipher = cipherMap.get(config.cipherSet);
  } else {
    selectedCipher = cipherPool[Math.floor(Math.random() * cipherPool.length)] || cipherPool[0];
  }
  const length = clamp(Number(config.codeLength ?? selectedCipher?.defaultLength ?? 5), 3, 10);
  const attempts = clamp(Number(config.attemptLimit ?? selectedCipher?.defaultAttempts ?? 6), 1, 12);
  const cipherSet = selectedCipher?.symbols ?? 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const secret = randomFromSet(cipherSet, length);
  const rotation = startCipherRotation(display, secret, cipherSet);
  if (cipherMeta) {
    cipherMeta.textContent = selectedCipher?.name
      ? `Active cipher: ${selectedCipher.name}`
      : 'Active cipher: Unknown protocol';
  }
  let remaining = attempts;
  let solved = false;

  attemptsLabel.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining`;

  function appendLog(entry) {
    const item = document.createElement('li');
    item.textContent = entry;
    item.style.padding = '6px 0';
    item.style.borderBottom = '1px solid rgba(148, 163, 184, 0.25)';
    logList.prepend(item);
  }

  if (selectedCipher?.hint) {
    appendLog(`Console hint: ${selectedCipher.hint}`);
  }

  function evaluateGuess(value) {
    let correct = 0;
    let inSequence = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === secret[i]) {
        correct += 1;
      } else if (secret.includes(value[i])) {
        inSequence += 1;
      }
    }
    return { correct, inSequence };
  }

  function complete(success, detail) {
    solved = true;
    submit.disabled = true;
    input.disabled = true;
    rotation.stop();
    if (success) {
      display.textContent = secret;
      attemptsLabel.textContent = 'Access granted. Vault unlocked!';
    } else {
      display.textContent = secret;
      attemptsLabel.textContent = 'Console sealed. Attempt logged with HQ.';
    }
    if (typeof context?.reportOutcome === 'function') {
      const attemptsUsed = attempts - remaining;
      context.reportOutcome({
        success,
        heading: success ? 'Access granted' : 'Console sealed',
        body: detail
          || (success
            ? 'Override accepted. Sequence matched.'
            : 'System lock engaged. The console logged the failed attempts.'),
        note: detail,
        detail: detail,
        metrics: {
          attemptsAllowed: attempts,
          attemptsUsed: attemptsUsed >= 0 ? attemptsUsed : attempts,
        },
      });
    }
    if (context?.completeMission) {
      const heading = success ? 'Access granted' : 'Console sealed';
      const body = detail
        || (success
          ? 'Override accepted. Sequence matched.'
          : 'System lock engaged. The console logged the failed attempts.');
      context.completeMission({
        success,
        heading,
        body,
        dismissMessage: success
          ? 'Mission dismissed. Inform your DM that the vault is open.'
          : 'Mission dismissed. Coordinate a new approach with your DM.',
      });
    }
  }

  function handleSubmit() {
    if (solved) return;
    const guess = input.value.trim();
    if (!guess) return;
    const normalized = guess.toUpperCase();
    if (normalized.length !== length) {
      appendLog(`Code must contain ${length} symbols. Received ${normalized.length}.`);
      return;
    }
    const result = evaluateGuess(normalized);
    remaining -= 1;
    if (result.correct === length) {
      const detail = 'Override accepted. Sequence matched.';
      appendLog(detail);
      complete(true, detail);
    } else {
      appendLog(`Exact matches: ${result.correct}, misaligned glyphs: ${result.inSequence}.`);
      attemptsLabel.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining`;
      if (remaining <= 0) {
        const detail = 'System lock engaged.';
        appendLog(detail);
        complete(false, detail);
      }
    }
    input.value = '';
    input.focus();
  }

  submit.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  });
  input.setAttribute('maxlength', String(length));
  input.focus();
}

function setupLockdownOverride(root, context) {
  const config = context.config || {};
  const securityLevel = config.securityLevel || 'amber';
  const hazardSuppression = Boolean(config.hazardSuppression);
  const timerSeconds = clamp(Number(config.overrideTimer ?? 300), 30, 900);

  const card = document.createElement('section');
  card.className = 'mg-card';
  const intro = document.createElement('p');
  intro.textContent = 'Balance the base subsystems before the base seals and lethal countermeasures trigger. Stabilise each system while the evacuation clock counts down.';
  card.appendChild(intro);

  const timerLabel = document.createElement('div');
  timerLabel.className = 'lockdown__timer';
  card.appendChild(timerLabel);

  const grid = document.createElement('div');
  grid.className = 'lockdown-grid';
  card.appendChild(grid);

  const statusLabel = document.createElement('div');
  statusLabel.className = 'mg-status';
  statusLabel.textContent = 'Status: Operational';
  card.appendChild(statusLabel);

  const actions = document.createElement('div');
  actions.className = 'mg-actions';
  const boostAll = document.createElement('button');
  boostAll.type = 'button';
  boostAll.className = 'mg-button';
  boostAll.textContent = 'Cycle power burst';
  actions.appendChild(boostAll);
  card.appendChild(actions);

  root.appendChild(card);

  const difficulty = {
    green: 2,
    amber: 4,
    crimson: 6,
  }[securityLevel] || 4;
  const hazardPenalty = hazardSuppression ? 0.5 : 1;

  const subsystemSource = Array.isArray(lockdownSubsystemLibrary) && lockdownSubsystemLibrary.length
    ? shuffle([...lockdownSubsystemLibrary])
    : shuffle([
      { id: 'reactor', label: 'Reactor Stabiliser', description: 'Keeps the antimatter core from slipping out of sync.', actionLabel: 'Pulse coolant', baseline: 60, volatility: 1.1, recovery: 18, boost: 14 },
      { id: 'security', label: 'Security Countermeasures', description: 'Balances drones, turrets, and shield nodes.', actionLabel: 'Recalibrate turrets', baseline: 55, volatility: 1, recovery: 18, boost: 12 },
      { id: 'evac', label: 'Civilian Evacuation', description: 'Guides evac pods toward the safe zone.', actionLabel: 'Redirect evac pods', baseline: 58, volatility: 0.95, recovery: 17, boost: 12 },
    ]);
  const subsystemCount = clamp(Number(config.subsystemCount ?? 3), 2, Math.min(6, subsystemSource.length));
  const chosenSubsystems = subsystemSource.slice(0, subsystemCount);

  const subsystems = chosenSubsystems.map((sub, index) => {
    const container = document.createElement('div');
    container.className = 'progress-track';
    const heading = document.createElement('h4');
    heading.textContent = sub.label;
    container.appendChild(heading);
    if (sub.description) {
      const detail = document.createElement('p');
      detail.className = 'progress-track__detail';
      detail.textContent = sub.description;
      container.appendChild(detail);
    }
    const status = document.createElement('div');
    status.className = 'progress-track__status';
    status.textContent = 'Stable';
    const bar = document.createElement('div');
    bar.className = 'progress-track__bar';
    const fill = document.createElement('span');
    bar.appendChild(fill);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mg-button mg-button--ghost';
    button.textContent = 'Stabilise';

    container.appendChild(status);
    container.appendChild(bar);
    container.appendChild(button);
    grid.appendChild(container);

    const initial = typeof sub.baseline === 'number' ? sub.baseline : 55 + index * 5;
    const data = {
      id: sub.id,
      label: sub.label,
      value: clamp(initial, 0, 100),
      statusEl: status,
      fillEl: fill,
      button,
      volatility: typeof sub.volatility === 'number' ? sub.volatility : 1,
      recovery: typeof sub.recovery === 'number' ? sub.recovery : 18,
      boost: typeof sub.boost === 'number' ? sub.boost : 12,
    };

    button.addEventListener('click', () => {
      if (state.completed) return;
      data.value = clamp(data.value + data.recovery, 0, 100);
      updateSubsystem(data);
    });

    return data;
  });

  const state = {
    timer: timerSeconds,
    interval: null,
    completed: false,
  };

  function updateSubsystem(sub) {
    const percentage = clamp(sub.value, 0, 100);
    sub.fillEl.style.width = `${percentage}%`;
    if (percentage >= 80) {
      sub.statusEl.textContent = 'Optimal';
    } else if (percentage >= 60) {
      sub.statusEl.textContent = 'Stable';
    } else if (percentage >= 30) {
      sub.statusEl.textContent = 'Strained';
    } else {
      sub.statusEl.textContent = 'Critical';
    }
  }

  function degradeSystems() {
    subsystems.forEach(sub => {
      const volatility = typeof sub.volatility === 'number' ? sub.volatility : 1;
      const drop = (Math.random() * difficulty + 1.5) * hazardPenalty * volatility;
      sub.value = clamp(sub.value - drop, 0, 100);
      if (!state.completed) updateSubsystem(sub);
    });
  }

  function allOptimal() {
    return subsystems.every(sub => sub.value >= 75);
  }

  function anyFailed() {
    return subsystems.some(sub => sub.value <= 0);
  }

  function tick() {
    state.timer -= 1;
    timerLabel.textContent = `Lockdown override in ${secondsToClock(state.timer)}`;
    if (state.timer % 3 === 0) {
      degradeSystems();
    }
    if (anyFailed()) {
      complete(false, 'Subsystem failure triggered the lockdown.');
      return;
    }
    if (state.timer <= 0) {
      const success = allOptimal();
      const detail = success
        ? 'Stabilisation held through the countdown.'
        : 'Override timer expired with unstable subsystems.';
      complete(success, detail);
    }
  }

  function complete(success, detail) {
    if (state.completed) return;
    state.completed = true;
    window.clearInterval(state.interval);
    boostAll.disabled = true;
    subsystems.forEach(sub => {
      sub.button.disabled = true;
    });
    if (success) {
      statusLabel.textContent = 'Status: Base Stabilised';
      statusLabel.style.background = 'rgba(34,197,94,0.25)';
    } else {
      statusLabel.textContent = 'Status: Lockdown Engaged';
      statusLabel.style.background = 'rgba(248,113,113,0.25)';
    }
    if (typeof context?.reportOutcome === 'function') {
      const metrics = subsystems.reduce((acc, sub) => {
        acc[sub.name] = Math.round(clamp(sub.value, 0, 100));
        return acc;
      }, {});
      context.reportOutcome({
        success,
        heading: success ? 'Base stabilised' : 'Lockdown engaged',
        body: detail
          || (success
            ? 'Stabilisation held through the countdown.'
            : 'Subsystem instability triggered the lockdown.'),
        note: detail,
        detail: detail,
        metrics,
      });
    }
    if (context?.completeMission) {
      context.completeMission({
        success,
        heading: success ? 'Base stabilised' : 'Lockdown engaged',
        body: detail
          || (success
            ? 'Stabilisation held through the countdown.'
            : 'Subsystem instability triggered the lockdown.'),
        dismissMessage: success
          ? 'Mission dismissed. Alert your DM that defences are offline.'
          : 'Mission dismissed. Debrief the failed override with your DM.',
      });
    }
  }

  boostAll.addEventListener('click', () => {
    subsystems.forEach(sub => {
      sub.value = clamp(sub.value + sub.boost, 0, 100);
      updateSubsystem(sub);
    });
  });

  subsystems.forEach(updateSubsystem);
  timerLabel.textContent = `Lockdown override in ${secondsToClock(state.timer)}`;
  state.interval = window.setInterval(tick, 1000);
}

function setupPowerSurge(root, context) {
  const config = context.config || {};
  const target = clamp(Number(config.energyTarget ?? 80), 10, 100);
  const surgeWaves = clamp(Number(config.surgeWaves ?? 3), 1, 8);
  const stabilityChecks = config.stabilityChecks || 'skill';

  const card = document.createElement('section');
  card.className = 'mg-card power-surge';
  const intro = document.createElement('p');
  intro.textContent = 'Keep the generator output within the safe band until the surge passes. Boost or vent energy to respond to fluctuations.';
  card.appendChild(intro);

  const gauge = document.createElement('div');
  gauge.className = 'power-surge__gauge';
  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'power-surge__gauge-fill';
  gauge.appendChild(gaugeFill);
  const targetLine = document.createElement('div');
  targetLine.className = 'power-surge__target';
  const tolerance = 12;
  const topLabel = document.createElement('span');
  topLabel.textContent = `${target + tolerance}%`;
  const bottomLabel = document.createElement('span');
  bottomLabel.textContent = `${target - tolerance}%`;
  targetLine.style.bottom = `${target - tolerance}%`;
  gauge.appendChild(targetLine);
  targetLine.appendChild(bottomLabel);
  targetLine.appendChild(topLabel);
  card.appendChild(gauge);

  const waveLabel = document.createElement('div');
  waveLabel.className = 'power-surge__waves';
  const waves = [];
  for (let i = 0; i < surgeWaves; i += 1) {
    const wave = document.createElement('span');
    wave.className = 'power-surge__wave';
    wave.textContent = `Wave ${i + 1}`;
    waveLabel.appendChild(wave);
    waves.push(wave);
  }
  card.appendChild(waveLabel);

  const actions = document.createElement('div');
  actions.className = 'mg-actions';
  const ventBtn = document.createElement('button');
  ventBtn.type = 'button';
  ventBtn.className = 'mg-button mg-button--ghost';
  ventBtn.textContent = 'Vent energy';
  const boostBtn = document.createElement('button');
  boostBtn.type = 'button';
  boostBtn.className = 'mg-button';
  boostBtn.textContent = 'Boost output';
  actions.appendChild(ventBtn);
  actions.appendChild(boostBtn);
  card.appendChild(actions);

  const ticker = document.createElement('div');
  ticker.className = 'mg-status power-surge__ticker';
  ticker.textContent = 'Awaiting surge telemetry…';
  card.appendChild(ticker);

  const eventPanel = document.createElement('div');
  eventPanel.className = 'mg-card power-surge__log';
  const eventTitle = document.createElement('h3');
  eventTitle.textContent = 'Surge Telemetry';
  eventPanel.appendChild(eventTitle);
  const eventList = document.createElement('ul');
  eventList.style.listStyle = 'none';
  eventList.style.margin = '0';
  eventList.style.padding = '0';
  eventPanel.appendChild(eventList);
  card.appendChild(eventPanel);

  const status = document.createElement('div');
  status.className = 'mg-status';
  status.textContent = 'Stability Window: Hold for 8 seconds';
  card.appendChild(status);

  root.appendChild(card);

  let energy = clamp(target + (Math.random() * 20 - 10), 10, 100);
  let interval = null;
  let completedWaves = 0;
  let stableSeconds = 0;
  let concluded = false;
  const eventLibrary = Array.isArray(powerSurgeEventLibrary) && powerSurgeEventLibrary.length
    ? powerSurgeEventLibrary
    : [
      {
        id: 'baseline',
        title: 'Baseline Drift',
        ticker: 'Minor fluctuations detected.',
        description: 'Telemetry nominal with slight noise.',
        volatility: 1,
        bias: 0,
        duration: 3,
        ventModifier: 1,
        boostModifier: 1,
      },
    ];
  let eventDeck = shuffle([...eventLibrary]);
  let currentEvent = null;
  let eventTimer = 0;
  let ventEffect = 1;
  let boostEffect = 1;

  function updateGauge() {
    gaugeFill.style.height = `${clamp(energy, 0, 100)}%`;
  }

  function logEvent(event) {
    if (!eventList) return;
    const item = document.createElement('li');
    item.textContent = `${event.title}: ${event.description}`;
    item.style.padding = '6px 0';
    item.style.borderBottom = '1px solid rgba(148, 163, 184, 0.25)';
    eventList.prepend(item);
    while (eventList.children.length > 6) {
      eventList.removeChild(eventList.lastChild);
    }
  }

  function nextEvent() {
    if (!eventDeck.length) {
      eventDeck = shuffle([...eventLibrary]);
    }
    currentEvent = eventDeck.shift() || null;
    eventTimer = currentEvent ? Math.max(1, Number(currentEvent.duration) || 2) : 2;
    ventEffect = currentEvent?.ventModifier ?? 1;
    boostEffect = currentEvent?.boostModifier ?? 1;
    if (ticker) {
      ticker.textContent = currentEvent?.ticker || 'Telemetry stable.';
    }
    if (currentEvent) {
      logEvent(currentEvent);
    }
  }

  function complete(success, detail) {
    concluded = true;
    window.clearInterval(interval);
    ventBtn.disabled = true;
    boostBtn.disabled = true;
    status.textContent = success ? 'Generator stabilised!' : 'Containment failure!';
    status.style.background = success
      ? 'rgba(34,197,94,0.2)'
      : 'rgba(248,113,113,0.2)';
    if (ticker) {
      ticker.textContent = success ? 'Surge telemetry nominal.' : 'Telemetry lost. Core spiking!';
    }
    if (typeof context?.reportOutcome === 'function') {
      context.reportOutcome({
        success,
        heading: success ? 'Generator stabilised' : 'Containment failure',
        body: detail
          || (success
            ? 'Generator output held within the safe band through every surge wave.'
            : 'Energy output spiked beyond tolerance. Containment failed.'),
        note: detail,
        detail: detail,
        metrics: {
          target: target,
          tolerance,
          completedWaves,
          totalWaves: surgeWaves,
          stableSeconds,
          energy: Math.round(energy),
        },
      });
    }
    if (context?.completeMission) {
      context.completeMission({
        success,
        heading: success ? 'Generator stabilised' : 'Containment failure',
        body: detail
          || (success
            ? 'Generator output held within the safe band through every surge wave.'
            : 'Energy output spiked beyond tolerance. Containment failed.'),
        dismissMessage: success
          ? 'Mission dismissed. Report the stabilisation to HQ.'
          : 'Mission dismissed. Debrief the failure with your DM before retrying.',
      });
    }
  }

  function tick() {
    if (!currentEvent || eventTimer <= 0) {
      nextEvent();
    }
    eventTimer -= 1;
    const turbulence = {
      skill: () => (Math.random() * 8 - 4),
      power: () => (Math.random() * 10 - 5),
      mixed: () => (Math.random() * 12 - 6),
    }[stabilityChecks] || (() => (Math.random() * 8 - 4));
    const modifier = currentEvent?.volatility ?? 1;
    const bias = currentEvent?.bias ?? 0;
    energy = clamp(energy + turbulence() * modifier + bias, 0, 110);
    if (energy >= target - tolerance && energy <= target + tolerance) {
      stableSeconds += 1;
      status.textContent = `Hold steady… ${8 - stableSeconds} second${8 - stableSeconds === 1 ? '' : 's'} remaining`;
      if (stableSeconds >= 8) {
        waves[completedWaves].classList.add('power-surge__wave--complete');
        completedWaves += 1;
        stableSeconds = 0;
        if (completedWaves >= surgeWaves) {
          complete(true, 'Generator output held within the safe band through every surge wave.');
          return;
        }
        status.textContent = `Wave ${completedWaves + 1} incoming.`;
      }
    } else {
      if (!concluded) {
        status.textContent = 'Stability lost. Realign!';
      }
      stableSeconds = 0;
    }
    updateGauge();
  }

  ventBtn.addEventListener('click', () => {
    energy = clamp(energy - 12 * ventEffect, 0, 110);
    updateGauge();
  });

  boostBtn.addEventListener('click', () => {
    energy = clamp(energy + 12 * boostEffect, 0, 110);
    updateGauge();
  });

  updateGauge();
  nextEvent();
  interval = window.setInterval(tick, 1000);
}

function setupStratagemHero(root, context) {
  const config = context.config || {};
  const callsRequired = clamp(Number(config.callsRequired ?? 5), 1, 12);
  const selectedDifficulty = config.callDifficulty || 'training';
  const signalTolerance = clamp(Number(config.signalTolerance ?? 3), 0, 6);

  const difficultyRank = {
    training: 0,
    frontline: 1,
    doomsday: 2,
  };

  const targetRank = difficultyRank[selectedDifficulty] ?? 0;
  const fallbackStratagems = [
    { id: 'fallback-alpha', name: 'Fallback Drop', callSign: 'Guardian Pack', summary: 'Standard supply drop to keep the line fortified.', difficulty: 0, sequence: ['up', 'down', 'left', 'right'] },
    { id: 'fallback-beta', name: 'Fallback Strike', callSign: 'Beacon Hammer', summary: 'Targeted barrage to clear immediate hostiles.', difficulty: 1, sequence: ['right', 'up', 'left', 'down', 'right'] },
    { id: 'fallback-gamma', name: 'Fallback Shield', callSign: 'Aegis Core', summary: 'Emergency shield lattice to buy recovery time.', difficulty: 1, sequence: ['left', 'left', 'up', 'down', 'right'] },
  ];
  const stratagemSource = Array.isArray(stratagemLibrary) && stratagemLibrary.length
    ? stratagemLibrary
    : fallbackStratagems;
  const availableStratagems = stratagemSource.filter(item => item.difficulty <= targetRank);

  const glyphs = {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
  };

  const card = document.createElement('section');
  card.className = 'mg-card stratagem-hero';

  const intro = document.createElement('p');
  intro.textContent = 'Synchronise with HQ and input the tactical stratagem codes. Hold the combo together to deliver reinforcements exactly where the team needs them. Use arrow keys/WASD or tap the console pad to respond.';
  card.appendChild(intro);

  const telemetry = document.createElement('div');
  telemetry.className = 'stratagem-telemetry';
  const callsLabel = document.createElement('div');
  callsLabel.className = 'stratagem-telemetry__item';
  const strikesLabel = document.createElement('div');
  strikesLabel.className = 'stratagem-telemetry__item';
  telemetry.appendChild(callsLabel);
  telemetry.appendChild(strikesLabel);
  card.appendChild(telemetry);

  const consoleWrap = document.createElement('div');
  consoleWrap.className = 'stratagem-console';

  const callHeader = document.createElement('div');
  callHeader.className = 'stratagem-console__heading';
  const callName = document.createElement('h3');
  callName.className = 'stratagem-console__title';
  const callSign = document.createElement('p');
  callSign.className = 'stratagem-console__call-sign';
  const callSummary = document.createElement('p');
  callSummary.className = 'stratagem-console__summary';
  callHeader.appendChild(callName);
  callHeader.appendChild(callSign);
  callHeader.appendChild(callSummary);

  const sequence = document.createElement('div');
  sequence.className = 'stratagem-sequence';

  const pad = document.createElement('div');
  pad.className = 'stratagem-pad';
  const padDirections = [
    { dir: 'up', label: '↑', classes: ['stratagem-pad__button', 'stratagem-pad__button--up'] },
    { dir: 'left', label: '←', classes: ['stratagem-pad__button', 'stratagem-pad__button--left'] },
    { dir: 'down', label: '↓', classes: ['stratagem-pad__button', 'stratagem-pad__button--down'] },
    { dir: 'right', label: '→', classes: ['stratagem-pad__button', 'stratagem-pad__button--right'] },
  ];
  padDirections.forEach(({ dir, label, classes }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.direction = dir;
    btn.textContent = label;
    btn.setAttribute('aria-label', `${dir} input`);
    btn.className = classes.join(' ');
    pad.appendChild(btn);
  });

  const report = document.createElement('div');
  report.className = 'mg-status stratagem-report';
  report.textContent = 'Awaiting first stratagem…';

  consoleWrap.appendChild(callHeader);
  consoleWrap.appendChild(sequence);
  consoleWrap.appendChild(pad);
  card.appendChild(consoleWrap);
  card.appendChild(report);

  root.appendChild(card);

  let completedCalls = 0;
  let strikesRemaining = signalTolerance;
  let activeStratagem = null;
  let progressIndex = 0;
  let missionComplete = false;

  const deckSource = availableStratagems.length ? availableStratagems : stratagemSource;
  let deck = shuffle([...deckSource]);

  function updateTelemetry() {
    const safeStrikes = Math.max(0, strikesRemaining);
    callsLabel.innerHTML = `<strong>${completedCalls}/${callsRequired}</strong> Stratagems linked`;
    strikesLabel.innerHTML = `Signal tolerance: <strong>${safeStrikes}</strong>`;
  }

  function highlightSequence() {
    const steps = sequence.querySelectorAll('.stratagem-sequence__step');
    steps.forEach((step, idx) => {
      step.classList.toggle('is-entered', idx < progressIndex);
      step.classList.toggle('is-active', idx === progressIndex);
    });
  }

  function endMission(message, background, successValue = false) {
    if (missionComplete) return;
    missionComplete = true;
    report.textContent = message;
    if (background) {
      report.style.background = background;
    }
    pad.querySelectorAll('button').forEach(btn => {
      btn.disabled = true;
    });
    if (typeof context?.reportOutcome === 'function') {
      context.reportOutcome({
        success: Boolean(successValue),
        heading: successValue ? 'Transmission complete' : 'Signal collapsed',
        body: message,
        note: message,
        detail: message,
        metrics: {
          callsRequired,
          completedCalls,
          strikesRemaining,
        },
      });
    }
    cleanup();
  }

  function loadNextStratagem() {
    if (missionComplete) return;
    if (completedCalls >= callsRequired) {
      endMission('Transmission complete. Reinforcements inbound!', 'rgba(34,197,94,0.2)', true);
      return;
    }

    if (!deck.length) {
      deck = shuffle([...deckSource]);
    }

    activeStratagem = deck.shift();
    progressIndex = 0;

    callName.textContent = activeStratagem.name;
    callSign.textContent = `Call sign: ${activeStratagem.callSign}`;
    callSummary.textContent = activeStratagem.summary;

    sequence.innerHTML = '';
    activeStratagem.sequence.forEach(dir => {
      const step = document.createElement('span');
      step.className = 'stratagem-sequence__step';
      step.dataset.direction = dir;
      step.textContent = glyphs[dir];
      sequence.appendChild(step);
    });

    highlightSequence();
    report.textContent = 'Input the stratagem code!';
    report.style.background = 'rgba(56,189,248,0.18)';
  }

  function resetActiveSequence() {
    progressIndex = 0;
    highlightSequence();
  }

  function registerFailure() {
    if (missionComplete) return;
    strikesRemaining -= 1;
    updateTelemetry();
    if (strikesRemaining < 0) {
      endMission('Signal collapsed. HQ cannot verify your stratagem codes.', 'rgba(248,113,113,0.2)', false);
      sequence.querySelectorAll('.stratagem-sequence__step').forEach(step => {
        step.classList.remove('is-active');
      });
      return;
    }
    report.textContent = 'Code corrupted! Re-input from the top.';
    report.style.background = 'rgba(248,113,113,0.2)';
    resetActiveSequence();
  }

  function handleDirection(direction) {
    if (missionComplete || !activeStratagem) return;
    const expected = activeStratagem.sequence[progressIndex];
    if (direction === expected) {
      progressIndex += 1;
      highlightSequence();
      if (progressIndex >= activeStratagem.sequence.length) {
        completedCalls += 1;
        report.textContent = `${activeStratagem.name} confirmed. Package inbound.`;
        report.style.background = 'rgba(34,197,94,0.2)';
        activeStratagem = null;
        updateTelemetry();
        window.setTimeout(loadNextStratagem, 700);
      }
    } else {
      sequence.classList.add('stratagem-sequence--shake');
      window.setTimeout(() => sequence.classList.remove('stratagem-sequence--shake'), 300);
      registerFailure();
    }
  }

  function handleKeyDown(event) {
    const keyMap = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      a: 'left',
      s: 'down',
      d: 'right',
      W: 'up',
      A: 'left',
      S: 'down',
      D: 'right',
    };
    const direction = keyMap[event.key];
    if (!direction) return;
    event.preventDefault();
    handleDirection(direction);
  }

  pad.addEventListener('click', event => {
    const target = event.target.closest('button[data-direction]');
    if (!target) return;
    handleDirection(target.dataset.direction);
  });

  document.addEventListener('keydown', handleKeyDown);

  function cleanup() {
    document.removeEventListener('keydown', handleKeyDown);
  }

  if (context.onCleanup) {
    context.onCleanup(cleanup);
  }

  updateTelemetry();
  loadNextStratagem();
}

function setupTechLockpick(root, context) {
  const config = context.config || {};
  const complexity = config.lockComplexity || 'standard';
  const failuresAllowed = clamp(Number(config.failuresAllowed ?? 2), 0, 6);
  const supportDrones = Boolean(config.supportDrones);

  const ATTEMPT_FLOOR = 3;
  const attemptsTotal = Math.max(ATTEMPT_FLOOR, failuresAllowed + 2);

  const defaultConfig = techLockpickLibrary.standard || { length: 5, options: 8, words: [] };
  const bankConfig = techLockpickLibrary[complexity] || defaultConfig;
  const targetLength = Number(bankConfig.length) || defaultConfig.length || 5;
  const optionsCount = Number(bankConfig.options) || defaultConfig.options || 8;
  const bank = Array.isArray(bankConfig.words) && bankConfig.words.length
    ? bankConfig.words
    : Array.isArray(defaultConfig.words)
      ? defaultConfig.words
      : [];

  function pickWords(pool, length, count) {
    const candidates = pool.filter(word => word.length === length);
    const words = [];
    const seen = new Set();
    const mutable = [...candidates];
    while (words.length < count && mutable.length) {
      const index = Math.floor(Math.random() * mutable.length);
      const choice = mutable.splice(index, 1)[0];
      if (!seen.has(choice)) {
        seen.add(choice);
        words.push(choice);
      }
    }
    return words;
  }

  let words = pickWords(bank, targetLength, optionsCount);
  if (words.length < 4) {
    const fallbackPool = Array.isArray(defaultConfig.words) ? defaultConfig.words : [];
    words = pickWords(fallbackPool, targetLength, Math.max(6, optionsCount));
  }
  if (!words.length) {
    words = ['LOGIC', 'NEXUS', 'TRACE', 'PIXEL'];
  }
  const password = words[Math.floor(Math.random() * words.length)];

  const terminal = document.createElement('section');
  terminal.className = 'mg-card tech-terminal';

  const header = document.createElement('div');
  header.className = 'tech-terminal__header';
  header.innerHTML = `<pre>ROBCO INDUSTRIES (TM) TERMLINK PROTOCOL\n> ACCESSING SECURE LOCK INTERFACE...</pre>`;
  terminal.appendChild(header);

  const status = document.createElement('div');
  status.className = 'tech-terminal__status';
  terminal.appendChild(status);

  const memoryWrapper = document.createElement('div');
  memoryWrapper.className = 'tech-terminal__memory';
  terminal.appendChild(memoryWrapper);

  const columnLeft = document.createElement('div');
  columnLeft.className = 'tech-terminal__column';
  const columnRight = document.createElement('div');
  columnRight.className = 'tech-terminal__column';
  memoryWrapper.appendChild(columnLeft);
  memoryWrapper.appendChild(columnRight);

  const logWrapper = document.createElement('div');
  logWrapper.className = 'tech-terminal__log';
  const logOutput = document.createElement('div');
  logOutput.className = 'tech-terminal__log-output';
  logWrapper.appendChild(logOutput);
  terminal.appendChild(logWrapper);

  const commandRow = document.createElement('form');
  commandRow.className = 'tech-terminal__command-row';
  const prompt = document.createElement('span');
  prompt.className = 'tech-terminal__prompt';
  prompt.textContent = '>';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tech-terminal__input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Enter hack guess');
  commandRow.appendChild(prompt);
  commandRow.appendChild(input);
  terminal.appendChild(commandRow);

  const droneBtn = supportDrones ? document.createElement('button') : null;
  if (droneBtn) {
    droneBtn.type = 'button';
    droneBtn.className = 'tech-terminal__drone';
    droneBtn.textContent = 'DRONE PING (1)';
    terminal.appendChild(droneBtn);
  }

  root.appendChild(terminal);

  const memoryLines = 16;
  const lineLength = complexity === 'exotic' ? 36 : 32;
  const totalChars = memoryLines * lineLength;
  const charset = '!$%&/<>?{}[]()*+-=^|#@_';
  const buffer = Array.from({ length: totalChars }, () => charset[Math.floor(Math.random() * charset.length)]);

  const placements = [];
  function placeWord(word) {
    const length = word.length;
    const attempts = 200;
    for (let i = 0; i < attempts; i += 1) {
      const start = Math.floor(Math.random() * (totalChars - length));
      const lineIndex = Math.floor(start / lineLength);
      const end = start + length;
      const sameLine = Math.floor((end - 1) / lineLength) === lineIndex;
      if (!sameLine) continue;
      let blocked = false;
      for (let j = 0; j < length; j += 1) {
        if (placements.some(p => p.start <= start + j && start + j < p.end)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (let j = 0; j < length; j += 1) {
        buffer[start + j] = word[j];
      }
      placements.push({ word, start, end, line: lineIndex, column: start % lineLength });
      return true;
    }
    return false;
  }

  words.forEach(word => {
    if (!placeWord(word)) {
      const length = word.length;
      for (let idx = 0; idx <= totalChars - length; idx += 1) {
        const lineIndex = Math.floor(idx / lineLength);
        const sameLine = Math.floor((idx + length - 1) / lineLength) === lineIndex;
        if (!sameLine) continue;
        let blocked = false;
        for (let j = 0; j < length; j += 1) {
          if (placements.some(p => p.start <= idx + j && idx + j < p.end)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        for (let j = 0; j < length; j += 1) {
          buffer[idx + j] = word[j];
        }
        placements.push({ word, start: idx, end: idx + length, line: lineIndex, column: idx % lineLength });
        break;
      }
    }
  });

  const offsetBase = 0x7a0 + Math.floor(Math.random() * 0x100);
  const wordElements = new Map();

  function buildLine(lineIndex) {
    const lineStart = lineIndex * lineLength;
    const raw = buffer.slice(lineStart, lineStart + lineLength).join('');
    const lineEl = document.createElement('div');
    lineEl.className = 'tech-terminal__line';
    const offset = document.createElement('span');
    offset.className = 'tech-terminal__offset';
    offset.textContent = `0x${(offsetBase + lineIndex * lineLength).toString(16).toUpperCase().padStart(4, '0')}`;
    lineEl.appendChild(offset);

    const dump = document.createElement('span');
    dump.className = 'tech-terminal__dump';

    let cursor = 0;
    const linePlacements = placements
      .filter(p => p.line === lineIndex)
      .sort((a, b) => a.column - b.column);
    linePlacements.forEach(p => {
      const localStart = p.column;
      const localEnd = localStart + p.word.length;
      if (localStart > cursor) {
        dump.appendChild(document.createTextNode(raw.slice(cursor, localStart)));
      }
      const span = document.createElement('span');
      span.className = 'tech-terminal__word';
      span.dataset.word = p.word;
      span.textContent = raw.slice(localStart, localEnd);
      dump.appendChild(span);
      if (!wordElements.has(p.word)) {
        wordElements.set(p.word, []);
      }
      wordElements.get(p.word).push(span);
      cursor = localEnd;
    });
    if (cursor < raw.length) {
      dump.appendChild(document.createTextNode(raw.slice(cursor)));
    }
    lineEl.appendChild(dump);
    return lineEl;
  }

  for (let i = 0; i < memoryLines; i += 1) {
    const lineEl = buildLine(i);
    if (i < memoryLines / 2) {
      columnLeft.appendChild(lineEl);
    } else {
      columnRight.appendChild(lineEl);
    }
  }

  const guesses = new Set();
  let attemptsRemaining = attemptsTotal;
  let solved = false;
  let droneAvailable = supportDrones;
  const revealedIndices = new Set();

  function likeness(word) {
    let score = 0;
    for (let i = 0; i < Math.min(word.length, password.length); i += 1) {
      if (word[i] === password[i]) score += 1;
    }
    return score;
  }

  function appendLog(text, type = 'log') {
    const line = document.createElement('div');
    line.className = `tech-terminal__log-line tech-terminal__log-line--${type}`;
    line.textContent = text;
    logOutput.appendChild(line);
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function updateStatus() {
    const droneText = droneAvailable ? 'DRONE READY' : 'DRONE SPENT';
    const clue = revealedIndices.size
      ? `KNOWN: ${password
        .split('')
        .map((ch, idx) => (revealedIndices.has(idx) ? ch : '•'))
        .join('')}`
      : `KNOWN: ${'•'.repeat(password.length)}`;
    status.textContent = `ATTEMPTS REMAINING: ${attemptsRemaining}  |  ${droneBtn ? droneText : 'DRONE OFFLINE'}  |  ${clue}`;
  }

  function markWordUsed(word) {
    const elements = wordElements.get(word);
    if (!elements) return;
    elements.forEach(el => el.classList.add('tech-terminal__word--spent'));
  }

  function completeMission(success, body) {
    solved = true;
    input.disabled = true;
    if (droneBtn) droneBtn.disabled = true;
    appendLog(success ? 'ACCESS GRANTED. LOCK DISENGAGED.' : 'SECURITY LOCKOUT. COUNTERMEASURES DEPLOYED.', success ? 'success' : 'error');
    if (typeof context?.reportOutcome === 'function') {
      context.reportOutcome({
        success,
        heading: success ? 'Lock disengaged' : 'Lock sealed',
        body: body
          || (success
            ? 'Console override accepted. The vault seal retracts.'
            : 'All attempts exhausted. The system hardened the lock.'),
        note: body,
        detail: body,
        metrics: {
          attemptsRemaining,
          lockComplexity: complexity,
          droneAvailable,
        },
      });
    }
    if (context?.completeMission) {
      context.completeMission({
        success,
        heading: success ? 'Lock disengaged' : 'Lock sealed',
        body: body
          || (success
            ? 'Console override accepted. The vault seal retracts.'
            : 'All attempts exhausted. The system hardened the lock.'),
        dismissMessage: success
          ? 'Mission dismissed. Coordinate with your DM for the breach.'
          : 'Mission dismissed. Debrief the failed intrusion with your DM.',
      });
    }
  }

  function handleGuess(rawGuess) {
    if (solved) return;
    const guess = rawGuess.trim().toUpperCase();
    if (!guess) return;
    appendLog(`> ${guess}`, 'prompt');
    if (!words.includes(guess)) {
      appendLog('SYNTAX ERROR: ENTRY NOT RECOGNISED.', 'error');
      return;
    }
    if (guesses.has(guess)) {
      appendLog('ENTRY PREVIOUSLY EVALUATED. SELECT NEW CANDIDATE.', 'warn');
      return;
    }
    guesses.add(guess);
    markWordUsed(guess);
    const likenessScore = likeness(guess);
    if (guess === password) {
      appendLog(`PASSWORD ACCEPTED. LIKENESS ${password.length}/${password.length}.`, 'success');
      completeMission(true, `Override password ${password} accepted. Security shell collapsed.`);
      return;
    }
    attemptsRemaining -= 1;
    appendLog(`ENTRY DENIED. LIKENESS = ${likenessScore}/${password.length}.`, 'warn');
    if (attemptsRemaining <= 0) {
      completeMission(false, 'All intrusion attempts expended. The console hard-locks and purges access tokens.');
    }
    updateStatus();
  }

  memoryWrapper.addEventListener('click', event => {
    const target = event.target.closest('.tech-terminal__word');
    if (!target) return;
    handleGuess(target.dataset.word || '');
  });

  commandRow.addEventListener('submit', event => {
    event.preventDefault();
    if (input.disabled) return;
    const value = input.value;
    input.value = '';
    handleGuess(value);
  });

  if (droneBtn) {
    droneBtn.addEventListener('click', () => {
      if (!droneAvailable || solved) return;
      const hiddenIndices = password
        .split('')
        .map((_, idx) => idx)
        .filter(idx => !revealedIndices.has(idx));
      if (!hiddenIndices.length) return;
      const revealIndex = hiddenIndices[Math.floor(Math.random() * hiddenIndices.length)];
      revealedIndices.add(revealIndex);
      droneAvailable = false;
      droneBtn.disabled = true;
      appendLog(`DRONE PING: POSITION ${revealIndex + 1} CONFIRMED AS '${password[revealIndex]}'.`, 'info');
      updateStatus();
    });
  }

  appendLog('SECURITY LOCK V3.7 ONLINE. ATTEMPT PASSWORD ENTRY.');
  updateStatus();
  window.setTimeout(() => {
    input.focus();
  }, 80);
}

const GAMES = {
  'clue-tracker': {
    id: 'clue-tracker',
    name: 'Clue Tracker',
    tagline: 'Connect scattered evidence before the trail goes cold.',
    briefing: 'HQ is streaming intel fragments from across the city. Validate the most promising leads, connect their sequence, and ignore deliberate misinformation.',
    knobs: [
      { key: 'cluesToReveal', label: 'Clues to reveal', type: 'number', min: 1, max: 12, default: 3 },
      { key: 'timePerClue', label: 'Time per clue (seconds)', type: 'number', min: 15, max: 600, default: 90 },
      { key: 'includeRedHerrings', label: 'Include red herrings', type: 'toggle', default: false },
      { key: 'connectionsRequired', label: 'Connections to solve', type: 'number', min: 1, max: 10, default: 3, playerFacing: true },
    ],
    setup: setupClueTracker,
  },
  'code-breaker': {
    id: 'code-breaker',
    name: 'Code Breaker',
    tagline: 'Crack the villain\'s encryption before the final lock engages.',
    briefing: 'Decrypt the rotating cipher guarding the villain\'s comm console. Each attempt reveals positional hints—use them before the lock seals.',
    knobs: [
      { key: 'codeLength', label: 'Code length', type: 'number', min: 3, max: 10, default: 5 },
      { key: 'attemptLimit', label: 'Attempt limit', type: 'number', min: 1, max: 12, default: 6 },
      { key: 'cipherSet', label: 'Cipher set', type: 'select', default: 'alphanumeric', options: [
        { value: 'alphanumeric', label: 'Alphanumeric' },
        { value: 'glyph', label: 'Quantum Glyphs' },
        { value: 'emoji', label: 'Emoji Override' },
      ] },
    ],
    setup: setupCodeBreaker,
  },
  'lockdown-override': {
    id: 'lockdown-override',
    name: 'Lockdown Override',
    tagline: 'Stabilise the base before automated defences engage.',
    briefing: 'Override the failsafes by balancing the base subsystems. Each system drifts toward failure—keep them stable until the countdown expires.',
    knobs: [
      { key: 'securityLevel', label: 'Security level', type: 'select', default: 'amber', options: [
        { value: 'green', label: 'Green' },
        { value: 'amber', label: 'Amber' },
        { value: 'crimson', label: 'Crimson' },
      ] },
      { key: 'overrideTimer', label: 'Override timer (seconds)', type: 'number', min: 30, max: 900, default: 300 },
      { key: 'hazardSuppression', label: 'Hazard suppression enabled', type: 'toggle', default: true },
    ],
    setup: setupLockdownOverride,
  },
  'power-surge': {
    id: 'power-surge',
    name: 'Power Surge',
    tagline: 'Balance unstable energy flows before the generator ruptures.',
    briefing: 'Surge waves hammer the generator. Vent or boost output to keep the energy column within the safe band until all waves pass.',
    knobs: [
      { key: 'energyTarget', label: 'Stability target (%)', type: 'number', min: 10, max: 100, default: 80 },
      { key: 'surgeWaves', label: 'Surge waves', type: 'number', min: 1, max: 8, default: 3 },
      { key: 'stabilityChecks', label: 'Stability checks', type: 'select', default: 'skill', options: [
        { value: 'skill', label: 'Skill Tests' },
        { value: 'power', label: 'Power Challenges' },
        { value: 'mixed', label: 'Mixed Tests' },
      ] },
    ],
    setup: setupPowerSurge,
  },
  'stratagem-hero': {
    id: 'stratagem-hero',
    name: 'Stratagem Hero',
    tagline: 'Punch in stratagem codes before HQ\'s signal degrades.',
    briefing: 'Tap into HQ\'s stratagem uplink. As icons flash across the console, input the command sequence to drop thematic reinforcements from orbit.',
    knobs: [
      { key: 'callsRequired', label: 'Stratagem drops to complete', type: 'number', min: 1, max: 12, default: 5, playerFacing: true },
      { key: 'callDifficulty', label: 'Signal difficulty', type: 'select', default: 'training', options: [
        { value: 'training', label: 'Training Run' },
        { value: 'frontline', label: 'Frontline Uplink' },
        { value: 'doomsday', label: 'Doomsday Protocol' },
      ] },
      { key: 'signalTolerance', label: 'Signal tolerance (errors allowed)', type: 'number', min: 0, max: 6, default: 3, playerFacing: true },
    ],
    setup: setupStratagemHero,
  },
  'tech-lockpick': {
    id: 'tech-lockpick',
    name: 'Tech Lockpick',
    tagline: 'Bypass alien security architecture with finesse or brute force.',
    briefing: 'Dial into each alien subsystem to decode its frequency. Manage strikes carefully—the lock adapts after every failed probe.',
    knobs: [
      { key: 'lockComplexity', label: 'Lock complexity', type: 'select', default: 'standard', options: [
        { value: 'standard', label: 'Standard' },
        { value: 'advanced', label: 'Advanced' },
        { value: 'exotic', label: 'Exotic' },
      ] },
      { key: 'failuresAllowed', label: 'Failures allowed', type: 'number', min: 0, max: 6, default: 2 },
      { key: 'supportDrones', label: 'Support drones available', type: 'toggle', default: true },
    ],
    setup: setupTechLockpick,
  },
};

function getGameDefinition(gameId) {
  return GAMES[gameId] || null;
}

async function buildContext(game, params) {
  const storage = safeLocalStorage();
  let payload = null;
  if (params.deploymentId) {
    payload = loadPayloadFromStorage(params.deploymentId);
  }
  if (!payload && storage) {
    const last = storage.getItem(LAST_DEPLOYMENT_KEY);
    if (last) {
      payload = loadPayloadFromStorage(last);
    }
  }

  let warning = '';

  if (!payload && params.deploymentId) {
    try {
      const remote = await fetchDeploymentPayload(params.player, params.deploymentId);
      if (remote) {
        payload = {
          ...remote,
          id: remote.id || params.deploymentId,
          player: remote.player || params.player || '',
        };
        persistPayloadToStorage(payload);
      } else {
        warning = 'Deployment data was not found. Running in preview mode with default parameters.';
      }
    } catch (err) {
      console.error('Failed to load mini-game deployment from cloud', err);
      warning = 'Could not load deployment details from the cloud. Running in preview mode with default parameters.';
    }
  }

  if (!payload) {
    return {
      mode: 'preview',
      config: getDefaultConfig(game),
      player: params.player || 'Training Sim',
      issuedBy: 'DM',
      deploymentId: params.deploymentId || '',
      notes: '',
      warning,
    };
  }

  return {
    mode: 'live',
    config: payload.config || getDefaultConfig(game),
    player: payload.player || params.player || 'Operative',
    issuedBy: payload.issuedBy || 'DM',
    deploymentId: payload.id || params.deploymentId || '',
    notes: payload.notes || '',
    gameName: payload.gameName || game.name,
    tagline: payload.tagline || game.tagline,
    warning,
  };
}

async function init() {
  hideError();
  if (!shell || !rootEl) {
    showError('Mini-game shell failed to load.');
    return;
  }
  const params = parseQueryParams();
  if (!params.gameId) {
    showError('Missing game reference. Launch this tool from an approved deployment.');
    return;
  }
  const game = getGameDefinition(params.gameId);
  if (!game) {
    showError('Unknown mini-game reference. Contact your DM for a refreshed deployment link.');
    return;
  }

  const context = await buildContext(game, params);

  const title = context.gameName || game.name;
  const tagline = context.tagline || game.tagline;

  titleEl.textContent = title;
  taglineEl.textContent = tagline;
  playerEl.textContent = context.player || 'Unknown Operative';
  issuedEl.textContent = context.issuedBy || 'DM';

  if (context.deploymentId) {
    deploymentEl.textContent = context.deploymentId;
    deploymentRowEl.hidden = false;
  } else {
    deploymentRowEl.hidden = true;
  }

  briefEl.textContent = game.briefing;
  renderConfigSummary(game, context.config || {});

  if (context.notes) {
    notesTextEl.textContent = context.notes;
    notesEl.hidden = false;
  } else {
    notesEl.hidden = true;
  }

  if (context.mode === 'preview') {
    previewBannerEl.hidden = false;
    previewBannerEl.textContent = context.warning
      ? context.warning
      : 'Running in preview mode with default parameters.';
  } else {
    previewBannerEl.hidden = !context.warning;
    if (context.warning) {
      previewBannerEl.textContent = context.warning;
    }
  }

  const ensuredLaunch = ensureLaunchPanel();

  hideOutcome();
  hideDismissedNotice();

  if (launchTextEl) {
    const baseMessage = 'Review the mission briefing and parameters. When you\'re ready, begin the deployment to load the interactive console.';
    launchTextEl.textContent = context.warning
      ? `${context.warning} ${baseMessage}`
      : baseMessage;
  }

  rootEl.innerHTML = '';
  rootEl.hidden = true;
  shell.hidden = false;

  let missionStarted = false;
  let lastDismissMessage = '';

  const missionContext = { ...context };
  const sharedCuePlayer = typeof window !== 'undefined' && typeof window.playTone === 'function'
    ? window.playTone
    : null;
  const resolvedPlayCue = typeof context?.playCue === 'function'
    ? context.playCue
    : sharedCuePlayer
      ? cue => {
        if (typeof cue !== 'string') return;
        const normalized = cue.startsWith('toast-') ? cue.slice(6) : cue;
        sharedCuePlayer(normalized || 'info');
      }
      : null;
  if (resolvedPlayCue) {
    missionContext.playCue = resolvedPlayCue;
  }
  const deploymentReporter = createDeploymentReporter(missionContext);
  if (deploymentReporter) {
    missionContext.reportOutcome = deploymentReporter.recordOutcome;
    missionContext.deployment = deploymentReporter.getMeta();
  }
  activeMissionContext = missionContext;

  const handleMissionComplete = (result = {}) => {
    missionStarted = false;
    rootEl.innerHTML = '';
    rootEl.hidden = true;
    hideError();
    deploymentReporter?.completeMission(result);
    const { success = null, heading = '', body = '', dismissMessage } = result;
    const { headingText, bodyText } = getOutcomeCopy({ success, heading, body });
    const shouldAutoDismiss = success === true || success === false;
    if (!shouldAutoDismiss) {
      showOutcome({ success, heading: headingText, body: bodyText });
      if (launchEl) {
        launchEl.hidden = false;
      }
    }
    if (launchTextEl) {
      const base = 'You can replay the mission or dismiss this console.';
      const prefix = headingText
        || (success === true
          ? 'Mission accomplished.'
          : success === false
            ? 'Mission concluded.'
            : '');
      launchTextEl.textContent = [prefix, base].filter(Boolean).join(' ');
    }
    if (startButtonEl) {
      startButtonEl.textContent = 'Replay Mission';
      startButtonEl.disabled = false;
    }
    hideDismissedNotice();
    lastDismissMessage = dismissMessage
      || (success === true
        ? 'Mission dismissed. Outstanding work—stand by for your DM.'
        : success === false
          ? 'Mission dismissed. Coordinate with your DM before attempting again.'
          : 'Mission dismissed. You may close this window.');
    const toastMessage = result.toastMessage && typeof result.toastMessage === 'string' && result.toastMessage.trim()
      ? result.toastMessage.trim()
      : `${title}: ${success === true ? 'Mission accomplished' : success === false ? 'Mission failed' : headingText}`;
    const toastType = success === true ? 'success' : success === false ? 'error' : 'info';
    if (shouldAutoDismiss) {
      autoDismissMission({
        dismissMessage: lastDismissMessage,
        toastMessage,
        toastType,
      });
    } else if (dismissButtonEl) {
      dismissButtonEl.disabled = false;
    }
  };

  missionContext.completeMission = handleMissionComplete;

  const startMission = () => {
    if (missionStarted) return true;
    missionStarted = true;
    hideOutcome();
    hideDismissedNotice();
    lastDismissMessage = '';
    if (launchEl) {
      launchEl.hidden = true;
    }
    if (startButtonEl) {
      startButtonEl.textContent = 'Start Mission';
    }
    hideError();
    try {
      game.setup(rootEl, missionContext);
      deploymentReporter?.startMission();
      rootEl.hidden = false;
      return true;
    } catch (err) {
      console.error('Failed to initialise mission content', err);
      showError('Failed to load the mini-game deployment. Please refresh or request a new link.');
      missionStarted = false;
      if (launchEl) {
        launchEl.hidden = false;
      }
      return false;
    }
  };

  if (dismissButtonEl) {
    dismissButtonEl.addEventListener('click', () => {
      if (deploymentReporter) {
        deploymentReporter.cancelMission('Player dismissed the mission.');
      }
      hideOutcome();
      showDismissedNotice(lastDismissMessage);
      if (launchEl) {
        launchEl.hidden = true;
      }
      if (shell) {
        shell.hidden = true;
      }
    });
  }

  if (dismissedReopenBtn) {
    dismissedReopenBtn.addEventListener('click', () => {
      if (shell) {
        shell.hidden = false;
      }
      hideOutcome();
      if (launchEl) {
        launchEl.hidden = false;
      }
      if (startButtonEl) {
        startButtonEl.disabled = false;
        try { startButtonEl.focus(); } catch {}
      }
      hideDismissedNotice();
    });
  }

  if (ensuredLaunch.start) {
    if (ensuredLaunch.launch) {
      ensuredLaunch.launch.hidden = false;
    }
    ensuredLaunch.start.disabled = false;
    ensuredLaunch.start.addEventListener('click', () => {
      ensuredLaunch.start.disabled = true;
      const success = startMission();
      if (!success) {
        ensuredLaunch.start.disabled = false;
        try { ensuredLaunch.start.focus(); } catch {}
      }
    });
    try { ensuredLaunch.start.focus(); } catch {}
  } else {
    showError('Launch controls failed to load. Refresh the page or contact your DM.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('Failed to initialise mini-game runner', err);
    showError('Failed to load the mini-game deployment. Please refresh or request a new link.');
  });
});
