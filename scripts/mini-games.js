const MINI_GAMES = [
  {
    id: 'clue-tracker',
    name: 'Clue Tracker',
    folder: 'ClueTracker',
    url: 'SuperheroMiniGames/ClueTracker/ClueTracker.html',
    tagline: 'Connect scattered evidence before the trail goes cold.',
    knobs: [
      {
        key: 'cluesToReveal',
        label: 'Clues to reveal',
        type: 'number',
        min: 1,
        max: 12,
        step: 1,
        default: 3,
        description: 'How many clues are unlocked for the player at the start of the mini-game.'
      },
      {
        key: 'timePerClue',
        label: 'Time per clue (seconds)',
        type: 'number',
        min: 15,
        max: 600,
        step: 15,
        default: 90,
        description: 'How long the player has to respond before the next clue is automatically exposed.'
      },
      {
        key: 'includeRedHerrings',
        label: 'Include red herrings',
        type: 'toggle',
        default: false,
        description: 'Adds misleading hints that require additional investigation to clear.'
      }
    ]
  },
  {
    id: 'code-breaker',
    name: 'Code Breaker',
    folder: 'CodeBreaker',
    url: 'SuperheroMiniGames/CodeBreaker/CodeBreaker.html',
    tagline: 'Crack the villain\'s encryption before the final lock engages.',
    knobs: [
      {
        key: 'codeLength',
        label: 'Code length',
        type: 'number',
        min: 3,
        max: 10,
        step: 1,
        default: 5,
        description: 'Number of characters the player must decode to succeed.'
      },
      {
        key: 'attemptLimit',
        label: 'Attempt limit',
        type: 'number',
        min: 1,
        max: 12,
        step: 1,
        default: 6,
        description: 'How many incorrect submissions are allowed before the console locks.'
      },
      {
        key: 'cipherSet',
        label: 'Cipher set',
        type: 'select',
        default: 'alphanumeric',
        options: [
          { value: 'alphanumeric', label: 'Alphanumeric' },
          { value: 'glyph', label: 'Quantum Glyphs' },
          { value: 'emoji', label: 'Emoji Override' }
        ],
        description: 'Determines the iconography used in the puzzle.'
      }
    ]
  },
  {
    id: 'lockdown-override',
    name: 'Lockdown Override',
    folder: 'LockdownOverride',
    url: 'SuperheroMiniGames/LockdownOverride/LockdownOverride.html',
    tagline: 'Stabilise the base before automated defences engage.',
    knobs: [
      {
        key: 'securityLevel',
        label: 'Security level',
        type: 'select',
        default: 'amber',
        options: [
          { value: 'green', label: 'Green' },
          { value: 'amber', label: 'Amber' },
          { value: 'crimson', label: 'Crimson' }
        ],
        description: 'Higher levels add more countermeasures for the player to disarm.'
      },
      {
        key: 'overrideTimer',
        label: 'Override timer (seconds)',
        type: 'number',
        min: 30,
        max: 900,
        step: 30,
        default: 300,
        description: 'Total time before the lockdown seals permanently.'
      },
      {
        key: 'hazardSuppression',
        label: 'Hazard suppression enabled',
        type: 'toggle',
        default: true,
        description: 'When on, automated traps pause while the player works. When off they remain active.'
      }
    ]
  },
  {
    id: 'power-surge',
    name: 'Power Surge',
    folder: 'PowerSurge',
    url: 'SuperheroMiniGames/PowerSurge/PowerSurge.html',
    tagline: 'Balance unstable energy flows before the generator ruptures.',
    knobs: [
      {
        key: 'energyTarget',
        label: 'Stability target (%)',
        type: 'number',
        min: 10,
        max: 100,
        step: 5,
        default: 80,
        description: 'The output level the player must maintain to succeed.'
      },
      {
        key: 'surgeWaves',
        label: 'Surge waves',
        type: 'number',
        min: 1,
        max: 8,
        step: 1,
        default: 3,
        description: 'Number of escalating waves before the reactor stabilises.'
      },
      {
        key: 'stabilityChecks',
        label: 'Stability checks',
        type: 'select',
        default: 'skill',
        options: [
          { value: 'skill', label: 'Skill Tests' },
          { value: 'power', label: 'Power Challenges' },
          { value: 'mixed', label: 'Mixed Tests' }
        ],
        description: 'Defines the type of tests required to dampen each surge.'
      }
    ]
  },
  {
    id: 'stratagem-hero',
    name: 'Stratagem Hero',
    folder: 'StratagemHero',
    url: 'SuperheroMiniGames/StratagemHero/StratagemHero.html',
    tagline: 'Coordinate the team\'s tactical response to an evolving crisis.',
    knobs: [
      {
        key: 'missionProfile',
        label: 'Mission profile',
        type: 'select',
        default: 'rescue',
        options: [
          { value: 'infiltration', label: 'Infiltration' },
          { value: 'rescue', label: 'Rescue' },
          { value: 'sabotage', label: 'Sabotage' }
        ],
        description: 'Sets the overall objective the player must solve.'
      },
      {
        key: 'intelLevel',
        label: 'Intel level',
        type: 'select',
        default: 'briefed',
        options: [
          { value: 'blind', label: 'Blind Drop' },
          { value: 'briefed', label: 'Briefed' },
          { value: 'overwatch', label: 'Overwatch Support' }
        ],
        description: 'Controls how much guidance the player receives from HQ.'
      },
      {
        key: 'teamBoost',
        label: 'Team synergy boost',
        type: 'toggle',
        default: false,
        description: 'When enabled, grants a one-time advantage die for cooperative actions.'
      }
    ]
  },
  {
    id: 'tech-lockpick',
    name: 'Tech Lockpick',
    folder: 'TechLockpick',
    url: 'SuperheroMiniGames/TechLockpick/TechLockpick.html',
    tagline: 'Bypass alien security architecture with finesse or brute force.',
    knobs: [
      {
        key: 'lockComplexity',
        label: 'Lock complexity',
        type: 'select',
        default: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'advanced', label: 'Advanced' },
          { value: 'exotic', label: 'Exotic' }
        ],
        description: 'Determines how many unique subsystems must be solved.'
      },
      {
        key: 'failuresAllowed',
        label: 'Failures allowed',
        type: 'number',
        min: 0,
        max: 6,
        step: 1,
        default: 2,
        description: 'Number of strike tokens the player can accumulate before the lock seals.'
      },
      {
        key: 'supportDrones',
        label: 'Support drones available',
        type: 'toggle',
        default: true,
        description: 'Adds AI helpers that can clear a subsystem once per encounter.'
      }
    ]
  }
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
];

