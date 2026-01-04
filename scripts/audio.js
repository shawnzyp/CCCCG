const AUDIO_CUE_SETTINGS = {
  down: {
    frequency: 78,
    type: 'sine',
    duration: 0.85,
    volume: 0.26,
    attack: 0.02,
    release: 0.55,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.55 },
      { ratio: 1.2, amplitude: 0.25 },
      { ratio: 1.8, amplitude: 0.15 },
    ],
  },
  death: {
    frequency: 58,
    type: 'triangle',
    duration: 1.8,
    volume: 0.28,
    attack: 0.03,
    release: 1.1,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.5 },
      { ratio: 1.4, amplitude: 0.25 },
      { ratio: 2.2, amplitude: 0.18 },
    ],
  },
  'dice-roll': {
    volume: 0.26,
    type: 'square',
    segments: [
      {
        frequency: 740,
        duration: 0.055,
        attack: 0.002,
        release: 0.03,
        partials: [
          { ratio: 1, amplitude: 0.6 },
          { ratio: 1.35, amplitude: 0.45 },
          { ratio: 2.2, amplitude: 0.32 },
          { ratio: 3.4, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.02,
        frequency: 680,
        duration: 0.06,
        attack: 0.002,
        release: 0.035,
        partials: [
          { ratio: 1, amplitude: 0.55 },
          { ratio: 1.4, amplitude: 0.4 },
          { ratio: 2.3, amplitude: 0.3 },
          { ratio: 3.6, amplitude: 0.18 },
        ],
      },
      {
        delay: 0.03,
        frequency: 790,
        duration: 0.05,
        attack: 0.002,
        release: 0.03,
        partials: [
          { ratio: 1, amplitude: 0.5 },
          { ratio: 1.3, amplitude: 0.35 },
          { ratio: 2.1, amplitude: 0.28 },
          { ratio: 3.2, amplitude: 0.16 },
        ],
      },
    ],
  },
  'dice-crit-success': {
    frequency: 980,
    type: 'sine',
    duration: 0.55,
    volume: 0.3,
    attack: 0.004,
    release: 0.34,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.5 },
      { ratio: 2.1, amplitude: 0.35 },
      { ratio: 3.2, amplitude: 0.22 },
    ],
  },
  'dice-crit-failure': {
    frequency: 180,
    type: 'sawtooth',
    duration: 0.7,
    volume: 0.3,
    attack: 0.012,
    release: 0.48,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.6 },
      { ratio: 1.4, amplitude: 0.35 },
      { ratio: 2.2, amplitude: 0.2 },
    ],
  },
  'roll-success': {
    volume: 0.28,
    type: 'sine',
    segments: [
      {
        frequency: 1240,
        duration: 0.18,
        attack: 0.004,
        release: 0.14,
        partials: [
          { ratio: 1, amplitude: 1 },
          { ratio: 2, amplitude: 0.5 },
          { ratio: 3, amplitude: 0.3 },
        ],
      },
      {
        delay: 0.02,
        frequency: 820,
        duration: 0.11,
        attack: 0.002,
        release: 0.08,
        type: 'square',
        partials: [
          { ratio: 1, amplitude: 0.4 },
          { ratio: 1.6, amplitude: 0.28 },
          { ratio: 2.4, amplitude: 0.18 },
        ],
      },
    ],
  },
  'roll-failure': {
    volume: 0.3,
    type: 'triangle',
    segments: [
      {
        frequency: 180,
        duration: 0.26,
        attack: 0.01,
        release: 0.2,
        partials: [
          { ratio: 1, amplitude: 1 },
          { ratio: 0.6, amplitude: 0.55 },
          { ratio: 1.4, amplitude: 0.3 },
        ],
      },
      {
        delay: 0.05,
        frequency: 320,
        duration: 0.16,
        attack: 0.008,
        release: 0.12,
        type: 'sawtooth',
        partials: [
          { ratio: 1, amplitude: 0.4 },
          { ratio: 2.2, amplitude: 0.22 },
          { ratio: 3.4, amplitude: 0.16 },
        ],
      },
    ],
  },
  'dm-roll': {
    frequency: 420,
    type: 'square',
    duration: 0.38,
    volume: 0.32,
    attack: 0.006,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.4 },
      { ratio: 1.33, amplitude: 0.5 },
      { ratio: 1.99, amplitude: 0.35 },
    ],
  },
  'coin-flip': {
    frequency: 1220,
    type: 'square',
    duration: 0.22,
    volume: 0.2,
    attack: 0.002,
    release: 0.09,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.7, amplitude: 0.5 },
      { ratio: 3.9, amplitude: 0.28 },
      { ratio: 5.1, amplitude: 0.18 },
    ],
  },
  'item-consume': {
    volume: 0.22,
    type: 'triangle',
    segments: [
      {
        frequency: 980,
        duration: 0.045,
        attack: 0.002,
        release: 0.03,
        type: 'square',
        partials: [
          { ratio: 1, amplitude: 1 },
          { ratio: 2.2, amplitude: 0.55 },
          { ratio: 3.4, amplitude: 0.3 },
        ],
      },
      {
        delay: 0.015,
        frequency: 420,
        duration: 0.18,
        attack: 0.01,
        release: 0.12,
        type: 'sine',
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 1.6, amplitude: 0.35 },
          { ratio: 2.4, amplitude: 0.2 },
        ],
      },
    ],
  },
  'coin-heads': {
    frequency: 980,
    type: 'triangle',
    duration: 0.18,
    volume: 0.22,
    attack: 0.002,
    release: 0.08,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.8, amplitude: 0.45 },
      { ratio: 2.6, amplitude: 0.22 },
    ],
  },
  'coin-tails': {
    frequency: 720,
    type: 'sawtooth',
    duration: 0.24,
    volume: 0.22,
    attack: 0.004,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.4, amplitude: 0.5 },
      { ratio: 2.2, amplitude: 0.3 },
    ],
  },
  'prompt-open': {
    volume: 0.06,
    segments: [
      {
        frequency: 680,
        type: 'sawtooth',
        duration: 0.08,
        volume: 0.05,
        attack: 0.002,
        release: 0.05,
        partials: [
          { ratio: 1, amplitude: 0.6 },
          { ratio: 1.5, amplitude: 0.4 },
          { ratio: 2.4, amplitude: 0.3 },
          { ratio: 3.2, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.03,
        frequency: 1180,
        type: 'sine',
        duration: 0.28,
        volume: 0.04,
        attack: 0.012,
        release: 0.2,
        partials: [
          { ratio: 1, amplitude: 1 },
          { ratio: 2, amplitude: 0.22 },
  equip: {
    volume: 0.24,
    segments: [
      {
        frequency: 980,
        type: 'square',
        duration: 0.05,
        attack: 0.002,
        release: 0.03,
        partials: [
          { ratio: 1, amplitude: 0.6 },
          { ratio: 2.4, amplitude: 0.35 },
          { ratio: 3.6, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.015,
        frequency: 620,
        type: 'triangle',
        duration: 0.12,
        attack: 0.004,
        release: 0.08,
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 1.5, amplitude: 0.35 },
          { ratio: 2.2, amplitude: 0.2 },
        ],
      },
    ],
  },
  unequip: {
    volume: 0.2,
    segments: [
      {
        frequency: 240,
        type: 'sawtooth',
        duration: 0.14,
        attack: 0.01,
        release: 0.1,
        partials: [
          { ratio: 1, amplitude: 0.6 },
          { ratio: 1.7, amplitude: 0.3 },
          { ratio: 2.6, amplitude: 0.18 },
        ],
      },
      {
        delay: 0.04,
        frequency: 180,
        type: 'triangle',
        duration: 0.2,
        attack: 0.02,
        release: 0.14,
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 1.4, amplitude: 0.35 },
          { ratio: 2.1, amplitude: 0.2 },
        ],
      },
    ],
  },
  'credits-gain': {
    frequency: 880,
    type: 'square',
    duration: 0.48,
    volume: 0.24,
    attack: 0.002,
    release: 0.28,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.33, amplitude: 0.65 },
      { ratio: 1.75, amplitude: 0.5 },
      { ratio: 2.4, amplitude: 0.35 },
      { ratio: 3.1, amplitude: 0.2 },
    ],
  },
  'credits-save': {
    frequency: 420,
    type: 'triangle',
    duration: 0.26,
    volume: 0.28,
    attack: 0.004,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.1, amplitude: 0.3 },
      { ratio: 3.4, amplitude: 0.18 },
    ],
  },
  'credits-spend': {
    frequency: 260,
    type: 'sawtooth',
    duration: 0.5,
    volume: 0.23,
    attack: 0.01,
    release: 0.32,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.75, amplitude: 0.55 },
      { ratio: 1.4, amplitude: 0.35 },
      { ratio: 2.2, amplitude: 0.2 },
    ],
  },
  'hp-damage': {
    frequency: 340,
    type: 'square',
    duration: 0.22,
    volume: 0.32,
    attack: 0.004,
    release: 0.14,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.8, amplitude: 0.45 },
      { ratio: 3, amplitude: 0.18 },
    ],
  },
  'hp-damage-1': {
    frequency: 520,
    type: 'sawtooth',
    duration: 0.16,
    volume: 0.3,
    attack: 0.002,
    release: 0.1,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.9, amplitude: 0.7 },
      { ratio: 3.4, amplitude: 0.45 },
      { ratio: 5.2, amplitude: 0.2 },
    ],
  },
  'hp-damage-2': {
    frequency: 300,
    type: 'square',
    duration: 0.2,
    volume: 0.32,
    attack: 0.003,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.75, amplitude: 0.6 },
      { ratio: 2.6, amplitude: 0.35 },
      { ratio: 4.1, amplitude: 0.2 },
    ],
  },
  'hp-heal': {
    frequency: 580,
    type: 'sine',
    duration: 0.36,
    volume: 0.25,
    attack: 0.01,
    release: 0.22,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.35 },
      { ratio: 2.5, amplitude: 0.18 },
    ],
  },
  'hp-heal-1': {
    frequency: 720,
    type: 'triangle',
    duration: 0.28,
    volume: 0.24,
    attack: 0.004,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.2, amplitude: 0.35 },
      { ratio: 3.8, amplitude: 0.18 },
    ],
  },
  'hp-heal-2': {
    frequency: 640,
    type: 'sine',
    duration: 0.32,
    volume: 0.23,
    attack: 0.006,
    release: 0.2,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.6, amplitude: 0.4 },
      { ratio: 4.4, amplitude: 0.2 },
    ],
  },
  'hp-down': {
    frequency: 210,
    type: 'triangle',
    duration: 0.6,
    volume: 0.32,
    attack: 0.012,
    release: 0.4,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.6 },
      { ratio: 1.75, amplitude: 0.3 },
    ],
  },
  'sp-gain': {
    frequency: 980,
    type: 'sine',
    duration: 0.24,
    volume: 0.24,
    attack: 0.002,
    release: 0.14,
    partials: [
      { ratio: 1, amplitude: 0.9 },
      { ratio: 2.6, amplitude: 0.55 },
      { ratio: 4.1, amplitude: 0.35 },
      { ratio: 6.3, amplitude: 0.22 },
    ],
  },
  'sp-spend': {
    frequency: 320,
    type: 'square',
    duration: 0.26,
    volume: 0.2,
    attack: 0.004,
    release: 0.14,
    partials: [
      { ratio: 1, amplitude: 0.85 },
      { ratio: 0.5, amplitude: 0.55 },
      { ratio: 1.4, amplitude: 0.25 },
      { ratio: 2.6, amplitude: 0.18 },
    ],
  },
  'sp-empty': {
    frequency: 150,
    type: 'sawtooth',
    duration: 0.52,
    volume: 0.3,
    attack: 0.01,
    release: 0.32,
    partials: [
      { ratio: 1, amplitude: 0.9 },
      { ratio: 0.5, amplitude: 0.6 },
      { ratio: 1.2, amplitude: 0.35 },
      { ratio: 2.4, amplitude: 0.2 },
    ],
  },
  'rest-short': {
    volume: 0.24,
    segments: [
      {
        frequency: 520,
        type: 'square',
        duration: 0.08,
        attack: 0.002,
        release: 0.05,
        partials: [
          { ratio: 1, amplitude: 0.65 },
          { ratio: 1.8, amplitude: 0.4 },
          { ratio: 2.6, amplitude: 0.24 },
        ],
      },
      {
        delay: 0.04,
        frequency: 240,
        type: 'sawtooth',
        duration: 0.28,
        attack: 0.01,
        release: 0.18,
        partials: [
          { ratio: 1, amplitude: 0.55 },
          { ratio: 1.4, amplitude: 0.3 },
          { ratio: 2.2, amplitude: 0.18 },
        ],
      },
    ],
  },
  'rest-long': {
    volume: 0.22,
    segments: [
      {
        frequency: 880,
        type: 'sine',
        duration: 0.5,
        attack: 0.01,
        release: 0.4,
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 2, amplitude: 0.35 },
          { ratio: 3, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.05,
        frequency: 180,
        type: 'triangle',
        duration: 1.15,
        attack: 0.08,
        release: 0.9,
        partials: [
          { ratio: 1, amplitude: 0.55 },
          { ratio: 1.6, amplitude: 0.3 },
          { ratio: 2.4, amplitude: 0.18 },
  'ability-minor': {
    volume: 0.24,
    segments: [
      {
        frequency: 940,
        type: 'triangle',
        duration: 0.07,
        attack: 0.002,
        release: 0.035,
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 1.9, amplitude: 0.4 },
          { ratio: 2.8, amplitude: 0.25 },
        ],
      },
      {
        delay: 0.018,
        frequency: 240,
        type: 'sawtooth',
        duration: 0.14,
        attack: 0.006,
        release: 0.09,
        partials: [
          { ratio: 1, amplitude: 0.75 },
          { ratio: 0.55, amplitude: 0.45 },
          { ratio: 1.6, amplitude: 0.25 },
        ],
      },
    ],
  },
  'ability-major': {
    volume: 0.28,
    segments: [
      {
        frequency: 220,
        type: 'sine',
        duration: 0.18,
        attack: 0.015,
        release: 0.12,
        partials: [
          { ratio: 1, amplitude: 0.6 },
          { ratio: 1.5, amplitude: 0.35 },
          { ratio: 2.2, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.03,
        frequency: 360,
        type: 'triangle',
        duration: 0.22,
        attack: 0.01,
        release: 0.14,
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 1.6, amplitude: 0.4 },
          { ratio: 2.4, amplitude: 0.25 },
        ],
      },
      {
        delay: 0.02,
        frequency: 520,
        type: 'triangle',
        duration: 0.26,
        attack: 0.008,
        release: 0.16,
        partials: [
          { ratio: 1, amplitude: 0.75 },
          { ratio: 1.7, amplitude: 0.45 },
          { ratio: 2.6, amplitude: 0.28 },
        ],
      },
      {
        delay: 0.04,
        frequency: 980,
        type: 'square',
        duration: 0.06,
        attack: 0.002,
        release: 0.03,
        partials: [
          { ratio: 1, amplitude: 0.5 },
          { ratio: 2.4, amplitude: 0.35 },
          { ratio: 3.6, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.018,
        frequency: 1180,
        type: 'square',
        duration: 0.05,
        attack: 0.002,
        release: 0.028,
        partials: [
          { ratio: 1, amplitude: 0.45 },
          { ratio: 2.8, amplitude: 0.3 },
          { ratio: 4.2, amplitude: 0.18 },
        ],
      },
    ],
  },
  heal: {
    frequency: 520,
    type: 'sine',
    duration: 0.62,
    volume: 0.2,
    attack: 0.012,
    release: 0.42,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.4, amplitude: 0.22 },
      { ratio: 3.6, amplitude: 0.12 },
    ],
  },
  damage: {
    frequency: 420,
    type: 'square',
    duration: 0.3,
    volume: 0.32,
    attack: 0.004,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.06, amplitude: 0.88 },
      { ratio: 2.2, amplitude: 0.22 },
    ],
  },
  save: {
    frequency: 420,
    type: 'sawtooth',
    duration: 0.22,
    volume: 0.22,
    attack: 0.004,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 0.9 },
      { ratio: 1.9, amplitude: 0.55 },
      { ratio: 3.7, amplitude: 0.28 },
    ],
  },
  'shard-draw': {
    frequency: 880,
    type: 'sawtooth',
    duration: 0.85,
    volume: 0.22,
    attack: 0.008,
    release: 0.6,
    partials: [
      { ratio: 1, amplitude: 0.9 },
      { ratio: 2.5, amplitude: 0.5 },
      { ratio: 4, amplitude: 0.35 },
      { ratio: 5.5, amplitude: 0.22 },
    ],
  },
  'level-up': {
    volume: 0.28,
    segments: [
      {
        frequency: 260,
        type: 'sawtooth',
        duration: 0.22,
        attack: 0.01,
        release: 0.08,
        partials: [
          { ratio: 0.8, amplitude: 0.5 },
          { ratio: 1.3, amplitude: 0.35 },
          { ratio: 2.1, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.06,
        frequency: 1240,
        type: 'sine',
        duration: 0.3,
        attack: 0.002,
        release: 0.18,
        partials: [
          { ratio: 1, amplitude: 1 },
          { ratio: 2, amplitude: 0.4 },
          { ratio: 3, amplitude: 0.2 },
        ],
      },
      {
        delay: 0.02,
        frequency: 520,
        type: 'triangle',
        duration: 0.18,
        attack: 0.004,
        release: 0.12,
        partials: [
          { ratio: 1, amplitude: 0.7 },
          { ratio: 1.6, amplitude: 0.35 },
        ],
      },
    ],
  },

  success: {
    frequency: 880,
    type: 'sine',
    duration: 0.26,
    volume: 0.2,
    attack: 0.004,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.45 },
      { ratio: 3.2, amplitude: 0.22 },
    ],
  },
  info: {
    frequency: 660,
    type: 'triangle',
    duration: 0.22,
    volume: 0.18,
    attack: 0.004,
    release: 0.11,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.1, amplitude: 0.35 },
      { ratio: 3.4, amplitude: 0.2 },
    ],
  },
  warn: {
    frequency: 420,
    type: 'square',
    duration: 0.24,
    volume: 0.2,
    attack: 0.004,
    release: 0.13,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.6, amplitude: 0.55 },
      { ratio: 2.6, amplitude: 0.24 },
    ],
  },
  error: {
    frequency: 220,
    type: 'sawtooth',
    duration: 0.28,
    volume: 0.22,
    attack: 0.004,
    release: 0.16,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.6 },
      { ratio: 2.4, amplitude: 0.3 },
    ],
  },
};

