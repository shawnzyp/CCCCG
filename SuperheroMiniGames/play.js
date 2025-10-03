const STORAGE_PREFIX = 'cc:mini-game:deployment:';
const LAST_DEPLOYMENT_KEY = 'cc:mini-game:last-deployment';

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

const CLOUD_MINI_GAMES_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/miniGames';

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function secondsToClock(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const CLUE_POOL = [
  { title: 'Thermal Residue', detail: 'Heat signature indicates a quantum drive went active 3 minutes before the break-in.', tags: ['Evidence'] },
  { title: 'Encrypted Page', detail: 'A torn journal page contains coordinates hidden under reactive ink.', tags: ['Puzzle'] },
  { title: 'Anonymous Tip', detail: 'Voice-altered call mentions a hand-off at Pier 19 just after sunset.', tags: ['Witness'] },
  { title: 'City Cam Snapshot', detail: 'Blurry image captures a figure swapping duffel bags at the monorail hub.', tags: ['Surveillance'] },
  { title: 'Accelerant Sample', detail: 'Chemical analysis shows the accelerant was custom-engineered to burn cold.', tags: ['Forensics'] },
  { title: 'Dispatch Log', detail: 'Responder log notes power fluctuations exactly when the vault alarm tripped.', tags: ['Systems'] },
  { title: 'Holo-Key Fragment', detail: 'A fractured holographic key glows with the signature of Axiom Industries.', tags: ['Tech'] },
  { title: 'Arcade Token', detail: 'Token from the Boardwalk Arcade has fresh scorch marks and residual ozone.', tags: ['Oddity'] },
  { title: 'Nanite Swarm', detail: 'Dormant nanites recovered from the crime scene respond to a hidden carrier wave.', tags: ['Science'] },
  { title: 'Courier Route', detail: 'Delivery drone was diverted mid-route, bypassing air traffic controls.', tags: ['Logistics'] },
];

const RED_HERRINGS = [
  { title: 'Gossip Column', detail: 'Celebrity sighting claims the villain was across town during the incident.', tags: ['Rumour'], redHerring: true },
  { title: 'Tabloid Scoop', detail: 'Anonymous blog insists the heist was staged for marketing.', tags: ['Noise'], redHerring: true },
  { title: 'Street Artist', detail: 'Graffiti near the scene mimics the villain\'s emblem but predates the attack.', tags: ['Distraction'], redHerring: true },
];

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

  const body = document.createElement('p');
  body.textContent = 'Reveal clues, mark which ones connect, and watch for planted misinformation.';
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'mg-actions';
  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'mg-button';
  revealBtn.textContent = 'Reveal next clue';
  actions.appendChild(revealBtn);
  card.appendChild(actions);

  const grid = document.createElement('div');
  grid.className = 'clue-grid';

  root.appendChild(card);
  root.appendChild(grid);

  const config = context.config || {};
  const initialReveal = clamp(Number(config.cluesToReveal ?? 3), 1, 8);
  const includeRed = Boolean(config.includeRedHerrings);
  const timePerClue = clamp(Number(config.timePerClue ?? 90), 15, 900);

  const pool = shuffle([...CLUE_POOL]);
  const redDeck = includeRed ? shuffle([...RED_HERRINGS]) : [];
  const revealOrder = pool.slice(0, initialReveal);
  const hiddenDeck = shuffle([...pool.slice(initialReveal), ...redDeck]);

  const state = {
    revealed: 0,
    solved: 0,
    timer: timePerClue,
    interval: null,
  };

  const cards = [];

  function updateProgress() {
    progress.textContent = `Revealed ${state.revealed} clue${state.revealed === 1 ? '' : 's'} · Solved ${state.solved}`;
    if (!hiddenDeck.length) {
      revealBtn.disabled = true;
      revealBtn.textContent = 'All clues revealed';
    }
  }

  function updateTimerDisplay() {
    timer.textContent = hiddenDeck.length
      ? `Auto reveal in ${secondsToClock(state.timer)}`
      : 'All intel deployed';
  }

  function resetTimer() {
    state.timer = timePerClue;
    updateTimerDisplay();
  }

  function tickTimer() {
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
    if (state.interval) return;
    state.interval = window.setInterval(tickTimer, 1000);
  }

  function stopTimer() {
    if (state.interval) {
      window.clearInterval(state.interval);
      state.interval = null;
    }
  }

  function renderCard(clue, index, revealed) {
    const el = document.createElement('article');
    el.className = 'clue-card';
    el.dataset.index = `#${index}`;

    const title = document.createElement('h4');
    title.className = 'clue-card__title';
    const bodyText = document.createElement('p');
    bodyText.className = 'clue-card__body';
    const tags = document.createElement('div');
    tags.className = 'clue-card__tags';
    const actionsRow = document.createElement('div');
    actionsRow.className = 'mg-actions';
    const solveBtn = document.createElement('button');
    solveBtn.type = 'button';
    solveBtn.className = 'mg-button mg-button--ghost';
    solveBtn.textContent = 'Mark resolved';
    actionsRow.appendChild(solveBtn);

    el.appendChild(title);
    el.appendChild(bodyText);
    el.appendChild(tags);
    el.appendChild(actionsRow);

    const data = {
      clue,
      element: el,
      revealed: false,
      solved: false,
      index,
      solveBtn,
      title,
      bodyText,
      tags,
    };

    solveBtn.addEventListener('click', () => {
      data.solved = !data.solved;
      if (data.solved) {
        solveBtn.textContent = 'Undo';
        solveBtn.classList.add('mg-button');
        solveBtn.classList.remove('mg-button--ghost');
        state.solved += 1;
      } else {
        solveBtn.textContent = 'Mark resolved';
        solveBtn.classList.add('mg-button--ghost');
        solveBtn.classList.remove('mg-button');
        state.solved = Math.max(0, state.solved - 1);
      }
      updateProgress();
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
      solveBtn.disabled = false;
      state.revealed += 1;
      updateProgress();
      resetTimer();
      ensureTimer();
    }

    if (revealed) {
      applyReveal();
    } else {
      el.classList.add('clue-card--hidden');
      bodyText.textContent = 'Encrypted dossier awaiting clearance.';
      solveBtn.disabled = true;
    }

    grid.appendChild(el);
    cards.push({ data, reveal: applyReveal });
  }

  revealOrder.forEach((clue, idx) => {
    renderCard(clue, idx + 1, true);
  });

  hiddenDeck.forEach((clue, idx) => {
    renderCard(clue, revealOrder.length + idx + 1, false);
  });

  function revealNext() {
    const hidden = cards.find(entry => !entry.data.revealed);
    if (!hidden) {
      stopTimer();
      updateProgress();
      return;
    }
    hiddenDeck.shift();
    hidden.reveal();
    if (!cards.some(entry => !entry.data.revealed)) {
      stopTimer();
      timer.textContent = 'All intel deployed';
    }
  }

  revealBtn.addEventListener('click', () => {
    revealNext();
  });

  updateProgress();
  resetTimer();
  ensureTimer();
}

const CIPHER_SETS = {
  'alphanumeric': 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  'glyph': 'ΔΛΩΨΦΞΣΓΘ',
  'emoji': ['⚡', '🔥', '💎', '🛰️', '🧬', '🛡️', '🔮', '🧠', '🌀']
};

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

function setupCodeBreaker(root, context) {
  const card = document.createElement('section');
  card.className = 'mg-card code-breaker';
  const intro = document.createElement('p');
  intro.textContent = 'Crack the rotating cipher before the console locks. Each attempt provides feedback on symbol placement.';
  card.appendChild(intro);

  const display = document.createElement('div');
  display.className = 'code-breaker__display';
  display.textContent = '????';
  card.appendChild(display);

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
  const length = clamp(Number(config.codeLength ?? 5), 3, 10);
  const attempts = clamp(Number(config.attemptLimit ?? 6), 1, 12);
  const cipherSet = CIPHER_SETS[config.cipherSet] || CIPHER_SETS.alphanumeric;
  const secret = randomFromSet(cipherSet, length);
  let remaining = attempts;
  let solved = false;

  display.textContent = '⚠︎ Console Locked';
  attemptsLabel.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining`;

  function appendLog(entry) {
    const item = document.createElement('li');
    item.textContent = entry;
    item.style.padding = '6px 0';
    item.style.borderBottom = '1px solid rgba(148, 163, 184, 0.25)';
    logList.prepend(item);
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

  function complete(success) {
    solved = true;
    submit.disabled = true;
    input.disabled = true;
    if (success) {
      display.textContent = secret;
      attemptsLabel.textContent = 'Access granted. Vault unlocked!';
    } else {
      display.textContent = secret;
      attemptsLabel.textContent = 'Console sealed. Attempt logged with HQ.';
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
      appendLog('Override accepted. Sequence matched.');
      complete(true);
    } else {
      appendLog(`Exact matches: ${result.correct}, misaligned glyphs: ${result.inSequence}.`);
      attemptsLabel.textContent = `${remaining} attempt${remaining === 1 ? '' : 's'} remaining`;
      if (remaining <= 0) {
        appendLog('System lock engaged.');
        complete(false);
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

const LOCKDOWN_SUBSYSTEMS = [
  { id: 'reactor', label: 'Reactor Stabiliser' },
  { id: 'security', label: 'Security Countermeasures' },
  { id: 'evac', label: 'Civilian Evacuation' },
];

function setupLockdownOverride(root, context) {
  const config = context.config || {};
  const securityLevel = config.securityLevel || 'amber';
  const hazardSuppression = Boolean(config.hazardSuppression);
  const timerSeconds = clamp(Number(config.overrideTimer ?? 300), 30, 900);

  const card = document.createElement('section');
  card.className = 'mg-card';
  const intro = document.createElement('p');
  intro.textContent = 'Balance the base subsystems before lockdown finalises. Stabilise each system while the clock counts down.';
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

  const subsystems = LOCKDOWN_SUBSYSTEMS.map((sub, index) => {
    const container = document.createElement('div');
    container.className = 'progress-track';
    const heading = document.createElement('h4');
    heading.textContent = sub.label;
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

    container.appendChild(heading);
    container.appendChild(status);
    container.appendChild(bar);
    container.appendChild(button);
    grid.appendChild(container);

    const initial = 55 + index * 5;
    const data = {
      id: sub.id,
      label: sub.label,
      value: clamp(initial, 0, 100),
      statusEl: status,
      fillEl: fill,
      button,
    };

    button.addEventListener('click', () => {
      if (state.completed) return;
      data.value = clamp(data.value + 18, 0, 100);
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
      const drop = (Math.random() * difficulty + 1.5) * hazardPenalty;
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
      complete(false);
      return;
    }
    if (state.timer <= 0) {
      complete(allOptimal());
    }
  }

  function complete(success) {
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
  }

  boostAll.addEventListener('click', () => {
    subsystems.forEach(sub => {
      sub.value = clamp(sub.value + 12, 0, 100);
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

  function updateGauge() {
    gaugeFill.style.height = `${clamp(energy, 0, 100)}%`;
  }

  function complete(success) {
    concluded = true;
    window.clearInterval(interval);
    ventBtn.disabled = true;
    boostBtn.disabled = true;
    status.textContent = success ? 'Generator stabilised!' : 'Containment failure!';
    status.style.background = success
      ? 'rgba(34,197,94,0.2)'
      : 'rgba(248,113,113,0.2)';
  }

  function tick() {
    const turbulence = {
      skill: () => (Math.random() * 8 - 4),
      power: () => (Math.random() * 10 - 5),
      mixed: () => (Math.random() * 12 - 6),
    }[stabilityChecks] || (() => (Math.random() * 8 - 4));
    energy = clamp(energy + turbulence(), 0, 110);
    if (energy >= target - tolerance && energy <= target + tolerance) {
      stableSeconds += 1;
      status.textContent = `Hold steady… ${8 - stableSeconds} second${8 - stableSeconds === 1 ? '' : 's'} remaining`;
      if (stableSeconds >= 8) {
        waves[completedWaves].classList.add('power-surge__wave--complete');
        completedWaves += 1;
        stableSeconds = 0;
        if (completedWaves >= surgeWaves) {
          complete(true);
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
    energy = clamp(energy - 12, 0, 110);
    updateGauge();
  });

  boostBtn.addEventListener('click', () => {
    energy = clamp(energy + 12, 0, 110);
    updateGauge();
  });

  updateGauge();
  interval = window.setInterval(tick, 1000);
}

const STRATAGEM_MISSIONS = {
  infiltration: {
    briefing: 'Slip past security, neutralise watch posts, and extract the intel cache without triggering alarms.',
    tasks: [
      { id: 'entry', label: 'Entry Point', options: ['Shadow Step', 'Roof Drop', 'Sewer Route'] },
      { id: 'disable', label: 'Disable Defences', options: ['EMP Sweep', 'Silent Knockout', 'Bypass Console'] },
      { id: 'exfil', label: 'Extraction', options: ['Grapple Evac', 'Stealth Van', 'Subterranean Rail'] },
    ],
  },
  rescue: {
    briefing: 'Evacuate civilians while containing hostiles and shoring up collapsing infrastructure.',
    tasks: [
      { id: 'crowd', label: 'Crowd Management', options: ['Shield Tunnel', 'Escort Team', 'Rapid Relocation Pods'] },
      { id: 'threat', label: 'Suppress Threats', options: ['Flash Containment', 'Heroic Diversion', 'Precision Strike'] },
      { id: 'support', label: 'Support Assets', options: ['Medic Drones', 'Barrier Array', 'Hover Evac'] },
    ],
  },
  sabotage: {
    briefing: 'Cripple enemy production lines while masking the team\'s involvement.',
    tasks: [
      { id: 'breach', label: 'Breach Strategy', options: ['Holo-Misdirection', 'Tunnel Charge', 'Inside Agent'] },
      { id: 'payload', label: 'Payload Delivery', options: ['Quantum Disruptors', 'Nanite Flood', 'Cascade Virus'] },
      { id: 'clean', label: 'Cover Tracks', options: ['EMP Scrub', 'Thermite Purge', 'False Flag Trail'] },
    ],
  },
};

function setupStratagemHero(root, context) {
  const config = context.config || {};
  const missionProfile = config.missionProfile || 'rescue';
  const intelLevel = config.intelLevel || 'briefed';
  const teamBoost = Boolean(config.teamBoost);

  const mission = STRATAGEM_MISSIONS[missionProfile] || STRATAGEM_MISSIONS.rescue;

  const card = document.createElement('section');
  card.className = 'mg-card';
  const intro = document.createElement('p');
  intro.textContent = mission.briefing;
  card.appendChild(intro);

  const intel = document.createElement('div');
  intel.className = 'mg-status';
  intel.textContent = `Intel Level: ${intelLevel.charAt(0).toUpperCase()}${intelLevel.slice(1)}`;
  card.appendChild(intel);

  if (teamBoost) {
    const boost = document.createElement('p');
    boost.className = 'mg-status';
    boost.style.background = 'rgba(34,197,94,0.2)';
    boost.textContent = 'Team synergy boost available · grant one reroll to a teammate!';
    card.appendChild(boost);
  }

  const grid = document.createElement('div');
  grid.className = 'stratagem-grid';
  const plans = {};

  mission.tasks.forEach(task => {
    const pane = document.createElement('div');
    pane.className = 'stratagem-card';
    const heading = document.createElement('h4');
    heading.textContent = task.label;
    const select = document.createElement('select');
    task.options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      select.appendChild(opt);
    });
    const notes = document.createElement('textarea');
    notes.placeholder = 'Tactical notes…';
    pane.appendChild(heading);
    pane.appendChild(select);
    pane.appendChild(notes);
    grid.appendChild(pane);
    plans[task.id] = { select, notes };
  });

  card.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'mg-actions';
  const execute = document.createElement('button');
  execute.type = 'button';
  execute.className = 'mg-button';
  execute.textContent = 'Execute plan';
  actions.appendChild(execute);
  card.appendChild(actions);

  const report = document.createElement('div');
  report.className = 'mg-status';
  report.textContent = 'Awaiting go-order…';
  card.appendChild(report);

  root.appendChild(card);

  execute.addEventListener('click', () => {
    const summary = Object.entries(plans)
      .map(([id, controls]) => `${id}: ${controls.select.value}`)
      .join(' · ');
    report.textContent = `Plan locked: ${summary}`;
    report.style.background = 'rgba(56,189,248,0.18)';
  });
}

function setupTechLockpick(root, context) {
  const config = context.config || {};
  const complexity = config.lockComplexity || 'standard';
  const failuresAllowed = clamp(Number(config.failuresAllowed ?? 2), 0, 6);
  const supportDrones = Boolean(config.supportDrones);

  const dialCount = {
    standard: 3,
    advanced: 4,
    exotic: 5,
  }[complexity] || 3;

  const card = document.createElement('section');
  card.className = 'mg-card';
  const intro = document.createElement('p');
  intro.textContent = 'Tune each subsystem dial to the correct frequency. Use drones for assistance or risk the lock sealing shut.';
  card.appendChild(intro);

  const strikeLabel = document.createElement('div');
  strikeLabel.className = 'mg-status';
  strikeLabel.textContent = `Strike tokens remaining: ${failuresAllowed}`;
  card.appendChild(strikeLabel);

  const grid = document.createElement('div');
  grid.className = 'lockpick-grid';
  card.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'mg-actions';
  const probeBtn = document.createElement('button');
  probeBtn.type = 'button';
  probeBtn.className = 'mg-button';
  probeBtn.textContent = 'Probe lock';
  actions.appendChild(probeBtn);
  let droneAvailable = supportDrones;
  let droneBtn = null;
  if (supportDrones) {
    droneBtn = document.createElement('button');
    droneBtn.type = 'button';
    droneBtn.className = 'mg-button mg-button--ghost';
    droneBtn.textContent = 'Deploy support drone';
    actions.appendChild(droneBtn);
  }
  card.appendChild(actions);

  const feedback = document.createElement('div');
  feedback.className = 'mg-status';
  feedback.textContent = 'Awaiting calibration check…';
  card.appendChild(feedback);

  root.appendChild(card);

  const dials = [];
  for (let i = 0; i < dialCount; i += 1) {
    const pane = document.createElement('div');
    pane.className = 'lockpick-dial';
    const label = document.createElement('div');
    label.textContent = `Subsystem ${i + 1}`;
    const valueEl = document.createElement('div');
    valueEl.className = 'lockpick-dial__value';
    const controls = document.createElement('div');
    controls.className = 'lockpick-dial__controls';
    const dec = document.createElement('button');
    dec.type = 'button';
    dec.textContent = '−';
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.textContent = '+';
    controls.appendChild(dec);
    controls.appendChild(inc);
    const hint = document.createElement('div');
    hint.className = 'lockpick-dial__hint';
    hint.textContent = 'Uncalibrated';
    pane.appendChild(label);
    pane.appendChild(valueEl);
    pane.appendChild(controls);
    pane.appendChild(hint);
    grid.appendChild(pane);

    const target = Math.floor(Math.random() * 10);
    const dialState = {
      value: Math.floor(Math.random() * 10),
      target,
      valueEl,
      hint,
      controls,
    };

    function updateDisplay() {
      dialState.valueEl.textContent = dialState.value;
      const delta = Math.abs(dialState.value - dialState.target);
      if (delta === 0) {
        hint.textContent = 'Aligned';
      } else if (delta === 1) {
        hint.textContent = 'Very close';
      } else if (dialState.value < dialState.target) {
        hint.textContent = 'Need higher resonance';
      } else {
        hint.textContent = 'Need lower resonance';
      }
    }

    dec.addEventListener('click', () => {
      dialState.value = (dialState.value + 9) % 10;
      updateDisplay();
    });

    inc.addEventListener('click', () => {
      dialState.value = (dialState.value + 1) % 10;
      updateDisplay();
    });

    updateDisplay();
    dials.push(dialState);
  }

  let strikes = failuresAllowed;
  let solved = false;

  function updateStrikeLabel() {
    strikeLabel.textContent = `Strike tokens remaining: ${strikes}`;
  }

  function complete(success) {
    solved = true;
    probeBtn.disabled = true;
    if (droneBtn) droneBtn.disabled = true;
    dials.forEach(d => {
      d.controls.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
    });
    feedback.textContent = success ? 'Lock disengaged!' : 'Lock sealed. Countermeasures triggered!';
    feedback.style.background = success
      ? 'rgba(34,197,94,0.2)'
      : 'rgba(248,113,113,0.2)';
  }

  probeBtn.addEventListener('click', () => {
    if (solved) return;
    const misaligned = dials.filter(d => d.value !== d.target);
    if (misaligned.length === 0) {
      complete(true);
      return;
    }
    strikes -= 1;
    updateStrikeLabel();
    feedback.textContent = `${misaligned.length} subsystem${misaligned.length === 1 ? '' : 's'} misaligned.`;
    if (strikes < 0) {
      complete(false);
    }
  });

  if (droneBtn) {
    droneBtn.addEventListener('click', () => {
      if (solved || !droneAvailable) return;
      const candidates = dials.filter(d => d.value !== d.target);
      if (!candidates.length) return;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      target.value = target.target;
      target.hint.textContent = 'Drone resolved alignment';
      target.valueEl.textContent = target.value;
      droneAvailable = false;
      droneBtn.disabled = true;
    });
  }
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
    tagline: 'Coordinate the team\'s tactical response to an evolving crisis.',
    briefing: 'Assemble a synchronized plan that leverages each hero\'s strengths. Assign tactics, jot contingencies, then lock the mission profile.',
    knobs: [
      { key: 'missionProfile', label: 'Mission profile', type: 'select', default: 'rescue', options: [
        { value: 'infiltration', label: 'Infiltration' },
        { value: 'rescue', label: 'Rescue' },
        { value: 'sabotage', label: 'Sabotage' },
      ] },
      { key: 'intelLevel', label: 'Intel level', type: 'select', default: 'briefed', options: [
        { value: 'blind', label: 'Blind Drop' },
        { value: 'briefed', label: 'Briefed' },
        { value: 'overwatch', label: 'Overwatch Support' },
      ] },
      { key: 'teamBoost', label: 'Team synergy boost', type: 'toggle', default: false },
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

  const startMission = () => {
    if (missionStarted) return true;
    missionStarted = true;
    if (launchEl) {
      launchEl.hidden = true;
    }
    hideError();
    try {
      game.setup(rootEl, context);
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