const README_BASE_PATH = 'SuperheroMiniGames';
const README_FILENAME = 'README.txt';
const CLOUD_MINI_GAMES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/miniGames';
const POLL_INTERVAL_MS = 15000;

const readmeCache = new Map();
const listeners = new Set();
let pollTimer = null;
let pollPromise = null;
let cachedDeployments = [];

function cloneOptions(options) {
  if (!Array.isArray(options)) return undefined;
  return options.map(opt => ({ ...opt }));
}

function cloneGame(game) {
  return {
    ...game,
    knobs: game.knobs.map(knob => ({ ...knob, options: cloneOptions(knob.options) }))
  };
}

export function listMiniGames() {
  return MINI_GAMES.map(cloneGame);
}

export function getMiniGame(id) {
  const game = MINI_GAMES.find(item => item.id === id);
  return game ? cloneGame(game) : null;
}

function ensureGame(id) {
  const game = MINI_GAMES.find(item => item.id === id);
  if (!game) throw new Error(`Unknown mini-game: ${id}`);
  return game;
}

export function getDefaultConfig(id) {
  const game = ensureGame(id);
  const config = {};
  game.knobs.forEach(knob => {
    if (Object.prototype.hasOwnProperty.call(knob, 'default')) {
      config[knob.key] = knob.default;
      return;
    }
    switch (knob.type) {
      case 'toggle':
        config[knob.key] = false;
        break;
      case 'number':
        config[knob.key] = knob.min ?? 0;
        break;
      default:
        config[knob.key] = '';
    }
  });
  return config;
}