const AUDIO_CUE_ALIASES = {
  success: 'success',
  'success-alt': 'success',
  positive: 'success',
  info: 'info',
  default: 'info',
  neutral: 'info',
  notice: 'info',
  primary: 'info',
  secondary: 'info',
  tip: 'info',
  warn: 'warn',
  caution: 'warn',
  warning: 'warn',
  alert: 'warn',
  error: 'error',
  negative: 'error',
  danger: 'error',
  critical: 'error',
  'error-critical': 'error',
  failure: 'error',
  fail: 'error',
};

const AUDIO_DEBUG_FLAG = '__CC_AUDIO_DEBUG__';
const audioScope = typeof window !== 'undefined' ? window : null;
const audioGlobal = audioScope || (typeof globalThis !== 'undefined' ? globalThis : null);

let audioContext = null;
const audioCueCache = new Map();
let audioContextPrimed = false;
let audioContextPrimedOnce = false;
let audioContextGestureReady = false;
let audioGestureListenersBound = false;
let audioLifecycleListenersBound = false;

let dedupePending = false;
const dedupedCues = new Set();
const scheduleMicrotask = typeof queueMicrotask === 'function'
  ? queueMicrotask
  : cb => Promise.resolve().then(cb);

function getTimestamp() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function scheduleDedupeReset() {
  if (dedupePending) return;
  dedupePending = true;
  scheduleMicrotask(() => {
    dedupePending = false;
    dedupedCues.clear();
  });
}

