/* ========= helpers ========= */
import { $, qs, qsa, num, mod, calculateArmorBonus, revertAbilityScore } from './helpers.js';
import { ensureDiceResultRenderer } from './dice-result.js';
import { setupFactionRepTracker, ACTION_HINTS, updateFactionRep, migratePublicOpinionSnapshot } from './faction.js';
import {
  currentCharacter,
  setCurrentCharacter,
  listCharacters,
  loadCharacter,
  loadBackup,
  listBackups,
  deleteCharacter,
  saveCharacter,
  renameCharacter,
  listRecoverableCharacters,
  saveAutoBackup,
} from './characters.js';
import { show, hide } from './modal.js';
import {
  formatKnobValue as formatMiniGameKnobValue,
  getMiniGame as getMiniGameDefinition,
  subscribePlayerDeployments,
  updateDeployment as updateMiniGameDeployment,
} from './mini-games.js';
import {
  getDmCatalogState,
  setServerDmCatalogPayloads,
  subscribeDmCatalog,
} from './dm-catalog-sync.js';
import {
  cacheCloudSaves,
  subscribeCloudSaves,
  appendCampaignLogEntry,
  deleteCampaignLogEntry,
  fetchCampaignLogEntries,
  subscribeCampaignLog,
  subscribeSyncStatus,
  getLastSyncStatus,
  beginQueuedSyncFlush,
  getQueuedCloudSaves,
  clearQueuedCloudSaves,
  subscribeSyncErrors,
  subscribeSyncActivity,
  subscribeSyncQueue,
  getLastSyncActivity,
} from './storage.js';
import { hasPin, setPin, verifyPin as verifyStoredPin, clearPin, syncPin } from './pin.js';
import {
  buildPriceIndex,
  decodeCatalogBuffer,
  extractPriceValue,
  normalizeCatalogRow,
  normalizeCatalogToken,
  normalizePriceRow,
  parseCsv,
  sanitizeNormalizedCatalogEntry,
  sortCatalogRows,
  splitValueOptions,
  tierRank,
} from './catalog-utils.js';

const POWER_STYLES = [
  'Physical Powerhouse',
  'Energy Manipulator',
  'Speedster',
  'Telekinetic/Psychic',
  'Illusionist',
  'Shape-shifter',
  'Elemental Controller',
];

const POWER_ACTION_TYPES = ['Action', 'Bonus', 'Reaction', 'Out-of-Combat'];
const POWER_TARGET_SHAPES = ['Melee', 'Ranged Single', 'Cone', 'Line', 'Radius', 'Self', 'Aura'];
const POWER_EFFECT_TAGS = [
  'Damage',
  'Stun',
  'Blind',
  'Weaken',
  'Push/Pull',
  'Burn',
  'Freeze',
  'Slow',
  'Charm',
  'Shield',
  'Heal',
  'Teleport/Phase',
  'Summon/Clone',
  'Terrain',
  'Dispel/Nullify',
];
const POWER_INTENSITIES = ['Minor', 'Core', 'AoE', 'Control', 'Ultimate'];
const POWER_SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const POWER_DURATIONS = [
  'Instant',
  'End of Target’s Next Turn',
  '1 Round',
  'Sustained',
  'Scene',
  'Session',
];
const POWER_USES = ['At-will', 'Per Encounter', 'Per Session', 'Cooldown'];
const POWER_ON_SAVE_OPTIONS = ['Full', 'Half', 'Negate'];
const POWER_DAMAGE_TYPES = [
  'Kinetic',
  'Fire',
  'Cold',
  'Lightning',
  'Psychic',
  'Force',
  'Radiant',
  'Necrotic',
  'Acid',
];
const POWER_SCALING_OPTIONS = ['Static', 'Level-based', 'Ability-based'];
const POWER_DAMAGE_DICE = ['1d6', '2d6', '3d6', '4d6', '5d6', '6d6'];

const POWER_RANGE_QUICK_VALUES = [
  'Melee',
  '10 ft',
  '30 ft',
  '60 ft',
  '90 ft',
  '120 ft',
  'Unlimited (narrative)',
];

function isDmSessionActive() {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('dmLoggedIn') === '1';
  } catch {
    return false;
  }
}

const POWER_STYLE_CASTER_SAVE_DEFAULTS = {
  'Physical Powerhouse': ['STR'],
  'Energy Manipulator': ['INT', 'CON'],
  Speedster: ['DEX'],
  'Telekinetic/Psychic': ['WIS', 'INT'],
  Illusionist: ['CHA'],
  'Shape-shifter': ['CON', 'DEX'],
  'Elemental Controller': ['WIS', 'CON'],
};

const POWER_STYLE_ATTACK_DEFAULTS = {
  'Physical Powerhouse': 'str',
  'Energy Manipulator': 'int',
  Speedster: 'dex',
  'Telekinetic/Psychic': 'wis',
  Illusionist: 'cha',
  'Shape-shifter': 'con',
  'Elemental Controller': 'wis',
};

const POWER_RANGE_UNITS = ['feet', 'narrative'];
const POWER_SUGGESTION_STRENGTHS = ['off', 'conservative', 'assertive'];

const POWER_SHAPE_RANGES = {
  Melee: ['Melee'],
  Cone: ['15 ft', '30 ft', '60 ft'],
  Line: ['30 ft', '60 ft', '120 ft'],
  Radius: ['10 ft', '15 ft', '20 ft', '30 ft'],
  Self: ['Self', '5 ft', '10 ft', '15 ft', '20 ft'],
  Aura: ['Self', '5 ft', '10 ft', '15 ft', '20 ft'],
  'Ranged Single': ['10 ft', '30 ft', '60 ft', '90 ft', '120 ft', 'Unlimited (narrative)'],
};

const EFFECT_SAVE_SUGGESTIONS = {
  Stun: ['WIS'],
  Charm: ['WIS'],
  Blind: ['CON', 'WIS'],
  Weaken: ['CON', 'WIS'],
  'Push/Pull': ['STR', 'DEX'],
  Burn: ['DEX', 'CON'],
  Freeze: ['DEX', 'CON'],
  Slow: ['DEX', 'CON'],
  Illusion: ['WIS'],
  Fear: ['WIS'],
};

const EFFECT_ON_SAVE_SUGGESTIONS = {
  Damage: 'Half',
  Stun: 'Negate',
  Charm: 'Negate',
  Blind: 'Negate',
  Weaken: 'Half',
  'Push/Pull': 'Negate',
  Burn: 'Half',
  Freeze: 'Half',
  Slow: 'Half',
  Illusion: 'Negate',
};

const LEGACY_EFFECT_KEYWORDS = [
  { tag: 'Damage', patterns: [/damage/i, /blast/i, /strike/i, /hit/i] },
  { tag: 'Stun', patterns: [/stun/i, /daze/i, /paraly/i] },
  { tag: 'Blind', patterns: [/blind/i, /dazzle/i] },
  { tag: 'Weaken', patterns: [/weaken/i, /sap/i, /drain/i, /suppress/i] },
  { tag: 'Push/Pull', patterns: [/push/i, /pull/i, /knock/i, /shove/i] },
  { tag: 'Burn', patterns: [/burn/i, /ignite/i, /flame/i, /scorch/i] },
  { tag: 'Freeze', patterns: [/freeze/i, /frost/i, /ice/i, /chill/i] },
  { tag: 'Slow', patterns: [/slow/i, /hamper/i, /quicken/i] },
  { tag: 'Charm', patterns: [/charm/i, /entranc/i, /persuad/i, /fear/i] },
  { tag: 'Shield', patterns: [/shield/i, /ward/i, /barrier/i, /deflect/i] },
  { tag: 'Heal', patterns: [/heal/i, /restore/i, /regenerat/i, /mend/i] },
  { tag: 'Teleport/Phase', patterns: [/teleport/i, /blink/i, /phase/i, /step/i] },
  { tag: 'Summon/Clone', patterns: [/summon/i, /clone/i, /duplicate/i, /decoy/i] },
  { tag: 'Terrain', patterns: [/terrain/i, /field/i, /zone/i, /wall/i, /cage/i] },
  { tag: 'Dispel/Nullify', patterns: [/dispel/i, /nullify/i, /counter/i, /negate/i] },
];

const POWER_PRESETS = [
  {
    id: 'powerhouse-smash',
    label: 'Powerhouse: Smash',
    data: {
      name: 'Smash',
      style: 'Physical Powerhouse',
      actionType: 'Action',
      shape: 'Melee',
      range: 'Melee',
      effectTag: 'Damage',
      intensity: 'Minor',
      spCost: 1,
      damage: { dice: '2d6', type: 'Kinetic', onSave: 'Full' },
      duration: 'Instant',
      description: 'A crushing melee blow that rattles armor and sends foes reeling.',
    },
  },
  {
    id: 'powerhouse-shockwave',
    label: 'Powerhouse: Shockwave',
    data: {
      name: 'Shockwave',
      style: 'Physical Powerhouse',
      actionType: 'Action',
      shape: 'Cone',
      range: '15 ft',
      effectTag: 'Weaken',
      intensity: 'AoE',
      spCost: 3,
      requiresSave: true,
      saveAbilityTarget: 'STR',
      duration: '1 Round',
      description: 'You slam the ground with a seismic stomp, rattling foes in a close cone.',
    },
  },
  {
    id: 'energy-arc-lance',
    label: 'Energy Manipulator: Arc Lance',
    data: {
      name: 'Arc Lance',
      style: 'Energy Manipulator',
      actionType: 'Action',
      shape: 'Line',
      range: '60 ft',
      effectTag: 'Damage',
      intensity: 'AoE',
      spCost: 3,
      requiresSave: true,
      saveAbilityTarget: 'DEX',
      duration: 'Instant',
      damage: { dice: '3d6', type: 'Lightning', onSave: 'Half' },
      description: 'A cutting beam of charged plasma lashes through a single line.',
    },
  },
  {
    id: 'energy-overload-field',
    label: 'Energy Manipulator: Overload Field',
    data: {
      name: 'Overload Field',
      style: 'Energy Manipulator',
      actionType: 'Action',
      shape: 'Radius',
      range: '10 ft',
      effectTag: 'Dispel/Nullify',
      intensity: 'Control',
      spCost: 4,
      requiresSave: true,
      saveAbilityTarget: 'WIS',
      duration: '1 Round',
      description: 'A pulsing null-field strips active powers and boons from everything in reach.',
      special: 'On a failed save, suppress ongoing buffs and barriers until the end of your next turn.',
    },
  },
  {
    id: 'speedster-afterimage',
    label: 'Speedster: Afterimage Feint',
    data: {
      name: 'Afterimage Feint',
      style: 'Speedster',
      actionType: 'Bonus',
      shape: 'Aura',
      range: '5 ft',
      effectTag: 'Weaken',
      intensity: 'Core',
      spCost: 2,
      duration: '1 Round',
      description: 'You blur into afterimages, disorienting nearby foes with dizzying speed.',
    },
  },
  {
    id: 'speedster-time-skip',
    label: 'Speedster: Time Skip',
    data: {
      name: 'Time Skip',
      style: 'Speedster',
      actionType: 'Bonus',
      shape: 'Self',
      range: 'Self',
      effectTag: 'Teleport/Phase',
      intensity: 'Core',
      spCost: 2,
      duration: 'Instant',
      description: 'You step a heartbeat out of sync, reappearing exactly where you intend a moment later.',
    },
  },
  {
    id: 'psychic-mind-spike',
    label: 'Telekinetic/Psychic: Mind Spike',
    data: {
      name: 'Mind Spike',
      style: 'Telekinetic/Psychic',
      actionType: 'Action',
      shape: 'Ranged Single',
      range: '60 ft',
      effectTag: 'Damage',
      intensity: 'Core',
      spCost: 2,
      requiresSave: true,
      saveAbilityTarget: 'WIS',
      duration: 'Instant',
      damage: { dice: '2d6', type: 'Psychic', onSave: 'Half' },
      description: 'A needle of psionic force tears through a foe’s mind.',
    },
  },
  {
    id: 'psychic-force-cage',
    label: 'Telekinetic/Psychic: Force Cage',
    data: {
      name: 'Force Cage',
      style: 'Telekinetic/Psychic',
      actionType: 'Action',
      shape: 'Radius',
      range: '10 ft',
      effectTag: 'Stun',
      secondaryTag: 'Weaken',
      intensity: 'Control',
      spCost: 4,
      requiresSave: true,
      saveAbilityTarget: 'WIS',
      duration: '1 Round',
      description: 'A shimmering cage of kinetic force slams down, pinning foes inside.',
      special: 'Creatures that fail are restrained and cannot leave the cage until the effect ends.',
    },
  },
  {
    id: 'illusionist-phantom-bind',
    label: 'Illusionist: Phantom Bind',
    data: {
      name: 'Phantom Bind',
      style: 'Illusionist',
      actionType: 'Action',
      shape: 'Ranged Single',
      range: '60 ft',
      effectTag: 'Stun',
      intensity: 'Control',
      spCost: 4,
      requiresSave: true,
      saveAbilityTarget: 'WIS',
      duration: 'End of Target’s Next Turn',
      description: 'Psychic chains of light bind your foe in a web of hallucinations.',
      special: 'On a success the target shrugs off the illusion completely.',
    },
  },
  {
    id: 'illusionist-mirror-step',
    label: 'Illusionist: Mirror Step',
    data: {
      name: 'Mirror Step',
      style: 'Illusionist',
      actionType: 'Bonus',
      shape: 'Self',
      range: 'Self',
      effectTag: 'Teleport/Phase',
      intensity: 'Core',
      spCost: 2,
      duration: 'Instant',
      description: 'You disappear into a shimmer of light and reappear from a different angle.',
    },
  },
  {
    id: 'shapeshifter-bone-spear',
    label: 'Shape-shifter: Bone Spear',
    data: {
      name: 'Bone Spear',
      style: 'Shape-shifter',
      actionType: 'Action',
      shape: 'Ranged Single',
      range: '60 ft',
      effectTag: 'Damage',
      intensity: 'Core',
      spCost: 2,
      requiresSave: true,
      saveAbilityTarget: 'DEX',
      duration: 'Instant',
      damage: { dice: '2d6', type: 'Kinetic', onSave: 'Half' },
      description: 'You harden your form into a razor spear and hurl it at distant prey.',
    },
  },
  {
    id: 'shapeshifter-shedskin',
    label: 'Shape-shifter: Shedskin Decoy',
    data: {
      name: 'Shedskin Decoy',
      style: 'Shape-shifter',
      actionType: 'Reaction',
      shape: 'Self',
      range: 'Self',
      effectTag: 'Summon/Clone',
      intensity: 'Control',
      spCost: 4,
      duration: '1 Round',
      description: 'You leave a reactive duplicate behind while you slip out of harm’s way.',
      special: 'Swap positions with the decoy as part of the reaction.',
    },
  },
  {
    id: 'elemental-flame-burst',
    label: 'Elemental: Flame Burst',
    data: {
      name: 'Flame Burst',
      style: 'Elemental Controller',
      actionType: 'Action',
      shape: 'Cone',
      range: '15 ft',
      effectTag: 'Damage',
      intensity: 'AoE',
      spCost: 3,
      requiresSave: true,
      saveAbilityTarget: 'DEX',
      duration: 'Instant',
      damage: { dice: '3d6', type: 'Fire', onSave: 'Half' },
      secondaryTag: 'Burn',
      description: 'An explosive gout of elemental fire engulfs everything in front of you.',
    },
  },
  {
    id: 'elemental-frost-lock',
    label: 'Elemental: Frost Lock',
    data: {
      name: 'Frost Lock',
      style: 'Elemental Controller',
      actionType: 'Action',
      shape: 'Ranged Single',
      range: '60 ft',
      effectTag: 'Freeze',
      secondaryTag: 'Slow',
      intensity: 'Control',
      spCost: 4,
      requiresSave: true,
      saveAbilityTarget: 'CON',
      duration: '1 Round',
      description: 'Icy chains freeze a target in place, chilling their limbs to a crawl.',
    },
  },
];

function suggestSpCost(intensity) {
  switch (intensity) {
    case 'Minor':
      return 1;
    case 'Core':
      return 2;
    case 'AoE':
      return 3;
    case 'Control':
      return 4;
    default:
      return 5;
  }
}

function computeSaveDc(settings) {
  if (!settings) return 10;
  const { casterSaveAbility, dcFormula, proficiencyBonus = 0, abilityMods = {} } = settings;
  const modValue = abilityMods?.[casterSaveAbility] ?? 0;
  if (dcFormula === 'Simple') {
    return 10 + modValue;
  }
  return 8 + modValue + proficiencyBonus;
}

function defaultDamageType(style) {
  switch (style) {
    case 'Energy Manipulator':
      return 'Lightning';
    case 'Elemental Controller':
      return 'Fire';
    case 'Telekinetic/Psychic':
      return 'Force';
    case 'Physical Powerhouse':
      return 'Kinetic';
    case 'Speedster':
      return 'Kinetic';
    case 'Shape-shifter':
      return 'Kinetic';
    default:
      return null;
  }
}

function getCasterAbilitySuggestions(primaryStyle, secondaryStyle) {
  const normalizeStyle = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed || /^none$/i.test(trimmed)) return '';
    return trimmed;
  };
  const primary = normalizeStyle(primaryStyle);
  const secondary = normalizeStyle(secondaryStyle);
  const suggestions = [];
  if (primary && POWER_STYLE_CASTER_SAVE_DEFAULTS[primary]) {
    suggestions.push(...POWER_STYLE_CASTER_SAVE_DEFAULTS[primary]);
  }
  if (!suggestions.length && secondary && POWER_STYLE_CASTER_SAVE_DEFAULTS[secondary]) {
    suggestions.push(...POWER_STYLE_CASTER_SAVE_DEFAULTS[secondary]);
  }
  if (!suggestions.length) suggestions.push('WIS');
  const unique = Array.from(new Set(suggestions.map(value => value.toUpperCase())));
  return unique.length ? unique : ['WIS'];
}
// Global CC object for cross-module state
window.CC = window.CC || {};
CC.partials = CC.partials || {};
CC.savePartial = (k, d) => { CC.partials[k] = d; };
CC.loadPartial = k => CC.partials[k];

const PRIORITY_ALERT_TITLE = 'O.M.N.I: Priority Transmission';
setupPriorityTransmissionAlert();

function setupPriorityTransmissionAlert(){
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('app-alert');
  const messageNode = overlay?.querySelector('[data-app-alert-message]');
  const titleNode = overlay?.querySelector('.app-alert__title');
  const dismissButton = overlay?.querySelector('[data-app-alert-dismiss]');
  const card = overlay?.querySelector('.app-alert__card');
  if (!overlay || !messageNode || !dismissButton) return;

  if (titleNode) {
    titleNode.textContent = PRIORITY_ALERT_TITLE;
  }

  let isVisible = false;
  let resolveCurrent = null;
  let previouslyFocused = null;

  const finalize = () => {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.removeEventListener('transitionend', finalize);
    overlay.removeEventListener('transitioncancel', finalize);
    if (typeof resolveCurrent === 'function') {
      resolveCurrent();
      resolveCurrent = null;
    }
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus({ preventScroll: true });
      } catch {
        try { previouslyFocused.focus(); } catch { /* ignore focus errors */ }
      }
    }
    previouslyFocused = null;
  };

  const hide = () => {
    if (!isVisible) return;
    isVisible = false;
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body?.classList?.remove('app-alert-active');

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion && typeof window?.getComputedStyle === 'function') {
      const styles = window.getComputedStyle(overlay);
      const transitionDuration = parseFloat(styles.transitionDuration || '0');
      const transitionDelay = parseFloat(styles.transitionDelay || '0');
      const total = (Number.isFinite(transitionDuration) ? transitionDuration : 0) +
        (Number.isFinite(transitionDelay) ? transitionDelay : 0);
      if (total > 0) {
        overlay.addEventListener('transitionend', finalize, { once: true });
        overlay.addEventListener('transitioncancel', finalize, { once: true });
        return;
      }
    }

    finalize();
  };

  const show = message => {
    if (typeof resolveCurrent === 'function') {
      resolveCurrent();
      resolveCurrent = null;
    }

    const text = message == null ? '' : String(message);
    messageNode.textContent = text;
    const activeElement = document.activeElement;
    previouslyFocused =
      activeElement && typeof activeElement.focus === 'function' ? activeElement : null;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('is-visible');
    document.body?.classList?.add('app-alert-active');
    isVisible = true;

    const focusTarget = dismissButton || card;
    window.requestAnimationFrame(() => {
      try {
        focusTarget?.focus({ preventScroll: true });
      } catch {
        try { focusTarget?.focus(); } catch { /* ignore focus errors */ }
      }
    });

    return new Promise(resolve => {
      resolveCurrent = resolve;
    });
  };

  const handleOverlayClick = event => {
    if (!isVisible) return;
    if (event.target === overlay) {
      event.preventDefault();
      hide();
    }
  };

  const handleKeydown = event => {
    if (!isVisible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      try {
        dismissButton?.focus({ preventScroll: true });
      } catch {
        try { dismissButton?.focus(); } catch { /* ignore focus errors */ }
      }
    }
  };

  dismissButton.addEventListener('click', event => {
    event.preventDefault();
    hide();
  });
  overlay.addEventListener('click', handleOverlayClick);
  overlay.addEventListener('keydown', handleKeydown);

  window.showPriorityTransmissionAlert = message => show(message);
  window.dismissPriorityTransmissionAlert = hide;
  window.alert = function priorityTransmissionAlert(message) {
    show(message);
    return undefined;
  };
}

/* ========= Mini-Game Player Sync ========= */
const MINI_GAME_PLAYER_CHECK_INTERVAL_MS = 10000;
const miniGameInviteOverlay = typeof document !== 'undefined' ? $('mini-game-invite') : null;
const miniGameInviteTitle = typeof document !== 'undefined' ? $('mini-game-invite-title') : null;
const miniGameInviteMessage = typeof document !== 'undefined' ? $('mini-game-invite-message') : null;
const miniGameInviteGame = typeof document !== 'undefined' ? $('mini-game-invite-game') : null;
const miniGameInviteTagline = typeof document !== 'undefined' ? $('mini-game-invite-tagline') : null;
const miniGameInviteSummary = typeof document !== 'undefined' ? $('mini-game-invite-summary') : null;
const miniGameInviteNotes = typeof document !== 'undefined' ? $('mini-game-invite-notes') : null;
const miniGameInviteNotesText = typeof document !== 'undefined' ? $('mini-game-invite-notes-text') : null;
const miniGameInviteAccept = typeof document !== 'undefined' ? $('mini-game-invite-accept') : null;
const miniGameInviteDecline = typeof document !== 'undefined' ? $('mini-game-invite-decline') : null;
const MINI_GAME_STORAGE_KEY_PREFIX = 'cc:mini-game:deployment:';
const MINI_GAME_LAST_DEPLOYMENT_KEY = 'cc:mini-game:last-deployment';
const hasMiniGameInviteUi = Boolean(miniGameInviteOverlay && miniGameInviteAccept && miniGameInviteDecline);
let miniGameActivePlayer = '';
let miniGameUnsubscribe = null;
let miniGamePlayerCheckTimer = null;
const miniGameKnownDeployments = new Map();
const miniGamePromptedDeployments = new Set();
const miniGameInviteQueue = [];
let miniGameActiveInvite = null;
let miniGameSyncInitialized = false;

function sanitizeMiniGamePlayerName(name = '') {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const lowered = trimmed.toLowerCase();
  if (lowered === 'the dm' || lowered === 'dm') return '';
  return trimmed;
}

function miniGameTimestamp(entry) {
  if (!entry || typeof entry !== 'object') return 0;
  if (typeof entry.createdAt === 'number') return entry.createdAt;
  if (typeof entry.updatedAt === 'number') return entry.updatedAt;
  return 0;
}

function resolveMiniGamePlayerName() {
  try {
    const current = sanitizeMiniGamePlayerName(typeof currentCharacter === 'function' ? currentCharacter() : '');
    if (current) return current;
  } catch {}
  if (typeof document !== 'undefined') {
    const heroField = document.getElementById('superhero');
    if (heroField && typeof heroField.value === 'string') {
      const normalized = sanitizeMiniGamePlayerName(heroField.value);
      if (normalized) return normalized;
    }
  }
  try {
    const stored = localStorage.getItem('last-save');
    const normalized = sanitizeMiniGamePlayerName(stored || '');
    if (normalized) return normalized;
  } catch {}
  return '';
}

function removeMiniGameQueueEntry(id) {
  if (!id || !miniGameInviteQueue.length) return;
  for (let i = miniGameInviteQueue.length - 1; i >= 0; i--) {
    if (miniGameInviteQueue[i]?.id === id) {
      miniGameInviteQueue.splice(i, 1);
    }
  }
}

function resetMiniGameInvites() {
  miniGameKnownDeployments.clear();
  miniGamePromptedDeployments.clear();
  miniGameInviteQueue.length = 0;
  miniGameActiveInvite = null;
  if (hasMiniGameInviteUi) {
    hide('mini-game-invite');
  }
}

function applyMiniGamePlayerName(name) {
  if (!hasMiniGameInviteUi) return;
  const normalized = sanitizeMiniGamePlayerName(name);
  if (normalized === miniGameActivePlayer) return;
  if (typeof miniGameUnsubscribe === 'function') {
    try { miniGameUnsubscribe(); } catch {}
    miniGameUnsubscribe = null;
  }
  miniGameActivePlayer = normalized;
  resetMiniGameInvites();
  if (!normalized) return;
  try {
    miniGameUnsubscribe = subscribePlayerDeployments(normalized, handleMiniGameDeployments);
  } catch (err) {
    console.error('Failed to subscribe to mini-game deployments', err);
  }
}

function syncMiniGamePlayerName() {
  applyMiniGamePlayerName(resolveMiniGamePlayerName());
}

function buildMiniGameConfigEntries(entry, game) {
  const configEntries = [];
  if (!entry || !game || !Array.isArray(game.knobs)) return configEntries;
  const config = entry.config || {};
  game.knobs.forEach(knob => {
    if (!Object.prototype.hasOwnProperty.call(config, knob.key)) return;
    if (knob.playerFacing !== true) return;
    const value = formatMiniGameKnobValue(knob, config[knob.key]);
    const label = knob.playerLabel || knob.label;
    const formatted = typeof knob.playerFormat === 'function'
      ? knob.playerFormat(config[knob.key], config)
      : value;
    configEntries.push({ label, value: formatted });
  });
  return configEntries;
}

function renderMiniGameSummary(entry, game) {
  if (!miniGameInviteSummary) return;
  miniGameInviteSummary.innerHTML = '';
  const entries = buildMiniGameConfigEntries(entry, game);
  if (entries.length) {
    const list = document.createElement('ul');
    entries.forEach(({ label, value }) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      const span = document.createElement('span');
      span.textContent = value;
      li.appendChild(strong);
      li.appendChild(span);
      list.appendChild(li);
    });
    miniGameInviteSummary.appendChild(list);
    return;
  }
  const summary = typeof entry?.playerSummary === 'string' ? entry.playerSummary.trim() : '';
  if (summary) {
    miniGameInviteSummary.textContent = summary;
    return;
  }
  miniGameInviteSummary.textContent = 'Your DM already prepared this mission. Review the briefing below and tap “Start Mission” when you are ready.';
}

function renderMiniGameNotes(entry) {
  if (!miniGameInviteNotes || !miniGameInviteNotesText) return;
  const notes = typeof entry?.notes === 'string' ? entry.notes.trim() : '';
  if (notes) {
    miniGameInviteNotesText.textContent = notes;
    miniGameInviteNotes.hidden = false;
  } else {
    miniGameInviteNotes.hidden = true;
    miniGameInviteNotesText.textContent = '';
  }
}

function populateMiniGameInvite(entry) {
  if (!hasMiniGameInviteUi || !entry) return;
  const issuer = entry.issuedBy || 'DM';
  if (miniGameInviteTitle) {
    miniGameInviteTitle.textContent = 'Incoming Mission';
  }
  if (miniGameInviteMessage) {
    miniGameInviteMessage.textContent = `${issuer} just sent you a mission. Tap “Start Mission” to jump in or “Not Now” if you need a moment.`;
  }
  const game = getMiniGameDefinition(entry.gameId);
  const gameName = entry.gameName || game?.name || 'Mini-game';
  if (miniGameInviteGame) miniGameInviteGame.textContent = gameName;
  const tagline = entry.tagline || game?.tagline || '';
  if (miniGameInviteTagline) {
    miniGameInviteTagline.textContent = tagline;
    miniGameInviteTagline.hidden = !tagline;
  }
  renderMiniGameSummary(entry, game);
  renderMiniGameNotes(entry);
}

function enqueueMiniGameInvite(entry) {
  if (!entry || !entry.id || !hasMiniGameInviteUi) return;
  if (miniGameInviteQueue.some(item => item.id === entry.id)) return;
  miniGameInviteQueue.push(entry);
  miniGameInviteQueue.sort((a, b) => miniGameTimestamp(a) - miniGameTimestamp(b));
}

function showNextMiniGameInvite() {
  if (!hasMiniGameInviteUi) return;
  if (miniGameActiveInvite && miniGameActiveInvite.status === 'pending') return;
  if (!miniGameInviteQueue.length) return;
  const next = miniGameInviteQueue.shift();
  miniGameActiveInvite = next;
  populateMiniGameInvite(next);
  show('mini-game-invite');
  if (typeof toast === 'function') {
    const gameLabel = next.gameName || getMiniGameDefinition(next.gameId)?.name || 'Mini-game';
    toast(`Incoming mini-game: ${gameLabel}`, 'info');
  }
}

function closeMiniGameInvite(updatedEntry) {
  if (!hasMiniGameInviteUi) return;
  hide('mini-game-invite');
  if (updatedEntry?.id) {
    miniGameKnownDeployments.set(updatedEntry.id, updatedEntry);
  }
  miniGameActiveInvite = null;
  showNextMiniGameInvite();
}

function handleMiniGameDeployments(entries = []) {
  if (!Array.isArray(entries)) entries = [];
  const pendingIds = new Set();
  const seenIds = new Set();
  entries.forEach(entry => {
    if (!entry || !entry.id) return;
    const normalized = { ...entry };
    normalized.player = sanitizeMiniGamePlayerName(entry.player || miniGameActivePlayer);
    seenIds.add(normalized.id);
    if (normalized.status === 'pending') {
      pendingIds.add(normalized.id);
    }
    miniGameKnownDeployments.set(normalized.id, normalized);
    if (miniGameActiveInvite && miniGameActiveInvite.id === normalized.id) {
      if (normalized.status === 'pending') {
        miniGameActiveInvite = normalized;
        populateMiniGameInvite(normalized);
      } else {
        miniGameActiveInvite = normalized;
        closeMiniGameInvite(normalized);
      }
    }
    if (normalized.status === 'pending') {
      if (!miniGamePromptedDeployments.has(normalized.id)) {
        miniGamePromptedDeployments.add(normalized.id);
        enqueueMiniGameInvite(normalized);
      }
    } else {
      miniGamePromptedDeployments.delete(normalized.id);
      removeMiniGameQueueEntry(normalized.id);
    }
  });

  for (let i = miniGameInviteQueue.length - 1; i >= 0; i--) {
    const item = miniGameInviteQueue[i];
    if (!item || !pendingIds.has(item.id)) {
      miniGameInviteQueue.splice(i, 1);
    }
  }

  for (const id of Array.from(miniGameKnownDeployments.keys())) {
    if (!seenIds.has(id)) {
      miniGameKnownDeployments.delete(id);
      miniGamePromptedDeployments.delete(id);
      removeMiniGameQueueEntry(id);
      if (miniGameActiveInvite && miniGameActiveInvite.id === id) {
        closeMiniGameInvite();
      }
    }
  }

  showNextMiniGameInvite();
}

function persistMiniGameLaunch(entry) {
  if (!entry || !entry.id) return;
  if (typeof localStorage === 'undefined') return;
  try {
    const payload = {
      id: entry.id,
      gameId: entry.gameId,
      gameName: entry.gameName || '',
      gameUrl: entry.gameUrl || '',
      config: entry.config || {},
      notes: typeof entry.notes === 'string' ? entry.notes : '',
      player: entry.player || '',
      issuedBy: entry.issuedBy || '',
      tagline: entry.tagline || '',
      storedAt: Date.now(),
    };
    localStorage.setItem(`${MINI_GAME_STORAGE_KEY_PREFIX}${entry.id}`, JSON.stringify(payload));
    localStorage.setItem(MINI_GAME_LAST_DEPLOYMENT_KEY, entry.id);
  } catch (err) {
    console.error('Failed to persist mini-game launch payload', err);
  }
}

function launchMiniGame(entry) {
  if (!entry || !entry.gameUrl) return;
  const url = entry.gameUrl;
  persistMiniGameLaunch(entry);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    try { window.location.assign(url); } catch { window.location.href = url; }
  }
}

async function respondToMiniGameInvite(action) {
  if (!miniGameActiveInvite || !hasMiniGameInviteUi) return;
  const entry = miniGameActiveInvite;
  const { player, id } = entry;
  if (!player || !id) return;
  const acceptBtn = miniGameInviteAccept;
  const declineBtn = miniGameInviteDecline;
  const responseTs = Date.now();
  const updates = { respondedAt: responseTs };
  if (action === 'accept') {
    updates.status = 'active';
    updates.acceptedAt = responseTs;
  } else {
    updates.status = 'cancelled';
    updates.declinedAt = responseTs;
    updates.declineReason = 'Player declined mini-game invitation';
  }
  if (acceptBtn) acceptBtn.disabled = true;
  if (declineBtn) declineBtn.disabled = true;
  try {
    await updateMiniGameDeployment(player, id, updates);
  } catch (err) {
    console.error('Failed to update mini-game deployment', err);
    if (typeof toast === 'function') toast('Failed to update mini-game assignment', 'error');
    if (acceptBtn) acceptBtn.disabled = false;
    if (declineBtn) declineBtn.disabled = false;
    return;
  }
  const merged = { ...entry, ...updates };
  miniGameKnownDeployments.set(id, merged);
  miniGamePromptedDeployments.delete(id);
  removeMiniGameQueueEntry(id);
  if (acceptBtn) acceptBtn.disabled = false;
  if (declineBtn) declineBtn.disabled = false;
  hide('mini-game-invite');
  miniGameActiveInvite = null;
  if (action === 'accept') {
    if (typeof toast === 'function') toast('Mini-game accepted', 'success');
    launchMiniGame(merged);
  } else if (typeof toast === 'function') {
    toast('Mini-game declined', 'info');
  }
  showNextMiniGameInvite();
}

function setupMiniGamePlayerSync() {
  if (!hasMiniGameInviteUi || miniGameSyncInitialized) return;
  miniGameSyncInitialized = true;
  if (miniGameInviteAccept) {
    miniGameInviteAccept.addEventListener('click', () => respondToMiniGameInvite('accept'));
  }
  if (miniGameInviteDecline) {
    miniGameInviteDecline.addEventListener('click', () => respondToMiniGameInvite('decline'));
  }
  syncMiniGamePlayerName();
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => syncMiniGamePlayerName(), { passive: true });
    if (miniGamePlayerCheckTimer === null) {
      miniGamePlayerCheckTimer = window.setInterval(syncMiniGamePlayerName, MINI_GAME_PLAYER_CHECK_INTERVAL_MS);
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('character-saved', syncMiniGamePlayerName);
  }
}

if (typeof document !== 'undefined') {
  setupMiniGamePlayerSync();
}

function detectPlatform(){
  if(typeof navigator === 'undefined'){
    return {
      os: 'unknown',
      isMobile: false,
      isDesktop: true
    };
  }

  const uaData = navigator.userAgentData;
  const reportedMobile = !!(uaData && typeof uaData.mobile === 'boolean' && uaData.mobile);
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();

  const isIos = () => {
    if(/iphone|ipad|ipod/.test(ua)) return true;
    if(platform === 'macintel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1){
      return true;
    }
    return false;
  };

  const isAndroid = () => /android/.test(ua);

  let os = 'unknown';
  if(isIos()){
    os = 'ios';
  }else if(isAndroid()){
    os = 'android';
  }else if(/mac/.test(ua) || /mac/.test(platform)){
    os = 'mac';
  }else if(/win/.test(ua) || /win/.test(platform)){
    os = 'windows';
  }else if(/linux/.test(ua) || /cros/.test(platform)){
    os = 'linux';
  }

  const isMobile = reportedMobile || os === 'ios' || os === 'android';

  return {
    os,
    isMobile,
    isDesktop: !isMobile
  };
}

const DEVICE_INFO = detectPlatform();
CC.deviceInfo = DEVICE_INFO;
CC.canRequestDesktopMode = !DEVICE_INFO.isMobile;

if(typeof document !== 'undefined' && document.documentElement){
  const { documentElement } = document;
  documentElement.dataset.platform = DEVICE_INFO.os;
  documentElement.dataset.deviceClass = DEVICE_INFO.isMobile ? 'mobile' : 'desktop';
  documentElement.classList.toggle('is-mobile-device', DEVICE_INFO.isMobile);
  documentElement.classList.toggle('is-desktop-device', !DEVICE_INFO.isMobile);
}

const BASE_TICKER_DURATION_MS = DEVICE_INFO.isMobile ? 55000 : 30000;
const FUN_TICKER_SPEED_MULTIPLIER = 0.65;
const FUN_TICKER_DURATION_MS = Math.round(BASE_TICKER_DURATION_MS * FUN_TICKER_SPEED_MULTIPLIER);

const FORCED_REFRESH_STATE_KEY = 'cc:forced-refresh-state';

const LAUNCH_MIN_VISIBLE = 1800;
const LAUNCH_MAX_WAIT = 12000;

const WELCOME_MODAL_ID = 'modal-welcome';
const TOUCH_LOCK_CLASS = 'touch-controls-disabled';
const TOUCH_UNLOCK_DELAY_MS = 250;
let welcomeModalDismissed = false;
let welcomeModalQueued = false;
let touchUnlockTimer = null;
let waitingForTouchUnlock = false;

function clearTouchUnlockTimer() {
  if (touchUnlockTimer) {
    try {
      clearTimeout(touchUnlockTimer);
    } catch (err) {
      // ignore inability to clear timer
    }
    touchUnlockTimer = null;
  }
  waitingForTouchUnlock = false;
}

function getWelcomeModal() {
  return document.getElementById(WELCOME_MODAL_ID);
}

function lockTouchControls() {
  if (typeof document === 'undefined') return;
  clearTouchUnlockTimer();
  const { body } = document;
  if (body) {
    body.classList.add(TOUCH_LOCK_CLASS);
  }
}

function unlockTouchControls({ immediate = false } = {}) {
  if (typeof document === 'undefined') return;
  const { body } = document;
  if (body) {
    if (immediate || !body.classList.contains('launching')) {
      clearTouchUnlockTimer();
      body.classList.remove(TOUCH_LOCK_CLASS);
      return;
    }

    if (touchUnlockTimer || waitingForTouchUnlock) return;
    waitingForTouchUnlock = true;

    const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (cb => setTimeout(cb, 16));

    const setTimer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : ((cb, ms) => setTimeout(cb, ms));

    const release = () => {
      touchUnlockTimer = null;
      body.classList.remove(TOUCH_LOCK_CLASS);
    };

    const waitForLaunchEnd = () => {
      if (!body.classList.contains('launching')) {
        waitingForTouchUnlock = false;
        touchUnlockTimer = setTimer(release, TOUCH_UNLOCK_DELAY_MS);
        return;
      }
      schedule(waitForLaunchEnd);
    };

    schedule(waitForLaunchEnd);
  }
}

function maybeShowWelcomeModal() {
  const modal = getWelcomeModal();
  if (!modal) {
    unlockTouchControls({ immediate: true });
    return;
  }
  if (welcomeModalDismissed) {
    unlockTouchControls({ immediate: true });
    return;
  }
  const wasHidden = modal.classList.contains('hidden');
  show(WELCOME_MODAL_ID);

  if (!wasHidden) {
    unlockTouchControls();
    return;
  }
  unlockTouchControls();
}

function dismissWelcomeModal() {
  welcomeModalDismissed = true;
  hide(WELCOME_MODAL_ID);
  unlockTouchControls();
}

function queueWelcomeModal({ immediate = false } = {}) {
  if (welcomeModalDismissed) {
    unlockTouchControls();
    return;
  }
  if (immediate) {
    maybeShowWelcomeModal();
    return;
  }
  if (welcomeModalQueued) return;
  welcomeModalQueued = true;
  const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame
    : (cb => setTimeout(cb, 0));
  schedule(() => {
    welcomeModalQueued = false;
    maybeShowWelcomeModal();
  });
}
(async function setupLaunchAnimation(){
  const body = document.body;
  if(!body || !body.classList.contains('launching')){
    unlockTouchControls();
    queueWelcomeModal({ immediate: true });
    return;
  }

  lockTouchControls();
  queueWelcomeModal({ immediate: true });

  const launchEl = document.getElementById('launch-animation');
  const video = launchEl ? launchEl.querySelector('video') : null;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let revealCalled = false;
  let playbackStartedAt = null;
  let fallbackTimer = null;
  let awaitingGesture = false;
  let cleanupMessaging = null;
  const userGestureListeners = [];

  const clearTimer = timer => {
    if(timer){
      window.clearTimeout(timer);
    }
    return null;
  };

  const cleanupUserGestures = () => {
    while(userGestureListeners.length){
      const { target, event, handler, capture } = userGestureListeners.pop();
      try {
        target.removeEventListener(event, handler, capture);
      } catch (err) {
        // ignore removal failures
      }
    }
    awaitingGesture = false;
  };

  const cleanupLaunchShell = () => {
    if(launchEl && launchEl.parentNode){
      launchEl.parentNode.removeChild(launchEl);
    }
  };

  const detachMessaging = () => {
    if(typeof cleanupMessaging === 'function'){
      try {
        cleanupMessaging();
      } catch (err) {
        // ignore cleanup failures
      }
    }
    cleanupMessaging = null;
  };

  const finalizeReveal = () => {
    body.classList.remove('launching');
    if(launchEl){
      launchEl.addEventListener('transitionend', cleanupLaunchShell, { once: true });
      window.setTimeout(cleanupLaunchShell, 1000);
    }
  };

  const revealApp = () => {
    if(revealCalled) return;
    revealCalled = true;
    detachMessaging();
    cleanupUserGestures();
    queueWelcomeModal({ immediate: true });
    if(typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, '__resetLaunchVideo')){
      try {
        delete window.__resetLaunchVideo;
      } catch (err) {
        window.__resetLaunchVideo = undefined;
      }
    }
    if(playbackStartedAt && typeof performance !== 'undefined' && typeof performance.now === 'function'){
      const elapsed = performance.now() - playbackStartedAt;
      const remaining = Math.max(0, LAUNCH_MIN_VISIBLE - elapsed);
      if(remaining > 0){
        window.setTimeout(finalizeReveal, remaining);
        return;
      }
    }
    finalizeReveal();
  };

  let manifestAssetsPromise = null;
  const getManifestAssets = async () => {
    if(manifestAssetsPromise) return manifestAssetsPromise;
    if(typeof fetch !== 'function') return null;
    manifestAssetsPromise = (async () => {
      try {
        const response = await fetch('asset-manifest.json', { cache: 'no-cache' });
        if(!response || !response.ok) return null;
        const data = await response.json();
        if(Array.isArray(data?.assets)){
          return new Set(data.assets);
        }
      } catch (err) {
        // ignore manifest lookup failures
      }
      return null;
    })();
    return manifestAssetsPromise;
  };

  const ensureLaunchVideoSources = async vid => {
    if(!vid) return false;

    const hasExistingSource = !!vid.querySelector('source[src]');
    let appended = false;
    const canProbe = typeof fetch === 'function';
    const manifestAssets = canProbe ? await getManifestAssets() : null;

    const candidates = [
      { key: 'srcWebm', type: 'video/webm' },
      { key: 'srcMp4', type: 'video/mp4' }
    ];

    for (const { key, type } of candidates) {
      const url = vid.dataset?.[key];
      if(!url) continue;
      if(!canProbe) continue;
      if(manifestAssets){
        const normalized = url.replace(/^\.\//, '').replace(/^\//, '');
        const manifestKey = `./${normalized}`;
        if(!manifestAssets.has(manifestKey)){
          continue;
        }
      }
      let ok = false;
      try {
        const response = await fetch(url, { method: 'HEAD' });
        ok = response && (response.ok || response.status === 405);
      } catch (err) {
        ok = false;
      }
      if(!ok) continue;
      const source = document.createElement('source');
      source.src = url;
      if(type){
        source.type = type;
      }
      vid.appendChild(source);
      appended = true;
    }

    if(appended){
      try {
        vid.load();
      } catch (err) {
        // ignore inability to reload with new sources
      }
    }

    return hasExistingSource || appended;
  };

  if(!video || prefersReducedMotion){
    revealApp();
    return;
  }

  const hasLaunchVideo = await ensureLaunchVideoSources(video);
  if(!hasLaunchVideo){
    revealApp();
    return;
  }

  const ensureLaunchVideoAttributes = vid => {
    try {
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
    } catch (err) {
      // ignore attribute failures
    }
    try {
      if(!vid.hasAttribute('muted')){
        vid.setAttribute('muted', '');
      }
      vid.muted = true;
    } catch (err) {
      // ignore inability to force muted playback
    }
    try {
      vid.autoplay = true;
    } catch (err) {
      // ignore inability to set autoplay
    }
  };

  const notifyServiceWorkerVideoPlayed = () => {
    if(typeof navigator === 'undefined' || !('serviceWorker' in navigator)){
      return;
    }
    const videoUrl = video.currentSrc || video.getAttribute('src') || null;
    const payload = { type: 'launch-video-played', videoUrl };
    const postToWorker = worker => {
      if(!worker) return;
      try {
        worker.postMessage(payload);
      } catch (err) {
        // ignore messaging failures
      }
    };
    postToWorker(navigator.serviceWorker.controller);
    navigator.serviceWorker.ready
      .then(reg => {
        const worker = navigator.serviceWorker.controller || reg.active;
        if(worker){
          postToWorker(worker);
        }
      })
      .catch(() => {});
  };

  const finalizeLaunch = () => {
    if(revealCalled) return;
    fallbackTimer = clearTimer(fallbackTimer);
    notifyServiceWorkerVideoPlayed();
    revealApp();
  };

  const scheduleFallback = delay => {
    fallbackTimer = clearTimer(fallbackTimer);
    fallbackTimer = window.setTimeout(finalizeLaunch, delay);
  };

  function attemptPlayback(){
    ensureLaunchVideoAttributes(video);
    try {
      const playAttempt = video.play();
      if(playAttempt && typeof playAttempt.then === 'function'){
        playAttempt.catch(() => {
          requireUserGesture();
        });
      }
    } catch (err) {
      requireUserGesture();
    }
  }

  function requireUserGesture(){
    if(awaitingGesture) return;
    awaitingGesture = true;
    const resumePlayback = () => {
      cleanupUserGestures();
      attemptPlayback();
    };
    const addGesture = event => {
      const handler = () => resumePlayback();
      const capture = true;
      window.addEventListener(event, handler, { once: true, passive: true, capture });
      userGestureListeners.push({ target: window, event, handler, capture });
    };
    ['pointerdown','touchstart','keydown'].forEach(addGesture);
  }

  const resetPlayback = () => {
    try {
      video.pause();
    } catch (err) {
      // ignore inability to pause
    }
    try {
      if(video.readyState > 0){
        video.currentTime = 0;
      }
    } catch (err) {
      // ignore inability to seek
    }
    if(video.readyState === 0){
      try {
        video.load();
      } catch (err) {
        // ignore load failures
      }
    }
  };

  const handlePlaying = () => {
    if(!playbackStartedAt && typeof performance !== 'undefined' && typeof performance.now === 'function'){
      playbackStartedAt = performance.now();
    }
    cleanupUserGestures();
    const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? (video.duration * 1000) + 500 : LAUNCH_MAX_WAIT;
    const fallbackDelay = Math.max(durationMs, LAUNCH_MAX_WAIT);
    scheduleFallback(fallbackDelay);
  };

  const handlePause = () => {
    if(revealCalled || video.ended) return;
    attemptPlayback();
  };

  const setupServiceWorkerMessaging = () => {
    if(typeof navigator === 'undefined' || !('serviceWorker' in navigator)){
      return () => {};
    }
    const handler = event => {
      const payload = event?.data && typeof event.data === 'object' ? event.data : { type: event?.data };
      if(!payload || typeof payload.type !== 'string'){
        return;
      }
      if(payload.type === 'reset-launch-video'){
        resetPlayback();
        attemptPlayback();
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => {
      try {
        navigator.serviceWorker.removeEventListener('message', handler);
      } catch (err) {
        // ignore removal failures
      }
    };
  };

  cleanupMessaging = setupServiceWorkerMessaging();

  window.__resetLaunchVideo = () => {
    if(revealCalled) return;
    resetPlayback();
    attemptPlayback();
  };

  video.addEventListener('playing', handlePlaying);
  video.addEventListener('timeupdate', handlePlaying, { once: true });
  video.addEventListener('pause', handlePause);
  video.addEventListener('ended', finalizeLaunch, { once: true });
  video.addEventListener('error', finalizeLaunch, { once: true });
  ['stalled','suspend','abort'].forEach(evt => video.addEventListener(evt, () => scheduleFallback(LAUNCH_MAX_WAIT)));

  const beginPlayback = () => {
    resetPlayback();
    attemptPlayback();
    scheduleFallback(LAUNCH_MAX_WAIT);
  };

  if(video.readyState >= 1){
    beginPlayback();
  } else {
    video.addEventListener('loadedmetadata', beginPlayback, { once: true });
    try {
      video.load();
    } catch (err) {
      // ignore load failures while waiting for metadata
    }
    scheduleFallback(LAUNCH_MAX_WAIT);
  }
})();

// Ensure numeric inputs accept only digits and trigger numeric keypad
document.addEventListener('input', e => {
  if(e.target.matches('input[inputmode="numeric"]')){
    e.target.value = e.target.value.replace(/[^0-9]/g,'');
  }
});
// Load the optional confetti library lazily so tests and offline environments
// don't attempt a network import on startup.
let confettiPromise = null;
function loadConfetti() {
  if (!confettiPromise) {
    confettiPromise = import('https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.module.mjs')
      .then(m => m.default)
      .catch(() => (() => {}));
  }
  return confettiPromise;
}
const rulesEl = qs('#rules-text');
const RULES_SRC = './ruleshelp.txt';
let rulesLoaded = false;

// ----- animation lock -----
// Animations should only run after an explicit user action. To prevent them
// from firing on initial page load, keep them locked until a user interaction
// (click or keydown) occurs.
let animationsEnabled = false;
const INTERACTIVE_SEL = 'button, .icon, .tab, a, input, select, textarea, [role="button"], [data-act]';
function enableAnimations(e){
  if(animationsEnabled) return;
  if(e.type==='click'){
    const interactive=e.target.closest(INTERACTIVE_SEL);
    if(!interactive) return;
  }
  animationsEnabled=true;
  document.removeEventListener('click', enableAnimations, true);
  document.removeEventListener('keydown', enableAnimations, true);
}
// Use capture so the lock is evaluated before other handlers. Do not use `once`
// so clicks from pull-to-refresh are ignored until a real interaction occurs.
document.addEventListener('click', enableAnimations, true);
document.addEventListener('keydown', enableAnimations, true);
// Avoid using 'touchstart' so pull-to-refresh on iOS doesn't enable animations
document.addEventListener('click', e=>{
  if(!animationsEnabled) return;
  const el=e.target.closest(INTERACTIVE_SEL);
  if(el){
    el.classList.add('action-anim');
    el.addEventListener('animationend', ()=>el.classList.remove('action-anim'), {once:true});
  }
}, true);

let audioContextPrimed = false;
let audioContextPrimedOnce = false;
function handleAudioContextPriming(e){
  if(audioContextPrimed) return;
  if(e.type==='pointerdown'){
    const interactive=e.target?.closest?.(INTERACTIVE_SEL);
    if(!interactive) return;
  }
  audioContextPrimed = true;
  document.removeEventListener('pointerdown', handleAudioContextPriming, true);
  document.removeEventListener('keydown', handleAudioContextPriming, true);
  try {
    primeAudioContext();
  } catch {
    /* noop */
  }
}
document.addEventListener('pointerdown', handleAudioContextPriming, true);
document.addEventListener('keydown', handleAudioContextPriming, true);

/* ========= view mode ========= */
const VIEW_LOCK_SKIP_TYPES = new Set(['button','submit','reset','file','color','range','hidden','image']);
const VIEW_EMPTY_PLACEHOLDER = '';
const VIEW_EMPTY_LABEL = 'Empty value';
const viewFieldRegistry = new Map();
const radioGroupRegistry = new Map();
const viewModeListeners = new Set();
const viewUpdateQueue = new Set();
const radioUpdateQueue = new Set();
let viewUpdateFrame = null;
let radioUpdateFrame = null;
let valueAccessorsPatched = false;

const globalViewScope = typeof window !== 'undefined' ? window : globalThis;
const scheduleViewFrame = typeof globalViewScope.requestAnimationFrame === 'function'
  ? cb => globalViewScope.requestAnimationFrame(cb)
  : cb => setTimeout(cb, 16);

const numberFormatter = typeof Intl !== 'undefined' && Intl.NumberFormat
  ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
  : { format: v => String(v) };

let mode = 'edit';
let modeRoot = null;
let modeLiveRegion = null;

function hasViewAllow(el){
  if (!el || !el.closest) return false;
  if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'viewAllow')) return true;
  return !!el.closest('[data-view-allow]');
}

function hasViewLock(el){
  if (!el || !el.closest) return false;
  if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'viewLock')) return true;
  return !!el.closest('[data-view-lock]');
}

function getViewLockHost(el){
  if (!el || !el.closest) return null;
  return el.closest('[data-view-lock]');
}

function isViewUnlocked(el){
  const host = getViewLockHost(el);
  if (!host) return false;
  return host.dataset && host.dataset.viewUnlocked === 'true';
}

function shouldTransformElement(el){
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (hasViewAllow(el)) return false;
  if (!hasViewLock(el)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (VIEW_LOCK_SKIP_TYPES.has(type)) return false;
    return true;
  }
  return false;
}

function ensureModeRoot(){
  if (!modeRoot) {
    modeRoot = document.querySelector('[data-launch-shell]') || document.body || null;
  }
  return modeRoot;
}

function findLabelText(el){
  if (!el) return '';
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const id = el.getAttribute('id');
  if (id) {
    try {
      const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicit) {
        const clone = explicit.cloneNode(true);
        clone.querySelectorAll('input,select,textarea,button').forEach(node => node.remove());
        return clone.textContent.trim().replace(/\s+/g, ' ');
      }
    } catch {}
  }
  const wrapping = el.closest('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button').forEach(node => node.remove());
    return clone.textContent.trim().replace(/\s+/g, ' ');
  }
  const ariaLabelledby = el.getAttribute('aria-labelledby');
  if (ariaLabelledby) {
    const parts = ariaLabelledby.split(/\s+/).map(idPart => {
      const node = document.getElementById(idPart);
      return node ? node.textContent.trim() : '';
    }).filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  const name = el.getAttribute('name');
  return name ? name.replace(/[-_]/g, ' ') : '';
}

function createFieldViewElements(){
  const viewEl = document.createElement('div');
  viewEl.className = 'field-value';
  viewEl.dataset.fieldValue = 'true';
  viewEl.hidden = mode !== 'view';

  const contentEl = document.createElement('div');
  contentEl.className = 'field-value__content';
  viewEl.appendChild(contentEl);

  const textEl = document.createElement('span');
  textEl.className = 'field-value__text';
  contentEl.appendChild(textEl);

  const placeholderEl = document.createElement('span');
  placeholderEl.className = 'field-value__placeholder';
  if (VIEW_EMPTY_PLACEHOLDER) {
    placeholderEl.textContent = VIEW_EMPTY_PLACEHOLDER;
    placeholderEl.dataset.visiblePlaceholder = 'true';
  } else {
    placeholderEl.textContent = '';
    const srText = document.createElement('span');
    srText.className = 'sr-only';
    srText.textContent = VIEW_EMPTY_LABEL;
    placeholderEl.appendChild(srText);
    placeholderEl.dataset.visiblePlaceholder = 'false';
  }
  placeholderEl.hidden = true;
  placeholderEl.setAttribute('aria-label', VIEW_EMPTY_LABEL);
  viewEl.appendChild(placeholderEl);

  return { viewEl, contentEl, textEl, placeholderEl };
}

function ensureExpander(state){
  if (state.expander) return state.expander;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'field-value__expander';
  btn.textContent = 'Show more';
  btn.hidden = true;
  btn.addEventListener('click', () => {
    state.expanded = !state.expanded;
    state.viewEl.dataset.expanded = state.expanded ? 'true' : 'false';
    btn.textContent = state.expanded ? 'Show less' : 'Show more';
  });
  state.viewEl.appendChild(btn);
  state.expander = btn;
  return btn;
}

function removeExpander(state){
  if (!state.expander) return;
  state.expander.remove();
  state.expander = null;
  state.expanded = false;
  delete state.viewEl.dataset.expanded;
}

function queueFieldUpdate(el){
  if (!el) return;
  const type = (el.getAttribute && el.getAttribute('type')) || el.type;
  if (type && String(type).toLowerCase() === 'radio' && el.name) {
    queueRadioGroupUpdate(el.name);
    return;
  }
  if (!viewFieldRegistry.has(el)) return;
  viewUpdateQueue.add(el);
  if (!viewUpdateFrame) {
    viewUpdateFrame = scheduleViewFrame(flushViewUpdates);
  }
}

function queueRadioGroupUpdate(name){
  if (!name) return;
  radioUpdateQueue.add(name);
  if (!radioUpdateFrame) {
    radioUpdateFrame = scheduleViewFrame(flushRadioUpdates);
  }
}

function flushViewUpdates(){
  viewUpdateFrame = null;
  viewUpdateQueue.forEach(el => updateFieldView(el));
  viewUpdateQueue.clear();
}

function flushRadioUpdates(){
  radioUpdateFrame = null;
  radioUpdateQueue.forEach(name => updateRadioGroup(name));
  radioUpdateQueue.clear();
}

function patchValueAccessors(){
  if (valueAccessorsPatched) return;
  valueAccessorsPatched = true;
  const patch = (Ctor, prop, handler) => {
    if (!Ctor || !Ctor.prototype) return;
    const desc = Object.getOwnPropertyDescriptor(Ctor.prototype, prop);
    if (!desc || typeof desc.set !== 'function') return;
    Object.defineProperty(Ctor.prototype, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(value){
        desc.set.call(this, value);
        handler(this);
      }
    });
  };
  try {
    patch(globalViewScope.HTMLInputElement, 'value', queueFieldUpdate);
    patch(globalViewScope.HTMLInputElement, 'checked', queueFieldUpdate);
    patch(globalViewScope.HTMLTextAreaElement, 'value', queueFieldUpdate);
    patch(globalViewScope.HTMLSelectElement, 'value', queueFieldUpdate);
  } catch {}
}

function ensureFieldView(el){
  if (!shouldTransformElement(el)) return;
  const type = (el.getAttribute('type') || el.type || '').toLowerCase();
  if (type === 'radio') {
    ensureRadioGroup(el);
    return;
  }
  if (viewFieldRegistry.has(el)) {
    const existing = viewFieldRegistry.get(el);
    if (!existing.viewEl.isConnected) {
      el.insertAdjacentElement('afterend', existing.viewEl);
    }
    return;
  }
  const { viewEl, contentEl, textEl, placeholderEl } = createFieldViewElements();
  const state = {
    el,
    viewEl,
    contentEl,
    textEl,
    placeholderEl,
    label: findLabelText(el),
    prevTabIndex: el.hasAttribute('tabindex') ? el.getAttribute('tabindex') : null,
    prevAriaHidden: el.hasAttribute('aria-hidden') ? el.getAttribute('aria-hidden') : null,
    expander: null,
    expanded: false,
    isTextarea: el.tagName === 'TEXTAREA',
    isMultiSelect: el.tagName === 'SELECT' && el.multiple,
  };
  if (state.isMultiSelect) {
    const chips = document.createElement('span');
    chips.className = 'field-value__chips';
    contentEl.appendChild(chips);
    state.chipsContainer = chips;
  }
  el.insertAdjacentElement('afterend', viewEl);
  el.classList.add('view-field-control');
  if (!el.dataset) el.dataset = {};
  el.dataset.fieldValueBound = 'true';
  if (!el.dataset.viewModeListener) {
    el.addEventListener('input', () => queueFieldUpdate(el));
    el.addEventListener('change', () => queueFieldUpdate(el));
    el.dataset.viewModeListener = '1';
  }
  viewFieldRegistry.set(el, state);
}

function findRadioControls(name){
  try {
    return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`));
  } catch {
    return Array.from(document.querySelectorAll('input[type="radio"]')).filter(r => r.name === name);
  }
}

function ensureRadioGroup(el){
  const name = el.getAttribute('name');
  if (!name) return;
  const controls = findRadioControls(name);
  if (!controls.length) return;
  let state = radioGroupRegistry.get(name);
  if (!state) {
    const anchor = controls[controls.length - 1];
    const { viewEl, contentEl, textEl, placeholderEl } = createFieldViewElements();
    anchor.insertAdjacentElement('afterend', viewEl);
    state = {
      name,
      controls,
      viewEl,
      contentEl,
      textEl,
      placeholderEl,
      label: findLabelText(controls[0]),
      prevTabIndex: new Map(),
      prevAriaHidden: new Map(),
    };
    radioGroupRegistry.set(name, state);
  } else {
    state.controls = controls;
    if (!state.viewEl.isConnected) {
      const anchor = controls[controls.length - 1];
      anchor.insertAdjacentElement('afterend', state.viewEl);
    }
  }
  controls.forEach(control => {
    control.classList.add('view-field-control');
    if (!state.prevTabIndex.has(control)) {
      state.prevTabIndex.set(control, control.hasAttribute('tabindex') ? control.getAttribute('tabindex') : null);
    }
    if (!state.prevAriaHidden.has(control)) {
      state.prevAriaHidden.set(control, control.hasAttribute('aria-hidden') ? control.getAttribute('aria-hidden') : null);
    }
    if (!control.dataset) control.dataset = {};
    if (!control.dataset.viewModeListener) {
      control.addEventListener('input', () => queueRadioGroupUpdate(name));
      control.addEventListener('change', () => queueRadioGroupUpdate(name));
      control.dataset.viewModeListener = '1';
    }
  });
}

function syncFieldMode(el){
  const state = viewFieldRegistry.get(el);
  if (!state) return;
  const isEditable = mode !== 'view' || isViewUnlocked(el);
  const showView = !isEditable;
  state.viewEl.hidden = !showView;
  if (showView) {
    if (!state.viewEl.isConnected) el.insertAdjacentElement('afterend', state.viewEl);
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');
    queueFieldUpdate(el);
  } else {
    if (state.prevTabIndex === null) el.removeAttribute('tabindex');
    else el.setAttribute('tabindex', state.prevTabIndex);
    if (state.prevAriaHidden === null) el.removeAttribute('aria-hidden');
    else el.setAttribute('aria-hidden', state.prevAriaHidden);
  }
}

function syncRadioGroup(name){
  const state = radioGroupRegistry.get(name);
  if (!state) return;
  const isEditable = mode !== 'view' || state.controls.some(isViewUnlocked);
  const showView = !isEditable;
  state.viewEl.hidden = !showView;
  state.controls.forEach(control => {
    if (showView) {
      control.setAttribute('tabindex', '-1');
      control.setAttribute('aria-hidden', 'true');
    } else {
      const prevTab = state.prevTabIndex.get(control);
      if (prevTab === null || typeof prevTab === 'undefined') control.removeAttribute('tabindex');
      else control.setAttribute('tabindex', prevTab);
      const prevAria = state.prevAriaHidden.get(control);
      if (prevAria === null || typeof prevAria === 'undefined') control.removeAttribute('aria-hidden');
      else control.setAttribute('aria-hidden', prevAria);
    }
  });
  if (showView) {
    queueRadioGroupUpdate(name);
  }
}

function getOptionLabel(option){
  if (!option) return '';
  const text = option.textContent || option.getAttribute('label');
  return text ? text.trim().replace(/\s+/g, ' ') : option.value;
}

function describeValue(el){
  if (!el) return '';
  if (el.tagName === 'SELECT') {
    const selected = Array.from(el.selectedOptions || []);
    return selected.map(getOptionLabel).filter(Boolean);
  }
  const type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
  if (type === 'checkbox') {
    return el.checked ? ['Yes'] : ['No'];
  }
  let raw = el.value != null ? String(el.value) : '';
  raw = raw.trim();
  if (!raw) return [];
  if (type === 'number') {
    const numeric = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(numeric)) {
      return [numberFormatter.format(numeric)];
    }
  }
  return [raw];
}

function updateFieldView(el){
  const state = viewFieldRegistry.get(el);
  if (!state) return;
  const values = describeValue(el);
  const isMulti = state.isMultiSelect;
  const hasValue = values.length > 0 && values.some(Boolean);
  if (isMulti && state.chipsContainer) {
    state.chipsContainer.textContent = '';
    if (hasValue) {
      values.forEach(label => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = label;
        state.chipsContainer.appendChild(chip);
      });
    }
  } else {
    state.textEl.textContent = hasValue ? values[0] : '';
  }

  const srValue = values.join(', ') || VIEW_EMPTY_LABEL;
  if (state.label) {
    state.viewEl.setAttribute('aria-label', `${state.label}: ${srValue}`);
  } else {
    state.viewEl.setAttribute('aria-label', srValue);
  }

  if (state.isTextarea) {
    const text = values.join('\n');
    const trimmed = text.trim();
    const lineCount = trimmed ? trimmed.split(/\r?\n/).length : 0;
    const shouldClamp = lineCount > 6 || trimmed.length > 360;
    if (shouldClamp) {
      const expander = ensureExpander(state);
      expander.hidden = false;
      expander.textContent = state.expanded ? 'Show less' : 'Show more';
      state.viewEl.dataset.clamped = 'true';
      state.viewEl.dataset.expanded = state.expanded ? 'true' : 'false';
    } else {
      removeExpander(state);
      delete state.viewEl.dataset.clamped;
      delete state.viewEl.dataset.expanded;
    }
    state.textEl.textContent = trimmed;
  }

  const placeholderIsVisible =
    state.placeholderEl && state.placeholderEl.dataset.visiblePlaceholder === 'true';
  if (hasValue) {
    state.viewEl.dataset.empty = 'false';
    if (state.placeholderEl) state.placeholderEl.hidden = true;
  } else {
    state.viewEl.dataset.empty = 'true';
    if (state.placeholderEl) state.placeholderEl.hidden = !placeholderIsVisible;
  }
}

function findRadioLabel(control){
  if (!control) return '';
  const id = control.getAttribute('id');
  if (id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) {
        const clone = label.cloneNode(true);
        clone.querySelectorAll('input,select,textarea,button').forEach(node => node.remove());
        const text = clone.textContent.trim().replace(/\s+/g, ' ');
        if (text) return text;
      }
    } catch {}
  }
  return control.value || '';
}

function updateRadioGroup(name){
  const state = radioGroupRegistry.get(name);
  if (!state) return;
  const selected = state.controls.find(control => control.checked);
  const label = selected ? findRadioLabel(selected) : '';
  const placeholderIsVisible =
    state.placeholderEl && state.placeholderEl.dataset.visiblePlaceholder === 'true';
  if (label) {
    state.textEl.textContent = label;
    if (state.placeholderEl) state.placeholderEl.hidden = true;
    state.viewEl.dataset.empty = 'false';
  } else {
    state.textEl.textContent = '';
    if (state.placeholderEl) state.placeholderEl.hidden = !placeholderIsVisible;
    state.viewEl.dataset.empty = 'true';
  }
  const srLabel = label || VIEW_EMPTY_LABEL;
  if (state.label) {
    state.viewEl.setAttribute('aria-label', `${state.label}: ${srLabel}`);
  } else {
    state.viewEl.setAttribute('aria-label', srLabel);
  }
}

function applyViewLockState(root=document){
  if (!root) return;
  const targets = new Set();
  if (root.nodeType === Node.ELEMENT_NODE && ['INPUT','SELECT','TEXTAREA'].includes(root.tagName)) {
    targets.add(root);
  }
  const scope = (root && typeof root.querySelectorAll === 'function') ? root : document;
  scope.querySelectorAll('input,select,textarea').forEach(el => targets.add(el));
  targets.forEach(el => {
    if (!shouldTransformElement(el)) return;
    ensureFieldView(el);
    syncFieldMode(el);
  });
  radioGroupRegistry.forEach((_, name) => syncRadioGroup(name));
}

function ensureModeLiveRegion(){
  if (modeLiveRegion && modeLiveRegion.isConnected) return modeLiveRegion;
  const region = document.createElement('div');
  region.className = 'sr-only';
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  const header = document.querySelector('header');
  (header || document.body || document.documentElement).appendChild(region);
  modeLiveRegion = region;
  return modeLiveRegion;
}

function announceModeChange(){
  const region = ensureModeLiveRegion();
  if (!region) return;
  region.textContent = mode === 'view' ? 'View Mode' : 'Edit Mode';
}

function setMode(nextMode, { skipPersist = false } = {}){
  const normalized = nextMode === 'view' ? 'view' : 'edit';
  const changed = mode !== normalized;
  mode = normalized;
  const rootEl = ensureModeRoot();
  if (rootEl) {
    rootEl.dataset.mode = mode;
    rootEl.classList.toggle('view-mode', mode === 'view');
  }
  if (document.body) {
    document.body.classList.toggle('is-view-mode', mode === 'view');
  }
  if (mode === 'view' && document.activeElement && shouldTransformElement(document.activeElement)) {
    document.activeElement.blur();
  }
  applyViewLockState();
  if (changed) {
    announceModeChange();
  }
  if (!skipPersist) {
    try { localStorage.setItem('view-mode', mode); } catch {}
  }
  if (changed) {
    viewModeListeners.forEach(listener => {
      try { listener(mode); } catch (err) { console.error(err); }
    });
  }
}

function toggleMode(){
  setMode(mode === 'view' ? 'edit' : 'view');
}

function useViewMode(listener){
  if (typeof listener === 'function') {
    viewModeListeners.add(listener);
    try { listener(mode); } catch (err) { console.error(err); }
    return () => viewModeListeners.delete(listener);
  }
  return mode;
}

const cardEditToggleRegistry = new Map();

function collectViewLockTargets(root){
  const targets = new Set();
  if (!root) return [];
  if (root.matches && root.matches('[data-view-lock]')) {
    targets.add(root);
  }
  if (root.querySelectorAll) {
    root.querySelectorAll('[data-view-lock]').forEach(node => targets.add(node));
  }
  return Array.from(targets);
}

function applyCardEditToggleState(button, state, { skipApply = false } = {}){
  const isViewMode = mode === 'view';
  const effectiveUnlocked = isViewMode ? state.unlocked : true;
  const baseLabel = button.dataset?.viewLabel || '';
  const editText = button.dataset?.viewEditText || 'Edit';
  const doneText = button.dataset?.viewDoneText || 'Done';
  const editLabel = button.dataset?.viewEditLabel || (baseLabel ? `Edit ${baseLabel}` : editText);
  const doneLabel = button.dataset?.viewDoneLabel || (baseLabel ? `Lock ${baseLabel}` : doneText);

  button.disabled = false;
  button.setAttribute('aria-pressed', effectiveUnlocked ? 'true' : 'false');
  button.setAttribute('aria-label', effectiveUnlocked ? doneLabel : editLabel);
  button.setAttribute('title', effectiveUnlocked ? doneLabel : editLabel);

  if (state.labelEl) {
    state.labelEl.textContent = effectiveUnlocked ? doneText : editText;
  } else {
    button.textContent = effectiveUnlocked ? doneText : editText;
  }

  if (isViewMode) {
    state.targets.forEach(target => {
      if (effectiveUnlocked) {
        target.dataset.viewUnlocked = 'true';
      } else {
        delete target.dataset.viewUnlocked;
      }
    });
  } else {
    state.targets.forEach(target => {
      delete target.dataset.viewUnlocked;
    });
  }

  if (!skipApply) {
    applyViewLockState(state.root || undefined);
  }
}

function initCardEditToggles(){
  const buttons = qsa('.card-edit-toggle[data-view-target]');
  buttons.forEach(button => {
    const selector = button.getAttribute('data-view-target');
    if (!selector) return;
    let root = null;
    try {
      root = document.querySelector(selector);
    } catch (err) {
      root = null;
    }
    if (!root) return;
    const targets = collectViewLockTargets(root);
    if (!targets.length) return;
    const state = {
      root,
      targets,
      unlocked: false,
      labelEl: button.querySelector('.card-edit-toggle__label') || null,
    };
    cardEditToggleRegistry.set(button, state);
    button.addEventListener('click', () => {
      if (mode !== 'view') {
        setMode('view');
      }
      state.unlocked = !state.unlocked;
      applyCardEditToggleState(button, state);
    });
    applyCardEditToggleState(button, state, { skipApply: true });
  });

  if (!cardEditToggleRegistry.size) return;

  const syncToggles = () => {
    const scopes = new Set();
    cardEditToggleRegistry.forEach((state, button) => {
      applyCardEditToggleState(button, state, { skipApply: true });
      if (state.root) scopes.add(state.root);
    });
    scopes.forEach(scope => applyViewLockState(scope));
  };

  useViewMode(currentMode => {
    cardEditToggleRegistry.forEach(state => {
      if (currentMode === 'view') {
        state.unlocked = false;
      }
    });
    syncToggles();
  });

  syncToggles();
}

patchValueAccessors();

let storedMode = 'view';
try {
  const raw = localStorage.getItem('view-mode');
  if (raw === '1' || raw === 'view') storedMode = 'view';
  else if (raw === '0' || raw === 'edit') storedMode = 'edit';
} catch {}
setMode(storedMode, { skipPersist: true });

window.setMode = setMode;
window.useViewMode = useViewMode;

initCardEditToggles();

/* ========= viewport ========= */
function setVh(){
  const viewport = window.visualViewport;
  const fallback = window.innerHeight || document.documentElement.clientHeight || 0;
  const height = viewport && viewport.height ? viewport.height : fallback;
  const vh = Math.max(height || 0, fallback || 0) * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVh();
// Update the CSS viewport height variable on resize or orientation changes
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setVh);
  window.visualViewport.addEventListener('scroll', setVh);
}
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 7.5h12m-9 0v9m6-9v9M4.5 7.5l1 12A2.25 2.25 0 007.75 21h8.5a2.25 2.25 0 002.25-2.25l1-12M9.75 7.5V4.875A1.125 1.125 0 0110.875 3.75h2.25A1.125 1.125 0 0114.25 4.875V7.5"/></svg>';
const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75C16.5 4.26472 14.4853 2.25 12 2.25C9.51472 2.25 7.5 4.26472 7.5 6.75V10.5M6.75 21.75H17.25C18.4926 21.75 19.5 20.7426 19.5 19.5V12.75C19.5 11.5074 18.4926 10.5 17.25 10.5H6.75C5.50736 10.5 4.5 11.5074 4.5 12.75V19.5C4.5 20.7426 5.50736 21.75 6.75 21.75Z"/></svg>';
const ICON_UNLOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75C13.5 4.26472 15.5147 2.25 18 2.25C20.4853 2.25 22.5 4.26472 22.5 6.75V10.5M3.75 21.75H14.25C15.4926 21.75 16.5 20.7426 16.5 19.5V12.75C16.5 11.5074 15.4926 10.5 14.25 10.5H3.75C2.50736 10.5 1.5 11.5074 1.5 12.75V19.5C1.5 20.7426 2.50736 21.75 3.75 21.75Z"/></svg>';
const ICON_EDIT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.651-1.65a1.5 1.5 0 112.121 2.12l-9.9 9.9a4.5 4.5 0 01-1.591.99l-3.26 1.087 1.088-3.26a4.5 4.5 0 01.99-1.59l9.9-9.9z"/><path stroke-linecap="round" stroke-linejoin="round" d="M18 8l-2-2"/></svg>';

async function renderRules(){
  if (!rulesEl || rulesLoaded) return;
  try {
    const res = await fetch(RULES_SRC);
    rulesEl.textContent = await res.text();
    rulesLoaded = true;
  } catch (e) {
    rulesEl.textContent = 'Failed to load rules.';
  }
}

const DELETE_ICON_STYLE = {
  width: '15px',
  height: '15px',
  minHeight: '15px',
  padding: '0',
  flex: '0 0 auto'
};

function applyDeleteIcon(btn){
  if(!btn) return;
  btn.innerHTML = ICON_TRASH;
  btn.setAttribute('aria-label','Delete');
  Object.assign(btn.style, DELETE_ICON_STYLE);
}

function applyDeleteIcons(root=document){
  qsa('button[data-del], button[data-act="del"]', root).forEach(applyDeleteIcon);
}

function applyEditIcon(btn){
  if(!btn) return;
  btn.innerHTML = ICON_EDIT;
  if(!btn.getAttribute('aria-label')){
    btn.setAttribute('aria-label','Edit');
  }
  Object.assign(btn.style, DELETE_ICON_STYLE);
}

function applyEditIcons(root=document){
  qsa('button[data-act="edit"]', root).forEach(applyEditIcon);
}

async function applyLockIcon(btn){
  if(!btn) return;
  const name = btn.dataset.lock;
  await syncPin(name);
  btn.innerHTML = hasPin(name) ? ICON_LOCK : ICON_UNLOCK;
  btn.setAttribute('aria-label','Toggle PIN');
  Object.assign(btn.style, DELETE_ICON_STYLE);
}

function applyLockIcons(root=document){
  qsa('button[data-lock]', root).forEach(btn=>{ applyLockIcon(btn); });
}

const AUDIO_CUE_SOURCES = {
  success:
    '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',
  warn:
    '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',
  error:
    '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',
  'dm-roll':
    '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'
    + 'MikgGhcVFhkeJjA8Sllpe42fsMDR3+s=',
  'coin-flip':
    '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'
    + '3dXIt6OMdV1GMSAUDQsPGCg7U22JpcA=',
  'campaign-log:add':
    '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'
    + 'cYOWqbvK2OPq7e7p4dXGtJ+Kc1xGMR8=',};

AUDIO_CUE_SOURCES['hp-damage'] = AUDIO_CUE_SOURCES.error;
AUDIO_CUE_SOURCES['hp-heal'] = AUDIO_CUE_SOURCES.success;
AUDIO_CUE_SOURCES['hp-down'] = AUDIO_CUE_SOURCES.warn;
AUDIO_CUE_SOURCES['sp-gain'] = AUDIO_CUE_SOURCES.success;
AUDIO_CUE_SOURCES['sp-spend'] = AUDIO_CUE_SOURCES.warn;
AUDIO_CUE_SOURCES['sp-empty'] = AUDIO_CUE_SOURCES.error;

const AUDIO_CUE_TYPE_MAP = {
  success: 'success',
  info: 'success',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  danger: 'error',
  failure: 'error'
};

const audioCueData = new Map();
const audioCueBufferPromises = new Map();

function decodeBase64ToUint8Array(base64){
  try {
    if (typeof globalThis?.atob === 'function') {
      const binary = globalThis.atob(base64);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (typeof globalThis?.Buffer === 'function') {
      return Uint8Array.from(globalThis.Buffer.from(base64, 'base64'));
    }
  } catch {}
  return new Uint8Array(0);
}

function preloadAudioCues(){
  if (audioCueData.size) return;
  try {
    Object.entries(AUDIO_CUE_SOURCES).forEach(([key, value]) => {
      const bytes = decodeBase64ToUint8Array(value);
      if (bytes.length) {
        audioCueData.set(key, bytes);
      }
    });
  } catch {}
}

preloadAudioCues();

let cueAudioCtx = null;

function ensureCueAudioContext(){
  if (cueAudioCtx) return cueAudioCtx;
  const Ctor = window?.AudioContext || window?.webkitAudioContext;
  if (!Ctor) return null;
  try {
    cueAudioCtx = new Ctor();
  } catch {
    cueAudioCtx = null;
  }
  return cueAudioCtx;
}

function resolveAudioCueType(type){
  if (typeof type !== 'string') return 'success';
  const normalized = type.toLowerCase();
  return AUDIO_CUE_TYPE_MAP[normalized] || 'success';
}

function decodeAudioBuffer(ctx, arrayBuffer){
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = buffer => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const rejectOnce = err => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    try {
      const maybePromise = ctx.decodeAudioData(arrayBuffer, resolveOnce, rejectOnce);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolveOnce, rejectOnce);
      }
    } catch (err) {
      rejectOnce(err);
    }
  });
}

function getAudioCueBufferPromise(ctx, cue){
  if (!ctx || !audioCueData.has(cue)) return null;
  let promise = audioCueBufferPromises.get(cue);
  if (!promise) {
    const bytes = audioCueData.get(cue);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    promise = decodeAudioBuffer(ctx, arrayBuffer).catch(err => {
      audioCueBufferPromises.delete(cue);
      throw err;
    });
    audioCueBufferPromises.set(cue, promise);
  }
  return promise;
}

const closeCueAudioContext = () => {
  if (cueAudioCtx && typeof cueAudioCtx.close === 'function') {
    const ctx = cueAudioCtx;
    cueAudioCtx = null;
    audioCueBufferPromises.clear();
    try {
      ctx.close();
    } catch {}
  }
};

window.addEventListener('pagehide', closeCueAudioContext, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    closeCueAudioContext();
  }
});
function playToneFallback(type){
  try {
    const ctx = ensureCueAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const rampUpDuration = 0.015;
    const totalDuration = 0.15;
    const sustainEnd = now + totalDuration - 0.03;
    osc.type = 'sine';
    osc.frequency.value = type === 'error' ? 220 : 880;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + rampUpDuration);
    gain.gain.setValueAtTime(0.1, sustainEnd);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + totalDuration);
  } catch (e) { /* noop */ }
}

function playTone(type){
  const cue = resolveAudioCueType(type);
  const ctx = ensureCueAudioContext();
  if (ctx && audioCueData.has(cue)) {
    if (typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch {}
    }
    const bufferPromise = getAudioCueBufferPromise(ctx, cue);
    if (bufferPromise) {
      bufferPromise.then(buffer => {
        try {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          gain.gain.value = cue === 'error' ? 0.25 : 0.2;
          source.buffer = buffer;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start();
        } catch {
          playToneFallback(type);
        }
      }).catch(() => {
        playToneFallback(type);
      });
      return;
    }
  }
  playToneFallback(type);
}
let toastTimeout;
let toastLastFocus = null;
let toastFocusGuardActive = false;
let toastFocusHandlersBound = false;
let toastControlsBound = false;

function focusToastElement(el, { preserveSource = true } = {}) {
  if (!el) return;
  if (typeof el.setAttribute === 'function') {
    const canCheck = typeof el.hasAttribute === 'function';
    if (!canCheck || !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
  }
  if (preserveSource) {
    const active = document.activeElement;
    if (active && active !== el && active !== document.body && document.contains(active)) {
      toastLastFocus = active;
    }
  }
  if (typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function restoreToastFocus() {
  const target = toastLastFocus;
  toastLastFocus = null;
  if (!target || typeof target.focus !== 'function') return;
  if (!document.contains(target)) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

function ensureToastFocusHandlers() {
  if (toastFocusHandlersBound) return;
  toastFocusHandlersBound = true;
  document.addEventListener('focusin', e => {
    if (!toastFocusGuardActive) return;
    const toastEl = $('toast');
    if (!toastEl || !toastEl.classList.contains('show')) return;
    if (toastEl.contains(e.target)) return;
    focusToastElement(toastEl, { preserveSource: false });
  });
}

function hideToastElement(options = {}) {
  const { restoreFocus = true } = options;
  const t = $('toast');
  if (!t) return;
  const wasShown = t.classList.contains('show');
  t.classList.remove('show');
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  toastFocusGuardActive = false;
  if (restoreFocus) {
    restoreToastFocus();
  } else {
    toastLastFocus = null;
  }
  if (wasShown) {
    dispatchToastEvent('cc:toast-dismissed');
  }
}

function dispatchToastEvent(name, detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

function toast(msg, type = 'info'){
  const t = $('toast');
  if(!t) return;
  let opts;
  if (typeof type === 'object' && type !== null) {
    opts = type;
  } else if (typeof type === 'number') {
    opts = { type: 'info', duration: type };
  } else {
    opts = { type, duration: 5000 };
  }
  const toastType = typeof opts.type === 'string' && opts.type ? opts.type : 'info';
  const duration = typeof opts.duration === 'number' ? opts.duration : 5000;
  const html = typeof opts.html === 'string' ? opts.html : '';
  if (html) {
    t.innerHTML = html;
  } else {
    t.textContent = msg ?? '';
  }
  t.className = toastType ? `toast ${toastType}` : 'toast';
  t.classList.add('show');
  playTone(toastType);
  clearTimeout(toastTimeout);
  ensureToastFocusHandlers();
  const shouldTrap = !(document?.body?.classList?.contains('modal-open'));
  toastFocusGuardActive = shouldTrap;
  focusToastElement(t, { preserveSource: true });
  if (!toastControlsBound) {
    toastControlsBound = true;
    t.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hideToastElement();
      }
    });
    t.addEventListener('click', () => hideToastElement());
  }
  if (Number.isFinite(duration) && duration > 0) {
    toastTimeout = setTimeout(()=>{
      toastTimeout = null;
      hideToastElement();
    }, duration);
  } else {
    toastTimeout = null;
  }
  dispatchToastEvent('cc:toast-shown', { message: msg, options: opts });
}

function dismissToast(){
  hideToastElement();
}

// Expose toast utilities globally so non-module scripts (e.g. dm.js)
// can display and control notifications.
window.toast = toast;
window.dismissToast = dismissToast;
window.playTone = playTone;

let funTipsPromise = null;
let getNextTipFn = null;
async function ensureFunTips(){
  if(getNextTipFn) return getNextTipFn;
  if(!funTipsPromise){
    funTipsPromise = import('./funTips.js')
      .then(mod => {
        if(mod && typeof mod.getNextTip === 'function'){
          getNextTipFn = mod.getNextTip;
          return getNextTipFn;
        }
        throw new Error('Fun tips module missing getNextTip');
      })
      .catch(err => {
        funTipsPromise = null;
        throw err;
      });
  }
  return funTipsPromise;
}

async function pinPrompt(message){
  const modal = $('modal-pin');
  const title = $('pin-title');
  const input = $('pin-input');
  const submit = $('pin-submit');
  const close = $('pin-close');
  if(!modal || !input || !submit || !close){
    return typeof prompt === 'function' ? prompt(message) : null;
  }
  title.textContent = message;
  return new Promise(resolve => {
    function cleanup(result){
      submit.removeEventListener('click', onSubmit);
      input.removeEventListener('keydown', onKey);
      close.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
      hide('modal-pin');
      resolve(result);
    }
    function onSubmit(){ cleanup(input.value); }
    function onCancel(){ cleanup(null); }
    function onKey(e){ if(e.key==='Enter'){ e.preventDefault(); onSubmit(); } }
    function onOverlay(e){ if(e.target===modal) onCancel(); }
    submit.addEventListener('click', onSubmit);
    input.addEventListener('keydown', onKey);
    close.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
    show('modal-pin');
    input.value='';
    input.focus();
  });
}

window.pinPrompt = pinPrompt;

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

const debouncedSetVh = debounce(setVh, 100);
window.addEventListener('resize', debouncedSetVh, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', debouncedSetVh, { passive: true });
}

// prevent negative numbers in numeric inputs
document.addEventListener('input', e=>{
  const el = e.target;
  if(el.matches('input[type="number"]') && el.value !== '' && Number(el.value) < 0){
    el.value = 0;
  }
});

/* ========= theme ========= */
const root = document.documentElement;
const themeToggleEl = qs('[data-theme-toggle]');
const themeSpinnerEl = themeToggleEl ? themeToggleEl.querySelector('.theme-toggle__spinner') : null;
const reducedMotionQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
if (themeSpinnerEl) {
  themeSpinnerEl.addEventListener('animationend', () => {
    themeSpinnerEl.classList.remove('theme-toggle__spinner--spinning');
  });
}
const THEMES = ['dark', 'light', 'high', 'forest', 'ocean', 'mutant', 'enhanced', 'magic', 'alien', 'mystic'];
const THEME_LABELS = {
  dark: 'Dark',
  light: 'Light',
  high: 'High Contrast',
  forest: 'Forest',
  ocean: 'Ocean',
  mutant: 'Mutant',
  enhanced: 'Enhanced Human',
  magic: 'Magic User',
  alien: 'Alien',
  mystic: 'Mystic'
};
const tabIconImages = qsa('[data-tab-icon]');
const DEFAULT_TAB_ICON_VARIANT = 'inverted';
const TAB_ICON_THEME_VARIANTS = {
  dark: 'inverted',
  light: 'original',
  high: 'inverted'
};
function setTabIconVariant(themeName){
  const variant = TAB_ICON_THEME_VARIANTS[themeName] || DEFAULT_TAB_ICON_VARIANT;
  if (variant) {
    root.dataset.tabIconVariant = variant;
  } else {
    delete root.dataset.tabIconVariant;
  }
  tabIconImages.forEach(img => {
    if (!img) return;
    const originalSrc = img.getAttribute('data-icon-original') || img.getAttribute('src');
    const invertedSrc = img.getAttribute('data-icon-inverted') || originalSrc;
    const nextSrc = variant === 'inverted' ? (invertedSrc || originalSrc) : originalSrc;
    if (nextSrc && img.getAttribute('src') !== nextSrc) {
      img.setAttribute('src', nextSrc);
    }
    if (variant) {
      img.setAttribute('data-icon-variant', variant);
    } else {
      img.removeAttribute('data-icon-variant');
    }
  });
}
/**
 * Apply a visual theme by toggling root classes and updating the button icon.
 * @param {string} t - theme identifier matching supported themes
 */
let activeTheme = null;
function spinThemeToggle(){
  if(!themeSpinnerEl) return;
  if(reducedMotionQuery && reducedMotionQuery.matches) return;
  themeSpinnerEl.classList.remove('theme-toggle__spinner--spinning');
  void themeSpinnerEl.offsetWidth;
  themeSpinnerEl.classList.add('theme-toggle__spinner--spinning');
}
function applyTheme(t, { animate = true } = {}){
  const themeName = THEMES.includes(t) ? t : 'dark';
  const themeChanged = themeName !== activeTheme;
  const classes = THEMES
    .filter(n => n !== 'dark')
    .map(n => `theme-${n}`);
  root.classList.remove(...classes);
  if (themeName !== 'dark') root.classList.add(`theme-${themeName}`);
  if (themeToggleEl) {
    themeToggleEl.setAttribute('data-theme', themeName);
    const readable = THEME_LABELS[themeName] || themeName;
    const description = `Cycle theme (current: ${readable})`;
    themeToggleEl.setAttribute('aria-label', description);
    themeToggleEl.setAttribute('title', description);
    const labelEl = themeToggleEl.querySelector('.theme-toggle__label');
    if (labelEl) labelEl.textContent = `Theme: ${readable}`;
    if (animate && themeChanged) {
      spinThemeToggle();
    }
  }
  setTabIconVariant(themeName);
  activeTheme = themeName;
}
function loadTheme(){
  const stored = localStorage.getItem('theme');
  const theme = stored && THEMES.includes(stored) ? stored : 'dark';
  if (stored && !THEMES.includes(stored)) localStorage.setItem('theme', theme);
  applyTheme(theme, { animate: false });
}
loadTheme();

function toggleTheme(){
  const curr = localStorage.getItem('theme') || 'dark';
  const index = THEMES.includes(curr) ? THEMES.indexOf(curr) : 0;
  const next = THEMES[(index + 1) % THEMES.length];
  localStorage.setItem('theme', next);
  applyTheme(next);
}


const CLASS_THEMES = {
  'Mutant':'mutant',
  'Enhanced Human':'enhanced',
  'Magic User':'magic',
  'Alien/Extraterrestrial':'alien',
  'Mystical Being':'mystic'
};
/**
 * Bind a select element so choosing certain classifications updates the theme.
 * @param {string} id - element id of the classification select
 */
function bindClassificationTheme(id){
  const sel=$(id);
  if(!sel) return;
  const helperClass='theme-transition';
  let cleanupAnimation=null;
  const apply=()=>{
    const t=CLASS_THEMES[sel.value];
    if(t){
      localStorage.setItem('theme', t);
      applyTheme(t);
      if(cleanupAnimation){
        cleanupAnimation();
        cleanupAnimation=null;
      }
      if(sel.classList.contains(helperClass)){
        sel.classList.remove(helperClass);
        void sel.offsetWidth;
      }
      const handleAnimationEnd=(event)=>{
        if(event.target!==sel) return;
        sel.classList.remove(helperClass);
        sel.removeEventListener('animationend', handleAnimationEnd);
        cleanupAnimation=null;
      };
      sel.addEventListener('animationend', handleAnimationEnd);
      cleanupAnimation=()=>{
        sel.classList.remove(helperClass);
        sel.removeEventListener('animationend', handleAnimationEnd);
      };
      sel.classList.add(helperClass);
    }
  };
  sel.addEventListener('change', apply);
  apply();
}
bindClassificationTheme('classification');

const btnMenu = $('btn-menu');
const menuActions = $('menu-actions');
if (btnMenu && menuActions) {
  let hideMenuTimer = null;
  let pendingHideListener = null;
  let isMenuOpen = !menuActions.hidden;

  const clearHideMenuCleanup = () => {
    if (pendingHideListener) {
      try {
        menuActions.removeEventListener('transitionend', pendingHideListener);
      } catch (err) {}
      pendingHideListener = null;
    }
    if (hideMenuTimer) {
      window.clearTimeout(hideMenuTimer);
      hideMenuTimer = null;
    }
  };

  const finalizeHide = () => {
    const shouldRestoreFocus = menuActions.contains(document.activeElement);
    clearHideMenuCleanup();
    menuActions.hidden = true;
    btnMenu.setAttribute('aria-expanded', 'false');
    btnMenu.classList.remove('open');
    if (shouldRestoreFocus && typeof btnMenu.focus === 'function') {
      try {
        btnMenu.focus({ preventScroll: true });
      } catch {
        btnMenu.focus();
      }
    }
  };

  const resetMenuButtonDelays = () => {
    const buttons = menuActions.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.style.removeProperty('--menu-item-index');
      btn.style.removeProperty('animation-delay');
    });
  };

  const hideMenu = (options = {}) => {
    const immediate = options === true || options.immediate === true;
    if (!isMenuOpen && menuActions.hidden && !menuActions.classList.contains('show')) {
      return;
    }
    isMenuOpen = false;
    resetMenuButtonDelays();
    const onTransitionEnd = event => {
      if (event.target === menuActions) finalizeHide();
    };
    clearHideMenuCleanup();
    if (immediate) {
      menuActions.classList.remove('show');
      finalizeHide();
      return;
    }
    pendingHideListener = onTransitionEnd;
    menuActions.classList.remove('show');
    menuActions.addEventListener('transitionend', onTransitionEnd, { once: true });
    hideMenuTimer = window.setTimeout(finalizeHide, 400);
  };

  const showMenu = () => {
    if (isMenuOpen && menuActions.classList.contains('show')) return;
    clearHideMenuCleanup();
    isMenuOpen = true;
    menuActions.hidden = false;
    const shouldFocusFirst = document.activeElement === btnMenu;
    requestAnimationFrame(() => {
      const buttons = Array.from(menuActions.querySelectorAll('button')).filter(btn => {
        if (btn.hidden) return false;
        if (btn.getAttribute('aria-hidden') === 'true') return false;
        const display = window.getComputedStyle(btn).display;
        return display !== 'none';
      });
      buttons.forEach((btn, index) => {
        btn.style.setProperty('--menu-item-index', index);
      });
      menuActions.classList.add('show');
      if (shouldFocusFirst) {
        const firstFocusable = menuActions.querySelector('button, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (firstFocusable && typeof firstFocusable.focus === 'function') {
          try {
            firstFocusable.focus({ preventScroll: true });
          } catch {
            firstFocusable.focus();
          }
        }
      }
    });
    btnMenu.setAttribute('aria-expanded', 'true');
    btnMenu.classList.add('open');
  };

  btnMenu.addEventListener('click', () => {
    if (isMenuOpen && !menuActions.hidden) hideMenu();
    else showMenu();
  });

  document.addEventListener('click', e => {
    if (!btnMenu.contains(e.target) && !menuActions.contains(e.target)) hideMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideMenu();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hideMenu({ immediate: true });
  });
}

/* ========= header ========= */
const headerEl = qs('header');
if (themeToggleEl) {
  themeToggleEl.addEventListener('click', e => {
    e.stopPropagation();
    toggleTheme();
  });
}

/* ========= tabs ========= */
function setTab(name){
  qsa('fieldset[data-tab]').forEach(s=> {
    const active = s.getAttribute('data-tab') === name;
    s.classList.toggle('active', active);
    s.setAttribute('aria-hidden', active ? 'false' : 'true');
    if ('inert' in s) {
      try {
        s.inert = !active;
      } catch (err) {}
    }
  });
  qsa('.tab').forEach(b=> {
    const active = b.getAttribute('data-go')===name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  try {
    localStorage.setItem('active-tab', name);
  } catch (e) {}
}

const tabButtons = Array.from(qsa('.tab'));
const TAB_ORDER = tabButtons.map(btn => btn.getAttribute('data-go')).filter(Boolean);

const getNavigationType = () => {
  if (typeof performance === 'undefined') return null;
  if (typeof performance.getEntriesByType === 'function') {
    const entries = performance.getEntriesByType('navigation');
    if (entries && entries.length) {
      const entry = entries[0];
      if (entry && typeof entry.type === 'string') return entry.type;
    }
  }
  const legacyNavigation = performance.navigation;
  if (legacyNavigation) {
    switch (legacyNavigation.type) {
      case legacyNavigation.TYPE_RELOAD:
        return 'reload';
      case legacyNavigation.TYPE_BACK_FORWARD:
        return 'back_forward';
      case legacyNavigation.TYPE_NAVIGATE:
        return 'navigate';
      case legacyNavigation.TYPE_RESERVED:
        return 'reserved';
      default:
        return null;
    }
  }
  return null;
};

const TAB_ANIMATION_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';
const TAB_ANIMATION_DURATION = 360;
const TAB_ANIMATION_OFFSET = 12;
const TAB_CONTAINER_CLASS = 'is-animating-tabs';
const reduceMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
let isTabAnimating = false;

const prefersReducedMotion = () => reduceMotionQuery ? reduceMotionQuery.matches : false;

function getActiveTabName(){
  const activeBtn = qs('.tab.active');
  return activeBtn ? activeBtn.getAttribute('data-go') : null;
}

function inferTabDirection(currentName, nextName){
  if(!currentName || !nextName) return null;
  const currentIndex = TAB_ORDER.indexOf(currentName);
  const nextIndex = TAB_ORDER.indexOf(nextName);
  if(currentIndex === -1 || nextIndex === -1 || currentIndex === nextIndex) return null;
  return nextIndex > currentIndex ? 'left' : 'right';
}

function cleanupPanelAnimation(panel){
  if(!panel) return;
  panel.classList.remove('animating');
  panel.style.removeProperty('pointer-events');
  panel.style.removeProperty('transform');
  panel.style.removeProperty('opacity');
  panel.style.removeProperty('will-change');
  panel.style.removeProperty('z-index');
  panel.style.removeProperty('filter');
  panel.style.removeProperty('visibility');
}

function animateTabTransition(currentName, nextName, direction){
  const targetPanel = qs(`fieldset[data-tab="${nextName}"]`);
  if(!targetPanel) return false;
  if(prefersReducedMotion() || typeof targetPanel.animate !== 'function') return false;

  const activePanel = currentName ? qs(`fieldset[data-tab="${currentName}"]`) : null;
  if(!activePanel) return false;

  const container = activePanel.parentElement;
  const activePanelHeight = activePanel.offsetHeight || activePanel.scrollHeight || 0;

  isTabAnimating = true;

  let cleanupContainer = null;

  const prepareContainerForAnimation = () => {
    if(!container || !(container instanceof HTMLElement)) return;
    let activeHeight = activePanelHeight;
    if(activeHeight <= 0){
      const activeRect = activePanel.getBoundingClientRect();
      activeHeight = activeRect.height || activePanel.scrollHeight || 0;
    }

    const prevHeight = container.style.height;
    const prevTransition = container.style.transition;
    const prevOverflow = container.style.overflow;
    const prevWillChange = container.style.willChange;

    const measureTargetHeight = () => {
      const rect = targetPanel.getBoundingClientRect();
      return rect.height || targetPanel.offsetHeight || targetPanel.scrollHeight || activeHeight;
    };
    let targetHeight = measureTargetHeight();
    if(targetHeight <= 0){
      targetHeight = activeHeight;
    }

    container.classList.add(TAB_CONTAINER_CLASS);
    container.style.height = `${activeHeight}px`;
    container.style.transition = `height ${TAB_ANIMATION_DURATION}ms ${TAB_ANIMATION_EASING}`;
    container.style.overflow = 'hidden';
    container.style.willChange = 'height';

    if(typeof requestAnimationFrame === 'function'){
      requestAnimationFrame(() => {
        container.style.height = `${targetHeight}px`;
      });
    } else {
      container.style.height = `${targetHeight}px`;
    }

    cleanupContainer = () => {
      container.classList.remove(TAB_CONTAINER_CLASS);
      if(prevHeight) container.style.height = prevHeight;
      else container.style.removeProperty('height');
      if(prevTransition) container.style.transition = prevTransition;
      else container.style.removeProperty('transition');
      if(prevOverflow) container.style.overflow = prevOverflow;
      else container.style.removeProperty('overflow');
      if(prevWillChange) container.style.willChange = prevWillChange;
      else container.style.removeProperty('will-change');
    };
  };

  activePanel.classList.add('animating');
  targetPanel.classList.add('animating');
  activePanel.style.pointerEvents = 'none';
  targetPanel.style.pointerEvents = 'none';
  activePanel.style.willChange = 'opacity, transform';
  targetPanel.style.willChange = 'opacity, transform';
  activePanel.style.zIndex = '3';
  targetPanel.style.zIndex = '4';
  prepareContainerForAnimation();
  targetPanel.style.opacity = '0';

  const axis = direction === 'up' || direction === 'down' ? 'Y' : 'X';
  const directionSign = direction === 'left' || direction === 'up' ? -1
    : direction === 'right' || direction === 'down' ? 1
      : 0;
  const translateDistance = `${directionSign * TAB_ANIMATION_OFFSET}px`;
  const zeroTranslate = `translate${axis}(0px)`;
  const offsetTranslate = directionSign === 0 ? zeroTranslate : `translate${axis}(${translateDistance})`;
  const enteringTransform = `${offsetTranslate} scale(0.98)`;
  const exitingTransform = `${offsetTranslate} scale(0.98)`;
  const neutralTransform = `${zeroTranslate} scale(1)`;

  targetPanel.style.transform = enteringTransform;
  activePanel.style.transform = neutralTransform;
  targetPanel.style.visibility = 'visible';

  const animations = [
    targetPanel.animate([
      { opacity: 0, transform: enteringTransform },
      { opacity: 1, transform: neutralTransform }
    ], { duration: TAB_ANIMATION_DURATION, easing: TAB_ANIMATION_EASING, fill: 'forwards' }),
    activePanel.animate([
      { opacity: 1, transform: neutralTransform },
      { opacity: 0, transform: exitingTransform }
    ], { duration: TAB_ANIMATION_DURATION, easing: TAB_ANIMATION_EASING, fill: 'forwards' })
  ];

  Promise.all(animations.map(anim => anim.finished.catch(() => {}))).then(() => {
    setTab(nextName);
  }).finally(() => {
    const finishCleanup = () => {
      cleanupPanelAnimation(activePanel);
      cleanupPanelAnimation(targetPanel);
      animations.forEach(anim => {
        try {
          if(typeof anim.cancel === 'function') anim.cancel();
        } catch (err) {}
      });
      if(typeof cleanupContainer === 'function') cleanupContainer();
      isTabAnimating = false;
    };
    if(typeof requestAnimationFrame === 'function') requestAnimationFrame(finishCleanup);
    else finishCleanup();
  });

  return true;
}

const switchTab = (name, options = {}) => {
  if(!name || isTabAnimating) return;

  const performSwitch = () => {
    const currentName = getActiveTabName();
    if(currentName === name) return;
    const desiredDirection = options.direction || inferTabDirection(currentName, name);
    if(!animateTabTransition(currentName, name, desiredDirection)){
      setTab(name);
    }
  };

  if (headerEl && window.scrollY > 0) {
    headerEl.classList.add('hide-tabs');
    const showTabs = () => {
      if (headerEl.classList.contains('hide-tabs')) {
        headerEl.classList.remove('hide-tabs');
        performSwitch();
      }
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (window.scrollY <= 1) {
        showTabs();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(showTabs, 600);
  } else {
    performSwitch();
  }
};
tabButtons.forEach(btn => btn.addEventListener('click', () => {
  const target = btn.getAttribute('data-go');
  if(target) switchTab(target);
}));
const navigationType = getNavigationType();
const shouldForceCombatTab = navigationType === 'navigate' || navigationType === 'reload' || navigationType === null;

const scrollToTopOfCombat = () => {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
  const scroll = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (err) {
      window.scrollTo(0, 0);
    }
  };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
  else scroll();
};

let initialTab = 'combat';
if (!shouldForceCombatTab) {
  try {
    const storedTab = localStorage.getItem('active-tab');
    if (storedTab && qs(`.tab[data-go="${storedTab}"]`)) initialTab = storedTab;
  } catch (e) {}
} else {
  scrollToTopOfCombat();
}
setTab(initialTab);

function getAdjacentTab(offset){
  if(!Number.isInteger(offset) || !offset) return null;
  const activeBtn = qs('.tab.active');
  if(!activeBtn) return null;
  const current = activeBtn.getAttribute('data-go');
  const idx = TAB_ORDER.indexOf(current);
  if(idx === -1) return null;
  const nextIdx = idx + offset;
  if(nextIdx < 0 || nextIdx >= TAB_ORDER.length) return null;
  return TAB_ORDER[nextIdx];
}

const mainEl = qs('main');
if(mainEl && TAB_ORDER.length){
  let touchStartX = 0;
  let touchStartY = 0;
  let swipeDirection = null;
  let swipeActive = false;

  const swipeState = {
    activePanel: null,
    targetPanel: null,
    targetName: null,
    direction: null,
    width: 1,
    progress: 0,
    lastDx: 0,
    isActive: false
  };

  const resetSwipeTracking = () => {
    touchStartX = 0;
    touchStartY = 0;
    swipeDirection = null;
    swipeActive = false;
  };

  const cleanupSwipePanels = () => {
    if(swipeState.activePanel) cleanupPanelAnimation(swipeState.activePanel);
    if(swipeState.targetPanel) cleanupPanelAnimation(swipeState.targetPanel);
    swipeState.activePanel = null;
    swipeState.targetPanel = null;
    swipeState.targetName = null;
    swipeState.direction = null;
    swipeState.width = 1;
    swipeState.progress = 0;
    swipeState.lastDx = 0;
    swipeState.isActive = false;
    mainEl.classList.remove('is-swiping');
    mainEl.style.removeProperty('--swipe-progress');
    isTabAnimating = false;
  };

  const initSwipePanels = direction => {
    if(!direction) return false;
    const activeName = getActiveTabName();
    if(!activeName) return false;
    const offset = direction === 'left' ? 1 : -1;
    const targetName = getAdjacentTab(offset);
    if(!targetName) return false;
    const activePanel = qs(`fieldset[data-tab="${activeName}"]`);
    const targetPanel = qs(`fieldset[data-tab="${targetName}"]`);
    if(!activePanel || !targetPanel) return false;
    const rect = mainEl.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth || 1);

    swipeState.activePanel = activePanel;
    swipeState.targetPanel = targetPanel;
    swipeState.targetName = targetName;
    swipeState.direction = direction;
    swipeState.width = width;
    swipeState.progress = 0;
    swipeState.lastDx = 0;
    swipeState.isActive = true;
    isTabAnimating = true;

    [activePanel, targetPanel].forEach(panel => {
      panel.classList.add('animating');
      panel.style.pointerEvents = 'none';
      panel.style.willChange = 'transform, opacity';
    });

    const startOffset = direction === 'left' ? width : -width;
    targetPanel.style.transform = `translate3d(${startOffset}px,0,0)`;
    targetPanel.style.opacity = '0';
    mainEl.classList.add('is-swiping');
    return true;
  };

  const updateSwipeProgress = dx => {
    if(!swipeState.isActive) return;
    const clampedDx = Math.max(Math.min(dx, swipeState.width), -swipeState.width);
    const progress = Math.min(1, Math.abs(clampedDx) / swipeState.width);
    const activePanel = swipeState.activePanel;
    const targetPanel = swipeState.targetPanel;
    if(activePanel){
      activePanel.style.transform = `translate3d(${clampedDx}px,0,0)`;
      activePanel.style.opacity = `${1 - (progress * 0.4)}`;
    }
    if(targetPanel){
      const startOffset = swipeState.direction === 'left' ? swipeState.width : -swipeState.width;
      const translateTarget = startOffset + clampedDx;
      targetPanel.style.transform = `translate3d(${translateTarget}px,0,0)`;
      targetPanel.style.opacity = `${0.35 + (progress * 0.65)}`;
    }
    swipeState.progress = progress;
    swipeState.lastDx = clampedDx;
    mainEl.style.setProperty('--swipe-progress', progress.toFixed(3));
  };

  const finishSwipe = shouldCommit => {
    if(!swipeState.isActive){
      cleanupSwipePanels();
      return;
    }
    const activePanel = swipeState.activePanel;
    const targetPanel = swipeState.targetPanel;
    const targetName = swipeState.targetName;
    const direction = swipeState.direction;
    const width = swipeState.width;
    const progress = swipeState.progress;
    const currentDx = swipeState.lastDx;
    const startOffset = direction === 'left' ? width : -width;
    const remainingFactor = shouldCommit ? (1 - progress) : progress;
    const duration = Math.max(140, Math.round(TAB_ANIMATION_DURATION * Math.max(0.35, remainingFactor || 0.35)));
    const animations = [];

    if(activePanel && typeof activePanel.animate === 'function'){
      const currentOpacity = parseFloat(activePanel.style.opacity || '1') || 1;
      animations.push(activePanel.animate([
        { transform: `translate3d(${currentDx}px,0,0)`, opacity: currentOpacity },
        { transform: shouldCommit ? `translate3d(${direction === 'left' ? -width : width}px,0,0)` : 'translate3d(0,0,0)', opacity: shouldCommit ? 0 : 1 }
      ], { duration, easing: TAB_ANIMATION_EASING, fill: 'forwards' }));
    } else if(activePanel){
      activePanel.style.transform = shouldCommit ? `translate3d(${direction === 'left' ? -width : width}px,0,0)` : 'translate3d(0,0,0)';
      activePanel.style.opacity = shouldCommit ? '0' : '1';
    }

    if(targetPanel){
      const currentOpacity = parseFloat(targetPanel.style.opacity || '0') || 0;
      if(typeof targetPanel.animate === 'function'){
        animations.push(targetPanel.animate([
          { transform: `translate3d(${startOffset + currentDx}px,0,0)`, opacity: currentOpacity },
          { transform: shouldCommit ? 'translate3d(0,0,0)' : `translate3d(${startOffset}px,0,0)`, opacity: shouldCommit ? 1 : 0 }
        ], { duration, easing: TAB_ANIMATION_EASING, fill: 'forwards' }));
      } else {
        targetPanel.style.transform = shouldCommit ? 'translate3d(0,0,0)' : `translate3d(${startOffset}px,0,0)`;
        targetPanel.style.opacity = shouldCommit ? '1' : '0';
      }
    }

    Promise.all(animations.map(anim => anim && anim.finished ? anim.finished.catch(() => {}) : Promise.resolve())).then(() => {
      if(shouldCommit && targetName){
        setTab(targetName);
      }
    }).finally(() => {
      cleanupSwipePanels();
    });
  };

  mainEl.addEventListener('touchstart', e => {
    if(e.touches.length !== 1){
      if(swipeState.isActive) finishSwipe(false);
      resetSwipeTracking();
      return;
    }
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    swipeDirection = null;
    swipeActive = true;
  }, { passive: true });

  mainEl.addEventListener('touchmove', e => {
    if(!swipeActive || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if(!swipeDirection){
      if(Math.abs(dx) < 12) return;
      if(Math.abs(dx) <= Math.abs(dy)){
        if(swipeState.isActive) finishSwipe(false);
        resetSwipeTracking();
        return;
      }
      swipeDirection = dx < 0 ? 'left' : 'right';
      if(!initSwipePanels(swipeDirection)){
        resetSwipeTracking();
        return;
      }
    }
    if(!swipeState.isActive && !initSwipePanels(swipeDirection)){
      resetSwipeTracking();
      return;
    }
    updateSwipeProgress(dx);
  }, { passive: true });

  mainEl.addEventListener('touchend', e => {
    if(!swipeActive){
      resetSwipeTracking();
      return;
    }
    const touch = e.changedTouches[0];
    if(!touch){
      finishSwipe(false);
      resetSwipeTracking();
      return;
    }
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const distance = Math.abs(dx);
    const shouldCommit = swipeState.isActive && Math.abs(dx) > Math.abs(dy) && (distance > 60 || (swipeState.width && distance > swipeState.width * 0.32));
    finishSwipe(shouldCommit);
    resetSwipeTracking();
  }, { passive: true });

  mainEl.addEventListener('touchcancel', () => {
    finishSwipe(false);
    resetSwipeTracking();
  }, { passive: true });
}

const tickerTrack = qs('[data-fun-ticker-track]');
const tickerText = qs('[data-fun-ticker-text]');
if(tickerTrack && tickerText){
  tickerTrack.style.setProperty('--ticker-duration', `${FUN_TICKER_DURATION_MS}ms`);
  let tickerIterations = 0;
  const updateTicker = async () => {
    try{
      const getNextTip = await ensureFunTips();
      if(typeof getNextTip === 'function'){
        tickerText.textContent = getNextTip();
      }
    }catch(err){
      console.error('Failed to update fun tip ticker', err);
      if(!tickerText.textContent){
        tickerText.textContent = 'Fun tips are loading…';
      }
    }
  };
  updateTicker();
  tickerTrack.addEventListener('animationiteration', () => {
    tickerIterations += 1;
    if(tickerIterations % 3 === 0){
      updateTicker();
    }
  });
}

const m24nTrack = qs('[data-m24n-ticker-track]');
const m24nText = qs('[data-m24n-ticker-text]');
if(m24nTrack && m24nText){
  const BASE_HEADLINE_DURATION = BASE_TICKER_DURATION_MS;
  // Headline ticker scroll speed (px/sec). Adjust to tune readability.
  const HEADLINE_SCROLL_SPEED_PX_PER_SECOND = DEVICE_INFO.isMobile ? 55 : 85;
  if(typeof window !== 'undefined'){
    window.mn24TickerSpeed = HEADLINE_SCROLL_SPEED_PX_PER_SECOND;
  }
  const BUFFER_DURATION = 3000;
  const ROTATION_WINDOW = 10 * 60 * 1000;
  const HEADLINES_PER_ROTATION = Math.max(1, Math.floor(ROTATION_WINDOW / (BASE_HEADLINE_DURATION + BUFFER_DURATION)));
  let headlines = [];
  let rotationItems = [];
  let rotationIndex = 0;
  let rotationStart = 0;
  let animationTimer = null;
  let bufferTimer = null;

  function clearTimers(){
    if(animationTimer){
      clearTimeout(animationTimer);
      animationTimer = null;
    }
    if(bufferTimer){
      clearTimeout(bufferTimer);
      bufferTimer = null;
    }
  }

  function resetTrack(){
    m24nTrack.classList.remove('is-animating');
    m24nTrack.style.transform = 'translate3d(100%,0,0)';
  }

  function updateHeadlineDuration(){
    const trackStyles = window.getComputedStyle(m24nTrack);
    const gapValue = Number.parseFloat(
      trackStyles.getPropertyValue('column-gap') ||
      trackStyles.getPropertyValue('gap') ||
      '0'
    ) || 0;
    const trackWidth = m24nTrack.scrollWidth;
    const viewportWidth = m24nTrack.parentElement?.clientWidth || m24nTrack.offsetWidth;
    const travelDistance = trackWidth + viewportWidth + gapValue;
    m24nTrack.style.setProperty('--ticker-distance', `${Math.round(travelDistance)}px`);
    if(!Number.isFinite(travelDistance) || travelDistance <= 0){
      m24nTrack.style.setProperty('--ticker-duration', `${Math.round(BASE_HEADLINE_DURATION)}ms`);
      return BASE_HEADLINE_DURATION;
    }
    const durationMs = Math.max(
      1000,
      Math.round((travelDistance / HEADLINE_SCROLL_SPEED_PX_PER_SECOND) * 1000)
    );
    m24nTrack.style.setProperty('--ticker-duration', `${Math.round(durationMs)}ms`);
    return durationMs;
  }

  function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildRotation(){
    rotationStart = Date.now();
    rotationIndex = 0;
    if(!headlines.length){
      rotationItems = [];
      return;
    }
    const pool = shuffle([...headlines]);
    const selectionSize = Math.min(pool.length, HEADLINES_PER_ROTATION);
    rotationItems = pool.slice(0, selectionSize);
  }

  async function loadHeadlines(){
    try{
      const res = await fetch('News.txt', { cache: 'no-store' });
      if(!res || !res.ok){
        throw new Error(`Failed to fetch headlines (${res ? res.status : 'no response'})`);
      }
      const rawText = await res.text();
      const sets = [];
      const lines = rawText.split(/\r?\n/);
      let current = [];
      const pushCurrent = () => {
        if(!current.length) return;
        const combined = current.join(' ')
          .replace(/\s*\|\s*/g, ' | ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if(combined) sets.push(combined);
        current = [];
      };
      for(const line of lines){
        const trimmed = line.trim();
        if(!trimmed) continue;
        const startMatch = trimmed.match(/^(\d+)\.\s*(.*)$/);
        if(startMatch){
          pushCurrent();
          current.push(startMatch[2]);
        }else if(current.length){
          current.push(trimmed);
        }
      }
      pushCurrent();
      headlines = sets.slice(0, 100);
      if(!headlines.length){
        throw new Error('No MN24/7 headlines available');
      }
      buildRotation();
    }catch(err){
      console.error('Failed to load MN24/7 ticker', err);
      m24nText.textContent = 'MN24/7 feed temporarily offline.';
    }
  }

  function scheduleNextHeadline(){
    clearTimers();
    if(!headlines.length){
      return;
    }
    if(!rotationItems.length){
      buildRotation();
    }
    if(!rotationItems.length){
      return;
    }
    if(Date.now() - rotationStart >= ROTATION_WINDOW){
      buildRotation();
    }
    if(!rotationItems.length){
      return;
    }
    const headline = rotationItems[rotationIndex] || rotationItems[0];
    rotationIndex = (rotationIndex + 1) % rotationItems.length;
    m24nText.textContent = headline;
    resetTrack();
    requestAnimationFrame(() => {
      const duration = updateHeadlineDuration();
      void m24nTrack.offsetWidth;
      m24nTrack.classList.add('is-animating');
      animationTimer = window.setTimeout(() => {
        resetTrack();
        bufferTimer = window.setTimeout(scheduleNextHeadline, BUFFER_DURATION);
      }, duration);
    });
  }

  loadHeadlines().then(() => {
    if(rotationItems.length){
      scheduleNextHeadline();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){
      clearTimers();
      resetTrack();
    }else if(headlines.length && !animationTimer && !bufferTimer){
      bufferTimer = window.setTimeout(scheduleNextHeadline, BUFFER_DURATION);
    }
  });
}

/* ========= ability grid + autos ========= */
const ABILS = ['str','dex','con','int','wis','cha'];
const abilGrid = $('abil-grid');
abilGrid.innerHTML = ABILS.map(a=>`
  <div class="ability-box">
    <label for="${a}">${a.toUpperCase()}</label>
    <div class="score">
      <select id="${a}"></select>
      <span class="mod" id="${a}-mod">+0</span>
    </div>
  </div>`).join('');
ABILS.forEach(a=>{ const sel=$(a); for(let v=10; v<=28; v++) sel.add(new Option(v,v)); sel.value='10'; });

const saveGrid = $('saves');
saveGrid.innerHTML = ABILS.map(a=>`
  <div class="ability-box">
    <span class="ability-label">${a.toUpperCase()}</span>
    <div class="score"><span class="score-val" id="save-${a}">+0</span></div>
    <label class="inline"><input type="checkbox" id="save-${a}-prof"/> Proficient</label>
    <button class="btn-sm" data-roll-save="${a}">Roll</button>
    <span class="pill result" id="save-${a}-res" data-placeholder="000"></span>
  </div>
`).join('');

const SKILLS = [
  { name: 'Acrobatics', abil: 'dex' },
  { name: 'Athletics', abil: 'str' },
  { name: 'Biocontrol', abil: 'wis' },
  { name: 'Deception', abil: 'cha' },
  { name: 'History', abil: 'int' },
  { name: 'Insight', abil: 'wis' },
  { name: 'Intimidation', abil: 'cha' },
  { name: 'Investigation', abil: 'int' },
  { name: 'Medicine', abil: 'wis' },
  { name: 'Nature', abil: 'int' },
  { name: 'Perception', abil: 'wis' },
  { name: 'Performance', abil: 'cha' },
  { name: 'Persuasion', abil: 'cha' },
  { name: 'Religion', abil: 'int' },
  { name: 'Sleight of Hand', abil: 'dex' },
  { name: 'Stealth', abil: 'dex' },
  { name: 'Survival', abil: 'wis' },
  { name: 'Technology', abil: 'int' }
];
const escapeRegExp = value => String(value).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
const ABILITY_FULL_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
const skillGrid = $('skills');
skillGrid.innerHTML = SKILLS.map((s,i)=>`
  <div class="ability-box">
    <span class="ability-label">${s.name}</span>
    <div class="score"><span class="score-val" id="skill-${i}">+0</span></div>
    <label class="inline"><input type="checkbox" id="skill-${i}-prof"/> Proficient</label>
    <button class="btn-sm" data-roll-skill="${i}">Roll</button>
    <span class="pill result" id="skill-${i}-res" data-placeholder="000"></span>
  </div>
`).join('');

qsa('[data-roll-save]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const a = btn.dataset.rollSave;
    const pb = num(elProfBonus.value)||2;
    const abilityMod = mod($(a).value);
    const profBonus = $('save-'+a+'-prof').checked ? pb : 0;
    const baseBonuses = [
      { label: `${a.toUpperCase()} mod`, value: abilityMod, includeZero: true },
    ];
    if (profBonus) baseBonuses.push({ label: 'Prof', value: profBonus });
    rollWithBonus(
      `${a.toUpperCase()} save`,
      abilityMod + profBonus,
      $('save-'+a+'-res'),
      { type: 'save', ability: a.toUpperCase(), baseBonuses }
    );
  });
});
qsa('[data-roll-skill]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const i = num(btn.dataset.rollSkill);
    const s = SKILLS[i];
    const pb = num(elProfBonus.value)||2;
    const abilityMod = mod($(s.abil).value);
    const profBonus = $('skill-'+i+'-prof').checked ? pb : 0;
    const baseBonuses = [
      { label: `${s.abil.toUpperCase()} mod`, value: abilityMod, includeZero: true },
    ];
    if (profBonus) baseBonuses.push({ label: 'Prof', value: profBonus });
    let roleplay = false;
    try {
      const rpState = CC?.RP?.get?.() || {};
      if (rpState.surgeActive && ['cha','wis','int'].includes(s.abil)) {
        roleplay = window.confirm('Roleplay/Leadership?');
      }
    } catch {}
    rollWithBonus(
      `${s.name} check`,
      abilityMod + profBonus,
      $('skill-'+i+'-res'),
      {
        type: 'skill',
        ability: s.abil.toUpperCase(),
        skill: s.name,
        roleplay,
        baseBonuses,
      }
    );
  });
});

const STATUS_EFFECTS = [
  { id: 'blinded', name: 'Blinded', desc: 'A blinded creature cannot see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature’s attack rolls have disadvantage.' },
  { id: 'charmed', name: 'Charmed', desc: 'A charmed creature can’t attack the charmer or target the charmer with harmful abilities or magical effects.' },
  { id: 'deafened', name: 'Deafened', desc: 'A deafened creature can’t hear and automatically fails any ability check that requires hearing.' },
  { id: 'frightened', name: 'Frightened', desc: 'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.' },
  { id: 'grappled', name: 'Grappled', desc: 'A grappled creature’s speed becomes 0, and it can’t benefit from any bonus to its speed.' },
  { id: 'incapacitated', name: 'Incapacitated', desc: 'An incapacitated creature can’t take actions or reactions.' },
  { id: 'invisible', name: 'Invisible', desc: 'An invisible creature is impossible to see without the aid of magic or a special sense.' },
  { id: 'paralyzed', name: 'Paralyzed', desc: 'A paralyzed creature is incapacitated and can’t move or speak.' },
  { id: 'petrified', name: 'Petrified', desc: 'A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance.' },
  { id: 'poisoned', name: 'Poisoned', desc: 'A poisoned creature has disadvantage on attack rolls and ability checks.' },
  { id: 'prone', name: 'Prone', desc: 'A prone creature’s only movement option is to crawl unless it stands up.' },
  { id: 'restrained', name: 'Restrained', desc: 'A restrained creature’s speed becomes 0, and it can’t benefit from any bonus to its speed.' },
  { id: 'stunned', name: 'Stunned', desc: 'A stunned creature is incapacitated, can’t move, and can speak only falteringly.' },
  { id: 'unconscious', name: 'Unconscious', desc: 'An unconscious creature is incapacitated, can’t move or speak, and is unaware of its surroundings.' }
];

const statusGrid = $('statuses');
const activeStatuses = new Set();
if (statusGrid) {
  statusGrid.innerHTML = STATUS_EFFECTS.map(s => `
    <label class="status-option" for="status-${s.id}">
      <input type="checkbox" id="status-${s.id}" />
      <span>${s.name}</span>
    </label>
  `).join('');
  STATUS_EFFECTS.forEach(s => {
    const cb = $('status-' + s.id);
    if (cb) {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          activeStatuses.add(s.name);
          toast(`${s.name}: ${s.desc}`, { type: 'info', duration: 8000 });
          logAction(`Status effect gained: ${s.name}`);
        } else {
          activeStatuses.delete(s.name);
          logAction(`Status effect removed: ${s.name}`);
        }
      });
    }
  });
}

const ACTION_BUTTONS = 'button:not(.tab), [role="button"], [data-roll-save], [data-roll-skill], [data-add], [data-del]';
document.addEventListener('click', e => {
  if (!activeStatuses.size) return;

  const btn = e.target.closest(ACTION_BUTTONS);
  if (!btn) return;

  if (btn.closest('header .top, header .tabs, #statuses, #modal-enc, #modal-log, #modal-log-full, #modal-rules, #modal-campaign')) {
    return;
  }

  toast('Afflicted by: ' + Array.from(activeStatuses).join(', '), 'error');
}, true);

const ALIGNMENT_PERKS = {
  'Paragon (Lawful Light)': ['Inspire allies with unwavering justice.'],
  'Guardian (Neutral Light)': ['Protect an ally once per encounter.'],
  'Vigilante (Chaotic Light)': ['Advantage on stealth checks in urban areas.'],
  'Sentinel (Lawful Neutral)': ['+1 to saves against coercion.'],
  'Outsider (True Neutral)': ['Reroll one failed check per day.'],
  'Wildcard (Chaotic Neutral)': ['Add your Wisdom modifier to initiative.'],
  'Inquisitor (Lawful Shadow)': ['Bonus to Insight checks to detect lies.'],
  'Anti-Hero (Neutral Shadow)': ['Gain temporary hit points when you drop a foe.'],
  'Renegade (Chaotic Shadow)': ['Once per encounter, add +2 damage to a hit.']
};

const CLASSIFICATION_PERKS = {
  'Mutant': ['Begin with an extra minor power related to your mutation.'],
  'Enhanced Human': ['Increase one ability score by 1.'],
  'Magic User': ['Learn a basic spell from any school.'],
  'Alien/Extraterrestrial': ['Gain resistance to one damage type of your choice.'],
  'Mystical Being': ['Communicate with spirits for guidance.']
};

const POWER_STYLE_PERKS = {
  'Physical Powerhouse': ['Melee attacks deal +1 damage.'],
  'Energy Manipulator': ['Gain a ranged energy attack.'],
  'Speedster': ['Dash as a bonus action.'],
  'Telekinetic/Psychic': ['Move small objects with your mind.'],
  'Illusionist': ['Create minor illusions at will.'],
  'Shape-shifter': ['Alter your appearance slightly.'],
  'Elemental Controller': ['Resist environmental hazards of your element.']
};

const ORIGIN_PERKS = {
  'The Accident': ['Resistance to the damage type that created you.'],
  'The Experiment': ['Reroll a failed save once per long rest.'],
  'The Legacy': ['Start with an heirloom item.'],
  'The Awakening': ['Gain proficiency in one skill.'],
  'The Pact': ['Call upon your patron for minor aid.'],
  'The Lost Time': ['Possess knowledge from a bygone era.'],
  'The Exposure': ['Sense the presence of similar energies.'],
  'The Rebirth': ['+1 to death saving throws.'],
  'The Vigil': ['Remain alert without sleep for 24 hours.'],
  'The Redemption': ['Advantage on persuasion checks for second chances.']
};

// faction reputation configuration moved to separate module

// handle special perk behavior (stat boosts, initiative mods, etc.)

const INITIATIVE_BONUS_REGEX = /([+-]\d+)\s*(?:to\s+)?initiative(?:\s+(?:bonus|modifier))?\b/gi;

const rollBonusRegistry = (() => {
  const entries = new Set();
  const ownerEntries = new WeakMap();
  const ownerTokens = new Map();
  const globalOwner = Object.freeze({ id: 'global-roll-bonus-owner' });

  const normalizeSkill = value =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  const asOwner = owner => {
    if (!owner) return globalOwner;
    if (typeof owner === 'object' || typeof owner === 'function') return owner;
    const key = String(owner);
    if (!ownerTokens.has(key)) ownerTokens.set(key, { id: key });
    return ownerTokens.get(key);
  };

  const release = owner => {
    const resolvedOwner = asOwner(owner);
    const existing = ownerEntries.get(resolvedOwner);
    if (!existing) return;
    existing.forEach(entry => entries.delete(entry));
    ownerEntries.delete(resolvedOwner);
  };

  const normalizeList = value => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  };

  const normalizeConfig = (owner, config) => {
    if (!config || (config.value === undefined && typeof config.getValue !== 'function')) {
      return null;
    }
    const getValue = typeof config.getValue === 'function' ? config.getValue : null;
    const staticValue = Number(config.value);
    if (!getValue && (!Number.isFinite(staticValue) || staticValue === 0)) {
      return null;
    }
    const types = new Set();
    normalizeList(config.types ?? config.type).forEach(type => {
      if (!type) return;
      types.add(String(type).toLowerCase());
    });
    const abilities = new Set();
    normalizeList(config.abilities ?? config.ability).forEach(ability => {
      if (!ability) return;
      abilities.add(String(ability).toUpperCase());
    });
    const skills = new Set();
    normalizeList(config.skills ?? config.skill).forEach(skill => {
      if (!skill) return;
      skills.add(normalizeSkill(skill));
    });
    const matcher = typeof config.appliesTo === 'function' ? config.appliesTo : null;
    return {
      owner,
      getValue,
      value: Number.isFinite(staticValue) ? staticValue : 0,
      label: typeof config.label === 'string' ? config.label : '',
      breakdown: typeof config.breakdown === 'string' ? config.breakdown : '',
      source: typeof config.source === 'string' ? config.source : '',
      types,
      abilities,
      skills,
      matcher,
    };
  };

  const applies = (entry, opts) => {
    if (entry.types.size && (!opts.type || !entry.types.has(opts.type))) return false;
    if (entry.abilities.size && (!opts.ability || !entry.abilities.has(opts.ability))) return false;
    if (entry.skills.size && (!opts.skill || !entry.skills.has(opts.skill))) return false;
    if (entry.matcher && entry.matcher(opts.options) !== true) return false;
    return true;
  };

  const collect = (opts = {}) => {
    const normalized = {
      type: typeof opts.type === 'string' ? opts.type.toLowerCase() : '',
      ability: typeof opts.ability === 'string' ? opts.ability.toUpperCase() : '',
      skill: normalizeSkill(opts.skill),
      options: opts,
    };
    const results = [];
    entries.forEach(entry => {
      if (!applies(entry, normalized)) return;
      const value = entry.getValue ? Number(entry.getValue(opts)) : entry.value;
      if (!Number.isFinite(value) || value === 0) return;
      let breakdownText = entry.breakdown;
      if (!breakdownText) {
        const sign = value >= 0 ? '+' : '';
        if (entry.label) {
          breakdownText = `${entry.label} ${sign}${value}`;
        } else if (entry.source) {
          breakdownText = `${entry.source} ${sign}${value}`;
        } else {
          breakdownText = `${sign}${value}`;
        }
      }
      results.push({
        entry,
        value,
        breakdown: breakdownText,
      });
    });
    return results;
  };

  const register = (owner, configs = []) => {
    const resolvedOwner = asOwner(owner);
    release(resolvedOwner);
    const list = normalizeList(configs);
    const nextEntries = [];
    list.forEach(config => {
      const entry = normalizeConfig(resolvedOwner, config);
      if (!entry) return;
      entries.add(entry);
      nextEntries.push(entry);
    });
    if (nextEntries.length) ownerEntries.set(resolvedOwner, nextEntries);
  };

  return { register, release, collect };
})();

function formatBreakdown(label, value, opts = {}) {
  const includeZero = opts.includeZero === true;
  const num = Number(value);
  if (!Number.isFinite(num) || (!includeZero && num === 0)) return null;
  const sign = num >= 0 ? '+' : '';
  if (label) return `${label} ${sign}${num}`;
  return `${sign}${num}`;
}

function resolveRollBonus(baseBonus = 0, opts = {}) {
  const base = Number(baseBonus) || 0;
  const baseBreakdown = [];
  const appliedBase = Array.isArray(opts.baseBonuses) ? opts.baseBonuses : [];
  appliedBase.forEach(part => {
    const text = formatBreakdown(part?.label, part?.value, { includeZero: part?.includeZero });
    if (text) baseBreakdown.push(text);
  });

  let modifier = base;
  const registryBonuses = rollBonusRegistry.collect(opts);
  const bonusBreakdown = [];
  registryBonuses.forEach(({ value, breakdown }) => {
    modifier += value;
    if (breakdown) bonusBreakdown.push(breakdown);
  });

  const additional = Array.isArray(opts.additionalBonuses) ? opts.additionalBonuses : [];
  additional.forEach(part => {
    const value = Number(part?.value);
    if (!Number.isFinite(value) || value === 0) return;
    modifier += value;
    const text = part?.breakdown || formatBreakdown(part?.label, value, { includeZero: part?.includeZero });
    if (text) bonusBreakdown.push(text);
  });

  const breakdown = [...baseBreakdown, ...bonusBreakdown];
  const appliedBonuses = registryBonuses.map(({ entry, value, breakdown: text }) => ({
    value,
    breakdown: text,
    source: entry.source,
    label: entry.label,
    types: Array.from(entry.types),
    abilities: Array.from(entry.abilities),
    skills: Array.from(entry.skills),
  }));

  return {
    modifier,
    baseBonus: base,
    breakdown,
    baseBreakdown,
    bonusBreakdown,
    appliedBonuses,
  };
}

if (typeof window !== 'undefined') {
  window.RollBonusRegistry = rollBonusRegistry;
  window.resolveRollBonus = resolveRollBonus;
}
let currentInitiativeBonus = 0;
let addWisToInitiative = false;
let enhancedAbility = '';
let powerStyleTCBonus = 0;
let originTCBonus = 0;
const activePowerCards = new Set();

function handlePerkEffects(li, text){
  text = typeof text === 'string' ? text : String(text || '');
  const lower = text.toLowerCase();
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const registryEntries = [];
  const registerPerkBonus = config => {
    if (!config) return;
    const entry = { ...config };
    const value = Number(entry.value);
    if (!Number.isFinite(value) || value === 0) return;
    entry.value = value;
    if (!entry.label) entry.label = 'Perk';
    const context = entry.source || normalizedText || 'Perk bonus';
    if (!entry.source) entry.source = context;
    if (!entry.breakdown) {
      entry.breakdown = `${context} (${value >= 0 ? '+' : ''}${value})`;
    }
    registryEntries.push(entry);
  };
  const hasQualifier = fragment => /\b(against|versus|vs\.?|when|while|during|if)\b/i.test(fragment || '');
  const applyMatches = (regex, handler) => {
    if (!(regex instanceof RegExp)) return;
    const baseFlags = typeof regex.flags === 'string'
      ? regex.flags
      : `${regex.ignoreCase ? 'i' : ''}${regex.multiline ? 'm' : ''}${regex.unicode ? 'u' : ''}${regex.sticky ? 'y' : ''}${regex.dotAll ? 's' : ''}`;
    const flags = baseFlags.includes('g') ? baseFlags : `${baseFlags}g`;
    const pattern = new RegExp(regex.source, flags);
    let match;
    while ((match = pattern.exec(text))) {
      handler(match);
    }
  };
  let bonus = 0;
  if(/increase one ability score by 1/.test(lower)){
    const select = document.createElement('select');
    select.id = 'enhanced-ability';
    select.innerHTML = `<option value="">Choose ability</option>` +
      ABILS.map(a=>`<option value="${a}">${a.toUpperCase()}</option>`).join('');
    // restore saved selection without reapplying the bonus
    try{
      const saved = JSON.parse(localStorage.getItem(AUTO_KEY) || '{}')['enhanced-ability'];
      if(saved && ABILS.includes(saved)){
        select.value = saved;
        enhancedAbility = saved;
      }
    }catch(e){ /* noop */ }
    select.addEventListener('change', ()=>{
      const key = select.value;
      if(enhancedAbility && enhancedAbility !== key){
        const elPrev = $(enhancedAbility);
        if(elPrev){
          const reverted = revertAbilityScore(elPrev.value);
          elPrev.value = String(reverted);
          elPrev.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if(ABILS.includes(key)){
        const el = $(key);
        if(el){
          const next = Math.min(28, Number(el.value) + 1);
          el.value = String(next);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          enhancedAbility = key;
        }
      }else{
        enhancedAbility = '';
      }
      scheduleDerivedUpdate();
    });
    li.appendChild(document.createTextNode(' '));
    li.appendChild(select);
  }else if(/gain proficiency in one skill/.test(lower)){
    const select = document.createElement('select');
    select.innerHTML = `<option value="">Choose skill</option>` +
      SKILLS.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('');
    select.addEventListener('change', ()=>{
      const prev = select.dataset.prev;
      if(prev !== undefined){
        $('skill-'+prev+'-prof').checked = false;
      }
      const idx = select.value;
      if(idx !== ''){
        $('skill-'+idx+'-prof').checked = true;
        select.dataset.prev = idx;
        scheduleDerivedUpdate();
      }
    });
    li.appendChild(document.createTextNode(' '));
    li.appendChild(select);
  }else if(/add your wisdom modifier to initiative/.test(lower)){
    addWisToInitiative = true;
    scheduleDerivedUpdate();
  }
  const m = text.match(/([+-]\d+)\s*tc\b/i);
  if(m) bonus += Number(m[1]);
  if(li && li.dataset){
    const source = String(text);
    INITIATIVE_BONUS_REGEX.lastIndex = 0;
    let initiativeBonusTotal = 0;
    if(typeof source.matchAll === 'function'){
      for(const match of source.matchAll(INITIATIVE_BONUS_REGEX)){
        const value = Number(match[1]);
        if(Number.isFinite(value)){
          initiativeBonusTotal += value;
        }
      }
    }else{
      const tokens = source.match(INITIATIVE_BONUS_REGEX) || [];
      tokens.forEach(token => {
        const valueMatch = token.match(/([+-]\d+)/);
        if(valueMatch){
          const value = Number(valueMatch[1]);
          if(Number.isFinite(value)){
            initiativeBonusTotal += value;
          }
        }
      });
    }
    if (initiativeBonusTotal !== 0) {
      registerPerkBonus({ type: 'initiative', value: initiativeBonusTotal });
    }
  }
  applyMatches(/\+([0-9]+)\s*to\s*death saving throws?/gi, match => {
    registerPerkBonus({ type: 'death-save', value: match[1] });
  });
  applyMatches(/\+([0-9]+)\s*to\s*attack rolls?/gi, match => {
    registerPerkBonus({ type: 'attack', value: match[1] });
  });
  Object.entries(ABILITY_FULL_NAMES).forEach(([key, label]) => {
    const ability = key.toUpperCase();
    const savePattern = new RegExp(`\\+([0-9]+)\\s*to\\s*${escapeRegExp(label)}\\s*(?:saving throws?|saves?)`, 'gi');
    applyMatches(savePattern, match => {
      if (hasQualifier(match[0])) return;
      registerPerkBonus({ type: 'save', ability, value: match[1] });
    });
    const checkPattern = new RegExp(`\\+([0-9]+)\\s*to\\s*${escapeRegExp(label)}\\s*(?:ability\\s*)?checks?`, 'gi');
    applyMatches(checkPattern, match => {
      if (hasQualifier(match[0])) return;
      registerPerkBonus({ type: 'ability', ability, value: match[1] });
    });
  });
  applyMatches(/\+([0-9]+)\s*to\s*(?:all\s+)?saving throws?/gi, match => {
    const fragment = match[0] || '';
    if (/death saving throw/i.test(fragment)) return;
    if (hasQualifier(fragment)) return;
    registerPerkBonus({ type: 'save', value: match[1] });
  });
  SKILLS.forEach(skill => {
    const pattern = new RegExp(`\\+([0-9]+)\\s*to\\s*${escapeRegExp(skill.name)}\\s*(?:skill\\s*)?checks?`, 'gi');
    applyMatches(pattern, match => {
      if (hasQualifier(match[0])) return;
      registerPerkBonus({ type: 'skill', skill: skill.name, ability: skill.abil.toUpperCase(), value: match[1] });
    });
  });
  applyMatches(/\+([0-9]+)\s*to\s*skill checks?/gi, match => {
    if (hasQualifier(match[0])) return;
    registerPerkBonus({ type: 'skill', value: match[1] });
  });
  applyMatches(/\+([0-9]+)\s*to\s*ability checks?/gi, match => {
    if (hasQualifier(match[0])) return;
    registerPerkBonus({ type: 'ability', value: match[1] });
  });
  rollBonusRegistry.register(li || null, registryEntries);
  return bonus;
}

function setupPerkSelect(selId, perkId, data){
  const sel = $(selId);
  const perkEl = $(perkId);
  if(!sel || !perkEl) return;
  function render(){
    if(selId==='classification' && enhancedAbility){
      const elPrev = $(enhancedAbility);
      if(elPrev){
        const reverted = revertAbilityScore(elPrev.value);
        elPrev.value = String(reverted);
        elPrev.dispatchEvent(new Event('change', { bubbles: true }));
      }
      enhancedAbility = '';
      updateDerived();
    }
    const perks = data[sel.value] || [];
    perkEl.innerHTML = '';
    if(selId==='alignment') addWisToInitiative = false;
    let tcBonus = 0;
    perks.forEach((p,i)=>{
      const text = typeof p === 'string' ? p : String(p);
      const lower = text.toLowerCase();
      const isAction = ACTION_HINTS.some(k=> lower.includes(k));
      let li;
      if(isAction){
        const id = `${selId}-perk-${i}`;
        const statusId = `${id}-status`;
        li = document.createElement('li');
        li.innerHTML = `<label class="inline"><input type="checkbox" id="${id}"/> <span id="${statusId}" class="perk-status">Available</span> ${text}</label>`;
        const cb = li.querySelector(`#${id}`);
        const status = li.querySelector(`#${statusId}`);
        if (cb && status) {
          cb.addEventListener('change', () => {
            status.textContent = cb.checked ? 'Used' : 'Available';
            window.dmNotify?.(`${text} ${cb.checked ? 'used' : 'reset'}`);
            logAction(`${text} perk ${cb.checked ? 'used' : 'reset'}`);
          });
        }
      }else{
        li = document.createElement('li');
        li.textContent = text;
        li.addEventListener('click', () => {
          window.dmNotify?.(`${text} perk referenced`);
        });
      }
      perkEl.appendChild(li);
      tcBonus += handlePerkEffects(li, text);
    });
    perkEl.style.display = perks.length ? 'block' : 'none';
    if(selId==='power-style') powerStyleTCBonus = tcBonus;
    if(selId==='origin') originTCBonus = tcBonus;
    if (typeof catalogRenderScheduler === 'function') {
      catalogRenderScheduler();
    }
  }
  sel.addEventListener('change', () => {
    window.dmNotify?.(`${selId.replace(/-/g,' ')} changed to ${sel.value}`);
    render();
    scheduleDerivedUpdate();
  });
  render();
  scheduleDerivedUpdate();
}

/* ========= cached elements ========= */
const elPP = $('pp');
const elTC = $('tc');
const elStr = $('str');
const elDex = $('dex');
const elCon = $('con');
const elInt = $('int');
const elWis = $('wis');
const elCha = $('cha');
const elSPBar = $('sp-bar');
const elSPPill = $('sp-pill');
const elSPTemp = $('sp-temp');
const elHPBar = $('hp-bar');
const elHPPill = $('hp-pill');
const elHPRoll = $('hp-roll');
const elHPTemp = $('hp-temp');
// Cache frequently accessed HP amount field to avoid repeated DOM queries
const elHPAmt = $('hp-amt');
const elHPSettingsToggle = $('hp-settings-toggle');
const elHPRollInput = $('hp-roll-input');
const elHPRollList = $('hp-roll-list');
const hpSettingsOverlay = $('modal-hp-settings');
const elInitiative = $('initiative');
const elInitiativeRollBtn = $('roll-initiative');
const elInitiativeRollResult = $('initiative-roll-result');
const elProfBonus = $('prof-bonus');
const elPowerSaveAbility = $('power-save-ability');
const elPowerSaveDC = $('power-save-dc');
const powerDcFormulaField = $('power-dc-formula');
const powerDcModeRadios = qsa("input[name='power-dc-mode']");
const elPowerRangeUnit = $('power-range-unit');
const elPowerSuggestionStrength = $('power-suggestion-strength');
const elPowerMetricToggle = $('power-range-metric');
const elPowerTextCompact = $('power-text-compact');
const elPowerStylePrimary = $('power-style');
const elPowerStyleSecondary = $('power-style-2');
const elSPSettingsToggle = $('sp-settings-toggle');
const spSettingsOverlay = $('modal-sp-settings');

let casterAbilityManuallySet = false;
let lastCasterAbilitySuggestions = [];
let elPowerSaveAbilityHint = null;

if (elPowerSaveAbility && elPowerSaveAbility.parentElement) {
  elPowerSaveAbilityHint = document.createElement('div');
  elPowerSaveAbilityHint.style.fontSize = '12px';
  elPowerSaveAbilityHint.style.opacity = '0.8';
  elPowerSaveAbilityHint.style.marginTop = '4px';
  elPowerSaveAbilityHint.style.minHeight = '14px';
  elPowerSaveAbilityHint.style.display = 'none';
  elPowerSaveAbility.parentElement.appendChild(elPowerSaveAbilityHint);
}

function getCurrentCasterAbility() {
  if (!elPowerSaveAbility) return '';
  const value = elPowerSaveAbility.value || '';
  return value.toUpperCase();
}

function updateCasterAbilityHint(suggestions) {
  if (!elPowerSaveAbilityHint) return;
  if (!Array.isArray(suggestions) || !suggestions.length) {
    elPowerSaveAbilityHint.textContent = '';
    elPowerSaveAbilityHint.style.display = 'none';
    return;
  }
  const label = suggestions.length > 1 ? suggestions.join(' or ') : suggestions[0];
  const manualNote = casterAbilityManuallySet ? ' (manual override)' : '';
  elPowerSaveAbilityHint.textContent = `Suggested: ${label}${manualNote}`;
  elPowerSaveAbilityHint.style.display = 'block';
}

function setCasterAbility(ability, { manual = false } = {}) {
  if (!elPowerSaveAbility) return;
  const normalized = typeof ability === 'string' ? ability.toUpperCase() : '';
  if (!POWER_SAVE_ABILITIES.includes(normalized)) return;
  const prev = getCurrentCasterAbility();
  elPowerSaveAbility.value = normalized.toLowerCase();
  casterAbilityManuallySet = manual;
  if (prev !== normalized) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => updateDerived());
    } else {
      Promise.resolve().then(() => updateDerived());
    }
  }
}

function refreshCasterAbilitySuggestion({ force = false, syncOnly = false } = {}) {
  if (!elPowerSaveAbility) return;
  const primaryStyle = elPowerStylePrimary?.value || '';
  const secondaryStyle = elPowerStyleSecondary?.value || '';
  const suggestions = getCasterAbilitySuggestions(primaryStyle, secondaryStyle);
  lastCasterAbilitySuggestions = suggestions;
  const current = getCurrentCasterAbility();
  if (syncOnly) {
    casterAbilityManuallySet = suggestions.length ? current !== suggestions[0] : current !== '';
    updateCasterAbilityHint(suggestions);
    return;
  }
  if (casterAbilityManuallySet && suggestions.length && current === suggestions[0]) {
    casterAbilityManuallySet = false;
  }
  if (force || !casterAbilityManuallySet) {
    const recommended = suggestions[0];
    if (recommended && current !== recommended) {
      setCasterAbility(recommended, { manual: false });
      updateCasterAbilityHint(suggestions);
      return;
    }
    casterAbilityManuallySet = false;
  }
  updateCasterAbilityHint(suggestions);
}

function syncPowerDcRadios(value) {
  const target = value === 'Simple' ? 'Simple' : 'Proficiency';
  if (powerDcFormulaField) {
    powerDcFormulaField.value = target;
  }
  powerDcModeRadios.forEach(radio => {
    if (radio) radio.checked = radio.value === target;
  });
}

function getCharacterPowerSettings() {
  const abilityKeyRaw = (elPowerSaveAbility?.value || 'wis').toUpperCase();
  const casterSaveAbility = POWER_SAVE_ABILITIES.includes(abilityKeyRaw) ? abilityKeyRaw : 'WIS';
  const abilityMods = POWER_SAVE_ABILITIES.reduce((mods, ability) => {
    const el = $(ability.toLowerCase());
    mods[ability] = mod(el ? el.value : 0);
    return mods;
  }, {});
  const formulaValue = powerDcFormulaField?.value === 'Simple' ? 'Simple' : 'Proficiency';
  const proficiencyBonus = num(elProfBonus?.value) || 0;
  const rangeUnitRaw = (elPowerRangeUnit?.value || 'feet').toLowerCase();
  const defaultRangeUnit = POWER_RANGE_UNITS.includes(rangeUnitRaw) ? rangeUnitRaw : 'feet';
  const strengthRaw = (elPowerSuggestionStrength?.value || 'conservative').toLowerCase();
  const autoSuggestionStrength = POWER_SUGGESTION_STRENGTHS.includes(strengthRaw)
    ? strengthRaw
    : 'conservative';
  const showMetricRanges = !!elPowerMetricToggle?.checked;
  const preferShortRulesText = !!elPowerTextCompact?.checked;
  return {
    casterSaveAbility,
    dcFormula: formulaValue,
    proficiencyBonus,
    abilityMods,
    defaultRangeUnit,
    autoSuggestionStrength,
    showMetricRanges,
    preferShortRulesText,
  };
}

syncPowerDcRadios(powerDcFormulaField?.value || 'Proficiency');
powerDcModeRadios.forEach(radio => {
  if (!radio) return;
  radio.addEventListener('change', () => {
    if (radio.checked) {
      syncPowerDcRadios(radio.value);
      updateDerived();
      refreshPowerCards();
    }
  });
});
[
  elPowerRangeUnit,
  elPowerSuggestionStrength,
  elPowerMetricToggle,
  elPowerTextCompact,
].forEach(el => {
  if (!el) return;
  const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(eventName, () => {
    refreshPowerCards();
  });
});
const elXP = $('xp');
const elXPBar = $('xp-bar');
const elXPPill = $('xp-pill');
const elTier = $('tier');
const elCAPCheck = $('cap-check');
const elCAPStatus = $('cap-status');
const elDeathSaves = $('death-saves');
const elCredits = $('credits');
const elCreditsPill = $('credits-total-pill');
const elCreditsGearTotal = $('credits-gear-total');
const elCreditsGearRemaining = $('credits-gear-remaining');
const elCreditsReason = $('credits-reason');

if (elPowerStylePrimary) {
  elPowerStylePrimary.addEventListener('change', () => {
    refreshCasterAbilitySuggestion();
  });
}

if (elPowerStyleSecondary) {
  elPowerStyleSecondary.addEventListener('change', () => {
    refreshCasterAbilitySuggestion();
    if (typeof catalogRenderScheduler === 'function') {
      catalogRenderScheduler();
    }
  });
}

if (elPowerSaveAbility) {
  elPowerSaveAbility.addEventListener('change', event => {
    const suggestions = lastCasterAbilitySuggestions.length
      ? lastCasterAbilitySuggestions
      : getCasterAbilitySuggestions(elPowerStylePrimary?.value || '', elPowerStyleSecondary?.value || '');
    lastCasterAbilitySuggestions = suggestions;
    const recommended = suggestions[0];
    const current = getCurrentCasterAbility();
    if (event?.isTrusted) {
      casterAbilityManuallySet = recommended ? current !== recommended : current !== '';
    }
    updateCasterAbilityHint(suggestions);
  });
}

refreshCasterAbilitySuggestion({ force: true });

if (elInitiativeRollBtn && elInitiativeRollResult) {
  const initiativeOutcomeClasses = ['initiative-roll--crit-high', 'initiative-roll--crit-low'];
  const resetInitiativeAnimation = () => {
    elInitiativeRollResult.classList.remove('initiative-roll--active');
  };

  elInitiativeRollBtn.addEventListener('click', () => {
    const dexMod = mod(elDex.value);
    const wisMod = addWisToInitiative ? mod(elWis.value) : 0;
    const baseBonuses = [
      { label: 'DEX mod', value: dexMod, includeZero: true },
    ];
    let base = dexMod;
    if (addWisToInitiative) {
      base += wisMod;
      baseBonuses.push({ label: 'WIS mod', value: wisMod, includeZero: true });
    }
    let rollDetails = null;
    rollWithBonus('Initiative', base, elInitiativeRollResult, {
      type: 'initiative',
      baseBonuses,
      onRoll: details => {
        rollDetails = details;
      },
    });

    elInitiativeRollResult.classList.remove('initiative-roll--active', ...initiativeOutcomeClasses);

    if (rollDetails) {
      if (rollDetails.roll === rollDetails.sides) {
        elInitiativeRollResult.classList.add('initiative-roll--crit-high');
      } else if (rollDetails.roll === 1) {
        elInitiativeRollResult.classList.add('initiative-roll--crit-low');
      }
    }

    if (!animationsEnabled) {
      return;
    }

    void elInitiativeRollResult.offsetWidth;
    elInitiativeRollResult.classList.add('initiative-roll--active');
    elInitiativeRollResult.addEventListener('animationend', resetInitiativeAnimation, { once: true });
  });
}

let hpRolls = [];
if (elHPRoll) {
  const initial = num(elHPRoll.value);
  if (initial) hpRolls = [initial];
}

if (elCAPCheck && elCAPStatus) {
  const capBox = elCAPCheck.closest('.cap-box');
  const reduceMotionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  const CAP_AURA_ANIMATION = 'capAuraCollapse';
  const CAP_AURA_TIMEOUT_MS = 750;
  let capAuraTimer = null;
  let capAuraEndHandler = null;

  const clearCapAuraCallbacks = () => {
    if (capAuraTimer) {
      clearTimeout(capAuraTimer);
      capAuraTimer = null;
    }
    if (capAuraEndHandler && capBox) {
      capBox.removeEventListener('animationend', capAuraEndHandler);
      capAuraEndHandler = null;
    }
  };

  const finalizeCAPSpend = () => {
    clearCapAuraCallbacks();
    if (!elCAPCheck.disabled) {
      elCAPCheck.disabled = true;
    }
  };

  const resetAuraState = () => {
    clearCapAuraCallbacks();
    if (!capBox) return;
    capBox.classList.remove('cap-box--spent');
    void capBox.offsetWidth;
  };

  elCAPCheck.addEventListener('change', () => {
    if (elCAPCheck.disabled) {
      clearCapAuraCallbacks();
      return;
    }

    if (elCAPCheck.checked) {
      if (confirm('Use Cinematic Action Point?')) {
        const prev = elCAPStatus.textContent;
        elCAPStatus.textContent = 'Used';
        window.dmNotify?.('Used Cinematic Action Point');
        logAction(`Cinematic Action Point: ${prev} -> Used`);

        if (capBox) {
          resetAuraState();
          capBox.classList.add('cap-box--spent');
        }

        const shouldAnimateCapAura = Boolean(
          capBox && animationsEnabled && !reduceMotionQuery.matches
        );

        if (shouldAnimateCapAura) {
          capAuraEndHandler = event => {
            if (event.animationName !== CAP_AURA_ANIMATION) {
              return;
            }
            finalizeCAPSpend();
          };
          capBox.addEventListener('animationend', capAuraEndHandler);
          capAuraTimer = setTimeout(finalizeCAPSpend, CAP_AURA_TIMEOUT_MS);
        } else {
          finalizeCAPSpend();
        }
      } else {
        elCAPCheck.checked = false;
        if (capBox) {
          capBox.classList.remove('cap-box--spent');
        }
      }
    } else {
      // Prevent clearing without long rest
      elCAPCheck.checked = true;
    }
  });
}

const XP_TIERS = [
  { xp: 0, label: 'Tier 5 – Rookie' },
  { xp: 2000, label: 'Tier 4 – Emerging Vigilante' },
  { xp: 6000, label: 'Tier 3 – Field-Tested Operative' },
  { xp: 18000, label: 'Tier 2 – Respected Force' },
  { xp: 54000, label: 'Tier 1 – Heroic Figure' },
  { xp: 162000, label: 'Tier 0 – Transcendent / Legendary' }
];

const PROF_BONUS_TIERS = [2, 3, 4, 5, 6, 7];

function getTierIndex(xp){
  for(let i=XP_TIERS.length-1;i>=0;i--){
    if(xp >= XP_TIERS[i].xp) return i;
  }
  return 0;
}

let currentTierIdx = 0;
let xpInitialized = false;
let catalogRenderScheduler = null;
if (elXP) {
  const initXP = Math.max(0, num(elXP.value));
  currentTierIdx = getTierIndex(initXP);
}

function launchConfetti(){
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  loadConfetti().then(fn => {
    try {
      fn({
        particleCount: 100,
        spread: 70,
        origin: { x: 0, y: 0 }
      });
      fn({
        particleCount: 100,
        spread: 70,
        origin: { x: 1, y: 0 }
      });
    } catch {}
  });
}

function launchFireworks(){
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  loadConfetti().then(fn => {
    const firework = () => {
      try {
        fn({
          particleCount: 80,
          startVelocity: 30,
          spread: 360,
          origin: { x: Math.random(), y: Math.random() * 0.5 }
        });
      } catch {}
    };
    firework();
    setTimeout(firework, 250);
    setTimeout(firework, 500);
  });
}

// set initial tier display
if(elTier){
  elTier.value = XP_TIERS[0].label;
}

/* ========= derived helpers ========= */
function updateSP(){
  const spMax = 5 + mod(elCon.value);
  elSPBar.max = spMax;
  if (elSPBar.value === '' || Number.isNaN(Number(elSPBar.value))) elSPBar.value = spMax;
  const temp = elSPTemp ? num(elSPTemp.value) : 0;
  elSPPill.textContent = `${num(elSPBar.value)}/${spMax}` + (temp ? ` (+${temp})` : ``);
}

function updateDeathSaveAvailability(){
  if(!elDeathSaves) return;
  const atZero = num(elHPBar.value) === 0;
  elDeathSaves.disabled = !atZero;
  if (atZero) {
    elDeathSaves.removeAttribute('hidden');
  } else {
    elDeathSaves.setAttribute('hidden', '');
  }
}

function updateHP(){
  const base = 30;
  const conMod = elCon.value === '' ? 0 : mod(elCon.value);
  const total = base + conMod + num(elHPRoll.value||0);
  const prevMax = num(elHPBar.max);
  elHPBar.max = Math.max(0, total);
  if (!num(elHPBar.value) || num(elHPBar.value) === prevMax) elHPBar.value = elHPBar.max;
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
  updateDeathSaveAvailability();
  if(num(elHPBar.value) > 0){
    try { resetDeathSaves(); } catch {}
  }
}

function updateXP(){
  const xp = Math.max(0, num(elXP.value));
  const idx = getTierIndex(xp);
  const prevIdx = currentTierIdx;
  if (xpInitialized && idx !== prevIdx) {
    logAction(`Tier: ${XP_TIERS[prevIdx].label} -> ${XP_TIERS[idx].label}`);
  }
  if (xpInitialized && idx > currentTierIdx) {
    launchConfetti();
    launchFireworks();
    toast(`Tier up! ${XP_TIERS[idx].label}. Director says: grab your 1d10 HP booster!`, 'success');
    window.dmNotify?.(`Tier up to ${XP_TIERS[idx].label}`);
  } else if(xpInitialized && idx < currentTierIdx){
    window.dmNotify?.(`Tier down to ${XP_TIERS[idx].label}`);
  }
  currentTierIdx = idx;
  xpInitialized = true;
  if(elTier) elTier.value = XP_TIERS[idx].label;
  if(elProfBonus) elProfBonus.value = PROF_BONUS_TIERS[idx] || 2;
  const nextTier = XP_TIERS[idx+1];
  const currentTierXP = XP_TIERS[idx].xp;
  if(nextTier){
    const xpIntoTier = xp - currentTierXP;
    const xpForNextTier = nextTier.xp - currentTierXP;
    elXPBar.max = xpForNextTier;
    elXPBar.value = xpIntoTier;
    elXPPill.textContent = `${xpIntoTier}/${xpForNextTier}`;
  }else{
    elXPBar.max = 1;
    elXPBar.value = 1;
    elXPPill.textContent = `${xp}+`;
  }
  if (typeof catalogRenderScheduler === 'function') {
    catalogRenderScheduler();
  }
}

function formatModifier(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '+0';
  return num >= 0 ? `+${num}` : String(num);
}

function applyBreakdownMetadata(target, breakdown, label) {
  if (!target) return;
  const text = Array.isArray(breakdown) && breakdown.length ? breakdown.join(' | ') : '';
  if (target.dataset) {
    if (text) target.dataset.rollBreakdown = text;
    else delete target.dataset.rollBreakdown;
  }
  if (text) {
    target.title = label ? `${label}: ${text}` : text;
  } else if (target.title) {
    target.removeAttribute('title');
  }
}

let derivedUpdateScheduled = false;
function scheduleDerivedUpdate() {
  if (derivedUpdateScheduled) return;
  derivedUpdateScheduled = true;

  const runUpdate = () => {
    Promise.resolve().then(() => {
      derivedUpdateScheduled = false;
      try { updateDerived(); } catch {}
    });
  };

  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    runUpdate();
    return;
  }

  if (document.readyState === 'loading') {
    const handleReady = () => {
      document.removeEventListener('DOMContentLoaded', handleReady);
      runUpdate();
    };
    document.addEventListener('DOMContentLoaded', handleReady, { once: true });
    // If the document became ready before the listener attached, run immediately.
    if (document.readyState !== 'loading') {
      document.removeEventListener('DOMContentLoaded', handleReady);
      runUpdate();
    }
    return;
  }

  runUpdate();
}

function updateDerived(){
  updateXP();
  const pb = PROF_BONUS_TIERS[currentTierIdx] || 2;
  const wisMod = mod(elWis.value);
  const dexMod = mod(elDex.value);
  elPP.value = 10 + wisMod;
  const armorAuto = calculateArmorBonus();
  elTC.value = 10 + dexMod + armorAuto + powerStyleTCBonus + originTCBonus;
  updateSP();
  updateHP();
  const initiativeBaseBonuses = [{ label: 'DEX mod', value: dexMod, includeZero: true }];
  let initiativeBase = dexMod;
  if (addWisToInitiative) {
    initiativeBase += wisMod;
    initiativeBaseBonuses.push({ label: 'WIS mod', value: wisMod, includeZero: true });
  }
  const initiativeResolution = resolveRollBonus(initiativeBase, {
    type: 'initiative',
    baseBonuses: initiativeBaseBonuses,
  });
  const initiative = Number.isFinite(initiativeResolution?.modifier)
    ? initiativeResolution.modifier
    : initiativeBase;
  currentInitiativeBonus = initiative;
  if (elInitiative) {
    elInitiative.value = formatModifier(initiative);
    const initiativeBreakdown = (initiativeResolution?.breakdown && initiativeResolution.breakdown.length)
      ? initiativeResolution.breakdown
      : initiativeBaseBonuses
        .map(part => formatBreakdown(part.label, part.value, { includeZero: part.includeZero }))
        .filter(Boolean);
    applyBreakdownMetadata(elInitiative, initiativeBreakdown, 'Initiative breakdown');
  }
  // Guard against missing ability elements when calculating the power save DC.
  // If the selected ability cannot be found in the DOM, default its modifier to 0
  // rather than throwing an error which prevents other derived stats from
  // updating and leaves all modifiers displayed as +0.
  const powerSettings = getCharacterPowerSettings();
  elPowerSaveDC.value = computeSaveDc(powerSettings);
  ABILS.forEach(a=>{
    const abilityInput = $(a);
    if (!abilityInput) return;
    const abilityLabel = a.toUpperCase();
    const abilityMod = mod(abilityInput.value);
    const abilityTarget = $(a+'-mod');
    const abilityResolution = resolveRollBonus(abilityMod, {
      type: 'ability',
      ability: abilityLabel,
      baseBonuses: [{ label: `${abilityLabel} mod`, value: abilityMod, includeZero: true }],
    });
    const abilityTotal = Number.isFinite(abilityResolution?.modifier)
      ? abilityResolution.modifier
      : abilityMod;
    if (abilityTarget) {
      abilityTarget.textContent = formatModifier(abilityTotal);
      applyBreakdownMetadata(abilityTarget, abilityResolution?.breakdown, `${abilityLabel} ability checks`);
    }
    const saveProfEl = $('save-'+a+'-prof');
    const isProficient = !!(saveProfEl && saveProfEl.checked);
    const saveBaseBonuses = [{ label: `${abilityLabel} mod`, value: abilityMod, includeZero: true }];
    if (isProficient && pb) saveBaseBonuses.push({ label: 'Prof', value: pb });
    const saveBase = abilityMod + (isProficient ? pb : 0);
    const saveResolution = resolveRollBonus(saveBase, {
      type: 'save',
      ability: abilityLabel,
      baseBonuses: saveBaseBonuses,
    });
    const saveTarget = $('save-'+a);
    const saveTotal = Number.isFinite(saveResolution?.modifier)
      ? saveResolution.modifier
      : saveBase;
    if (saveTarget) {
      saveTarget.textContent = formatModifier(saveTotal);
      applyBreakdownMetadata(saveTarget, saveResolution?.breakdown, `${abilityLabel} saves`);
    }
  });
  SKILLS.forEach((s,i)=>{
    const skillTarget = $('skill-'+i);
    if (!skillTarget) return;
    const abilityMod = mod($(s.abil).value);
    const profEl = $('skill-'+i+'-prof');
    const proficient = !!(profEl && profEl.checked);
    const baseBonuses = [{ label: `${s.abil.toUpperCase()} mod`, value: abilityMod, includeZero: true }];
    if (proficient && pb) baseBonuses.push({ label: 'Prof', value: pb });
    const base = abilityMod + (proficient ? pb : 0);
    const skillResolution = resolveRollBonus(base, {
      type: 'skill',
      ability: s.abil.toUpperCase(),
      skill: s.name,
      baseBonuses,
    });
    const total = Number.isFinite(skillResolution?.modifier)
      ? skillResolution.modifier
      : base;
    skillTarget.textContent = formatModifier(total);
    applyBreakdownMetadata(skillTarget, skillResolution?.breakdown, `${s.name} checks`);
  });
  updateCreditsGearSummary();
  refreshPowerCards();
}
ABILS.forEach(a=> {
  const el = $(a);
  el.addEventListener('change', () => {
    window.dmNotify?.(`${a.toUpperCase()} set to ${el.value}`);
    updateDerived();
  });
});
['hp-temp','sp-temp','power-save-ability','xp'].forEach(id=> $(id).addEventListener('input', updateDerived));
ABILS.forEach(a=> $('save-'+a+'-prof').addEventListener('change', updateDerived));
SKILLS.forEach((s,i)=> $('skill-'+i+'-prof').addEventListener('change', updateDerived));

function setXP(v){
  const prev = num(elXP.value);
  elXP.value = Math.max(0, v);
  updateDerived();
  const diff = num(elXP.value) - prev;
  if(diff !== 0){
    window.dmNotify?.(`XP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elXP.value})`);
  }
}
$('xp-submit').addEventListener('click', ()=>{
  const amt = num($('xp-amt').value)||0;
  if(!amt) return;
  const mode = $('xp-mode').value;
  setXP(num(elXP.value) + (mode==='add'? amt : -amt));
});

function formatCreditsValue(value) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const formatted = `₡${abs.toLocaleString('en-US')}`;
  return safe < 0 ? `-${formatted}` : formatted;
}

const CREDITS_LEDGER_STORAGE_KEY = 'credits-ledger';
const CREDITS_LEDGER_MAX_ENTRIES = 200;
let creditsLedgerEntries = [];

function loadCreditsLedgerEntries() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CREDITS_LEDGER_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry => {
      const amount = Number(entry?.amount);
      const balance = Number(entry?.balance);
      const ts = Number(entry?.ts);
      const rawReason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
      return {
        amount: Number.isFinite(amount) ? amount : 0,
        balance: Number.isFinite(balance) ? balance : 0,
        reason: rawReason || 'Adjustment',
        ts: Number.isFinite(ts) ? ts : Date.now(),
      };
    });
  } catch {
    return [];
  }
}

function persistCreditsLedgerEntries(entries) {
  creditsLedgerEntries = entries.slice(-CREDITS_LEDGER_MAX_ENTRIES);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CREDITS_LEDGER_STORAGE_KEY, JSON.stringify(creditsLedgerEntries));
  } catch {}
}

function getCreditsLedgerEntries() {
  return creditsLedgerEntries.slice();
}

function recordCreditsLedgerEntry(entry) {
  const amount = Number(entry?.amount);
  const balance = Number(entry?.balance);
  const ts = Number(entry?.ts);
  const normalized = {
    amount: Number.isFinite(amount) ? amount : 0,
    balance: Number.isFinite(balance) ? balance : 0,
    reason:
      typeof entry?.reason === 'string' && entry.reason.trim()
        ? entry.reason.trim()
        : amount > 0
          ? 'Credits gained'
          : 'Credits spent',
    ts: Number.isFinite(ts) ? ts : Date.now(),
  };
  const next = getCreditsLedgerEntries();
  next.push(normalized);
  persistCreditsLedgerEntries(next);
  if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
    try {
      document.dispatchEvent(new CustomEvent('credits-ledger-updated', { detail: normalized }));
    } catch {}
  }
}

creditsLedgerEntries = loadCreditsLedgerEntries();
if (creditsLedgerEntries.length > CREDITS_LEDGER_MAX_ENTRIES) {
  persistCreditsLedgerEntries(creditsLedgerEntries);
}

function calculateEquippedGearTotal() {
  const gearLists = ['weapons', 'armors', 'items'];
  let total = 0;
  gearLists.forEach(id => {
    const container = $(id);
    if (!container) return;
    qsa('.card', container).forEach(card => {
      const priceValue = Number(card?.dataset?.price);
      if (!Number.isFinite(priceValue) || priceValue <= 0) return;
      if ((card?.dataset?.kind || '') === 'armor') {
        const equippedField = qs("[data-f='equipped']", card);
        if (equippedField && !equippedField.checked) return;
      }
      total += priceValue;
    });
  });
  return total;
}

function updateCreditsGearSummary() {
  if (!elCreditsGearTotal && !elCreditsGearRemaining) return;
  const total = calculateEquippedGearTotal();
  if (elCreditsGearTotal) {
    elCreditsGearTotal.textContent = `Equipped Gear: ${formatCreditsValue(total)}`;
  }
  if (elCreditsGearRemaining) {
    const available = elCredits ? num(elCredits.value) || 0 : 0;
    const delta = available - total;
    if (delta >= 0) {
      elCreditsGearRemaining.textContent = `Remaining Credits: ${formatCreditsValue(delta)}`;
    } else {
      elCreditsGearRemaining.textContent = `Credits Shortfall: ${formatCreditsValue(Math.abs(delta))}`;
    }
  }
}

function updateCreditsDisplay(){
  if (elCreditsPill) elCreditsPill.textContent = num(elCredits.value)||0;
  updateCreditsGearSummary();
}

function setCredits(v, options = {}){
  const prev = num(elCredits.value)||0;
  const total = Math.max(0, v);
  elCredits.value = total;
  updateCreditsDisplay();
  const diff = total - prev;
  if(diff !== 0){
    const actionKey = diff > 0 ? 'credits-gain' : 'credits-spend';
    playActionCue(actionKey);
    window.dmNotify?.(`Credits ${diff>0?'gained':'spent'} ${Math.abs(diff)} (now ${total})`);
    const providedReason = typeof options === 'object' && options !== null ? options.reason : undefined;
    const entryReason = typeof providedReason === 'string' && providedReason.trim()
      ? providedReason.trim()
      : diff > 0
        ? 'Credits gained'
        : 'Credits spent';
    recordCreditsLedgerEntry({
      amount: diff,
      balance: total,
      reason: entryReason,
    });
    pushHistory();
    const name = currentCharacter();
    if (name) {
      playStatusCue('credits-save');
      saveCharacter(serialize(), name).catch(e => {
        console.error('Credits cloud save failed', e);
      });
    }
  }
}

if (elCredits) updateCreditsDisplay();

function notifyInsufficientCredits(message = "You don't have enough Credits for that.") {
  try {
    toast(message, 'error');
  } catch {}
  try {
    logAction('Credits spend prevented: insufficient Credits.');
  } catch {}
}

$('credits-submit').addEventListener('click', ()=>{
  const amtField = $('credits-amt');
  const amt = num(amtField?.value)||0;
  if(!amt) return;
  const mode = $('credits-mode').value;
  const delta = mode==='add'? amt : -amt;
  const current = num(elCredits.value) || 0;
  const providedReason = elCreditsReason && typeof elCreditsReason.value === 'string'
    ? elCreditsReason.value.trim()
    : '';
  const defaultReason = mode==='add' ? 'Manual credit gain' : 'Manual credit spend';
  const reason = providedReason || defaultReason;
  setCredits(current + delta, { reason });
  if (amtField) amtField.value='';
  if (elCreditsReason) elCreditsReason.value='';
});


/* ========= HP/SP controls ========= */
function setHP(v){
  const prev = num(elHPBar.value);
  elHPBar.value = Math.max(0, Math.min(num(elHPBar.max), v));
  const current = num(elHPBar.value);
  elHPPill.textContent = `${current}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
  updateDeathSaveAvailability();
  const diff = current - prev;
  if(diff !== 0){
    if(diff < 0){
      playActionCue('hp-damage');
    }else{
      playActionCue('hp-heal');
    }
    window.dmNotify?.(`HP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elHPBar.value}/${elHPBar.max})`);
    logAction(`HP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elHPBar.value}/${elHPBar.max})`);
  }
  const down = prev > 0 && current === 0;
  if(down){
    playActionCue('hp-down');
  }
  if(current > 0){
    try { resetDeathSaves(); } catch {}
  }
  return down;
}
function notifyInsufficientSp(message = "You don't have enough SP for that.") {
  try {
    toast(message, 'error');
  } catch {}
  try {
    logAction('SP spend prevented: insufficient SP.');
  } catch {}
}

async function setSP(v){
  const prev = num(elSPBar.value);
  const target = num(v);
  if (target < 0) {
    notifyInsufficientSp();
    return false;
  }
  elSPBar.value = Math.max(0, Math.min(num(elSPBar.max), target));
  const current = num(elSPBar.value);
  const temp = elSPTemp ? num(elSPTemp.value) : 0;
  elSPPill.textContent = `${current}/${num(elSPBar.max)}` + (temp ? ` (+${temp})` : ``);
  const diff = current - prev;
  if(diff !== 0) {
    if(diff < 0){
      playActionCue('sp-spend');
    }else{
      playActionCue('sp-gain');
    }
    window.dmNotify?.(`SP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elSPBar.value}/${elSPBar.max})`);
    logAction(`SP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elSPBar.value}/${elSPBar.max})`);
    await playSPAnimation(diff);
    pushHistory();
  }
  if(prev > 0 && current === 0) {
    playActionCue('sp-empty');
    toast('Player is out of SP', 'warning');
    logAction('Player is out of SP.');
  }
  return true;
}
$('hp-dmg').addEventListener('click', async ()=>{
  let d=num(elHPAmt ? elHPAmt.value : 0);
  if(!d) return;
  let tv=num(elHPTemp.value);
  if(d>0 && tv>0){
    const use=Math.min(tv,d);
    tv-=use;
    elHPTemp.value=tv;
    d-=use;
  }
  const down = setHP(num(elHPBar.value)-d);
  await playDamageAnimation(-d);
  if(down){
    await playDownAnimation();
    toast('Player is down', 'warning');
    logAction('Player is down.');
  }
});
$('hp-heal').addEventListener('click', async ()=>{
  const d=num(elHPAmt ? elHPAmt.value : 0)||0;
  setHP(num(elHPBar.value)+d);
  if(d>0) await playHealAnimation(d);
});
$('hp-full').addEventListener('click', async ()=>{
  const diff = num(elHPBar.max) - num(elHPBar.value);
  if(diff>0) await playHealAnimation(diff);
  setHP(num(elHPBar.max));
});
$('sp-full').addEventListener('click', ()=> setSP(num(elSPBar.max)));

function changeSP(delta){
  const current = num(elSPBar.value);
  let adjusted = delta;
  if(adjusted < 0 && elSPTemp){
    const temp = num(elSPTemp.value);
    const use = Math.min(temp, -adjusted);
    if(current + adjusted + use < 0){
      notifyInsufficientSp();
      return false;
    }
    elSPTemp.value = temp - use || '';
    adjusted += use;
  }
  const next = current + adjusted;
  if (next < 0) {
    notifyInsufficientSp();
    return false;
  }
  setSP(next);
  return true;
}
qsa('[data-sp]').forEach(b=> b.addEventListener('click', ()=> changeSP(num(b.dataset.sp)||0) ));
$('long-rest').addEventListener('click', ()=>{
  closeSpSettings();
  if(!confirm('Take a long rest?')) return;
  setHP(num(elHPBar.max));
  setSP(num(elSPBar.max));
  elHPTemp.value='';
  if (elSPTemp) elSPTemp.value='';
  // clear combat-related checkbox states only
  const combatCheckboxes = [
    ...qsa('#death-saves input[type="checkbox"]'),
    ...qsa('#statuses input[type="checkbox"]'),
    ...qsa('#ongoing-effects input[type="checkbox"]'),
  ];
  if (elCAPCheck) combatCheckboxes.push(elCAPCheck);
  combatCheckboxes.forEach(cb => {
    cb.checked = false;
    cb.removeAttribute('checked');
  });
  if (elCAPCheck) elCAPCheck.disabled = false;
  if (elCAPStatus) elCAPStatus.textContent = 'Available';
  activeStatuses.clear();
});
function renderHPRollList(){
  if(!elHPRollList) return;
  elHPRollList.innerHTML='';
  hpRolls.forEach((val,idx)=>{
    const li=document.createElement('li');
    li.textContent = `+${val}`;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn-sm';
    applyDeleteIcon(btn);
    btn.addEventListener('click', ()=>{
      hpRolls.splice(idx,1);
      elHPRoll.value = hpRolls.reduce((a,b)=>a+b,0);
      updateHP();
      renderHPRollList();
    });
    li.appendChild(btn);
    elHPRollList.appendChild(li);
  });
  elHPRollList.style.display = hpRolls.length ? 'block' : 'none';
}
function setHpSettingsExpanded(expanded){
  if (!elHPSettingsToggle) return;
  elHPSettingsToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}
function openHpSettings(){
  if (elHPRollInput) elHPRollInput.value='';
  renderHPRollList();
  show('modal-hp-settings');
  setHpSettingsExpanded(true);
}
function closeHpSettings(){
  hide('modal-hp-settings');
  setHpSettingsExpanded(false);
}
if (elHPSettingsToggle) {
  elHPSettingsToggle.addEventListener('click', openHpSettings);
}
if (typeof MutationObserver === 'function' && hpSettingsOverlay instanceof Element) {
  const observer = new MutationObserver(() => {
    const expanded = !hpSettingsOverlay.classList.contains('hidden');
    setHpSettingsExpanded(expanded);
    if (!expanded && elHPRollInput) {
      elHPRollInput.value='';
    }
  });
  observer.observe(hpSettingsOverlay, { attributes: true, attributeFilter: ['class'] });
}
const hpRollSaveButton = $('hp-roll-save');
if (hpRollSaveButton) {
  hpRollSaveButton.addEventListener('click', ()=>{
    const v=num(elHPRollInput?.value);
    if(!v){
      if (elHPRollInput) elHPRollInput.focus();
      return;
    }
    hpRolls.push(v);
    elHPRoll.value = hpRolls.reduce((a,b)=>a+b,0);
    updateHP();
    renderHPRollList();
    if (elHPRollInput) elHPRollInput.value='';
  });
}
qsa('#modal-hp-settings [data-close]').forEach(b=> b.addEventListener('click', closeHpSettings));

function setSpSettingsExpanded(expanded){
  if (!elSPSettingsToggle) return;
  elSPSettingsToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}
function openSpSettings(){
  show('modal-sp-settings');
  setSpSettingsExpanded(true);
  if (elSPTemp && typeof elSPTemp.focus === 'function') {
    requestAnimationFrame(()=> elSPTemp.focus({ preventScroll: true }));
  }
}
function closeSpSettings(){
  hide('modal-sp-settings');
  setSpSettingsExpanded(false);
  if (elSPSettingsToggle && typeof elSPSettingsToggle.focus === 'function') {
    requestAnimationFrame(()=> elSPSettingsToggle.focus({ preventScroll: true }));
  }
}
if (elSPSettingsToggle) {
  elSPSettingsToggle.addEventListener('click', openSpSettings);
}
if (typeof MutationObserver === 'function' && spSettingsOverlay instanceof Element) {
  const observer = new MutationObserver(() => {
    const expanded = !spSettingsOverlay.classList.contains('hidden');
    setSpSettingsExpanded(expanded);
  });
  observer.observe(spSettingsOverlay, { attributes: true, attributeFilter: ['class'] });
}
const spSettingsSaveButton = $('sp-settings-save');
if (spSettingsSaveButton) {
  spSettingsSaveButton.addEventListener('click', ()=>{
    updateDerived();
    closeSpSettings();
  });
}
qsa('#modal-sp-settings [data-close]').forEach(b=> b.addEventListener('click', closeSpSettings));

/* ========= Dice/Coin + Logs ========= */
function safeParse(key){
  try{
    return JSON.parse(localStorage.getItem(key)||'[]');
  }catch(e){
    return [];
  }
}
const actionLog = safeParse('action-log');
const fmt = (ts)=>new Date(ts).toLocaleTimeString();
const FALLBACK_ACTOR_NAME = 'A Mysterious Force';
const CAMPAIGN_LOG_LOCAL_KEY = 'campaign-log';
const CAMPAIGN_LOG_VISIBLE_LIMIT = 100;
let campaignLogEntries = normalizeCampaignLogEntries(safeParse(CAMPAIGN_LOG_LOCAL_KEY));
let campaignBacklogEntries = [];
let lastLocalCampaignTimestamp = campaignLogEntries.length
  ? campaignLogEntries[campaignLogEntries.length - 1].t
  : 0;

function pushLog(arr, entry, key){ arr.push(entry); if (arr.length>30) arr.splice(0, arr.length-30); localStorage.setItem(key, JSON.stringify(arr)); }
function renderLogs(){
  $('log-action').innerHTML = actionLog.slice(-10).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div>${e.text}</div></div>`).join('');
}
function renderFullLogs(){
  $('full-log-action').innerHTML = actionLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div>${e.text}</div></div>`).join('');
}
function logAction(text){
  try{
    if(sessionStorage.getItem('dmLoggedIn') === '1'){
      text = `DM: ${text}`;
    }
  }catch{}
  pushLog(actionLog, {t:Date.now(), text}, 'action-log');
  renderLogs();
  renderFullLogs();
}
window.logAction = logAction;
window.queueCampaignLogEntry = queueCampaignLogEntry;

function resolveActorName(name = currentCharacter()){
  if(typeof name === 'string'){
    const trimmed = name.trim();
    if(trimmed) return trimmed;
  }
  return FALLBACK_ACTOR_NAME;
}

function nextLocalCampaignTimestamp(){
  const now = Date.now();
  if(now <= lastLocalCampaignTimestamp){
    lastLocalCampaignTimestamp += 1;
  }else{
    lastLocalCampaignTimestamp = now;
  }
  return lastLocalCampaignTimestamp;
}

function normalizeCampaignLogEntry(entry, idx = 0){
  if(!entry || typeof entry !== 'object') return null;
  let t = Number(entry.t);
  if(!Number.isFinite(t) || t <= 0){
    t = Date.now() + idx;
  }
  const id = typeof entry.id === 'string' && entry.id
    ? entry.id
    : `${t}-${idx}`;
  const name = typeof entry.name === 'string' && entry.name.trim()
    ? entry.name.trim()
    : FALLBACK_ACTOR_NAME;
  const text = typeof entry.text === 'string' ? entry.text : '';
  return { id, t, name, text };
}

function normalizeCampaignLogEntries(entries){
  if(!Array.isArray(entries)) return [];
  return entries
    .map((entry, idx) => normalizeCampaignLogEntry(entry, idx))
    .filter(Boolean)
    .sort((a,b)=>a.t-b.t);
}

function persistCampaignLog(){
  try{
    localStorage.setItem(CAMPAIGN_LOG_LOCAL_KEY, JSON.stringify(campaignLogEntries));
  }catch(e){
    console.error('Failed to persist campaign log', e);
  }
}

function renderCampaignCollection(entries, targetId, emptyMessage){
  const container = $(targetId);
  if(!container) return;
  if(!entries.length){
    container.innerHTML = emptyMessage ? `<div class="catalog-item"><div>${emptyMessage}</div></div>` : '';
    return;
  }
  container.innerHTML = entries
    .slice()
    .reverse()
    .map(entry=>`<div class="catalog-item" data-entry-id="${entry.id}"><div>${fmt(entry.t)} ${entry.name}</div><div>${entry.text}</div><div class="catalog-item__controls"><button class="btn-sm" type="button" data-entry-id="${entry.id}" data-act="edit" aria-label="Edit entry"></button><button class="btn-sm" type="button" data-entry-id="${entry.id}" data-act="del" aria-label="Delete entry"></button></div></div>`)
    .join('');
  applyEditIcons(container);
  applyDeleteIcons(container);
}

function updateBacklogButtonState(){
  const btn = $('campaign-view-backlog');
  if(!btn) return;
  const hasBacklog = campaignBacklogEntries.length > 0;
  btn.disabled = !hasBacklog;
  btn.setAttribute('aria-disabled', String(!hasBacklog));
  btn.textContent = hasBacklog
    ? `View Backlog (${campaignBacklogEntries.length})`
    : 'View Backlog';
}

function updateCampaignLogViews(){
  const sorted = campaignLogEntries.slice().sort((a,b)=>a.t-b.t);
  const visible = sorted.slice(-CAMPAIGN_LOG_VISIBLE_LIMIT);
  campaignBacklogEntries = sorted.slice(0, -CAMPAIGN_LOG_VISIBLE_LIMIT);
  renderCampaignCollection(visible, 'campaign-log', 'No campaign log entries yet.');
  renderCampaignCollection(campaignBacklogEntries, 'campaign-backlog', 'No backlog entries yet.');
  updateBacklogButtonState();
}

function mergeCampaignEntry(entry){
  const normalized = normalizeCampaignLogEntry(entry);
  if(!normalized) return;
  const existingIdx = campaignLogEntries.findIndex(e => e.id === normalized.id);
  if(existingIdx >= 0){
    campaignLogEntries[existingIdx] = normalized;
  }else{
    campaignLogEntries.push(normalized);
  }
  campaignLogEntries.sort((a,b)=>a.t-b.t);
  if(normalized.t > lastLocalCampaignTimestamp){
    lastLocalCampaignTimestamp = normalized.t;
  }
  persistCampaignLog();
  updateCampaignLogViews();
}

function setCampaignEntries(entries){
  campaignLogEntries = normalizeCampaignLogEntries(entries);
  if(campaignLogEntries.length){
    lastLocalCampaignTimestamp = campaignLogEntries[campaignLogEntries.length - 1].t;
  }
  persistCampaignLog();
  updateCampaignLogViews();
}

function removeCampaignEntry(id){
  const idx = campaignLogEntries.findIndex(e => e.id === id);
  if(idx === -1) return null;
  const [removed] = campaignLogEntries.splice(idx, 1);
  persistCampaignLog();
  updateCampaignLogViews();
  return removed;
}

async function refreshCampaignLogFromCloud(){
  try{
    const remote = await fetchCampaignLogEntries();
    setCampaignEntries(remote);
  }catch(e){
    if(e && e.message !== 'fetch not supported'){
      console.error('Failed to refresh campaign log', e);
    }
  }
}

function createCampaignEntry(text, options = {}){
  const providedTs = Number(options.timestamp);
  const timestamp = Number.isFinite(providedTs) && providedTs > 0
    ? providedTs
    : nextLocalCampaignTimestamp();
  const providedId = typeof options.id === 'string' && options.id.trim()
    ? options.id.trim()
    : `${timestamp.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const providedName = typeof options.name === 'string' && options.name.trim()
    ? options.name.trim()
    : resolveActorName();
  return { id: providedId, t: timestamp, name: providedName, text };
}

function queueCampaignLogEntry(text, options = {}){
  if (typeof text !== 'string' || !text.trim()) return null;
  const entry = createCampaignEntry(text, options);
  mergeCampaignEntry(entry);
  if (options.sync === false) return entry;
  (async () => {
    try{
      const saved = await appendCampaignLogEntry(entry);
      if (saved) mergeCampaignEntry(saved);
    }catch(err){
      if (err && err.message !== 'fetch not supported') {
        console.error('Failed to sync campaign log entry', err);
      }
    }
  })();
  return entry;
}

function updateCampaignLogEntry(id, text, options = {}){
  if(typeof id !== 'string' || !id) return null;
  const existing = campaignLogEntries.find(entry => entry.id === id);
  if(!existing) return null;
  const normalizedText = typeof text === 'string' ? text : '';
  const updated = { ...existing, text: normalizedText };
  mergeCampaignEntry(updated);
  if(options.sync === false) return updated;
  (async()=>{
    try{
      const saved = await appendCampaignLogEntry(updated);
      if(saved) mergeCampaignEntry(saved);
    }catch(err){
      console.error('Failed to sync campaign log entry edit', err);
      try{ toast('Failed to sync campaign log entry edit', 'error'); }catch{}
    }
  })();
  return updated;
}

window.updateCampaignLogEntry = updateCampaignLogEntry;

updateCampaignLogViews();
const CONTENT_UPDATE_EVENT = 'cc:content-updated';
const DM_PENDING_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
let serviceWorkerUpdateHandled = false;

function queueDmNotification(message, meta = {}) {
  if (typeof window === 'undefined') return;
  const text = typeof message === 'string' ? message : String(message ?? '');
  if (!text) return;
  if (typeof window.dmNotify === 'function') {
    window.dmNotify(text, meta);
    return;
  }
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(DM_PENDING_NOTIFICATIONS_KEY);
    let pending = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pending = parsed;
    }
    const record = {
      detail: text,
      ts: typeof meta.ts === 'number' || typeof meta.ts === 'string' ? meta.ts : Date.now(),
      char: meta.char || 'System',
    };
    if (typeof meta.html === 'string' && meta.html) {
      record.html = meta.html;
    }
    pending.push(record);
    const MAX_PENDING = 20;
    if (pending.length > MAX_PENDING) {
      pending = pending.slice(pending.length - MAX_PENDING);
    }
    sessionStorage.setItem(DM_PENDING_NOTIFICATIONS_KEY, JSON.stringify(pending));
  } catch {
    /* ignore storage errors */
  }
}

function stashForcedRefreshState() {
  try {
    sessionStorage.setItem(SKIP_LAUNCH_STORAGE_KEY, '1');
  } catch (err) {
    // ignore storage errors but continue capturing state when possible
  }

  let snapshot = null;
  try {
    snapshot = serialize();
  } catch (err) {
    // ignore serialization errors
  }

  if (!snapshot) return;

  const payload = {
    data: snapshot,
    scrollY: typeof window !== 'undefined' && typeof window.scrollY === 'number' ? window.scrollY : 0,
    ts: Date.now(),
  };

  try {
    sessionStorage.setItem(FORCED_REFRESH_STATE_KEY, JSON.stringify(payload));
  } catch (err) {
    try { sessionStorage.removeItem(FORCED_REFRESH_STATE_KEY); } catch (cleanupErr) {
      // ignore cleanup failures
    }
  }
}

CC.prepareForcedRefresh = stashForcedRefreshState;

function consumeForcedRefreshState() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(FORCED_REFRESH_STATE_KEY);
    if (raw !== null) {
      sessionStorage.removeItem(FORCED_REFRESH_STATE_KEY);
    }
  } catch (err) {
    raw = null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function announceContentUpdate(payload = {}) {
  if (serviceWorkerUpdateHandled) return;
  serviceWorkerUpdateHandled = true;
  const baseMessage =
    typeof payload.message === 'string' && payload.message.trim()
      ? payload.message.trim()
      : 'New Codex content is available.';
  const message = /refresh/i.test(baseMessage) ? baseMessage : `${baseMessage} Refreshing to apply the latest data.`;
  const updatedAt = typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now();
  const detail = {
    ...payload,
    message,
    updatedAt,
    source: payload.source || 'service-worker',
  };
  if (typeof window !== 'undefined') {
    window.__ccLastContentUpdate = detail;
  }
  try {
    logAction(message);
  } catch {
    /* ignore logging errors */
  }
  queueDmNotification(message, { ts: updatedAt, char: detail.char || 'System' });
  try {
    toast(message, 'info');
  } catch {
    /* ignore toast errors */
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(CONTENT_UPDATE_EVENT, { detail }));
    } catch {
      /* ignore event errors */
    }
  }
  stashForcedRefreshState();
  setTimeout(() => {
    window.location.reload();
  }, 750);
}


function getRollSides(opts = {}) {
  const candidate = opts && opts.sides !== undefined ? opts.sides : opts?.die;
  const parsed = Number(candidate);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return 20;
}

function rollWithBonus(name, bonus, out, opts = {}){
  const sides = getRollSides(opts);
  const roll = 1 + Math.floor(Math.random() * sides);
  const resolution = resolveRollBonus(bonus, opts);
  const numericBonus = Number(bonus);
  const fallbackBonus = Number.isFinite(numericBonus) ? numericBonus : 0;
  const modifier = resolution && Number.isFinite(resolution.modifier)
    ? resolution.modifier
    : fallbackBonus;
  const total = roll + modifier;
  if(out){
    out.textContent = total;
    if (out.dataset) {
      if (resolution?.breakdown?.length) {
        out.dataset.rollBreakdown = resolution.breakdown.join(' | ');
      } else if (out.dataset.rollBreakdown) {
        delete out.dataset.rollBreakdown;
      }
      out.dataset.rollModifier = String(modifier);
    }
  }
  const sign = modifier >= 0 ? '+' : '';
  let message = `${name}: ${roll}${sign}${modifier} = ${total}`;
  if (resolution?.breakdown?.length) {
    message += ` [${resolution.breakdown.join(' | ')}]`;
  }
  logAction(message);
  if (opts && typeof opts.onRoll === 'function') {
    try {
      const baseBonusValue = resolution && Number.isFinite(resolution.baseBonus)
        ? resolution.baseBonus
        : fallbackBonus;
      opts.onRoll({
        roll,
        total,
        bonus: modifier,
        modifier,
        baseBonus: baseBonusValue,
        breakdown: resolution?.breakdown || [],
        baseBreakdown: resolution?.baseBreakdown || [],
        bonusBreakdown: resolution?.bonusBreakdown || [],
        appliedBonuses: resolution?.appliedBonuses || [],
        name,
        output: out,
        options: opts,
        sides,
      });
    } catch (err) {
      console.error('rollWithBonus onRoll handler failed', err);
    }
  }
  return total;
}
renderLogs();
renderFullLogs();
const rollDiceButton = $('roll-dice');
const diceOutput = $('dice-out');
const diceSidesSelect = $('dice-sides');
const diceCountInput = $('dice-count');
const diceModeSelect = $('dice-mode');
const diceModifierInput = $('dice-mod');
const diceBreakdownList = $('dice-breakdown');
const diceResultRenderer = ensureDiceResultRenderer(diceOutput);
if (rollDiceButton) {
  if (rollDiceButton.dataset) {
    rollDiceButton.dataset.actionCue = 'dice-roll';
  }
  rollDiceButton.addEventListener('click', ()=>{
    const out = diceOutput;
    if (!out) return;
    const sides = num(diceSidesSelect?.value) || 20;
    const requestedCount = num(diceCountInput?.value) || 1;
    const count = Math.max(1, Math.floor(requestedCount));
    if (diceCountInput && count !== requestedCount) {
      diceCountInput.value = String(count);
    }
    const modeRaw = typeof diceModeSelect?.value === 'string' ? diceModeSelect.value : 'normal';
    const normalizedMode = modeRaw === 'advantage' || modeRaw === 'disadvantage' ? modeRaw : 'normal';
    const modifierRaw = diceModifierInput ? diceModifierInput.value : '';
    const trimmedModifier = typeof modifierRaw === 'string' ? modifierRaw.trim() : '';
    const parsedModifier = Number(trimmedModifier);
    const hasFiniteModifier = Number.isFinite(parsedModifier);
    const modifier = hasFiniteModifier ? parsedModifier : 0;
    const hasModifier = (trimmedModifier !== '' && hasFiniteModifier) || modifier !== 0;
    const rollDetails = Array.from({ length: count }, () => {
      const primary = 1 + Math.floor(Math.random() * sides);
      if (normalizedMode === 'normal') {
        return { primary, chosen: primary };
      }
      const secondary = 1 + Math.floor(Math.random() * sides);
      const chosen = normalizedMode === 'advantage'
        ? Math.max(primary, secondary)
        : Math.min(primary, secondary);
      return { primary, secondary, chosen };
    });
    const keptSum = rollDetails.reduce((total, detail) => total + detail.chosen, 0);
    const total = keptSum + modifier;
    const breakdownDisplay = rollDetails.map(detail => {
      if (normalizedMode !== 'normal' && Number.isFinite(detail.secondary)) {
        return `${detail.primary}/${detail.secondary}→${detail.chosen}`;
      }
      return String(detail.chosen);
    });
    out.classList.remove('rolling');
    const playIndex = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    if (diceResultRenderer && out) {
      diceResultRenderer.render(total, playIndex);
    } else {
      out.textContent = total;
    }
    void out.offsetWidth; out.classList.add('rolling');
    if (out.dataset) {
      out.dataset.rollModifier = String(modifier);
      out.dataset.rollSum = String(keptSum);
      out.dataset.rollTotal = String(total);
      if (normalizedMode !== 'normal') {
        out.dataset.rollMode = normalizedMode;
      } else if (out.dataset.rollMode) {
        delete out.dataset.rollMode;
      }
      out.dataset.rolls = breakdownDisplay.join(', ');
    }
    if (diceBreakdownList) {
      diceBreakdownList.textContent = '';
      const shouldShowBreakdown = normalizedMode !== 'normal' || count > 1 || hasModifier;
      if (shouldShowBreakdown) {
        const fragment = document.createDocumentFragment();
        rollDetails.forEach((detail, index) => {
          const item = document.createElement('li');
          if (normalizedMode !== 'normal' && Number.isFinite(detail.secondary)) {
            const secondary = detail.secondary;
            item.textContent = `${detail.primary}/${secondary}→${detail.chosen}`;
            item.setAttribute('aria-label', `Roll ${index + 1}: ${detail.primary} vs ${secondary}, kept ${detail.chosen}`);
          } else {
            item.textContent = String(detail.chosen);
            item.setAttribute('aria-label', `Roll ${index + 1}: ${detail.chosen}`);
          }
          fragment.appendChild(item);
        });
        if (hasModifier) {
          const modItem = document.createElement('li');
          const sign = modifier >= 0 ? '+' : '-';
          modItem.textContent = `${sign}${Math.abs(modifier)} mod`;
          modItem.setAttribute('aria-label', `Modifier ${sign}${Math.abs(modifier)}`);
          fragment.appendChild(modItem);
        }
        diceBreakdownList.appendChild(fragment);
        diceBreakdownList.hidden = false;
      } else {
        diceBreakdownList.hidden = true;
      }
    }
    playDamageAnimation(total);
    const actionKey = rollDiceButton.dataset?.actionCue || 'dice-roll';
    playActionCue(actionKey, 'dm-roll');
    const modeLabel = normalizedMode === 'normal' ? '' : ` (${normalizedMode})`;
    const modifierText = hasModifier ? `${modifier >= 0 ? '+' : ''}${modifier}` : '';
    const header = `${count}×d${sides}${modeLabel}`;
    const headerWithModifier = modifierText ? `${header} ${modifierText}` : header;
    const arithmetic = hasModifier
      ? `${keptSum} ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)} = ${total}`
      : `${total}`;
    const message = `${headerWithModifier}: ${breakdownDisplay.join(', ')} = ${arithmetic}`;
    logAction(message);
    window.dmNotify?.(`Rolled ${message}`);
  });
}
const coinFlipButton = $('flip');
if (coinFlipButton) {
  if (coinFlipButton.dataset) {
    coinFlipButton.dataset.actionCueHeads = 'coin-heads';
    coinFlipButton.dataset.actionCueTails = 'coin-tails';
  }
  coinFlipButton.addEventListener('click', ()=>{
    const v = Math.random()<.5 ? 'Heads' : 'Tails';
    $('flip-out').textContent = v;
    playCoinAnimation(v);
    const actionKey = v === 'Heads'
      ? coinFlipButton.dataset?.actionCueHeads || 'coin-heads'
      : coinFlipButton.dataset?.actionCueTails || 'coin-tails';
    playActionCue(actionKey, 'coin-flip');
    logAction(`Coin flip: ${v}`);
    window.dmNotify?.(`Coin flip: ${v}`);
  });
}
const dmRollButton = $('dm-roll');
if (dmRollButton && dmRollButton !== rollDiceButton) {
  if (dmRollButton.dataset) {
    dmRollButton.dataset.actionCue = 'dm-roll';
  }
  dmRollButton.addEventListener('click', ()=>{
    const actionKey = dmRollButton.dataset?.actionCue || 'dm-roll';
    playActionCue(actionKey, 'dm-roll');
  });
}

function playDamageAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('damage-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=String(amount);
  anim.hidden=false;
  playStatusCue('damage');
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

const AUDIO_CUE_SETTINGS = {
  down: {
    frequency: 110,
    type: 'sawtooth',
    duration: 0.55,
    volume: 0.3,
    attack: 0.02,
    release: 0.25,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.6 },
    ],
  },
  death: {
    frequency: 70,
    type: 'square',
    duration: 0.85,
    volume: 0.28,
    attack: 0.01,
    release: 0.35,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.45 },
    ],
  },
  'dm-roll': {
    frequency: 320,
    type: 'triangle',
    duration: 0.45,
    volume: 0.28,
    attack: 0.01,
    release: 0.22,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.5 },
      { ratio: 2, amplitude: 0.25 },
    ],
  },
  'coin-flip': {
    frequency: 920,
    type: 'sine',
    duration: 0.35,
    volume: 0.26,
    attack: 0.008,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.35 },
      { ratio: 3, amplitude: 0.18 },
    ],
  },
  'credits-gain': {
    frequency: 740,
    type: 'triangle',
    duration: 0.28,
    volume: 0.24,
    attack: 0.005,
    release: 0.16,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.45 },
    ],
  },
  'credits-save': {
    frequency: 510,
    type: 'sine',
    duration: 0.32,
    volume: 0.22,
    attack: 0.01,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.4 },
    ],
  },
  'credits-spend': {
    frequency: 320,
    type: 'sawtooth',
    duration: 0.3,
    volume: 0.24,
    attack: 0.006,
    release: 0.14,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.5 },
    ],
  },
  'hp-damage': {
    frequency: 280,
    type: 'square',
    duration: 0.25,
    volume: 0.27,
    attack: 0.005,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.3 },
    ],
  },
  'hp-heal': {
    frequency: 640,
    type: 'triangle',
    duration: 0.3,
    volume: 0.24,
    attack: 0.008,
    release: 0.15,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.4 },
    ],
  },
  'hp-down': {
    frequency: 190,
    type: 'sawtooth',
    duration: 0.5,
    volume: 0.28,
    attack: 0.01,
    release: 0.3,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.5 },
    ],
  },
  'sp-gain': {
    frequency: 520,
    type: 'sine',
    duration: 0.22,
    volume: 0.2,
    attack: 0.005,
    release: 0.1,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.3 },
    ],
  },
  'sp-spend': {
    frequency: 360,
    type: 'triangle',
    duration: 0.24,
    volume: 0.21,
    attack: 0.006,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.35 },
    ],
  },
  'sp-empty': {
    frequency: 240,
    type: 'square',
    duration: 0.32,
    volume: 0.25,
    attack: 0.007,
    release: 0.2,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.4 },
    ],
  },
  heal: {
    frequency: 660,
    type: 'sine',
    duration: 0.7,
    volume: 0.22,
    attack: 0.015,
    release: 0.3,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.55 },
      { ratio: 2, amplitude: 0.3 },
    ],
  },
  damage: {
    frequency: 240,
    type: 'square',
    duration: 0.5,
    volume: 0.32,
    attack: 0.01,
    release: 0.2,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.75, amplitude: 0.5 },
      { ratio: 2.5, amplitude: 0.25 },
    ],
  },
  save: {
    frequency: 540,
    type: 'triangle',
    duration: 0.6,
    volume: 0.24,
    attack: 0.012,
    release: 0.24,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.33, amplitude: 0.6 },
      { ratio: 2, amplitude: 0.28 },
    ],
  },
};

let audioContext;
const audioCueCache = new Map();

function primeAudioContext(){
  if(audioContextPrimedOnce){
    const existing = ensureAudioContext();
    if(existing) existing.__ccPrimed = true;
    return existing;
  }
  audioContextPrimedOnce = true;
  const ctx = ensureAudioContext();
  if(!ctx) return null;
  ctx.__ccPrimed = true;
  try{
    const oscillator = typeof ctx.createOscillator === 'function' ? ctx.createOscillator() : null;
    if(!oscillator) return ctx;
    const gain = typeof ctx.createGain === 'function' ? ctx.createGain() : null;
    if(gain){
      if(gain.gain){
        try {
          if(typeof gain.gain.setValueAtTime === 'function'){
            gain.gain.setValueAtTime(0, ctx.currentTime ?? 0);
          }else{
            gain.gain.value = 0;
          }
        } catch {
          gain.gain.value = 0;
        }
      }
      oscillator.connect?.(gain);
      gain.connect?.(ctx.destination);
    }else{
      oscillator.connect?.(ctx.destination);
    }
    const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
    oscillator.start?.(now);
    oscillator.stop?.(now + 0.001);
    oscillator.disconnect?.();
    gain?.disconnect?.();
  }catch{
    /* noop */
  }
  return ctx;
}

function ensureAudioContext(){
  if(typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) return null;
  if(!audioContext){
    audioContext = new Ctx();
  }
  if(audioContext?.state === 'suspended'){
    audioContext.resume?.().catch(()=>{});
  }
  return audioContext;
}

function renderWaveSample(type, freq, t){
  const phase = 2 * Math.PI * freq * t;
  switch(type){
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

function buildAudioBuffer(name){
  const ctx = ensureAudioContext();
  if(!ctx) return null;
  const config = AUDIO_CUE_SETTINGS[name];
  if(!config) return null;
  const {
    duration = 0.4,
    frequency = 440,
    type = 'sine',
    volume = 0.2,
    attack = 0.01,
    release = 0.1,
    partials,
  } = config;
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);
  const voices = (partials && partials.length) ? partials : [{ ratio: 1, amplitude: 1 }];
  const normalization = voices.reduce((sum, part)=>sum + Math.abs(part.amplitude ?? 1), 0) || 1;

  for(let i=0;i<totalSamples;i++){
    const t = i / sampleRate;
    let envelope = 1;
    if(attack > 0 && t < attack){
      envelope = t / attack;
    }else if(release > 0 && t > duration - release){
      envelope = Math.max((duration - t) / release, 0);
    }
    let sample = 0;
    for(const part of voices){
      const ratio = part.ratio ?? 1;
      const amplitude = part.amplitude ?? 1;
      sample += amplitude * renderWaveSample(type, frequency * ratio, t);
    }
    data[i] = (sample / normalization) * envelope * volume;
  }

  audioCueCache.set(name, buffer);
  return buffer;
}

function resolveActionCueKey(actionKey) {
  if (typeof actionKey !== 'string') return null;
  const normalized = actionKey.trim();
  if (!normalized) return null;
  if (Object.prototype.hasOwnProperty.call(AUDIO_CUE_SETTINGS, normalized)) {
    return normalized;
  }
  if (typeof audioCueData?.has === 'function' && audioCueData.has(normalized)) {
    return normalized;
  }
  return null;
}

function playActionCue(actionKey, fallbackCueName) {
  const primary = resolveActionCueKey(actionKey);
  const fallback = resolveActionCueKey(fallbackCueName);
  const cue = primary || fallback || fallbackCueName || actionKey;
  if (!cue) return;
  playStatusCue(cue);
}

function playStatusCue(name){
  const ctx = ensureAudioContext();
  if(!ctx) return;
  const buffer = audioCueCache.get(name) ?? buildAudioBuffer(name);
  if(!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 1;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

function playDownAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('down-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  playStatusCue('down');
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playDeathAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('death-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  playStatusCue('death');
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playHealAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('heal-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=`+${amount}`;
  anim.hidden=false;
  playStatusCue('heal');
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playSaveAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('save-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  playStatusCue('save');
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function cueSuccessfulSave(){
  try {
    const cue = playSaveAnimation();
    if (cue && typeof cue.catch === 'function') {
      cue.catch(err => console.error('Save confirmation cue failed', err));
    }
    return cue;
  } catch (err) {
    console.error('Save confirmation cue failed', err);
    return Promise.resolve();
  }
}

function playCoinAnimation(result){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('coin-animation');
  if(!anim) return Promise.resolve();
  const headsFace = anim.querySelector('.coin-face--heads');
  const tailsFace = anim.querySelector('.coin-face--tails');
  if(headsFace){
    headsFace.textContent = anim.dataset.heads || 'Heads';
  }
  if(tailsFace){
    tailsFace.textContent = anim.dataset.tails || 'Tails';
  }
  anim.dataset.result=result;
  anim.classList.remove('is-heads','is-tails');
  if(result==='Heads'){
    anim.classList.add('is-heads');
  }else if(result==='Tails'){
    anim.classList.add('is-tails');
  }
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.classList.remove('is-heads','is-tails');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playSPAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('sp-animation');
  if(!anim) return Promise.resolve();
  anim.textContent = `${amount>0?'+':''}${amount}`;
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playLoadAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('load-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

const deathSuccesses = ['death-success-1','death-success-2','death-success-3'].map(id=>$(id));
const deathFailures = ['death-fail-1','death-fail-2','death-fail-3'].map(id=>$(id));
const deathOut = $('death-save-out');
const deathRollMode = $('death-save-mode');
const deathModifierInput = $('death-save-mod');
let deathState = null; // null, 'stable', 'dead'

function markBoxes(arr, n){
  for(const box of arr){
    if(!box.checked){
      box.checked=true;
      n--;
      if(n<=0) break;
    }
  }
}

function resetDeathSaves(){
  [...deathSuccesses, ...deathFailures].forEach(b=> b.checked=false);
  deathState=null;
  if(deathOut){
    deathOut.textContent='';
    if (deathOut.dataset) {
      delete deathOut.dataset.rollBreakdown;
      delete deathOut.dataset.rollModifier;
      delete deathOut.dataset.rollMode;
      delete deathOut.dataset.rolls;
    }
  }
}
$('death-save-reset')?.addEventListener('click', resetDeathSaves);

async function checkDeathProgress(){
  if(deathFailures.every(b=>b.checked)){
    if(deathState!=='dead'){
      deathState='dead';
      await playDeathAnimation();
      toast('You have fallen, your sacrifice will be remembered.', 'error');
      logAction('Death save failed: character has fallen.');
    }
  }else if(deathSuccesses.every(b=>b.checked)){
    if(deathState!=='stable'){
      deathState='stable';
      toast('You are stable at 0 HP.', 'success');
      logAction('Death saves complete: character is stable at 0 HP.');
    }
  }else{
    deathState=null;
  }
}
[...deathSuccesses, ...deathFailures].forEach(box=> box.addEventListener('change', checkDeathProgress));

$('roll-death-save')?.addEventListener('click', ()=>{
  const modeRaw = typeof deathRollMode?.value === 'string' ? deathRollMode.value : 'normal';
  const normalizedMode = modeRaw === 'advantage' || modeRaw === 'disadvantage' ? modeRaw : 'normal';
  const manualInputRaw = deathModifierInput ? deathModifierInput.value : '';
  const manualNumeric = Number(manualInputRaw);
  const hasManualModifier = deathModifierInput ? deathModifierInput.value !== '' : false;
  const baseBonus = Number.isFinite(manualNumeric) ? manualNumeric : 0;
  const baseBonuses = [];
  if (hasManualModifier && Number.isFinite(manualNumeric)) {
    baseBonuses.push({ label: 'Modifier', value: baseBonus, includeZero: true });
  }
  const rollOptions = { type: 'death-save', baseBonuses };
  const sides = getRollSides(rollOptions);
  const rollCount = normalizedMode === 'normal' ? 1 : 2;
  const rolls = Array.from({ length: rollCount }, () => 1 + Math.floor(Math.random() * sides));
  const chosenRoll = normalizedMode === 'advantage'
    ? Math.max(...rolls)
    : normalizedMode === 'disadvantage'
      ? Math.min(...rolls)
      : rolls[0];
  const resolution = resolveRollBonus(baseBonus, rollOptions);
  const numericBonus = Number(baseBonus);
  const fallbackBonus = Number.isFinite(numericBonus) ? numericBonus : 0;
  const modifier = resolution && Number.isFinite(resolution.modifier)
    ? resolution.modifier
    : fallbackBonus;
  const total = chosenRoll + modifier;
  if (deathOut) {
    deathOut.textContent = total;
    if (deathOut.dataset) {
      if (resolution?.breakdown?.length) {
        deathOut.dataset.rollBreakdown = resolution.breakdown.join(' | ');
      } else if (deathOut.dataset.rollBreakdown) {
        delete deathOut.dataset.rollBreakdown;
      }
      deathOut.dataset.rollModifier = String(modifier);
      if (normalizedMode !== 'normal') {
        deathOut.dataset.rollMode = normalizedMode;
        deathOut.dataset.rolls = rolls.join('/');
      } else {
        delete deathOut.dataset.rollMode;
        delete deathOut.dataset.rolls;
      }
    }
  }
  const sign = modifier >= 0 ? '+' : '';
  const modeLabel = normalizedMode === 'normal' ? '' : ` (${normalizedMode})`;
  const rollDisplay = normalizedMode === 'normal'
    ? String(chosenRoll)
    : `${rolls.join('/')}→${chosenRoll}`;
  let message = `Death save${modeLabel}: ${rollDisplay}${sign}${modifier} = ${total}`;
  if (resolution?.breakdown?.length) {
    message += ` [${resolution.breakdown.join(' | ')}]`;
  }
  logAction(message);

  if (chosenRoll === 20) {
    resetDeathSaves();
    toast('Critical success! You regain 1 HP and awaken.', 'success');
    logAction('Death save critical success: regain 1 HP and awaken.');
    return;
  }
  if (chosenRoll === 1) {
    markBoxes(deathFailures, 2);
  } else if (total >= 10) {
    markBoxes(deathSuccesses, 1);
  } else {
    markBoxes(deathFailures, 1);
  }
  checkDeathProgress();
});
let activeCampaignEditEntryId = null;

function resetCampaignLogEditor(){
  activeCampaignEditEntryId = null;
  const field = $('campaign-edit-text');
  if(field){
    field.value = '';
  }
  const meta = $('campaign-edit-meta');
  if(meta){
    meta.textContent = '';
  }
}

function openCampaignLogEditor(id){
  const entry = campaignLogEntries.find(item => item.id === id);
  if(!entry) return;
  activeCampaignEditEntryId = id;
  const field = $('campaign-edit-text');
  if(field){
    field.value = entry.text;
  }
  const meta = $('campaign-edit-meta');
  if(meta){
    meta.textContent = `${fmt(entry.t)} ${entry.name}`;
  }
  show('modal-campaign-edit');
  if(typeof requestAnimationFrame === 'function'){
    requestAnimationFrame(()=>{
      const textarea = $('campaign-edit-text');
      if(!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      try{ textarea.setSelectionRange(end, end); }catch{}
    });
  }else if(field){
    field.focus();
  }
}

async function handleCampaignLogClick(e){
  const btn = e.target.closest('button[data-entry-id]');
  if(!btn) return;
  const id = btn.dataset.entryId;
  if(!id) return;
  const action = btn.dataset.act || 'del';
  if(action === 'edit'){
    openCampaignLogEditor(id);
    return;
  }
  if(action !== 'del') return;
  if(!confirm('Delete this entry?')) return;
  const removed = removeCampaignEntry(id);
  if(!removed) return;
  try{
    await deleteCampaignLogEntry(id);
    pushHistory();
  }catch(err){
    console.error('Failed to delete campaign log entry', err);
    mergeCampaignEntry(removed);
    try{ toast(err?.message || 'Failed to delete campaign log entry', 'error'); }catch{}
  }
}

const btnCampaignAdd = $('campaign-add');
if (btnCampaignAdd) {
  btnCampaignAdd.addEventListener('click', async ()=>{
    const field = $('campaign-entry');
    const text = field ? field.value.trim() : '';
    if(!text) return;
    const entry = createCampaignEntry(text);
    mergeCampaignEntry(entry);
    logAction(`${entry.name}: ${text}`);
    if(field) field.value='';
    pushHistory();
    try{
      const saved = await appendCampaignLogEntry(entry);
      mergeCampaignEntry(saved);
    }catch(err){
      console.error('Failed to sync campaign log entry', err);
      try{ toast('Failed to sync campaign log entry', 'error'); }catch{}
    }
  });
}

const campaignLogContainer = $('campaign-log');
if(campaignLogContainer){
  campaignLogContainer.addEventListener('click', handleCampaignLogClick);
}

const campaignBacklogContainer = $('campaign-backlog');
if(campaignBacklogContainer){
  campaignBacklogContainer.addEventListener('click', handleCampaignLogClick);
}

const campaignEditSave = $('campaign-edit-save');
if(campaignEditSave){
  campaignEditSave.addEventListener('click', ()=>{
    if(!activeCampaignEditEntryId) return;
    const field = $('campaign-edit-text');
    if(!field) return;
    const text = field.value.trim();
    if(!text){
      try{ toast('Campaign log text is required', 'error'); }catch{}
      return;
    }
    const current = campaignLogEntries.find(entry => entry.id === activeCampaignEditEntryId);
    if(!current){
      hide('modal-campaign-edit');
      resetCampaignLogEditor();
      return;
    }
    if(current.text === text){
      hide('modal-campaign-edit');
      resetCampaignLogEditor();
      return;
    }
    updateCampaignLogEntry(activeCampaignEditEntryId, text);
    pushHistory();
    try{ toast('Campaign log entry updated', 'success'); }catch{}
    hide('modal-campaign-edit');
    resetCampaignLogEditor();
  });
}

qsa('#modal-campaign-edit [data-close]').forEach(btn=>{
  btn.addEventListener('click', resetCampaignLogEditor);
});

const campaignEditOverlay = $('modal-campaign-edit');
if(campaignEditOverlay){
  campaignEditOverlay.addEventListener('click', event=>{
    if(event.target === campaignEditOverlay){
      resetCampaignLogEditor();
    }
  }, { capture: true });
}

const btnCampaignBacklog = $('campaign-view-backlog');
if(btnCampaignBacklog){
  btnCampaignBacklog.addEventListener('click', ()=>{
    updateCampaignLogViews();
    show('modal-campaign-backlog');
  });
}

subscribeCampaignLog(refreshCampaignLogFromCloud);
refreshCampaignLogFromCloud();
const btnLog = $('btn-log');
if (btnLog) {
  btnLog.addEventListener('click', ()=>{ renderLogs(); show('modal-log'); });
}
const btnLogFull = $('log-full');
if (btnLogFull) {
  btnLogFull.addEventListener('click', ()=>{ renderFullLogs(); hide('modal-log'); show('modal-log-full'); });
}
const creditsLedgerList = $('credits-ledger-list');
const creditsLedgerFilterButtons = Array.from(qsa('[data-ledger-filter]'));
let creditsLedgerFilter = 'all';

function setCreditsLedgerFilter(filter) {
  const normalized = filter === 'gain' || filter === 'spend' ? filter : 'all';
  creditsLedgerFilter = normalized;
  creditsLedgerFilterButtons.forEach(btn => {
    const target = btn?.dataset?.ledgerFilter || 'all';
    btn.setAttribute('aria-pressed', target === normalized ? 'true' : 'false');
  });
  renderCreditsLedger();
}

function renderCreditsLedger() {
  if (!creditsLedgerList) return;
  const entries = (() => {
    const all = getCreditsLedgerEntries();
    if (creditsLedgerFilter === 'gain') return all.filter(entry => entry.amount > 0);
    if (creditsLedgerFilter === 'spend') return all.filter(entry => entry.amount < 0);
    return all;
  })()
    .slice()
    .reverse();
  if (!entries.length) {
    creditsLedgerList.innerHTML = '<p class="credits-ledger__empty">No ledger entries yet.</p>';
    return;
  }
  const html = entries
    .map(entry => {
      const amountDisplay = entry.amount > 0
        ? `+${formatCreditsValue(entry.amount)}`
        : formatCreditsValue(entry.amount);
      const balanceDisplay = formatCreditsValue(entry.balance);
      const reasonText = escapeHtml(entry.reason || 'Adjustment');
      const ts = Number(entry.ts);
      const timestampLabel = Number.isFinite(ts) ? new Date(ts).toLocaleString() : '';
      const timestampHtml = timestampLabel
        ? `<div class="small credits-ledger__timestamp">${escapeHtml(timestampLabel)}</div>`
        : '';
      const typeClass = entry.amount >= 0 ? 'credits-ledger__entry--gain' : 'credits-ledger__entry--spend';
      return `<div class="catalog-item credits-ledger__entry ${typeClass}"><div class="credits-ledger__line"><span class="credits-ledger__amount">${escapeHtml(amountDisplay)}</span><span class="credits-ledger__balance">Balance: ${escapeHtml(balanceDisplay)}</span></div><div class="small">${reasonText}</div>${timestampHtml}</div>`;
    })
    .join('');
  creditsLedgerList.innerHTML = html;
}

creditsLedgerFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn?.dataset?.ledgerFilter || 'all';
    setCreditsLedgerFilter(target);
  });
});

const btnCreditsLedger = $('btn-credits-ledger');
if (btnCreditsLedger) {
  btnCreditsLedger.addEventListener('click', () => {
    setCreditsLedgerFilter('all');
    show('modal-credits-ledger');
  });
}

document.addEventListener('credits-ledger-updated', () => {
  renderCreditsLedger();
});

const btnCampaign = $('btn-campaign');
if (btnCampaign) {
  btnCampaign.addEventListener('click', ()=>{ updateCampaignLogViews(); show('modal-campaign'); });
}
const btnHelp = $('btn-help');
if (btnHelp) {
  btnHelp.addEventListener('click', ()=>{ show('modal-help'); });
}
const btnLoad = $('btn-load');
async function openCharacterList(){
  await renderCharacterList();
  show('modal-load-list');
}
if (btnLoad) {
  btnLoad.addEventListener('click', openCharacterList);
}
window.openCharacterList = openCharacterList;

async function renderCharacterList(){
  const list = $('char-list');
  if(!list) return;
  let names = [];
  try { names = await listCharacters(); }
  catch (e) { console.error('Failed to list characters', e); }
  const current = currentCharacter();
  list.innerHTML = '';
  names.forEach(c => {
    const item = document.createElement('div');
    item.className = `catalog-item${c===current ? ' active' : ''}`;
    const link = document.createElement('a');
    link.href = '#';
    link.dataset.char = c;
    link.textContent = c;
    item.appendChild(link);
    if(c !== 'The DM'){
      const lock = document.createElement('button');
      lock.className = 'btn-sm';
      lock.dataset.lock = c;
      item.appendChild(lock);
      const btn = document.createElement('button');
      btn.className = 'btn-sm';
      btn.dataset.del = c;
      item.appendChild(btn);
    }
    list.appendChild(item);
  });
  applyLockIcons(list);
  applyDeleteIcons(list);
  selectedChar = current;
}

document.addEventListener('character-saved', renderCharacterList);
document.addEventListener('character-deleted', renderCharacterList);
window.addEventListener('storage', renderCharacterList);

async function renderRecoverCharList(){
  const list = $('recover-char-list');
  if(!list) return;
  let names = [];
  try { names = await listRecoverableCharacters(); }
  catch (e) { console.error('Failed to list characters', e); }
  list.innerHTML = '';
  names.forEach(c => {
    const item = document.createElement('div');
    item.className = 'catalog-item';
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.dataset.char = c;
    btn.textContent = c;
    item.appendChild(btn);
    list.appendChild(item);
  });
}

async function renderRecoverList(name){
  const list = $('recover-list');
  if(!list) return;
  let backups = [];
  try { backups = await listBackups(name); }
  catch (e) { console.error('Failed to list backups', e); }
  const manual = backups.filter(b => b.type !== 'auto').sort((a, b) => b.ts - a.ts).slice(0, 3);
  const autos = backups.filter(b => b.type === 'auto').sort((a, b) => b.ts - a.ts).slice(0, 3);
  const renderGroup = (title, entries, type) => {
    if(entries.length === 0){
      return `<div class="recover-group"><h4>${title}</h4><p class="recover-empty">No ${title.toLowerCase()} found.</p></div>`;
    }
    const items = entries
      .map(b => `<div class="catalog-item"><button class="btn-sm" data-recover-ts="${b.ts}" data-recover-type="${type}">${name} - ${new Date(b.ts).toLocaleString()}</button></div>`)
      .join('');
    return `<div class="recover-group"><h4>${title}</h4>${items}</div>`;
  };
  if(manual.length === 0 && autos.length === 0){
    list.innerHTML = '<p>No backups found.</p>';
  } else {
    list.innerHTML = `${renderGroup('Auto Saves', autos, 'auto')}${renderGroup('Manual Saves', manual, 'manual')}`;
  }
  show('modal-recover-list');
}

let pendingLoad = null;
let recoverTarget = null;
let selectedChar = null;
const charList = $('char-list');
if(charList){
  charList.addEventListener('click', async e=>{
    const loadBtn = e.target.closest('[data-char]');
    const delBtn = e.target.closest('button[data-del]');
    const lockBtn = e.target.closest('button[data-lock]');
    if(loadBtn){
      e.preventDefault();
      selectedChar = loadBtn.dataset.char;
      qsa('#char-list .catalog-item').forEach(ci=> ci.classList.remove('active'));
      const item = loadBtn.closest('.catalog-item');
      if(item) item.classList.add('active');
      pendingLoad = { name: selectedChar };
      const text = $('load-confirm-text');
      if(text) text.textContent = `Are you sure you would like to load this character: ${pendingLoad.name}. All current progress will be lost if you haven't saved yet.`;
      show('modal-load');
    } else if(lockBtn){
      const ch = lockBtn.dataset.lock;
      await syncPin(ch);
      if(hasPin(ch)){
        const pin = await pinPrompt('Enter PIN to disable protection');
        if(pin !== null){
          const ok = await verifyStoredPin(ch, pin);
          if(ok){
            await clearPin(ch);
            applyLockIcon(lockBtn);
            toast('PIN disabled','info');
          }else{
            toast('Invalid PIN','error');
          }
        }
      }else{
        const pin1 = await pinPrompt('Set PIN');
        if(pin1){
          const pin2 = await pinPrompt('Confirm PIN');
          if(pin1 === pin2){
            await setPin(ch, pin1);
            applyLockIcon(lockBtn);
            toast('PIN enabled','success');
          }else if(pin2 !== null){
            toast('PINs did not match','error');
          }
        }
      }
    } else if(delBtn){
      const ch = delBtn.dataset.del;
      if(ch === 'The DM'){
        toast('Cannot delete The DM','error');
      }else if(confirm(`Delete ${ch}?`) && confirm('This cannot be undone. Are you sure?')){
        deleteCharacter(ch).then(()=>{
          renderCharacterList();
          toast('Deleted','info');
        }).catch(e=> toast(e.message || 'Delete failed','error'));
      }
    }
  });
}

const recoverCharListEl = $('recover-char-list');
if(recoverCharListEl){
  recoverCharListEl.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-char]');
    if(btn){
      recoverTarget = btn.dataset.char;
      hide('modal-recover-char');
      renderRecoverList(recoverTarget);
    }
  });
}

const recoverBtn = $('recover-save');
if(recoverBtn){
  recoverBtn.addEventListener('click', async ()=>{
    hide('modal-load-list');
    await renderRecoverCharList();
    show('modal-recover-char');
  });
}

const newCharBtn = $('create-character');
if(newCharBtn){
  newCharBtn.addEventListener('click', ()=>{
    if(!confirm('Start a new character? All current progress will be lost.')) return;
    const name = prompt('Enter new character name:');
    if(!name) return toast('Name required','error');
    const clean = name.trim();
    if(!clean) return toast('Name required','error');
    setCurrentCharacter(clean);
    syncMiniGamePlayerName();
    deserialize(DEFAULT_STATE);
    setMode('edit');
    hide('modal-load-list');
    toast(`Switched to ${clean}`,'success');
  });
}



const recoverListEl = $('recover-list');
if(recoverListEl){
  recoverListEl.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-recover-ts]');
    if(btn){
      const type = btn.dataset.recoverType || 'manual';
      pendingLoad = { name: recoverTarget, ts: Number(btn.dataset.recoverTs), type };
      const text = $('load-confirm-text');
      if(text){
        const descriptor = type === 'auto' ? 'auto save created on' : 'manual save from';
        text.textContent = `Are you sure you would like to recover ${pendingLoad.name} from the ${descriptor} ${new Date(pendingLoad.ts).toLocaleString()}? All current progress will be lost if you haven't saved yet.`;
      }
      hide('modal-recover-list');
      show('modal-load');
    }
  });
}

const loadCancelBtn = $('load-cancel');
const loadAcceptBtn = $('load-accept');
async function doLoad(){
  if(!pendingLoad) return;
  const previousMode = useViewMode();
  try{
    const data = pendingLoad.ts
      ? await loadBackup(pendingLoad.name, pendingLoad.ts, pendingLoad.type)
      : await loadCharacter(pendingLoad.name);
    deserialize(data);
    applyViewLockState();
    if(previousMode === 'view'){
      setMode('view', { skipPersist: true });
    }
    setCurrentCharacter(pendingLoad.name);
    syncMiniGamePlayerName();
    hide('modal-load');
    hide('modal-load-list');
    toast(`Loaded ${pendingLoad.name}`,'success');
    playLoadAnimation();
  }catch(e){
    toast(e.message || 'Load failed','error');
  }
}
if(loadAcceptBtn){ loadAcceptBtn.addEventListener('click', doLoad); }
if(loadCancelBtn){ loadCancelBtn.addEventListener('click', ()=>{ hide('modal-load'); }); }
qsa('[data-close]').forEach(b=> b.addEventListener('click', ()=>{ const ov=b.closest('.overlay'); if(ov) hide(ov.id); }));

function openCharacterModalByName(name){
  if(!name) return;
  selectedChar = name;
  pendingLoad = { name };
  const text = $('load-confirm-text');
  if(text) text.textContent = `Are you sure you would like to load this character: ${name}. All current progress will be lost if you haven't saved yet.`;
  show('modal-load');
}
window.openCharacterModal = openCharacterModalByName;

const params = new URLSearchParams(window.location.search);
const autoChar = params.get('char');
if (autoChar) {
  (async () => {
    const prev = currentCharacter();
    const previousMode = useViewMode();
    try {
      setCurrentCharacter(autoChar);
      syncMiniGamePlayerName();
      const data = await loadCharacter(autoChar);
      deserialize(data);
      applyViewLockState();
      if (previousMode === 'view') {
        setMode('view', { skipPersist: true });
      }
    } catch (e) {
      console.error('Failed to load character from URL', e);
    } finally {
      setCurrentCharacter(prev);
      syncMiniGamePlayerName();
    }
  })();
}

/* ========= Card Helper ========= */
const HAMMERSPACE_POWER_NAME = 'Gat Dang Hammerspace';
const HAMMERSPACE_NAME_KEY = HAMMERSPACE_POWER_NAME.toLowerCase();
const HANK_NAME_CANDIDATES = ['hank', 'hank hill'];
const HAMMERSPACE_DIE_SIDES = 20;
const HAMMERSPACE_TABLE = [
  {
    title: 'Propane Powerhouse',
    lines: [
      'Effect: Pull out a propane tank flamethrower.',
      'Damage: 4d6 fire damage in a 15-foot cone.',
      'Narrative: “I tell you what—propane solves everything.”'
    ]
  },
  {
    title: 'Mower of Justice',
    lines: [
      'Effect: Summon a riding lawnmower.',
      'Damage: 3d8 bludgeoning in a 10-foot line.',
      'Narrative: “Time to mow down the competition.”'
    ]
  },
  {
    title: 'The King of the Grill',
    lines: [
      'Effect: A magical barbecue grill heals allies.',
      'Healing: Allies within 10 feet regain 2d6 HP.',
      'Narrative: “Prime-grade grilling, comin’ right up.”'
    ]
  },
  {
    title: '“That’s My Purse!” Technique',
    lines: [
      'Effect: Swing an oversized purse.',
      'Damage: 2d6 bludgeoning, DC 13 Con save or stunned 1 round.',
      'Narrative: “That’s my purse! I don’t know you!”'
    ]
  },
  {
    title: 'Propane-Powered Punchline',
    lines: [
      'Effect: Tiny propane lighter + Hank one-liner.',
      'Buff: Allies gain advantage on their next attack.',
      'Narrative: “This’ll light a fire under y’all.”'
    ]
  },
  {
    title: 'Sacred Spatula',
    lines: [
      'Effect: Giant spatula flips enemies.',
      'Damage: 1d8 bludgeoning + push target 10 feet.',
      'Narrative: “Guess you’re well done.”'
    ]
  },
  {
    title: 'Pocket Sand (Dale Tribute)',
    lines: [
      'Effect: Toss pocket sand from nowhere.',
      'Damage: 1d4 and blinds target until end of next turn.',
      'Narrative: “Sh-sh-shaa!”'
    ]
  },
  {
    title: 'Propane Tank Shield',
    lines: [
      'Effect: A propane tank becomes a makeshift shield.',
      'Buff: +2 AC for 1 minute.',
      'Narrative: “Good ol’ propane—stronger than steel.”'
    ]
  },
  {
    title: 'BBQ Sauce Flood',
    lines: [
      'Effect: Wave of sauce sprays enemies.',
      'Damage: 2d6 acid-like sticky damage, movement halved 1 round.',
      'Narrative: “Now you’re marinated.”'
    ]
  },
  {
    title: 'Tactical Lawn Chair',
    lines: [
      'Effect: Summon a folding chair.',
      'Damage: 1d6 bludgeoning, or provide ally +1 AC when used defensively.',
      'Narrative: “Y’all sit down now.”'
    ]
  },
  {
    title: 'Toolbelt Toss',
    lines: [
      'Effect: A full toolbox flings open.',
      'Damage: 2d6 piercing/bludgeoning in a 5-foot radius.',
      'Narrative: “Dang ol’ maintenance required.”'
    ]
  },
  {
    title: 'Hank’s Holy Handbook',
    lines: [
      'Effect: Manifest a guidebook on propane.',
      'Buff: Advantage on persuasion or intimidation for 1 check.',
      'Narrative: “Let me educate you.”'
    ]
  },
  {
    title: 'Charcoal Curse',
    lines: [
      'Effect: Accidentally pull charcoal instead of propane.',
      'Debuff: Disadvantage on next attack roll.',
      'Narrative: “Charcoal?! That’s just wrong.”'
    ]
  },
  {
    title: 'Mega Rake',
    lines: [
      'Effect: A comically long rake appears.',
      'Damage: 2d8 slashing, can also trip a foe (DC 14 Dex save).',
      'Narrative: “Keep off the dang lawn.”'
    ]
  },
  {
    title: 'Lawn Care Miracle',
    lines: [
      'Effect: Fertilizer spreads a healing aura.',
      'Healing: Allies in 15 feet regain 1d8 + Con HP.',
      'Narrative: “Healthy grass, healthy folks.”'
    ]
  },
  {
    title: 'Texas Belt Buckle Slam',
    lines: [
      'Effect: Massive glowing belt buckle punch.',
      'Damage: 3d6 radiant bludgeoning.',
      'Narrative: “Proud Texan power!”'
    ]
  },
  {
    title: 'Propane Jetpack',
    lines: [
      'Effect: Strap on twin propane tanks.',
      'Utility: Fly 30 feet for 1 round. Landing deals 2d6 fire in 5 feet.',
      'Narrative: “Not recommended by the handbook.”'
    ]
  },
  {
    title: 'King of the Hilltop Banner',
    lines: [
      'Effect: A flag waves, rallying allies.',
      'Buff: Allies within 20 feet gain +1 to attack rolls for 1 minute.',
      'Narrative: “We stand tall, like a hill.”'
    ]
  },
  {
    title: 'Grill Grease Slip',
    lines: [
      'Effect: Spill grease everywhere.',
      'Damage: 1d6 fire if ignited; enemies in 10 feet must save (DC 12 Dex) or fall prone.',
      'Narrative: “Careful now—slippery.”'
    ]
  },
  {
    title: 'Spirit of Texas BBQ',
    lines: [
      'Effect: Legendary spectral cow spirit appears.',
      'Damage: Charges for 4d10 bludgeoning against 1 target, then vanishes.',
      'Narrative: “By God, the spirit of Texas itself.”'
    ]
  }
];

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isHankIdentity(value) {
  const normalized = normalizeName(value);
  if (!normalized) return false;
  if (HANK_NAME_CANDIDATES.includes(normalized)) return true;
  return normalized.includes('hank hill');
}

function isActiveHankCharacter() {
  try {
    if (isHankIdentity(typeof currentCharacter === 'function' ? currentCharacter() : null)) {
      return true;
    }
  } catch {}
  const hero = $('superhero');
  if (hero && isHankIdentity(hero.value)) return true;
  const secret = $('secret');
  if (secret && isHankIdentity(secret.value)) return true;
  return false;
}

function isHammerspaceName(value) {
  return normalizeName(value) === HAMMERSPACE_NAME_KEY;
}

function normalizeHammerspaceRoll(roll) {
  if (!Number.isInteger(roll)) return null;
  const max = Math.min(HAMMERSPACE_DIE_SIDES, HAMMERSPACE_TABLE.length);
  if (!Number.isFinite(max) || max <= 0) return null;
  if (roll < 1) return 1;
  if (roll > max) return max;
  return roll;
}

function getHammerspaceEntry(roll) {
  const normalized = normalizeHammerspaceRoll(roll);
  if (!Number.isInteger(normalized)) return null;
  const idx = normalized - 1;
  if (idx < 0 || idx >= HAMMERSPACE_TABLE.length) return null;
  return HAMMERSPACE_TABLE[idx];
}

function formatHammerspaceMessage(roll, entry) {
  if (!entry) return null;
  const lines = Array.isArray(entry.lines) ? entry.lines : [];
  const textParts = [`${HAMMERSPACE_POWER_NAME} (Roll ${roll}: ${entry.title})`];
  const htmlLines = [];
  lines.forEach(line => {
    if (!line) return;
    textParts.push(`• ${line}`);
    htmlLines.push(`<span class="toast-line">• ${escapeHtml(line)}</span>`);
  });
  const htmlBody = [`<strong>${escapeHtml(HAMMERSPACE_POWER_NAME)}</strong>`, `<span class="toast-subtitle">Roll ${roll}: ${escapeHtml(entry.title)}</span>`];
  if (htmlLines.length) {
    htmlBody.push(...htmlLines);
  }
  return {
    text: textParts.join(' '),
    html: `<div class="toast-body">${htmlBody.join('')}</div>`
  };
}

function showHammerspaceResult(roll) {
  const normalizedRoll = normalizeHammerspaceRoll(roll);
  const entry = getHammerspaceEntry(normalizedRoll);
  const message = formatHammerspaceMessage(normalizedRoll, entry);
  if (!message) return;
  try {
    toast(message.text, { type: 'info', duration: 0, html: message.html });
  } catch {}
  try {
    logAction(`${HAMMERSPACE_POWER_NAME} result (${normalizedRoll}): ${entry.title}`);
  } catch {}
  try {
    window.dmNotify?.(message.text, { ts: Date.now(), char: currentCharacter?.() || 'Hank' });
  } catch {}
}

function markHammerspaceState(card) {
  if (!card || card.dataset.kind !== 'sig') return;
  const nameField = qs("[data-f='name']", card);
  const delBtn = qs("[data-act='del']", card);
  const locked = isActiveHankCharacter() && isHammerspaceName(nameField?.value || '');
  card.dataset.hammerspaceLock = locked ? 'true' : 'false';
  if (delBtn) {
    if (locked) {
      delBtn.disabled = true;
      delBtn.setAttribute('aria-disabled', 'true');
      delBtn.title = `${HAMMERSPACE_POWER_NAME} cannot be deleted`;
    } else {
      delBtn.disabled = false;
      delBtn.removeAttribute('aria-disabled');
      if (delBtn.title === `${HAMMERSPACE_POWER_NAME} cannot be deleted`) {
        delBtn.removeAttribute('title');
      }
    }
  }
}

function refreshHammerspaceCards() {
  qsa("[data-kind='sig']").forEach(markHammerspaceState);
}

function generatePowerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch {}
  }
  return `power-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function getRangeOptionsForShape(shape) {
  const options = POWER_SHAPE_RANGES[shape];
  if (options && options.length) return options;
  return POWER_RANGE_QUICK_VALUES.filter(value => value !== 'Melee');
}

function parseFeetValue(rangeValue) {
  if (typeof rangeValue !== 'string') return null;
  const match = rangeValue.match(/^(\d+)\s*ft$/i);
  if (!match) return null;
  const feet = Number(match[1]);
  return Number.isFinite(feet) ? feet : null;
}

function formatMetricRange(rangeValue) {
  const feet = parseFeetValue(rangeValue);
  if (feet === null) return '';
  const meters = Math.round(feet * 0.3048);
  if (!Number.isFinite(meters) || meters <= 0) return '';
  return `${meters} m`;
}

function formatRangeDisplay(rangeValue, settings) {
  if (!settings?.showMetricRanges) return rangeValue;
  const metric = formatMetricRange(rangeValue);
  return metric ? `${rangeValue} (${metric})` : rangeValue;
}

function getPreferredRangeForShape(shape, options, settings) {
  if (shape === 'Melee') return 'Melee';
  if (!options || !options.length) return '';
  if (shape === 'Self') return 'Self';
  const unit = settings?.defaultRangeUnit === 'narrative' ? 'narrative' : 'feet';
  if (unit === 'narrative') {
    const narrativeOption = options.find(opt => /unlimited|narrative/i.test(opt));
    if (narrativeOption) return narrativeOption;
  }
  const preferredTargets = {
    Cone: ['30 ft', '15 ft', '60 ft'],
    Line: ['60 ft', '30 ft', '120 ft'],
    Radius: ['20 ft', '15 ft', '10 ft', '30 ft'],
    Aura: ['10 ft', '15 ft', '20 ft', 'Self'],
    'Ranged Single': ['30 ft', '60 ft', '90 ft', '120 ft'],
  };
  const targetList = preferredTargets[shape] || ['30 ft', '60 ft'];
  for (const target of targetList) {
    if (options.includes(target)) return target;
  }
  const numeric = options.filter(opt => parseFeetValue(opt) !== null);
  if (numeric.length) return numeric[0];
  return options[0];
}

function ensureRangeForShape(shape, range, settings) {
  const options = getRangeOptionsForShape(shape);
  const trimmed = typeof range === 'string' ? range.trim() : '';
  if (!options.length) return trimmed || '';
  if (trimmed && options.includes(trimmed)) return trimmed;
  if (shape === 'Melee') return 'Melee';
  return getPreferredRangeForShape(shape, options, settings);
}

function suggestOnSaveBehavior(effectTag) {
  if (!effectTag) return 'Half';
  return EFFECT_ON_SAVE_SUGGESTIONS[effectTag] || 'Half';
}

function matchLegacyEffectTag(text) {
  if (!text) return null;
  for (const entry of LEGACY_EFFECT_KEYWORDS) {
    if (entry.patterns.some(pattern => pattern.test(text))) {
      return entry.tag;
    }
  }
  return null;
}

function detectDamageTypeFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('fire') || lower.includes('ember') || lower.includes('flame')) return 'Fire';
  if (lower.includes('cold') || lower.includes('ice') || lower.includes('frost')) return 'Cold';
  if (lower.includes('lightning') || lower.includes('shock') || lower.includes('elect')) return 'Lightning';
  if (lower.includes('psychic') || lower.includes('mind') || lower.includes('mental')) return 'Psychic';
  if (lower.includes('force') || lower.includes('kinetic')) return 'Force';
  if (lower.includes('radiant') || lower.includes('light')) return 'Radiant';
  if (lower.includes('necrotic') || lower.includes('void') || lower.includes('shadow')) return 'Necrotic';
  if (lower.includes('acid') || lower.includes('corros')) return 'Acid';
  if (lower.includes('slam') || lower.includes('punch') || lower.includes('impact')) return 'Kinetic';
  return null;
}

function inferShapeFromLegacy(rangeText) {
  const text = String(rangeText || '').toLowerCase();
  if (text.includes('cone')) return 'Cone';
  if (text.includes('line')) return 'Line';
  if (text.includes('radius') || text.includes('burst')) return 'Radius';
  if (text.includes('aura')) return 'Aura';
  if (text.includes('self')) return 'Self';
  if (text.includes('melee')) return 'Melee';
  return 'Ranged Single';
}

function parseLegacyRange(rangeText, shape) {
  const text = String(rangeText || '').trim();
  const settings = typeof getCharacterPowerSettings === 'function' ? getCharacterPowerSettings() : null;
  if (!text) {
    if (shape === 'Melee') return 'Melee';
    if (shape === 'Self') return 'Self';
    const options = getRangeOptionsForShape(shape);
    return ensureRangeForShape(shape, options[0] || '', settings);
  }
  const ftMatch = text.match(/([0-9]{1,3})\s*ft/i);
  if (ftMatch) {
    const candidate = `${ftMatch[1]} ft`;
    return ensureRangeForShape(shape, candidate, settings);
  }
  if (shape === 'Melee') return 'Melee';
  if (shape === 'Self') return 'Self';
  if (shape === 'Aura' && text.toLowerCase().includes('self')) return 'Self';
  return ensureRangeForShape(shape, text, settings);
}

function migrateLegacyPower(raw = {}) {
  const effectText = typeof raw.effect === 'string' ? raw.effect.trim() : '';
  const shape = inferShapeFromLegacy(raw.range);
  const range = parseLegacyRange(raw.range, shape);
  const effectTag = matchLegacyEffectTag(effectText) || 'Damage';
  const saveText = typeof raw.save === 'string' ? raw.save.trim() : '';
  const requiresSave = !!saveText;
  let saveAbility = null;
  if (requiresSave) {
    const abilityMatch = saveText.match(/STR|DEX|CON|INT|WIS|CHA/i);
    if (abilityMatch) saveAbility = abilityMatch[0].toUpperCase();
  }
  const diceMatch = effectText.match(/([1-6])d6/i);
  let damage = null;
  if (diceMatch) {
    const dice = `${diceMatch[1]}d6`;
    let type = detectDamageTypeFromText(effectText) || defaultDamageType('');
    if (!type || !POWER_DAMAGE_TYPES.includes(type)) type = 'Kinetic';
    let onSave = 'Half';
    if (/negate/i.test(saveText) || /negate/i.test(effectText)) onSave = 'Negate';
    else if (/full/i.test(saveText)) onSave = 'Full';
    damage = { dice: POWER_DAMAGE_DICE.includes(dice) ? dice : POWER_DAMAGE_DICE[0], type, onSave };
  }
  return {
    id: generatePowerId(),
    name: raw.name || 'Power',
    style: POWER_STYLES.includes(raw.style) ? raw.style : '',
    actionType: 'Action',
    shape,
    range,
    effectTag,
    intensity: 'Core',
    spCost: Math.max(1, Math.round(Number(raw.sp) || suggestSpCost('Core'))),
    requiresSave,
    saveAbilityTarget: requiresSave && POWER_SAVE_ABILITIES.includes(saveAbility) ? saveAbility : requiresSave ? 'WIS' : null,
    duration: 'Instant',
    description: effectText,
    damage: damage || undefined,
    secondaryTag: undefined,
    concentration: false,
    uses: 'At-will',
    cooldown: 0,
    scaling: 'Static',
    special: '',
    legacyText: effectText,
    originalText: effectText,
    migration: true,
    needsReview: true,
  };
}

function normalizeSignatureData(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { signature: true };
  }
  if (raw.signature || raw.isSignature) {
    return { ...raw, signature: true };
  }
  if (
    raw.effectTag !== undefined
    || raw.spCost !== undefined
    || raw.shape !== undefined
    || raw.range !== undefined
    || raw.actionType !== undefined
  ) {
    return { ...raw, signature: true };
  }

  const parsedSp = Number.parseInt(raw.sp, 10);
  const spCost = Number.isFinite(parsedSp) && parsedSp > 0 ? parsedSp : 1;
  const saveRaw = typeof raw.save === 'string' ? raw.save.trim().toUpperCase() : '';
  const requiresSave = !!saveRaw && saveRaw !== '—' && saveRaw !== 'NONE' && saveRaw !== 'N/A';
  const saveAbility = requiresSave && POWER_SAVE_ABILITIES.includes(saveRaw)
    ? saveRaw
    : requiresSave
      ? 'WIS'
      : null;

  return {
    ...raw,
    name: raw.name || '',
    spCost,
    requiresSave,
    saveAbilityTarget: saveAbility,
    special: raw.special || '',
    description: raw.description || raw.desc || '',
    signature: true,
  };
}

function normalizePowerData(raw = {}) {
  let base = raw;
  if (raw && (raw.effect !== undefined || raw.sp !== undefined || raw.save !== undefined || raw.range !== undefined)) {
    base = migrateLegacyPower(raw);
  }
  const settings = typeof getCharacterPowerSettings === 'function' ? getCharacterPowerSettings() : null;
  const normalizedShape = POWER_TARGET_SHAPES.includes(base.shape) ? base.shape : 'Ranged Single';
  const normalizedRange = ensureRangeForShape(normalizedShape, base.range, settings);
  const intensity = POWER_INTENSITIES.includes(base.intensity) ? base.intensity : 'Core';
  let spCost = Math.max(1, Math.round(Number(base.spCost))); 
  if (!Number.isFinite(spCost) || spCost <= 0) spCost = suggestSpCost(intensity);
  const requiresSave = !!base.requiresSave;
  const saveAbilityTarget = requiresSave && POWER_SAVE_ABILITIES.includes(base.saveAbilityTarget)
    ? base.saveAbilityTarget
    : requiresSave
      ? 'WIS'
      : null;
  let cooldown = Number(base.cooldown);
  if (!Number.isFinite(cooldown) || cooldown < 0) cooldown = 0;
  const uses = POWER_USES.includes(base.uses) ? base.uses : 'At-will';
  if (intensity === 'Ultimate') {
    cooldown = 10;
  } else if (uses === 'Cooldown' && cooldown === 0) {
    cooldown = 1;
  }
  const damage = base.damage && typeof base.damage === 'object'
    ? {
        dice: POWER_DAMAGE_DICE.includes(base.damage.dice) ? base.damage.dice : POWER_DAMAGE_DICE[0],
        type: POWER_DAMAGE_TYPES.includes(base.damage.type) ? base.damage.type : (defaultDamageType(base.style) || 'Kinetic'),
        onSave: POWER_ON_SAVE_OPTIONS.includes(base.damage.onSave) ? base.damage.onSave : 'Half',
      }
    : null;
  const secondaryTag = base.secondaryTag && POWER_EFFECT_TAGS.includes(base.secondaryTag) ? base.secondaryTag : null;
  const scaling = POWER_SCALING_OPTIONS.includes(base.scaling) ? base.scaling : 'Static';
  const duration = POWER_DURATIONS.includes(base.duration) ? base.duration : 'Instant';
  const concentration = duration === 'Sustained' ? true : !!base.concentration;
  const normalized = {
    id: typeof base.id === 'string' && base.id ? base.id : generatePowerId(),
    name: base.name || '',
    style: POWER_STYLES.includes(base.style) ? base.style : (base.style || ''),
    actionType: POWER_ACTION_TYPES.includes(base.actionType) ? base.actionType : 'Action',
    shape: normalizedShape,
    range: normalizedRange || ensureRangeForShape(normalizedShape, '', settings),
    effectTag: POWER_EFFECT_TAGS.includes(base.effectTag) ? base.effectTag : (secondaryTag || 'Damage'),
    intensity,
    spCost,
    requiresSave,
    saveAbilityTarget,
    duration,
    description: base.description || '',
    damage: damage || undefined,
    secondaryTag: secondaryTag || undefined,
    concentration,
    uses,
    cooldown,
    scaling,
    special: base.special || '',
    legacyText: base.legacyText || base.originalText || '',
    originalText: base.originalText || base.legacyText || (typeof base.effect === 'string' ? base.effect : ''),
    migration: !!base.migration,
    needsReview: !!base.needsReview,
  };
  if (base.signature || base.isSignature) {
    normalized.signature = true;
  }
  if (normalized.intensity === 'Ultimate') {
    normalized.cooldown = 10;
    normalized.uses = 'Cooldown';
  }
  if (normalized.duration === 'Sustained') {
    normalized.concentration = true;
  }
  const usageTracker = normalizeUsageTracker(base.usageTracker, normalized.uses, normalized.cooldown);
  if (usageTracker) {
    normalized.usageTracker = usageTracker;
  }
  return normalized;
}

function normalizeUsageTracker(rawTracker, uses, cooldown) {
  if (!uses || uses === 'At-will') {
    return null;
  }
  const asNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
  };
  const tracker = rawTracker && typeof rawTracker === 'object' ? { ...rawTracker } : {};
  const normalizedCooldown = asNumber(cooldown);
  const totalUses = asNumber(tracker.totalUses);
  const remainingUses = asNumber(tracker.remainingUses);
  const cooldownRemaining = asNumber(tracker.cooldownRemaining);
  if (uses === 'Cooldown') {
    return {
      totalUses: null,
      remainingUses: null,
      cooldownRemaining: cooldownRemaining !== null
        ? (normalizedCooldown !== null ? Math.min(cooldownRemaining, normalizedCooldown) : cooldownRemaining)
        : 0,
    };
  }
  const ensuredTotal = totalUses !== null && totalUses >= 0 ? totalUses : 1;
  let ensuredRemaining = remainingUses !== null ? remainingUses : ensuredTotal;
  if (ensuredTotal === 0) {
    ensuredRemaining = 0;
  } else {
    ensuredRemaining = Math.min(Math.max(ensuredRemaining, 0), ensuredTotal);
  }
  return {
    totalUses: ensuredTotal,
    remainingUses: ensuredRemaining,
    cooldownRemaining: null,
  };
}

function formatPowerRange(power, settings) {
  if (!power) return '';
  const shape = power.shape;
  const range = power.range;
  if (!shape) return range || '';
  switch (shape) {
    case 'Melee':
      return 'Melee range';
    case 'Line':
      return `${formatRangeDisplay(range || '30 ft', settings)} Line`;
    case 'Cone':
      return `${formatRangeDisplay(range || '15 ft', settings)} Cone`;
    case 'Radius':
      return `${formatRangeDisplay(range || '10 ft', settings)} Radius`;
    case 'Self':
      return 'Self';
    case 'Aura':
      if (!range || range === 'Self') return 'Aura';
      return `Aura ${formatRangeDisplay(range, settings)}`;
    case 'Ranged Single':
    default:
      return formatRangeDisplay(range || '30 ft', settings);
  }
}

function composePowerRulesText(power, settings) {
  if (!power) return '';
  const pieces = [];
  pieces.push(power.actionType || 'Action');
  const rangeText = formatPowerRange(power, settings);
  if (rangeText) pieces.push(rangeText);
  if (power.requiresSave) {
    const dc = computeSaveDc(settings);
    const ability = power.saveAbilityTarget || settings?.casterSaveAbility || 'WIS';
    if (settings?.preferShortRulesText) {
      pieces.push(`${ability} DC ${dc}`);
    } else {
      pieces.push(`${ability} Save DC ${dc}`);
    }
  }
  let effectPart = '';
  if (power.damage) {
    effectPart = `${power.damage.dice} ${power.damage.type}`;
    if (power.damage.onSave) effectPart += `, ${power.damage.onSave} on Save`;
  } else if (power.effectTag) {
    effectPart = power.effectTag;
  }
  if (effectPart) {
    if (power.secondaryTag && power.secondaryTag !== power.effectTag) {
      effectPart += `, ${power.secondaryTag}`;
    }
    pieces.push(effectPart);
  } else if (power.secondaryTag) {
    pieces.push(power.secondaryTag);
  }
  const shortMode = !!settings?.preferShortRulesText;
  pieces.push(shortMode ? `Dur ${power.duration}` : `Duration: ${power.duration}`);
  pieces.push(shortMode ? `Cost ${power.spCost} SP` : `Cost: ${power.spCost} SP`);
  if (power.concentration) {
    pieces.push(shortMode ? 'Conc +1 SP/rnd' : 'Concentration +1 SP per round');
  }
  if (power.intensity === 'Ultimate') {
    pieces.push(shortMode ? 'CD 10 rnds' : 'Cooldown 10 rounds');
  } else if (power.uses === 'Cooldown' && Number(power.cooldown) > 0) {
    const cdValue = Number(power.cooldown);
    if (shortMode) {
      pieces.push(`CD ${cdValue} rnd${cdValue === 1 ? '' : 's'}`);
    } else {
      pieces.push(`Cooldown ${power.cooldown} rounds`);
    }
  }
  return pieces.join(' • ');
}

function parseDurationTracker(duration) {
  switch (duration) {
    case 'Instant':
      return null;
    case 'End of Target’s Next Turn':
      return { rounds: 1, label: 'Ends next turn' };
    case '1 Round':
      return { rounds: 1, label: '1 Round' };
    case 'Sustained':
      return { rounds: null, label: 'Sustain' };
    case 'Scene':
      return { rounds: null, label: 'Scene' };
    case 'Session':
      return { rounds: null, label: 'Session' };
    default:
      if (!duration) return null;
      return { rounds: null, label: duration };
  }
}

const powerCardStates = new WeakMap();
const powerEditorState = {
  overlay: null,
  modal: null,
  content: null,
  title: null,
  saveButton: null,
  cancelButton: null,
  card: null,
  body: null,
  placeholder: null,
  parent: null,
  targetList: null,
  initialData: null,
  isNew: false,
  bindingsInitialized: false,
};
let activeConcentrationEffect = null;
const ongoingEffectTrackers = new Map();
let ongoingEffectCounter = 0;

function getOngoingEffectsContainer() {
  return $('ongoing-effects');
}

function getPowerCardLabel(card, { lowercase = false } = {}) {
  const kind = card?.dataset?.kind === 'sig' ? 'Signature move' : 'Power';
  return lowercase ? kind.toLowerCase() : kind;
}

function formatRemainingDuration(state, initial = false) {
  if (!state) return '';
  if (state.remaining === null) return state.label;
  if (initial && state.label) return state.label;
  if (state.remaining <= 0) return 'Resolved';
  const unit = state.remaining === 1 ? 'round left' : 'rounds left';
  return `${state.remaining} ${unit}`;
}

function removeOngoingEffectTracker(id) {
  const entry = ongoingEffectTrackers.get(id);
  if (!entry) return;
  if (entry.chip && entry.chip.parentNode) entry.chip.parentNode.removeChild(entry.chip);
  ongoingEffectTrackers.delete(id);
  if (entry.power && activeConcentrationEffect && activeConcentrationEffect.card === entry.powerCard) {
    activeConcentrationEffect = null;
  }
}

function addOngoingEffectTracker(power, card) {
  const info = parseDurationTracker(power.duration);
  if (!info) {
    toast('This power has no ongoing duration to track.', 'info');
    return;
  }
  const container = getOngoingEffectsContainer();
  if (!container) return;
  const id = `ongoing-${++ongoingEffectCounter}`;
  const chip = document.createElement('div');
  chip.style.display = 'flex';
  chip.style.alignItems = 'center';
  chip.style.gap = '8px';
  chip.style.padding = '6px 10px';
  chip.style.borderRadius = '12px';
  chip.style.background = 'rgba(255,255,255,0.06)';
  chip.style.border = '1px solid rgba(255,255,255,0.1)';
  chip.dataset.ongoingId = id;
  const nameSpan = document.createElement('strong');
  nameSpan.textContent = power.name || 'Power';
  nameSpan.style.fontSize = '12px';
  const remainingSpan = document.createElement('span');
  remainingSpan.style.fontSize = '12px';
  const buttonWrap = document.createElement('div');
  buttonWrap.style.display = 'flex';
  buttonWrap.style.gap = '4px';
  const tickBtn = document.createElement('button');
  tickBtn.type = 'button';
  tickBtn.className = 'btn-sm';
  tickBtn.textContent = 'Tick';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn-sm';
  clearBtn.textContent = 'Clear';
  buttonWrap.append(tickBtn, clearBtn);
  chip.append(nameSpan, remainingSpan, buttonWrap);
  container.appendChild(chip);
  const state = {
    id,
    chip,
    label: info.label,
    remaining: info.rounds,
    power,
    powerCard: card,
  };
  remainingSpan.textContent = formatRemainingDuration(state, true);
  tickBtn.addEventListener('click', () => {
    if (state.remaining === null) {
      toast('Track this effect manually.', 'info');
      return;
    }
    state.remaining = Math.max(0, (state.remaining ?? 0) - 1);
    if (state.remaining <= 0) {
      logAction(`Ongoing effect resolved: ${power.name}`);
      removeOngoingEffectTracker(id);
    } else {
      remainingSpan.textContent = formatRemainingDuration(state);
    }
  });
  clearBtn.addEventListener('click', () => {
    logAction(`Ongoing effect cleared: ${power.name}`);
    removeOngoingEffectTracker(id);
  });
  ongoingEffectTrackers.set(id, state);
}

function refreshPowerCards() {
  activePowerCards.forEach(card => updatePowerCardDerived(card));
}

function createFieldContainer(labelText, input, { flex = '1', minWidth } = {}) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '4px';
  wrapper.style.flex = flex;
  if (minWidth) wrapper.style.minWidth = minWidth;
  const label = document.createElement('label');
  label.textContent = labelText;
  label.style.fontSize = '12px';
  wrapper.append(label, input);
  return { wrapper, label, input };
}

function setSelectOptions(select, options, value, { includeEmpty = false, formatDisplay } = {}) {
  if (!select) return;
  select.innerHTML = '';
  if (includeEmpty) {
    select.appendChild(new Option('None', ''));
  }
  options.forEach(option => {
    const label = typeof formatDisplay === 'function' ? formatDisplay(option) : option;
    select.appendChild(new Option(label, option));
  });
  const nextValue = options.includes(value) ? value : (includeEmpty ? '' : (options[0] || ''));
  select.value = nextValue;
  if (select.value !== nextValue) select.value = options[0] || '';
}

function readNumericInput(value, { min = 0, fallback = 0 } = {}) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    const rounded = Math.floor(parsed);
    return Math.max(min, rounded);
  }
  return fallback;
}

function serializePowerCard(card) {
  const state = powerCardStates.get(card);
  if (!state) return null;
  const settings = getCharacterPowerSettings();
  const power = { ...state.power };
  const elements = state.elements || {};
  if (elements.nameInput) {
    const directName = elements.nameInput.value;
    if (typeof directName === 'string' && directName.trim()) {
      power.name = directName.trim();
      state.power.name = power.name;
    }
  }
  if (power.damage) {
    power.damage = { ...power.damage };
  }
  if (card?.dataset?.kind === 'sig') {
    power.signature = true;
  }
  const tracker = ensureUsageTrackerForPower(state);
  if (tracker) {
    power.usageTracker = { ...tracker };
  } else {
    delete power.usageTracker;
  }
  power.rulesText = composePowerRulesText(power, settings);
  return power;
}

function applyPowerDataToCard(card, data = {}) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const isSignature = card?.dataset?.kind === 'sig';
  const source = isSignature ? { ...data, signature: true } : data;
  const normalized = normalizePowerData(source);
  const normalizedTracker = normalized.usageTracker ? { ...normalized.usageTracker } : null;
  if (normalizedTracker) {
    normalized.usageTracker = normalizedTracker;
  } else {
    delete normalized.usageTracker;
  }
  state.power = normalized;
  state.usageTracker = normalizedTracker;
  state.powerExhaustedByTracker = false;
  state.usageExhaustedMessage = '';
  state.manualSpOverride = false;
  state.manualSaveAbility = false;
  state.manualOnSave = false;
  state.lastEffectTag = normalized.effectTag;
  state.lastIntensity = normalized.intensity;
  state.lastSuggestedSp = suggestSpCost(normalized.intensity);
  state.lastHasDamage = !!normalized.damage;
  state.lastOnSaveSuggestion = normalized.damage ? normalized.damage.onSave : suggestOnSaveBehavior(normalized.effectTag);

  const { elements = {} } = state;
  if (elements.nameInput) elements.nameInput.value = normalized.name || '';
  if (elements.styleSelect) setSelectOptions(elements.styleSelect, POWER_STYLES, normalized.style, { includeEmpty: true });
  if (elements.actionSelect) setSelectOptions(elements.actionSelect, POWER_ACTION_TYPES, normalized.actionType);
  if (elements.shapeSelect) setSelectOptions(elements.shapeSelect, POWER_TARGET_SHAPES, normalized.shape);
  if (elements.rangeSelect) setSelectOptions(elements.rangeSelect, POWER_SHAPE_RANGES[normalized.shape] || [], normalized.range);
  if (elements.effectSelect) setSelectOptions(elements.effectSelect, POWER_EFFECT_TAGS, normalized.effectTag);
  if (elements.secondarySelect) setSelectOptions(elements.secondarySelect, POWER_EFFECT_TAGS, normalized.secondaryTag, { includeEmpty: true });
  if (elements.intensitySelect) setSelectOptions(elements.intensitySelect, POWER_INTENSITIES, normalized.intensity);
  if (elements.spInput) elements.spInput.value = String(normalized.spCost);
  if (elements.requiresSaveToggle) elements.requiresSaveToggle.checked = !!normalized.requiresSave;
  if (elements.saveAbilitySelect) setSelectOptions(elements.saveAbilitySelect, POWER_SAVE_ABILITIES, normalized.saveAbilityTarget || POWER_SAVE_ABILITIES[0]);
  if (elements.durationSelect) setSelectOptions(elements.durationSelect, POWER_DURATIONS, normalized.duration);
  if (elements.concentrationToggle) elements.concentrationToggle.checked = !!normalized.concentration;
  if (elements.usesSelect) setSelectOptions(elements.usesSelect, POWER_USES, normalized.uses);
  if (elements.cooldownInput) elements.cooldownInput.value = String(Number.isFinite(normalized.cooldown) ? normalized.cooldown : 0);
  if (elements.scalingSelect) setSelectOptions(elements.scalingSelect, POWER_SCALING_OPTIONS, normalized.scaling);
  if (elements.descriptionArea) elements.descriptionArea.value = normalized.description || '';
  if (elements.specialArea) elements.specialArea.value = normalized.special || '';
  if (elements.damageToggle) elements.damageToggle.checked = !!normalized.damage;
  const damageTypeFallback = defaultDamageType(normalized.style) || POWER_DAMAGE_TYPES[0];
  if (elements.damageDiceSelect) setSelectOptions(elements.damageDiceSelect, POWER_DAMAGE_DICE, normalized.damage?.dice || POWER_DAMAGE_DICE[0]);
  if (elements.damageTypeSelect) setSelectOptions(elements.damageTypeSelect, POWER_DAMAGE_TYPES, normalized.damage?.type || damageTypeFallback);
  if (elements.damageSaveSelect) setSelectOptions(elements.damageSaveSelect, POWER_ON_SAVE_OPTIONS, normalized.damage?.onSave || suggestOnSaveBehavior(normalized.effectTag));
  if (elements.quickRangeSelect) elements.quickRangeSelect.value = normalized.range || elements.quickRangeSelect.value;
  if (elements.quickDurationSelect) elements.quickDurationSelect.value = normalized.duration || elements.quickDurationSelect.value;
  if (elements.quickSaveSelect && normalized.saveAbilityTarget) elements.quickSaveSelect.value = normalized.saveAbilityTarget;
  if (elements.quickOnSaveSelect && normalized.damage?.onSave) elements.quickOnSaveSelect.value = normalized.damage.onSave;
  if (elements.quickDiceSelect && normalized.damage?.dice) elements.quickDiceSelect.value = normalized.damage.dice;
  if (elements.quickSpValue) elements.quickSpValue.textContent = `${normalized.spCost} SP`;

  updatePowerCardDerived(card);
}

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = !!disabled;
  if (disabled) {
    button.setAttribute('aria-disabled', 'true');
  } else {
    button.removeAttribute('aria-disabled');
  }
}

function ensureUsageTrackerForPower(state) {
  if (!state || !state.power) return null;
  const normalized = normalizeUsageTracker(state.usageTracker || state.power.usageTracker, state.power.uses, state.power.cooldown);
  if (!normalized) {
    state.usageTracker = null;
    if (state.power.usageTracker) delete state.power.usageTracker;
    return null;
  }
  if (state.usageTracker && typeof state.usageTracker === 'object') {
    state.usageTracker.totalUses = normalized.totalUses;
    state.usageTracker.remainingUses = normalized.remainingUses;
    state.usageTracker.cooldownRemaining = normalized.cooldownRemaining;
    state.power.usageTracker = state.usageTracker;
    return state.usageTracker;
  }
  state.usageTracker = { ...normalized };
  state.power.usageTracker = state.usageTracker;
  return state.usageTracker;
}

function formatUsageScope(uses) {
  switch (uses) {
    case 'Per Session':
      return 'session';
    case 'Per Encounter':
    default:
      return 'encounter';
  }
}

function logPowerUsageChange(card, message) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const label = getPowerCardLabel(card);
  const name = state.power?.name || label;
  logAction(`${label} tracker — ${name}: ${message}`);
}

function applyPowerExhaustionState(card, exhausted) {
  const state = powerCardStates.get(card);
  if (!state || !state.elements) return;
  const { elements } = state;
  const targets = [
    elements.useButton,
    elements.rollAttackButton,
    elements.rollDamageButton,
    elements.rollSaveBtn,
    elements.ongoingButton,
    elements.boostButton,
    elements.summaryRollHit,
    elements.summaryRollDamage,
    elements.summaryRollSave,
    elements.signatureProxyButton,
  ];
  targets.forEach(btn => {
    if (!btn) return;
    if (exhausted) {
      if (!btn.dataset.usageDisabledState) {
        btn.dataset.usageDisabledState = btn.disabled ? '1' : '0';
      }
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    } else if (btn.dataset.usageDisabledState !== undefined) {
      const wasDisabled = btn.dataset.usageDisabledState === '1';
      delete btn.dataset.usageDisabledState;
      btn.disabled = wasDisabled;
      if (wasDisabled) {
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('aria-disabled');
      }
    }
  });
  if (exhausted && !state.powerExhaustedByTracker) {
    const label = state.power?.name || getPowerCardLabel(card);
    const message = `${label} is exhausted. Reset the tracker to use it again.`;
    state.usageExhaustedMessage = message;
    showPowerMessage(card, message, 'warning');
  } else if (!exhausted && state.powerExhaustedByTracker) {
    const area = elements.messageArea;
    if (area && area.textContent === state.usageExhaustedMessage) {
      clearPowerMessage(card);
    }
    state.usageExhaustedMessage = '';
  }
  state.powerExhaustedByTracker = exhausted;
}

function updateUsageTrackerUI(card) {
  const state = powerCardStates.get(card);
  if (!state || !state.elements) return;
  const { elements, power } = state;
  const section = elements.usageTrackerSection;
  const status = elements.usageStatus;
  if (!section || !status) return;
  const tracker = ensureUsageTrackerForPower(state);
  const usesMode = power.uses;
  const isCooldown = usesMode === 'Cooldown';
  const usesActive = usesMode && usesMode !== 'At-will' && !isCooldown;

  section.style.display = usesActive || isCooldown ? 'flex' : 'none';
  if (elements.usageControls) elements.usageControls.style.display = usesActive ? 'flex' : 'none';
  if (elements.cooldownControls) elements.cooldownControls.style.display = isCooldown ? 'flex' : 'none';

  if (!usesActive && !isCooldown) {
    status.textContent = '';
    applyPowerExhaustionState(card, false);
    return;
  }

  if (usesActive) {
    const total = tracker ? tracker.totalUses ?? 0 : 0;
    const remaining = tracker ? tracker.remainingUses ?? total : total;
    if (elements.usageTotalInput) {
      elements.usageTotalInput.value = String(total ?? 0);
      elements.usageTotalInput.disabled = false;
    }
    const scope = formatUsageScope(usesMode);
    if (total === 0) {
      status.textContent = `No uses configured for this ${scope}.`;
    } else {
      status.textContent = `${remaining}/${total} uses remaining this ${scope}.`;
    }
    const exhausted = total === 0 || remaining <= 0;
    setButtonDisabled(elements.usageSpendButton, exhausted || total === 0);
    if (elements.usageRestoreButton) {
      const restoreDisabled = total === 0 || remaining >= total;
      setButtonDisabled(elements.usageRestoreButton, restoreDisabled);
    }
    setButtonDisabled(elements.usageResetButton, total === 0 && remaining === 0);
    applyPowerExhaustionState(card, exhausted);
  } else if (isCooldown) {
    if (elements.usageTotalInput) {
      elements.usageTotalInput.value = '';
      elements.usageTotalInput.disabled = true;
    }
    const cooldownValue = Math.max(0, Number(power.cooldown) || 0);
    const remaining = tracker ? tracker.cooldownRemaining ?? 0 : 0;
    if (cooldownValue <= 0) {
      status.textContent = 'Set a cooldown to enable tracking.';
    } else if (remaining > 0) {
      status.textContent = `Cooldown active: ${remaining} round${remaining === 1 ? '' : 's'} remaining.`;
    } else {
      status.textContent = 'Cooldown ready.';
    }
    setButtonDisabled(elements.startCooldownButton, cooldownValue <= 0);
    setButtonDisabled(elements.tickCooldownButton, remaining <= 0);
    setButtonDisabled(elements.resetCooldownButton, cooldownValue <= 0 && remaining <= 0);
    applyPowerExhaustionState(card, cooldownValue > 0 && remaining > 0);
  }
}

function handlePowerUsageTotalChange(card, rawValue) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker || state.power.uses === 'Cooldown' || state.power.uses === 'At-will') {
    updateUsageTrackerUI(card);
    return;
  }
  const fallback = tracker.totalUses ?? 0;
  const nextTotal = readNumericInput(rawValue, { min: 0, fallback });
  if (tracker.totalUses === nextTotal) {
    updateUsageTrackerUI(card);
    return;
  }
  tracker.totalUses = nextTotal;
  if (nextTotal === 0) {
    tracker.remainingUses = 0;
  } else if (!Number.isFinite(tracker.remainingUses) || tracker.remainingUses > nextTotal) {
    tracker.remainingUses = nextTotal;
  }
  const scope = formatUsageScope(state.power.uses);
  logPowerUsageChange(card, `Total uses set to ${nextTotal} for this ${scope}.`);
  updateUsageTrackerUI(card);
  pushHistory();
}

function handleSpendPowerUse(card) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const usesMode = state.power?.uses;
  if (!usesMode || usesMode === 'At-will' || usesMode === 'Cooldown') return;
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker) return;
  if (!Number.isFinite(tracker.totalUses) || tracker.totalUses <= 0) {
    updateUsageTrackerUI(card);
    return;
  }
  const prev = Number.isFinite(tracker.remainingUses) ? tracker.remainingUses : tracker.totalUses;
  const next = Math.max(0, prev - 1);
  if (next === prev) {
    updateUsageTrackerUI(card);
    return;
  }
  tracker.remainingUses = next;
  logPowerUsageChange(card, `Use spent. ${next}/${tracker.totalUses} remaining.`);
  updateUsageTrackerUI(card);
  pushHistory();
}

function handleRestorePowerUse(card) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const usesMode = state.power?.uses;
  if (!usesMode || usesMode === 'At-will' || usesMode === 'Cooldown') return;
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker) return;
  if (!Number.isFinite(tracker.totalUses) || tracker.totalUses <= 0) {
    updateUsageTrackerUI(card);
    return;
  }
  const prev = Number.isFinite(tracker.remainingUses) ? tracker.remainingUses : 0;
  const next = Math.min(tracker.totalUses, prev + 1);
  if (next === prev) {
    updateUsageTrackerUI(card);
    return;
  }
  tracker.remainingUses = next;
  logPowerUsageChange(card, `Use restored. ${next}/${tracker.totalUses} remaining.`);
  updateUsageTrackerUI(card);
  pushHistory();
}

function handleResetPowerUses(card) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const usesMode = state.power?.uses;
  if (!usesMode || usesMode === 'At-will' || usesMode === 'Cooldown') {
    updateUsageTrackerUI(card);
    return;
  }
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker) return;
  const total = Number.isFinite(tracker.totalUses) ? tracker.totalUses : 0;
  const prev = Number.isFinite(tracker.remainingUses) ? tracker.remainingUses : 0;
  if (total === prev) {
    updateUsageTrackerUI(card);
    return;
  }
  tracker.remainingUses = total;
  const scope = formatUsageScope(usesMode);
  logPowerUsageChange(card, `Uses reset for this ${scope}. ${tracker.remainingUses}/${total} available.`);
  updateUsageTrackerUI(card);
  pushHistory();
}

function handleStartPowerCooldown(card) {
  const state = powerCardStates.get(card);
  if (!state || state.power?.uses !== 'Cooldown') return;
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker) return;
  const cooldownValue = Math.max(0, Number(state.power.cooldown) || 0);
  if (cooldownValue <= 0) {
    showPowerMessage(card, 'Set a cooldown value before starting the tracker.', 'warning');
    return;
  }
  tracker.cooldownRemaining = cooldownValue;
  logPowerUsageChange(card, `Cooldown started: ${cooldownValue} round${cooldownValue === 1 ? '' : 's'} remaining.`);
  updateUsageTrackerUI(card);
  pushHistory();
}

function handleTickPowerCooldown(card) {
  const state = powerCardStates.get(card);
  if (!state || state.power?.uses !== 'Cooldown') return;
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker) return;
  const prev = Number.isFinite(tracker.cooldownRemaining) ? tracker.cooldownRemaining : 0;
  if (prev <= 0) {
    updateUsageTrackerUI(card);
    return;
  }
  const next = Math.max(0, prev - 1);
  tracker.cooldownRemaining = next;
  logPowerUsageChange(card, `Cooldown ticked: ${next} round${next === 1 ? '' : 's'} remaining.`);
  updateUsageTrackerUI(card);
  pushHistory();
}

function handleResetPowerCooldown(card) {
  const state = powerCardStates.get(card);
  if (!state || state.power?.uses !== 'Cooldown') return;
  const tracker = ensureUsageTrackerForPower(state);
  if (!tracker) return;
  const prev = Number.isFinite(tracker.cooldownRemaining) ? tracker.cooldownRemaining : 0;
  if (prev === 0) {
    updateUsageTrackerUI(card);
    return;
  }
  tracker.cooldownRemaining = 0;
  logPowerUsageChange(card, 'Cooldown reset.');
  updateUsageTrackerUI(card);
  pushHistory();
}

function applyUsageAfterPowerActivation(card, power) {
  const state = powerCardStates.get(card);
  if (!state) return { text: `${power.name} activated.`, tone: 'success' };
  const usesMode = state.power?.uses;
  const tracker = ensureUsageTrackerForPower(state);
  let tone = 'success';
  let suffix = '';
  let changed = false;

  if (usesMode === 'Cooldown') {
    if (tracker) {
      const cooldownValue = Math.max(0, Number(state.power.cooldown) || 0);
      if (cooldownValue > 0) {
        tracker.cooldownRemaining = cooldownValue;
        logPowerUsageChange(card, `Cooldown started: ${cooldownValue} round${cooldownValue === 1 ? '' : 's'} remaining.`);
        suffix = `Cooldown started (${cooldownValue} round${cooldownValue === 1 ? '' : 's'} remaining).`;
        tone = 'info';
        changed = true;
      }
    }
  } else if (usesMode && usesMode !== 'At-will') {
    if (tracker) {
      const total = Number.isFinite(tracker.totalUses) ? tracker.totalUses : 0;
      if (total === 0) {
        suffix = 'No uses configured. Reset the tracker after setting a total.';
        tone = 'warning';
        logPowerUsageChange(card, 'Use attempted but total uses is set to 0.');
      } else {
        const prev = Number.isFinite(tracker.remainingUses) ? tracker.remainingUses : total;
        const next = Math.max(0, prev - 1);
        tracker.remainingUses = next;
        logPowerUsageChange(card, `Use spent. ${next}/${total} remaining.`);
        changed = true;
        if (next <= 0) {
          suffix = 'No uses remaining. Reset to recover.';
          tone = 'warning';
        } else {
          suffix = `${next}/${total} uses remaining.`;
        }
      }
    }
  }

  if (changed) {
    pushHistory();
  }
  updateUsageTrackerUI(card);
  const baseMessage = `${power.name} activated.`;
  return { text: suffix ? `${baseMessage} ${suffix}` : baseMessage, tone };
}

function updatePowerCardDerived(card) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const { power, elements } = state;
  if (!elements) return;
  const settings = getCharacterPowerSettings();
  const suggestionStrength = POWER_SUGGESTION_STRENGTHS.includes(settings?.autoSuggestionStrength)
    ? settings.autoSuggestionStrength
    : 'conservative';
  const quickActiveBg = 'rgba(46,160,67,0.25)';
  const previousSuggestedSp = state.lastSuggestedSp;
  const effectChanged = state.lastEffectTag !== power.effectTag;
  const intensityChanged = state.lastIntensity !== power.intensity;
  const hadDamageBefore = !!state.lastHasDamage;

  power.spCost = Math.max(1, readNumericInput(elements.spInput?.value ?? power.spCost, { min: 1, fallback: power.spCost }));
  const suggestedSp = suggestSpCost(power.intensity);
  if (intensityChanged && suggestionStrength !== 'off') {
    const shouldApplySp = suggestionStrength === 'assertive'
      || (!state.manualSpOverride && (power.spCost === previousSuggestedSp || previousSuggestedSp === undefined));
    if (shouldApplySp) {
      power.spCost = suggestedSp;
      if (elements.spInput) elements.spInput.value = String(power.spCost);
      state.manualSpOverride = false;
    }
  }
  state.lastSuggestedSp = suggestedSp;
  if (elements.spInput && Number(elements.spInput.value) !== power.spCost) {
    elements.spInput.value = String(power.spCost);
  }

  const shapeOptions = getRangeOptionsForShape(power.shape);
  if (elements.rangeSelect) {
    setSelectOptions(elements.rangeSelect, shapeOptions, power.range, {
      formatDisplay: option => formatRangeDisplay(option, settings),
    });
    power.range = ensureRangeForShape(power.shape, elements.rangeSelect.value, settings);
    elements.rangeSelect.disabled = shapeOptions.length <= 1;
  }
  if (elements.rangeField?.wrapper) {
    const hideRange = power.shape === 'Melee';
    elements.rangeField.wrapper.style.display = hideRange ? 'none' : 'flex';
  }
  if (elements.rangeHint) {
    if (settings?.showMetricRanges) {
      const metric = formatMetricRange(power.range);
      elements.rangeHint.textContent = metric ? `≈ ${metric}` : '';
      elements.rangeHint.style.display = metric ? 'block' : 'none';
    } else {
      elements.rangeHint.textContent = '';
      elements.rangeHint.style.display = 'none';
    }
  }

  if (elements.requiresSaveToggle) {
    elements.requiresSaveToggle.checked = !!power.requiresSave;
  }
  if (elements.saveAbilityField?.wrapper) {
    elements.saveAbilityField.wrapper.style.display = power.requiresSave ? 'flex' : 'none';
  }
  if (elements.saveBonusField?.wrapper) {
    elements.saveBonusField.wrapper.style.display = power.requiresSave ? 'flex' : 'none';
  }
  if (elements.saveBonusInput) {
    elements.saveBonusInput.disabled = !power.requiresSave;
  }
  if (elements.saveDcField?.wrapper) {
    elements.saveDcField.wrapper.style.display = power.requiresSave ? 'flex' : 'none';
  }
  const saveSuggestions = EFFECT_SAVE_SUGGESTIONS[power.effectTag] || [];
  const recommendedSave = saveSuggestions[0] || 'WIS';
  if (power.requiresSave) {
    if (!POWER_SAVE_ABILITIES.includes(power.saveAbilityTarget)) {
      power.saveAbilityTarget = recommendedSave;
    }
    if (effectChanged && saveSuggestions.length && suggestionStrength !== 'off' && !state.manualSaveAbility) {
      const shouldApplySave = suggestionStrength === 'assertive'
        || !saveSuggestions.includes(power.saveAbilityTarget);
      if (shouldApplySave) {
        power.saveAbilityTarget = recommendedSave;
      }
    }
    if (elements.saveAbilitySelect) {
      elements.saveAbilitySelect.disabled = false;
      if (power.saveAbilityTarget && elements.saveAbilitySelect.value !== power.saveAbilityTarget) {
        elements.saveAbilitySelect.value = power.saveAbilityTarget;
      }
    }
  } else {
    power.saveAbilityTarget = null;
    if (elements.saveAbilitySelect) {
      elements.saveAbilitySelect.disabled = true;
    }
  }
  if (elements.saveAbilityHint) {
    elements.saveAbilityHint.textContent =
      power.requiresSave && saveSuggestions.length
        ? `Suggested: ${saveSuggestions.join(' or ')}`
        : '';
  }
  if (elements.rollSaveBtn) {
    elements.rollSaveBtn.disabled = !power.requiresSave;
  }

  if (elements.saveDcOutput) {
    elements.saveDcOutput.value = power.requiresSave ? computeSaveDc(settings) : '';
  }
  if (elements.saveResult) {
    elements.saveResult.style.display = power.requiresSave ? '' : 'none';
  }
  if (elements.spHint) {
    const parts = [`Suggested: ${suggestedSp} SP`];
    if (power.spCost !== suggestedSp) {
      parts.push(`(current ${power.spCost})`);
    }
    elements.spHint.textContent = parts.join(' ');
  }
  if (elements.quickSpValue) {
    elements.quickSpValue.textContent = `${power.spCost} SP`;
  }
  if (elements.concentrationHint) {
    elements.concentrationHint.textContent = power.concentration ? '+1 SP per round' : '';
  }
  if (elements.secondaryHint) {
    elements.secondaryHint.textContent = power.secondaryTag ? 'Consider +1 SP for secondary effect' : '';
  }
  const hasDamage = !!power.damage;
  if (elements.damageFields) {
    elements.damageFields.style.display = hasDamage ? 'flex' : 'none';
  }
  if (hasDamage && elements.damageTypeSelect && !POWER_DAMAGE_TYPES.includes(power.damage.type)) {
    const defaultType = defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0];
    power.damage.type = defaultType;
    elements.damageTypeSelect.value = defaultType;
  }
  const onSaveSuggestion = suggestOnSaveBehavior(power.effectTag);
  if (hasDamage) {
    power.damage = power.damage || {};
    if (!POWER_DAMAGE_DICE.includes(power.damage.dice)) {
      power.damage.dice = POWER_DAMAGE_DICE[0];
    }
    if (!POWER_ON_SAVE_OPTIONS.includes(power.damage.onSave)) {
      power.damage.onSave = onSaveSuggestion;
    } else if ((effectChanged || !hadDamageBefore) && suggestionStrength !== 'off' && !state.manualOnSave) {
      const shouldApplyOnSave = suggestionStrength === 'assertive'
        || state.lastOnSaveSuggestion === undefined
        || power.damage.onSave === state.lastOnSaveSuggestion;
      if (shouldApplyOnSave) {
        power.damage.onSave = onSaveSuggestion;
      }
    }
    if (elements.damageDiceSelect && elements.damageDiceSelect.value !== power.damage.dice) {
      elements.damageDiceSelect.value = power.damage.dice;
    }
    if (elements.damageTypeSelect && elements.damageTypeSelect.value !== power.damage.type) {
      elements.damageTypeSelect.value = power.damage.type;
    }
    if (elements.damageSaveSelect && elements.damageSaveSelect.value !== power.damage.onSave) {
      elements.damageSaveSelect.value = power.damage.onSave;
    }
  } else {
    if (elements.damageDiceSelect) {
      elements.damageDiceSelect.value = POWER_DAMAGE_DICE[0];
    }
    if (elements.damageTypeSelect) {
      const defaultType = defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0];
      elements.damageTypeSelect.value = defaultType;
    }
    if (elements.damageSaveSelect) {
      elements.damageSaveSelect.value = 'Half';
    }
  }
  if (elements.damageToggle) {
    elements.damageToggle.checked = hasDamage;
  }
  if (elements.damageSaveHint) {
    elements.damageSaveHint.textContent = hasDamage ? `Suggested: ${onSaveSuggestion}` : '';
  }

  state.lastEffectTag = power.effectTag;
  state.lastIntensity = power.intensity;
  state.lastHasDamage = hasDamage;
  state.lastOnSaveSuggestion = onSaveSuggestion;
  if (elements.cooldownField && elements.cooldownField.wrapper) {
    const requiresCooldown = power.intensity === 'Ultimate' || power.uses === 'Cooldown';
    elements.cooldownField.wrapper.style.display = requiresCooldown ? 'flex' : 'none';
    if (power.intensity === 'Ultimate') {
      power.cooldown = 10;
      if (elements.cooldownInput) {
        elements.cooldownInput.value = '10';
        elements.cooldownInput.disabled = true;
      }
      if (elements.usesSelect) {
        power.uses = 'Cooldown';
        elements.usesSelect.value = 'Cooldown';
      }
    } else {
      if (elements.cooldownInput) {
        elements.cooldownInput.disabled = power.uses !== 'Cooldown';
        if (power.uses !== 'Cooldown' && power.cooldown > 0) {
          power.cooldown = 0;
        }
        if (elements.cooldownInput.value !== String(power.cooldown)) {
          elements.cooldownInput.value = String(power.cooldown);
        }
      }
    }
  }
  if (power.duration === 'Sustained' && elements.concentrationToggle) {
    power.concentration = true;
    elements.concentrationToggle.checked = true;
    elements.concentrationToggle.disabled = true;
  } else if (elements.concentrationToggle) {
    elements.concentrationToggle.disabled = false;
  }
  if (elements.rulesPreview) {
    elements.rulesPreview.textContent = composePowerRulesText(power, settings);
  }
  if (elements.useButton) {
    elements.useButton.disabled = !power.name;
  }
  if (elements.ongoingButton) {
    elements.ongoingButton.disabled = power.duration === 'Instant';
  }
  if (elements.quickRangeSelect) {
    const quickRangeOptions = Array.from(new Set([...shapeOptions, ...POWER_RANGE_QUICK_VALUES]));
    const preferredRange = power.shape === 'Melee' ? 'Melee' : power.range;
    setSelectOptions(elements.quickRangeSelect, quickRangeOptions, preferredRange, {
      formatDisplay: option => formatRangeDisplay(option, settings),
    });
    const showQuickRange = power.shape !== 'Melee' && quickRangeOptions.length > 1;
    elements.quickRangeSelect.disabled = quickRangeOptions.length <= 1;
    if (elements.quickRangeField) {
      elements.quickRangeField.style.display = showQuickRange ? '' : 'none';
    }
  }
  if (elements.quickDiceSelect) {
    if (elements.quickDiceField) {
      elements.quickDiceField.style.display = hasDamage ? '' : 'none';
    }
    if (hasDamage) {
      setSelectOptions(elements.quickDiceSelect, POWER_DAMAGE_DICE, power.damage?.dice || POWER_DAMAGE_DICE[0]);
      elements.quickDiceSelect.disabled = false;
    } else {
      elements.quickDiceSelect.disabled = true;
    }
  }
  if (elements.quickSpValue) {
    elements.quickSpValue.textContent = `${power.spCost} SP`;
  }
  if (elements.quickDurationSelect) {
    setSelectOptions(elements.quickDurationSelect, POWER_DURATIONS, power.duration);
  }
  if (elements.quickSaveSelect) {
    if (elements.quickSaveField) {
      elements.quickSaveField.style.display = power.requiresSave ? '' : 'none';
    }
    if (power.requiresSave) {
      setSelectOptions(elements.quickSaveSelect, POWER_SAVE_ABILITIES, power.saveAbilityTarget || POWER_SAVE_ABILITIES[0]);
      elements.quickSaveSelect.disabled = false;
    } else {
      elements.quickSaveSelect.disabled = true;
    }
  }
  if (elements.quickOnSaveSelect) {
    if (elements.quickOnSaveField) {
      elements.quickOnSaveField.style.display = hasDamage ? '' : 'none';
    }
    if (hasDamage) {
      setSelectOptions(elements.quickOnSaveSelect, POWER_ON_SAVE_OPTIONS, power.damage?.onSave || 'Half');
      elements.quickOnSaveSelect.disabled = false;
    } else {
      elements.quickOnSaveSelect.disabled = true;
    }
  }
  const attackEnabled = shouldEnablePowerAttack(power);
  if (elements.rollAttackButton) elements.rollAttackButton.disabled = !attackEnabled;
  if (elements.summaryRollHit) elements.summaryRollHit.disabled = !attackEnabled;
  if (elements.rollDamageButton) elements.rollDamageButton.disabled = !hasDamage;
  if (elements.summaryRollDamage) elements.summaryRollDamage.disabled = !hasDamage;
  if (elements.summaryRollSave) elements.summaryRollSave.disabled = !power.requiresSave;
  updatePowerCardSummary(card, power, settings);
  updateUsageTrackerUI(card);
}
const POWER_MESSAGE_COLORS = {
  info: '#58a6ff',
  warning: '#f0ad4e',
  error: '#f85149',
  success: '#3fb950',
};

function showPowerMessage(card, text, tone = 'info') {
  const state = powerCardStates.get(card);
  const area = state?.elements?.messageArea;
  if (!area) return;
  if (!text) {
    area.textContent = '';
    area.hidden = true;
    return;
  }
  area.hidden = false;
  area.textContent = text;
  area.style.color = POWER_MESSAGE_COLORS[tone] || '#c9d1d9';
}

function clearPowerMessage(card) {
  showPowerMessage(card, '');
}

function hideConcentrationPrompt(card) {
  const state = powerCardStates.get(card);
  if (!state) return;
  state.pendingConcentrationAction = null;
  const prompt = state.elements?.concentrationPrompt;
  if (prompt) {
    prompt.style.display = 'none';
    prompt.dataset.open = 'false';
  }
}

function requestConcentrationDrop(card, power, proceed) {
  const state = powerCardStates.get(card);
  if (!state || !state.elements) return false;
  const { elements } = state;
  if (!elements.concentrationPrompt || !elements.concentrationPromptText) {
    const labelLower = getPowerCardLabel(card, { lowercase: true });
    showPowerMessage(card, `Drop concentration on ${activeConcentrationEffect?.name || 'the current effect'} before using this ${labelLower}.`, 'warning');
    return false;
  }
  state.pendingConcentrationAction = proceed;
  elements.concentrationPromptText.textContent = `Drop concentration on ${activeConcentrationEffect?.name || 'the current effect'} to use ${power.name}?`;
  elements.concentrationPrompt.style.display = 'flex';
  elements.concentrationPrompt.dataset.open = 'true';
  showPowerMessage(card, `Concentration conflict: drop ${activeConcentrationEffect?.name || 'current effect'} to continue.`, 'warning');
  return true;
}

function finalizePowerUse(card, power) {
  if (!changeSP(-power.spCost)) {
    const labelLower = getPowerCardLabel(card, { lowercase: true });
    showPowerMessage(card, `Insufficient SP to use this ${labelLower}.`, 'error');
    return;
  }
  const label = getPowerCardLabel(card);
  logAction(`${label} used: ${power.name} — ${power.rulesText}`);
  toast(`${power.name} activated.`, 'success');
  if (power.concentration) {
    activeConcentrationEffect = { card, name: power.name };
  } else if (activeConcentrationEffect && activeConcentrationEffect.card === card) {
    activeConcentrationEffect = null;
  }
  const usageFeedback = applyUsageAfterPowerActivation(card, power);
  if (usageFeedback && usageFeedback.text) {
    showPowerMessage(card, usageFeedback.text, usageFeedback.tone || 'success');
  } else {
    showPowerMessage(card, `${power.name} activated.`, 'success');
  }
}

function handleUsePower(card) {
  const state = powerCardStates.get(card);
  if (!state) return;
  hideConcentrationPrompt(card);
  clearPowerMessage(card);
  const power = serializePowerCard(card);
  if (!power) return;
  if (power.requiresSave && !power.saveAbilityTarget) {
    const labelLower = getPowerCardLabel(card, { lowercase: true });
    showPowerMessage(card, `Select a save ability before using this ${labelLower}.`, 'error');
    return;
  }
  if (!Number.isFinite(power.spCost) || power.spCost <= 0) {
    showPowerMessage(card, 'SP cost must be a positive number.', 'error');
    return;
  }
  const available = num(elSPBar?.value) + (elSPTemp ? num(elSPTemp.value) : 0);
  if (power.spCost > available) {
    const labelLower = getPowerCardLabel(card, { lowercase: true });
    toast(`Insufficient SP to use this ${labelLower}.`, 'error');
    showPowerMessage(card, `Insufficient SP to use this ${labelLower}.`, 'error');
    return;
  }
  const proceed = () => finalizePowerUse(card, power);
  if (power.concentration && activeConcentrationEffect && activeConcentrationEffect.card !== card) {
    requestConcentrationDrop(card, power, proceed);
    return;
  }
  proceed();
}

function handleRollPowerSave(card, { outputs: providedOutputs } = {}) {
  const state = powerCardStates.get(card);
  if (!state || !state.power.requiresSave) return;
  const power = serializePowerCard(card);
  if (!power) return;
  const ability = power.saveAbilityTarget || 'WIS';
  const dc = computeSaveDc(getCharacterPowerSettings());
  let bonus = 0;
  const bonusInput = state.elements?.saveBonusInput;
  if (bonusInput) {
    const parsed = Number(bonusInput.value);
    bonus = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  const defaultOutputs = [state.elements?.saveResult, state.elements?.summarySaveResult].filter(Boolean);
  const outputs = Array.isArray(providedOutputs) && providedOutputs.length
    ? providedOutputs.filter(Boolean)
    : defaultOutputs;
  outputs.forEach(out => {
    if (!out) return;
    out.textContent = '—';
    out.style.background = '';
    if (out.dataset) {
      delete out.dataset.rollBreakdown;
      delete out.dataset.rollModifier;
    }
  });
  const primaryOut = outputs[0] || null;
  const baseBonuses = [{ label: 'Save bonus', value: bonus, includeZero: true }];
  rollWithBonus(`${power.name} save`, bonus, primaryOut, {
    type: 'save',
    ability,
    baseBonuses,
    onRoll: ({ total }) => {
      const passed = total >= dc;
      const resultText = `${total} ${passed ? '✓ Success' : '✗ Fail'}`;
      outputs.forEach(out => {
        if (!out) return;
        out.textContent = resultText;
        out.style.background = passed ? 'rgba(46,160,67,0.3)' : 'rgba(219,68,55,0.3)';
        if (out.dataset) {
          out.dataset.rollBreakdown = `DC ${dc}`;
        }
      });
    },
  });
}

function getPowerAttackAbility(power) {
  if (!power) return 'str';
  const normalizedStyle = typeof power.style === 'string' ? power.style : '';
  if (power.shape === 'Melee') return 'str';
  if (POWER_STYLE_ATTACK_DEFAULTS[normalizedStyle]) return POWER_STYLE_ATTACK_DEFAULTS[normalizedStyle];
  if (power.shape === 'Self' || power.shape === 'Aura') return POWER_STYLE_ATTACK_DEFAULTS[normalizedStyle] || 'con';
  if (power.shape === 'Ranged Single') return 'dex';
  return POWER_STYLE_ATTACK_DEFAULTS[normalizedStyle] || 'dex';
}

function shouldEnablePowerAttack(power) {
  if (!power) return false;
  if (power.requiresSave) return false;
  if (power.shape === 'Self' || power.shape === 'Aura') return false;
  return true;
}

function handleRollPowerAttack(card, { outputs: providedOutputs } = {}) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const power = serializePowerCard(card);
  if (!power || !shouldEnablePowerAttack(power)) return;
  const abilityKey = (getPowerAttackAbility(power) || 'str').toLowerCase();
  const abilityInputs = { str: elStr, dex: elDex, con: elCon, int: elInt, wis: elWis, cha: elCha };
  const abilityEl = abilityInputs[abilityKey];
  const abilityModValue = mod(abilityEl ? abilityEl.value : 10);
  const proficiency = num(elProfBonus?.value) || 0;
  const outputs = Array.isArray(providedOutputs) && providedOutputs.length
    ? providedOutputs.filter(Boolean)
    : [state.elements?.attackResult, state.elements?.summaryHitResult].filter(Boolean);
  outputs.forEach(out => {
    if (!out) return;
    out.textContent = '—';
    out.style.background = '';
    if (out.dataset) {
      delete out.dataset.rollBreakdown;
      delete out.dataset.rollModifier;
    }
  });
  const primaryOut = outputs[0] || null;
  const baseBonuses = [
    { label: `${abilityKey.toUpperCase()} mod`, value: abilityModValue, includeZero: true },
  ];
  if (proficiency) baseBonuses.push({ label: 'Prof', value: proficiency });
  const label = `${power.name || 'Power'} attack roll`;
  rollWithBonus(label, abilityModValue + proficiency, primaryOut, {
    type: 'attack',
    ability: abilityKey.toUpperCase(),
    baseBonuses,
    onRoll: ({ total, breakdown }) => {
      outputs.forEach(out => {
        if (!out) return;
        out.textContent = total;
        out.style.background = '';
        if (out.dataset) {
          out.dataset.rollBreakdown = breakdown?.length ? breakdown.join(' | ') : `${abilityKey.toUpperCase()} ${abilityModValue >= 0 ? '+' : ''}${abilityModValue}${proficiency ? ` | Prof +${proficiency}` : ''}`;
        }
      });
    },
  });
}

function handleRollPowerDamage(card, { outputs: providedOutputs } = {}) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const power = serializePowerCard(card);
  if (!power || !power.damage || !power.damage.dice) return;
  const match = /^\s*(\d+)d(\d+)\s*$/i.exec(power.damage.dice);
  if (!match) {
    showPowerMessage(card, 'Set a valid damage dice value.', 'error');
    return;
  }
  const count = Number(match[1]);
  const sides = Number(match[2]);
  if (!Number.isFinite(count) || !Number.isFinite(sides) || count <= 0 || sides <= 0) {
    showPowerMessage(card, 'Set a valid damage dice value.', 'error');
    return;
  }
  const outputs = Array.isArray(providedOutputs) && providedOutputs.length
    ? providedOutputs.filter(Boolean)
    : [state.elements?.damageResult, state.elements?.summaryDamageResult].filter(Boolean);
  outputs.forEach(out => {
    if (!out) return;
    out.textContent = '—';
    out.style.background = '';
    if (out.dataset) {
      delete out.dataset.rollBreakdown;
    }
  });
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((sum, roll) => sum + roll, 0);
  outputs.forEach(out => {
    if (!out) return;
    out.textContent = total;
    out.style.background = '';
    if (out.dataset) {
      out.dataset.rollBreakdown = `${power.damage.dice}: ${rolls.join(' + ')}`;
    }
  });
  playDamageAnimation(total);
  logAction(`${power.name} damage roll (${power.damage.dice} ${power.damage.type || ''}): ${rolls.join(' + ')} = ${total}`);
}

function updatePowerCardSummary(card, power, settings) {
  const state = powerCardStates.get(card);
  if (!state) return;
  const elements = state.elements || {};
  if (!elements.summary) return;
  const name = power.name || (power.signature ? 'Signature Move' : 'Power');
  if (elements.summaryName) elements.summaryName.textContent = name;
  if (elements.summaryEdit) {
    const baseLabel = getPowerCardLabel(card);
    const accessibleLabel = power.name ? `Edit ${power.name}` : `Edit ${baseLabel}`;
    elements.summaryEdit.setAttribute('aria-label', accessibleLabel);
    elements.summaryEdit.setAttribute('title', accessibleLabel);
  }
  if (elements.summarySp) elements.summarySp.textContent = `${power.spCost} SP`;
  const descriptionParts = [];
  if (power.description) descriptionParts.push(power.description);
  if (power.special) descriptionParts.push(power.special);
  const descriptionText = descriptionParts.join(' ');
  if (elements.summaryDescription) {
    elements.summaryDescription.textContent = descriptionText || '';
    elements.summaryDescription.hidden = !descriptionText;
  }
  const statsContainer = elements.summaryStats;
  if (statsContainer) {
    statsContainer.innerHTML = '';
    const stats = [];
    if (power.style) stats.push(['Style', power.style]);
    if (power.actionType) stats.push(['Action', power.actionType]);
    if (power.shape) stats.push(['Shape', power.shape]);
    const rangeText = formatPowerRange(power, settings);
    if (rangeText) stats.push(['Range', rangeText]);
    if (power.intensity) stats.push(['Intensity', power.intensity]);
    if (power.effectTag) stats.push(['Effect', power.effectTag]);
    if (power.secondaryTag) stats.push(['Secondary', power.secondaryTag]);
    if (power.uses) {
      let usesLabel = power.uses;
      if (power.uses === 'Cooldown' && Number.isFinite(power.cooldown) && power.cooldown > 0) {
        usesLabel = `${power.uses} (${power.cooldown})`;
      }
      stats.push(['Uses', usesLabel]);
    }
    if (power.duration) stats.push(['Duration', power.duration]);
    if (power.concentration) stats.push(['Concentration', 'Yes']);
    if (power.damage) {
      const dmg = power.damage;
      const dmgText = `${dmg.dice} ${dmg.type || ''}`.trim();
      stats.push(['Damage', dmgText]);
      if (dmg.onSave) stats.push(['On Save', dmg.onSave]);
    }
    if (power.requiresSave) {
      const dc = computeSaveDc(settings);
      const saveAbility = (power.saveAbilityTarget || 'WIS').toUpperCase();
      const saveLabel = `${saveAbility} DC ${dc}`;
      stats.push(['Save', saveLabel]);
    }
    stats.forEach(([label, value]) => {
      if (!value) return;
      const chip = document.createElement('span');
      chip.className = 'power-card__summary-stat';
      chip.textContent = `${label}: ${value}`;
      statsContainer.appendChild(chip);
    });
  }
}

function handleBoostRoll(card) {
  const power = serializePowerCard(card);
  if (!power) return;
  hideConcentrationPrompt(card);
  clearPowerMessage(card);
  const available = num(elSPBar?.value) + (elSPTemp ? num(elSPTemp.value) : 0);
  if (available < 1) {
    toast('Insufficient SP to boost this roll.', 'error');
    showPowerMessage(card, 'Insufficient SP to boost this roll.', 'error');
    return;
  }
  if (!changeSP(-1)) {
    showPowerMessage(card, 'Insufficient SP to boost this roll.', 'error');
    return;
  }
  const label = getPowerCardLabel(card);
  logAction(`Boosted next roll for ${power.name} (${label}) (+1d4).`);
  toast(`Boost ready for ${power.name}.`, 'info');
  showPowerMessage(card, 'Boost readied: +1d4 to the next roll.', 'success');
}

function handleDeletePower(card) {
  const state = powerCardStates.get(card);
  const label = getPowerCardLabel(card);
  const fallbackName = label === 'Signature move' ? 'Signature move' : 'Power';
  const name = state?.power?.name || fallbackName;
  logAction(`${label} removed: ${name}`);
  if (activeConcentrationEffect && activeConcentrationEffect.card === card) {
    activeConcentrationEffect = null;
  }
  if (powerEditorState.card === card) {
    restorePowerEditorCard();
    hide('modal-power-editor');
    resetPowerEditorState();
  }
  activePowerCards.delete(card);
  powerCardStates.delete(card);
  if (card && card.parentNode) card.parentNode.removeChild(card);
  pushHistory();
}

function createPowerEditorOverlay() {
  if (typeof document === 'undefined') return null;
  if (document.getElementById('modal-power-editor')) {
    return document.getElementById('modal-power-editor');
  }
  const body = document.body;
  if (!body) return null;
  const overlay = document.createElement('div');
  overlay.id = 'modal-power-editor';
  overlay.className = 'overlay hidden';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('data-modal-static', '');
  overlay.setAttribute('data-view-allow', '');
  overlay.style.display = 'none';

  const modal = document.createElement('div');
  modal.className = 'modal modal-power-editor';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'power-editor-title');
  modal.tabIndex = -1;
  modal.setAttribute('data-view-allow', '');

  const dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.className = 'x';
  dismissButton.setAttribute('aria-label', 'Close');
  dismissButton.setAttribute('data-power-editor-dismiss', '');
  dismissButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>';

  const title = document.createElement('h3');
  title.id = 'power-editor-title';
  title.textContent = 'Edit Power';

  const content = document.createElement('div');
  content.className = 'power-editor__content';
  content.setAttribute('data-role', 'power-editor-content');
  content.setAttribute('data-view-allow', '');

  const actions = document.createElement('div');
  actions.className = 'actions power-editor__actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn-sm';
  cancelButton.setAttribute('data-power-editor-cancel', '');
  cancelButton.textContent = 'Cancel';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'btn-sm btn-primary';
  saveButton.setAttribute('data-power-editor-save', '');
  saveButton.textContent = 'Save';

  actions.append(cancelButton, saveButton);
  modal.append(dismissButton, title, content, actions);
  overlay.appendChild(modal);
  body.appendChild(overlay);
  return overlay;
}

function ensurePowerEditorElements() {
  if (powerEditorState.overlay) return true;
  let overlay = $('modal-power-editor');
  if (!overlay) {
    overlay = createPowerEditorOverlay();
  }
  if (!overlay) return false;
  let modal = overlay.querySelector('.modal-power-editor');
  let content = overlay.querySelector('[data-role="power-editor-content"]');
  let title = overlay.querySelector('#power-editor-title');
  let saveButton = overlay.querySelector('[data-power-editor-save]');
  let cancelButton = overlay.querySelector('[data-power-editor-cancel]');
  if (!modal || !content || !title || !saveButton || !cancelButton) {
    try {
      overlay.parentNode?.removeChild(overlay);
    } catch (err) {}
    overlay = createPowerEditorOverlay();
    modal = overlay ? overlay.querySelector('.modal-power-editor') : null;
    content = overlay ? overlay.querySelector('[data-role="power-editor-content"]') : null;
    title = overlay ? overlay.querySelector('#power-editor-title') : null;
    saveButton = overlay ? overlay.querySelector('[data-power-editor-save]') : null;
    cancelButton = overlay ? overlay.querySelector('[data-power-editor-cancel]') : null;
  }
  if (!overlay || !modal || !content || !title || !saveButton || !cancelButton) return false;
  try {
    overlay.setAttribute('data-view-allow', '');
    modal.setAttribute('data-view-allow', '');
    content.setAttribute('data-view-allow', '');
  } catch {}
  powerEditorState.overlay = overlay;
  powerEditorState.modal = modal;
  powerEditorState.content = content;
  powerEditorState.title = title;
  powerEditorState.saveButton = saveButton;
  powerEditorState.cancelButton = cancelButton;
  if (!powerEditorState.bindingsInitialized) {
    saveButton.addEventListener('click', handlePowerEditorSave);
    cancelButton.addEventListener('click', handlePowerEditorCancel);
    overlay.querySelectorAll('[data-power-editor-dismiss]').forEach(btn => {
      btn.addEventListener('click', handlePowerEditorCancel);
    });
    powerEditorState.bindingsInitialized = true;
  }
  return true;
}

function restorePowerEditorCard() {
  const { body, placeholder, parent, content, card } = powerEditorState;
  if (body && content && content.contains(body)) {
    content.removeChild(body);
  }
  if (body && parent) {
    if (placeholder && parent.contains(placeholder)) {
      parent.insertBefore(body, placeholder);
    } else {
      parent.appendChild(body);
    }
  }
  if (placeholder && placeholder.parentNode) {
    placeholder.parentNode.removeChild(placeholder);
  }
  if (body) {
    body.classList.remove('power-card__body--editing');
  }
  if (card) {
    card.classList.remove('power-card--editing');
    const existingState = powerCardStates.get(card);
    if (existingState?.elements?.summaryEdit) {
      existingState.elements.summaryEdit.disabled = false;
    }
  }
  if (content) {
    content.innerHTML = '';
  }
  powerEditorState.body = null;
  powerEditorState.placeholder = null;
  powerEditorState.parent = null;
}

function resetPowerEditorState() {
  powerEditorState.card = null;
  powerEditorState.targetList = null;
  powerEditorState.initialData = null;
  powerEditorState.isNew = false;
}

function handlePowerEditorSave(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  const { card, targetList, isNew } = powerEditorState;
  if (!card) {
    hide('modal-power-editor');
    return;
  }
  restorePowerEditorCard();
  if (isNew && targetList && !card.isConnected) {
    targetList.appendChild(card);
  }
  updatePowerCardDerived(card);
  hide('modal-power-editor');
  if (typeof pushHistory === 'function') pushHistory();
  const editButton = powerCardStates.get(card)?.elements?.summaryEdit;
  resetPowerEditorState();
  if (editButton) {
    try { editButton.focus(); } catch (err) {}
  }
}

function handlePowerEditorCancel(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  const { card, isNew, initialData } = powerEditorState;
  if (!card) {
    hide('modal-power-editor');
    return;
  }
  if (isNew) {
    activePowerCards.delete(card);
    powerCardStates.delete(card);
    if (card.parentNode) {
      card.parentNode.removeChild(card);
    }
  } else if (initialData) {
    applyPowerDataToCard(card, initialData);
  }
  restorePowerEditorCard();
  hide('modal-power-editor');
  resetPowerEditorState();
}

function openPowerEditor(card, { isNew = false, targetList = null } = {}) {
  if (!card) return false;
  if (!ensurePowerEditorElements()) {
    console.warn('Power editor modal unavailable.');
    return false;
  }
  const body = card.querySelector('.power-card__body');
  if (!body) return false;
  if (powerEditorState.card && powerEditorState.card !== card) {
    handlePowerEditorCancel();
  }
  const placeholder = document.createComment('power-card-body');
  const parent = body.parentNode;
  if (parent) {
    parent.insertBefore(placeholder, body);
  }
  if (powerEditorState.content) {
    powerEditorState.content.innerHTML = '';
    powerEditorState.content.appendChild(body);
    powerEditorState.content.scrollTop = 0;
  }
  body.classList.add('power-card__body--editing');
  card.classList.add('power-card--editing');
  powerEditorState.body = body;
  powerEditorState.placeholder = placeholder;
  powerEditorState.parent = parent;
  powerEditorState.card = card;
  powerEditorState.targetList = targetList || card.parentNode;
  powerEditorState.isNew = !!isNew;
  powerEditorState.initialData = serializePowerCard(card);
  const currentState = powerCardStates.get(card);
  if (currentState?.elements?.summaryEdit) {
    currentState.elements.summaryEdit.disabled = true;
  }
  const isSignature = card?.dataset?.kind === 'sig';
  const label = isSignature ? 'Signature Move' : 'Power';
  if (powerEditorState.title) {
    powerEditorState.title.textContent = `${isNew ? 'Create' : 'Edit'} ${label}`;
  }
  if (powerEditorState.saveButton) {
    powerEditorState.saveButton.textContent = isNew ? `Save ${label}` : 'Save Changes';
  }
  show('modal-power-editor');
  return true;
}

function createPowerCard(pref = {}, options = {}) {
  const isSignature = options.signature === true;
  const base = isSignature ? normalizeSignatureData(pref) : pref;
  const power = normalizePowerData(isSignature ? { ...base, signature: true } : base);
  if (isSignature) {
    power.signature = true;
  }
  const initialUsageTracker = power.usageTracker ? { ...power.usageTracker } : null;
  if (initialUsageTracker) {
    power.usageTracker = initialUsageTracker;
  }
  const card = document.createElement('div');
  card.className = 'card power-card';
  card.dataset.kind = isSignature ? 'sig' : 'power';
  card.setAttribute('data-view-allow', '');
  if (isSignature) {
    card.dataset.signature = 'true';
  }
  card.draggable = true;
  card.dataset.powerId = power.id;

  const signatureUseProxy = isSignature ? (() => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sr-only power-card__proxy-button';
    btn.tabIndex = -1;
    btn.setAttribute('aria-hidden', 'true');
    card.appendChild(btn);
    return btn;
  })() : null;

  const elements = {};
  const summary = document.createElement('div');
  summary.className = 'power-card__summary';

  const summaryHeader = document.createElement('div');
  summaryHeader.className = 'power-card__summary-header';

  const summaryNameWrap = document.createElement('div');
  summaryNameWrap.className = 'power-card__summary-name-wrap';

  const summaryName = document.createElement('span');
  summaryName.className = 'power-card__summary-name';
  summaryNameWrap.appendChild(summaryName);

  const summaryEdit = document.createElement('button');
  summaryEdit.type = 'button';
  summaryEdit.className = 'power-card__summary-edit';
  summaryEdit.innerHTML = ICON_EDIT;
  summaryEdit.setAttribute('aria-label', isSignature ? 'Edit Signature Move' : 'Edit Power');
  summaryEdit.setAttribute('title', isSignature ? 'Edit Signature Move' : 'Edit Power');
  summaryNameWrap.appendChild(summaryEdit);

  summaryHeader.appendChild(summaryNameWrap);

  const summarySp = document.createElement('span');
  summarySp.className = 'power-card__sp-chip';
  summarySp.dataset.placeholder = '0 SP';
  summaryHeader.appendChild(summarySp);

  summary.appendChild(summaryHeader);

  const summaryRolls = document.createElement('div');
  summaryRolls.className = 'power-card__summary-rolls';

  function createSummaryRoll(label) {
    const wrap = document.createElement('div');
    wrap.className = 'power-card__summary-roll';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-sm power-card__summary-roll-btn';
    button.textContent = label;
    const result = document.createElement('span');
    result.className = 'pill result power-card__roll-output';
    result.dataset.placeholder = label;
    wrap.append(button, result);
    summaryRolls.appendChild(wrap);
    return { button, result };
  }

  const summaryAttack = createSummaryRoll('Roll to Hit');
  const summaryDamage = createSummaryRoll('Roll Damage');
  const summarySave = createSummaryRoll('Roll Save');
  summary.appendChild(summaryRolls);

  const summaryDescription = document.createElement('p');
  summaryDescription.className = 'power-card__summary-description';
  summaryDescription.hidden = true;
  summary.appendChild(summaryDescription);

  const summaryStats = document.createElement('div');
  summaryStats.className = 'power-card__summary-stats';
  summary.appendChild(summaryStats);

  card.appendChild(summary);

  elements.summary = summary;
  elements.summaryName = summaryName;
  elements.summaryEdit = summaryEdit;
  elements.summarySp = summarySp;
  elements.summaryDescription = summaryDescription;
  elements.summaryStats = summaryStats;
  elements.summaryRollHit = summaryAttack.button;
  elements.summaryHitResult = summaryAttack.result;
  elements.summaryRollDamage = summaryDamage.button;
  elements.summaryDamageResult = summaryDamage.result;
  elements.summaryRollSave = summarySave.button;
  elements.summarySaveResult = summarySave.result;
  if (signatureUseProxy) {
    elements.signatureProxyButton = signatureUseProxy;
  }

  summaryAttack.button.addEventListener('click', event => {
    event.preventDefault();
    const outputs = [];
    if (summaryAttack.result) outputs.push(summaryAttack.result);
    if (elements.attackResult) outputs.push(elements.attackResult);
    handleRollPowerAttack(card, { outputs });
  });

  summaryDamage.button.addEventListener('click', event => {
    event.preventDefault();
    const outputs = [];
    if (summaryDamage.result) outputs.push(summaryDamage.result);
    if (elements.damageResult) outputs.push(elements.damageResult);
    handleRollPowerDamage(card, { outputs });
  });

  summarySave.button.addEventListener('click', event => {
    event.preventDefault();
    const outputs = [];
    if (summarySave.result) outputs.push(summarySave.result);
    if (elements.saveResult) outputs.push(elements.saveResult);
    handleRollPowerSave(card, { outputs });
  });
  summaryEdit.addEventListener('click', event => {
    event.preventDefault();
    openPowerEditor(card, { isNew: false });
  });
  function createQuickRow(labelText) {
    const row = document.createElement('div');
    row.className = 'inline';
    row.style.flexWrap = 'wrap';
    row.style.gap = '4px';
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.fontSize = '11px';
    label.style.opacity = '0.75';
    row.appendChild(label);
    return row;
  }
  const state = {
    power,
    elements,
    pendingConcentrationAction: null,
    manualSpOverride: false,
    manualSaveAbility: false,
    manualOnSave: false,
    lastEffectTag: power.effectTag,
    lastIntensity: power.intensity,
    lastSuggestedSp: suggestSpCost(power.intensity),
    lastHasDamage: !!power.damage,
    lastOnSaveSuggestion: power.damage ? suggestOnSaveBehavior(power.effectTag) : null,
    usageTracker: initialUsageTracker,
    powerExhaustedByTracker: false,
    usageExhaustedMessage: '',
  };
  powerCardStates.set(card, state);
  activePowerCards.add(card);

  const topRow = document.createElement('div');
  topRow.className = 'inline';
  topRow.style.flexWrap = 'wrap';
  topRow.style.gap = '8px';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = isSignature ? 'Signature Move Name' : 'Power Name';
  nameInput.value = power.name;
  nameInput.dataset.f = 'name';
  const nameField = createFieldContainer('Name', nameInput, { flex: '2', minWidth: '200px' });
  topRow.appendChild(nameField.wrapper);

  const styleSelect = document.createElement('select');
  setSelectOptions(styleSelect, POWER_STYLES, power.style, { includeEmpty: true });
  const styleField = createFieldContainer('Style', styleSelect, { flex: '1', minWidth: '160px' });
  topRow.appendChild(styleField.wrapper);

  const actionSelect = document.createElement('select');
  setSelectOptions(actionSelect, POWER_ACTION_TYPES, power.actionType);
  const actionField = createFieldContainer('Action Type', actionSelect, { flex: '1', minWidth: '150px' });
  topRow.appendChild(actionField.wrapper);

  card.appendChild(topRow);

  const targetingRow = document.createElement('div');
  targetingRow.className = 'inline';
  targetingRow.style.flexWrap = 'wrap';
  targetingRow.style.gap = '8px';

  const shapeSelect = document.createElement('select');
  setSelectOptions(shapeSelect, POWER_TARGET_SHAPES, power.shape);
  const shapeField = createFieldContainer('Target Shape', shapeSelect, { flex: '1', minWidth: '140px' });
  targetingRow.appendChild(shapeField.wrapper);

  const rangeSelect = document.createElement('select');
  setSelectOptions(rangeSelect, POWER_SHAPE_RANGES[power.shape] || [], power.range);
  const rangeField = createFieldContainer('Range', rangeSelect, { flex: '1', minWidth: '140px' });
  const rangeHint = document.createElement('div');
  rangeHint.style.fontSize = '12px';
  rangeHint.style.opacity = '0.8';
  rangeHint.style.minHeight = '14px';
  rangeHint.style.display = 'none';
  rangeField.wrapper.appendChild(rangeHint);
  targetingRow.appendChild(rangeField.wrapper);

  const effectSelect = document.createElement('select');
  setSelectOptions(effectSelect, POWER_EFFECT_TAGS, power.effectTag);
  const effectField = createFieldContainer('Primary Effect', effectSelect, { flex: '1', minWidth: '160px' });
  targetingRow.appendChild(effectField.wrapper);

  const secondarySelect = document.createElement('select');
  setSelectOptions(secondarySelect, POWER_EFFECT_TAGS, power.secondaryTag, { includeEmpty: true });
  const secondaryField = createFieldContainer('Secondary Tag', secondarySelect, { flex: '1', minWidth: '160px' });
  targetingRow.appendChild(secondaryField.wrapper);

  card.appendChild(targetingRow);

  const intensityRow = document.createElement('div');
  intensityRow.className = 'inline';
  intensityRow.style.flexWrap = 'wrap';
  intensityRow.style.gap = '8px';

  const intensitySelect = document.createElement('select');
  setSelectOptions(intensitySelect, POWER_INTENSITIES, power.intensity);
  const intensityField = createFieldContainer('Intensity', intensitySelect, { flex: '1', minWidth: '140px' });
  intensityRow.appendChild(intensityField.wrapper);

  const spInput = document.createElement('input');
  spInput.type = 'number';
  spInput.min = '1';
  spInput.value = power.spCost;
  spInput.inputMode = 'numeric';
  const spField = createFieldContainer('SP Cost', spInput, { flex: '1', minWidth: '120px' });
  const spControls = document.createElement('div');
  spControls.style.display = 'flex';
  spControls.style.gap = '4px';
  const spSuggestBtn = document.createElement('button');
  spSuggestBtn.type = 'button';
  spSuggestBtn.className = 'btn-sm';
  spSuggestBtn.textContent = 'Suggest';
  spControls.appendChild(spSuggestBtn);
  spField.wrapper.appendChild(spControls);
  const spHint = document.createElement('div');
  spHint.style.fontSize = '12px';
  spHint.style.opacity = '0.8';
  spField.wrapper.appendChild(spHint);
  intensityRow.appendChild(spField.wrapper);

  card.appendChild(intensityRow);

  const saveRow = document.createElement('div');
  saveRow.className = 'inline';
  saveRow.style.flexWrap = 'wrap';
  saveRow.style.gap = '8px';

  const requiresSaveWrap = document.createElement('div');
  requiresSaveWrap.style.display = 'flex';
  requiresSaveWrap.style.alignItems = 'center';
  requiresSaveWrap.style.gap = '6px';
  const requiresSaveLabel = document.createElement('label');
  requiresSaveLabel.className = 'inline';
  requiresSaveLabel.style.alignItems = 'center';
  requiresSaveLabel.style.gap = '6px';
  const requiresSaveToggle = document.createElement('input');
  requiresSaveToggle.type = 'checkbox';
  requiresSaveToggle.checked = power.requiresSave;
  requiresSaveLabel.append(requiresSaveToggle, document.createTextNode(' Save Required'));
  requiresSaveWrap.appendChild(requiresSaveLabel);
  saveRow.appendChild(requiresSaveWrap);

  const saveAbilitySelect = document.createElement('select');
  setSelectOptions(saveAbilitySelect, POWER_SAVE_ABILITIES, power.saveAbilityTarget || POWER_SAVE_ABILITIES[0]);
  const saveAbilityField = createFieldContainer('Save Ability (target rolls)', saveAbilitySelect, { flex: '1', minWidth: '120px' });
  const saveAbilityHint = document.createElement('div');
  saveAbilityHint.style.fontSize = '12px';
  saveAbilityHint.style.opacity = '0.8';
  saveAbilityHint.style.minHeight = '14px';
  saveAbilityField.wrapper.appendChild(saveAbilityHint);
  saveRow.appendChild(saveAbilityField.wrapper);

  const saveBonusInput = document.createElement('input');
  saveBonusInput.type = 'number';
  saveBonusInput.step = '1';
  saveBonusInput.value = '0';
  saveBonusInput.placeholder = '+0';
  const saveBonusField = createFieldContainer('Target Save Bonus', saveBonusInput, { flex: '1', minWidth: '120px' });
  saveRow.appendChild(saveBonusField.wrapper);

  const durationSelect = document.createElement('select');
  setSelectOptions(durationSelect, POWER_DURATIONS, power.duration);
  const durationField = createFieldContainer('Duration', durationSelect, { flex: '1', minWidth: '160px' });
  saveRow.appendChild(durationField.wrapper);

  const concentrationWrap = document.createElement('div');
  concentrationWrap.style.display = 'flex';
  concentrationWrap.style.flexDirection = 'column';
  concentrationWrap.style.gap = '4px';
  const concentrationLabel = document.createElement('label');
  concentrationLabel.className = 'inline';
  concentrationLabel.style.alignItems = 'center';
  concentrationLabel.style.gap = '6px';
  const concentrationToggle = document.createElement('input');
  concentrationToggle.type = 'checkbox';
  concentrationToggle.checked = power.concentration;
  concentrationLabel.append(concentrationToggle, document.createTextNode(' Concentration'));
  const concentrationHint = document.createElement('div');
  concentrationHint.style.fontSize = '12px';
  concentrationHint.style.opacity = '0.8';
  concentrationWrap.append(concentrationLabel, concentrationHint);
  saveRow.appendChild(concentrationWrap);

  card.appendChild(saveRow);

  const usageRow = document.createElement('div');
  usageRow.className = 'inline';
  usageRow.style.flexWrap = 'wrap';
  usageRow.style.gap = '8px';

  const usesSelect = document.createElement('select');
  setSelectOptions(usesSelect, POWER_USES, power.uses);
  const usesField = createFieldContainer('Uses', usesSelect, { flex: '1', minWidth: '140px' });
  usageRow.appendChild(usesField.wrapper);

  const cooldownInput = document.createElement('input');
  cooldownInput.type = 'number';
  cooldownInput.min = '0';
  cooldownInput.value = power.cooldown || 0;
  cooldownInput.inputMode = 'numeric';
  const cooldownField = createFieldContainer('Cooldown (rounds)', cooldownInput, { flex: '1', minWidth: '140px' });
  usageRow.appendChild(cooldownField.wrapper);

  const scalingSelect = document.createElement('select');
  setSelectOptions(scalingSelect, POWER_SCALING_OPTIONS, power.scaling);
  const scalingField = createFieldContainer('Scaling', scalingSelect, { flex: '1', minWidth: '140px' });
  usageRow.appendChild(scalingField.wrapper);

  card.appendChild(usageRow);

  const usageTrackerSection = document.createElement('div');
  usageTrackerSection.className = 'power-card__usage-tracker';
  usageTrackerSection.style.display = 'none';
  usageTrackerSection.style.flexDirection = 'column';
  usageTrackerSection.style.gap = '6px';
  usageTrackerSection.style.padding = '6px 8px';
  usageTrackerSection.style.borderRadius = '8px';
  usageTrackerSection.style.background = 'rgba(255,255,255,0.04)';

  const usageHeader = document.createElement('div');
  usageHeader.className = 'inline';
  usageHeader.style.flexWrap = 'wrap';
  usageHeader.style.gap = '6px';
  usageHeader.style.alignItems = 'center';

  const usageTitle = document.createElement('span');
  usageTitle.style.fontSize = '12px';
  usageTitle.style.fontWeight = '600';
  usageTitle.textContent = 'Usage Tracker';

  const usageStatus = document.createElement('span');
  usageStatus.style.fontSize = '12px';
  usageStatus.style.opacity = '0.85';
  usageStatus.textContent = '';

  usageHeader.append(usageTitle, usageStatus);
  usageTrackerSection.appendChild(usageHeader);

  const usesControls = document.createElement('div');
  usesControls.className = 'inline';
  usesControls.style.flexWrap = 'wrap';
  usesControls.style.gap = '6px';
  usesControls.style.alignItems = 'center';
  usesControls.style.display = 'none';

  const usesTotalLabel = document.createElement('label');
  usesTotalLabel.className = 'inline';
  usesTotalLabel.style.alignItems = 'center';
  usesTotalLabel.style.gap = '4px';
  const usesTotalText = document.createElement('span');
  usesTotalText.style.fontSize = '12px';
  usesTotalText.textContent = 'Total';
  const usesTotalInput = document.createElement('input');
  usesTotalInput.type = 'number';
  usesTotalInput.min = '0';
  usesTotalInput.step = '1';
  usesTotalInput.inputMode = 'numeric';
  usesTotalInput.style.width = '60px';
  usesTotalInput.className = 'power-card__usage-input';
  usesTotalLabel.append(usesTotalText, usesTotalInput);
  usesControls.appendChild(usesTotalLabel);

  const spendUseButton = document.createElement('button');
  spendUseButton.type = 'button';
  spendUseButton.className = 'btn-sm';
  spendUseButton.textContent = 'Spend';
  usesControls.appendChild(spendUseButton);

  const restoreUseButton = document.createElement('button');
  restoreUseButton.type = 'button';
  restoreUseButton.className = 'btn-sm';
  restoreUseButton.textContent = 'Restore';
  usesControls.appendChild(restoreUseButton);

  const resetUsesButton = document.createElement('button');
  resetUsesButton.type = 'button';
  resetUsesButton.className = 'btn-sm';
  resetUsesButton.textContent = 'Reset';
  usesControls.appendChild(resetUsesButton);

  usageTrackerSection.appendChild(usesControls);

  const cooldownControls = document.createElement('div');
  cooldownControls.className = 'inline';
  cooldownControls.style.flexWrap = 'wrap';
  cooldownControls.style.gap = '6px';
  cooldownControls.style.alignItems = 'center';
  cooldownControls.style.display = 'none';

  const startCooldownButton = document.createElement('button');
  startCooldownButton.type = 'button';
  startCooldownButton.className = 'btn-sm';
  startCooldownButton.textContent = 'Start';
  cooldownControls.appendChild(startCooldownButton);

  const tickCooldownButton = document.createElement('button');
  tickCooldownButton.type = 'button';
  tickCooldownButton.className = 'btn-sm';
  tickCooldownButton.textContent = '−1 Round';
  cooldownControls.appendChild(tickCooldownButton);

  const resetCooldownButton = document.createElement('button');
  resetCooldownButton.type = 'button';
  resetCooldownButton.className = 'btn-sm';
  resetCooldownButton.textContent = 'Reset';
  cooldownControls.appendChild(resetCooldownButton);

  usageTrackerSection.appendChild(cooldownControls);

  card.appendChild(usageTrackerSection);

  const damageSection = document.createElement('div');
  damageSection.style.display = 'flex';
  damageSection.style.flexDirection = 'column';
  damageSection.style.gap = '6px';

  const damageToggleLabel = document.createElement('label');
  damageToggleLabel.className = 'inline';
  damageToggleLabel.style.alignItems = 'center';
  damageToggleLabel.style.gap = '6px';
  const damageToggle = document.createElement('input');
  damageToggle.type = 'checkbox';
  damageToggle.checked = !!power.damage;
  damageToggleLabel.append(damageToggle, document.createTextNode(' Include Damage Package'));
  damageSection.appendChild(damageToggleLabel);

  const damageFields = document.createElement('div');
  damageFields.className = 'inline';
  damageFields.style.flexWrap = 'wrap';
  damageFields.style.gap = '8px';

  const damageDiceSelect = document.createElement('select');
  setSelectOptions(damageDiceSelect, POWER_DAMAGE_DICE, power.damage?.dice || POWER_DAMAGE_DICE[0]);
  const damageDiceField = createFieldContainer('Damage Dice', damageDiceSelect, { flex: '1', minWidth: '120px' });
  damageFields.appendChild(damageDiceField.wrapper);

  const damageTypeSelect = document.createElement('select');
  setSelectOptions(damageTypeSelect, POWER_DAMAGE_TYPES, power.damage?.type || defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0]);
  const damageTypeField = createFieldContainer('Damage Type', damageTypeSelect, { flex: '1', minWidth: '140px' });
  damageFields.appendChild(damageTypeField.wrapper);

  const damageSaveSelect = document.createElement('select');
  setSelectOptions(damageSaveSelect, POWER_ON_SAVE_OPTIONS, power.damage?.onSave || 'Half');
  const damageSaveField = createFieldContainer('On Save', damageSaveSelect, { flex: '1', minWidth: '140px' });
  const damageSaveHint = document.createElement('div');
  damageSaveHint.style.fontSize = '12px';
  damageSaveHint.style.opacity = '0.8';
  damageSaveHint.style.minHeight = '14px';
  damageSaveField.wrapper.appendChild(damageSaveHint);
  damageFields.appendChild(damageSaveField.wrapper);

  damageSection.appendChild(damageFields);
  if (!power.damage) damageFields.style.display = 'none';
  card.appendChild(damageSection);

  const secondaryHint = document.createElement('div');
  secondaryHint.style.fontSize = '12px';
  secondaryHint.style.opacity = '0.8';
  secondaryHint.style.minHeight = '14px';
  secondaryField.wrapper.appendChild(secondaryHint);

  const descriptionArea = document.createElement('textarea');
  descriptionArea.rows = 3;
  descriptionArea.placeholder = 'Description / Flavor text';
  descriptionArea.value = power.description || '';
  descriptionArea.style.resize = 'vertical';
  const descriptionField = createFieldContainer('Description', descriptionArea, { flex: '1', minWidth: '100%' });
  card.appendChild(descriptionField.wrapper);

  const specialArea = document.createElement('textarea');
  specialArea.rows = 2;
  specialArea.placeholder = 'Special Rider / Notes';
  specialArea.value = power.special || '';
  specialArea.style.resize = 'vertical';
  const specialField = createFieldContainer('Special Text', specialArea, { flex: '1', minWidth: '100%' });
  card.appendChild(specialField.wrapper);

  const derivedRow = document.createElement('div');
  derivedRow.className = 'inline';
  derivedRow.style.flexWrap = 'wrap';
  derivedRow.style.gap = '8px';
  derivedRow.style.alignItems = 'center';

  const saveDcInput = document.createElement('input');
  saveDcInput.type = 'number';
  saveDcInput.readOnly = true;
  saveDcInput.placeholder = '—';
  const saveDcField = createFieldContainer('Power Save DC', saveDcInput, { flex: '0 0 160px', minWidth: '140px' });
  derivedRow.appendChild(saveDcField.wrapper);

  const rulesPreview = document.createElement('div');
  rulesPreview.style.fontSize = '12px';
  rulesPreview.style.opacity = '0.9';
  rulesPreview.style.flex = '1';
  rulesPreview.style.minWidth = '240px';
  rulesPreview.style.padding = '6px 8px';
  rulesPreview.style.borderRadius = '8px';
  rulesPreview.style.background = 'rgba(255,255,255,0.04)';
  rulesPreview.setAttribute('aria-live', 'polite');
  derivedRow.appendChild(rulesPreview);

  card.appendChild(derivedRow);

  const quickControls = document.createElement('div');
  quickControls.className = 'power-card__quick-grid';

  function createQuickField(labelText) {
    const field = document.createElement('label');
    field.className = 'power-card__quick-field';
    const caption = document.createElement('span');
    caption.className = 'power-card__quick-label';
    caption.textContent = labelText;
    const select = document.createElement('select');
    select.className = 'power-card__quick-select';
    field.append(caption, select);
    return { field, select, caption };
  }

  const spQuickField = document.createElement('div');
  spQuickField.className = 'power-card__quick-field power-card__quick-field--sp';
  const spQuickLabel = document.createElement('span');
  spQuickLabel.className = 'power-card__quick-label';
  spQuickLabel.textContent = 'SP Cost';
  const spQuickValue = document.createElement('span');
  spQuickValue.className = 'power-card__sp-chip';
  spQuickValue.dataset.placeholder = '0 SP';
  const spQuickButtons = document.createElement('div');
  spQuickButtons.className = 'power-card__quick-sp-controls';
  const spDecBtn = document.createElement('button');
  spDecBtn.type = 'button';
  spDecBtn.className = 'btn-sm power-card__quick-btn';
  spDecBtn.textContent = '−';
  const spIncBtn = document.createElement('button');
  spIncBtn.type = 'button';
  spIncBtn.className = 'btn-sm power-card__quick-btn';
  spIncBtn.textContent = '+';
  spQuickButtons.append(spDecBtn, spIncBtn);
  const spQuickValueWrap = document.createElement('div');
  spQuickValueWrap.className = 'power-card__quick-sp-display';
  spQuickValueWrap.append(spQuickValue);
  spQuickField.append(spQuickLabel, spQuickValueWrap, spQuickButtons);

  const rangeQuick = createQuickField('Quick Range');
  const durationQuick = createQuickField('Duration');
  const saveQuick = createQuickField('Save Ability');
  const onSaveQuick = createQuickField('On Save');
  const diceQuick = createQuickField('Damage Dice');

  quickControls.append(spQuickField, rangeQuick.field, durationQuick.field, saveQuick.field, onSaveQuick.field, diceQuick.field);

  rangeQuick.select.addEventListener('change', () => {
    const value = rangeQuick.select.value;
    if (value === 'Melee') {
      power.shape = 'Melee';
      shapeSelect.value = 'Melee';
      power.range = 'Melee';
    } else {
      power.range = ensureRangeForShape(power.shape, value, getCharacterPowerSettings());
    }
    rangeSelect.value = power.range;
    updatePowerCardDerived(card);
  });

  durationQuick.select.addEventListener('change', () => {
    power.duration = durationQuick.select.value;
    durationSelect.value = power.duration;
    updatePowerCardDerived(card);
  });

  saveQuick.select.addEventListener('change', () => {
    if (!power.requiresSave) {
      power.requiresSave = true;
      requiresSaveToggle.checked = true;
    }
    power.saveAbilityTarget = saveQuick.select.value;
    saveAbilitySelect.value = power.saveAbilityTarget;
    state.manualSaveAbility = true;
    updatePowerCardDerived(card);
  });

  onSaveQuick.select.addEventListener('change', () => {
    if (!power.damage) return;
    power.damage.onSave = onSaveQuick.select.value;
    damageSaveSelect.value = power.damage.onSave;
    state.manualOnSave = true;
    updatePowerCardDerived(card);
  });

  diceQuick.select.addEventListener('change', () => {
    const value = diceQuick.select.value;
    if (!value) return;
    if (!power.damage) {
      power.damage = {
        dice: value,
        type: defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0],
        onSave: 'Half',
      };
      damageToggle.checked = true;
      damageFields.style.display = 'flex';
    } else {
      power.damage.dice = value;
    }
    damageDiceSelect.value = value;
    updatePowerCardDerived(card);
  });

  spDecBtn.addEventListener('click', event => {
    event.preventDefault();
    power.spCost = Math.max(1, power.spCost - 1);
    spInput.value = String(power.spCost);
    state.manualSpOverride = true;
    updatePowerCardDerived(card);
  });

  spIncBtn.addEventListener('click', event => {
    event.preventDefault();
    power.spCost = Math.max(1, power.spCost + 1);
    spInput.value = String(power.spCost);
    state.manualSpOverride = true;
    updatePowerCardDerived(card);
  });

  const feedbackWrap = document.createElement('div');
  feedbackWrap.style.display = 'flex';
  feedbackWrap.style.flexDirection = 'column';
  feedbackWrap.style.gap = '6px';
  feedbackWrap.style.marginTop = '4px';

  const messageArea = document.createElement('div');
  messageArea.style.fontSize = '12px';
  messageArea.style.minHeight = '16px';
  messageArea.hidden = true;
  feedbackWrap.appendChild(messageArea);

  const concentrationPrompt = document.createElement('div');
  concentrationPrompt.className = 'inline';
  concentrationPrompt.style.flexWrap = 'wrap';
  concentrationPrompt.style.gap = '8px';
  concentrationPrompt.style.display = 'none';
  const concentrationPromptText = document.createElement('span');
  concentrationPromptText.style.flex = '1';
  concentrationPromptText.style.minWidth = '160px';
  const concentrationConfirm = document.createElement('button');
  concentrationConfirm.type = 'button';
  concentrationConfirm.className = 'btn-sm';
  concentrationConfirm.textContent = 'Drop & Use';
  const concentrationCancel = document.createElement('button');
  concentrationCancel.type = 'button';
  concentrationCancel.className = 'btn-sm';
  concentrationCancel.textContent = 'Cancel';
  concentrationPrompt.append(concentrationPromptText, concentrationConfirm, concentrationCancel);
  feedbackWrap.appendChild(concentrationPrompt);

  const actionRow = document.createElement('div');
  actionRow.className = 'power-card__actions';

  const useButton = document.createElement('button');
  useButton.type = 'button';
  useButton.className = 'btn-sm power-card__action-button';
  useButton.textContent = isSignature ? 'Use Signature' : 'Use Power';
  actionRow.appendChild(useButton);

  const attackGroup = document.createElement('div');
  attackGroup.className = 'power-card__action-roll';
  const rollAttackButton = document.createElement('button');
  rollAttackButton.type = 'button';
  rollAttackButton.className = 'btn-sm';
  rollAttackButton.textContent = 'Roll to Hit';
  const attackResult = document.createElement('span');
  attackResult.className = 'pill result power-card__roll-output';
  attackResult.dataset.placeholder = 'Hit';
  attackGroup.append(rollAttackButton, attackResult);
  actionRow.appendChild(attackGroup);

  const damageGroup = document.createElement('div');
  damageGroup.className = 'power-card__action-roll';
  const rollDamageButton = document.createElement('button');
  rollDamageButton.type = 'button';
  rollDamageButton.className = 'btn-sm';
  rollDamageButton.textContent = 'Roll Damage';
  const damageResult = document.createElement('span');
  damageResult.className = 'pill result power-card__roll-output';
  damageResult.dataset.placeholder = 'Damage';
  damageGroup.append(rollDamageButton, damageResult);
  actionRow.appendChild(damageGroup);

  const saveGroup = document.createElement('div');
  saveGroup.className = 'power-card__action-roll';
  const rollSaveButton = document.createElement('button');
  rollSaveButton.type = 'button';
  rollSaveButton.className = 'btn-sm';
  rollSaveButton.textContent = 'Roll Save For Target';
  const saveResult = document.createElement('span');
  saveResult.className = 'pill result power-card__roll-output';
  saveResult.dataset.placeholder = 'Save';
  saveGroup.append(rollSaveButton, saveResult);
  actionRow.appendChild(saveGroup);

  const ongoingButton = document.createElement('button');
  ongoingButton.type = 'button';
  ongoingButton.className = 'btn-sm power-card__action-button';
  ongoingButton.textContent = 'Apply Ongoing';
  actionRow.appendChild(ongoingButton);

  const boostButton = document.createElement('button');
  boostButton.type = 'button';
  boostButton.className = 'btn-sm power-card__action-button';
  boostButton.textContent = 'Spend 1 SP: Boost Roll';
  actionRow.appendChild(boostButton);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn-sm power-card__action-button';
  applyDeleteIcon(deleteButton);
  actionRow.appendChild(deleteButton);

  card.appendChild(actionRow);
  card.appendChild(feedbackWrap);
  card.appendChild(quickControls);

  elements.nameInput = nameInput;
  elements.styleSelect = styleSelect;
  elements.actionSelect = actionSelect;
  elements.shapeSelect = shapeSelect;
  elements.rangeSelect = rangeSelect;
  elements.rangeField = rangeField;
  elements.rangeHint = rangeHint;
  elements.effectSelect = effectSelect;
  elements.secondarySelect = secondarySelect;
  elements.secondaryHint = secondaryHint;
  elements.intensitySelect = intensitySelect;
  elements.spInput = spInput;
  elements.spSuggestBtn = spSuggestBtn;
  elements.spHint = spHint;
  elements.requiresSaveToggle = requiresSaveToggle;
  elements.saveAbilitySelect = saveAbilitySelect;
  elements.saveAbilityHint = saveAbilityHint;
  elements.saveBonusInput = saveBonusInput;
  elements.saveAbilityField = saveAbilityField;
  elements.saveBonusField = saveBonusField;
  elements.durationSelect = durationSelect;
  elements.concentrationToggle = concentrationToggle;
  elements.concentrationHint = concentrationHint;
  elements.usesSelect = usesSelect;
  elements.cooldownInput = cooldownInput;
  elements.cooldownField = cooldownField;
  elements.scalingSelect = scalingSelect;
  elements.usageTrackerSection = usageTrackerSection;
  elements.usageStatus = usageStatus;
  elements.usageControls = usesControls;
  elements.usageTotalInput = usesTotalInput;
  elements.usageSpendButton = spendUseButton;
  elements.usageRestoreButton = restoreUseButton;
  elements.usageResetButton = resetUsesButton;
  elements.cooldownControls = cooldownControls;
  elements.startCooldownButton = startCooldownButton;
  elements.tickCooldownButton = tickCooldownButton;
  elements.resetCooldownButton = resetCooldownButton;
  elements.descriptionArea = descriptionArea;
  elements.specialArea = specialArea;
  elements.damageToggle = damageToggle;
  elements.damageFields = damageFields;
  elements.damageDiceSelect = damageDiceSelect;
  elements.damageTypeSelect = damageTypeSelect;
  elements.damageSaveSelect = damageSaveSelect;
  elements.damageSaveHint = damageSaveHint;
  elements.damageSection = damageSection;
  elements.saveDcOutput = saveDcInput;
  elements.saveDcField = saveDcField;
  elements.rulesPreview = rulesPreview;
  elements.messageArea = messageArea;
  elements.concentrationPrompt = concentrationPrompt;
  elements.concentrationPromptText = concentrationPromptText;
  elements.concentrationConfirm = concentrationConfirm;
  elements.concentrationCancel = concentrationCancel;
  elements.rollAttackButton = rollAttackButton;
  elements.attackResult = attackResult;
  elements.rollDamageButton = rollDamageButton;
  elements.damageResult = damageResult;
  elements.rollSaveBtn = rollSaveButton;
  elements.saveResult = saveResult;
  elements.useButton = useButton;
  elements.ongoingButton = ongoingButton;
  elements.boostButton = boostButton;
  elements.deleteButton = deleteButton;
  elements.quickControls = quickControls;
  elements.quickSpValue = spQuickValue;
  elements.quickRangeSelect = rangeQuick.select;
  elements.quickRangeField = rangeQuick.field;
  elements.quickDiceSelect = diceQuick.select;
  elements.quickDiceField = diceQuick.field;
  elements.quickDurationSelect = durationQuick.select;
  elements.quickSaveSelect = saveQuick.select;
  elements.quickSaveField = saveQuick.field;
  elements.quickOnSaveSelect = onSaveQuick.select;
  elements.quickOnSaveField = onSaveQuick.field;
  elements.quickSpDecButton = spDecBtn;
  elements.quickSpIncButton = spIncBtn;

  const bodyContainer = document.createElement('div');
  bodyContainer.className = 'power-card__body';
  const preservedNodes = new Set([summary]);
  if (signatureUseProxy) preservedNodes.add(signatureUseProxy);
  Array.from(card.childNodes).forEach(node => {
    if (preservedNodes.has(node)) return;
    bodyContainer.appendChild(node);
  });
  if (summary.nextSibling) {
    card.insertBefore(bodyContainer, summary.nextSibling);
  } else {
    card.appendChild(bodyContainer);
  }

  if (signatureUseProxy) {
    signatureUseProxy.addEventListener('click', event => {
      event.preventDefault();
      handleUsePower(card);
    });
  }

  nameInput.addEventListener('input', () => {
    power.name = nameInput.value;
    updatePowerCardDerived(card);
  });
  styleSelect.addEventListener('change', () => {
    power.style = styleSelect.value;
    if (power.damage && power.damage.type === undefined) {
      power.damage.type = defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0];
      damageTypeSelect.value = power.damage.type;
    }
    updatePowerCardDerived(card);
  });
  actionSelect.addEventListener('change', () => {
    power.actionType = actionSelect.value;
    updatePowerCardDerived(card);
  });
  shapeSelect.addEventListener('change', () => {
    power.shape = shapeSelect.value;
    const shapeOptions = getRangeOptionsForShape(power.shape);
    setSelectOptions(rangeSelect, shapeOptions, power.range);
    power.range = ensureRangeForShape(power.shape, rangeSelect.value);
    updatePowerCardDerived(card);
  });
  rangeSelect.addEventListener('change', () => {
    power.range = rangeSelect.value;
    updatePowerCardDerived(card);
  });
  effectSelect.addEventListener('change', () => {
    power.effectTag = effectSelect.value;
    updatePowerCardDerived(card);
  });
  secondarySelect.addEventListener('change', () => {
    power.secondaryTag = secondarySelect.value || undefined;
    updatePowerCardDerived(card);
  });
  intensitySelect.addEventListener('change', () => {
    power.intensity = intensitySelect.value;
    updatePowerCardDerived(card);
  });
  spInput.addEventListener('input', () => {
    state.manualSpOverride = true;
    power.spCost = Math.max(1, readNumericInput(spInput.value, { min: 1, fallback: power.spCost }));
    updatePowerCardDerived(card);
  });
  spSuggestBtn.addEventListener('click', () => {
    power.spCost = suggestSpCost(power.intensity);
    spInput.value = String(power.spCost);
    state.manualSpOverride = false;
    updatePowerCardDerived(card);
  });
  requiresSaveToggle.addEventListener('change', () => {
    power.requiresSave = requiresSaveToggle.checked;
    if (!power.requiresSave) {
      state.manualSaveAbility = false;
    }
    updatePowerCardDerived(card);
  });
  saveAbilitySelect.addEventListener('change', () => {
    power.saveAbilityTarget = saveAbilitySelect.value;
    state.manualSaveAbility = true;
    updatePowerCardDerived(card);
  });
  durationSelect.addEventListener('change', () => {
    power.duration = durationSelect.value;
    if (power.duration === 'Sustained') {
      power.concentration = true;
      concentrationToggle.checked = true;
    }
    updatePowerCardDerived(card);
  });
  concentrationToggle.addEventListener('change', () => {
    power.concentration = concentrationToggle.checked || power.duration === 'Sustained';
    if (power.duration === 'Sustained') {
      concentrationToggle.checked = true;
    }
    updatePowerCardDerived(card);
  });
  usesSelect.addEventListener('change', () => {
    power.uses = usesSelect.value;
    updatePowerCardDerived(card);
  });
  cooldownInput.addEventListener('input', () => {
    power.cooldown = readNumericInput(cooldownInput.value, { min: 0, fallback: power.cooldown });
    updatePowerCardDerived(card);
  });
  usesTotalInput.addEventListener('input', () => {
    handlePowerUsageTotalChange(card, usesTotalInput.value);
  });
  spendUseButton.addEventListener('click', event => {
    event.preventDefault();
    handleSpendPowerUse(card);
  });
  restoreUseButton.addEventListener('click', event => {
    event.preventDefault();
    handleRestorePowerUse(card);
  });
  resetUsesButton.addEventListener('click', event => {
    event.preventDefault();
    handleResetPowerUses(card);
  });
  startCooldownButton.addEventListener('click', event => {
    event.preventDefault();
    handleStartPowerCooldown(card);
  });
  tickCooldownButton.addEventListener('click', event => {
    event.preventDefault();
    handleTickPowerCooldown(card);
  });
  resetCooldownButton.addEventListener('click', event => {
    event.preventDefault();
    handleResetPowerCooldown(card);
  });
  scalingSelect.addEventListener('change', () => {
    power.scaling = scalingSelect.value;
  });
  descriptionArea.addEventListener('input', () => {
    power.description = descriptionArea.value;
  });
  specialArea.addEventListener('input', () => {
    power.special = specialArea.value;
  });
  damageToggle.addEventListener('change', () => {
    if (damageToggle.checked) {
      const suggestedOnSave = suggestOnSaveBehavior(power.effectTag);
      const nextDamage = power.damage || {};
      nextDamage.dice = nextDamage.dice || damageDiceSelect.value || POWER_DAMAGE_DICE[0];
      nextDamage.type = nextDamage.type || damageTypeSelect.value || defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0];
      nextDamage.onSave = nextDamage.onSave || suggestedOnSave;
      power.damage = nextDamage;
      damageDiceSelect.value = power.damage.dice;
      damageTypeSelect.value = power.damage.type;
      damageSaveSelect.value = power.damage.onSave;
      state.manualOnSave = false;
    } else {
      power.damage = undefined;
      state.manualOnSave = false;
    }
    updatePowerCardDerived(card);
  });
  damageDiceSelect.addEventListener('change', () => {
    power.damage = power.damage || {};
    power.damage.dice = damageDiceSelect.value;
    updatePowerCardDerived(card);
  });
  damageTypeSelect.addEventListener('change', () => {
    power.damage = power.damage || {};
    power.damage.type = damageTypeSelect.value;
    updatePowerCardDerived(card);
  });
  damageSaveSelect.addEventListener('change', () => {
    power.damage = power.damage || {};
    power.damage.onSave = damageSaveSelect.value;
    state.manualOnSave = true;
    updatePowerCardDerived(card);
  });
  useButton.addEventListener('click', () => handleUsePower(card));
  rollAttackButton.addEventListener('click', event => {
    event.preventDefault();
    const outputs = [attackResult];
    if (elements.summaryHitResult) outputs.push(elements.summaryHitResult);
    handleRollPowerAttack(card, { outputs });
  });
  rollDamageButton.addEventListener('click', event => {
    event.preventDefault();
    const outputs = [damageResult];
    if (elements.summaryDamageResult) outputs.push(elements.summaryDamageResult);
    handleRollPowerDamage(card, { outputs });
  });
  rollSaveButton.addEventListener('click', event => {
    event.preventDefault();
    const outputs = [saveResult];
    if (elements.summarySaveResult) outputs.push(elements.summarySaveResult);
    handleRollPowerSave(card, { outputs });
  });
  ongoingButton.addEventListener('click', () => {
    const serialized = serializePowerCard(card);
    if (serialized) addOngoingEffectTracker(serialized, card);
  });
  boostButton.addEventListener('click', () => handleBoostRoll(card));
  deleteButton.addEventListener('click', () => handleDeletePower(card));

  concentrationConfirm.addEventListener('click', () => {
    const pending = state.pendingConcentrationAction;
    hideConcentrationPrompt(card);
    if (typeof pending === 'function') {
      if (activeConcentrationEffect && activeConcentrationEffect.card && activeConcentrationEffect.card !== card) {
        logAction(`Concentration ended: ${activeConcentrationEffect.name}`);
      }
      activeConcentrationEffect = null;
      clearPowerMessage(card);
      pending();
    }
  });

  concentrationCancel.addEventListener('click', () => {
    hideConcentrationPrompt(card);
    showPowerMessage(card, 'Concentration maintained on current effect.', 'info');
  });

  updatePowerCardDerived(card);
  if (mode === 'view') applyViewLockState(card);
  return card;
}

function setupPowerPresetMenu() {
  const addBtn = $('add-power');
  const list = $('powers');
  if (!addBtn || !list) return;
  const menu = document.createElement('div');
  menu.className = 'card power-preset-menu';
  menu.style.display = 'none';
  menu.dataset.open = 'false';
  menu.dataset.role = 'power-preset-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('data-view-allow', '');
  document.body.appendChild(menu);

  if (addBtn.type !== 'button') {
    try { addBtn.type = 'button'; }
    catch { addBtn.setAttribute('type', 'button'); }
  }

  const hideMenu = () => {
    menu.style.display = 'none';
    menu.style.visibility = '';
    menu.style.left = '';
    menu.style.top = '';
    menu.style.maxWidth = '';
    menu.dataset.open = 'false';
    menu.removeAttribute('data-placement');
  };

  const positionMenu = anchorRect => {
    if (!anchorRect) return;
    const margin = 12;
    const gap = 8;
    const viewport = window.visualViewport;
    const viewportWidth = viewport ? viewport.width : window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = viewport ? viewport.height : window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportOffsetLeft = viewport ? viewport.offsetLeft : 0;
    const viewportOffsetTop = viewport ? viewport.offsetTop : 0;
    const initialLeft = Math.round(anchorRect.left + viewportOffsetLeft);
    const initialTop = Math.round(anchorRect.bottom + gap + viewportOffsetTop);

    menu.style.visibility = 'hidden';
    menu.style.left = `${initialLeft}px`;
    menu.style.top = `${initialTop}px`;

    const schedulePosition = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : callback => setTimeout(callback, 16);

    schedulePosition(() => {
      const menuRect = menu.getBoundingClientRect();
      if (!menuRect.width || !menuRect.height) {
        menu.style.visibility = 'visible';
        return;
      }

      const minX = viewportOffsetLeft + margin;
      const minY = viewportOffsetTop + margin;
      const maxX = Math.max(minX, viewportOffsetLeft + viewportWidth - margin);
      const maxY = Math.max(minY, viewportOffsetTop + viewportHeight - margin);

      let left = initialLeft;
      let top = initialTop;
      let placement = 'below';

      if (viewportWidth <= 560) {
        left = minX;
      } else {
        const maxLeft = Math.max(minX, maxX - menuRect.width);
        left = Math.min(Math.max(left, minX), maxLeft);
      }

      const anchorBottom = anchorRect.bottom + viewportOffsetTop;
      const anchorTop = anchorRect.top + viewportOffsetTop;
      const availableBelow = Math.max(0, maxY - anchorBottom);
      const availableAbove = Math.max(0, anchorTop - minY);

      if (menuRect.height + gap > availableBelow && availableAbove > availableBelow) {
        top = anchorTop - menuRect.height - gap;
        placement = 'above';
      } else {
        top = anchorBottom + gap;
      }

      const maxTop = Math.max(minY, maxY - menuRect.height);
      top = Math.min(Math.max(top, minY), maxTop);

      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
      menu.dataset.placement = placement;
      menu.style.visibility = 'visible';
    });
  };

  const showMenu = anchorRect => {
    menu.style.display = 'flex';
    menu.dataset.open = 'true';
    positionMenu(anchorRect);
  };

  const updateMenuPosition = () => {
    if (menu.dataset.open !== 'true') return;
    positionMenu(addBtn.getBoundingClientRect());
  };

  const clonePresetData = data => {
    if (!data || typeof data !== 'object') return {};
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(data);
      }
    } catch (error) {
      console.error('Preset clone error (structuredClone):', error);
    }
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      console.error('Preset clone error (JSON):', error);
    }
    const shallow = Array.isArray(data) ? [...data] : { ...data };
    return shallow;
  };

  const createOptionButton = (label, data, { locked = false, isDm = false } = {}) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'btn-sm power-preset-menu__btn';
    optionBtn.textContent = label;
    if (isDm) optionBtn.dataset.dmEntry = 'true';
    if (locked) optionBtn.dataset.dmLock = 'true';
    optionBtn.addEventListener('click', () => {
      if (locked && !isDmSessionActive()) {
        hideMenu();
        toast('This power is locked by the DM.', 'error');
        return;
      }
      const card = createCard('power', clonePresetData(data));
      hideMenu();
      const opened = openPowerEditor(card, { isNew: true, targetList: list });
      if (!opened) {
        list.appendChild(card);
        pushHistory();
      }
      try { addBtn.focus(); } catch {}
    });
    return optionBtn;
  };

  const groupsContainer = document.createElement('div');
  groupsContainer.className = 'power-preset-menu__groups';

  const intensityOrder = new Map(POWER_INTENSITIES.map((name, index) => [name, index]));

  const renderPresets = () => {
    menu.innerHTML = '';
    groupsContainer.innerHTML = '';
    menu.appendChild(createOptionButton('Custom Power', {}));
    const combinedPresets = getCombinedPowerPresets();
    const groupedPresets = combinedPresets.reduce((acc, preset) => {
      if (!preset || typeof preset !== 'object') return acc;
      const data = preset.data || {};
      const labelParts = typeof preset.label === 'string' ? preset.label.split(':') : [];
      const styleLabel = (data.style || (labelParts.length > 1 ? labelParts[0].trim() : '') || 'General').trim();
      const effectLabel = (data.effectTag || data.secondaryTag || 'General').trim();
      const optionLabelBase = (data.name || (labelParts.length ? labelParts[labelParts.length - 1].trim() : preset.label) || 'Preset').trim();
      const optionLabel = preset.dmEntry && !/\(DM\)$/i.test(optionLabelBase)
        ? `${optionLabelBase} (DM)`
        : optionLabelBase;
      const styleKey = styleLabel || 'General';
      const effectKey = effectLabel || 'General';

      if (!acc.has(styleKey)) acc.set(styleKey, new Map());
      const effectMap = acc.get(styleKey);
      if (!effectMap.has(effectKey)) effectMap.set(effectKey, []);
      effectMap.get(effectKey).push({
        label: optionLabel,
        data,
        intensity: data.intensity || null,
        locked: !!preset.locked,
        dmEntry: !!preset.dmEntry,
      });
      return acc;
    }, new Map());

    const sortedGroups = Array.from(groupedPresets.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    menu.appendChild(groupsContainer);

    sortedGroups.forEach(([groupName, effectMap], index) => {
      const group = document.createElement('details');
      group.className = 'power-preset-menu__group';
      if (index === 0) {
        group.setAttribute('open', '');
      }
      const summary = document.createElement('summary');
      summary.className = 'power-preset-menu__group-title';
      summary.textContent = groupName;
      group.appendChild(summary);
      const subgroups = document.createElement('div');
      subgroups.className = 'power-preset-menu__subgroups';

      const sortedEffects = Array.from(effectMap.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      sortedEffects.forEach(([effectName, items], effectIndex) => {
        const subgroup = document.createElement('details');
        subgroup.className = 'power-preset-menu__subgroup';
        if (effectIndex === 0) {
          subgroup.setAttribute('open', '');
        }
        const subgroupSummary = document.createElement('summary');
        subgroupSummary.className = 'power-preset-menu__subgroup-title';

        const intensityLabels = Array.from(new Set(items.map(item => item.intensity).filter(Boolean)));
        intensityLabels.sort((a, b) => {
          const orderA = intensityOrder.has(a) ? intensityOrder.get(a) : Number.MAX_SAFE_INTEGER;
          const orderB = intensityOrder.has(b) ? intensityOrder.get(b) : Number.MAX_SAFE_INTEGER;
          return orderA - orderB || a.localeCompare(b, undefined, { sensitivity: 'base' });
        });
        const intensitySuffix = intensityLabels.length ? ` · ${intensityLabels.join(', ')}` : '';
        subgroupSummary.textContent = `${effectName}${intensitySuffix}`;
        subgroup.appendChild(subgroupSummary);

        const grid = document.createElement('div');
        grid.className = 'power-preset-menu__grid';
        items.sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' }));
        items.forEach(item => {
          grid.appendChild(createOptionButton(item.label, item.data, { locked: item.locked, isDm: item.dmEntry }));
        });
        subgroup.appendChild(grid);
        subgroups.appendChild(subgroup);
      });

      group.appendChild(subgroups);
      groupsContainer.appendChild(group);
    });
  };

  renderPresets();
  refreshPowerPresetMenu = renderPresets;

  addBtn.addEventListener('click', event => {
    event.preventDefault();
    if (menu.dataset.open === 'true') {
      hideMenu();
      return;
    }
    showMenu(addBtn.getBoundingClientRect());
  });

  document.addEventListener('click', event => {
    if (menu.dataset.open !== 'true') return;
    if ((addBtn && addBtn.contains(event.target)) || menu.contains(event.target)) return;
    hideMenu();
  });

  window.addEventListener('blur', hideMenu);
  window.addEventListener('resize', updateMenuPosition);
  window.addEventListener('scroll', () => {
    if (menu.dataset.open === 'true') hideMenu();
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateMenuPosition);
    window.visualViewport.addEventListener('scroll', updateMenuPosition, { passive: true });
  }
}

const ATTACK_ABILITY_OPTIONS = ABILS.map(a => ({ value: a, label: a.toUpperCase() }));

const CARD_CONFIG = {
  sig: {
    rows: [
      { class: 'inline', fields: [
        { f: 'name', placeholder: 'Signature Name' },
        { f: 'sp', placeholder: 'SP', style: 'max-width:100px' },
        { f: 'save', placeholder: 'Save', style: 'max-width:160px' },
        { f: 'special', placeholder: 'Special', style: 'max-width:200px' }
      ]},
      { tag: 'textarea', f: 'desc', placeholder: 'Effect / Visual Description', rows: 3 }
    ]
  },
  weapon: {
    rows: [
      { class: 'inline', fields: [
        { f: 'name', placeholder: 'Name' },
        { f: 'damage', placeholder: 'Damage', style: 'max-width:140px' },
        { f: 'range', placeholder: 'Range', style: 'max-width:160px' },
        { tag: 'select', f: 'attackAbility', label: 'Attack Ability', style: 'max-width:160px', options: ATTACK_ABILITY_OPTIONS, default: 'str' },
        { tag: 'checkbox', f: 'proficient', label: 'Proficient', style: 'gap:6px' }
      ]}
    ]
  },
  armor: {
    rows: [
      { class: 'inline', fields: [
        { f: 'name', placeholder: 'Name' },
        { tag: 'select', f: 'slot', style: 'max-width:140px', options: ['Body','Head','Shield','Misc'], default: 'Body' },
        { f: 'bonus', placeholder: 'Bonus', style: 'max-width:120px', type: 'number', inputmode: 'numeric', default: 0 },
        { tag: 'checkbox', f: 'equipped', label: 'Equipped', style: 'gap:6px' }
      ]}
    ],
    onChange: updateDerived,
    onDelete: updateDerived
  },
  item: {
    rows: [
      { class: 'inline', fields: [
        { f: 'name', placeholder: 'Name' },
        { f: 'qty', placeholder: 'Qty', style: 'max-width:100px', type: 'number', inputmode: 'numeric', default: 1 },
        { f: 'notes', placeholder: 'Notes' }
      ]}
    ]
  }
};

const GEAR_CARD_KINDS = new Set(['weapon', 'armor', 'item']);

function isGearKind(kind) {
  return GEAR_CARD_KINDS.has(kind);
}

function getCombinedPowerPresets() {
  const base = Array.isArray(POWER_PRESETS) ? POWER_PRESETS : [];
  const extras = Array.isArray(dmPowerPresets) ? dmPowerPresets : [];
  return base.concat(extras);
}

function ensureGearPriceDisplay(card) {
  if (!card || typeof card.querySelector !== 'function') return null;
  let container = card.querySelector('.gear-card-price');
  if (!container) {
    container = document.createElement('div');
    container.className = 'gear-card-price';
    const pill = document.createElement('span');
    pill.className = 'pill pill-sm gear-card-price-pill';
    pill.textContent = '';
    container.appendChild(pill);
    container.hidden = true;
    card.insertBefore(container, card.firstChild || null);
  }
  const pill = container.querySelector('.gear-card-price-pill');
  return { container, pill };
}

function updateGearPriceDisplay(card) {
  if (!card || !isGearKind(card?.dataset?.kind || '')) return;
  const refs = ensureGearPriceDisplay(card);
  if (!refs) return;
  const { container, pill } = refs;
  const customDisplay = typeof card.dataset.priceDisplay === 'string'
    ? card.dataset.priceDisplay.trim()
    : '';
  const priceValue = Number(card.dataset.price);
  const hasNumericPrice = Number.isFinite(priceValue) && priceValue > 0;
  const fallback = hasNumericPrice ? formatPrice(priceValue) : '';
  const text = customDisplay || (fallback ? `Cost: ${fallback}` : '');
  if (text) {
    pill.textContent = text;
    container.hidden = false;
  } else {
    pill.textContent = '';
    container.hidden = true;
  }
}

function applyGearPrice(card, { price = null, priceDisplay = '' } = {}) {
  if (!card || !isGearKind(card?.dataset?.kind || '')) return;
  const numericPrice = Number(price);
  if (Number.isFinite(numericPrice) && numericPrice > 0) {
    card.dataset.price = String(numericPrice);
  } else {
    delete card.dataset.price;
  }
  let displayText = typeof priceDisplay === 'string' ? priceDisplay.trim() : '';
  if (!displayText && card.dataset.price) {
    const fallback = formatPrice(Number(card.dataset.price));
    displayText = fallback || '';
  }
  if (displayText) {
    card.dataset.priceDisplay = displayText;
  } else {
    delete card.dataset.priceDisplay;
  }
  updateGearPriceDisplay(card);
  updateCreditsGearSummary();
}

const pendingManualCards = { weapon: null, armor: null, item: null };

function inferWeaponAttackAbility(pref = {}) {
  const rangeValue = typeof pref.range === 'string' ? pref.range.trim().toLowerCase() : '';
  if (!rangeValue) return 'str';
  if (/(^|\b)(melee|reach|touch)\b/.test(rangeValue)) return 'str';
  if (rangeValue.includes('thrown')) return 'str';
  return 'dex';
}

function isCardEmpty(card){
  if (!card) return true;
  const nameField = qs("[data-f='name']", card);
  if (nameField && nameField.value && nameField.value.trim()) return false;
  return true;
}

function clearPendingManualCard(kind, { force = false } = {}){
  const card = pendingManualCards[kind];
  if (!card) return false;
  if (force || isCardEmpty(card)) {
    if (card.isConnected) {
      card.remove();
      if (kind === 'armor') updateDerived();
      if (isGearKind(kind)) updateCreditsGearSummary();
    }
    pendingManualCards[kind] = null;
    return true;
  }
  return false;
}

function setPendingManualCard(kind, card){
  clearPendingManualCard(kind);
  pendingManualCards[kind] = card;
  const delBtn = qs("[data-act='del']", card);
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (pendingManualCards[kind] === card) pendingManualCards[kind] = null;
    }, { once: true });
  }
}

function cleanupPendingManualCards(){
  let removed = false;
  ['weapon', 'armor', 'item'].forEach(kind => {
    removed = clearPendingManualCard(kind) || removed;
  });
  return removed;
}

function populateCardFromData(card, data){
  if (!card || !data) return;
  Object.entries(data).forEach(([key, value]) => {
    const field = qs(`[data-f='${key}']`, card);
    if (!field) return;
    if (field.type === 'checkbox') {
      field.checked = !!value;
    } else {
      field.value = value ?? '';
    }
  });
}

function createCard(kind, pref = {}) {
  if (kind === 'power' || kind === 'sig') {
    return createPowerCard(pref, { signature: kind === 'sig' });
  }
  pref = { ...pref };
  let attackAbilityWasProvided = false;
  let providedAttackAbilityRaw;
  if (kind === 'weapon') {
    attackAbilityWasProvided = Object.prototype.hasOwnProperty.call(pref, 'attackAbility');
    providedAttackAbilityRaw = pref.attackAbility;
    if (pref.attackAbility) {
      pref.attackAbility = String(pref.attackAbility).toLowerCase();
    } else {
      pref.attackAbility = inferWeaponAttackAbility(pref);
    }
    if (pref.proficient === undefined) {
      pref.proficient = true;
    } else {
      pref.proficient = !!pref.proficient;
    }
  }
  const cfg = CARD_CONFIG[kind];
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.kind = kind;
  if (!cfg) return card;
  (cfg.rows || []).forEach(row => {
    if (row.fields) {
      const wrap = document.createElement('div');
      if (row.class) wrap.className = row.class;
      row.fields.forEach(f => {
        if (f.tag === 'select') {
          const sel = document.createElement('select');
          sel.dataset.f = f.f;
          (f.options || []).forEach(opt => {
            if (opt && typeof opt === 'object') {
              const option = new Option(
                opt.label ?? opt.value ?? '',
                opt.value ?? opt.label ?? ''
              );
              sel.add(option);
            } else {
              sel.add(new Option(opt, opt));
            }
          });
          if (f.style) sel.style.cssText = f.style;
          const selectedValue = pref[f.f];
          sel.value = selectedValue ?? f.default ?? '';
          if (f.label) {
            const label = document.createElement('label');
            label.className = 'inline';
            label.append(document.createTextNode(`${f.label} `));
            label.appendChild(sel);
            wrap.appendChild(label);
          } else {
            wrap.appendChild(sel);
          }
        } else if (f.tag === 'checkbox') {
          const label = document.createElement('label');
          label.className = 'inline';
          if (f.style) label.style.cssText = f.style;
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.dataset.f = f.f;
          chk.checked = !!pref[f.f];
          if (kind === 'armor') {
            chk.addEventListener('change', () => {
              const name = qs("[data-f='name']", card)?.value || 'Armor';
              logAction(`Armor ${chk.checked ? 'equipped' : 'unequipped'}: ${name}`);
            });
          }
          label.appendChild(chk);
          label.append(f.label || '');
          wrap.appendChild(label);
        } else {
          const inp = document.createElement('input');
          inp.dataset.f = f.f;
          inp.placeholder = f.placeholder || '';
          if (f.type) inp.type = f.type;
          if (f.inputmode) inp.setAttribute('inputmode', f.inputmode);
          if (f.style) inp.style.cssText = f.style;
          inp.value = pref[f.f] ?? f.default ?? '';
          wrap.appendChild(inp);
        }
      });
      card.appendChild(wrap);
    } else if (row.tag === 'textarea') {
      const ta = document.createElement('textarea');
      ta.dataset.f = row.f;
      ta.rows = row.rows || 3;
      ta.placeholder = row.placeholder || '';
      ta.value = pref[row.f] || '';
      card.appendChild(ta);
    }
  });
  const delWrap = document.createElement('div');
  delWrap.className = 'inline';
  if (kind === 'weapon') {
    const rangeField = qs("[data-f='range']", card);
    const abilityField = qs("[data-f='attackAbility']", card);
    const normalizedProvidedAbility = providedAttackAbilityRaw
      ? String(providedAttackAbilityRaw).trim().toLowerCase()
      : '';
    const inferredAbilityFromRange = inferWeaponAttackAbility({ range: pref.range });
    const abilityShouldAutoSync = !attackAbilityWasProvided
      || !normalizedProvidedAbility
      || normalizedProvidedAbility === inferredAbilityFromRange;
    if (abilityField) {
      abilityField.dataset.autoSync = abilityShouldAutoSync ? 'true' : 'false';
      const markManualAbilitySelection = () => {
        abilityField.dataset.autoSync = 'false';
      };
      abilityField.addEventListener('change', markManualAbilitySelection);
      abilityField.addEventListener('input', markManualAbilitySelection);
    }
    if (rangeField && abilityField) {
      const syncAbilityToRange = () => {
        if (abilityField.dataset.autoSync !== 'true') return;
        const inferred = inferWeaponAttackAbility({ range: rangeField.value });
        if (!inferred) return;
        if (abilityField.value !== inferred) {
          abilityField.value = inferred;
        }
      };
      rangeField.addEventListener('input', syncAbilityToRange);
      rangeField.addEventListener('change', syncAbilityToRange);
    }
  }
  if (kind === 'weapon' || kind === 'sig' || kind === 'power') {
    const hitBtn = document.createElement('button');
    hitBtn.className = 'btn-sm';
    hitBtn.textContent = 'Roll to Hit';
    const out = document.createElement('span');
    out.className = 'pill result';
    out.dataset.placeholder = '000';
    hitBtn.addEventListener('click', () => {
      const pb = num(elProfBonus.value)||2;
      const rangeVal = qs("[data-f='range']", card)?.value || '';
      const abilityField = qs("[data-f='attackAbility']", card);
      const selectedAbility = (abilityField?.value || '').toLowerCase();
      const resolvedAbilityKey = selectedAbility || inferWeaponAttackAbility({ range: rangeVal });
      const abilityLabel = resolvedAbilityKey ? resolvedAbilityKey.toUpperCase() : 'STR';
      const abilityInput = resolvedAbilityKey ? $(resolvedAbilityKey) : null;
      const abilityMod = abilityInput ? mod(abilityInput.value) : 0;
      const proficientField = qs("[data-f='proficient']", card);
      const isProficient = proficientField ? !!proficientField.checked : true;
      const profBonus = isProficient ? pb : 0;
      const baseBonuses = [
        { label: `${abilityLabel} mod`, value: abilityMod, includeZero: true },
      ];
      if (profBonus) baseBonuses.push({ label: 'Prof', value: profBonus });
      const nameField = qs("[data-f='name']", card);
      const name = nameField?.value || (kind === 'sig' ? 'Signature Move' : (kind === 'power' ? 'Power' : 'Attack'));
      logAction(`${kind === 'weapon' ? 'Weapon' : kind === 'power' ? 'Power' : 'Signature move'} used: ${name}`);
      const opts = { type: 'attack', ability: abilityLabel, baseBonuses };
      if (kind === 'sig' && isActiveHankCharacter() && isHammerspaceName(name)) {
        opts.sides = HAMMERSPACE_DIE_SIDES;
        opts.onRoll = ({ roll }) => {
          if (Number.isInteger(roll)) {
            showHammerspaceResult(roll);
          }
        };
      }
      rollWithBonus(`${name} attack roll`, abilityMod + profBonus, out, opts);
    });
    delWrap.appendChild(hitBtn);
    delWrap.appendChild(out);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-sm';
  delBtn.dataset.act = 'del';
  applyDeleteIcon(delBtn);
  delBtn.addEventListener('click', () => {
    if (kind === 'sig' && card.dataset.hammerspaceLock === 'true') {
      if (typeof toast === 'function') {
        toast(`${HAMMERSPACE_POWER_NAME} cannot be deleted`, 'error');
      }
      return;
    }
    const name = qs("[data-f='name']", card)?.value || kind;
    logAction(`${kind.charAt(0).toUpperCase()+kind.slice(1)} removed: ${name}`);
    card.remove();
    if (cfg.onDelete) cfg.onDelete();
    if (isGearKind(kind)) updateCreditsGearSummary();
    pushHistory();
  });
  delWrap.appendChild(delBtn);
  card.appendChild(delWrap);
  if (isGearKind(kind)) {
    ensureGearPriceDisplay(card);
    updateGearPriceDisplay(card);
  }
  if (cfg.onChange) {
    qsa('input,select', card).forEach(el => el.addEventListener('input', cfg.onChange));
  }
  if (kind === 'sig') {
    const nameField = qs("[data-f='name']", card);
    if (nameField) {
      nameField.addEventListener('input', () => markHammerspaceState(card));
    }
    markHammerspaceState(card);
  }
  if (mode === 'view') applyViewLockState(card);
  return card;
}

$('add-sig').addEventListener('click', event => {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  const list = $('sigs');
  if (!list) return;
  const card = createCard('sig');
  const opened = openPowerEditor(card, { isNew: true, targetList: list });
  if (!opened) {
    list.appendChild(card);
    pushHistory();
  }
});

/* ========= Gear ========= */
$('add-weapon').addEventListener('click', () => {
  const list = $('weapons');
  if (!list) return;
  const card = createCard('weapon');
  list.appendChild(card);
  setPendingManualCard('weapon', card);
  pushHistory();
  openCatalogWithFilters({ type: 'Weapon', style: '', tier: '' });
});
$('add-armor').addEventListener('click', () => {
  const list = $('armors');
  if (!list) return;
  const card = createCard('armor');
  list.appendChild(card);
  setPendingManualCard('armor', card);
  pushHistory();
  openCatalogWithFilters({ type: 'Armor', style: '', tier: '' });
});
$('add-item').addEventListener('click', () => {
  const list = $('items');
  if (!list) return;
  const card = createCard('item');
  list.appendChild(card);
  setPendingManualCard('item', card);
  pushHistory();
  openCatalogWithFilters({ type: 'Item', style: '', tier: '' });
});

/* ========= Drag & Drop ========= */
function enableDragReorder(id){
  const list = $(id);
  if(!list) return;
  list.addEventListener('dragstart', e=>{
    const card = e.target.closest('.card');
    if(!card) return;
    list._drag = card;
    card.classList.add('dragging');
  });
  list.addEventListener('dragend', ()=>{
    if (list._drag && list._drag.classList) {
      list._drag.classList.remove('dragging');
    }
    list._drag = null;
  });
  list.addEventListener('dragover', e=>{
    e.preventDefault();
    const card = list._drag;
    const tgt = e.target.closest('.card');
    if(!card || !tgt || tgt===card) return;
    const rect = tgt.getBoundingClientRect();
    const next = (e.clientY - rect.top) / rect.height > 0.5;
    list.insertBefore(card, next? tgt.nextSibling : tgt);
  });
  list.addEventListener('drop', e=>{ e.preventDefault(); pushHistory(); });
}
['powers','sigs','weapons','armors','items'].forEach(enableDragReorder);

function buildCardInfo(entry){
  if (!entry) return null;
  const rawType = (entry.rawType || entry.type || '').trim();
  const typeKey = rawType.toLowerCase();
  const priceNote = formatPriceNote(entry);
  const name = entry.name || 'Item';
  if (typeKey === 'weapon') {
    const { damage, extras, range } = extractWeaponDetails(entry.perk);
    const damageParts = [];
    if (damage) damageParts.push(`Damage ${damage}`);
    extras.filter(Boolean).forEach(part => damageParts.push(part));
    if (entry.tier) damageParts.push(`Tier ${entry.tier}`);
    if (priceNote) damageParts.push(priceNote);
    if (entry.use) damageParts.push(`Use: ${entry.use}`);
    if (entry.attunement) damageParts.push(`Attunement: ${entry.attunement}`);
    if (entry.source) damageParts.push(entry.source);
    return {
      kind: 'weapon',
      listId: 'weapons',
      data: {
        name,
        damage: damageParts.join(' — '),
        ...(range ? { range } : {})
      }
    };
  }
  if (typeKey === 'armor' || typeKey === 'shield') {
    const { bonus: parsedBonus, details } = extractArmorDetails(entry.perk);
    const nameParts = [];
    if (details.length) nameParts.push(details.join(' — '));
    if (entry.tier) nameParts.push(`Tier ${entry.tier}`);
    if (priceNote) nameParts.push(priceNote);
    if (entry.use) nameParts.push(`Use: ${entry.use}`);
    if (entry.attunement) nameParts.push(`Attunement: ${entry.attunement}`);
    if (entry.source) nameParts.push(entry.source);
    const slotBase = typeKey === 'shield' ? 'Shield' : 'Body';
    const slot = (entry.slot || slotBase || '').trim() || slotBase;
    const bonusValue = Number.isFinite(entry.bonus) ? entry.bonus : parsedBonus;
    return {
      kind: 'armor',
      listId: 'armors',
      data: {
        name: nameParts.length ? `${name} — ${nameParts.join(' — ')}` : name,
        slot,
        bonus: Number.isFinite(bonusValue) ? bonusValue : 0,
        equipped: true
      }
    };
  }
  const notes = buildItemNotes(entry);
  const qty = Number.isFinite(entry.qty) && entry.qty > 0 ? entry.qty : 1;
  return {
    kind: 'item',
    listId: 'items',
    data: {
      name,
      notes,
      qty
    }
  };
}

function addEntryToSheet(entry, { toastMessage = 'Added to sheet', cardInfoOverride = null } = {}){
  if (entry?.dmLock && !isDmSessionActive()) {
    toast('This entry is locked by the DM.', 'error');
    return null;
  }
  const info = cardInfoOverride || buildCardInfo(entry);
  if (!info) return null;
  const list = $(info.listId);
  if (!list) return null;
  let card = null;
  const pending = pendingManualCards[info.kind];
  if (pending && pending.isConnected) {
    card = pending;
    pendingManualCards[info.kind] = null;
    populateCardFromData(card, info.data);
  } else {
    card = createCard(info.kind, info.data);
    list.appendChild(card);
  }
  const priceValue = getEntryPriceValue(entry);
  const priceDisplay = getPriceDisplay(entry);
  const hasPrice = Number.isFinite(priceValue) && priceValue > 0;
  applyGearPrice(card, {
    price: hasPrice ? priceValue : null,
    priceDisplay,
  });
  const formattedPrice = hasPrice ? formatPrice(priceValue) : '';
  const isManualCard = !!(pending && pending.isConnected);
  const entryName = info?.data?.name || entry?.name || 'item';
  let creditsDeducted = false;
  if (hasPrice && !isManualCard && typeof setCredits === 'function' && elCredits) {
    let shouldDeduct = false;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmName = entryName || 'this item';
      shouldDeduct = window.confirm(`Subtract ${formattedPrice} from Credits for ${confirmName}?`);
    }
    if (shouldDeduct) {
      const available = num(elCredits.value) || 0;
      if (available < priceValue) {
        notifyInsufficientCredits(`You don't have enough Credits to spend ${formattedPrice}.`);
      } else {
        const ledgerReason = formattedPrice
          ? `Purchased ${entryName} for ${formattedPrice}`
          : `Purchased ${entryName}`;
        setCredits(available - priceValue, { reason: ledgerReason });
        creditsDeducted = true;
        try {
          logAction(`Credits spent automatically: ${formattedPrice} on ${entryName}.`);
        } catch {}
      }
    }
  }
  updateDerived();
  pushHistory();
  if (toastMessage) {
    const message = creditsDeducted
      ? `${toastMessage} (${formattedPrice} deducted automatically)`
      : toastMessage;
    toast(message, 'success');
  }
  return card;
}

/* ========= Gear Catalog (CatalystCore_Master_Book integration) ========= */
const CATALOG_JSON_SRC = './data/gear-catalog.json';
const CATALOG_MASTER_SRC = './CatalystCore_Master_Book.csv';
const CATALOG_PRICE_SRC = './CatalystCore_Items_Prices.csv';
let catalogData = null;
let catalogPromise = null;
let catalogPriceEntries = [];
let catalogPriceIndex = new Map();
let catalogError = null;
let catalogFiltersInitialized = false;

const styleSel = $('catalog-filter-style');
const typeSel = $('catalog-filter-type');
const tierSel = $('catalog-filter-rarity');
const catalogCustomBtn = $('catalog-add-custom');
const catalogListEl = $('catalog-list');
let pendingCatalogFilters = null;
const CUSTOM_CATALOG_KEY = 'custom-catalog';
let customCatalogEntries = loadCustomCatalogEntries();
const initialDmCatalogState = getDmCatalogState();
let dmCatalogEntries = Array.isArray(initialDmCatalogState.catalogEntries)
  ? initialDmCatalogState.catalogEntries.slice()
  : [];
let dmPowerPresets = Array.isArray(initialDmCatalogState.powerPresets)
  ? initialDmCatalogState.powerPresets.slice()
  : [];
let refreshPowerPresetMenu = () => {};
rebuildCatalogPriceIndex();
const customTypeModal = $('modal-custom-item');
const customTypeButtons = customTypeModal ? qsa('[data-custom-type]', customTypeModal) : [];
const requestCatalogRender = debounce(() => renderCatalog(), 100);
catalogRenderScheduler = () => requestCatalogRender();
subscribeDmCatalog(state => {
  dmCatalogEntries = Array.isArray(state.catalogEntries) ? state.catalogEntries.slice() : [];
  dmPowerPresets = Array.isArray(state.powerPresets) ? state.powerPresets.slice() : [];
  rebuildCatalogPriceIndex();
  rebuildCatalogFilterOptions();
  requestCatalogRender();
  try { refreshPowerPresetMenu(); } catch {}
});
setupPowerPresetMenu();
const catalogOverlay = $('modal-catalog');
if (catalogOverlay) {
  catalogOverlay.addEventListener('transitionend', e => {
    if (e.target === catalogOverlay && catalogOverlay.classList.contains('hidden')) {
      if (cleanupPendingManualCards()) {
        pushHistory();
      }
    }
  });
}

function rebuildCatalogPriceIndex(baseEntries = catalogPriceEntries){
  const index = buildPriceIndex(baseEntries);
  if (Array.isArray(customCatalogEntries)) {
    customCatalogEntries.forEach(entry => {
      if (!entry || !entry.name) return;
      const key = entry.name.trim().toLowerCase();
      if (!key) return;
      let priceText = (entry.priceText || '').trim();
      let priceValue = Number.isFinite(entry.price) ? entry.price : null;
      if (!priceText && Number.isFinite(priceValue) && priceValue > 0) {
        priceText = `₡${priceValue.toLocaleString('en-US')}`;
      }
      if (!priceText && !Number.isFinite(priceValue)) return;
      if ((!Number.isFinite(priceValue) || priceValue <= 0) && priceText) {
        const extracted = extractPriceValue(priceText);
        priceValue = Number.isFinite(extracted) && extracted > 0 ? extracted : null;
      }
      if (!index.has(key)) {
        index.set(key, {
          name: entry.name,
          price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
          priceText
        });
      }
    });
  }
  if (Array.isArray(dmCatalogEntries)) {
    dmCatalogEntries.forEach(entry => {
      if (!entry || !entry.name) return;
      const key = entry.name.trim().toLowerCase();
      if (!key || index.has(key)) return;
      let priceText = (entry.priceText || '').trim();
      let priceValue = Number.isFinite(entry.price) ? entry.price : null;
      if (!priceText && Number.isFinite(priceValue) && priceValue > 0) {
        priceText = `₡${priceValue.toLocaleString('en-US')}`;
      }
      if (!priceText && !Number.isFinite(priceValue)) return;
      if ((!Number.isFinite(priceValue) || priceValue <= 0) && priceText) {
        const extracted = extractPriceValue(priceText);
        priceValue = Number.isFinite(extracted) && extracted > 0 ? extracted : null;
      }
      if (!index.has(key)) {
        index.set(key, {
          name: entry.name,
          price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
          priceText
        });
      }
    });
  }
  catalogPriceIndex = index;
  return catalogPriceIndex;
}

function derivePriceEntriesFromCatalog(entries = []){
  return entries
    .map(entry => {
      if (!entry || !entry.name) return null;
      const priceText = (entry.priceText || entry.priceRaw || '').trim();
      const numericPrice = Number.isFinite(entry.price) && entry.price > 0 ? entry.price : null;
      if (!priceText && !Number.isFinite(numericPrice)) {
        return null;
      }
      return {
        name: entry.name,
        price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : null,
        priceText,
      };
    })
    .filter(Boolean);
}

function escapeHtml(str){
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function formatPrice(value){
  if (!Number.isFinite(value) || value <= 0) return '';
  return `₡${value.toLocaleString('en-US')}`;
}

function getPriceDisplay(entry){
  if (!entry) return '';
  const formatted = formatPrice(entry.price);
  if (formatted) return formatted;
  const raw = (entry.priceText || entry.priceRaw || '').trim();
  if (!raw) return '';
  return raw;
}

function formatPriceNote(entry){
  const display = getPriceDisplay(entry);
  if (!display) return '';
  return display.startsWith('₡') ? display : `Price: ${display}`;
}

function getEntryPriceValue(entry){
  if (!entry) return null;
  if (Number.isFinite(entry.price) && entry.price > 0) return entry.price;
  const raw = (entry.priceText || entry.priceRaw || '').trim();
  if (!raw) return null;
  const numeric = extractPriceValue(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function tryPurchaseEntry(entry){
  const cost = getEntryPriceValue(entry);
  if (!Number.isFinite(cost) || cost <= 0) return true;
  if (!elCredits) return true;
  const available = num(elCredits.value) || 0;
  if (available < cost) {
    notifyInsufficientCredits('You do not have enough Credits to purchase this item, come back when you have enough Credits.');
    return false;
  }
  return true;
}

function formatDamageText(damage){
  if (!damage) return '';
  return damage.replace(/(\dd\d)(\dd\d)/ig, '$1 / $2');
}

function extractArmorDetails(perk){
  if (!perk) return { bonus: 0, details: [] };
  const segments = perk.split(/;|\./).map(p => p.trim()).filter(Boolean);
  let bonus = 0;
  const details = [];
  segments.forEach((seg, idx) => {
    const match = seg.match(/\+(\d+)\s*TC/i);
    if (match && bonus === 0) {
      bonus = Number(match[1]) || 0;
      const remainder = seg.replace(/\+(\d+)\s*TC/i, '').trim();
      if (remainder) details.push(remainder.replace(/^[-–—]/, '').trim());
    } else if (idx > 0 || !match) {
      details.push(seg);
    }
  });
  return { bonus, details };
}

function extractWeaponDetails(perk){
  if (!perk) return { damage: '', extras: [], range: '' };
  const segments = perk
    .split(/;|\./)
    .map(p => p.trim().replace(/^[-–—]\s*/, ''))
    .filter(Boolean);
  let damage = '';
  const extras = [];
  const rangeParts = [];
  const isRangeSegment = seg => {
    const lower = seg.toLowerCase();
    if (!lower) return false;
    if (/(^|\b)(melee|reach|touch|self|thrown|aura)\b/.test(lower)) return true;
    if (/\b(?:narrative)\b/.test(lower) && lower.includes('range')) return true;
    const hasDistance = /\b\d+\s*(?:ft|feet|yd|yard|m|meter|meters|mile|miles)\b/.test(lower);
    if (hasDistance && /\b(range|line|cone|radius|sphere|burst|spray|beam|emanation|cylinder)\b/.test(lower)) {
      return true;
    }
    if (hasDistance && lower.includes('range')) return true;
    return false;
  };
  segments.forEach((seg, idx) => {
    if (!seg) return;
    if (idx === 0 && /damage/i.test(seg)) {
      const match = seg.match(/^(?:Damage\s*)?(.*)$/i);
      damage = match && match[1] ? match[1].trim() : seg.trim();
      return;
    }
    if (isRangeSegment(seg)) {
      rangeParts.push(seg);
      return;
    }
    if (idx === 0 && !damage) {
      damage = seg.trim();
      return;
    }
    extras.push(seg);
  });
  if (damage.toLowerCase().startsWith('damage')) {
    damage = damage.slice(6).trim();
  }
  return { damage: formatDamageText(damage), extras, range: rangeParts.join(' — ') };
}

function buildItemNotes(entry){
  const notes = [];
  if (entry.tier) notes.push(`Tier ${entry.tier}`);
  const priceText = formatPriceNote(entry);
  if (priceText) notes.push(priceText);
  if (entry.perk) notes.push(entry.perk);
  if (entry.description) notes.push(entry.description);
  if (entry.use) notes.push(`Use: ${entry.use}`);
  if (entry.attunement) notes.push(`Attunement: ${entry.attunement}`);
  if (entry.source) notes.push(entry.source);
  return notes.join(' — ');
}

const CUSTOM_ITEM_TYPES = {
  weapon: { displayType: 'Weapon', cardKind: 'weapon', listId: 'weapons' },
  armor: { displayType: 'Armor', cardKind: 'armor', listId: 'armors' },
  shield: { displayType: 'Shield', cardKind: 'armor', listId: 'armors' },
  utility: { displayType: 'Utility', cardKind: 'item', listId: 'items' },
  item: { displayType: 'Item', cardKind: 'item', listId: 'items' }
};

function inferCardKind(type){
  const key = (type || '').toLowerCase();
  if (key === 'weapon') return 'weapon';
  if (key === 'armor' || key === 'shield') return 'armor';
  return 'item';
}

function refreshCustomEntrySearch(entry){
  if (!entry) return;
  entry.search = [
    entry.section,
    entry.type,
    entry.name,
    entry.tier,
    entry.priceText || '',
    entry.perk,
    entry.description,
    entry.use,
    entry.attunement,
    entry.source,
    ...(Array.isArray(entry.classifications) ? entry.classifications : []),
    ...(Array.isArray(entry.tierRestrictions) ? entry.tierRestrictions.map(r => r && (r.raw || r.normalized) || '') : []),
    ...(Array.isArray(entry.prerequisites) ? entry.prerequisites.map(r => r && (r.raw || '')).filter(Boolean) : [])
  ].map(part => (part || '').toLowerCase()).join(' ');
}

function normalizeCustomCatalogEntry(raw = {}){
  const type = raw.type || raw.rawType || 'Item';
  const entry = {
    customId: raw.customId || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: raw.section || 'Custom Gear',
    type,
    rawType: raw.rawType || type,
    name: raw.name || '',
    tier: raw.tier || '',
    price: Number.isFinite(raw.price) ? raw.price : null,
    priceText: raw.priceText || '',
    perk: raw.perk || '',
    description: raw.description || '',
    use: raw.use || '',
    attunement: raw.attunement || '',
    source: raw.source || 'Custom Entry',
    cardKind: raw.cardKind || inferCardKind(type),
    slot: raw.slot || (type === 'Shield' ? 'Shield' : ''),
    bonus: Number.isFinite(raw.bonus) ? raw.bonus : 0,
    qty: Number.isFinite(raw.qty) && raw.qty > 0 ? raw.qty : 1,
    hidden: !(raw.name && String(raw.name).trim()),
    classifications: [],
    tierRestrictions: [],
    prerequisites: []
  };
  refreshCustomEntrySearch(entry);
  return entry;
}

function loadCustomCatalogEntries(){
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCustomCatalogEntry);
  } catch (err) {
    console.error('Failed to load custom catalog entries', err);
    return [];
  }
}

function getVisibleCustomCatalogEntries(){
  return customCatalogEntries.filter(entry => !entry.hidden);
}

function getAllCatalogEntries(){
  const base = Array.isArray(catalogData) ? catalogData : [];
  return base
    .concat(getVisibleCustomCatalogEntries())
    .concat(Array.isArray(dmCatalogEntries) ? dmCatalogEntries : []);
}

function saveCustomCatalogEntries(){
  if (typeof localStorage !== 'undefined') {
    try {
      const toSave = customCatalogEntries
        .filter(entry => !entry.hidden && entry.name && entry.name.trim())
        .map(entry => ({
          customId: entry.customId,
          section: entry.section,
          type: entry.type,
          rawType: entry.rawType,
          name: entry.name,
          tier: entry.tier,
          price: entry.price,
          priceText: entry.priceText,
          perk: entry.perk,
          description: entry.description,
          use: entry.use,
          attunement: entry.attunement,
          source: entry.source,
          search: entry.search,
          cardKind: entry.cardKind,
          slot: entry.slot,
          bonus: entry.bonus,
          qty: entry.qty
        }));
      localStorage.setItem(CUSTOM_CATALOG_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error('Failed to save custom catalog entries', err);
    }
  }
  rebuildCatalogPriceIndex();
}

function removeCustomCatalogEntry(customId){
  const idx = customCatalogEntries.findIndex(entry => entry.customId === customId);
  if (idx >= 0) {
    customCatalogEntries.splice(idx, 1);
    saveCustomCatalogEntries();
    rebuildCatalogFilterOptions();
    requestCatalogRender();
  }
}

function createCustomCatalogEntry(config){
  const entry = normalizeCustomCatalogEntry({
    customId: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: 'Custom Gear',
    type: config.displayType,
    rawType: config.displayType,
    cardKind: config.cardKind,
    slot: config.displayType === 'Shield' ? 'Shield' : ''
  });
  entry.hidden = true;
  refreshCustomEntrySearch(entry);
  return entry;
}

function updateCustomCatalogEntryFromCard(entry, card){
  if (!entry || !card) return;
  const getVal = field => {
    const el = qs(`[data-f='${field}']`, card);
    if (!el) return '';
    if (el.type === 'number') return el.value || '';
    return el.value || '';
  };
  const name = getVal('name').trim();
  const wasHidden = entry.hidden;
  entry.name = name;
  if (entry.cardKind === 'weapon') {
    const damage = getVal('damage').trim();
    const range = getVal('range').trim();
    entry.perk = damage ? `Damage ${damage}` : '';
    entry.description = '';
    entry.use = range ? `Range ${range}` : '';
  } else if (entry.cardKind === 'armor') {
    const slotValue = getVal('slot') || (entry.type === 'Shield' ? 'Shield' : 'Body');
    const bonusValue = Number(getVal('bonus'));
    entry.slot = slotValue;
    entry.bonus = Number.isFinite(bonusValue) ? bonusValue : 0;
    entry.perk = entry.bonus ? `${entry.bonus >= 0 ? '+' : ''}${entry.bonus} TC` : '';
    entry.description = '';
    entry.use = '';
  } else {
    const qtyValue = Number(getVal('qty'));
    const notes = getVal('notes').trim();
    entry.qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;
    entry.description = notes;
    entry.perk = '';
    entry.use = '';
  }
  entry.tier = '';
  entry.attunement = '';
  entry.source = 'Custom Entry';
  entry.hidden = !entry.name;
  refreshCustomEntrySearch(entry);
  saveCustomCatalogEntries();
  if (wasHidden !== entry.hidden) {
    rebuildCatalogFilterOptions();
  }
  requestCatalogRender();
}

function attachCustomEntryListeners(entry, card){
  const update = debounce(() => updateCustomCatalogEntryFromCard(entry, card), 200);
  qsa('input,select,textarea', card).forEach(el => {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });
  const delBtn = qs("[data-act='del']", card);
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      removeCustomCatalogEntry(entry.customId);
    });
  }
  updateCustomCatalogEntryFromCard(entry, card);
}

if (customCatalogEntries.length) {
  rebuildCatalogFilterOptions();
  requestCatalogRender();
}

function ensureCatalogFilters(data){
  if (catalogFiltersInitialized) return;
  catalogFiltersInitialized = true;
  if (styleSel) {
    styleSel.innerHTML = '';
    styleSel.add(new Option('All Sections', ''));
    [...new Set(data.map(r => r.section).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .forEach(section => styleSel.add(new Option(section, section)));
    styleSel.value = '';
  }
  if (typeSel) {
    typeSel.innerHTML = '';
    typeSel.add(new Option('All Types', ''));
    [...new Set(data.map(r => r.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .forEach(type => typeSel.add(new Option(type, type)));
    typeSel.value = '';
  }
  if (tierSel) {
    tierSel.innerHTML = '';
    tierSel.add(new Option('All Tiers', ''));
    [...new Set(data.map(r => r.tier).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .forEach(tier => tierSel.add(new Option(tier, tier)));
    tierSel.value = '';
  }
}

export {
  tierRank,
  sortCatalogRows,
  extractPriceValue,
  resolveRollBonus,
  rollBonusRegistry,
  buildCardInfo,
  extractWeaponDetails,
  addEntryToSheet
};

function setCatalogFilters(filters = {}){
  if (styleSel && Object.prototype.hasOwnProperty.call(filters, 'style')) {
    styleSel.value = filters.style ?? '';
  }
  if (typeSel && Object.prototype.hasOwnProperty.call(filters, 'type')) {
    typeSel.value = filters.type ?? '';
  }
  if (tierSel && Object.prototype.hasOwnProperty.call(filters, 'tier')) {
    tierSel.value = filters.tier ?? '';
  }
}

function getCatalogFilters(){
  return {
    style: styleSel ? styleSel.value : '',
    type: typeSel ? typeSel.value : '',
    tier: tierSel ? tierSel.value : ''
  };
}

function applyPendingCatalogFilters(){
  if (!pendingCatalogFilters) return;
  setCatalogFilters(pendingCatalogFilters);
  pendingCatalogFilters = null;
}

function rebuildCatalogFilterOptions(){
  const current = getCatalogFilters();
  catalogFiltersInitialized = false;
  ensureCatalogFilters(getAllCatalogEntries());
  setCatalogFilters(current);
}

function getPlayerCatalogState(){
  const readValue = id => {
    const el = $(id);
    if (!el || typeof el.value !== 'string') return '';
    return el.value.trim();
  };
  const classificationRaw = readValue('classification');
  const primaryStyleRaw = readValue('power-style');
  let secondaryStyleRaw = readValue('power-style-2');
  if (secondaryStyleRaw && /^none$/i.test(secondaryStyleRaw)) secondaryStyleRaw = '';
  const originRaw = readValue('origin');
  const alignmentRaw = readValue('alignment');
  const highestTierIndex = XP_TIERS.length ? XP_TIERS.length - 1 : 0;
  const safeIdx = Number.isFinite(currentTierIdx) ? Math.min(Math.max(currentTierIdx, 0), XP_TIERS.length ? XP_TIERS.length - 1 : 0) : 0;
  const tierNumber = Math.max(0, highestTierIndex - safeIdx);
  const tierLabel = `T${tierNumber}`;
  const tierValue = tierRank(tierLabel);
  const tierLabelText = XP_TIERS[safeIdx]?.label || '';
  const tags = new Set();
  const addTokens = value => {
    if (!value) return;
    const raw = String(value).trim();
    if (!raw) return;
    const normalized = normalizeCatalogToken(raw);
    if (normalized) tags.add(normalized);
    splitValueOptions(raw).forEach(option => {
      const normalizedOption = normalizeCatalogToken(option);
      if (normalizedOption) tags.add(normalizedOption);
    });
  };
  addTokens(classificationRaw);
  addTokens(primaryStyleRaw);
  addTokens(secondaryStyleRaw);
  addTokens(originRaw);
  addTokens(alignmentRaw);
  addTokens(tierLabelText);
  addTokens(tierLabel);
  addTokens(`Tier ${tierNumber}`);
  addTokens(String(tierNumber));
  if (Number.isFinite(tierValue)) addTokens(String(tierValue));
  const attributes = Object.create(null);
  const setAttr = (key, value) => {
    const normalizedKey = normalizeCatalogToken(key);
    const normalizedValue = normalizeCatalogToken(value);
    if (!normalizedKey || !normalizedValue) return;
    attributes[normalizedKey] = normalizedValue;
    if (normalizedKey.endsWith('s') && normalizedKey.length > 1) {
      const singular = normalizedKey.slice(0, -1);
      if (!attributes[singular]) attributes[singular] = normalizedValue;
    }
  };
  setAttr('classification', classificationRaw);
  setAttr('class', classificationRaw);
  setAttr('power style', primaryStyleRaw);
  setAttr('style', primaryStyleRaw);
  setAttr('primary power style', primaryStyleRaw);
  setAttr('secondary power style', secondaryStyleRaw);
  setAttr('power style 2', secondaryStyleRaw);
  setAttr('origin', originRaw);
  setAttr('origin story', originRaw);
  setAttr('alignment', alignmentRaw);
  setAttr('tier', tierLabel);
  setAttr('tier label', tierLabelText);
  setAttr('tier level', `Tier ${tierNumber}`);
  setAttr('tier number', String(tierNumber));
  if (Number.isFinite(tierValue)) {
    setAttr('tier rank', String(tierValue));
  }
  return {
    tierLabel,
    tierValue,
    classification: attributes.classification || '',
    primaryStyle: attributes['power style'] || '',
    secondaryStyle: attributes['secondary power style'] || '',
    origin: attributes.origin || '',
    alignment: attributes.alignment || '',
    tags,
    attributes
  };
}

function matchesTierRestriction(restriction, playerState){
  if (!restriction || !playerState) return true;
  const raw = typeof restriction === 'string' ? restriction : restriction.raw;
  const normalized = typeof restriction === 'string' ? normalizeCatalogToken(restriction) : restriction.normalized;
  if (!normalized) return true;
  let requiredRank = null;
  let match = normalized.match(/t(\d)/);
  if (match) requiredRank = Number(match[1]);
  if (!Number.isFinite(requiredRank)) {
    match = normalized.match(/tier\s*(\d)/);
    if (match) requiredRank = Number(match[1]);
  }
  if (!Number.isFinite(requiredRank)) {
    match = normalized.match(/\b(\d)\b/);
    if (match) requiredRank = Number(match[1]);
  }
  if (Number.isFinite(requiredRank) && Number.isFinite(playerState.tierValue)) {
    if (/\bor higher\b/.test(normalized) || /\+$/.test(normalized)) {
      return playerState.tierValue <= requiredRank;
    }
    if (/\bor lower\b/.test(normalized) || /\-$/.test(normalized)) {
      return playerState.tierValue >= requiredRank;
    }
    return playerState.tierValue === requiredRank;
  }
  if (Number.isFinite(requiredRank) && !Number.isFinite(playerState.tierValue)) {
    return false;
  }
  return playerState.tags.has(normalized);
}

function isCatalogPrerequisiteMet(prereq, playerState){
  if (!prereq || !playerState) return true;
  const values = Array.isArray(prereq.values) ? prereq.values : [];
  if (!values.length) return true;
  if (prereq.key) {
    if (prereq.key === 'tier' || prereq.key === 'tier level' || prereq.key === 'tier rank') {
      return values.some(value => matchesTierRestriction(value, playerState));
    }
    const attrValue = playerState.attributes[prereq.key];
    if (attrValue) {
      return values.some(value => attrValue === value.normalized || playerState.tags.has(value.normalized));
    }
    return values.some(value => playerState.tags.has(value.normalized));
  }
  return values.some(value => playerState.tags.has(value.normalized));
}

function isEntryAvailableToPlayer(entry, playerState){
  if (!entry || !playerState) return true;
  const playerTier = playerState.tierValue;
  if (entry.tier) {
    const entryTier = tierRank(entry.tier);
    if (Number.isFinite(entryTier) && Number.isFinite(playerTier) && entryTier !== playerTier) {
      return false;
    }
  }
  if (Array.isArray(entry.tierRestrictions) && entry.tierRestrictions.length) {
    const tierOk = entry.tierRestrictions.some(restriction => matchesTierRestriction(restriction, playerState));
    if (!tierOk) return false;
  }
  if (Array.isArray(entry.classifications) && entry.classifications.length) {
    const classOk = entry.classifications.some(token => playerState.tags.has(token));
    if (!classOk) return false;
  }
  if (Array.isArray(entry.prerequisites) && entry.prerequisites.length) {
    for (const prereq of entry.prerequisites) {
      if (!isCatalogPrerequisiteMet(prereq, playerState)) return false;
    }
  }
  return true;
}

function renderCatalog(){
  if (!catalogListEl) return;
  const visibleCustom = getVisibleCustomCatalogEntries();
  if (catalogError && !visibleCustom.length) {
    catalogListEl.innerHTML = '<div class="catalog-empty">Failed to load gear catalog.</div>';
    return;
  }
  const baseLoaded = Array.isArray(catalogData);
  if (!baseLoaded && !visibleCustom.length) {
    catalogListEl.innerHTML = '<div class="catalog-empty">Loading gear catalog...</div>';
    return;
  }
  const style = styleSel ? styleSel.value : '';
  const type = typeSel ? typeSel.value : '';
  const tier = tierSel ? tierSel.value : '';
  const source = (baseLoaded ? catalogData.slice() : [])
    .concat(visibleCustom)
    .concat(Array.isArray(dmCatalogEntries) ? dmCatalogEntries : []);
  const playerState = getPlayerCatalogState();
  const rows = sortCatalogRows(source.filter(entry => (
    (!style || entry.section === style) &&
    (!type || entry.type === type) &&
    (!tier || entry.tier === tier) &&
    isEntryAvailableToPlayer(entry, playerState)
  )));
  if (!rows.length) {
    catalogListEl.innerHTML = '<div class="catalog-empty">No matching gear found.</div>';
    return;
  }
  catalogListEl.innerHTML = rows.map((entry, idx) => {
    const priceText = formatPriceNote(entry);
    const details = [];
    if (entry.perk) details.push(`<div class="small">${escapeHtml(entry.perk)}</div>`);
    if (entry.use) details.push(`<div class="small">Use: ${escapeHtml(entry.use)}</div>`);
    if (entry.attunement) details.push(`<div class="small">Attunement: ${escapeHtml(entry.attunement)}</div>`);
    if (entry.description) details.push(`<div class="small">${escapeHtml(entry.description)}</div>`);
    if (entry.dmRecipient) details.push(`<div class="small">Recipient: ${escapeHtml(entry.dmRecipient)}</div>`);
    if (entry.dmEntry) details.push('<div class="small">DM catalog entry</div>');
    if (entry.dmLock) details.push('<div class="small">Locked by DM</div>');
    const buttonAttrs = [];
    if (entry.dmLock) buttonAttrs.push('data-dm-lock="true"');
    if (entry.dmEntry) buttonAttrs.push('data-dm-entry="true"');
    return `
    <div class="catalog-item">
      <div class="pill">${escapeHtml(entry.tier || '—')}</div>
      <div><b>${escapeHtml(entry.name)}</b> <span class="small">— ${escapeHtml(entry.section)}${entry.type ? ` • ${escapeHtml(entry.type)}` : ''}${priceText ? ` • ${escapeHtml(priceText)}` : ''}</span>
        ${details.join('')}
      </div>
      <div><button class="btn-sm" data-add="${idx}"${buttonAttrs.length ? ' ' + buttonAttrs.join(' ') : ''}>Add</button></div>
    </div>`;
  }).join('');
  qsa('[data-add]', catalogListEl).forEach(btn => btn.addEventListener('click', () => {
    const item = rows[Number(btn.dataset.add)];
    if (!item) return;
    if (item.dmLock && !isDmSessionActive()) {
      toast('This entry is locked by the DM.', 'error');
      return;
    }
    if (!tryPurchaseEntry(item)) return;
    addEntryToSheet(item);
  }));
}

async function fetchCatalogText(url, errorMessage = 'Catalog fetch failed'){
  const res = await fetch(url);
  if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
    throw new Error(errorMessage);
  }
  if (typeof res.arrayBuffer === 'function') {
    const buffer = await res.arrayBuffer();
    return decodeCatalogBuffer(buffer);
  }
  if (typeof res.text === 'function') {
    return await res.text();
  }
  return '';
}

async function fetchCatalogJson(url, errorMessage = 'Catalog JSON fetch failed'){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
    throw new Error(errorMessage);
  }
  return await res.json();
}

async function ensureCatalog(){
  if (catalogData) return catalogData;
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    try {
      let prebuiltEntries = null;
      try {
        const prebuilt = await fetchCatalogJson(CATALOG_JSON_SRC, 'Catalog JSON fetch failed');
        if (prebuilt && typeof prebuilt === 'object' && Array.isArray(prebuilt.entries)) {
          const sanitized = prebuilt.entries
            .map(entry => sanitizeNormalizedCatalogEntry(entry))
            .filter(Boolean);
          if (sanitized.length) {
            prebuiltEntries = {
              entries: sanitized,
              prices: Array.isArray(prebuilt.prices)
                ? prebuilt.prices.map(normalizePriceRow).filter(Boolean)
                : [],
            };
          }
        }
      } catch (prebuiltError) {
        console.warn('Prebuilt gear catalog unavailable, falling back to CSV.', prebuiltError);
      }

      if (prebuiltEntries && Array.isArray(prebuiltEntries.entries)) {
        catalogData = prebuiltEntries.entries;
        const derivedPrices = prebuiltEntries.prices && prebuiltEntries.prices.length
          ? prebuiltEntries.prices
          : derivePriceEntriesFromCatalog(catalogData);
        catalogPriceEntries = derivedPrices;
        rebuildCatalogPriceIndex(catalogPriceEntries);
        catalogError = null;
        rebuildCatalogFilterOptions();
        applyPendingCatalogFilters();
        requestCatalogRender();
        const dmPayloads = Array.isArray(prebuilt?.dmCatalog?.payloads)
          ? prebuilt.dmCatalog.payloads
          : Array.isArray(prebuilt?.dmCatalogPayloads)
            ? prebuilt.dmCatalogPayloads
            : [];
        if (dmPayloads.length) {
          setServerDmCatalogPayloads(dmPayloads);
        }
        return catalogData;
      }

      const masterPromise = fetchCatalogText(CATALOG_MASTER_SRC, 'Catalog fetch failed');
      const pricePromise = fetchCatalogText(CATALOG_PRICE_SRC, 'Price fetch failed').catch(err => {
        console.error('Failed to load catalog prices', err);
        return null;
      });
      const [masterText, priceTextRaw] = await Promise.all([masterPromise, pricePromise]);
      const parsedMaster = parseCsv(masterText);
      if (typeof priceTextRaw === 'string') {
        const parsedPrices = parseCsv(priceTextRaw);
        catalogPriceEntries = parsedPrices.map(normalizePriceRow).filter(Boolean);
      } else if (!Array.isArray(catalogPriceEntries) || !catalogPriceEntries.length) {
        catalogPriceEntries = [];
      }
      const priceIndex = rebuildCatalogPriceIndex(catalogPriceEntries);
      const normalized = parsedMaster.map(row => normalizeCatalogRow(row, priceIndex)).filter(Boolean);
      catalogData = normalized;
      catalogError = null;
      rebuildCatalogFilterOptions();
      applyPendingCatalogFilters();
      requestCatalogRender();
      return catalogData;
    } catch (err) {
      console.error('Failed to load catalog', err);
      catalogError = err;
      catalogData = null;
      renderCatalog();
      throw err;
    } finally {
      catalogPromise = null;
    }
  })();
  return catalogPromise;
}

if (styleSel) styleSel.addEventListener('input', renderCatalog);
if (typeSel) typeSel.addEventListener('input', renderCatalog);
if (tierSel) tierSel.addEventListener('input', renderCatalog);
if (catalogCustomBtn) catalogCustomBtn.addEventListener('click', () => {
  handleAddCustomCatalogItem();
});
if (customTypeButtons.length) {
  customTypeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      handleCustomItemTypeSelection(btn.dataset.customType);
    });
  });
}

function openCatalogWithFilters(filters = {}){
  pendingCatalogFilters = filters;
  show('modal-catalog');
  renderCatalog();
  ensureCatalog().then(() => {
    applyPendingCatalogFilters();
    renderCatalog();
  }).catch(() => {
    toast('Failed to load gear catalog', 'error');
    pendingCatalogFilters = null;
    renderCatalog();
  });
}

$('open-catalog').addEventListener('click', () => {
  openCatalogWithFilters({ style: '', type: '', tier: '' });
});

async function handleAddCustomCatalogItem(){
  try {
    await ensureCatalog();
  } catch (err) {
    console.error('Custom item catalog load failed', err);
    toast('Failed to load gear catalog', 'error');
    renderCatalog();
  }
  hide('modal-catalog');
  if (customTypeModal) {
    show('modal-custom-item');
  }
}

function handleCustomItemTypeSelection(typeKey){
  const key = String(typeKey || '').toLowerCase();
  const config = CUSTOM_ITEM_TYPES[key];
  if (!config) {
    toast('Unknown item type. Try Weapon, Armor, Shield, Utility, or Item.', 'error');
    return;
  }
  hide('modal-custom-item');
  const list = $(config.listId);
  if (!list) return;
  const entry = createCustomCatalogEntry(config);
  customCatalogEntries.push(entry);
  const card = createCard(config.cardKind);
  card.dataset.customCatalogId = entry.customId;
  if (config.displayType === 'Shield') {
    const slotSel = qs("[data-f='slot']", card);
    if (slotSel) slotSel.value = 'Shield';
  }
  list.appendChild(card);
  attachCustomEntryListeners(entry, card);
  pushHistory();
  const nameInput = qs("[data-f='name']", card);
  if (nameInput && typeof nameInput.focus === 'function') {
    nameInput.focus();
  }
  toast('Custom item card added. Fill in the details to add it to the catalog.', 'success');
}

/* ========= Encounter / Initiative ========= */
let round = Number(localStorage.getItem('enc-round')||'1')||1;
let turn = Number(localStorage.getItem('enc-turn')||'0')||0;
const roster = safeParse('enc-roster');
function saveEnc(){
  localStorage.setItem('enc-roster', JSON.stringify(roster));
  localStorage.setItem('enc-round', String(round));
  localStorage.setItem('enc-turn', String(turn));
}
function renderEnc(){
  const list=$('enc-list');
  if(!list) return;
  const roundEl=$('enc-round');
  const activeEl=$('enc-active');
  const total=roster.length;
  const safeRound = Math.max(1, Number.isFinite(Number(round)) ? Math.floor(Number(round)) : 1);
  round = safeRound;
  if(total){
    const maxTurn = total - 1;
    const numericTurn = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : 0;
    turn = Math.min(Math.max(0, numericTurn), maxTurn);
  }else{
    turn = 0;
  }
  list.innerHTML='';
  const activeCombatant = total ? roster[turn] : null;
  roster.forEach((r,idx)=>{
    const row=document.createElement('div');
    row.className='catalog-item';
    if(idx===turn){
      row.classList.add('active');
      row.setAttribute('aria-current','true');
    }
    const initVal = Number.isFinite(Number(r.init)) ? Number(r.init) : '';
    const nameVal = r && typeof r.name==='string' ? r.name : '';
    row.innerHTML = `<div class="pill">${initVal}</div><div><b>${nameVal}</b></div><div><button class="btn-sm" data-del="${idx}"></button></div>`;
    list.appendChild(row);
  });
  applyDeleteIcons(list);
  if(roundEl){
    roundEl.textContent = total ? String(round) : '—';
  }
  if(activeEl){
    if(activeCombatant){
      const name = activeCombatant.name ? String(activeCombatant.name) : 'Unnamed combatant';
      const init = Number.isFinite(Number(activeCombatant.init)) ? Number(activeCombatant.init) : null;
      activeEl.textContent = init !== null ? `${name} (Init ${init})` : name;
    }else{
      activeEl.textContent = 'No active combatant';
    }
  }
  qsa('[data-del]', list).forEach(b=> b.addEventListener('click', ()=>{
    const i=Number(b.dataset.del);
    roster.splice(i,1);
    if(turn>=roster.length) turn=0;
    renderEnc();
    saveEnc();
  }));
}
$('btn-enc').addEventListener('click', ()=>{ renderEnc(); show('modal-enc'); });
$('enc-add').addEventListener('click', ()=>{
  const name=$('enc-name').value.trim();
  const init=Number($('enc-init').value||0);
  if(!name) return toast('Enter a name','error');
  roster.push({name, init});
  roster.sort((a,b)=>(b.init||0)-(a.init||0) || String(a.name).localeCompare(String(b.name)));
  $('enc-name').value='';
  $('enc-init').value='';
  turn=0;
  renderEnc();
  saveEnc();
});
$('enc-next').addEventListener('click', ()=>{
  if(!roster.length) return;
  turn = (turn + 1) % roster.length;
  if(turn===0) round+=1;
  renderEnc();
  saveEnc();
});
$('enc-prev').addEventListener('click', ()=>{
  if(!roster.length) return;
  turn = (turn - 1 + roster.length) % roster.length;
  if(turn===roster.length-1 && round>1) round-=1;
  renderEnc();
  saveEnc();
});
$('enc-reset').addEventListener('click', ()=>{
  if(!confirm('Reset encounter and round?')) return;
  round=1;
  turn=0;
  roster.length=0;
  renderEnc();
  saveEnc();
});
qsa('#modal-enc [data-close]').forEach(b=> b.addEventListener('click', ()=> hide('modal-enc')));

/* ========= Save / Load ========= */
function serialize(){
  const data={};
  function getVal(sel, root){ const el = qs(sel, root); return el ? el.value : ''; }
  function getChecked(sel, root){ const el = qs(sel, root); return el ? el.checked : false; }
  qsa('input,select,textarea,progress').forEach(el=>{
    const id = el.id; if (!id) return;
    if (id === 'xp-mode') return;
    if (el.type==='checkbox') data[id] = !!el.checked; else data[id] = el.value;
  });
  data.powers = qsa("[data-kind='power']")
    .map(card => serializePowerCard(card))
    .filter(Boolean);
  data.powerSettings = getCharacterPowerSettings();
  data.signatures = qsa("[data-kind='sig']")
    .map(card => serializePowerCard(card))
    .filter(Boolean)
    .map(sig => ({ ...sig, signature: true }));
  data.weapons = qsa("[data-kind='weapon']").map(card => {
    const name = getVal("[data-f='name']", card) || '';
    const damage = getVal("[data-f='damage']", card) || '';
    const range = getVal("[data-f='range']", card) || '';
    const attackAbilityRaw = getVal("[data-f='attackAbility']", card) || '';
    const attackAbility = attackAbilityRaw ? attackAbilityRaw.toLowerCase() : '';
    const proficient = !!getChecked("[data-f='proficient']", card);
    return {
      name,
      damage,
      range,
      attackAbility: attackAbility || inferWeaponAttackAbility({ range }),
      proficient
    };
  });
  data.armor = qsa("[data-kind='armor']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    slot: getVal("[data-f='slot']", card) || 'Body',
    bonus: Number(getVal("[data-f='bonus']", card) || 0),
    equipped: !!getChecked("[data-f='equipped']", card)
  }));
  data.items = qsa("[data-kind='item']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    qty: Number(getVal("[data-f='qty']", card) || 1),
    notes: getVal("[data-f='notes']", card) || ''
  }));
  // Persist save and skill proficiencies explicitly so they restore reliably
  data.saveProfs = ABILS.filter(a => {
    const el = $('save-' + a + '-prof');
    return el && el.checked;
  });
  data.skillProfs = SKILLS.map((_, i) => {
    const el = $('skill-' + i + '-prof');
    return el && el.checked ? i : null;
  }).filter(i => i !== null);
  data.campaignLog = campaignLogEntries;
  const safeRound = Math.max(1, Number.isFinite(Number(round)) ? Math.floor(Number(round)) : 1);
  const safeTurnBase = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : 0;
  const safeRoster = roster.map(entry => ({
    name: typeof entry?.name === 'string' ? entry.name : '',
    init: Number.isFinite(Number(entry?.init)) ? Number(entry.init) : 0
  }));
  const safeTurn = safeRoster.length
    ? Math.min(Math.max(0, safeTurnBase), safeRoster.length - 1)
    : 0;
  data.encounter = {
    round: safeRound,
    turn: safeTurn,
    roster: safeRoster
  };
  if (window.CC && CC.partials && Object.keys(CC.partials).length) {
    try { data.partials = JSON.parse(JSON.stringify(CC.partials)); } catch { data.partials = {}; }
  }
  return data;
}
const DEFAULT_STATE = serialize();
function deserialize(data){
  migratePublicOpinionSnapshot(data);
  $('powers').innerHTML=''; $('sigs').innerHTML=''; $('weapons').innerHTML=''; $('armors').innerHTML=''; $('items').innerHTML='';
  activePowerCards.forEach(card => powerCardStates.delete(card));
  activePowerCards.clear();
  const ongoingContainer = $('ongoing-effects');
  if (ongoingContainer) ongoingContainer.innerHTML = '';
  ongoingEffectTrackers.clear();
 const perkSelects=['alignment','classification','power-style','origin'];
 perkSelects.forEach(id=>{
   const el=$(id);
   const val=data?data[id]:undefined;
   if(el && val!==undefined){
     el.value=val;
     el.dispatchEvent(new Event('change',{bubbles:true}));
   }
 });
 Object.entries(data||{}).forEach(([k,v])=>{
   if(perkSelects.includes(k) || k==='saveProfs' || k==='skillProfs' || k==='xp-mode') return;
   const el=$(k);
   if (!el) return;
   if (el.type==='checkbox') el.checked=!!v; else el.value=v;
 });
 if (data?.powerSettings) {
   const casterAbility = typeof data.powerSettings.casterSaveAbility === 'string'
     ? data.powerSettings.casterSaveAbility.toLowerCase()
     : null;
  if (casterAbility && elPowerSaveAbility) {
    elPowerSaveAbility.value = casterAbility;
  }
  syncPowerDcRadios(data.powerSettings.dcFormula || powerDcFormulaField?.value || 'Proficiency');
  refreshCasterAbilitySuggestion({ syncOnly: true });
}
 if(data && Array.isArray(data.saveProfs)){
   ABILS.forEach(a=>{
     const el = $('save-'+a+'-prof');
     if(el) el.checked = data.saveProfs.includes(a);
   });
 }
 if(data && Array.isArray(data.skillProfs)){
   SKILLS.forEach((_,i)=>{
     const el = $('skill-'+i+'-prof');
     if(el) el.checked = data.skillProfs.includes(i);
   });
 }
  (data && data.powers ? data.powers : []).forEach(p=> $('powers').appendChild(createCard('power', p)));
  (data && data.signatures ? data.signatures : []).forEach(s=> $('sigs').appendChild(createCard('sig', s)));
  (data && data.weapons ? data.weapons : []).forEach(w=> $('weapons').appendChild(createCard('weapon', w)));
  (data && data.armor ? data.armor : []).forEach(a=> $('armors').appendChild(createCard('armor', a)));
  (data && data.items ? data.items : []).forEach(i=> $('items').appendChild(createCard('item', i)));
  refreshHammerspaceCards();
  const restoredCampaignLog = Array.isArray(data?.campaignLog) ? data.campaignLog : [];
  campaignLogEntries = normalizeCampaignLogEntries(restoredCampaignLog);
  if(campaignLogEntries.length){
    lastLocalCampaignTimestamp = campaignLogEntries[campaignLogEntries.length - 1].t;
  }else{
    lastLocalCampaignTimestamp = 0;
  }
  persistCampaignLog();
  updateCampaignLogViews();
  const xpModeEl = $('xp-mode');
  if (xpModeEl) xpModeEl.value = 'add';
  if (elXP) {
    const xp = Math.max(0, num(elXP.value));
    currentTierIdx = getTierIndex(xp);
  }
  if(data && data.partials && window.CC){
    CC.partials = data.partials;
    if(CC.RP && typeof CC.RP.load==='function' && CC.partials.resonance){
      CC.RP.load(CC.partials.resonance);
    }
  }
  const encounterData = data && data.encounter ? data.encounter : null;
  const restoredRoster = Array.isArray(encounterData?.roster)
    ? encounterData.roster
        .map(entry => ({
          name: typeof entry?.name === 'string' ? entry.name : '',
          init: Number.isFinite(Number(entry?.init)) ? Number(entry.init) : 0
        }))
        .filter(entry => entry.name)
    : [];
  const restoredRound = Number.isFinite(Number(encounterData?.round)) ? Math.floor(Number(encounterData.round)) : 1;
  const restoredTurnRaw = Number.isFinite(Number(encounterData?.turn)) ? Math.floor(Number(encounterData.turn)) : 0;
  round = Math.max(1, restoredRound);
  roster.length = 0;
  restoredRoster.forEach(entry => roster.push(entry));
  if(roster.length){
    turn = Math.min(Math.max(0, restoredTurnRaw), roster.length - 1);
  }else{
    turn = 0;
    round = 1;
  }
  renderEnc();
  saveEnc();
  updateDerived();
  updateFactionRep(handlePerkEffects);
  updateCreditsDisplay();
  if (mode === 'view') applyViewLockState();
}

/* ========= autosave + history ========= */
const AUTO_KEY = 'autosave';
let history = [];
let histIdx = -1;
const forcedRefreshResume = consumeForcedRefreshState();
let autoSaveDirty = false;
let lastSyncedSnapshotJson = null;
let pendingAutoSaveSnapshot = null;
let pendingAutoSaveJson = null;
const pushHistory = debounce(()=>{
  const snap = serialize();
  const serialized = JSON.stringify(snap);
  history = history.slice(0, histIdx + 1);
  history.push(snap);
  if(history.length > 20){ history.shift(); }
  histIdx = history.length - 1;
  try{ localStorage.setItem(AUTO_KEY, serialized); }catch(e){ console.error('Autosave failed', e); }
  markAutoSaveDirty(snap, serialized);
}, 500);

const CLOUD_AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000;
let scheduledAutoSaveId = null;
let scheduledAutoSaveInFlight = false;

document.addEventListener('input', pushHistory);
document.addEventListener('change', pushHistory);

function undo(){
  if(histIdx > 0){ histIdx--; deserialize(history[histIdx]); }
}
function redo(){
  if(histIdx < history.length - 1){ histIdx++; deserialize(history[histIdx]); }
}

(function(){
  try{ localStorage.removeItem(AUTO_KEY); }catch{}
  if(forcedRefreshResume && forcedRefreshResume.data){
    deserialize(forcedRefreshResume.data);
  } else {
    deserialize(DEFAULT_STATE);
  }
  const snap = serialize();
  const serialized = JSON.stringify(snap);
  history = [snap];
  histIdx = 0;
  try{ localStorage.setItem(AUTO_KEY, serialized); }catch(e){ console.error('Autosave failed', e); }
  markAutoSaveSynced(snap, serialized);
  if(forcedRefreshResume && typeof forcedRefreshResume.scrollY === 'number'){
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: forcedRefreshResume.scrollY, behavior: 'auto' });
      } catch (err) {
        window.scrollTo(0, forcedRefreshResume.scrollY);
      }
    });
  }
})();

async function performScheduledAutoSave(){
  if(scheduledAutoSaveInFlight) return;
  if(!autoSaveDirty || !pendingAutoSaveSnapshot) return;
  if(typeof window !== 'undefined' && scheduledAutoSaveId !== null){
    window.clearTimeout(scheduledAutoSaveId);
    scheduledAutoSaveId = null;
  }
  const name = currentCharacter();
  if(!name){
    scheduleAutoSave();
    return;
  }
  try {
    scheduledAutoSaveInFlight = true;
    const snapshot = pendingAutoSaveSnapshot;
    await saveAutoBackup(snapshot, name);
    markAutoSaveSynced(snapshot, pendingAutoSaveJson);
  } catch (err) {
    console.error('Scheduled auto save failed', err);
  } finally {
    scheduledAutoSaveInFlight = false;
    if(autoSaveDirty){
      scheduleAutoSave();
    }
  }
}

function scheduleAutoSave(){
  if(typeof window === 'undefined') return;
  if(!autoSaveDirty) return;
  if(scheduledAutoSaveId !== null){
    window.clearTimeout(scheduledAutoSaveId);
  }
  scheduledAutoSaveId = window.setTimeout(()=>{
    scheduledAutoSaveId = null;
    performScheduledAutoSave();
  }, CLOUD_AUTO_SAVE_INTERVAL_MS);
}

function clearScheduledAutoSave(){
  if(typeof window === 'undefined') return;
  if(scheduledAutoSaveId !== null){
    window.clearTimeout(scheduledAutoSaveId);
    scheduledAutoSaveId = null;
  }
}

function markAutoSaveDirty(snapshot, serialized){
  pendingAutoSaveSnapshot = snapshot;
  pendingAutoSaveJson = serialized ?? JSON.stringify(snapshot);
  if(pendingAutoSaveJson !== lastSyncedSnapshotJson){
    autoSaveDirty = true;
    scheduleAutoSave();
  } else {
    autoSaveDirty = false;
    clearScheduledAutoSave();
  }
}

function markAutoSaveSynced(snapshot, serialized){
  pendingAutoSaveSnapshot = snapshot;
  pendingAutoSaveJson = serialized ?? JSON.stringify(snapshot);
  lastSyncedSnapshotJson = pendingAutoSaveJson;
  autoSaveDirty = false;
  clearScheduledAutoSave();
}

if(typeof window !== 'undefined'){
  window.addEventListener('focus', () => {
    if(autoSaveDirty){
      performScheduledAutoSave();
    }
  }, { passive: true });
}

// Cloud sync status + detail panel setup.
const syncStatusTrigger = $('cloud-sync-status');
const syncPanel = $('cloud-sync-panel');
const syncPanelBackdrop = $('cloud-sync-panel-backdrop');
const syncPanelStatusEl = syncPanel?.querySelector('[data-sync-panel-status]');
const syncPanelLastEl = syncPanel?.querySelector('[data-sync-last]');
const syncPanelQueueList = syncPanel?.querySelector('[data-sync-queue-list]');
const syncPanelQueueEmptyEl = syncPanel?.querySelector('[data-sync-queue-empty]');
const syncPanelErrorList = syncPanel?.querySelector('[data-sync-error-list]');
const syncPanelErrorEmptyEl = syncPanel?.querySelector('[data-sync-error-empty]');
const syncPanelSyncNowBtn = syncPanel?.querySelector('[data-sync-now]');
const syncPanelRetryBtn = syncPanel?.querySelector('[data-sync-retry]');
const syncPanelClearErrorsBtn = syncPanel?.querySelector('[data-sync-clear-errors]');
const syncPanelClearQueueBtn = syncPanel?.querySelector('[data-sync-clear-queue]');
const syncPanelCloseBtn = syncPanel?.querySelector('[data-sync-close]');

const SYNC_STATUS_LABELS = {
  online: 'Online',
  syncing: 'Syncing…',
  queued: 'Offline: save queued',
  reconnecting: 'Syncing queued save',
  offline: 'Offline',
};
const VALID_BADGE_STATUSES = new Set(Object.keys(SYNC_STATUS_LABELS));
const relativeTimeFormatter = (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function')
  ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  : null;
const syncErrorLog = [];
const SYNC_ERROR_LIMIT = 8;
const manualSyncButtons = [syncPanelSyncNowBtn, syncPanelRetryBtn].filter(Boolean);
let syncPanelOpen = false;
let queueRefreshPromise = null;

function setSyncButtonErrorState(hasErrors) {
  if (!syncStatusTrigger) return;
  if (hasErrors) {
    syncStatusTrigger.setAttribute('data-has-errors', 'true');
  } else {
    syncStatusTrigger.removeAttribute('data-has-errors');
  }
}

function formatDateTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch (err) {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return new Date(timestamp).toString();
    }
  }
}

function formatRelativeTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const now = Date.now();
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < 15000) return 'just now';
  const units = [
    { limit: 60000, divisor: 1000, unit: 'second' },
    { limit: 3600000, divisor: 60000, unit: 'minute' },
    { limit: 86400000, divisor: 3600000, unit: 'hour' },
    { limit: 604800000, divisor: 86400000, unit: 'day' },
    { limit: Infinity, divisor: 604800000, unit: 'week' },
  ];
  for (const { limit, divisor, unit } of units) {
    if (abs < limit) {
      const value = Math.max(1, Math.round(abs / divisor));
      if (relativeTimeFormatter) {
        return relativeTimeFormatter.format(diff < 0 ? -value : value, unit);
      }
      const plural = value === 1 ? unit : `${unit}s`;
      return diff < 0 ? `${value} ${plural} ago` : `in ${value} ${plural}`;
    }
  }
  return '';
}

function updateLastSyncDisplay(timestamp = getLastSyncActivity()) {
  if (!syncPanelLastEl) return;
  if (!Number.isFinite(timestamp)) {
    syncPanelLastEl.textContent = 'Never';
    syncPanelLastEl.removeAttribute('datetime');
    syncPanelLastEl.title = 'No successful sync yet';
    return;
  }
  const relative = formatRelativeTime(timestamp);
  const absolute = formatDateTime(timestamp);
  syncPanelLastEl.textContent = relative || absolute || 'Unknown';
  syncPanelLastEl.setAttribute('datetime', new Date(timestamp).toISOString());
  if (absolute) {
    syncPanelLastEl.title = absolute;
  } else {
    syncPanelLastEl.removeAttribute('title');
  }
}

function renderSyncErrors() {
  if (!syncPanelErrorList || !syncPanelErrorEmptyEl) {
    setSyncButtonErrorState(Boolean(syncErrorLog.length));
    return;
  }
  syncPanelErrorList.textContent = '';
  if (!syncErrorLog.length) {
    syncPanelErrorList.hidden = true;
    syncPanelErrorEmptyEl.hidden = false;
    if (syncPanelClearErrorsBtn) {
      syncPanelClearErrorsBtn.disabled = true;
    }
    setSyncButtonErrorState(false);
    return;
  }
  syncPanelErrorList.hidden = false;
  syncPanelErrorEmptyEl.hidden = true;
  if (syncPanelClearErrorsBtn) {
    syncPanelClearErrorsBtn.disabled = false;
  }
  setSyncButtonErrorState(true);
  syncErrorLog.forEach(entry => {
    const item = document.createElement('li');
    item.className = 'sync-panel__list-item sync-panel__list-item--error';
    const title = document.createElement('span');
    title.className = 'sync-panel__item-title';
    title.textContent = entry.message || 'Cloud sync error';
    item.appendChild(title);
    if (entry.name) {
      const note = document.createElement('span');
      note.className = 'sync-panel__item-note';
      note.textContent = `Character: ${entry.name}`;
      item.appendChild(note);
    }
    if (entry.detail && entry.detail !== entry.message) {
      const detail = document.createElement('span');
      detail.className = 'sync-panel__item-detail';
      detail.textContent = entry.detail;
      item.appendChild(detail);
    }
    const meta = document.createElement('span');
    meta.className = 'sync-panel__meta';
    const absolute = formatDateTime(entry.timestamp);
    const relative = formatRelativeTime(entry.timestamp);
    meta.textContent = relative ? `Logged ${relative}` : 'Logged';
    if (absolute) {
      meta.title = absolute;
    }
    item.appendChild(meta);
    syncPanelErrorList.appendChild(item);
  });
}

function renderQueue(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const queueCount = normalizedEntries.length;
  if (!syncPanelQueueList || !syncPanelQueueEmptyEl) {
    if (syncStatusTrigger) {
      if (queueCount) {
        const badgeLabel = queueCount > 9 ? '9+' : String(queueCount);
        syncStatusTrigger.setAttribute('data-queue-count', badgeLabel);
      } else {
        syncStatusTrigger.removeAttribute('data-queue-count');
      }
    }
    if (syncPanelClearQueueBtn) {
      const isLoading = syncPanelClearQueueBtn.classList.contains('loading');
      syncPanelClearQueueBtn.disabled = isLoading || queueCount === 0;
    }
    return;
  }
  syncPanelQueueList.textContent = '';
  if (!queueCount) {
    syncPanelQueueList.hidden = true;
    syncPanelQueueEmptyEl.hidden = false;
  } else {
    syncPanelQueueList.hidden = false;
    syncPanelQueueEmptyEl.hidden = true;
    normalizedEntries.forEach(entry => {
      const item = document.createElement('li');
      item.className = 'sync-panel__list-item';
      const title = document.createElement('span');
      title.className = 'sync-panel__item-title';
      title.textContent = entry.name || 'Unnamed save';
      item.appendChild(title);
      const meta = document.createElement('span');
      meta.className = 'sync-panel__meta';
      const timestamp = Number.isFinite(entry.queuedAt) ? entry.queuedAt : entry.ts;
      const absolute = formatDateTime(timestamp);
      const relative = formatRelativeTime(timestamp);
      meta.textContent = relative ? `Queued ${relative}` : 'Queued';
      if (absolute) {
        meta.title = absolute;
      }
      item.appendChild(meta);
      syncPanelQueueList.appendChild(item);
    });
  }
  if (syncPanelClearQueueBtn) {
    const isLoading = syncPanelClearQueueBtn.classList.contains('loading');
    syncPanelClearQueueBtn.disabled = isLoading || queueCount === 0;
  }
  if (syncStatusTrigger) {
    if (queueCount) {
      const badgeLabel = queueCount > 9 ? '9+' : String(queueCount);
      syncStatusTrigger.setAttribute('data-queue-count', badgeLabel);
    } else {
      syncStatusTrigger.removeAttribute('data-queue-count');
    }
  }
}

async function refreshSyncQueue() {
  if (!syncPanelQueueList && !syncStatusTrigger) return;
  if (queueRefreshPromise) return queueRefreshPromise;
  queueRefreshPromise = (async () => {
    try {
      const entries = await getQueuedCloudSaves();
      renderQueue(entries);
    } catch (err) {
      console.error('Failed to refresh queued cloud saves', err);
    }
  })().finally(() => {
    queueRefreshPromise = null;
  });
  return queueRefreshPromise;
}

function toggleSyncPanel(forceOpen) {
  if (!syncPanel) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : !syncPanelOpen;
  if (syncPanelOpen === open) return;
  syncPanelOpen = open;
  syncPanel.hidden = !open;
  if (open) {
    syncPanel.removeAttribute('aria-hidden');
  } else {
    syncPanel.setAttribute('aria-hidden', 'true');
  }
  if (syncPanelBackdrop) {
    syncPanelBackdrop.hidden = !open;
    if (open) {
      syncPanelBackdrop.removeAttribute('aria-hidden');
    } else {
      syncPanelBackdrop.setAttribute('aria-hidden', 'true');
    }
  }
  if (syncStatusTrigger) {
    syncStatusTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (open) {
    refreshSyncQueue();
    renderSyncErrors();
    updateLastSyncDisplay();
    requestAnimationFrame(() => {
      const focusTarget = syncPanelCloseBtn || syncPanel;
      try { focusTarget.focus({ preventScroll: true }); } catch {}
    });
  } else if (syncStatusTrigger) {
    try { syncStatusTrigger.focus({ preventScroll: true }); } catch {}
  }
}

let manualSyncInFlight = false;
async function triggerManualSync() {
  if (manualSyncInFlight) return;
  manualSyncInFlight = true;
  manualSyncButtons.forEach(btn => {
    btn.disabled = true;
    btn.classList.add('loading');
  });
  try {
    beginQueuedSyncFlush();
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg?.sync && typeof reg.sync.register === 'function') {
          try { await reg.sync.register('cloud-save-sync'); } catch {}
        }
        const worker = navigator.serviceWorker.controller || reg.active;
        worker?.postMessage({ type: 'flush-cloud-saves' });
      } catch (swErr) {
        console.error('Failed to notify service worker for manual sync', swErr);
      }
    }
    await cacheCloudSaves();
    await refreshSyncQueue();
  } catch (err) {
    console.error('Manual sync failed', err);
    try { toast('Manual sync failed', 'error'); } catch {}
  } finally {
    manualSyncInFlight = false;
    manualSyncButtons.forEach(btn => {
      btn.classList.remove('loading');
      btn.disabled = false;
    });
  }
}

if (syncStatusTrigger) {
  const labelEl = syncStatusTrigger.querySelector('[data-sync-status-label]');
  const updateSyncBadge = status => {
    const normalized = typeof status === 'string' && VALID_BADGE_STATUSES.has(status)
      ? status
      : 'online';
    const label = SYNC_STATUS_LABELS[normalized] || SYNC_STATUS_LABELS.online;
    if (syncStatusTrigger.dataset && typeof syncStatusTrigger.dataset === 'object') {
      syncStatusTrigger.dataset.status = normalized;
    } else if (typeof syncStatusTrigger.setAttribute === 'function') {
      syncStatusTrigger.setAttribute('data-status', normalized);
    }
    if (labelEl) {
      labelEl.textContent = label;
    }
    if (typeof syncStatusTrigger.setAttribute === 'function') {
      syncStatusTrigger.setAttribute('aria-label', `Cloud sync status: ${label}`);
      syncStatusTrigger.setAttribute('title', label);
    }
    if (syncPanelStatusEl) {
      syncPanelStatusEl.textContent = label;
    }
  };

  updateSyncBadge(getLastSyncStatus());
  subscribeSyncStatus(updateSyncBadge);
  syncStatusTrigger.addEventListener('click', () => {
    toggleSyncPanel(!syncPanelOpen);
  });
}

if (syncPanelCloseBtn) {
  syncPanelCloseBtn.addEventListener('click', () => toggleSyncPanel(false));
}

if (syncPanelBackdrop) {
  syncPanelBackdrop.addEventListener('click', () => toggleSyncPanel(false));
}

document.addEventListener('keydown', e => {
  if (!syncPanelOpen) return;
  if (e.key === 'Escape' || e.key === 'Esc') {
    toggleSyncPanel(false);
  }
});

if (syncPanelSyncNowBtn) {
  syncPanelSyncNowBtn.addEventListener('click', triggerManualSync);
}

if (syncPanelRetryBtn) {
  syncPanelRetryBtn.addEventListener('click', triggerManualSync);
}

if (syncPanelClearErrorsBtn) {
  syncPanelClearErrorsBtn.addEventListener('click', () => {
    syncErrorLog.length = 0;
    renderSyncErrors();
  });
}

if (syncPanelClearQueueBtn) {
  syncPanelClearQueueBtn.addEventListener('click', async () => {
    if (syncPanelClearQueueBtn.classList.contains('loading')) return;
    syncPanelClearQueueBtn.classList.add('loading');
    syncPanelClearQueueBtn.disabled = true;
    try {
      const cleared = await clearQueuedCloudSaves({ includePins: true });
      if (cleared) {
        try { toast('Queued saves cleared', 'info'); } catch {}
      } else {
        try { toast('Failed to clear queued saves', 'error'); } catch {}
      }
    } catch (err) {
      console.error('Failed to clear queued cloud saves', err);
      try { toast('Failed to clear queued saves', 'error'); } catch {}
    } finally {
      await refreshSyncQueue();
      syncPanelClearQueueBtn.classList.remove('loading');
    }
  });
}

subscribeSyncErrors(payload => {
  if (!payload) return;
  const timestamp = Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now();
  let message = 'Cloud sync error';
  if (typeof payload === 'string' && payload) {
    message = payload;
  } else if (payload && typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.trim()) {
      message = payload.message.trim();
    } else if (payload.error && typeof payload.error.message === 'string' && payload.error.message.trim()) {
      message = payload.error.message.trim();
    }
  }
  const detail = (() => {
    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string' && payload.detail.trim()) return payload.detail.trim();
      if (payload.error) {
        if (typeof payload.error === 'string') return payload.error;
        if (typeof payload.error.message === 'string') return payload.error.message;
      }
    }
    return null;
  })();
  const name = payload && typeof payload === 'object' && typeof payload.name === 'string' && payload.name ? payload.name : null;
  syncErrorLog.unshift({
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    detail,
    timestamp,
    name,
  });
  if (syncErrorLog.length > SYNC_ERROR_LIMIT) {
    syncErrorLog.length = SYNC_ERROR_LIMIT;
  }
  renderSyncErrors();
});

subscribeSyncActivity(event => {
  if (event && Number.isFinite(event.timestamp)) {
    updateLastSyncDisplay(event.timestamp);
  } else {
    updateLastSyncDisplay();
  }
  refreshSyncQueue();
});

subscribeSyncQueue(() => {
  refreshSyncQueue();
});

updateLastSyncDisplay(getLastSyncActivity());
renderSyncErrors();
refreshSyncQueue();

$('btn-save').addEventListener('click', async () => {
  const btn = $('btn-save');
  let oldChar = currentCharacter();
  if(!oldChar){
    try{
      const stored = localStorage.getItem('last-save');
      if(stored && stored.trim()) oldChar = stored.trim();
    }catch{}
  }
  const vig = $('superhero')?.value.trim();
  const real = $('secret')?.value.trim();
  let target = oldChar;
  if (vig) {
    target = vig;
  } else if (!oldChar && real) {
    target = real;
  }
  if (!target) return toast('No character selected', 'error');
  if (!confirm(`Save current progress for ${target}?`)) return;
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = serialize();
    const serialized = JSON.stringify(data);
    if (oldChar && vig && vig !== oldChar) {
      await renameCharacter(oldChar, vig, data);
    } else {
      if (target !== oldChar) {
        setCurrentCharacter(target);
        syncMiniGamePlayerName();
      }
      await saveCharacter(data, target);
    }
    markAutoSaveSynced(data, serialized);
    cueSuccessfulSave();
    toast('Save successful', 'success');
  } catch (e) {
    console.error('Save failed', e);
    toast('Save failed', 'error');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
});

const heroInput = $('superhero');
if (heroInput) {
  heroInput.addEventListener('change', async () => {
    refreshHammerspaceCards();
    const name = heroInput.value.trim();
    if (!name) return;
    if (!currentCharacter()) {
      setCurrentCharacter(name);
      syncMiniGamePlayerName();
      try {
        const data = serialize();
        await saveCharacter(data, name);
        cueSuccessfulSave();
        markAutoSaveSynced(data);
      } catch (e) {
        console.error('Autosave failed', e);
      }
    }
  });
}

const secretInput = $('secret');
if (secretInput) {
  secretInput.addEventListener('change', () => {
    refreshHammerspaceCards();
  });
}


/* ========= Rules ========= */
const btnRules = $('btn-rules');
if (btnRules) {
  btnRules.addEventListener('click', ()=>{
    renderRules();
    show('modal-rules');
  });
}

/* ========= Close + click-outside ========= */
qsa('.overlay').forEach(ov=> ov.addEventListener('click', (e)=>{ if (e.target===ov) hide(ov.id); }));
const welcomeCreate = $('welcome-create-character');
if (welcomeCreate) {
  welcomeCreate.addEventListener('click', () => {
    dismissWelcomeModal();
    const newCharBtn = $('create-character');
    if (newCharBtn) newCharBtn.click();
  });
}
const welcomeLoad = $('welcome-load-character');
if (welcomeLoad) {
  welcomeLoad.addEventListener('click', () => {
    dismissWelcomeModal();
    window.requestAnimationFrame(() => {
      openCharacterList().catch(err => console.error('Failed to open load list from welcome', err));
    });
  });
}
const welcomeSkip = $('welcome-skip');
if (welcomeSkip) {
  welcomeSkip.addEventListener('click', () => { dismissWelcomeModal(); });
}
const welcomeOverlay = getWelcomeModal();
if (welcomeOverlay) {
  welcomeOverlay.addEventListener('click', event => {
    if (event.target === welcomeOverlay) {
      welcomeModalDismissed = true;
    }
  }, { capture: true });
  qsa('#modal-welcome [data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      welcomeModalDismissed = true;
    }, { capture: true });
  });
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const modal = getWelcomeModal();
    if (modal && !modal.classList.contains('hidden')) {
      welcomeModalDismissed = true;
    }
  }
});
if (!document.body?.classList?.contains('launching')) {
  queueWelcomeModal({ immediate: true });
}

/* ========= boot ========= */
setupPerkSelect('alignment','alignment-perks', ALIGNMENT_PERKS);
setupPerkSelect('classification','classification-perks', CLASSIFICATION_PERKS);
setupPerkSelect('power-style','power-style-perks', POWER_STYLE_PERKS);
setupPerkSelect('origin','origin-perks', ORIGIN_PERKS);
setupFactionRepTracker(handlePerkEffects, pushHistory);
updateDerived();
applyEditIcons();
applyDeleteIcons();
applyLockIcons();
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const swUrl = new URL('../sw.js', import.meta.url);
  navigator.serviceWorker.register(swUrl.href).catch(e => console.error('SW reg failed', e));
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (serviceWorkerUpdateHandled) return;
    if (!hadController) {
      hadController = true;
      return;
    }
    announceContentUpdate({
      message: 'New Codex content is available.',
      updatedAt: Date.now(),
      source: 'controllerchange',
    });
  });
  navigator.serviceWorker.addEventListener('message', e => {
    const { data } = e;
    const payload = (data && typeof data === 'object') ? data : { type: data };
    const type = typeof payload.type === 'string' ? payload.type : undefined;
    if (!type) return;
    if (type === 'cacheCloudSaves') {
      cacheCloudSaves();
      return;
    }
    if (type === 'pins-updated') {
      applyLockIcons();
      return;
    }
    if (type === 'reset-launch-video') {
      if(typeof window !== 'undefined' && typeof window.__resetLaunchVideo === 'function'){
        try {
          window.__resetLaunchVideo();
        } catch (err) {
          // ignore reset failures
        }
      }
      return;
    }
    if (type === 'sw-updated') {
      announceContentUpdate(payload);
    }
  });
  navigator.serviceWorker.ready
    .then(reg => {
      const triggerFlush = () => {
        const worker = navigator.serviceWorker.controller || reg.active;
        if (getLastSyncStatus() === 'queued') {
          beginQueuedSyncFlush();
        }
        if (reg.sync && typeof reg.sync.register === 'function') {
          reg.sync.register('cloud-save-sync').catch(() => {
            worker?.postMessage({ type: 'flush-cloud-saves' });
          });
        }
        worker?.postMessage({ type: 'flush-cloud-saves' });
      };
      triggerFlush();
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('online', triggerFlush);
      }
    })
    .catch(() => {});
}
subscribeCloudSaves();

// == Resonance Points (RP) Module ============================================
CC.RP = (function () {
  const api = {};
  // --- Internal state
  let state = {
    rp: 0,                    // 0..4
    banked: 0,                // number of banked surges
    surgeActive: false,
    surgeStartedAt: null,
    surgeMode: "encounter",   // "encounter" | "time"
    surgeEndsAt: null,        // ms timestamp if timed
    aftermathPending: false,  // true when surge just ended until 1st save disadvantage is consumed
    nextCombatRegenPenalty: false // true: apply -1 SP regen on next combat's 1st round
  };

  // --- DOM refs
  const els = {};
  function q(id) { return document.getElementById(id); }

  function init() {
    const root = document.getElementById("resonance-points");
    if (!root) return;

    els.rpValue = q("rp-value");
    els.rpTrack = root.querySelector('.rp-track');
    els.rpDots = Array.from(root.querySelectorAll(".rp-dot[data-rp]"));
    els.bankDots = Array.from(root.querySelectorAll('.rp-bank-dot'));
    els.btnDec = q('rp-dec');
    els.btnInc = q('rp-inc');
    els.chkSurge = q("rp-trigger");
    els.btnClearAftermath = q("rp-clear-aftermath");
    els.surgeState = q("rp-surge-state");
    els.tagActive = q("rp-tag-active");
    els.tagAfter = q("rp-tag-aftermath");

    wireEvents();
    tryLoadFromApp();
    applyStateToUI();
    exposeHooks();
    installIntegrations();
    // Optional background timer for timed surges
    setInterval(tick, 1000 * 10); // 10s cadence is fine for coarse timers
  }

  function wireEvents() {
    if (els.btnInc) els.btnInc.addEventListener('click', () => setRP(state.rp + state.banked * 5 + 1));
    if (els.btnDec) els.btnDec.addEventListener('click', () => setRP(state.rp + state.banked * 5 - 1));
    if (els.chkSurge) {
      els.chkSurge.addEventListener("change", e => {
        if (e.target.checked) {
          if (confirm('Activate Heroic Surge?')) {
            triggerSurge();
          } else {
            e.target.checked = false;
          }
        }
      });
    }
    if (els.btnClearAftermath) {
      els.btnClearAftermath.addEventListener("click", () => {
        if (state.surgeActive) endSurge("aftermath");
        else clearAftermath();
      });
    }
  }

  // --- State transitions
  function setRP(n) {
    const prev = { rp: state.rp, banked: state.banked };
    const total = Math.max(0, Math.min(10, n));
    state.banked = Math.floor(total / 5);
    state.rp = total % 5;
    applyStateToUI();
    save();
    dispatch("rp:changed", { rp: state.rp, banked: state.banked });
    if (state.rp !== prev.rp || state.banked !== prev.banked) {
      const prevTotal = prev.rp + prev.banked * 5;
      const newTotal = state.rp + state.banked * 5;
      window.dmNotify?.(`RP ${state.rp} (bank ${state.banked})`);
      logAction(`RP: ${prevTotal} -> ${newTotal}`);
    }
  }

  function triggerSurge({ mode = "encounter", minutes = 10 } = {}) {
    if (state.banked < 1 || state.surgeActive) return;
    const prevBank = state.banked;
    state.surgeActive = true;
    state.surgeStartedAt = Date.now();
    state.surgeMode = mode;
    state.surgeEndsAt = mode === "time" ? (Date.now() + minutes * 60 * 1000) : null;
    state.banked = Math.max(0, state.banked - 1); // consume 1 banked surge
    state.aftermathPending = false;
    state.nextCombatRegenPenalty = false;
    applyStateToUI();
    save();
    dispatch("rp:surge:start", { mode: state.surgeMode, startedAt: state.surgeStartedAt, endsAt: state.surgeEndsAt });
    window.dmNotify?.(`Heroic Surge activated (${mode})`);
    if (state.banked !== prevBank) {
      window.dmNotify?.(`RP bank ${state.banked}`);
    }
  }

  function endSurge(reason = "natural") {
    if (!state.surgeActive) return;
    state.surgeActive = false;
    state.aftermathPending = true;           // first save at disadvantage
    state.nextCombatRegenPenalty = true;     // first round next combat: -1 SP regen
    state.surgeEndsAt = null;
    state.surgeStartedAt = null;
    applyStateToUI();
    save();
    dispatch("rp:surge:end", { reason });
    window.dmNotify?.(`Heroic Surge ended (${reason})`);
  }

  function clearAftermath() {
    state.aftermathPending = false;
    applyStateToUI();
    save();
    dispatch("rp:aftermath:cleared", {});
    window.dmNotify?.("Heroic Surge aftermath cleared");
  }

  function tick(now = Date.now()) {
    if (state.surgeActive && state.surgeMode === "time" && state.surgeEndsAt && now >= state.surgeEndsAt) {
      endSurge("timer");
    }
  }

  // --- UI sync
  function applyStateToUI() {
    if (!els.rpValue) return;
    // Update both the text and value so screen readers and any logic
    // reading the `value` property receive the current RP. Using only
    // `textContent` leaves `value` stale, which caused the on-screen
    // number to remain at 0 when a dot was toggled in some browsers.
    const total = state.rp + state.banked * 5;
    const val = String(total);
    els.rpValue.textContent = val;
    // The output element exposes a `.value` property that may be used
    // by CSS `attr(value)` or assistive tech; keep it in sync. Updating
    // the property alone does not update the `value` attribute, which some
    // browsers or CSS selectors may rely on, so set both.
    els.rpValue.value = val;
    els.rpValue.setAttribute("value", val);
    const banked = state.banked;
    els.rpDots.forEach(btn => {
      const v = parseInt(btn.dataset.rp, 10);
      btn.setAttribute("aria-pressed", String(v <= state.rp));
    });
    if (els.bankDots) {
      els.bankDots.forEach(dot => {
        const v = parseInt(dot.dataset.bank, 10);
        dot.setAttribute('aria-pressed', String(v <= banked));
      });
    }
    // Disable controls at their bounds so users receive immediate feedback
    // that no further adjustment is possible. Previously the buttons remained
    // active even when the value was clamped, leading to the impression that
    // they were non-functional.
    if (els.btnInc) els.btnInc.disabled = total >= 10;
    if (els.btnDec) els.btnDec.disabled = total <= 0;
    if (els.rpTrack) els.rpTrack.classList.toggle('maxed', total >= 10);

    if (els.surgeState) {
      els.surgeState.textContent = state.surgeActive ? "Active" : "Inactive";
    }
    if (els.chkSurge) {
      els.chkSurge.checked = state.surgeActive;
      els.chkSurge.disabled = state.surgeActive || state.banked < 1;
    }
    if (els.btnClearAftermath) {
      els.btnClearAftermath.disabled = !(state.surgeActive || state.aftermathPending);
    }
    if (els.tagActive) els.tagActive.hidden = !state.surgeActive;
    if (els.tagAfter) els.tagAfter.hidden = !state.aftermathPending;
  }

  // --- Persistence
  function serialize() {
    return {
      resonancePoints: state.rp,
      resonanceBanked: state.banked,
      resonanceSurge: {
        active: state.surgeActive,
        startedAt: state.surgeStartedAt,
        mode: state.surgeMode,
        endsAt: state.surgeEndsAt,
        aftermathPending: state.aftermathPending
      },
      resonanceNextCombatRegenPenalty: state.nextCombatRegenPenalty
    };
  }
  function deserialize(data) {
    if (!data) return;
    const s = data.resonanceSurge || {};
    state.rp = Number.isFinite(data.resonancePoints) ? data.resonancePoints : 0;
    state.banked = Number.isFinite(data.resonanceBanked) ? data.resonanceBanked : 0;
    let total = state.rp + state.banked * 5;
    if (total > 10) {
      total = 10;
      state.banked = Math.floor(total / 5);
      state.rp = total % 5;
    }
    state.surgeActive = !!s.active;
    state.surgeStartedAt = s.startedAt || null;
    state.surgeMode = s.mode || "encounter";
    state.surgeEndsAt = s.endsAt || null;
    state.aftermathPending = !!s.aftermathPending;
    state.nextCombatRegenPenalty = !!data.resonanceNextCombatRegenPenalty;
  }
  function save() {
    if (window.CC && typeof CC.savePartial === "function") {
      CC.savePartial("resonance", serialize());
    } else {
      localStorage.setItem("cc_resonance", JSON.stringify(serialize()));
    }
  }
  function tryLoadFromApp() {
    if (window.CC && typeof CC.loadPartial === "function") {
      const data = CC.loadPartial("resonance");
      if (data) deserialize(data);
      return;
    }
    try {
      const raw = localStorage.getItem("cc_resonance");
      if (raw) deserialize(JSON.parse(raw));
    } catch {}
  }

  // --- Events
  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // --- Public API (for GM buttons/macros, etc.)
  function exposeHooks() {
    api.get = () => ({ ...state });
    api.setRP = setRP;
    api.trigger = triggerSurge;
    api.end = endSurge;
    api.clearAftermath = clearAftermath;
    api.tick = tick;
    api.load = data => { deserialize(data); applyStateToUI(); };
  }

  // --- Integrations (rolls, saves, checks, SP regen)
  function installIntegrations() {
    // 1) Attack rolls
    if (CC.rollAttack && !CC.rollAttack.__rpWrapped) {
      const base = CC.rollAttack.bind(CC);
      CC.rollAttack = function (opts = {}) {
        const res = base(opts);
        try {
          if (state.surgeActive && res && typeof res.total === "number") {
            const bonus = d4();
            res.total += bonus;
            if (res.breakdown) res.breakdown.push(`+ RP Surge: +${bonus}`);
          }
        } catch {}
        return res;
      };
      CC.rollAttack.__rpWrapped = true;
    }

    // 2) Generic roll wrapper (if app uses a single entry point)
    if (CC.roll && !CC.roll.__rpWrapped) {
      const base = CC.roll.bind(CC);
      CC.roll = function (opts = {}) {
        const out = base(opts);
        try {
          // Apply +1d4 to attacks/saves during surge
          if (state.surgeActive && out && typeof out.total === "number") {
            const isAttack = opts?.type === "attack";
            const isSave = opts?.type === "save";
            if (isAttack || isSave) {
              const bonus = d4();
              out.total += bonus;
              out.breakdown = out.breakdown || [];
              out.breakdown.push(`+ RP Surge: +${bonus}`);
            }
          }
          // Aftermath: first save at disadvantage
          if (!state.surgeActive && state.aftermathPending && opts?.type === "save") {
            if (out && Array.isArray(out.rolls) && out.rolls.length >= 2) {
              // assume out.total used highest; recompute with disadvantage (take lowest)
              const low = Math.min(...out.rolls);
              const mod = (out.modifier || 0);
              out.total = low + mod;
              out.breakdown = out.breakdown || [];
              out.breakdown.push(`Aftermath (disadvantage on first save)`);
            }
            clearAftermath(); // consume one-time penalty
          }
          // Roleplay checks +2 (CHA/WIS/INT only) if flagged
          if (state.surgeActive && opts?.type === "skill" && opts?.roleplay === true) {
            const abil = (opts?.ability || "").toUpperCase();
            if (abil === "CHA" || abil === "WIS" || abil === "INT") {
              out.total += 2;
              out.breakdown = out.breakdown || [];
              out.breakdown.push(`+ RP Surge (roleplay +2)`);
            }
          }
        } catch {}
        return out;
      };
      CC.roll.__rpWrapped = true;
    }

    // 3) Generic rollWithBonus wrapper used across the app
    if (typeof rollWithBonus === "function" && !rollWithBonus.__rpWrapped) {
      const base = rollWithBonus;
      rollWithBonus = function (name, bonus, out, opts = {}) {
        const type = opts.type || "";
        const ability = (opts.ability || "").toUpperCase();
        const roleplay = !!opts.roleplay;

        // Aftermath penalty: first save at disadvantage
        if (!state.surgeActive && state.aftermathPending && type === "save") {
          const r1 = 1 + Math.floor(Math.random() * 20);
          const r2 = 1 + Math.floor(Math.random() * 20);
          const roll = Math.min(r1, r2);
          const total = roll + bonus;
          if (out) out.textContent = total;
          logAction(`${name}: ${r1}/${r2}${bonus>=0?'+':''}${bonus} = ${total} (Aftermath disadvantage)`);
          clearAftermath();
          return total;
        }

        let extra = 0;
        let breakdown = [];

        if (state.surgeActive && (type === "attack" || type === "save")) {
          const b = d4();
          extra += b;
          breakdown.push(`+ RP Surge: +${b}`);
        }

        if (state.surgeActive && type === "skill" && roleplay && ["CHA","WIS","INT"].includes(ability)) {
          extra += 2;
          breakdown.push(`+ RP Surge: +2`);
        }

        const total = base(name, bonus + extra, out, opts);
        if (breakdown.length) {
          try {
            const last = actionLog[actionLog.length - 1];
            last.text += ' ' + breakdown.join(' ');
            renderLogs();
            renderFullLogs();
          } catch {}
        }
        return total;
      };
      rollWithBonus.__rpWrapped = true;
    }

    // 4) SP regeneration integration
    if (CC.SP && typeof CC.SP.getRegenBase === "function" && !CC.SP.getRegenBase.__rpWrapped) {
      const base = CC.SP.getRegenBase.bind(CC.SP);
      CC.SP.getRegenBase = function (...args) {
        let regen = base(...args);
        try {
          if (state.surgeActive) regen += 1;
          if (!state.surgeActive && state.nextCombatRegenPenalty && CC.Combat?.isFirstRound?.()) {
            regen = Math.max(0, regen - 1);
            state.nextCombatRegenPenalty = false; // consume
            save();
          }
        } catch {}
        return regen;
      };
      CC.SP.getRegenBase.__rpWrapped = true;
    }

    // Optional: mark encounter end to end surge automatically
    if (CC.Combat && typeof CC.Combat.onEnd === "function" && !CC.Combat.onEnd.__rpHook) {
      CC.Combat.onEnd(() => {
        if (state.surgeActive) endSurge("encounter-end");
      });
      CC.Combat.onStart?.(() => {
        // noop; nextCombatRegenPenalty handled in SP regen hook via isFirstRound()
      });
      CC.Combat.onEnd.__rpHook = true;
    }
  }

  // --- dice helper
  function d4() { return 1 + Math.floor(Math.random() * 4); }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  return api;
})();