export function formatKnobValue(knob, value) {
  switch (knob.type) {
    case 'toggle':
      return value ? 'Enabled' : 'Disabled';
    case 'select': {
      const opt = knob.options?.find(o => o.value === value);
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

export function summarizeConfig(id, config = {}) {
  const game = ensureGame(id);
  return game.knobs
    .map(knob => {
      if (!Object.prototype.hasOwnProperty.call(config, knob.key)) return null;
      const raw = config[knob.key];
      if (knob.type === 'toggle' && typeof raw !== 'boolean') return `${knob.label}: ${raw ? 'Enabled' : 'Disabled'}`;
      return `${knob.label}: ${formatKnobValue(knob, raw)}`;
    })
    .filter(Boolean)
    .join(', ');
}

export const MINI_GAME_STATUS_OPTIONS = STATUS_OPTIONS.map(opt => ({ ...opt }));

export function getStatusLabel(value) {
  const opt = STATUS_OPTIONS.find(option => option.value === value);
  return opt ? opt.label : value;
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

async function fetchReadme(game) {
  if (readmeCache.has(game.id)) {
    return readmeCache.get(game.id);
  }
  try {
    const res = await fetch(`${README_BASE_PATH}/${game.folder}/${README_FILENAME}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    readmeCache.set(game.id, text);
    return text;
  } catch (err) {
    const fallback = 'README unavailable.';
    readmeCache.set(game.id, fallback);
    console.error(`Failed to load README for ${game.name}`, err);
    return fallback;
  }
}

export async function loadMiniGameReadme(id) {
  const game = ensureGame(id);
  return fetchReadme(game);
}

async function fetchDeploymentsFromCloud() {
  const res = await fetch(`${CLOUD_MINI_GAMES_URL}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data || {};
}

function transformDeploymentData(raw) {
  const entries = [];
  if (!raw || typeof raw !== 'object') return entries;
  for (const [player, record] of Object.entries(raw)) {
    if (!record || typeof record !== 'object') continue;
    for (const [id, details] of Object.entries(record)) {
      if (!details || typeof details !== 'object') continue;
      entries.push({
        player,
        id,
        ...details
      });
    }
  }
  entries.sort((a, b) => {
    const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : typeof a.createdAt === 'number' ? a.createdAt : 0;
    const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : typeof b.createdAt === 'number' ? b.createdAt : 0;
    return bTime - aTime;
  });
  return entries;
}

function safeClone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function notifyListeners() {
  const snapshot = safeClone(cachedDeployments);
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (err) {
      console.error('Mini-game listener error', err);
    }
  });
}

async function pollDeployments(force = false) {
  if (pollPromise) {
    return pollPromise;
  }
  if (!force && pollTimer === null && listeners.size === 0) {
    return cachedDeployments;
  }
  pollPromise = (async () => {
    try {
      const raw = await fetchDeploymentsFromCloud();
      cachedDeployments = transformDeploymentData(raw);
      notifyListeners();
    } catch (err) {
      console.error('Failed to load mini-game deployments', err);
    } finally {
      pollPromise = null;
    }
    return cachedDeployments;
  })();
  return pollPromise;
}

function startPolling() {
  if (pollTimer !== null) return;
  pollDeployments(true).catch(() => {});
  pollTimer = setInterval(() => {
    pollDeployments(false).catch(() => {});
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function subscribeToDeployments(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  startPolling();
  callback(safeClone(cachedDeployments));
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      stopPolling();
    }
  };
}

export async function refreshDeployments() {
  return pollDeployments(true);
}

function randomId() {
  return `mg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePlayer(player = '') {
  return player.trim().replace(/\s+/g, ' ');
}

export async function deployMiniGame({ gameId, player, config = {}, notes = '', issuedBy = '' } = {}) {
  const game = ensureGame(gameId);
  const trimmedPlayer = sanitizePlayer(player);
  if (!trimmedPlayer) throw new Error('Player name is required');
  const deploymentId = randomId();
  const ts = Date.now();
  const payload = {
    id: deploymentId,
    gameId: game.id,
    gameName: game.name,
    gameUrl: game.url,
    config,
    player: trimmedPlayer,
    status: 'pending',
    notes: typeof notes === 'string' ? notes.trim() : '',
    issuedBy: issuedBy || 'DM',
    createdAt: ts,
    updatedAt: ts
  };
  const url = `${CLOUD_MINI_GAMES_URL}/${encodePath(trimmedPlayer)}/${encodePath(deploymentId)}.json`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pollDeployments(true);
  return payload;
}

export async function updateDeployment(player, id, updates = {}) {
  const trimmedPlayer = sanitizePlayer(player);
  if (!trimmedPlayer || !id) throw new Error('Invalid deployment reference');
  const patch = {
    ...updates,
    updatedAt: Date.now()
  };
  const url = `${CLOUD_MINI_GAMES_URL}/${encodePath(trimmedPlayer)}/${encodePath(id)}.json`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pollDeployments(true);
}

export async function deleteDeployment(player, id) {
  const trimmedPlayer = sanitizePlayer(player);
  if (!trimmedPlayer || !id) throw new Error('Invalid deployment reference');
  const url = `${CLOUD_MINI_GAMES_URL}/${encodePath(trimmedPlayer)}/${encodePath(id)}.json`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pollDeployments(true);
}