function shouldLogAudioDebug() {
  return Boolean(audioGlobal && audioGlobal[AUDIO_DEBUG_FLAG]);
}

function logAudioDebug(payload) {
  if (!shouldLogAudioDebug()) return;
  try {
    console.info('[cc-audio]', payload);
  } catch {
    /* noop */
  }
}

function closeAudioContext(reason = 'pagehide') {
  if (!audioContext || typeof audioContext.close !== 'function') return;
  const ctx = audioContext;
  audioContext = null;
  audioCueCache.clear();
  try {
    ctx.close();
  } catch {
    /* noop */
  }
  logAudioDebug({
    event: 'close',
    reason,
    timestamp: getTimestamp(),
    contextState: ctx.state,
  });
}

function bindAudioLifecycleListeners() {
  if (audioLifecycleListenersBound || !audioScope) return;
  audioLifecycleListenersBound = true;
  audioScope.addEventListener('pagehide', () => closeAudioContext('pagehide'), { once: true });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        closeAudioContext('hidden');
      }
    });
  }
}

function normalizeCueName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  const alias = AUDIO_CUE_ALIASES[lowered] || lowered;
  if (Object.prototype.hasOwnProperty.call(AUDIO_CUE_SETTINGS, alias)) {
    return alias;
  }
  return null;
}

export function resolveCueName(primary, fallbackCue) {
  return normalizeCueName(primary) || normalizeCueName(fallbackCue);
}

function getAudioContextStatus() {
  if (!audioScope) {
    return { ctx: null, supported: false, reason: 'no-window' };
  }
  const Ctx = audioScope.AudioContext || audioScope.webkitAudioContext;
  if (!Ctx) {
    return { ctx: null, supported: false, reason: 'unsupported' };
  }
  if (!audioContext && !audioContextGestureReady) {
    return { ctx: null, supported: true, reason: 'gesture-required' };
  }
  if (!audioContext) {
    try {
      audioContext = new Ctx();
    } catch (error) {
      return { ctx: null, supported: true, reason: 'context-failed', error };
    }
  }
  return { ctx: audioContext, supported: true, reason: 'ok' };
}

function primeAudioContext() {
  if (audioContextPrimedOnce) {
    const status = getAudioContextStatus();
    if (status.ctx) status.ctx.__ccPrimed = true;
    return status.ctx;
  }
  audioContextPrimedOnce = true;
  const status = getAudioContextStatus();
  if (!status.ctx) return null;
  const ctx = status.ctx;
  ctx.__ccPrimed = true;
  try {
    const oscillator = typeof ctx.createOscillator === 'function' ? ctx.createOscillator() : null;
    if (!oscillator) return ctx;
    const gain = typeof ctx.createGain === 'function' ? ctx.createGain() : null;
    if (gain) {
      if (gain.gain) {
        try {
          if (typeof gain.gain.setValueAtTime === 'function') {
            gain.gain.setValueAtTime(0, ctx.currentTime ?? 0);
          } else {
            gain.gain.value = 0;
          }
        } catch {
          gain.gain.value = 0;
        }
      }
      oscillator.connect?.(gain);
      gain.connect?.(ctx.destination);
    } else {
      oscillator.connect?.(ctx.destination);
    }
    const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
    oscillator.start?.(now);
    oscillator.stop?.(now + 0.001);
    oscillator.disconnect?.();
    gain?.disconnect?.();
  } catch {
    /* noop */
  }
  return ctx;
}

export function attachAudioGestureListeners() {
  if (audioGestureListenersBound || !audioScope) return;
  audioGestureListenersBound = true;
  bindAudioLifecycleListeners();
  const onGesture = () => {
    if (audioContextPrimed) return;
    audioContextPrimed = true;
    audioContextGestureReady = true;
    audioScope.removeEventListener('pointerdown', onGesture);
    audioScope.removeEventListener('keydown', onGesture);
    try {
      primeAudioContext();
    } catch {
      /* noop */
    }
  };
  audioScope.addEventListener('pointerdown', onGesture, { once: true, passive: true });
  audioScope.addEventListener('keydown', onGesture, { once: true });
}

function renderWaveSample(type, freq, t) {
  const phase = 2 * Math.PI * freq * t;
  switch (type) {
    case 'square':
      return Math.sign(Math.sin(phase)) || 0;
    case 'triangle':
      return 2 * Math.asin(Math.sin(phase)) / Math.PI;
    case 'sawtooth':
      return 2 * (freq * t - Math.floor(0.5 + freq * t));
    default:
      return Math.sin(phase);
  }
}

function clampNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(numeric, min), max);
}

function buildAudioBuffer(name, ctx) {
  const config = AUDIO_CUE_SETTINGS[name];
  if (!config) return { buffer: null, reason: 'missing-cue' };
  const duration = clampNumber(config.duration, 0.4, 0.001, 8);
  const frequency = clampNumber(config.frequency, 440, 20, 20000);
  const type = typeof config.type === 'string' ? config.type : 'sine';
  const volume = clampNumber(config.volume, 0.2, 0, 1);
  const attack = clampNumber(config.attack, 0.01, 0, duration);
  const release = clampNumber(config.release, 0.1, 0, duration);
  const partials = Array.isArray(config.partials) ? config.partials : null;
  const segments = Array.isArray(config.segments) ? config.segments : null;

  const sampleRate = ctx.sampleRate;
  const hasSegments = Array.isArray(segments) && segments.length > 0;
  const totalDuration = hasSegments
    ? segments.reduce((sum, segment) => sum + clampNumber(segment.delay ?? 0, 0, 0, 4) + clampNumber(segment.duration ?? duration, duration, 0.001, 8), 0)
    : duration;
  const totalSamples = Math.max(1, Math.floor(sampleRate * totalDuration));
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  const renderSegment = (segment, startSample) => {
    const segmentDuration = clampNumber(segment.duration ?? duration, duration, 0.001, 8);
    const segmentFrequency = clampNumber(segment.frequency ?? frequency, frequency, 20, 20000);
    const segmentType = typeof segment.type === 'string' ? segment.type : type;
    const segmentVolume = clampNumber(segment.volume ?? volume, volume, 0, 1);
    const segmentAttack = clampNumber(segment.attack ?? attack, attack, 0, segmentDuration);
    const segmentRelease = clampNumber(segment.release ?? release, release, 0, segmentDuration);
    const segmentPartials = Array.isArray(segment.partials) ? segment.partials : partials;
    const voices = (segmentPartials && segmentPartials.length)
      ? segmentPartials
      : [{ ratio: 1, amplitude: 1 }];
    const normalization = voices.reduce((sum, part) => sum + Math.abs(part.amplitude ?? 1), 0) || 1;
    const segmentSamples = Math.max(1, Math.floor(sampleRate * segmentDuration));

    for (let i = 0; i < segmentSamples; i += 1) {
      const t = i / sampleRate;
      let envelope = 1;
      if (segmentAttack > 0 && t < segmentAttack) {
        envelope = t / segmentAttack;
      } else if (segmentRelease > 0 && t > segmentDuration - segmentRelease) {
        envelope = Math.max((segmentDuration - t) / segmentRelease, 0);
      }
      let sample = 0;
      for (const part of voices) {
        const ratio = clampNumber(part.ratio, 1, 0.1, 20);
        const amplitude = clampNumber(part.amplitude, 1, 0, 1);
        sample += amplitude * renderWaveSample(segmentType, segmentFrequency * ratio, t);
      }
      const idx = startSample + i;
      if (idx >= data.length) break;
      data[idx] += (sample / normalization) * envelope * segmentVolume;
    }
    return segmentSamples;
  };

  if (hasSegments) {
    let offsetSamples = 0;
    for (const segment of segments) {
      const delay = clampNumber(segment.delay ?? 0, 0, 0, 4);
      if (delay > 0) {
        offsetSamples += Math.floor(sampleRate * delay);
      }
      offsetSamples += renderSegment(segment, offsetSamples);
    }
  } else {
    renderSegment({ duration, frequency, type, volume, attack, release, partials }, 0);
  }

  audioCueCache.set(name, buffer);
  return { buffer, reason: 'ok' };
}

function makeResult({
  status,
  reason,
  cue,
  requestedCue,
  fallbackCue,
  contextState,
  gestureReady,
  muted,
  volume,
  timestamp,
  error,
  source,
}) {
  const payload = {
    ok: status === 'played',
    status,
    reason,
    cue,
    requestedCue,
    fallbackCue,
    contextState,
    gestureReady,
    muted,
    volume,
    timestamp,
    source,
  };
  if (error) {
    payload.error = String(error?.message || error);
  }
  logAudioDebug(payload);
  return payload;
}

export function playCue(name, opts = {}) {
  const timestamp = getTimestamp();
  const fallbackCue = opts.fallbackCue;
  const source = opts.source || 'cue';
  const muted = Boolean(opts.muted);
  const volumeOverride = typeof opts.volume === 'number' && Number.isFinite(opts.volume)
    ? clampNumber(opts.volume, 0.2, 0, 1)
    : null;
  const resolvedName = resolveCueName(name, fallbackCue);
  const requestedCue = typeof name === 'string' ? name.trim() : name;

  if (!resolvedName) {
    return makeResult({
      status: 'missing-cue',
      reason: 'missing-cue',
      cue: null,
      requestedCue,
      fallbackCue,
      contextState: audioContext?.state || 'none',
      gestureReady: audioContextGestureReady,
      muted,
      volume: volumeOverride,
      timestamp,
      source,
    });
  }

  scheduleDedupeReset();
  if (dedupedCues.has(resolvedName)) {
    return makeResult({
      status: 'deduped',
      reason: 'deduped',
      cue: resolvedName,
      requestedCue,
      fallbackCue,
      contextState: audioContext?.state || 'none',
      gestureReady: audioContextGestureReady,
      muted,
      volume: volumeOverride,
      timestamp,
      source,
    });
  }
  dedupedCues.add(resolvedName);

  if (muted) {
    return makeResult({
      status: 'muted',
      reason: 'muted',
      cue: resolvedName,
      requestedCue,
      fallbackCue,
      contextState: audioContext?.state || 'none',
      gestureReady: audioContextGestureReady,
      muted,
      volume: volumeOverride,
      timestamp,
      source,
    });
  }

  const status = getAudioContextStatus();
  if (!status.supported) {
    return makeResult({
      status: 'unsupported',
      reason: status.reason,
      cue: resolvedName,
      requestedCue,
      fallbackCue,
      contextState: 'unsupported',
      gestureReady: audioContextGestureReady,
      muted,
      volume: volumeOverride,
      timestamp,
      source,
    });
  }
  if (!status.ctx) {
    return makeResult({
      status: 'not-ready',
      reason: status.reason || 'not-ready',
      cue: resolvedName,
      requestedCue,
      fallbackCue,
      contextState: audioContext?.state || 'none',
      gestureReady: audioContextGestureReady,
      muted,
      volume: volumeOverride,
      timestamp,
      source,
    });
  }
  const ctx = status.ctx;
  if (ctx.state === 'suspended') {
    if (!audioContextGestureReady) {
      return makeResult({
        status: 'not-ready',
        reason: 'gesture-required',
        cue: resolvedName,
        requestedCue,
        fallbackCue,
        contextState: ctx.state,
        gestureReady: audioContextGestureReady,
        muted,
        volume: volumeOverride,
        timestamp,
        source,
      });
    }
    try {
      ctx.resume?.();
    } catch (error) {
      return makeResult({
        status: 'resume-failed',
        reason: 'resume-failed',
        cue: resolvedName,
        requestedCue,
        fallbackCue,
        contextState: ctx.state,
        gestureReady: audioContextGestureReady,
        muted,
        volume: volumeOverride,
        timestamp,
        source,
        error,
      });
    }
  }

  let buffer = audioCueCache.get(resolvedName) || null;
  if (!buffer) {
    const built = buildAudioBuffer(resolvedName, ctx);
    buffer = built.buffer;
    if (!buffer) {
      return makeResult({
        status: 'missing-cue',
        reason: built.reason || 'missing-cue',
        cue: resolvedName,
        requestedCue,
        fallbackCue,
        contextState: ctx.state,
        gestureReady: audioContextGestureReady,
        muted,
        volume: volumeOverride,
        timestamp,
        source,
      });
    }
  }

  try {
    const sourceNode = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const cueConfig = AUDIO_CUE_SETTINGS[resolvedName];
    const cueVolume = volumeOverride ?? clampNumber(cueConfig?.volume, 0.2, 0, 1);
    gainNode.gain.value = cueVolume;
    sourceNode.buffer = buffer;
    sourceNode.connect(gainNode).connect(ctx.destination);
    sourceNode.start();
  } catch (error) {
    return makeResult({
      status: 'error',
      reason: 'playback-error',
      cue: resolvedName,
      requestedCue,
      fallbackCue,
      contextState: ctx.state,
      gestureReady: audioContextGestureReady,
      muted,
      volume: volumeOverride,
      timestamp,
      source,
      error,
    });
  }

  return makeResult({
    status: 'played',
    reason: 'played',
    cue: resolvedName,
    requestedCue,
    fallbackCue,
    contextState: ctx.state,
    gestureReady: audioContextGestureReady,
    muted,
    volume: volumeOverride,
    timestamp,
    source,
  });
}

export function playTone(type, opts = {}) {
  return playCue(type, { ...opts, source: opts.source || 'tone' });
}

if (audioGlobal) {
  audioGlobal.ccPlayCue = playCue;
  audioGlobal.playCue = playCue;
  audioGlobal.playTone = playTone;
}
