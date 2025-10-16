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
import { LEVELS } from './levels.js';

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

const AUGMENT_CATEGORIES = ['Control', 'Protection', 'Aggression', 'Transcendence', 'Customization'];
const AUGMENT_GROUP_ORDER = new Map(AUGMENT_CATEGORIES.map((category, index) => [category, index]));
const AUGMENT_SLOT_LEVELS = [3, 6, 9, 12, 15, 19];

const normalizeAugmentTag = tag => {
  if (typeof tag !== 'string') return '';
  const trimmed = tag.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return AUGMENT_CATEGORIES.find(category => category.toLowerCase() === lower) || '';
};

const buildAugmentAvailability = tags => {
  const availability = {};
  const normalized = new Set((Array.isArray(tags) ? tags : []).map(normalizeAugmentTag).filter(Boolean));
  AUGMENT_CATEGORIES.forEach(category => {
    availability[category] = normalized.has(category);
  });
  return { availability, tags: Array.from(normalized) };
};

const createAugment = config => {
  const name = typeof config?.name === 'string' ? config.name.trim() : '';
  const group = typeof config?.group === 'string' ? config.group.trim() : '';
  const summary = typeof config?.summary === 'string' ? config.summary.trim() : '';
  const effects = Array.isArray(config?.effects)
    ? config.effects.map(effect => (typeof effect === 'string' ? effect.trim() : '')).filter(Boolean)
    : [];
  const rawTags = Array.isArray(config?.tags) ? config.tags : [];
  const { availability, tags } = buildAugmentAvailability(rawTags);
  const id = typeof config?.id === 'string' && config.id.trim()
    ? config.id.trim()
    : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `augment-${Math.random().toString(36).slice(2, 8)}`;
  const searchParts = [name, group, summary, ...effects];
  const searchText = searchParts
    .map(part => (typeof part === 'string' ? part.toLowerCase() : ''))
    .filter(Boolean)
    .join(' ');
  return {
    id,
    name,
    group,
    summary,
    effects,
    availability,
    tags,
    searchText,
  };
};

const AUGMENTS = [
  createAugment({
    id: 'tactical-genius',
    group: 'Control',
    name: 'Tactical Genius',
    summary: 'You read probability like a language.',
    effects: [
      'Once per combat, you may reorder the initiative of all allies (declare after rolling).',
      'All allies gain +1 to attack rolls until the start of your next turn.',
    ],
    tags: ['Control'],
  }),
  createAugment({
    id: 'adaptive-armor-protocol',
    group: 'Control',
    name: 'Adaptive Armor Protocol',
    summary: 'Nanoweave plating learns from every hit.',
    effects: [
      'At the start of combat, choose one damage type: fire, cold, acid, lightning, psychic, or force.',
      'You gain resistance to that type until combat ends.',
    ],
    tags: ['Control', 'Aggression'],
  }),
  createAugment({
    id: 'resilient-soul',
    group: 'Control',
    name: 'Resilient Soul',
    summary: 'Even on your knees, you fight on.',
    effects: [
      'When reduced to 0 HP, remain conscious until the end of your next turn.',
      'You can still act, but collapse immediately afterward if not healed.',
    ],
    tags: ['Control', 'Customization'],
  }),
  createAugment({
    id: 'overwatch-specialist',
    group: 'Control',
    name: 'Overwatch Specialist',
    summary: 'Nothing escapes your aim.',
    effects: [
      'Reaction: when an ally within 30 ft. is attacked, make one ranged power attack against the attacker.',
      'Once per round.',
    ],
    tags: ['Control', 'Aggression'],
  }),
  createAugment({
    id: 'protocol-override',
    group: 'Control',
    name: 'Protocol Override',
    summary: 'You command the field itself.',
    effects: [
      'Once per session, declare “Override.”',
      'For one minute, all allies gain advantage on Tech and Investigation checks; all enemies within 30 ft. suffer disadvantage on Stealth checks.',
    ],
    tags: ['Control'],
  }),
  createAugment({
    id: 'inspire-resolve',
    group: 'Protection',
    name: 'Inspire Resolve',
    summary: 'Your courage radiates like a beacon.',
    effects: [
      'Once per session, all allies within 30 ft. gain +1d4 to all rolls for one round.',
      'You gain +1 to CHA saves permanently.',
    ],
    tags: ['Protection', 'Customization'],
  }),
  createAugment({
    id: 'protectors-vow',
    group: 'Protection',
    name: 'Protector’s Vow',
    summary: 'You always take the hit meant for another.',
    effects: [
      'Reaction: when an ally within 15 ft. is hit, halve the damage and take the remainder.',
      'Once per round.',
    ],
    tags: ['Protection'],
  }),
  createAugment({
    id: 'field-medic',
    group: 'Protection',
    name: 'Field Medic',
    summary: 'A calm hand in the chaos.',
    effects: [
      'Spend 1 SP as a bonus action to heal an adjacent ally for 1d6 HP.',
      'Once per ally per combat.',
    ],
    tags: ['Protection'],
  }),
  createAugment({
    id: 'public-icon',
    group: 'Protection',
    name: 'Public Icon',
    summary: 'Your name alone changes hearts.',
    effects: [
      'Add +2 to Persuasion checks involving civilians or sponsors.',
      'Once per session, reroll a failed Persuasion roll.',
    ],
    tags: ['Protection'],
  }),
  createAugment({
    id: 'defenders-rally',
    group: 'Protection',
    name: 'Defender’s Rally',
    summary: 'When others fall, you rise higher.',
    effects: [
      'The first time an ally drops to 0 HP each combat, you regain 1d6 SP and all allies gain +2 TC until end of next round.',
    ],
    tags: ['Protection'],
  }),
  createAugment({
    id: 'adrenal-surge',
    group: 'Aggression',
    name: 'Adrenal Surge',
    summary: 'You metabolize adrenaline into firepower.',
    effects: [
      'When you drop an enemy to 0 HP, regain 1d6 SP.',
      'Once per turn.',
    ],
    tags: ['Aggression'],
  }),
  createAugment({
    id: 'assassins-veil',
    group: 'Aggression',
    name: 'Assassin’s Veil',
    summary: 'Vanishing is second nature.',
    effects: [
      'After disabling an enemy, become invisible until the start of your next turn.',
    ],
    tags: ['Aggression'],
  }),
  createAugment({
    id: 'power-syphon',
    group: 'Aggression',
    name: 'Power Syphon',
    summary: 'You feed on the backlash.',
    effects: [
      'When hit by an energy-type attack, regain 1 SP.',
      'If the attack misses, the attacker loses 1 SP instead.',
    ],
    tags: ['Aggression', 'Control'],
  }),
  createAugment({
    id: 'suppressive-fire',
    group: 'Aggression',
    name: 'Suppressive Fire',
    summary: 'Fear is a weapon.',
    effects: [
      'Ranged powers impose disadvantage on enemy attack rolls until your next turn.',
    ],
    tags: ['Aggression'],
  }),
  createAugment({
    id: 'nullpulse-reflex',
    group: 'Aggression',
    name: 'Nullpulse Reflex',
    summary: 'Pain makes you faster.',
    effects: [
      'When you fail a saving throw, immediately make a melee attack or cast a 1 SP power as a reaction.',
    ],
    tags: ['Aggression', 'Control'],
  }),
  createAugment({
    id: 'chrono-anchor',
    group: 'Transcendence',
    name: 'Chrono Anchor',
    summary: 'You exist slightly out of sync.',
    effects: [
      'Once per session, rewind one round of your personal actions.',
      'Restore SP and HP to the state they were in then.',
    ],
    tags: ['Transcendence'],
  }),
  createAugment({
    id: 'reality-fracture',
    group: 'Transcendence',
    name: 'Reality Fracture',
    summary: 'The world hesitates around you.',
    effects: [
      'Once per day, impose disadvantage on any one d20 roll after seeing the result.',
    ],
    tags: ['Transcendence'],
  }),
  createAugment({
    id: 'catalyst-conduit',
    group: 'Transcendence',
    name: 'Catalyst Conduit',
    summary: 'Your body becomes the prism.',
    effects: [
      'Once per session, when reduced below half SP, instantly restore all SP.',
    ],
    tags: ['Transcendence'],
  }),
  createAugment({
    id: 'astral-step',
    group: 'Transcendence',
    name: 'Astral Step',
    summary: 'You move between photons.',
    effects: [
      'Teleport up to 10 ft. as a bonus action each round if you have line of sight.',
    ],
    tags: ['Transcendence'],
  }),
  createAugment({
    id: 'mind-fortress',
    group: 'Transcendence',
    name: 'Mind Fortress',
    summary: 'A perfect mind under cosmic symmetry.',
    effects: [
      'Gain advantage on WIS and INT saves vs. psychic or illusion effects.',
    ],
    tags: ['Transcendence'],
  }),
  createAugment({
    id: 'battle-hardened',
    group: 'Customization',
    name: 'Battle Hardened',
    summary: '',
    effects: [
      'Gain +1 to STR and CON saves.',
      'Once per day, reduce damage from one physical attack to 0.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'evasive-footwork',
    group: 'Customization',
    name: 'Evasive Footwork',
    summary: '',
    effects: [
      'Gain +1 TC while moving 20+ ft. during your turn.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'overcharge-matrix',
    group: 'Customization',
    name: 'Overcharge Matrix',
    summary: '',
    effects: [
      'Once per combat, double the damage dice of one power. Costs +1 SP.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'telepathic-coordination',
    group: 'Customization',
    name: 'Telepathic Coordination',
    summary: '',
    effects: [
      'Allies within 30 ft. may reroll a single 1 on attack or save once per combat.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'luck-vector',
    group: 'Customization',
    name: 'Luck Vector',
    summary: '',
    effects: [
      'Once per session, reroll any die (must keep the new result).',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'quickdraw',
    group: 'Customization',
    name: 'Quickdraw',
    summary: '',
    effects: [
      'You automatically act first in the first combat round unless surprised.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'empathic-resonator',
    group: 'Customization',
    name: 'Empathic Resonator',
    summary: '',
    effects: [
      'When an ally within 10 ft. takes damage, you may take half and gain +1 SP.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'elemental-amplifier',
    group: 'Customization',
    name: 'Elemental Amplifier',
    summary: '',
    effects: [
      'Choose one damage type; once per combat, a power of that type deals +1 damage die.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'legend-in-motion',
    group: 'Customization',
    name: 'Legend in Motion',
    summary: '',
    effects: [
      'Once per session, perform a cinematic stunt that would normally be impossible; it automatically succeeds within reason.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
  createAugment({
    id: 'versatile-mind',
    group: 'Customization',
    name: 'Versatile Mind',
    summary: '',
    effects: [
      'Gain proficiency in one new skill and one new language.',
    ],
    tags: AUGMENT_CATEGORIES,
  }),
];

const AUGMENT_BY_ID = new Map(AUGMENTS.map(augment => [augment.id, augment]));

function sortAugments(list) {
  return list.slice().sort((a, b) => {
    const groupA = AUGMENT_GROUP_ORDER.has(a.group) ? AUGMENT_GROUP_ORDER.get(a.group) : AUGMENT_CATEGORIES.length;
    const groupB = AUGMENT_GROUP_ORDER.has(b.group) ? AUGMENT_GROUP_ORDER.get(b.group) : AUGMENT_CATEGORIES.length;
    if (groupA !== groupB) return groupA - groupB;
    return a.name.localeCompare(b.name, 'en-US', { sensitivity: 'base' });
  });
}

function filterAugmentsByTags(tags = []) {
  const normalized = new Set((Array.isArray(tags) ? tags : []).map(normalizeAugmentTag).filter(Boolean));
  if (!normalized.size) return AUGMENTS.slice();
  return AUGMENTS.filter(augment => augment.tags.some(tag => normalized.has(tag)));
}

function searchAugments(term = '', tags = []) {
  const normalizedTerm = typeof term === 'string' ? term.trim().toLowerCase() : '';
  const tagFiltered = filterAugmentsByTags(tags);
  if (!normalizedTerm) return tagFiltered;
  return tagFiltered.filter(augment => augment.searchText.includes(normalizedTerm));
}

if (typeof window !== 'undefined') {
  window.AugmentLibrary = {
    all: () => AUGMENTS.slice(),
    categories: () => AUGMENT_CATEGORIES.slice(),
    filterByTags: filterAugmentsByTags,
    search: (term, tags) => searchAugments(term, tags),
  };
}

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
const WELCOME_MODAL_PREFERENCE_KEY = 'cc:welcome-modal:hidden';
const TOUCH_LOCK_CLASS = 'touch-controls-disabled';
const TOUCH_UNLOCK_DELAY_MS = 250;
let welcomeModalDismissed = false;
let welcomeModalQueued = false;
let touchUnlockTimer = null;
let waitingForTouchUnlock = false;

try {
  if (typeof localStorage !== 'undefined') {
    welcomeModalDismissed = localStorage.getItem(WELCOME_MODAL_PREFERENCE_KEY) === 'true';
  }
} catch {}

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
  const skipButton = launchEl ? launchEl.querySelector('[data-skip-launch]') : null;
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

  if(skipButton){
    skipButton.addEventListener('click', event => {
      event.preventDefault();
      finalizeLaunch();
    });
  }

  window.addEventListener('launch-animation-skip', finalizeLaunch, { once: true });

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
    if(el.id==='player-tools-tab') return;
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
    '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'
    + 'tK2Fkc/OAYCT8QGA0hQBgF43AYANWAGAy3UBgP9/AYD/fwGA/38BgP9/AYD/f4Gf/3+pw/9/Yur/fwYS/3/nOP9/W12TfOF9'
    + 'pWb/fyZQ/3/nOf9/oST/f+4Q/38///9/3O//f+bi/39V2P9//8+8cKDJklfdxGU+UMFGJpK+FBBAvHX8BrrH66G3K97ptIbT'
    + '0rGHy2iuucXTqpDBUad2vjGk37vOoVe5hKCItqygRbOVoo+veaaPq32slqertBGk8L5/oRvLZaDg2D+h3udypKD3RKqmB9Ky'
    + 'bhcMvncms8tNNFvbjEB37OhKXP4wU1IQTVmfIUpdlzFIX6Q/g19VS0heYlTvW7Ja1lhbXldVm1/CUdReVE59XDhLGll9SC1V'
    + 'FUYoUdpDYE2KQQdK0z4kR1M7lESgNglCVTARPxgoIzuiHa01yBAeLoEB+yPs7+0WTtzOBhjHsvPgsO7dX5oZxmaECq0BgMmT'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA8IgBgIemZpwZxz7AlunN5tQMbQ6jL3E12FAvWlhvH3v/f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/ty/3/hWbZrp0BEVWUo5T7/EVgpH/4+FSrtEQNI3yXzYNSh5SjM'
    + 'h9otxrXR48Hryra+08UavAnClLklv862wryWs4m66a8yuO2rkLXvp46yW6Q0r62hpKtsoBeoFKHapA2kRKKgqbGg77F+oOy8'
    + '+6Feymel3dnuqt7qn7K4/G68tA4wyBggoNU2MGDkdD4B9GBKAgSsU+QTPFojIyFeSTGVX+w9+F67SMBcflFxWRpYi1WQXIRR'
    + '/l60TZlfT0qsXmNHjFzORJdZR0InVl4/kVKNOxZPQDblS+cuFEkFJZtGPRhaRGUIF0KN9X8/AeA2PFXI0TdYr+wxD5YnKgGA'
    + 'OCABgOsTAYAwBQGAHPQBgOzgAYAGzAGA+rUBgHifAYBNiQGAAYBTmQGA2rwBgDrjAYDTCgGA9zEBgPtWAYBSeAGA/38BgP9/'
    + 'AYD/f7uC/3+Bn/9/fb//f6Th/3/QBP9/0yf/f39JN3W0aC9c/3/sQv9/iSr/f/AT/3/Q//9/le7/f2vg/39A1f9/zsz/f6TG'
    + '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'
    + 'q3jOBpJisvMQTO7d8TUZxusgCq2ODcmTRvwBgFLtAYDN4AGAqNYBgLTOAYCmyAGAI8QBgMTAAYAhvgGA2bsBgJu5Zpwptz7A'
    + 'YbTN5jixbQ7CrXE1LKovWramH3uxo/9/eqH/f22g/3/ioP9/IqP/f2in/3/Rrf9/Y7b/fwTB/3+AzftyhtvhWbHqp0CJ+mUo'
    + 'jQr/ETwaH/4VKSrtqDZI35RCYNSSTCjMdlQtxi9a48HLXba+cl8avGNflLntXc62a1uWszlY6a+wVO2rHlHvp71NW6SySq2h'
    + 'B0hsoKtFFKFyQw2kFkGgqUI+77GSOuy8nDVeyv0u3dldJt7qehu4/C8OtA56/hggf+w2MI3YdD4cw2BKyKysU1CWPFqIgCFe'
    + 'AYCVXwGA+F4BgMBcAYBxWQGAi1UBgIRRAYC0TQGAT0oBgGNHAYDORA2OR0JCrF4/Q82NO/nvQDY5E+cu1DUFJZ9WPRiFdGUI'
    + '/3+N9f9/AeD/f1XI/39Yr/9/D5b/fwGA/38BgP9/AYD/fwGA/38BgIt9AYCpZwGAK1EBgOU6AYCRJQGAyRFTmQAA2ryC8Drj'
    + 'b+PTCsPY9zFV0PtW4MlSeA3F/390wf9/r77/f1q8/38guv9/vrf/fwu1/3/4sf9/ka7/f/yqN3V4py9cUqTsQuShiSqMoPAT'
    + 'oaDQ/3Sile5ApmvgK6xA1UC0zsxuvqTGhMo5wjjY+L4q51S85vbQuewGE7e5FuazziVDsLQzS6wIQEqoe0qmpNtS36ESWXeg'
    + 'J13toDtfraOJXwGpXV4QsQ9c0bv9WA3JgVVi2OtRR+l7ThX7W0sVDZtIjx4wRtAu80NAPadBZUn3PvBSgTvAWd824V2pMItf'
    + 'hCgZXykeAl1rEcZZQALpVcTw4VE83QhOFciZSuaxo0dkmwlFYIWEQgGAqT8BgPM7AYDPNgGAqy8BgAgmAYCHGQGA9gkBgGL3'
    + 'AYAQ4gGAjcquh6SxHKVXmJLFAYD+5wGAOgsBgBUuAYBiTwGACG4BgP9/AYD/fwGA/38BgP9/AYD/f0qW/397uf9/qd//fzgH'
    + '/395Lv9/vlP/f3p1uGz/f0pW/3/mP/9/TCr/fx4W/3/ZA/9/0vP/fzHm/3/72v9/ENJwdzDLfF4GxjNFL8KxLEO/5hXdvIYB'
    + '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'
    + 'QqESImWgTgwUoTL5mKMT6SeoBdzcruLRuLdTyp3C3cRUz+/Aid33vdLsbLu4/Ny4uAz5tVEcoLIFK9iuYzjTqhBE5qbGTYOj'
    + 'XlUsocxaZaAhXqWhiF9OpUNfnqujXau0A1tcwMFXac4yVGHepFCu701NpAFPSokTsUelJF1FTTQjQ/RBvUAuTdE9vFX6OY5b'
    + '0DTBXvAtm18FJYFezxnvWy4Malgn/HFU4ulxULTVu0wawHhJtqmpRkiTIUQBgIpBAYBwPgGARzoBgHk0AYB6LAGA1SEBgDkU'
    + 'AYCLAwGA7O8BgLrZAYCbwfiRbqiesESP69EBgMb0AYACGAGAbjoBgORaAYBSeAGA/38BgP9/AYD/fwGA/38fgv9/paL/fxnH'
    + '/3/67f9/nhX/f1c8/39/YKB6/3+cZP9/Gk7/f+s3/3/EIv9/PA//f8D9/3+V7v9/1+H/f3zX/39Xz3tuIclEVX/EJDwJwSok'
    + 'Wb4uDg280PrQuWrqZbcV3aW0sdKFsevKFa5JxX+qPsEDpza+8aOmu6OhGrl3oEG2xaDzstmiNK/upjGrJa09p4W1yaP4v1Sh'
    + 'TMxjoDLab6FH6d2kFPnuqhoJvLPWGDK/yCcMzXw13dySQRLuwEsAANVT7hHAWSMjjF30Ml9fzkB0X0RMHF4SVa5bI1uIWJFe'
    + 'BFWdX29RrF4ITjdc9UrDWEJIz1TgRcxQpkMNTVFBv0mMPuZG8zpaRCA2ykGrL8I+PSe3OpEcFTV+D08tAADrIjfulhVv2jAF'
    + 'G8XS8dWu1ttXmNzDdYK8qgGAhZEBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYB7iwGAYamBnyzKqcPH7GLq'
    + 'BxAGEr0y5zi+U1td83Hhff9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/vHB4f5JXsGllPjhTRibkPBQQ'
    + 'cyd1/IETx+uGASve0fGG04bkh8uj2bnFA9GQwWTKdr5uxd+7vsFXueq+iLaOvEWzVbqPr/m3j6tOtZanQ7IRpOKuf6FQq2Wg'
    + 'x6c/oZWkcqQTokSqnaDSso6gDL41orPL0aVb24qrd+xus1z+bL1SEFjJnyHr1pcxxOWkP3P1VUt3BWJUTxWyWnokW16AMptf'
    + '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'
    + '5g5H6n4ReeuFE3bt7hQu8LMVivPWFWj3XxWf+1oUAADbEl0E+BCGCMgOTwxmDJAP7AkqEnEHCBQLBRwVzAJnFcMA8RT6/swT'
    + 'dP0SEjP84Q8z+14Nb/qsCtz57gdw+UMFH/nFAuD4iQCn+J3+bPgF/Sv4wvvg98z6jPcZ+jH3mfnV9j75gfb4+Dz2uPgQ9nX4'
    + 'B/Yo+Cn2z/d+9mz3CfcG98z3pvbI+Fv29/kw9lL7M/bR/G/2aP7t9gkAsfepAbz4OgMH+q4Ei/v9BTr9HAcD/wYI0wC4CJkC'
    + 'MglDBHYJwAWKCQQHdQkGCEAJwgjzCDgJmQhtCTkIaQncBzkJhQfpCDgHhgj0BhwItwa1B3sGWAc5BgcH6QXABoAFfgb0BDcG'
    + 'PQTfBVMDaAUxAsUE1QDoA0L/yQJ6/WEBifux/3v5vv1g95X7TPVG+VLz6vaJ8Zv0BPB48tnunvAY7ivvzu047gbu2u3E7h/u'
    + 'BvAN78bxofD589DyjvaH9XD5qviG/Bj8tv+t/+QCPwP1BasG0AjJCVwLfAyFDacOPQ85EHcQKBEwEXIRZhEdESAROBBnENkO'
    + 'SQ8XDdcNDwslDOAIRwqkBlEIdgRXBmwCawSXAJsCAv/0ALH9fv+m/D7+2vs0/UX7X/zb+rv7kPo/+1f65fok+qL68Plv+rP5'
    + 'Qvpt+RX6Hvnk+c34rPmB+G35Q/gn+R/44Pge+J34S/hl+K34P/hG+TL4F/pG+B37gPhR/OP4p/1z+RT/L/qHABP78wEb/EoD'
    + 'QP19BHr+gwW+/1UGAQHuBjwCUAdiA34HbAR+B1MFWQcRBhoHpAbLBgsHdgZHByMGXQfYBVMHlgUtB1wF9AYnBbAG7wRlBqoE'
    + 'GwZPBNYF0QOYBSYDYQVIAjEFMgECBeP/0ARf/pUEsPxJBOP65AMJ+WADOve2Aor14gES9OMA6vK5/yTyZ/7S8fP8//Fo+6/y'
    + '0fnh8zz4jPW49qP3VvUP+iX0t/w0837/kfJGAkjy8QRe8mIH2fKACbjzNwv39HcMjvY5DXH4ew2Q+kIN2/yYDD3/jgugATgK'
    + '8wOqCB8G+wYTCEIFwQmTAxoL/wEYDJIAtQxY//AMUf7ODID9VAzh/I0LbPyFChn8Swnf++0HtPt7Bo77AwVn+5MDO/s3Agf7'
    + '9wDN+tz/kfrn/lf6G/4p+nf9DPr4/Av6mPwr+lH8cvoe/OP69/t++9f7QPy4+yX9l/sl/nD7Nv9E+0wAFPtdAeL6XwKy+kcD'
    + 'iPoNBGr6rARe+iEFaPpsBY36kAXP+pEFMft3BbL7SAVQ/A0FCf3NBNf9jgS1/lUEnP8iBIMA9gNlAc4DOgKkA/sCcgOkAy8D'
    + 'MQTVAp4EWwLtBLsBHQXzADEFAgAsBez+FAW1/e0EaPy9BBH7iATB+VIEiPgfBHb38QOc9skDCfalA8n1gwPk9WADXfY4AzT3'
    + 'BQNi+MMC3flsApX7/AF6/XABdf/GAHEBAABZAx7/GQUl/p4GGv3aBwb8wgjy+lAJ6fmECfT4YAkf+OwIdPczCP32RAfA9i0G'
    + 'xPb/BAv3yQOV95kCYPh8AWj5ewCj+p7/Cfzk/oz9UP4h/+D9uQCO/UcCVP29Ayz9EAUO/TUG9fwjB9z81QfA/EcInvx5CHj8'
    + 'bAhR/CUIK/yqBwz8Awf5+zoG+PtZBQ38aQQ8/HQDh/yDAu/8ngFw/csACf4PALP+bv9p/+b+IQB4/tcAI/6DAeP9HQK0/aEC'
    + 'k/0LA3r9WQNn/YsDVf2jA0L9pAMs/ZIDE/1zA/f8SwPa/CADvvz2AqX8zgKS/KwCivyOAo/8cgKk/FYCyvw2AgP9CwJP/dIB'
    + 'rf2GARv+IgGW/qYAGv8QAKX/ZP8vAKP+twDV/TcBAf2sATL8EgJw+2cCyPqqAkL62gLn+fgCv/kFA8/5AwMY+vUCmfreAlD7'
    + 'wQI0/KACPv1/AmH+YAKR/0MCwQAqAuQBEwLvAv4B1wPpAZIE0gEbBbUBbwWRAY0FYgF4BScBNAXdAMgEgwA9BBkAmwOj/+sC'
    + 'H/84ApL+iQEA/uUAbv1SAOL80/9g/Gr/7/sX/5X71/5V+6r+M/uK/jL7df5V+2b+mfta/v/7T/6E/EH+Iv0y/tb9IP6Y/g3+'
    + 'Y//7/S4A7f30AOX9rgHm/VYC8/3nAgz+XAM0/rQDav7sA63+BQT6/gAEUf/eA6z/pAMIAFUDYgD2ArYAjAICARwCQQGpAXMB'
    + 'OQGYAc8ArgFuALgBGAC2Ac//rAGS/5sBYf+GATz/bwEg/1kBDP9FAf/+MwH3/iMB8P4UAev+BgHm/vYA4P7iANn+yQDR/qcA'
    + 'yf59AMH+SQC6/gwAtv7I/7X+e/+5/iv/w/7a/tP+i/7p/kT+Bv8I/ij/2f1P/7z9e/+z/an/vv3X/979BQAR/jEAVv5aAKn+'
    + 'fgAH/50AbP+2ANL/yAA1ANQAkwDbAOUA3AAqAdgAXwHRAIMBxwCWAbwAmQGwAIwBowByAZgATgGNACIBhADyAHsAwABzAI8A'
    + 'awBhAGQAOABbABUAUgD5/0YA4v85ANL/KwDH/xoAwP8IALz/9v+7/+P/vP/Q/73/v/+//6//wP+i/8L/mf/E/5T/xf+S/8j/'
    + 'lf/L/5z/z/+l/9T/sv/a/8D/4f/P/+j/3f/v/+r/9f/1//v//P/+/wAAAAA=',
  warn:
    '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'
    + '6/py+gX6pPlQ+Qn5zvig+H34Z/hc+Fz4Zvh6+Jj4v/ju+CT5Yvmm+fD5P/qT+uz6SPuo+wr8b/zW/D/9qv0V/oL+7/5c/8r/'
    + 'NgCjABABfAHnAVECuQIfA4QD5QNEBKAE+QRNBZ0F5wUtBmwGpQbXBgEHIwc9B00HVAdRB0MHKgcHB9cGnQZWBgQGpgU9BcgE'
    + 'SQS/AysDjgLoATsBhwDO/xD/T/6L/cf8BPxE+4f6z/ke+Xb41/dE9772Rfbd9YX1P/UM9e304vTs9Az1QfWN9e71ZPbw9pD3'
    + 'Q/gJ+eH5yPq++8H8zv3l/gIAJAFJAm4DkQSvBcYG1QfXCMsJsAqBCz8M5gx2DewNRw6HDqkOrw6WDl8OCQ6WDQYNWQyRC64K'
    + 'swmiCHsHQQb4BKADPgLTAGT/8f1//BH7qflM+Pv2uvWL9HHzcPKI8b3wEPCC7xbvze6m7qTuxu4N73fvBfC18Ibxd/KG87H0'
    + '9fVR98H4QvrR+2v9Df+yAFkC/QObBS8HtggsCo8L2gwMDiIPGRDvEKIRMRKaEtwS9hLpErQSVxLTESkRWhBpD1YOJQ3XC28K'
    + '8AheB7wFDQRUApYA1/4Z/WD7sfkP+H32/vSX80ryGvEJ8BnvTu6n7Sjt0Oyh7JvsvuwJ7X3tGO7Y7rzvw/Dq8S7zjPQD9o73'
    + 'KvnU+oj8Q/4AALwBdAMkBcgGXAjeCUoLnQzUDe0O5g+9EG8R/BFjEqISuhKqEnMSFRKSEekQHhAyDycO/wy9C2MK9gh3B+sF'
    + 'VAS2AhUBdf/X/UD8s/o0+cX3avYl9fnz6fL18SHxbfDc723vIu/77vjuGe9d78PvS/Dz8Ljxm/KX86z01fUS91/4uPkc+4f8'
    + '9v1l/9IAOgKbA/AEOAZwB5QIpQmeCn4LRAzvDHwN7Q0/DnIOhw59DlYOEQ6wDTMNnQzvCyoLUApkCWcIXQdGBicFAATWAqkB'
    + 'fgBW/zT+Gf0I/AP7DPol+VD4jfff9kb2xPVY9QT1x/Si9JX0n/TA9Pf0RPWk9Rj2nvY099n3i/hJ+RD64Pq2+5D8bP1J/ib/'
    + '///TAKIBaQInA9sDhAQgBa8FLwahBgMHVQeYB8oH7Qf/BwII9gfbB7IHfAc5B+sGkgYvBsQFUQXYBFkE1gNPA8cCPgK0ASwB'
    + 'pgAiAKP/KP+y/kH+1/1z/Rf9wvx1/DD88/u++5H7bPtP+zr7LPsl+yb7Lfs7+077Z/uF+6n70Pv8+yv8XvyT/Mv8Bv1D/YH9'
    + 'wf0C/kX+iP7M/hD/Vf+Z/97/IgBmAKoA7gAxAXMBswHzATICbgKpAuICGQNNA34DrAPXA/4DIQQ/BFkEbQR8BIYEiQSHBH4E'
    + 'bgRXBDkEFAToA7UDewM5A/ECogJNAvIBkQErAcEAUgDi/23/9/6A/gj+kv0c/an8OvzP+2n7Cfuw+mD6GPrZ+aX5e/ld+Uz5'
    + 'RvlN+WL5g/mx+e35NfqK+uz6WfvQ+1P83vxy/Q7+sP5X/wEArgBdAQwCuQJkAwoEqgRDBdMFWgbWBkUHpwf7Bz8IdAiYCKsI'
    + 'rQicCHoIRggBCKsHRAfNBkYGsgUQBWIEqgPoAh8CTwF7AKX/zf72/SH9UPyF+8L6Cfpb+bn4Jfig9yz3yvZ69j72FfYB9gL2'
    + 'GPZC9oH21PY797X3Qfjd+Ir5RPoM+977u/yf/Yj+dv9lAFUBQwItAxAE7QS/BYYGPwfqB4UIDgmECecJNQptCpAKnAqSCnIK'
    + 'PArwCY8JGgmRCPcHSweQBsgF8gQTBCsDPAJIAVIAXf9n/nb9ivyl+8r6+vk3+YP43/dM98z2X/YH9sT1l/WA9YD1lfXB9QL2'
    + 'WPbC9j/3z/dv+B/53fmn+nz7Wfw+/Sf+E/8AAOwA1QG6ApcDbAQ3BfYFpwZJB9sHWwjKCCUJbAmfCb4Jxwm8CZwJaQkiCcgI'
    + 'XAjfB1IHtwYPBlsFnQTXAwoDOAJkAY4Auf/m/hf+Tf2L/NL7I/uA+ur5Yvnp+ID4KPji9633ivd593r3jvey9+j3L/iF+On4'
    + 'XPnb+Wb6+/qZ+z786vyZ/Uz+AP+1/2YAFgHBAWcCBQObAycEqQQgBYoF6AU3BnkGrAbRBucG7gbnBtEGrgZ9BkAG9wWiBUMF'
    + '2gRpBPEDcwPvAmcC3QFSAcUAOgCy/yv/qf4s/rX9RP3c/Hv8JPzW+5L7Wfsq+wb77fre+tv64vrz+g77Mvtg+5X70/sY/GP8'
    + 's/wJ/WL9v/0e/n7+3/5B/6H/AABbALUACwFcAakB8QEzAm8CpQLUAvwCHgM4A0wDWQNfA14DVwNKAzcDHwMCA98CuQKOAmEC'
    + 'MAL9AcgBkQFaASEB6QCxAHkAQwANANv/qv97/07/JP/9/tn+uP6b/oH+av5W/kX+OP4u/if+I/4i/iP+J/4u/jb+Qf5O/lz+'
    + 'bP5+/pD+pP65/s/+5v79/hX/Lf9F/17/d/+Q/6n/wv/b//T/DAAkADwAVABrAIIAmQCvAMQA2QDsAP8AEQEiATIBQQFPAVsB'
    + 'ZQFuAXYBewF/AYEBgQF+AXoBcwFrAWABUgFDATEBHQEHAe8A1gC6AJwAfQBdADwAGQD3/9P/r/+L/2f/RP8i/wD/4P7B/qT+'
    + 'iv5x/lv+SP44/iv+If4b/hj+Gf4d/iX+Mf5A/lP+af6C/p7+vv7g/gT/Kv9T/33/qP/U/wAALQBZAIYAsQDbAAMBKgFOAXAB'
    + 'jwGqAcMB2AHpAfYB/wEFAgYCAwL8AfEB4QHPAbgBngGBAWEBPgEYAfEAyACdAHIARgAZAO7/wv+X/23/Rf8e//r+2P65/p3+'
    + 'hP5v/l3+Tv5E/j3+Ov47/j/+SP5T/mL+df6K/qL+vf7Z/vj+Gf86/13/gf+l/8n/7P8OADAAUQBxAI8AqwDFANwA8QADARMB'
    + 'IAEqATEBNQE3ATYBMgErASIBFwEKAfsA6gDYAMUAsACbAIUAbwBaAEQALwAaAAYA9P/i/9L/w/+2/6r/oP+X/5H/jP+I/4f/'
    + 'h/+I/4v/j/+U/5r/of+p/7H/uf/C/8r/0//b/+P/6v/w//X/+v/9////AAA=',
  error:
    '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'
    + 't6+0pQacwpL+ic+BAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYDyhG2OwZjco6ivEbz+yFfWAeTh8d7/2Q26G2Qp'
    + 'vjasQxZQ5VsCZ1lx13r/f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f5h+dna/bYdk5lruULdGVjzgMWgnBB3FEr4I'
    + '//6W9ZLs/ePi20rUPM29xs/Adruxtn+y3q7IqzmpLKeYpXakvqNmo2ajtaNKpBylIqZWp66oJqq3q1ytEq/WsKaygrRptl24'
    + 'YLp0vJ++5MBIw9HFhchpy4PO2tFz1VLZfd344cXm5utc8Sj3SP24A3UKehHAGD0g6Se4L583kD98R1RPCVeJXsNlp2wicyN5'
    + 'mn7/f/9//3//f/9//3//f/9//3//f/9//38QfWp2225rZiZdGlNXSO889TB+JKEXdQoU/ZbvFeKs1HTHiboDrvyhi5bIi8iB'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgEiAxonvk66e6qmOtYHBqs3y2UDmffKS/mgK7RULIbIrzzVVPzZI'
    + 'Z1DeV5VehmSuaQtunnFodG52tXdEeCN4XXf6dQh0kXGibkhrkGeHYzpftVoEVjJRSkxVR1xCZz19OKMz3C4uKpklHiG/HHkY'
    + 'ShQxECoMMQhBBFcAbvyA+In0hfBw7EboBeSq3zXbptb90TzNZ8iAw46+mLmjtLqv5aovpqKhS502mW+VA5L/jnCMYoriiPqH'
    + 'tYcdiDqJE4uujRCROpUumuqfbKavrau1WL6rx5nREtwG52XyG/4SCjgWdiK0Lto60UaBUtNdrmj8cqh8/3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9/xXhqblljqldzS80+0DGVJDYXzQl1/ETvVeK+1ZbJ873osoio454IlgOO34akgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgMaCVIhljuqU0JsIo4GqKbLxucrBpMly0SjZueAb6EXvL/bS/CkDMgnoDksUWhkXHoMi'
    + 'oiZ3KgYuVTFpNEc39jl6PNo+G0FCQ1JFUUdBSSRL+0zHTohQPFLgU3FV61ZIWINZlFp1Wx5chVykXHBc4lvxWpRZxVd8VbJS'
    + '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'
    + 'p8AavIy3A7OGrhuqzaWioaSd3ZlWlhmTMJCljYGLz4mXiOGHt4ceiB+JvYr+jOWPdZOul5CcGqJKqBmvhLaEvg/HHNCg2ZDj'
    + '3u17+FgDZw6VGdEkCjAtOyhG6FBbW29lEm8zeP9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3/WeoNx'
    + 'kmcVXR1SvEYFOwov4SKdFlAKEv7x8QTmW9oJzx7Eq7m+r2WmrJ2flUaOqYfRgQGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + '5IDHhR6L3ZD4lmCdCqToqu6xD7k/wHPHoM671b3cm+NP6tLwHfct/fsCiAjRDdMSjxcFHDYgJSTUJ0Yrfy6BMVM09zZzOco7'
    + 'AT4dQCFCEUTvRb9HhEk9S+1MlE4wUMNRSVPAVCVWdVerWMJZtlp/WxlcfVykXIhcIVxqW1xa8VgjV+1USlI2T69LsEc6Q0s+'
    + '5DgGM7Qs8SXDHi8XPA/yBl3+g/Vy7DXj2dls0PzGmb1QtDOrUKK4mXqRpolKggGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgP+EeY2llnOg1qq/tRzB3Mzs2DrlsvFA/tEKURerI84vpTseRydSr1ynZgBwq3j/f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3/3f8t4InELaZZg0lfPTpxFSDzkMn4pIyDjFsoN5AQ9/N/z0+sj5NXc79V3z3LJ4cPGviS6'
    + '+LVDsgGvMazPqdWnQKYJpSukoKNho2ijrqMtpN6ku6W+puKnI6l6quWrYa3prn2wG7LCs3O1LbfyuMO6pLyWvp7AvsL7xFnH'
    + '28mHzGDPbNKs1SfZ3dzU4Azlh+lI7k3zlvgi/u4D+Qk+ELcWYB0xJCMrLjJIOWhAg0eOTn5VRlzaYi5pNW/idCp6AH//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f0J/pnlKczVsbmT/W/FST0koP4g0fykcHnASjQaF+mruTuJF1mHKtr5Ws1Oov52skyiK'
    + 'RIEBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgCeAn4iikSKbDaVTr+K5qsSZz5zapOWf8H37LQahEMoa'
    + 'miQFLgA3fz96R+dOwlUDXKZhqWYJa8du4nFcdDh2e3coeEZ423fvdol1sXNwcdBu2WuUaAxlSmFWXTlZ+1SlUD9MzkdaQ+c+'
    + 'fDobNsoxiS1cKUQlQiFUHXwZtxUEEmAOygo9B7gDNgC2/DH5pvUR8nDuv+r95ijjPt8/2yvXAtPFznfKGsaxwUG9z7hftPmv'
    + 'oqtjp0OjS5+Dm/OXppSkkfeOqIy/ikaJRYjDh8iHWoh/iTyLlo2OkCeUYZg9nbii0aiCr8a2mL7uxsHPBtmy4rjsDPefAWMM'
    + 'SBc/IjYtHDjhQnNNwle8YVFrcHQKff9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//39XejZxgGdDXZFS'
    + 'e0cRPGYwjCSVGJQMmwC+9Avplt1v0qbHSr1osw+qSqEkmaWR2IrBhAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYB1gUaG'
    + 'hosnkSCXYp3io5WqbbFguGO/a8ZtzWHUPdv64ZDo+O4u9Sv77ABwBrILshBvFeoZIh4aItQlUimXLKYvhTI1Nbw3HjpePIE+'
    + 'ikB9Ql5EL0byR6pJWUv+TJpOLVC2UTNTolQAVktXfViTWYhaVlv3W2dcn1yZXE5cuFvSWpVZ/VcDVqRT21ClTQBK6UVfQWM8'
    + '9DYVMcgqEST1HHoVpg2CBRb9bPSN64biY9kw0PvG0b3BtNmrKKO9mqWS8IqrgwGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGApocjkESZ/aJArf+3KcOtznzahOax8vL+NAtmF3QjTS/fOhhG6VBAWxFlS27kds5+/3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9/3H24diFvJWfTXjhWZE1lREk7HzLzKNQfzhbuDT4Fyvya9LjsLOX83TDXy9DSykfF'
    + 'LcCFu063iLMysEityKquqPammqWWpOOjfKNco3uj1KNhpByl/6UFpymoZ6m6qh+sk60Tr56wM7LQs3a1JbfeuKS6eLxcvlTA'
    + 'Y8KNxNXGP8nPy4rOc9GO1N/XaNst3y/jcef067jwvvUE+4gASQZEDHUS1RhhHxEm3yzCM7E6pEGRSG1PLVbGXC1jV2k3b8J0'
    + '7Hmqfv9//3//f/9//3//f/9//3//f/9//3//f/9//383fFh2xW+FaKFgIFgMT3JFXTvbMPklxxpUD7ED8Pcf7FHgmNQFyau9'
    + 'mbLhp5OdwJN2isKBAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgKyDKIwjlY6eWqh3stW8ZMcU0tXc'
    + 'ludI8tv8QQdtEVAb3yQNLs82HT/tRjdO9lQjW7xgvGUhauxtG3Gyc7F1HXf5d0t4GHhndz92p3SnckhwkW2MakJnumP9XxRc'
    + 'B1jeU59PUUv8RqRCTj4AOr01iDFjLVEpUyVpIZQd0xkkFoYS+A52C/4HjgQiAbj9S/rZ9l/z2u9H7KTo8OQp4U7dXtlb1UTR'
    + 'G83jyJ3ETsD5u6O3UbMKr9OqtKa0otqeL5u7l4aUmpH+jruM2opiiVuIzYe+hzSINYnGiuqMpI/3kuSWapuJoD2mhaxbs7u6'
    + 'nML4ysbT/NyP5nTwnfr9BIcPLRrfJI0vKTqhROdO6libYupryHQnff9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3/HfjN2CW1YYy5Zmk6sQ3U4BS1uIcAVDQpl/tryeudX3IDRBMfvvFGzM6qioaiZTZKZi5KFP4ABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAmYN8iMONY5NQmYCf56V7rC+z+rnSwKzHf85D1fDbfuLm6CTvMPUI+6YACQYvCxYQvhQmGU8d'
    + 'OiHqJGAooCusLogxNjS8Nh05XTt+PYY/eEFWQyNF40aWSEBK4Et4TQdPjVAKUnpT3lQwVnBXmFikWZFaWFv2W2RcnVycXFpc'
    + '0Vv9WtdZXFiFVk5UtFG0TkpLdUczQ4Q+aDngM+8tmCfeIMYZVxKWCowCQfq98QzpN+BK11LOWcVvvJ6z9qqDolOac5LxitqD'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYBjg0uL1pP4nKam0rBuu2vGutFL3Q7p8fTjANQMsxhuJPYv'
    + 'ODsnRrFQylpiZG1t33Wtff9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/fHtgdNxs+2TNXF1UuUvvQgw6'
    + 'HTEuKEwfgxbeDWYFKP0q9XXtEeYE31XYB9IezJ7GicHfvKK40LRosWiuzquXqb2nP6YVpT2kr6Noo2Cjk6P7o5KkVKU6pkCn'
    + 'YqicqemqR6yyrSmvq7A1ssezYrUGt7O4a7oxvAa+7b/qwf7DL8Z/yPPKjc1S0EXTadbC2VLdHOEh5WPp5O2i8p731/xKAvYH'
    + '2A3sEywalCAdJ8EteTQ7OwBCvkhsTwBWcFywYrdoeW7scwR5uH3/f/9//3//f/9//3//f/9//3//f/9//3//f/9/X38Tehl0'
    + 'eG01Zlhe6VXyTH1DljlKL6UkthmKDjIDvvc87LzgUNUGyvG+H7SgqYOf15WqjAqEAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGA/YRTjSCWVp/nqMSy3rwmx47RBtyA5u3wP/toBVwPDhlyIn0rJjRiPClEdEs9Un5YM15ZY+1n'
    + '72tdbzlyhXRCdnR3IHhKePh3MHf4dVd0VnL7b05tWGogZ65jC2A9XE1YQVQhUPFLukd/Q0U/EjvoNssyvS7AKtUm/iI6H4kb'
    + '6xddFN8Qbg0JCqsGVAMAAK38Vfn49ZPyI++l6xjoe+TL4AjdMtlJ1U3RQc0lyf3Ey8CUvFu4JbT4r9mrz6fhoxSgcpwBmcmV'
    + '0pIjkMaNwYsdiuCIEYi3h9mHeoihiVGLjo1akLeTppcmnDah1ab+rK6z4LqNwq/KPNMt3HflD+/r+PwCOA2RF/ohYiy+Nv1A'
    + 'EUvrVH5eumeScPd4/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/g384d15uAmUxW/hQaEaOO3ow'
    + 'OyXiGX4OHgPU96zst+ED153MlMLyuMWvF6fxnl2XYpAHilKEAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAqoJWh2KM'
    + 'xpF2l2mdk6PqqWaw+rafvUrE9MqT0SDYlN7o5BbrGfHt9o789wEpBx8M2hBZFZsZoh1vIQQlYiiMK4UuUDHwM2k2vzj0Og09'
    + 'DD/2QMxCkkRKRvZHl0kwS8BMSU7JT0FRrlIQVGNVplbWV+1Y6lnHWoBbEFxyXKFcl1xQXMVb8lrTWWFYmVZ2VPZRFU/QSyZI'
    + 'FUSdP706dzXNL8ApVSOPHHQVCQ5VBmH+MvbT7U3lqdz00zfLgMLYuU6x7ajBoNiYPZH9iSODAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYAsgJSHm483mFyhAKsVtY+/X8p41cvgR+ze934DGw+jGgcmODEmPMJGAFHRWihk+2w8deR8'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3/SfzF5JXK6avti9FqzUkRKskEKOVgwqCcEH3gWDg7PBcb9'
    + '+fVx7jXnSuC22X7Tpc0vyB3Dcb4ruku20LK4rwOtq6qwqAunu6W5pAKkkKNfo2mjqKMYpLWkd6Vdpl+nfKiuqfOqSKyprRav'
    + 'jLALspKzILW3tla4ALq2u3q9Tr81wTPDScV8x8/JRczhzqjRm9S/1xXbod5j4l/mlOoF77Dzlfi0/QkDlQhSDj4UVRqRIOwm'
    + 'YS3oM3s6EUGiRyVOkVTdWv5g7GacbAVyG3fXe/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f5t+XHl6c/ps4WU2XgJW'
    + 'TE0gRIc6jDA8JqQb0RDRBbL6gu9R5CzZJM5Hw6S4Sq5GpKaaeJHIiKOAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAeYN8i/KTzpwEpoavRrk4w0zNdten4dLr6/Xk/68JRBOWHJslRy6UNnc+6kXnTGdTZlnfXtFjOmgXbGlv'
    + 'MXJwdCh2XXcSeEx4EHhid0p2znT0csNwQm55a3BoLWW3YRdeUlpwVndSbU5XSjtGHkIEPvA55zXqMfwtHipSJpgi8B5bG9YX'
    + 'YhT9EKQNVQoPB88DkgBW/Rj61PaJ8zXw1Oxm6ejlWuK63gfbQ9dt04bPj8uMx33DZ79NuzK3HLMPrxGrKKdao62fKJzTmLSV'
    + '05I3kOeN6otHigaJLIjAh8aHRYhBib6KvoxGj1aS75USmr6e8qOqqeSvm7bLvW3Fes3q1bXe0uc38dj6qgSiDrQY0yLxLAI3'
    + '+EDFSlxUsF2zZllvlXdaf/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/t90nUkbfxjaFpyUCpG'
    + 'nTvZMO0l5hrUD8QEx/nn7jXkvNmLz63FLrwas3mqVqK5mqmTLo1OhwyCAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'm4IjhwaMPZG8lnyccaKUqNmuOrWruybCocgVz3rVy9sA4hToAu7F81r5vP7qA+IIog0pEncWjRprHhIihCXDKNErsS5mMfMz'
    + 'WzahOMg61DzIPqdAc0IvRN1FgEcZSalKMEyxTSpPmlACUmBTsVT0VSZXRFhLWTZaA1usWy1cgVykXJBcQVyzW+Baw1lZWJ5W'
    + 'jVQkUl9PPUy7SNhEk0DtO+Y2gDG8K50lKB9gGEsR7glQAnj6bfI56uPhd9n90IDIC8Cot2SvSqdkn7+XZpBkicSCAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgIKD+ooEk5ebp6Qrrha4XMLxzMfX0OL+7UL5jwTWDwkbGSb5MJo7'
    + '70XrT4JZqGJSa3VzCXv/f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/2H5ZeHVxOWqvYuJa3VKsSltC'
    + '9DmCMRApqSBWGCAQEggzAIz4I/H/6Sbjndxp1o3QDcvrxSfBxLzCuCC13LH2rmysOqpdqNOml6WlpPmjjaNfo2ijpKMOpKKk'
    + 'W6U1piunO6hgqZeq3qsxrZCu+K9pseGyYLTntXa3Drmwul+8G77ov8fBvMPKxfPHO8qlzDPP6tHL1NrXGduJ3i7iCeYa6mLu'
    + '4vKZ94f8qAH9BoIMNBIQGBAeMSRsKrwwGTd+PeJDPkqKULxWzVy0Ymdo3W0Nc+93eXz/f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f0V7yHW0bw1p2mEiWutRQEkoQK423SzAImMY0g0aA0j4au2M4r7XC82DwjK4J65tpBGbIZKmiayBAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAMheqMMZXYndGmEbCLuTPD/MzZ1r/goOpw9CX+sQcLESka'
    + 'ACOHK7YzhTvtQuZJbVB8VhBcJGG4ZclpV21icOxy9HR/do53JnhKeAB4THc0dr1073LPcGRutGvHaKJlTmLPXi5bb1eZU7FP'
    + 'vUvCR8NDxj/OO903+DMfMFUsmyjyJFsh1B1eGvgWohNYEBoN5gm5BpIDbQBK/SP6+PbH84zwRu306ZPmIuOi3xDcbdi51PTQ'
    + 'Ic1ByVXFYcFnvWq5cLV8sZKtuan1pUyixJ5lmzOYNpV0kvSPvI3Ui0CKCYkziMOHwIcuiBGJbYpEjJqOcJHIlKGY/JzXoTCn'
    + 'BK1RsxG6QMHYyNHQJdnM4bzq7PNT/eQGmBBhGjQkBi7IN3FB80pBVFBdFGaBbot2KH7/f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f7F8snQ3bEtj+VlMUFJGFzynMRAnXxyhEeQGNfyg8THn9tz70krJ7r/ytl+uP6aZnnWX'
    + '2pDMilKFboABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYD/gVaGBIsDkEiVzJqFoGumdqycste4Hb9nxa/L7NEZ2DDe'
    + 'KuQE6rjvQ/Wi+tD/zASWCSoOihKzFqgaZx7zIU4leCh0K0Qu6zBsM8k1BjglOik8Fj7uP7NBaEMQRaxGPUjGSUZLwEwyTp1P'
    + 'AFFbUqtT8FQnVk1XYFhdWUBaBVupWydcfFyiXJZcU1zUWxZbFFrKWDRXT1UXU4tQp01qStJG30KQPuU53zSAL8spwSNnHcAW'
    + '0Q+gCDIBkfm/8cfpseGE2UzREMnbwLa4rbDJqBWhm5lmkoCL84QBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYCGg8KKiZLQmo6juqxJtjDAZMrX1H7fTOo09SgAHAsDFs8gdCvkNRRA90mCU6lcY2WkbWV1nXz/f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//39Me8p0723FZldfrlfWT9hHvz+VN2MvNCcRHwMXEw9IB6v/QvgU8Sbq'
    + 'gOMk3RjXX9H7y+/GPMLkvee5RLb7sgqwcK0qqzapkac3pialWKTJo3ejXKN0o7qjK6TCpHulU6ZFp06oa6mZqtarH61yrs6v'
    + 'M7GeshC0irULt5S4JrrDu2y9JL/twMnCusTExunILMuRzRjQx9Ke1aHY0dsx38LihuZ96qjuB/Oa92H8VwF/BtQLVBH8FsYc'
    + 'sCK1KM4u9jQnO1pBiUerTbpTrVl8XyBlj2rDb7F0U3mgff9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/kXxnd65x'
    + 'aWufZFVdklVdTb5EvjtnMsIo2x67FG8KAgCB9ffqceD71aLLcsF4t8CtVKRCm5SSVIqMggGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAvht2N7ZVVngunArAxuYrCBMyS1SnfvehF8rT7AAUgDgoXtR8YKCww6DdGP0BG'
    + '0Uz0UqRY4F2jYu1mvGoPbuhwR3MudZ92nHcpeEp4A3hZd1B273Q6czdx7W5hbJlpnWZxYxxgo1wNWV5VnVHOTfVJGEY5Ql0+'
    + 'hjq4NvUyPi+WK/wncyT6IJEdNxrtFrETgRBcDUAKLAcdBBEBB/76+ur31PS38Y/uXOsd6M/kcuEF3oja+9Zf07TP+8s2yGfE'
    + 'kcC2vNm4/7QrsWGtp6kBpnWiCJ+/m6GYs5X8koKQSo5bjLqKbYl6iOWHtIfrh46IoIkmiyCNk499kuKVwJkYnueiLKjlrQ60'
    + 'o7qfwf3It9DG2CPhxeml8rn79wRXDs4XUSHVKlA0tj38RhdQ/FifYfZp93GWef9//3//f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//39yf+N33G9mZ4xeWFXVSw5CDzjjLZgjNxnPDmoEFvrc78jl5ttB0uLI1b8ht8+u6aZ0n3mY'
    + '/ZEFjJeGtYEBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgMyCD4eki4KQopX7moegPaYVrAiyD7ghvjnETspc0FzW'
    + 'SNwc4tLnZ+3X8h74Of0mAuUGcgvOD/cT7he0G0gfrCLiJesoySt+Lg0xeDPCNe43/Tn0O9M9nz9ZQQRDoUQzRrpHOUmwSiFM'
    + 'ik3tTklQnVHpUipUYFWHVp9XpFiTWWlaIlu8WzJcgFyjXJZcVlzeWypbN1oBWYVXv1WtU0xRmU6TSzhIiESCQCU8dDdtMhUt'
    + 'ayd0ITMbrBTjDd0Gof8z+Jvw4OgJ4R7ZKNEwyT3BWrmPseepaqIhmxiUVo3lhs2AAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAQYM7ireRq5kSouCqDbSPvVvHZtGm2w/mlfAs+8cFXBDfGkQlfi+DOUhDwUzkVadeAmfqbll2'
    + 'Rn3/f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//38YfwZ5m3Lga95knl0qVoxOy0byPgs3HS8xJ1Ef'
    + 'hRfTD0QI3gCq+avy5+tk5SffMtmK0zHOKsl1xBbACrxUuPO05bEpr76soarQqEinBqYHpUekwqN1o1yjcqO0ox6kraRbpSem'
    + 'DKcHqBapNqpjq52s4q0vr4Ww4bFEs620HbaUtxO5m7ouvM29er83wQbD6sTkxvnIKst5zerPf9I61R3YK9tl3szhY+Up6SDt'
    + 'SPGg9Sn64f7FA9YIEQ5zE/gYnR5eJDYqIDAXNhY8FUIPSP1N2VOaWTpfsmT5aQlv2XNjeJ98/3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f7h7o3YJce1qVGREXcNV1k2HRdw83jOWKg4hTxdjDVYDM/kD79Lkq9qa0KrG57xasxCqE6FsmCaQ'
    + 'SojhgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAKgjuJzpC6mPWgdakvshu7LMRazZnW'
    + '4N8j6Vryevt5BFAN9RVgHokmaS74NTI9D0SLSqJQUFaRW2Jgw2SyaC1sNW/Lce9zo3XpdsR3N3hGePR3RndAdud0QHNQcR1v'
    + 'rWwEaihnIGTvYJxdLFqkVglTXk+qS+9HMUR0QLo8BzldNb0xKi6lKi0nxSNsICId5xm6FpkThRB6DXkKfgeIBJYBpv6z+774'
    + 'xPXE8rvvp+yJ6V3mJOPc34bcINms1SnSmM78ylTHpMPtvzK8d7i+tAuxYa3HqT+mzqJ6n0icPJldlq+TOZH/jgeNVovyieCI'
    + 'I4jBh7+HH4jmiBaKsou8jTeQI5OAlk+aj54/o12o563aszK66sD/x2rPJtcs33Tn+O+w+JEBlgq0E+IcFSZFL2c4cUFaShZT'
    + 'm1vhY91rhXPSev9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//fwJ9j3WubWhlxlzSU5ZK'
    + 'HUFwN5otpiOgGZEPhQWH+5/x2+dC3uDUvcviwlm6KbJaqvKi+JtzlWaP14nJhECAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYDJgdGFJ4rEjqGTt5j/nXKjCKm7roO0W7o7wB7G/svU0Z3XUt3v4nDo0e0Q8yj4GP3cAXUG4AodDysTChe7Gj0e'
    + 'kyG8JLsnkSpALcsvMzJ6NKQ2sjimOoU8Tj4GQK5BSEPVRFhG0kdDSa5KEkxvTcdOGFBhUaNS3FMLVSxWQFdDWDJZDFrMWnFb'
    + '9VtXXJNcpFyIXDpct1v8WgVaz1hXV5pVlVNGUaxOxEuNSAZFL0EHPZA4yTO1LlYprSO9HYoXGBFrCokDdvw39dTtUua53g/X'
    + 'Xs+rxwDAZLjhsH6pQ6I7m22U4Y2gh7KBAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYCvg3KK'
    + 'rZFZmXCh6Km6sty7RcXszsbYyeLq7B/3XQGaC8oV5B/cKagzPT2TRp9PV1i1YK5oO3BWd/Z9/3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//388fUV3/XBtap1jlFxdVf5NgEbsPko3oi/8J2Ag1RhhEQ0K3gLb+wj1a+4J6OXh'
    + 'BNxp1hbRDsxTx+bCyL75unm3SLRksc2ugax9qsCoR6cQphalWKTRo3+jXaNpo56j+qN4pBal0KWjpoyniKiVqbGq2asMrUiu'
    + 'ja/YsCqygbPftEO2rrcguZu6H7yvvUy/98CzwoLEZsZiyHbKp8z3zmbR+NOv1o3Zk9zD3x7jpOZY6jruSPKE9u36gf8/BCYJ'
    + 'NA5mE7kYKh62I1cpCi/KNJI6XEAjRuFLkFEpV6ZcAGIxZzJs/HCJddF5zn3/f/9//3//f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9/TH2TeFxzq22EZ+tg5Vl5UqxKhUIMOkkxQygDH5IV+QtDAnn4pO7O5ALbStGwxz++/7T7qzyjzJq0kvuKq4MBgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYA6gA6HQI7HlZydtKUIro22O78IyOvQ29nO4rvr'
    + 'mvRh/QgGiA7ZFvMezyZmLrM1sDxYQ6ZJlU8kVU5aEF9rY1tn4Gr6balw7XLJdD52TXf6d0d4OHjQdxN3BXardApzJXECb6Zs'
    + 'FmpWZ2xkXGEsXuBafVcGVIFQ8ExZSb5FIkKIPvM6ZTfgM2Yw+CyXKUMm/SLGH50cgRlxFm4TdhCHDaEKwQflBA4COP9h/If5'
    + 'qvbH89zw6e3s6uPnzuSr4XvePdvx15jUMdG+zUDKuMYow5K/+btguMm0N7GurTOqyKZzozegGp0fmkyXpZQwkvGP7o0qjKuK'
    + 'dYmNiPeHtofPh0WIG4lUivGL9Y1ikDiTd5YgmjOeraKPp9WsfLKDuOW+ncWozADUn9t/45rr6fNk/AIFvg2PFmsfSigkMe85'
    + 'okI0S5xT0VvLY4Br53L6ef9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/YH05dqtu'
    + 'vmZ7XupVFE0BRLw6TjHAJxwebBS6Cg4Bdff17ZjkaNts0q7JNcEJuTGxtKmXouGbl5W+j1mKa4X5gAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYCAgnCGp4ofj9OTu5jRnQ+jb6jqrXqzGbnCvm7EGcq9z1XV3dpR4K3l7eoO8A316Pmd/igD'
    + 'iwfDC9EPshNoF/MaUx6JIZYkfCc8KtcsUC+oMeIz/zUCOO45wzuEPTQ/00BlQutDZkXXRkFIo0n/SlRMpE3uTjJQcFGmUtNT'
    + '91QQVhtXF1gCWdhZmFo/W8pbNVx+XKFcnFxqXAlcdVusWqpZbVjyVjVVNlPyUGhOlUt4SBJFYUFmPSA5kTS6L5wqOSWUH7AZ'
    + 'kBM3DasG8P8J+f3x0uqN4zXc0NRlzfvFmr5JtxCw9agBojubrJRajkyIi4IBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAgYP/ie2QRZgAoBeog7A7uTjCccvc1HLeKOj18dD7rQWGD1AZASOPLPM1IT8TSL5QHFkjYc5o'
    + 'FHDwdlt9/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//fx99YHdXcQlrgGTBXdZWxE+USE5B'
    + '+DmZMjor4SOUHFsVOw46B14Arfkp89nswebj4ETb5dXL0PXLZ8ciwyW/crsIuOe0DrJ9rzKtKqtlqeCnmKaLpbekGKSro22j'
    + 'XKNzo7GjEaSQpCyl4qWvppCng6iFqZaqsqvYrAeuPa96sL6xB7NVtKm1BLdkuM25Pbu3vD2+zr9uwR7D4MS2xqLIpsrDzP3O'
    + 'VtHO02jWJdkI3BLfQ+Kc5SDpzeyk8KX00Pgk/Z8BQgYJC/MP/hQnGmofxSQ0KrIvPDXMOl9A70V3S/FQV1akW9Ng3GW7amhv'
    + '33MYeA98vX//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/An6MeaF0RW95aUNjp1ypVVBOoEahPlk2zi0KJRIc'
    + '8BKsCU4A4PZo7fLjhtos0e7H1r7rtTetwaSTnLSULY0DhgGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYClhHGLkJL5maShi6mksei5TsLOyl/T+tuV5CrtsPUg/nEGnQ6eFmweASZXLWk0MjutQdVHqE0iUz9Y'
    + '/lxdYVpl9WgsbAFvcnGCczB1gHZydwp4Sng0eMx3FncWds50Q3N6cXdvPm3Tajxoe2WWYpJfcVw6We5VklIrT7pLREjMRFNB'
    + '3T1tOgI3oTNJMP0svCmIJmEjRyA6HToaRhddFH4RqQ7bCxUJVAaWA9sAIf5l+6b45PUb80vwc+2S6qbnruSq4ZnefNtR2BrV'
    + '19GIzi/LzMdhxPDAfL0FupC2HrOzr1Ks/qi7pY2ieJ+AnKmZ+JZwlBaS7o/+jUiM0YqeibKIEYi/h76HE4i/iMWJKIvqjAuP'
    + 'jZFwlLWXXJtkn8yjk6i2rTOzCLkwv6jFbcx508faUuIU6gfyJPplAsMKNhO3Gz8kxSxBNaw9/kUtTjNWB16iZftsDHTNev9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3/ZfPN1rm4SZyVf8FZ5TspF6zzjM7wq'
    + 'fiExGN8OjwVM/BzzCOoY4VXYxM9vx1u/kLcUsO2oH6Kxm6eVBJDNigSGrIEBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYDdgquGuooGj4iTPJganR6iQ6eBrNWxOLemvBjCjMf7zGLSvNcF3TviWOdb7EHxB/ar+iv/hQO5B8cLrA9pE/4W'
    + 'axqwHc4gxyOaJkop2CtGLpQwxjLcNNk2vjiOOks89j2RPx1BnUISRH5F4EY7SJBJ3konTGtNqU7iTxVRQVJlU4JUlFWbVpVX'
    + 'f1hZWSBa0FppW+dbR1yGXKNcmVxnXAlcfFu9WstZolhAV6NVyFOuUVRPt0zXSbNGS0OdP6s7dTf7Mj8uQikGJI4e3BjzEtcM'
    + 'igYSAHT5svLS69rkz9231pjPechfwVG6VbNzrLKlF5+qmHKSdIy5hkWBAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGABIVZixOSLpmkoG6ohrDkuILBWMpe04vc2eU+77H4KgKiCw8Vah6pJ8QwszluQu5KK1MfW8Fi'
    + 'DGr6cIR3pn3/f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3/VfE93hHF6azhlxV4nWGRR'
    + 'hEqOQ4c8djViLlEnSCBOGWgSnAvvBGb+BPjP8cnr9+Vc4Pva1tXv0EjM4se/w+C/RLzruNe1BLN0sCWuFaxDqq6oUqcupj+l'
    + 'g6T4o5qjZ6Ndo3ejtaMSpIykIKXNpY6mY6dJqD6pP6pMq2Osg62prtevCrFDsoCzw7QMtlm3rrgJumy72LxOvtC/X8H8wqrE'
    + 'a8Y/yCjKKsxEznrQzdI/1dDXg9pZ3VPgceO25iHqsu1r8Ur1T/l6/cgBOwbRCoYPWRRJGVEecCOhKOItMDOFON09NkOJSNJN'
    + 'DFMyWEBdL2L6Zp1rEnBTdFt4Jnyuf/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//fxl9vHj0c8NuLWk0Y95c'
    + 'LlYpT9RHNUBROC8w1SdLH5YWvw3NBMj7t/Ki6ZHgi9eazsXFFL2PtD2sJqRRnMWUio2lhhyAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgBqDiolIkEyXkJ4NprytlrWTvazF2s0V1lfemObQ7vn2Df8EB9kO'
    + 'hRYCHkwlXCwvM745B0AGRrZLFVEhVtdaNF85Y+NmM2onbcBv/nHjc291o3aDdw94Sng2eNh3MXdEdhZ1qnMDciZwFm7Xa2xp'
    + '22YmZFFhYV5ZWz1YD1XUUY9OQUvvR5tESEH2Pak6YzckNO4wwi2gKosngSSDIZEeqxvQGAAWOhN9EMkNGwtzCNAFMAOSAPX9'
    + 'Vvu0+A/2ZfO08PvtOutv6JrluuLP39fc1NnF1qvThdBWzRzK28aTw0bA9rykuVO2BrPAr4KsUKkuph+jJaBGnYOa4pdmlROT'
    + '7JD1jjONqYtaikqJfYj2h7iHxochiM6Izokji8+M044vkeWT9ZZemiGePKKvpnerk7ABtr27xcEVyKnOfdWN3NPjS+vv8rn6'
    + 'owKoCsAS5hoSIz4rYjN3O3dDW0sbU69aE2I9aShwznYnff9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f5V76nTobZdm/V4gVwdPukY/Pp413ywJJCQbNxJJCWQAjvfN7inmqt1W1TPNScWdvTS2Fa9EqMeh'
    + 'oZvXlWuQYou+hoKCAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYCzglSGMYpGjo6SBJejm2agSKVEqlav'
    + 'eLSmudy+FMRMyX7OqNPE2NHdy+Kv53vsK/G+9TP6hv63AsYGsQp3DhgSlRXtGCAcLx8bIuUkjScVKn4syi75MA8zDDXxNsI4'
    + 'fjopPMM9Tj/NQD9Cp0MFRVxGq0f0SDdKdEutTOFNEE85UF5Re1KSU6FUp1WiVpFXclhEWQVasVpIW8dbLFx0XJxcolyFXEBc'
    + '0ls4W29ad1lLWOtWVFWFU3tRNk+0TPVJ90a7Qz9AhDyLOFQ04C8wK0UmIyHKGz0WfxCUCn4EQv7i92Txy+od5F7dlNbDz/HI'
    + 'JMJiu6+0E66TpzWh/5r2lCKPh4kqhAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'GIHhhguNkpNwmqChHKnfsOO4IcGSyS/S8trU48zs1PXk/vQH/xD7GeIiqytRNMw8FUUmTfdUg1zEY7VqT3GPd259/3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3+1fXl4/HJFbVlnPmH5WpBUCU5rR7pA/Tk5M3Qs'
    + 'syX7HlEYuxE9C9sEmv59+InywOwl57zhiNyK18TSOM7nydTF/cFkvgm767cMtWmyArDXreWrLKqqqFynQqZZpZ+kEaSuo3Kj'
    + 'XKNpo5aj4qNKpMqkYqUPps+mn6d/qGupZKpmq3GshK2err6v47ANsjyzcLSotea2KbhyucK6Gbx6veS+WsDbwWvDCsW6xn3I'
    + 'VMpAzETOYNCX0unUWdfn2ZXcZN9T4mblm+jz62/vDvPQ9rX6vf7kAi0HlAsZELgUchlBHiYjHCggLTAySDdkPIBBmUarS7FQ'
    + 'p1WIWlFf+2OEaOVsG3EhdfJ4inzlf/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9/WHwceH9zgm4oaXVj'
    + 'bF0RV2dQdEk8QsQ6ETMpKxIj0hpvEu8JWgG3+ArwXee03hnWkM0ixda8srS8rPykeJ01ljuPjog0ggGAAYABgAGAAYABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAiAAYZDjMmSjZmJoLanD6+Ntim+3sWlzXjVUN0n5ffs'
    + 'uvRr/AIEewvREv8Z/yDNJ2UuwzTiOsBAWUaqS7FQa1XYWfRdwGE6ZWJoN2u5belvyHFWc5Z0h3Usdod2mnZodvN1PnVLdB5z'
    + 'uXEhcFhuYWxBavpnj2UEY11gnV3GWtxX41TcUcpOsUuTSHFFT0IuPxA89zjkNdgy1S/bLOspBicrJFwhlx7eGy8ZihbvE1wR'
    + '0g5ODNEJWQflBHMCAwCU/ST7sfg79sHzQfG87i7smen75lTko+Ho3iLcU9l51pbTqtC1zbnKt8evxKPBlb6Gu3m4cLVtsnGv'
    + 'gayeqcumDKRiodKeXpwKmtiXzJXpkzKSq5BWjzaOT42jjDSMB4wbjHWMFo3/jTKPsZB9kpeU/pa0mbicCqCqo5enz6tQsBq1'
    + 'Krp+vxLF5cry0DbXrd1T5CXrHPI2+WoAuAcXD4MW9h1rJdssQTSXO9dC/En+UNpXiF4DZUZrTHEOd4l8/3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/9//3//f/h8W3dtcTRrtGT0XfdWxU9iSNRAIjlSMWkpbyFpGV0R'
    + 'UglOAVj5dPGp6fzhdNoW0+bL6sQnvqK3XbFfq6mlQKAnm2GW8JHWjRWKroajg/WAAYABgAGAAYABgAGAAYABgAGAAYABgAGA'
    + 'AYBOgJ+CMoUEiBGLVY7MkXOVRJk9nVmhlKXpqVau1rJltwC8osBIxe7Jks4w08XXTtzJ4DPlienK7fTxBfb7+dX9kQExBbII'
    + 'FAxWD3kSfRVhGCYbzR1WIMEiESVGJ2ApYitMLR8v3jCJMiE0qTUhN4o45zk4O348uz3vPhxAQkFiQn1Dk0SlRbJGu0fASMFJ'
    + 'vEqyS6NMjE1vTkhPGFDcUJVRP1LZUmNT2VM7VIZUuFTPVMpUp1RjVPxTcVPAUuZR41C1T1lOz0wWSyxJEEfCREBCiz+jPIY5'
    + 'NjayMvwuFCv7JrIiPB6ZGcwU1w+8Cn4FIACm+hH1Zu+o6dvjA94k2ELSYcyHxrfA9rpJtbSvPKrlpLSfrprYlTSRyYyaiKuE'
    + 'AIEBgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGA9oIZh5KLX5B8leaamaCRpsqsP7Ptuc3A28cSz2zW'
    + '5N115RjtyPR//DcE7AuXEzEbtyIhKmsxjziIP1FG5UxAU1xZNl/JZBNqDm+5cxB4EHy3f/9//3//f/9//3//f/9//3//f/9/'
    + '/3//f/9//3//f/9//3//f9p/fnzeePx03nCGbPpnPWNUXkNZDlS6TkxJyEMyPo844zIyLYEn1CEvHJUWCxGTCzIG6gDA+7T2'
    + 'y/EG7Wjo8+Oo34rbmtfY00fQ5cy1ybfG6sNOweS+q7yiusi4HLeftU20JrMpslSxpLAasLOvbK9FrzuvTa94r7uvFLCCsAKx'
    + 'krEysuCymbNetCy1ArbgtsW3r7ieuZK6ibuFvIS9hr6Mv5bApcG3ws/D7cQRxjzHcMityfTKRsylzRHPjNAX0rLTYdUi1/jY'
    + '5Nrm3P/eMeF84+DlX+j56q7tffBo82/2kPnL/CAAjgMVB7MKZw4vEgoW9hnyHfshDiYqKk0uczKZNr463T70Qv9G/EroTr1S'
    + 'e1YcWp1d/GA1ZEVnJ2rabFlvo3Gzc4h1HndzeIR5UXrVehF7Anumev55B3nBdyx2SHQVcpNvw2ymaTxmiGKMXkhawFX1UOtL'
    + 'pEYlQW87hzVwLy8pyCI+HJcV1w4DCB8BMvo+80rsWuVz3pzX19Asyp3DMr3tttSw66o3pbyffpqAlceQVowxiFmE0oABgAGA'
    + 'AYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYA8gJyDRYc2i2uP35OQmHqdl6Llp1+tAbPGuKm+p8S6yt7QDtdH3YLj'
    + 'venx7xz2OfxDAjcIEQ7OE2kZ3x4uJFIpSC4OM6E3ADwoQBdEzEdGS4ROhFFHVMtWEVkZW+Ncb16+X9FgqWFHYqxi2mLTYphi'
    + 'K2KPYcVgz1+wXmld/ltxWsRY+lYVVRdTA1HbTqFMWEoCSKFFN0PHQFA+1ztcOeA2ZjTuMXovCi2gKj0o4CWLIz0h+B67HIca'
    + 'Wxg3FhsUBxL5D/IN8Qv1Cf4HCwYaBCwCPwBT/mb8ePqI+JT2nfSi8qHwm+6O7HvqYeg/5hbk5uGu327dJ9va2IbWLdTO0WzP'
    + 'Bs2fyjfIz8VqwwjBq75VvAi6xreRtWqzVLFSr2Wtj6vUqTSos6ZTpRWk/aILokOhp6A3oPef6J8LoGKg7qCxoayi36NLpfKm'
    + '06juqkSt1K+esqG13bhRvPu/2sPtxzHMpNBF1RHaBt8g5F3pue4y9MT5bP8kBewKvRCWFnAcSSIdKOYtoTNKOdw+VESuSeRO'
    + '9VPaWJFdF2JmZn1qWG7zcUx1YHgte7B95n//f/9//3//f/9//3//f/9//3//f/9//3+Qf0Z9rHrGd5V0G3FbbVhpFWWTYNhb'
    + '5lbBUW1M7UZGQXs7kTWML3ApQiMGHcAWdRAqCuIDpP1w903xPutI5W7ftdkf1LHObclXxHK/wbpGtgOy/K0xqqWmWqNQoImd'
    + 'BZvGmMyWF5Wnk32SlpH0kJWQeJCdkACRo5GBkpqT7JR0ljCYH5o8nIee/KCYo1mmPKk/rF2vlbLktUa5ubw7wMfDXcf5ypjO'
    + 'ONLX1XPZCN2W4Bvkk+f/6lzuqPHj9Av4H/sf/ggB3AOaBkAJ0AtIDqgQ8hIkFUAXRRk0Gw4d1B6FICQisCMrJZUm8Cc8KXoq'
    + 'rCvSLO0t/i4HMAcx/zHxMt0zxDSmNYQ2Xjc0OAc51zmjOm07Mzz2PLU9bz4lP9U/gEAjQb9BUkLcQltDzkM0RIxE1EQMRTFF'
    + 'Q0U/RSZF9USrREZExkMoQ21CkkGXQHs/PD7aPFU7qjnbN+Y1yzOKMSQvlyzlKQ4nEiTyIK8dSxrFFh8TXA97C4AHbQND/wP7'
    + 'svZQ8uDtZunk5Fzg0ttI18LSQ87OyWbFDsHJvJy4iLSRsLusB6l7pRei4J7YmwGZX5b0k8GRy48RjpeMXYtmirOJRYkciTuJ'
    + 'oIlNikKLf4wDjs6P35E1lNCWrZnMnCqgxaOcp6yr869ttBm58r33wiPIdM3l0nTYHN7Z46nphu9u9Vv7SgE4Bx8N/RLNGIwe'
    + 'NSTEKTcvijS4OcA+nENMSMtMFlEsVQpZrVwUYDxjJGbKaC5rTm0ob71wDXIWc9lzVXSNdH90LHSXc79ypnFOcLhu5mzbapho'
    + 'H2ZzY5dgjF1XWvhWdVPOTwhMJUgpRBZA8Du5N3UzJy/RKncmHCLCHW0ZHhXZEKAMdghcBFUAZfyK+Mj0IfGW7Snq2uar453g'
    + 'sd3n2kDYvdVd0yHRCc8WzUXLmMkOyKbGYMU7xDbDUMKIwd3AT8Dbv4K/QL8XvwO/A78Yvz6/dr+9vxLAdcDkwF7B4sFvwgPD'
    + 'n8NCxOrEl8VIxv3GtcdxyC/J8MmzynnLQswNzdzNrc6Cz1vQOdEc0gTT89Po1ObV69b61xPZN9pm26Lc6t1B36bgG+Kg4zbl'
    + '3eaV6GDqPuwu7jLwSvJ09LL2BPlp++D9aQAFA7EFbwg8CxgOARH3E/gWAhoVHS8gTiNwJpQpuCzZL/UyDDYZORw8ET/4QcxE'
    + 'jUc4SspMQU+bUdZT8FXmV7ZZX1veXDFeWF9PYBdhrGEOYjxiNGL2YYFh1WDwX9NefV3uWyhaKVjyVYVT4lAKTv9KwUdTRLVA'
    + '6jz0ONU0jzAkLJgn7SIlHkMZSxRADyQK+wTK/5D6VPUX8N7qrOWF4GvbYtZu0ZHM0Mcsw6q+TLoUtgeyJq50qvSmp6OQoLGd'
    + 'DJuimHWWhpTWkmaROJBLj6COOI4Sji2Oi44qjwqQKZGHkiKU+ZULmFaa15yOn3eikaXZqE2s6q+ts5S3nLvCvwPEXMjKzEnR'
    + '2NVy2hXfvuNq6BTtvPFd9vX6gv/+A2sIxAwGETAVQBkyHQYhuSRKKLcr/y4gMhg16TePOgs9Wz+AQXpDR0XoRl1IpknDSrZL'
    + 'fkwdTZJN4E0GTgdO402bTTFNpkz8SzRLUEpRSThICEfCRWhE+0J9Qe8/Uz6rPPg6Ozl3N6s12zMGMi4wVS57LKEqyCjyJh4l'
    + 'TiOBIbkf9x05HIEazxgjF30V3RNCEq4QHg+VDRAMjwoTCZoHJQayBEED0gFkAPf+if0b/Kv6OfnG90/21fRY89bxUPDF7jbt'
    + 'oesH6mjoxOYb5WzjueEC4Ebeh9zF2gHZO9d01a3T5tEi0GDOo8zqyjjJjcfrxVTEyMJJwdm/eb4rve+7yLq3ub243LcWt2u2'
    + '3bVutR618LTjtPm0NLWTtRm2xLaXt5K4tbkAu3S8EL7Vv8PB2cMWxnvIBsu4zY7QiNOk1uLZQN284FXkCejW67rvs/PA99z7'
    + 'BwA+BH4IxgwSEWAVrBn2HTkiciagKsAuzzLJNq06eD4nQrhFKEl1TJ1PnVJ0VR5Ym1roXAVf7mCjYiNkbGV+Zldn92ddaIlo'
    + 'e2gyaK9n8Wb6ZcpkYWPAYelf3F2bWydZglatU6tQfU0lSqZGAUM6P1I7TTcsM/IuoypAJs0hTR3CGC8UmA/+CmUG0AFC/b34'
    + 'Q/TY737rOOcI4/He9NoV11XTtc85zOHIsMWmwsa/EL2Fuie497X0syCyfLAGr8Gtq6zEqw2rhKorqv6p/6ktqoWqCau1q4ms'
    + 'hK2kruivTrHVsnq0PbYcuBS6JbxLvobA08IxxZ7HF8qbzCnPvtFa1PnWmtk93N7efuEa5LHmQunL60zuw/Av85D15fct+mb8'
    + 'kv6uALsCuQSoBoYIVAoTDMENXw/uEG0S3RM+FZEW1RcNGTcaVBtmHGwdZx5ZH0AgHyH2IcUijCNOJAklvyVwJh0nxSdqKAwp'
    + 'qylHKuAqeCsNLKAsMS2/LUsu1S5cL+AvYDDdMFYxyTE4MqAyAjNdM7Az+jM6NHE0nDS7NM400jTJNK80hjRLNP4znzMsM6Qy'
    + 'CDJVMYwwrC+1LqUtfSw8K+IpbyjiJjsleyOiIa8fox1/G0MZ7haDFAISaw/ADAEKMAdOBFsBW/5N+zP4DvXh8a3udOs36Pnk'
    + 'u+GA3kjbF9ju1NDRvs66y8bI5cUYw2HAw70/u9e4jbZjtFqydLCzrhitpKtZqjipQqh4p9umbKYrphqmOKaGpgSnsqeQqJ2p'
    + '26pHrOKtq6+hscOzELaHuCe77r3awOvDHsdxyuPNctEc1d7Yttyi4KDkrujI7OzwGfVL+YH9tgHpBRkKQQ5gEnMWdxprHk0i'
    + 'GSbNKWgt6DBKNI03rjqtPYdAO0PIRS1IaEp4TFxOE1CeUftSKVQpVfpVnVYRV1ZXbVdWVxJXolYFVj1VS1QwU+5RhFD1TkNN'
    + 'bkt3SWJHL0XgQndA9j1eO7I48zUjM0QwWS1iKmMnXCRQIUAeLxseGA8VBBL+Dv8LCAkbBjoDZgCh/en6Q/iu9Svzu/Bg7hrs'
    + '6enO58rl3eMH4kngo94U3Z3bPtr22MbXrdar1b/U6dMp033S5tFj0fLQlNBI0AzQ4c/Fz7fPt8/Ez97PAtAx0GrQrND30EnR'
    + 'otEB0mbS0dI/07LTKdSi1B/VntUf1qPWKNev1zjYwthO2dzZa9r82pDbJty+3Fnd+N2a3kDf69+a4E/hCeLJ4pHjX+Q15RTm'
    + '++br5+Xo6On26g/sM+1j7p7v5fA58pnzBfV+9gP4lfk0+9/8lv5YACYC/wPjBdEHyQnKC9IN4w/5ERYUOBZdGIUarxzaHgMh'
    + 'LCNRJXInjSmhK60try+nMZIzbzU8N/k4pTo8PL89LD+CQL9B40LrQ9hEp0VYRutGXUeuR95H7EfXR55HQkfCRh5GVUVoRFZD'
    + 'IELGQEg/pj3iO/s58zfKNYEzGjGULvIrNSldJm0jZSBIHRca0xZ/ExwQqwwwCawFIAKQ/vz6Z/fS80HwtOwu6bLlQOLc3ofb'
    + 'QtgR1fTR7s4AzC3Jdcbaw17BAr/IvLC6vbjutka1xLNrsjmxMbBSr52uEq6yrXytcK2PrdetSa7lrqmvlbCpseOyQrTGtW23'
    + 'N7khuyu9VL+ZwfrDdMYGya/Lbc490R/UENcP2hndLeBK42zmk+m97OfvEfM39ln5dfyJ/5MCkgWFCGoLPw4EEbcTVxbiGFgb'
    + 'uB0AIDEiSCRGJioo8ymhKzQtqy4HMEYxaTJwM1w0KzXgNXk29zZbN6U31jfuN+431zepN2Y3DjehNiE2jzXsNDg0dTOjMsMx'
    + '1zDfL90u0S28LJ8reypRKSIo7ia3JXwkQCMCIsQghR9GHgkdzRuSGloZJRjyFsMVlxRuE0kSKBELEPIO3A3LDLwLsgqrCacI'
    + 'pQenBqsFsQS5A8MCzQHZAOb/8/7//Qv9Fvwg+yn6MPk1+Dj3OfY39TL0KvMf8hHxAPDs7tXtuuyd633qWuk16A7n5OW65I7j'
    + 'YuI24Qrg39613Y7cadtI2ivZE9gB1/XV8NT00wDTF9I40WTQnc/kzjjOm80OzZLMJ8zOy4jLVcs3yy7LO8tey5fL58tQzNDM'
    + 'aM0ZzuPOxc/B0NXRA9NK1KnVINew2FfaFtzr3dff2OHu4xfmVOij6gTtdO/08YL0HPfC+XL8K//rAbEEfQdLChsN6w+6EoYV'
    + 'ThgPG8kdeiAgI7olRijCKi4tiC/OMf8zGjYeOAg62DuOPSY/okAAQj5DXURbRThG8kaLRwFIVEiDSI9Id0g8SN1HWke1Ru1F'
    + 'AkX2Q8lCekEMQH8+1DwLOyY5JjcMNdkyjzAvLrorMSmWJusjMSFpHpYbuBjSFeUS8g/7DAMKCgcSBBwBLP5B+134gvWx8uzv'
    + 'Ne2M6vLnauX04pLgRN4L3OnZ3tfs1RPUU9Ku0CPPtM1gzCnLDsoQyS7IacfAxjTGxcVyxTrFH8UexTjFbMW6xSHGoMY2x+TH'
    + 'p8h/yWvKa8t9zKHN1M4Y0GnRyNIz1KnVKtez2EXa3tt93SHfyeB04iHk0OV/5y3p2uqF7C3u0e9y8Q3zovQy9rr3PPm2+ij8'
    + 'kv3z/koAmQHeAhoETQV2BpUHqwi3CboKswujDIoNaA49DwoQzxCMEUES8BKXEzgU0hRnFfYVgBYEF4UXARh6GO4YYBnPGToa'
    + 'pBoLG3Ab0xs1HJUc8xxRHawdBx5gHrgeDh9jH7cfCCBYIKUg8CA4IX0hvyH+ITgibiKgIswi8iITIy0jQCNMI1AjTCM/Iygj'
    + 'CCPeIqkiaSIdIsYhYiHyIHQg6h9RH6se9x00HWMcgxuVGpcZjBhxF0gWEBXKE3USExGjDyYOnAwGC2MJtgf9BToEbQKYALz+'
    + '1/zr+vr4BPcK9Q3zDvEN7w3tDusR6RfnIeUx40fhZN+K3bnb89k52IzW7dRd09zRbdAPz8TNjcxqy13KZsmFyLzHDMd0xvXF'
    + 'kMVFxRXFAMUFxSbFY8W7xS7GvcZnxyzIDckHyhzLS8yTzfPObND70aLTXtUw1xXZDtsZ3TXfYeGc4+XlO+ic6gjtfO/48Xv0'
    + 'A/eO+Rz8q/45AccDUQbXCFgL0g1FEK0SDBVeF6QZ3BsFHh0gJSIaJPwlyieEKSgrtiwtLowv0zACMhgzFDT2NL81bTYCN3s3'
    + '2zcgOEs4WzhSODA49DefNzI3rTYRNl41lDS2M8IyuzGgMHMvNC7lLIYrGCqcKBQnfyXgIzYihCDKHgkdQht2GaYX0xX+EykS'
    + 'UxB+DqsM2woOCUYHgwXFAw4CXwC5/hr9hPv4+Xf4APeU9TT04PKY8V3wLu8N7vjs8Ov26gnqKelX6JLn2uYu5pDl/uR55P/j'
    + 'kuMw49nijeJM4hXi5+HD4ajhluGM4Yrhj+Gb4a3hxuHl4QniMeJf4pDixuL/4jvjeuO74//jRuSO5NfkIuVv5b3lC+Zb5qzm'
    + '/eZP56Pn9+dL6KHo+OhQ6arpBOpg6r7qHuuA6+TrS+y07CHtkO0D7nru9e5z7/fvfvAL8Z3xNPLQ8nPzG/TJ9H31OPb59sH3'
    + 'j/hk+T/6IfsK/Pn87/3r/u3/9AACAhYDLwROBXEGmQfECPQJJgtcDJQNzg4JEEURghK+E/kUMxZrF6AY0Rn/GiccSx1oHn4f'
    + 'jSCUIZIihiNwJFAlIybrJqYnVCj0KIUpByp6Kt0qLytwK6ArvyvLK8YrrSuCK0Ur9CqQKhkqjinxKEAofSenJr4lwyS2I5ci'
    + 'ZyEmINUedB0DHIQa9xhdF7UVAhRDEnoQpw7MDOgK/ggNBxcFHQMgASH/IP0f+x75H/cj9SrzNvFI72Dtf+un6dnnFeZc5K/i'
    + 'D+F93/ndhdwg28zZithZ1zvWL9U41FTThdLK0STRk9AY0LPPZM8qzwbP+M4Azx3PUM+Zz/bPaNDv0IrRONL60s7TtdSt1bbW'
    + '0Nf52DHad9vL3Czemd8R4ZPiH+Sz5VDn8+ic6kvs/u20723xJ/Pi9J72WPgR+sf7ev0o/9EAdQITBKoFOQfACD4KswsdDX0O'
    + '0g8bEVkSihOuFMYV0BbNF7wYnhlxGjYb7RuWHDEdvR07HqweDh9jH6of5B8RIDEgRCBLIEYgNiAaIPMfwh+HH0Mf9R6eHj8e'
    + '2B1qHfQceRz3G28b4hpRGrsZIhmEGOQXQhedFvYVThWkFPoTTxOkEvkRThGkEPsPUw+sDgYOYg2/DB4MfwviCkcKrQkWCYEI'
    + '7gdcB80GQAa0BSoFoQQbBJUDEQOOAgsCigEKAYoACgCM/wz/jf4N/o79Df2M/Av8iPsF+4D6+vlz+ev4YvjX90v3vfYu9p31'
    + 'C/V49OTzT/O48iHyifHx8Fjwv+8l743u9O1c7cbsMOyc6wrreurt6WLp2+hX6NfnXOfl5nPmBuaf5T/l5OSR5EXkAOTE44/j'
    + 'ZONB4yfjF+MR4xXjI+M741/jjePG4wvkW+S35B7lkOUP5pjmLufP53zoNOn36cXqnuuC7HDtaO5q73bwi/Gp8s/z/fQz9m/3'
    + 's/j8+Uv7n/z3/VP/sQATAncD3QRDBqkHDglzCtULNQ2SDuoPPhGNEtYTGRVUFogXsxjWGe4a/RsBHfod5x7IH5wgYyEcIsgi'
    + 'ZiP0I3Qk5SRHJZkl2yUNJi8mQSZDJjUmFiboJaklWyX9JI8kEiSGI+siQiKKIcQg8h8SHyUeLR0pHBobABrcGK8XeRY7FfUT'
    + 'qRJWEf0Pnw49DdcLbgoDCZcHKQa7BE0D4QF2AA//qf1H/Or6kfk++PD2qfVq9DLzAfLa8Lvvpu6b7ZrspOu46tjpA+k56Hzn'
    + 'y+Ym5o3lAeWB5A7kqONP4wLjweKN4mbiS+I74jjiQeJV4nTinuLT4hPjXOOw4w3kc+Th5Fjl1+Ve5uzmgOcb6LzoYukO6r7q'
    + 'cusq7ObspO1l7ijv7e+z8HrxQvIK89LzmvRh9Sb26/at9274LPno+aL6WPsL/Lv8aP0R/rb+V//1/40AIwG0AUECygJOA88D'
    + 'SwTDBDcFpwUTBnoG3gY/B5sH9AdKCJwI6wg3CYAJxgkJCkoKiQrFCv8KNwtuC6IL1QsGDDYMZQyTDL8M6wwWDT8NaA2RDbgN'
    + '3w0GDisOUQ51DpkOvA7fDgEPIg9DD2IPgA+eD7oP1Q/uDwYQHBAxEEMQVBBiEG0QdxB9EIAQgRB+EHgQbhBgEE8QOhAgEAIQ'
    + '3w+4D4wPWw8lD+oOqg5kDhkOyA1yDRYNtQxODOELbwv3CnoK9wluCeAITQi1BxcHdQbOBSIFcgS9AwUDSQKJAcYAAAA4/23+'
    + 'n/3Q/P/7Lfta+of5s/jg9w33O/Zq9Zv0zvME8zzyePG38PrvQe+N7t/tNe2R7PTrXevM6kPqwelH6dXoa+gJ6LHnYeca593m'
    + 'qeZ+5l7mR+Y75jjmQOZS5m7mlObE5v/mQ+eS5+rnTei56C7prOk06sXqXusA7KnsW+0U7tTunO9p8D3xF/L38tvzxPSx9aL2'
    + 'l/eO+Ij5hPqC+4H8gP2A/oD/fwB9AXoCdQNtBGMFVgZFBzAIFwn5CdYKrgt/DEsNEA7ODoYPNhDeEH8RFxKoEi8TrxMlFJMU'
    + '+BRTFaUV7hUuFmUWkha2FtAW4hbqFukW4BbNFrIWjhZiFi0W8RWsFWAVDRWzFFEU6RN7EwcTjRINEogR/xBxEN4PSA+uDhEO'
    + 'cQ3ODCkMggvZCi8KhAnYCCwIgAfUBigGfQXUBCsEhAPfAjwCmwH9AGIAyv80/6L+E/6I/QH9ffz9+4L7CvuX+ij6vvlX+fb4'
    + 'mfhA+Oz3nfdR9wv3yfaL9lH2HPbr9b71lfVw9U/1MfUX9QH17vTf9NL0yfTC9L70vfS/9MP0yfTR9Nv05/T19AX1FvUp9Tz1'
    + 'UfVn9X/1l/Wv9cn14/X+9Rn2NfZR9m32ivan9sX24vYA9x73PPda93n3l/e299X39fcU+DT4Vfh2+Jf4ufjb+P74IflG+Wv5'
    + 'kfm4+d/5CPoy+l36ifq3+ub6FvtH+3v7r/vl+x38VvyR/M78DP1M/Y790v0X/l7+pv7w/jz/iv/Z/ygAegDNACIBeAHPAScC'
    + 'gALZAjQDjwPrA0cEpAQBBV0FugUWBnIGzQYoB4IH2gcyCIgI3QgwCYEJ0AkdCmcKrwr1CjcLdwu0C+0LIwxVDIQMrwzWDPkM'
    + 'Fw0yDUgNWg1nDXANdA10DW4NZA1VDUENKQ0LDekMwgyWDGUMLwz1C7cLcwssC98Kjwo7CuIJhgklCcEIWgjvB4EHEAedBiYG'
    + 'rgUyBbUENgS2AzMDsAIsAqcBIQGbABQAj/8J/4T+//17/fn8ePz4+3v7//qG+g/6mvko+br4Tvjm94H3IPfD9mr2FPbD9Xf1'
    + 'LvXq9Kv0cPQ69An03fO285PzdvNd80rzO/My8y3zLfMy8zzzS/Nf83fzk/O189rzBPQy9GP0mfTT9BD1UfWV9dz1JvZz9sP2'
    + 'Fvdq98H3Gvh1+NL4MPmQ+fD5Uvq0+hf7evve+0L8pvwJ/Wz9z/0x/pL+8v5Q/67/CQBkAL0AFAFpAbwBDQJcAqgC8wI6A38D'
    + 'wgMCBD8EegSxBOYEGAVIBXQFngXEBegFCQYnBkIGWwZwBoMGkwahBqwGtQa7Br4Gvwa+BrsGtgauBqUGmQaMBn0GbQZaBkcG'
    + 'MQYbBgMG6gXQBbUFmQV9BV8FQQUiBQMF4wTDBKIEggRhBEAEHgT9A9wDuwOaA3oDWQM5AxkD+gLaArwCnQJ/AmICRAIoAgwC'
    + '8AHVAboBoAGHAW0BVQE9ASUBDgH3AOAAygC1AKAAiwB2AGIATwA7ACgAFQACAPD/3v/M/7r/qP+W/4T/c/9h/1D/P/8t/xz/'
    + 'C//6/un+1/7G/rX+pP6T/oL+cv5h/lD+P/4v/h/+Dv7+/e793v3P/cD9sf2i/ZP9hf14/Wr9Xf1R/UX9Of0u/ST9Gv0R/Qj9'
    + 'AP35/PP87fzo/OP84Pzd/Nv82vza/Nv83fzf/OP85/zs/PL8+fwB/Qr9FP0f/Sr9Nv1E/VL9Yf1w/YH9kv2k/bb9yf3d/fL9'
    + 'B/4c/jL+Sf5f/nf+jv6m/r7+1v7u/gf/H/84/1D/af+B/5n/sf/I/+D/9v8MACIAOABNAGEAdQCIAJsArQC+AM4A3gDtAPsA'
    + 'CAEVASABKwE1AT0BRQFMAVMBWAFcAV8BYgFkAWQBZAFjAWIBXwFcAVgBUwFNAUcBQAE5ATEBKQEgARYBDQECAfgA7QDiANcA'
    + 'ywDAALQAqQCdAJIAhgB7AHAAZQBaAFAARgA8ADMAKgAhABoAEgALAAUAAAA=',
  'dm-roll':
    'UklGRkzxAABXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YSjxAACNEdkRocXLGkIuoxe3OvUVuZUfB5O8CR9eEMkl'
    + 'QfjBHOcK6h4r3BElOEFPM688xhgCFb0NS1MSHYcuNzla4/cMEyumJsPffy1nSjf68RWlIQwP0iNX86IWgGF+EAUTlRDlA5wT'
    + '0wg4EyE8tA/0Mv4QBDZBJlU3xwL/fzn6mgfjI5wB4A5S8CsLX0JFDrdfABIuGJQGRe6IFOPukP41QzgHIEjl6jE8yhpY9p8G'
    + 'TikHEhgigg5RJ9sOGEwpBjsmNAucPzL3yhuZ87QnagKCOpf59MFYF1ACzgfS+Lj3S+66/UICMAPOZv//qN6YBNpGbwEarkjs'
    + 'dPox4RkWjvqALdUH1DOA+rY3XxGI9ev+Qu4IExg5FhBQ/KgOj71b7g7F6f+q0EARHyGwA0IMzgcTKwzspOqFG64LwvT2JZjj'
    + 'GvA3+4wbPt1C29HwD+wNJbzq/Pr6u/3r+BvKACbli/OOALgMNBuI8ysZCASeJZvv8/kQJWPn4AYF+139PZ//+gGt+vYrtLDz'
    + '0sbv8qYW0hU4zHz1Zup43jZKwOvQ6ycJTCq49wPLz/if9NAKMcpT7hXtxgFdMHru7Z2B/y8Z6/DsDUPybd6dAMWtwv4zBN3w'
    + 'wuGi6wUNVQjLAAn5lVoo6mTxiOVoxJv8lgi+7oYK5On/SgHtsSxW7/gQ4Oh0Twz65bcO+pLW6u6hxTT6iuMD5rGqEu98HOzy'
    + '9uqL8iijiPBIvPrrGAdu/h0kcdotZZTf/39z3nIJCNy9uMXEAYCW9Hj+VtImwGTj39XNzNHJC+q94zvWdyeF0fny0OQ34HvY'
    + 'l63E2oWI7+VKy3zvJOMh2etJatdF7KjmERzc7lvH7Pzqn9vZ76uc5SO58vu9WmwIArNv3/MQSeTxrX315BUt6c728+cS2Jv3'
    + 'st6RC/67YuSc+r8Nw8fH8WOcWwDQmY4TgewYA788jRHk7KHFv91CLmL1tzr2L7mVO/OTvGvQXhBSJ0H49AHnCrhBK9w89jhB'
    + 'r6evPMWgAhX5TEtTYlKHLvrnWuPT3RMrokfD37O3Z0otxfEVrx0MD3TkV/MA/IBhj/QFE2sS5QN0UNMIfwchPE0o9DJ6kQQ2'
    + 'IgRVN7LY/3/txJoHntmcAcX5UvDHQV9CaMS3X2ESLhiO9kXumwDj7utMNUPJMyBI/GExPLwOWPYe8U4pqgwYItMnUSffJBhM'
    + 'aN47JlwhnD+1Kcob/3+0J/9/gjoG7vTBQg5QAirM0viT/UvuzTBCAg1jzmbs9ajeEvraRsClGq5vFXT6deIZFi8AgC097NQz'
    + '6he2N7e5iPWUyULu/38YOYnSUPyi3I+9/38Oxf9/qtBJ1h8hvgJCDOgpEyssd6Tqd92uC1oG9iUKPxrw4iqMG1/8QtsfCQ/s'
    + 'a8K86n0B+rsJ//gbNhom5RLtjgD7JTQblkMrGZUSniXWHPP5Swtj55QHBftS3j2f+xcBrRUAK7SNetLGwVymFnwZOMxu2Gbq'
    + 'VcQ2SkRF0Ou2EEwqixwDy0qfn/QBNTHKLBoV7RjCXTDB5e2d1w4vGdcC7A1j723e4/nFrX7xMwQkCMLhGlIFDQGAywBO8pVa'
    + 'hAlk8UMQaMTg6pYIT52GCkES/0rEYLEsEKr4EIQwdE/G7eW30vyS1lTFocWi7YrjOkmxqhAhfBx1YfbqXEIoo/oYSLz6YRgH'
    + '1BgdJH4uLWVp7/9/kANyCZ3YvbjLNgGAOb14/qEqJsDe89/Vrz/RycQnveMpY3cnvCX58nWkN+AV+Jetu7mFiK7dSst+TiTj'
    + '/BzrSZjRRexJvxEcBflbx3Gy6p8g0O+rOwYjuYE0vVogFQKzAYDzEGQC8a2K9OQVvgbO9vtIEtgBgLLeAMz+uxkNnPr/ksPH'
    + 'xzxjnCX+0JkDGIHsJci/PKEU5OwaIr/dzfJi9Tny9i+b8zvzz7Nr0DDbUidr2vQB2ve4QdEZPPbDpq+ngtrFoM0z+Uypt2JS'
    + 'LrP65zns090CEKJHtOGztzsrLcUnEa8dmxB05PAAAPwYZI/0lNdrEgGAdFB2PX8HZMtNKJ3repFILyIEJo6y2Jii7cQkkJ7Z'
    + 'Fr7F+c0Dx0GmCWjEEP1hEmOgjvYBgJsAkfTrTK7YyTPTDfxhuRy8Dtj+HvHdIqoM2gbTJxEZ3yT91WjervRcIRsLtSlFL/9/'
    + 'XO3/f6shBu5590IOMAEqzDo3k/3/m80wFcQNYyu77PVHjRL6dOrApe86bxXIAnXivh4vAFJRPeygX+oXMBO3uQ5jlMkGHv9/'
    + 'WuuJ0qD5otw+yf9/wer/f70ISdanSb4C8XzoKW3RLHcaNHfd+uRaBh05Cj+zF+Iqpblf/HNSHwl//WvCUQF9AXvjCf9A+jYa'
    + '2zUS7VkT+yWcL5ZD/zCVEopl1hz1CEsLosmUB7tVUt6yB/sX91YVAMotjXqSEMFcUSp8Gf9/btj/f1XEXxhERYccthBITosc'
    + 'MuNKn3IjATW6DiwaniAYwl7gweW9tdcOMJrXAiHOY++u8eP5Avp+8Vt0JAixRRpSytIBgF4aTvIH8IQJJPZDEG4P4OrFJk+d'
    + 'VfFBEjM+xGAJxBCq6QKEMP9/xu0LDtL8alBUxR0Gou3MIDpJZv0QIer2dWEo1VxCqxf6GOjQ+mFmJNQYcTt+LsoTae/O75AD'
    + 'kRid2JTuyzYfMzm9zZqhKjnt3vMqkq8/ia3EJ/xKKWNDMbwleth1pHitFfgBgLu5Y+Ku3f9/fk5QGPwcpeGY0QMaSb+XqgX5'
    + 'EPBxstQFINCP+zsGqyuBNAQTIBWnJAGA6NlkAtwwivTIWL4Gscn7SOrNAYC2RwDMcfMZDaJK/5LG5Mc8fkwl/kkDAxiwCSXI'
    + '0lChFHHmGiL+xc3yWeA58hQRm/Oaoc+zuxkw22rYa9oiNNr3AYDRGVzIw6YnloLaecTNM33+qbcz5i6zQOE57InlAhCH+LTh'
    + 'OrU7K2ASJxEZD5sQDf/wAKAHGGSU+JTXDFcBgA7idj1M1WTLLLyd60asSC8PoCaO+7KYokPfJJD49Ba+DuXNAwC4pgnaEhD9'
    + 'zQljoGzYAYBOvZH09/6u2D7r0w3Qkbkcbt3Y/qvv3SJnsNoGTuwRGciS/dXRK670gycbCxjWRS9q+FztAYCrId+meffa1jAB'
    + 'PK06N8sP/5viVhXEmqoru0G+R40G+nTqWkbvOuqsyAKN/r4et1VSUYWZoF8rrzATZ98OY5PbBh7LJVrrIwig+aObPskYGsHq'
    + 'AuC9CIhGp0lU4PF8W+Ft0RMjGjSnMPrk9iAdOR2usxe9KKW5ctRzUv8af/3vwVEBHSl74xzmQPpjzds1SjtZE64inC8k9f8w'
    + 'mGaKZYYA9QgmG6LJ3ii7VUP5sgdVNfdWS//KLX0GkhCKZ1EqN+X/f/Ca/38idl8Y/3+HHN0ISE6utTLjKg5yI3YPug6cFJ4g'
    + 'QuJe4BQ+vbXROjCaxMwhzppDrvH/fwL6CiZbdNcJsUXhE8rSZzxeGlW8B/CRIiT2tgNuD4B8xSbtDVXxInEzPtjZCcTKNOkC'
    + 'ZCX/fwfkCw7wG2pQOVMdBvz+zCDhs2b91Q3q9vjcKNV9+qsXxwfo0OGuZiTzsnE74yPKE6Pszu8BgJEYCDKU7o0VHzNv382a'
    + 'IL457ScyKpI3F4mt/3/8Sv8ZQzHCF3rYSPl4rSQuAYBjI2Pi+kT/f6/kUBgR6aXheOYDGv8ql6odURDwDufUBcnoj/usEKsr'
    + 'U/IEExQzpyTFhejZ3NLcMEfVyFgogrHJksvqzULOtkfv9HHzCTyiSrbyxuRUyH5MCv1JA+I4sAmIy9JQIc9x5ose/sVy9Fng'
    + 'ZyMUEbT/mqFPJrsZf8hq2K3/IjTe9AGAf75cyJqrJ5bUJHnEr+x9/jrIM+bv+UDhrjuJ5XSDh/hkrTq18stgEhZMGQ8MDA3/'
    + 'rSWgB0q+lPjVvgxXuBIO4hX9TNXYFiy8du5GrNUGD6Ce//uyOSBD3wAh+PRznQ7lAYAAuPoo2hIgMs0JVrps2EaMTr3d9Pf+'
    + 'wiA+64dO0JGtCG7dBNir7xq7Z7Dw6k7sZNnIkhSy0SseVoMnLEcY1oYjavg1tAGADRPfptkG2tat+zytiCbLDwUF4lY1Cpqq'
    + 'RwRBvgn0BvqagVpGuuXqrDLDjf46nLdVSjuFmdk9K68UKmff9O6T2/8pyyVr4iMIBu2jm92nGBpf+ALg3uaIRleeVOAz4lvh'
    + 'bOETI/dGpzBfF/Yg9Ogdrq72vSjB7HLUm+D/Gpiy78G+5R0pFscc5litY80aDUo7CAiuIrOUJPVP75hmryyGAI4xJhtAMd4o'
    + '4v1D+QzQVTXKxEv/zxJ9BjAWimdUSDflzT/wmlT/InZJxf9/RfjdCGoWrrViASoOqO52D3QcnBRG9ULi5+8UPmMj0Tpo/sTM'
    + 'FyKaQ7ok/3822gomYf7XCeRl4RPA22c8halVvOC3kSKbHbYDTR6AfOUW7Q2FXiJxQI/Y2YczyjQMcmQlm+IH5LAK8BvW9jlT'
    + 'Su/8/pAN4bMRa9UN/3/43IAMffr/f8cHrR/hrvR687LvF+MjZiOj7FovAYD/fwgyB0iNFTv0b9/qTCC+NQUnMp/9NxdhR/9/'
    + 'yBf/GSMkwhcvFUj5gyUkLlkpYyOdqvpEdDSv5L3bEelYwnjmMAv/KucRHVGl5w7n/TfJ6HLDrBBw9FPyLuoUMxEGxYWnFtzS'
    + 'ddFH1fUsKIIcCZLLeKBCzlec7/RTAwk8tPe28nj9VMgFAQr9FQ7iOBc0iMtGxiHPusKLHqHGcvTbD2cjc0K0/y3pTyYBgH/I'
    + 'RqWt/3XT3vQE4n++5+maq54B1CQC76/sTTc6yLbb7/ne0a47IRl0g0CuZK2HFPLLXQUWTC74DAxeVK0lJd9Kvoxt1b5W9LgS'
    + 'nLwV/RoE2BZYx3buktjVBnwVnv/dHTkgX98AIaE0c52KPQGAMEz6KPUbIDL4R1a61JtGjGfu3fQH0cIg9QSHTgXgrQga9QTY'
    + 'KmEauwn08OpxEmTZte8UsnT/HlYs+yxH9RGGIz83NbQSUA0TjgjZBqAWrfvHuYgmO/EFBc8mNQoMIkcEmP4J9GwhmoGhC7rl'
    + 'RTAywzn/Opw83Eo76f/ZPQGAFCqjAPTuAYD/KZ6Pa+K5AQbtRALdp9eqX/jdwd7mIS9XnnnMM+LOW2zhoOT3Rq35XxfwOPTo'
    + '/umu9ratwexs3Jvg+9+YsouZvuXS0xbH+7lYrccRGg3J4ggIDNKzlG7bT+/v7K8s4wGOMeusQDENq+L9mRwM0BnNysSwmM8S'
    + 'XPswFg39VEizlM0/PvJU/8ENScWk+0X4LApqFvOfYgFt/KjuMNx0HOLTRvVdHOfvrT1jI5FPaP6qNxciEO66JM8HNtoKH2H+'
    + 'h/7kZYMAwNt3JoWphvngt83Xmx3j6U0eiyLlFuIChV4hFkCP+SiHM4jzDHJ1MJviER6wCq/K1vbEWErvBvSQDbS4EWsM2v9/'
    + 'j9yADCIW/38pBq0f9AP0ejw37xeJKWYjOClaLwQv/3+pOgdIb6w79KMI6kz7qTUF2B6f/TQdYUe7VMgXilwjJCspLxWEBIMl'
    + 'XjhZKVUDnar6HnQ0uFK9260BWMIASTALDkLnETzspef7UP03KkJyw3YicPSz9C7qGO8RBl3/pxZUN3XRNOj1LHgwHAnP13ig'
    + 'ZA1XnAgdUwP/f7T3kc14/d1hBQHMGxUOmygXNGcYRsaZKLrCZwihxqFb2w/P9nNCCEkt6UHrAYD0CEalOdN10z4iBOI1Vefp'
    + '1wSeAdj9Au8ozU03u/q229Cy3tG11SEZpRBAriJJhxT/f10Fi+Qu+KtNXlT/DiXf+fmMbRYYVvRmBJy8ogYaBEvrWMdnt5LY'
    + 'na98FRgi3R1u8V/fqOChNB0Aij0VKTBM/Aj1G1nd+EeFP9Sb8VFn7moZB9FxMvUEfUAF4Lg6GvXlHyphJh8J9CAbcRLyxrXv'
    + 'tSR0/6K5LPvv1vURR0Q/Ny0sElDmTY4ISvKgFmzEx7nd8zvxoQXPJlcEDCIgO5j+LO1sIR4SoQsmzEUwyhY5/0H/PNzI1+n/'
    + 'L/IBgID0owCf7wGAWVmej6L3uQGP70QCpo7XqqLM3cHV7CEvN9Z5zABBzlvr76Dktjqt+Tf68Dgq+P7p0vC2rc/0bNwMTfvf'
    + 'AYCLmR+K0tP91Pu5EfHHEUETyeIaBwzSuNlu260h7+xiIeMBnvTrrCscDauL95kcd8sZzQMMsJjN7Fz7aeYN/Qoys5QBgD7y'
    + '4prBDUampPt20CwKntXzn0KUbfzzrjDcE7Xi08FgXRyPPq09u8uRTyTOqjdtpRDuAYDPBwvbCh+ZrYf+Hd2DAPaOdya8uob5'
    + 'UOrN1xT24+lN+Ysi/p/iAkERIRZkvPkoXAeI8/XmdTBBoREeGdmvymj9xFhQCwb0feW0uC49DNpSI4/cQ+MiFqEYKQYsV/QD'
    + '8Vk8N5i2iSmhxzgpskUEL8zDqTqot2+sYOSjCLYU+6lA+9ged+A0HcTgu1RP4IpcLdkrKdZ9hATfGF44uDhVAyDz+h4kBLhS'
    + 'ROqtAZSHAEmQyg5CebU87AGg+1CF1ypCkFp2IvcUs/TCWhjvTy5d/05CVDdR7DToeTZ4MK1Bz9cA/2QNEToIHd46/3/GAZHN'
    + 'lOTdYa7hzBtQI5so0y9nGDz2mShoIGcIWDyhW6o+z/aIbghJIWBB65Hq9AhfdDnT/wE+Ip5SNVXXH9cElQbY/TS+KM24Ebv6'
    + 'rMnQsuZKtdVnZqUQrO4iSV4m/3++8Ivk4/SrTSQ8/w5+Efn5/msWGPH4ZgQtRKIG9RRL6/M3Z7c8952vyQoYIosGbvG14Kjg'
    + 'ziwdAGQrFSmxJ/wIW1dZ3R1ShT/G8/FRehlqGbDlcTJCBn1AteW4OgZX5R8NFiYfu/cgG6w/8sa8krUkY5qiuR0q79YZBEdE'
    + 'jg0tLH285k0S/0rywGZsxCgq3fN/CKEFN+lXBG3rIDuHkiztwwweEt0qJszlrsoWv91B/2XEyNdLzi/yhAKA9CmVn+9eH1lZ'
    + 'lyai9z7zj+88gaaOQ82izGA/1ewBgDfWoO4AQRTE6++VKbY66d03+g0VKvhCHdLwJF7P9Mz1DE1CEwGA/LMfioU8/dSc2BHx'
    + 'kOJBE8r9GgfErrjZ7gmtIUQvYiFjDJ701KsrHCb2i/fTIXfLgZsDDOvDzezkJmnmRgcKMtMNAYD5VuKaQA9GpiMYdtD/f57V'
    + 'EupClHPL864eCRO11AjBYLjWjz4QvLvLlGUkzpn/baW6yAGA2xsL277mma2O3h3dPQf2jvCnvLrp+lDqmkkU9iP/Tfl/0/6f'
    + 'IcxBEWTQZLy511wH1ND15ioSQaHLihnZcQ5o/djOUAsB9X3lL6guPeUkUiN+IEPj0hGhGOeTLFciC/FZovWYto2Pocco4LJF'
    + 'NPTMw0j+qLdu62DksvG2FFQuQPtZInfgAYDE4FLVT+Di3S3ZGY7WfdDs3xhuKLg42rIg8zX8JATBvUTqVMuUh685kMpp1Hm1'
    + 'uggBoKSThdeEUpBa/xP3FJntwlqGFU8uSbJOQks3Uexj7Hk2/fOtQe7mAP/x4xE6ISbeOmQRxgH2JpTk9gau4eMiUCMZ9dMv'
    + 'vnw89q+9aCBhTlg8HlWqPu3liG7/fyFg80WR6txFX3QwF/8B0AueUjIN1x+ALJUGiGA0vpcjuBEI7azJkUXmShNLZ2YkPqzu'
    + 'OENeJjcQvvBJ7+P0p/IkPBHMfhHrKv5rzhrx+M0ILUSUifUU2t/zN2ZXPPft/MkKdjCLBqDXteA1Zs4syhVkKzsrsSf/f1tX'
    + 'DmgdUlkLxvM3/HoZCQmw5X4yQgasErXlPwMGV3RgDRbMD7v3/3+sP28YvJIUbWOaIyQdKs9BGQTK644NZeR9vMUlEv+SP8Bm'
    + '4g4oKiTLfwiXxjfpacJt63Wwh5JQDsMMwEDdKqYG5a65lL/dW/xlxCL9S85TboQCwroplfLvXh8KWZcmUBk+85YePIGXB0PN'
    + 'EhJgP0coAYAX2KDuxiwUxD+7lSmtEOnd+wgNFdjgQh2b/iReWeDM9bPJQhPK7fyzC8iFPM0PnNjExZDibiPK/UrExK5I4+4J'
    + 'beBEL4BCYwyTENSra/Um9jEZ0yFWloGbHP7rw61k5CYHB0YH0wPTDfYb+VZoLUAPH5wjGOmr/3/dChLqVtxzy/RBHgkj8NQI'
    + 'sp641vG/ELwBgJRlUPOZ/031usge6dsbJTS+5ro5jt6i9D0HqJHwpyAb6fp4F5pJjgoj/6Erf9NovyHMx11k0FTIudc3HdTQ'
    + 'YaIqEonHy4pLQXEOc+fYzr4dAfWx/i+otezlJGA1fiBc5NIRLpbnkzzGIgsmCaL1egCNj2adKOC4xjT0Bc1I/gXXbuuso7Lx'
    + 'TMhULonCWSLYDAGACQ5S1aPd4t240BmOwOrQ7Gq6bihwqdqyWbM1/D7Cwb2Dp1TLfemvOaUFadTDkboIOuKkk/jVhFIP8v8T'
    + 'eOCZ7bWYhhWCokmyUuNLN5UVY+wBgP3zcfTu5iIf8ePG3CEmkQBkEc/C9ibE4PYGwZbjIgGAGfWXGL58hLmvvQnVYU7Jpx5V'
    + '1aft5bjm/39QzPNF2gTcRfAJMBfHBNALGwIyDUlGgCz2w4hg6PeXI5I0CO2mPJFFYrgTSynxJD7cRThDDB03EPsOSe/r+6fy'
    + 'IfURzAgY6yqQ/s4aZwrNCM4RlImA7drfAStmV/9/7fyfunYwSiSg137vNWYSM8oVsBk7KzQ+/3+pUw5ooCNZCxpTN/wKpwkJ'
    + 'PGt+MmovrBLZUj8DJOF0YNz0zA+xJf9/2R1vGO8sFG3ZVCMkZsfPQWJPyuteH2XktBTFJZvVkj9WN+IOQaYky909l8Y802nC'
    + 'cx91sF4WUA68VcBAQBKmBgv4uZSpAFv8MFgi/eoyU25uBMK6Bwvy70DICllYKFAZBr2WHqA4lwfeGBIS/39HKDvaF9jDCsYs'
    + 'C2g/uxpJrRDB6vsIeBfY4KMLm/6tGFngVOezybYEyu1HuQvIVA7NDzQdxMUB+24js7VKxOY1SONwFm3g8t+AQnb1kxCkuGv1'
    + 's88xGWfnVpZaPhz+qeGtZJwgBwcV5tMDswz2G0D5aC0zKx+cfOXpqxmy3Qptu1bcXOX0QeTBI/DTE7Kekejxv9d0AYDRqVDz'
    + 'twlN9QrIHulv5yU01wa6OS2NovS0C6iR/10gG87peBcQDY4K3jKhK0f4aL/A48ddMpBUyAsgNx3Z+mGieM6Jx5QGS0F943Pn'
    + 'HOa+Hecdsf7nvbXsRjNgNZK6XOSI3i6Wnl08xhg2JgkCA3oAfM9mnVDjuMaEAAXNQv4F12f3rKPL+UzIKPCJwhqz2Az+3wkO'
    + 'uiWj3ay0uNDu7cDqKM5quiz7cKnE4Vmztjw+wh0Mg6fWsX3pehKlBYPKw5Fa0zriQv741cjVD/LzGHjgJMa1mO3MgqI+ylLj'
    + '4M2VFdkeAYDzBnH0SjsiH/BVxtxCs5EAq+jPwtWqxODTvcGWh8QBgBOvlxjkroS5C9sJ1RSmyafRCtWnPrS45u9qUMzbytoE'
    + 'fOTwCXGhxwS5NBsCGRhJRvvv9sOsn+j3YuySNICrpjygKmK4KAsp8cvo3EUBgAwdW7X7DgkI6/ugIiH1dx4IGCWbkP7u+GcK'
    + '+xzOETKbgO0z7QErO/z/f2Lhn7rDlkok1uJ+7ybkEjNX7rAZdts0PtPiqVMK+KAjIBEaUxvuCqd76jxrjgRqL6Kj2VJoGiTh'
    + 'kQTc9AkIsSWLNtkdmqnvLAeq2VRJGWbH8gxiT/YWXh9k+bQUsjGb1QhAVjdNK0GmEQjdPfmuPNN+PHMfkFNeFk04vFXD7kAS'
    + 'ZDsL+D1FqQD9ZzBYyPHqMgYSbgQDQgcLxCBAyNDnWCjQMga9BjugOD0j3hi9Kf9/bxI72hJnwwr88gtoFwIaSQYfweoJSXgX'
    + '5NSjC57drRi8uVTnHB62BIDlR7mnCFQO+Do0Hdr6AfunJLO1FQrmNZ44cBY8LvLfnvR29UENpLhqR7PP5iZn5+nOWj7nManh'
    + 'W9ycIPRUFeYsQbMMlBxA+UIVMyuWAnzl5iwZsg75bbu4FVzl3DPkwWft0xME6pHoM83XdNTS0akNrbcJuCgKyIpcb+dVSdcG'
    + 'lbQtjUUmtAupR/9d/uvO6bQGEA3wn94yCw5H+C7NwOM9CjKQj7QLIHoa2fqvMXjO19mUBpTIfeMSlxzmr/LnHV7j571YtEYz'
    + 'ihWSusjpiN58y55dz+QYNrAzAgMNHXzPm/lQ4/wdhADQx0L+tQFn91oHy/mG6SjwbxUas5ba/t8cGbolKRustAGA7u0LOijO'
    + 'AYAs+3rixOHWMbY8u/AdDPq41rHUynoSOzGDylWiWtOjNUL+DPzI1bHE8xjJ4STGYcztzAEnPsoMIODNAKnZHg7o8wZB0Uo7'
    + '4TjwVXa4QrOORqvot/bVqnK/070c1ofEUs8Tr6y35K4A+QvbR7gUpm+J0QqH3z608ZnvasvL28pWw3zkSsRxoQhOuTRP7xkY'
    + 'j/f77yeVrJ96ymLsmPOAq/22oCpvEygL46zL6F7YAYA9yVu1x+wJCF/FoCKi1ncey9clm1C/7vis+fscau0ym1ndM+2gzDv8'
    + 'iwdi4a3Vw5Yx0tbiAOYm5LcyV+6WoHbbYgbT4myGCvha7CARGC4b7kH6e+p3644E3siio/vlaBoT2ZEEK8AJCODYizZE8Zqp'
    + 'x8MHquvCSRlaqfIMrP72FkYHZPlp+bIx7h0IQA/1TSsDBREIJgL5ro/wfjzi3JBTOmJNOJ3jw+7V2mQ7LBE9RfAJ/Wfnu8jx'
    + 'zTYGEuT9A0KYzsQggT7Q5/Yk0DK1ywY7Jl89I+YqvSkyDG8SWloSZwcX/PJWDxcCRPIGHw0vCUkqK+TUIBae3ZvwvLm3HRwe'
    + 'FxWA5WjZpwic0/g6Ajba+vCepyQcJhUK7wWeOAhcPC4nBp70wj1BDXcLakcqJOYmLkLpztoI5zHDTlvcde/0VAwtLEH3SpQc'
    + 'MD5CFQ56lgJ8+eYsp9sO+aXtuBVWPNwzCTRn7YogBOpV5TPNED/U0iTfDa1mULgo/3+KXPooVUmHMpW0R/5FJnq+qUdW9/7r'
    + 'DN+0BkLN8J/NYwsOqh0uzeIhPQobAI+0vQV6GjE7rzG8CtfZyCSUyEMBEpd++a/y48Ve4+WpWLQU+4oVjAnI6dDIfMvjA8/k'
    + 'fAewM3+dDR0l2Jv5tBb8HUIV0MdYy7UBgAlaB1EyhulHJm8VZPyW2lvqHBlt4ikbghYBgFUJCzriHQGADwZ64rEm1jEhBLvw'
    + '9ST6uAkp1MpB2TsxfalVohxJozXjCwz8Ha6xxNLdyeGbJGHMpPIBJ6rnDCDDQgCpXM4O6EnaQdFfCuE48BJ2uAMYjkbDK7f2'
    + '4Qlyv7EXHNYR9FLPUAOst1wFAPldCke4uCRviTcah9+9AfGZ+NjLy1wCVsOG/UrEsgcITvVmT+/i5I/3YBEnlZYvesoAAZjz'
    + 'zGr9tkzpbxMECuOsF9Re2KfoPclzBMfsESBfxU0GotYfMsvXGPFQvwflrPkxdGrtzAVZ3SDQoMx10IsHzsOt1QIcMdJ13QDm'
    + '4vO3MvbplqDDDmIGHsNshnC3Wuwy9BguOQVB+rr3d+vhwN7Ikgb75ZLCE9lxzCvA0rfg2IchRPFhAcfDjP/rwn8dWqkvZ6z+'
    + '3pBGB4i+afkZxO4d17gP9QSuAwXH0iYCcaeP8Orw4tys4zpiMvid47/51dqb/iwR39DwCUNH57um7s02Lozk/YS1mM5mk4E+'
    + 'Q+f2JJDhtcsg0iZfNkjmKjUEMgyrDVpaksAHF4++Vg+28ETybPgNL/aZKitu6iAW//Sb8Jrrtx3T0BcVN99o2dHxnNPy/wI2'
    + 'shnwnqoxHCZX8u8FPOwIXOUXJwaRIcI9zvF3CwItKiRiNy5Ch0faCN5fw06i5HXvdQ8MLaUQ90rEDDA+CvQOetfNfPlNGafb'
    + '1/Gl7RkbVjyl8gk0LeWKINMkVeWyIRA/ljYk3/9/ZlClKf9/9TP6KOrqhzJ64Uf+zWh6vjDzVve77QzfIB1CzcsazWOe9Kod'
    + 'pxDiIalYGwDQ+L0F9twxO3ZKvAryNMgkQQBDAaDSfvl6+ePFVhnlqRBSFPsA6owJCxbQyAI54wPEqHwHVkh/nYLfJdjIJbQW'
    + '8SBCFWpHWMuBLYAJPKNRMhbtRyaAF2T8/QZb6qglbeJmM4IWCypVCZsC4h0+tQ8GofWxJrEdIQRF1vUkNCYJKXMyQdkbDX2p'
    + 'AYAcSe/J4wuOXR2u/urS3RinmyRbPaTyogOq50o2w0IXD1zONBdJ2l8SXwq1IfASX2sDGPctwytYtuEJAxWxF101EfQYOFAD'
    + 'xetcBSQ2XQr9Krgk4nc3Gn7cvQHa5/jYS/FcArrohv0Y1rIHAYD1ZoXr4uQtEWAR8uiWL4FaAAHGAMxqiTxM6YAMBAryJhfU'
    + 'bg2n6FhAcwQMAxEgmBdNBoIRHzLn8hjxMRMH5XxoMXRz88wFfRMg0Gw6ddC3NM7D0f8CHM2Pdd3GFuLzzpb26X5Cww5sBR7D'
    + 'rStwt4TSMvStszkFpge691f54cBg45IGlP2Swuh5ccwfH9K3ZSiHIQ0eYQHeOoz/S+x/HZ+UL2ez6t6QbBiIvprEGcSs6Ne4'
    + 'zc8Ergk1x9IeEXGnrQvq8GgJrOPj6TL49vO/+cuym/5ng9/QTe9DR572pu4LHy6MKi+EtWwuZpNhtkPnz9OQ4fX5INLNWDZI'
    + 'cic1BEQWqw3ez5LAjLiPvv0FtvAFrmz489X2maHbburwKv/0jdCa6wGA09DE+DffJ8HR8enj8v9O3rIZFtaqMf4HV/LHnDzs'
    + 'lMzlFwYFkSGWyc7xS5wCLdYGYjfiHIdHu+feX/ePouTADHUPPaClELz8xAyMxgr0O7vXzdvdTRk469fxRdcZG9URpfJa4y3l'
    + '5ybTJAQIsiEy3JY269X/f0GzpSmIDvUzLfLq6kmWeuHQ7M1oZd0w84BRu+05uyAdwcjLGjVAnvT8TKcQFO2pWJjz0PiVLvbc'
    + 'qad2Sl++8jSRCEEAQ16g0nQDevk1HVYZ1U0QUqF7AOpZAAsW7RoCOYhwxKiT1lZI4UyC383uyCXxIvEgTRNqR4DygS2E8Tyj'
    + 'xisW7QNNgBcIGf0GKyKoJSU5ZjO78QsqcECbAshDPrX/f6H1zwuxHYwHRdagPzQmXEFzMkkCGw24BwGAkzLvyb7yjl04Bf7q'
    + 'fhsYp3hEWz3f+aID/L9KNre7Fw8j2TQXytVfEkkKtSHD2V9rRu/3LR3rWLac+QMV7kldNakqGDgWDMXrTvUkNsr1/SoKGOJ3'
    + 'FiN+3LXd2udzCEvxoKi66DMPGNbqJwGAZfeF60hXLRGy2vLovwyBWqkAxgBL/Yk8R/yADB4G8ibfJ24N8z9YQEoADAOoJZgX'
    + 'x9+CERIj5/LD3DETxzF8aChlc/P6+X0T4JpsOmfmtzQmONH/BBnNjxoLxhYJLs6WChZ+QsQ3bAUmKq0r3UWE0pQQrbO5KaYH'
    + 'LfJX+bzkYOOnTpT9UwroeVclHx8cBmUoiOUNHuMA3jomQkvssBmflLCxs+og9mwYfFGaxNL1rOjkrM3P1lUJNRIeHhFH+60L'
    + 'Gu1oCUYv4+l05PbzXzHLshwVZ4PyBk3v1AGe9o7yCx/HKSovqNFsLleuYbbwE8/T9BP1+UQMzVgnCHInB+ZEFt0X3s/s8Iy4'
    + '39v9BQPjBa7ETPPVM6Ch23gF8CoBoY3Q7OcBgC/YxPjgiyfBE/zp4xzYTt7HiBbWOw7+B6oox5x0KpTMG/YGBSrnlskTIUuc'
    + 'qjDWBhQX4hzit7vnnOv3jxn2wAwkjz2g2/a8/OtIjMZE/ju7LyTb3UvpOOum3UXXefLVEQ28WuOLtecmgRsECLMgMtxntevV'
    + 'MA9Bs63fiA7B8y3y7/lJlgUT0OxQ6mXdpyeAUXX2ObvIBcHId8Q1QM5N/EwPAhTtVA6Y8+qllS72yqmnEypfvicAkQhpnUNe'
    + 'KSV0A6HeNR0LOdVNVvaheyUFWQD4Mu0aD9aIcEDTk9b9+OFMCynN7nPI8SKguk0TXS2A8vzthPEB+cYr3bcDTcTuCBmdDisi'
    + 'iDolOYHuu/EJXnBA2vTIQwz2/3/zW88LxCCMBxP/oD8AElxBT1dJAjlduAdX9pMyJBq+8sEgOAVz8H4bIRt4REse3/kZUvy/'
    + 'aFW3u+oPI9lGFcrVKT1JCoMEw9mqOUbv3xod67zynPkR8+5Js1+pKq4WFgyuZ071oQXK9ZUpChj/fxYjW+u13anEcwgxVKCo'
    + 'yvMzD4sX6icx/WX3DiNIVxXrstofDb8MxSipAO7lS/0B80f8FQIeBkjQ3yfs/PM/hhRKADb8qCUjAcffpwsSIxHuw9whKscx'
    + '/kooZU70+vl1HuCa9/xn5pgXJjgkTQQZuBwaCwG1CS4IGQoWpzvEN3D5JirqL91FVuOUEAG/uSkQCC3yDbK85DT2p07TOlMK'
    + 'TqpXJYrGHAaH0YjlFf3jAFHvJkLUPrAZsCqwse4VIPYiBnxRSxHS9bbY5KxBJtZVhc0SHl0lR/s8NRrtWQlGL/z3dOQKEl8x'
    + 'AYAcFccN8gYh+9QBBf6O8iwgxykI/ajRFM1XrhL68BN4A/QTkwVEDKQHJwgQLwfmTc/dF/UH7PDxOd/bqLED45IHxEzn5DOg'
    + 'R+54BfDVAaGo9uznslAv2JzE4ItsyBP8/MEc2KVJx4im5jsOr/mqKBzodCodzxv2Te4q55pmEyHzNaowVdAUF/IS4re0z5zr'
    + 'cqQZ9ikhJI+dJtv2niDrSLDbRP5q6C8kqxBL6bX/pt2X23nyuqMNvKHwi7UTG4EbHLSzIKsFZ7UZ9zAPGgmt39MNwfPgxu/5'
    + '2JwFE8vMUOr5C6cnRst19vTDyAX7kHfEvTDOTdgGDwILBFQOqgzqpfj69soS1hMqn9knANHNaZ0EVyklEPqh3pvMCzl79lb2'
    + 'urQlBbcl+DJDxQ/Wz/lA064T/fje9Qspm+lzyKjmoLqB5F0tJc787c/UAfkaLN23K+bE7gXJnQ5B1og6wB+B7ggOCV4wCtr0'
    + '/OYM9n8N81uI2MQgIesT/4MjABK5IE9XUM85XXnWV/YNAyQazUzBILirc/AxDyEb28ZLHnnpGVID92hV+/XqD2DyRhXvCyk9'
    + 'IfWDBCDNqjl8Mt8akDK88tQ3EfO2zrNf5yGuFtAzrme/6KEFHxiVKXcT/3+ja1vrHXCpxOzQMVT/f8rzofOLF6lIMf2ySA4j'
    + 'ifEV6zc0Hw3AGcUoczfu5TIpAfNJVBUCaCJI0IoX7Py1T4YUlzg2/Bw/IwGwAKcLbe8R7kkEISp9Af5KmT9O9IBHdR6cFPf8'
    + 'h1qYFxZXJE1cJLgcRvQBtRdeCBmPFKc7Ehxw+YsG6i9B7VbjrdIBvy8vEAhj7w2y/3809i7g0zqy106qUSWKxrRRh9HMDxX9'
    + 'fSVR72i51D5c7LAq/NnuFcK0IgZODUsR3aO22AfMQSYy7oXNg+BdJV4WPDXDEVkJUCv894gkChJINQGALALHDU8PIfsrGAX+'
    + 'cAcsIEPvCP3e8RTNJNwS+toSeAPX+5MFfOKkB2viEC8Pyk3P9yr1Bw8D8Tlb2aixXyOSB8jm5+RdwUfu4yzw1fnnqPa47bJQ'
    + 'tgGcxIcybMjvAPzBE8ulSUMYpubR6q/51VMc6FQAHc+TnU3uPBCaZmpW8zUXRlXQUlHyEj7TtM+LKHKkNOApIeEJnSaMx54g'
    + 'HuOw23rhaujGJqsQJSK1/6oKl9tuwrqj5u+h8EbcExsiIxy0PTCrBVAqGffF2RoJlYHTDd+r4MbnN9icxebLzJ/W+QtzP0bL'
    + 'BC70w332+5Cn570w7u3YBuz8CwSWOKoMygP4+ksQEtbyIp/Z+LrRzegOBFfJ3xD6AYCbzEeNe/ZZvbq0xgC3JZbtQ8Xr78/5'
    + '9jyuE3Cu3vVu5JvpZPKo5vbDgeQN5SXO25zP1NogGixhxCvmYjsFyUDgQdajDsAf3d4IDrXfMApJx/zmMeZ/DfvuiNieviHr'
    + 'x9uDI7HGuSDoRlDPP9551osmDQOK2s1MG++4q0qqMQ9o0dvGEO956U8sA/dI8fv1PyVg8p0F7wv/MSH1Dukgzb9VfDK12JAy'
    + 'oM3UN3O7ts4yWOchOBfQMwDmv+jjLB8YtRV3E0NPo2udth1wYPDs0D/p/3+AqKHzES+pSD72skgKJInxkWw3NCP3wBmk9XM3'
    + 'wQ4yKUA2SVSR82giIvKKF209tU8AIZc4H7gcPzzdsADQVW3vyyZJBOX0fQHSD5k/0hiAR1k5nBSL3oda+PUWV24nXCTFF0b0'
    + 'vzUXXnfnjxRULRIc102LBrYzQe3CJK3SqxovL3z6Y+/lG/9/G1Yu4MQZstfy91ElIQm0USwnzA/EDX0l7TJouSc0XOyuQ/zZ'
    + 'g1rCtERHTg1f8t2jE/MHzIoWMu5wBYPgs+ZeFlcEwxEcAlArr/iIJGMHSDW9RywCJBxPD2t+KxgiGXAHKARD7xwQ3vE8GiTc'
    + 'KCHaEt5n1/ua53ziETFr4tkTD8qBxfcqyyoPA7A/W9lb4l8jmwbI5iW7XcHUzuMsszL55yXwuO2d07YBYA2HMifs7wDz7RPL'
    + 'OCJDGBPP0erl2dVTsgdUAOcqk51ZNjwQUeNqVtsoF0bP3VJRPk8+02POiyhqOTTgCuPhCR5XjMdGGR7jaNN64enoxiadISUi'
    + 'eC2qCrb8bsLLAebv4yBG3L0FIiPlxz0w2txQKnQKxdkZNZWBi0bfq0Ai5zfmDMXm8yCf1nvjcz/A+QQuk9x99hLKp+ekDu7t'
    + 'FQjs/LYdljhgF8oD/AlLEFoX8iIR/fi6gBDoDr/eyd/gDQGAZhpHjevfWb21/sYA5eCW7Yrk6+8CyvY8/TBwrqcnbuQSEGTy'
    + 'g032wyDvDeXieduc6evaIAEAYcTm4mI7ZgNA4JoWow6f7N3elz213yb6Scef+jHmscb77kP/nr575sfbGtGxxvrI6EZQXT/e'
    + 'iN2LJh+pitotyRvvaeRKqpP9aNFB/RDv4wFPLC3ISPE58j8lJb2dBcfH/zGAug7pd66/VX8PtdgK/6DNTQtzu7TiMliAAjgX'
    + '6JQA5lAG4yzW6LUVefxDTxXynbZqt2DwxqE/6S3EgKjU+xEv1QE+9rapCiQlu5FsEscj97jXpPVOrcEOtKtANqDGkfPf7iLy'
    + 'ZLltPXzoACFWHB+44Lc83Wfo0FXQHssmBOLl9L3c0g8FKdIYLOtZOWwpi97SDfj1GO5uJwgTxRezDb81YS1351frVC07BtdN'
    + 'UAO2M8ElwiTM3KsaHzZ8+tgf5RuD1BtWgULEGfNv8vc4PCEJvU8sJzsXxA1Dze0ygsYnNM4hrkNh/oNacvFER+0WX/LjNBPz'
    + 'wNyKFpIIcAVZXbPm1u5XBOBCHAIcCa/4ujVjB7JNvUefPiQc+kVrfpbtIhncTigEaPocEAsqPBrSKSghVTPeZ7Asmuew+REx'
    + 'luPZE3pCgcWJJMsqUk2wP4UZW+KP3psGlUMlu5MJ1M5jJ7MyNvwl8KldndPN8GANFAcn7EwZ8+0J5TgiHyETzyRX5dky/LIH'
    + 'PiHnKq6ZWTbkDFHjSQDbKMnpz91JOj5PMP1jzr4Cajln+QrjvbYeV5bXRhlvMGjTVqzp6CvlnSE49HgtTE+2/AUlywHJ6+Mg'
    + '5Tq9Bfvi5cdaLdrcuMd0ClQvGTXE74tG4NRAIkv35gwyDPMgA+t746YXwPny5pPcPhoSyo0SpA4C/RUIuuy2HQgGYBcQF/wJ'
    + 'n1daF70nEf1ZKYAQ/3+/3tcV4A2UFGYaBB7r3wLVtf4z7eXgnuqK5OYbAsrp+P0wRwanJ8ouEhA9JYNNi/kg79rj4nnEMOnr'
    + 'SyEBAMK75uLB8mYDAAeaFvQgn+xWJpc9agsm+voXn/p4AbHGs+FD/+bye+Zr/hrRsPv6yGisUF0/64jdAv4fqQ/vLcnq72nk'
    + 'iQ6T/S/LQf0fs+MB2OgtyGYXOfLlPSW9lBbHxw22gLrG6Xeut/1/D335Cv/9B00LNMm04hDygAJIAOiUoBBQBm3K1ugi3Xn8'
    + 'AYAV8rTParcC08ahLb0txL7u1PuV5NUBT4a2qbbuJbuAvRLH7Pi411StTq1/5LSru9agxjHv3+5A52S50dZ86DagVhyGouC3'
    + 'SMhn6J7g0B4pxwTihPu93EfVBSljuCzrwtVsKW/r0g0D8BjuSzIIE9vGsw2r4GEte/ZX6yXkOwaz0FADHqXBJQDSzNweux82'
    + 'fKDYH/nIg9Rzv4FCqQXzb5oHODwpyb1PtOU7F2mjQ82B3oLGtAXOISgZYf6M2XLxriXtFpO64zRtx8DctxuSCORFWV2dFdbu'
    + 'kQDgQv+mHAnQr7o1QwyyTST5nz7/2vpF7A2W7WwR3E7UNWj6ChULKnRE0ikpElUzKw6wLCZBsPkD7Jbj/396Qj0niSRtKFJN'
    + 'aS+FGU5pj95NPJVD19eTCW5XYydpDjb81CGpXcznzfBVNBQH+wJMGewiCeXmEh8hKXAkV55yMvz+ID4hpyGumRQP5Aw7TUkA'
    + 'gBDJ6UsMSTroRjD9lAa+AjIbZ/mq2b22XDmW19VsbzDSOFasUVcr5W/1OPRAIkxP1e8FJSQNyetoNuU6Whn74sbYWi0F3LjH'
    + 'XthUL0QmxO+GZ+DUIUlL9za/MgzVSQPrlTSmF2PL8ubG/j4avziNEgchAv0Y0rrsBSIIBs6tEBeO/Z9XDDa9J10GWSkF8P9/'
    + 'vynXFccslBRXOgQejycC1c0vM+3BIJ7qwAzmGwUF6fgA90cGzc3KLlrYPSVm9Iv5Lwra41o8xDAJ/kshySnCu+UswfLi9QAH'
    + 'gBj0IFv1ViYDN2oLRRr6F8PNeAF+BrPh3UTm8kX4a/6zErD75BZorKzUP+uSFQL+3cUP7xzm6u9qLYkOVw8vy67zH7MhE9jo'
    + '6f1mF+sA5T3UG5QW0eENttcBxun08rf9gr19+SbZ/QcJQTTJRA8Q8oXHSAAivqAQgfltyhQ/It2P9QGAijO0zxsLAtOPDy29'
    + 'd8O+7t8hleQQ7E+GdR227rDWgL1h/+z48AVUrQjwf+SRBrvWvOkx7+zYQOc3NtHWHR42oLDRhqJNCEjIstCe4F29KccRGYT7'
    + '8KVH1dkSY7jG4MLVpuFv67z6A/ASAUsylcXbxjcFq+BI63v2fLEl5Bzes9AmHh6l3ikA0lcBHrtYsXyg9Pb5yJEFc78CAKkF'
    + 'MQKaB2bwKckW3rTlqMdpo+mRgd4e77QFzugoGW34jNm/qa4lkPyTupQ3bce/5bcbZuDkRWDwnRWxOJEAOrr/pgPu0K8bxUMM'
    + 'fNAk+Rrm/9osIewNEzVsEer91DXF3AoVPVV0RBbdKRJm2CsOsacmQdMsA+xvHP9/E1o9J1e9bSgbNWkv7/xOaQAdTTybuNfX'
    + 'hDtuV7wgaQ79/9Qh5x3M59zkVTQW7vsCY/TsIjO85hJJLilwYj2ecjzw/iAgHach+wQUD+QeO018+IAQEO9LDHVA6EZGE5QG'
    + 'ymoyG9sZqtl68lw5kkzVbKo00jhhOVFXRE1v9X8BQCLRF9XvdhYkDYToaDZnE1oZ8VXG2KMoBdw5517Yn95EJvdjhmdCGyFJ'
    + 'FwQ2v18T1Ula4ZU0FFljy5YNxv4FVr84Ix8HIaJXGNKTJgUiqD7OrXo4jv3YMww2widdBgMPBfANZ78pmvHHLHMWVzoOFo8n'
    + 'OSXNL/wBwSDdH8AMAQsFBcHPAPecEM3N4uFa2NbGZvQ9Ey8K4CBaPKEhCf54IskperrlLEjR4vUiWoAYu9xb9W4gAzcy6kUa'
    + 'KQnDzSDrfgbPG91EuAlF+BDxsxLA1+QWoQ2s1CrQkhVkE93FrW0c5r04ai1nHlcPBP2u82+wIROmyen90TTrAE7f1Bvu4tHh'
    + '1fjXAd3T9PIOzYK9ff0m2d7aCUEY4UQPfN+FxzIVIr419oH5fPgUP3gYj/Ul+oozn/QbC38Tjw+0G3fDPfrfIagDEOw94HUd'
    + 'CN2w1g8gYf+5EvAFIBMI8OkLkQYyArzp0hzs2IImNzZfJR0enPuw0YQ4TQitCLLQ/RhdvUkKERl/CPClw9/ZElsaxuDtcabh'
    + 'Pe28+gX/EgE86ZXF7+Y3Bbk5SOsU3nyxkOUc3iy3Jh592N4pu7BXAe8PWLEKaPT2XOWRBTavAgCaFzECCdRm8DomFt6G5KjH'
    + 'TtXpkQbnHu98DM7oPuNt+FjXv6mz4pD86LWUN3P5v+U2n2bgbtVg8PcFsTiS8jq6pv0D7i3iG8UeFHzQhgka5mz1LCGnCBM1'
    + '/ADq/fDPxdyhqj1VjvIW3YH3ZtiiDbGnrLrTLOS7bxzS8xNaOt5XvTuUGzXq8O/8L5YAHai7m7j7GYQ71S28IC6y/f8M1+cd'
    + '9+bc5MMuFu630mP0RdQzvPMnSS5r2mI9Rwg88JyvIB0Z5vsEkKrkHn3EfPgeExDvLfB1QJHmRhNx1spqbe3bGSoEevJ0IZJM'
    + 'yo+qNHLaYTleBERNYPt/AWAR0RdcDXYWi/eE6ADwZxP2/PFVQTejKBHsOefDCJ/eMRT3Y6dNQhswAxcExTdfEyREWuGUEBRZ'
    + 'wguWDQ0IBVYXDCMfSTqiV9whkybsIqg+Y+x6OJPz2DPccsInDBUDD1f9DWeUV5rxRClzFrE1DhbeGDklxBH8AQAY3R/K5gEL'
    + 'eRvBzw8rnBAoauLhSyLWxr2/PROCGuAg/3+hIdRAeCJE/Hq6vTRI0RL+Ilqo5Lvc4AxuIBceMuqtzSkJUeog66IYzxveBrgJ'
    + 'qCYQ8YXkwNfyMaENFuQq0OVVZBPEzK1tLOW9OIkhZx44UwT9nhtvsMskpsnRDdE0puJO34737uJ72dX4+tXd004ZDs3B2n39'
    + 'fBTe2hjSGOErEnzfufEyFeI9NfZwEXz40zV4GKvkJfoQBZ/0oNp/EzLxtBv19j362eOoA7vPPeBzxwjdvaEPIHjVuRJsGSAT'
    + 'Or/pC2/IMgIfSNIc4uWCJpAMXyWJGZz7WhqEOAvCrQhI9v0YQ75JCppifwhYv8PfiNVbGujV7XGQwz3twTYF/wtiPOkL7e/m'
    + '/cq5OQimFN6N9pDlqfMstyXmfdhcCbuwVxDvD18NCmh+81zlr9M2r94amhdWAAnUeSM6JkYfhuTLxU7VAMUG5wvgfAyO0z7j'
    + 'MxxY13kLs+InKei1UQxz+TQENp+UK27VjA33Bbr8kvL3NKb9Q/0t4qPrHhRm1YYJsBJs9WYnpwi68vwAmCjwz8Ojoar9747y'
    + 've+B9zXTog2JT6y6C+zku2vd0vP+7Tref5s7lKbM6vDtES+WP9Cou2fH+xmeHNUtFx0uskL7DNd60/fmftvDLizEt9Lvu0XU'
    + 'abnzJw/Ka9rhuEcIPqOcr47qGebj6pCqjyV9xD7GHhPh7C3wg+2R5srWcdb2/m3tWgAqBJrudCF918qPwtNy2qWrXgSwwmD7'
    + 'ocpgER23XA2M9ov3phUA8AvC9vy18kE3zr4R7ArdwwiizjEUiwOnTVrRMANQFsU3KOUkREHWlBBkv8ILH/0NCDwYFwy9AEk6'
    + '7FDcIfox7CLh7WPs9+6T8wUQ3HIu3QwV9C5X/UEQlFeRDUQpTiCxNUNL3hiiDsQRuwQAGBBHyubRMnkbpgAPKwsPKGr3F0si'
    + '5B+9v2bcghon1v9/fPHUQHvvRPxX/b00azES/jYSqOSqIeAMsOkXHuUIrc15M1HqYTSiGDQA3gYTJKgm2HWF5Kcd8jHyAhbk'
    + '5BflVaUixMwAGSzlyx2JIWDlOFN0+J4buxjLJNsX0Q2QB6bivhaO99Ufe9lsQPrVfBhOGc8rwdqzBXwUejEY0vkoKxLOO7nx'
    + '/jTiPUAvcBERE9M18B+r5Lk/EAWD+qDamfoy8fwZ9fZsItnjLPC7zyINc8d9C72hJbZ41b4EbBleBjq/aAVvyFNDH0jD2eLl'
    + 'jOiQDKWgiRm59FoaZ/cLwivySPbdMUO+aCeaYqwHWL9I9YjVTCzo1TYCkMMB4sE24r0LYi/wC+1eH/3KiFsIpjcDjfYa4qnz'
    + 'N9El5gkWXAnZuVcQrxVfDTMgfvP5EK/T4PbeGgAWVgBZBnkjr+BGHw9Jy8Ww8QDFfh4L4MifjtN+MjMcMjp5Cy0BJyk+FlEM'
    + 'TxY0BLvmlCv9FYwNSOC6/EHo9zQbLUP9FCej627kZtVU47ASxeZmJ1MduvKQ2JgoMw7Do4Ad/e87/L3vhic10zXziU+D9gvs'
    + '9tdr3Zgm/u2U33+bWwumzDv67RHj0j/Q7uNnxzYynhzeAhcdVtJC+7EFetMn837b/38sxMIC77uq52m5GC4PylGs4bgI+D6j'
    + 'UUKO6gLu4+o3rY8lNuE+xngp4ez2/YPtEM3K1kLS9v5Z1loA3vma7psffdd6E8LTG/ulq7WzsMIXs6HK2Psdt/WwjPaA3KYV'
    + 'xvALwkS3tfIwu86+ZN8K3YX2os4eDIsD1fla0XzkUBbmwyjl6LZB1uDMZL8g8R/9PO48GDqOvQAuwuxQ1RD6Mbzk4e0Xqvfu'
    + 'Lj8FEKnhLt168vQuq/NBEBvWkQ2myE4gqzlDS3UOog45CLsEhP8QR1fC0TI3HaYA28oLD2H49xfsreQfZZ9m3I39J9aI0nzx'
    + 'e6V7720KV/3/SWsxty42EmvvqiFi+7Dpcx/lCC8qeTMU8mE0cwI0AHIOEyTqGdh1awCnHWsC8gLVPuQXljmlIj4eABlrUMsd'
    + 'Ev9g5VNPdPgsJrsY/3/bF37kkAdo+b4WBCbVHzkmbEAtZHwYVv7PK/Y8swXjR3oxrTb5KAX2zjuVU/40JU1AL/A0ERPdJfAf'
    + 'FSe5P20bg/rgN5n6IiD8GcD9bCLy9SzwiwEiDaInfQu4HSW2ACe+BOoxXgZjBWgFAVdTQ6oSw9mxC4zoCC+loKbTufT/+2f3'
    + 'tUAr8pXV3TGhRGgnR1OsB+IISPX1IUwsgkE2ApsCAeL3NeK95Pgv8Jb/Xh8f8ohb5x03A+g8GuKKBzfRKtwJFq7i2bmWG68V'
    + 'aVMzIOUZ+RCX+uD24CYAFtP+WQat+K/gUOEPSRs9sPFCon4eACTInyfyfjKy8zI6SkUtAdvmPhbA508Wzvy75q0R/RXy70jg'
    + 'eMNB6NfeGy1iMhQnGgNu5J0RVOOu9cXmCuZTHRtBkNhH+DMOS+6AHU0qO/xo44YnaOg18wYAg/aw//bX2gmYJlFRlN/7DFsL'
    + 'TqM7+sAM49KYAe7j4wE2MtcJ3gI2/1bSVP6xBUgYJ/NU6/9/i9vCAiF2queF5BguOARRrAjGCPinBFFCrNsC7pnuN61DKDbh'
    + 'vBF4KTcV9v3suRDN6EVC0sLPWdYhOd75+SSbHzoTehML2xv7nwG1s9voF7Ot+9j7M/D1sAeqgNweJMbwqfREtzrkMLuF4GTf'
    + 'ZwOF9vbRHgxEnNX5yQJ85EUG5sOA6ei20MPgzPDyIPHFtTzu3MU6jrjPLsK3DNUQDd285OfYF6pENS4/Ufap4QP1evLH2Kvz'
    + 'RM8b1u6QpsiYCqs5zvV1DuncOQgC3oT/X/9XwiumNx0ty9vKr7Vh+A4m7K0jA2WfwouN/VumiNLU23ulss5tCtCt/0mKLLcu'
    + 'lu1r7yv0Yvtfx3Mfiv4vKl7UFPKx2HMC7ftyDvel6hmEI2sAnu1rAvwY1T7NvpY5scU+HoS9a1A59RL/Qe9TT/TbLCb1x/9/'
    + 'fr9+5ObvaPkl4QQmC9o5JrkxLWQ79Fb+7yn2PMfl40dTBa02QPsF9l29lVOUNyVNvvzwNEog3SX25xUnHwBtG4Tm4DceOSIg'
    + '4BbA/W4a8vULQosBmTuiJ9EtuB292gAn9/fqMUPtYwUlMQFXvxyqEpjhsQviEAgvfN+m090X//vq2rVAzS+V1aUqoUQuZkdT'
    + '3j3iCGEN9SGSPYJBkuibApj59zWtK+T448uW/5wdH/LF9+cd4CLoPGD1igf9LircKR+u4v9TlhsEHmlTyf/lGWQTl/qu6OAm'
    + 'cSvT/ugxrfiIeVDhAQIbPegOQqJUAgAk2B8n8pElsvMHFEpF/T7b5rH8wOdrOc78VyetEVAR8u/MBHjDNW3X3sLvYjKxGRoD'
    + 'lvCdERZRrvW8LQrm1PAbQbsdR/gpE0vusPRNKt0kaOP/FWjopw4GAB0EsP+iFdoJTw1RUTgG+wza6k6j4kPADDfamAF1EuMB'
    + 'afXXCcZENv9k3lT+kORIGFTbVOuqDIvbfMshdpvtheRdrTgE6wgIxnzspwScxqzbIymZ7oDNQygWHrwRxuQ3FfQ87LllHOhF'
    + 'M9nCz8LcITkYF/kk+PU6E5z5C9vUMJ8BmePb6MoDrfvcJDPwVh8HqlP6HiRl9an09r065AjYheCFDGcDAvv20QoDRJzCJ8kC'
    + 'h9JFBq72gOmwBtDDVuTw8p41xbVSIdzFWQm4z2NCtww7xA3dtPzn2HwKRDUS2VH25AYD9ZfQx9iLFETP5SHukDwDmAp0sc71'
    + 'hNLp3CoMAt6m9l//S44rppcjLcuS+K+1RtMOJo8XIwPv1sKLo9Vbpqf81Nv6MbLOGCvQrRD6iiwd/Zbtywgr9O+5X8eHAYr+'
    + 'QMxe1JLzsdgL3u37Ffn3pdPphCMBgJ7t6er8GP77zb4F9LHFsd6EvawgOfWw7UHvMvL02wkJ9cfs7n6/3L7m7zuEJeHSzgva'
    + '+P25McDTO/TV/+8pTefH5fASUwUs10D7ofRdvZ72lDcMHb781aNKIPzT9udrBh8AwiGE5hXxHjnT3eAWtgZuGgcMC0KI3pk7'
    + '6PnRLWYbvdqcN/f3XA1D7TT0JTHc8b8ceAqY4WHy4hBs/3zfl9HdF2Ys6tp80c0v2+2lKnYDLmbETN49yfJhDRTrkj3z8JLo'
    + 'LkaY+TeerSs95OPLIXOcHW0jxfeD5OAiJA5g9ZET/S5MMikfG1n/U1AjBB5EAcn/izRkE1D9ruiQ8XEr8tboMSPfiHky+QEC'
    + 'Pu/oDkYoVAKd79gfkaaRJWv2BxRpDP0+pgex/DlYazm7B1cnU0BQEVUezARqHTVtWP/C74gcsRmfAZbwriQWUf8UvC3b+dTw'
    + 'kEK7HbssKRMnC7D0/SDdJLUX/xV2+acOLhwdBFkBohVf9E8NAto4BukI2uoDK+JDkPo32gRzdRJ0NGn1XkPGREcvZN5HVpDk'
    + '1/FU2xWuqgzz/HzL9CGb7cURXa2cFesIMzx87AQYnMbzJiMpsuSAzRreFh58Q8bkzwn0PObtZRxe7TPZwOvC3PboGBfX0vj1'
    + 'Msqc+en61DCI65njJyvKAy4M3CTXClYfouRT+tD7ZfW/Dfa98BoI2FX8hQxXKAL7+f8KA20dwicp7YfSaruu9qgJsAbcGlbk'
    + 'QhWeNY0PUiGl8lkJgOFjQp8UO8T+D7T8++p8Cs0pEtkL3+QGW+qX0Mk9ixT+IOUh+fI8AzkLdLE/BoTSW5kqDFvepvZo/kuO'
    + '2PKXI2EJkvhXKkbTuvOPF+jX79aHC6PV0/Kn/Ov4+jF+8xgrHlIQ+qOpHf2m7ssIl/zvue/ehwFkHUDMkBmS86/4C96w7xX5'
    + '9vTT6Yf0AYDK9Onq7e/++6X/BfSYEbHegMasIGXMsO1rsTLycxIJCYT67O4tA9y+4rk7hEsx0s7W1vj9CfPA09YL1f8Zxk3n'
    + 'vtXwEg/wLNdqU6H0CfOe9hYjDB1hE9WjYfP80/6/awb3C8IhzasV8Rcf091E6rYGAYAHDEXViN4a+uj5jthmG+j7nDdPwVwN'
    + 'NLA09Ene3PEt4ngKGdRh8hcPbP/JwZfRhO1mLL3kfNGNqNvt77F2AyzkxExGLsnyrfoU63il8/ABgC5G4wI3nurkPeQPFCFz'
    + 'u8ltI7z4g+RhDCQOX92RE2zfTDKK8RtZJgZQI8TyRAH7GIs06+RQ/RnGkPGvQvLWB+Qj3+LmMvke+z7vlwFGKDjyne98AZGm'
    + 'LAJr9qsLaQztrqYHIE45WB0EuwehIFNAK9lVHkr8ah0l9lj/HEeIHO77nwEeL64k6/v/FGUE2/kqDZBCCEe7LAfSJwtG6P0g'
    + 'ptG1F2Lydvla/S4cLuBZAXgBX/Ru0gLa6ffpCK9KAytpLZD6pCUEc6T5dDT35V5Dw/RHL28dR1YwP9fxUkAVrgo28/wFA/Qh'
    + '/R7FEcsRnBXVFTM8ZGgEGPna8yYNE7LkFkga3irkfEP3Ac8JgQXm7RgQXu1z3MDr3Sz26Kwu19L7JzLKDPTp+qIWiOs98Scr'
    + 'WgUuDIxg1wpzE6LkDuPQ+9QUvw0+2/AaDOBV/A/lVyhU+vn/pCxtHZYeKe3GG2q7CN+oCfTy3BpcEEIVae6ND736pfLEFIDh'
    + '//afFLsL/g/GPfvqFvzNKZ0tC99QFlvqEcvJPUHY/iDn4fny4OA5C+r8PwbGFluZSC5b3i0LaP4+79jyvbJhCTICVyqEALrz'
    + 'UQbo11VNhwtoLdPyohzr+DbcfvPb7B5SXPyjqVTjpu56Epf8Qg3v3gfYZB1iLJAZFASv+JrAsO+C/vb0ywqH9EwkyvT98+3v'
    + '6h6l/z0HmBHOz4DGBMxlzGQpa7HuK3MSkguE+ow2LQMdJuK5FRhLMQfd1tb7PQnzlBHWCzTvGcZY5L7V5QUP8Gm+alMYFQnz'
    + 'qdcWI8EHYRNE5mHzCu/+vzXc9wtg8c2rBjwXH64oROr3AQGALfNF1UsSGvrwG47YB9Po+8/tT8HQrDSwKRhJ3uM5LeIS8BnU'
    + 'MJ4XD8MBycFXyYTtWtG95Ov/jah38e+xbtUs5MXORi6K6q36ONZ4pei7AYDU1+MC9O/q5HXcDxSurrvJbwa8+AGAYQwk0V/d'
    + 'icps34zmivGa9SYGRQrE8tnG+xiO9uvkYOgZxquir0JXJwfkTK3i5tDxHvs18ZcBkO048vXRfAENAywCVayrC+Hj7a6B0iBO'
    + 'Rs8dBMH4oSCKESvZnd5K/OUIJfZU7xxHEs7u+5TmHi9h5uv7M9llBMADKg0U/ghHwLwH0v+7RuhqCabRkt1i8vAHWv34Gi7g'
    + 'etF4Ad7NbtIwQOn3WRGvSq72aS1c5aQlTvak+ebe9+UXLMP01fBvHYE2MD8/AVJAD+sKNtQCBQPGs/0eUxDLEZ0P1RX5NGRo'
    + 'AdP52i5DDROXNxZII0gq5EUZ9wHeQIEF0+YYEA03c9xmAd0suOGsLk31+yfHHgz0vQCiFqcsPfEd3VoFhNGMYAZRcxPWPw7j'
    + 'f/jUFGUePttdQwzgJy0P5eMiVPrvRKQs7wGWHiUdxhvGGgjf3hD08vELXBAXHGnu9Rm9+srxxBRWNP/20vK7C5MNxj3tCRb8'
    + '1yCdLdvFUBZ4MhHLj/hB2Ko85+EH/uDgwwzq/EBTxha6Akgu/zgtC40MPu9qGb2yEQwyApAnhAAa71EGiuNVTWbvaC2OCaIc'
    + 'SP023H4e2+yDM1z8KuBU43PoehJ9zkIN50sH2NwMYizbEhQEe9CawMcAgv4LE8sKK/dMJCsn/fPYU+oef909B6zazs/U3wTM'
    + '2TlkKV4l7iun+pIL5QCMNgDiHSblHxUY7PEH3VT2+z3iFZQRF/k073j3WORxAOUF8hxpvtg7GBV7FanXbR3BByb5RObL5grv'
    + 'HBg13KIGYPHszAY8gPSuKE799wG+7S3ztTVLEk4R8BtxMQfTFgnP7UIC0Kwr3SkYKv/jOd3+EvCVzDCeGOrDAXfxV8mdC1rR'
    + '0wzr/5jmd/H1C27V0vPFzhKSiuqR5zjWWB/ou+O61Nfz+vTvWC913NTZrq6N9G8GjcQBgIYtJNHp7onKuvKM5gohmvUmB0UK'
    + 'zc7ZxinWjvaA/mDoQ9WrooyeVycp6Eyt4LPQ8b8iNfEQ7pDtTsb10QnNDQNuoVWsRL3h4+sIgdIoNEbPY/3B+GzfihHB0p3e'
    + 'fr/lCNUrVO+V2hLOYC2U5joTYeZIojPZ+sjAA+vIFP4/3sC8It//u2VNagkZu5LdfurwB+L4+Bop43rRw+fezdy+MED86FkR'
    + 'U/iu9ozyXOUr/E72aBvm3lALFyxC7dXwsMGBNmnXPwFM5g/rhfjUApDfxrN30FMQxcidD4u5+TTb7QHT9sIuQ0vVlzeU7CNI'
    + 'QsxFGWEL3kDXGdPmEu0NN6HyZgEeF7jht+tN9b7qxx49M70AfCmnLMYgHd3NLYTRC8cGUdw/1j+pHn/4GjZlHvMgXUP9FSct'
    + 'ewvjIpMj70Q/DO8BezclHWvgxhqyBt4QJGTxCycFFxytE/UZMv3K8VkpVjRlA9LygBeTDds87QmvBdcgHjvbxW88eDLPRI/4'
    + 'ECSqPP9/B/6MRMMMPCpAUwT/ugKRGv84sVCNDGVaahmlUREMVTiQJ8ruGu+ALIrjDe5m75PkjgmVIUj9/Cp+Hss3gzN5KCrg'
    + '4ihz6N7xfc5xEOdLfd3cDOTK2xIGLHvQy/XHAPYuCxOANiv38fcrJ0Mi2FO89H/dnMms2hMP1N8S+dk5ZPleJdFOp/oq0eUA'
    + 'jhQA4r3i5R/5Jezxmg9U9ugR4hUj4hf5BOh49+QjcQCDQfIcGBPYO53hexVVDW0ddFcm+VMEy+aFNBwY2uWiBo3+7Mz4FYD0'
    + '7w1O/Wfkvu3N4rU1xiJOEf0pcTFmNRYJzD9CAmgEK92X9Cr/zS/d/ioZlczp3BjqLNt38YYRnQvN+dMMPv+Y5mUm9QtOG9Lz'
    + 'py8Skru7kedwCVgfIRnjuirK8/oe6VgveOLU2QYBjfT9OY3E4EeGLezi6e5bErryRhMKIe4MJgcKDc3OVAkp1ho6gP7tJEPV'
    + 'uNeMniEZKegOHOCzBge/Im0jEO5ZAU7GJwEJza79bqEWsUS9HfXrCITfKDRezGP9gChs37YGwdLz8n6/I9/VK838ldqSFGAt'
    + 'PtM6E4DvSKKLDfrITqnryP3qP97z3CLfjuZlTa/YGbt/7n7q7yzi+I7cKeOY8cPnKC3cvl7S/OhpJVP4vuSM8ggjK/z7/Wgb'
    + 'z+1QCy3gQu0HzLDBc+Rp1zkBTObM4IX45tWQ3yDYd9ALBMXISgyLuXrJ2+2VyfbC2O5L1bUXlOySCkLMQrZhC6bZ1xmnwhLt'
    + 's9qh8oEdHhdVs7frN62+6gDKPTNV8nwpGP/GIKn5zS3QFAvHOa7cP5cXqR7g4xo2+wnzIMvC/RUG83sLk/yTI20ePwwwv3s3'
    + 'qflr4MrTsgZiDSRkehgnBfkrrRNC7TL9UyJZKSEzZQPDyoAXwBvbPG8prwUBAB476d9vPDItz0Qd4xAkbwj/f54OjESBKjwq'
    + 'evwE/6D7kRpYGLFQYTllWoBnpVHo4lU4+yPK7oPzgCxkPg3uQ/qT5DcElSHUB/wqbBrLN/IoeSj/LuIoIB7e8dnvcRBmOH3d'
    + 'GB3kyt9HBiwrBsv1sOb2Lq8dgDY/TPH3ISRDIisXvPRE/5zJLlsTD9T4EvkDA2T59i/RTi/aKtF5R44U+C+94us4+SU1LJoP'
    + 'MxLoEcLxI+JWEQToNPPkI6Alg0EDMBgTpEad4f8eVQ2AMXRXxQVTBIv+hTQLH9rlBACN/iUW+BWr5u8NI+xn5H4gzeKCKMYi'
    + 'Iub9KWsfZjWM9Mw/GAdoBH03l/SCIc0vgSAqGehG6dzk6izbhuCGEU3pzfk/+T7/Wa9lJiX6ThsG7qcvNxy7u94McAlN6yEZ'
    + 'wxQqykMZHun05Hjife4GAdWx/Tl32eBHneXs4icCWxKH3kYTqO3uDNHUCg2tBVQJow4aOuQN7SRXALjXJ8ohGWrqDhzs8QYH'
    + 'I/JtI+cCWQEfMicBvhyu/fLdFrEeGB31yBaE30fkXsz9HYAos/q2BgHP8/L1DyPffgfN/M73khQ6/j7TNeaA70gUiw0u/U6p'
    + 'JgT96moK89xM1Y7m7N2v2JSvf+7FD+8sStGO3JH/mPFABygtqQ5e0g3PaSUE9r7kuTEII34y+/1iGM/t8wAt4GHRB8yNDHPk'
    + 'Lu05AVMFzODq2ubVC+og2OT0CwTd9koMmP56yWTYlcnyvNjuViO1F49Akgq6+EK2VLqm2bfMp8KO+LPawxSBHU27VbOA4Det'
    + 'COsAyrUBVfI21xj/Wqyp+dv30BT7CDmuvN6XF27v4OOv0PsJqcPLwpoEBvNp7pP8CvJtHkgVML+3vKn5bc7K02TnYg24znoY'
    + '7v35K8fcQu1wwVMizuYhMyfrw8pwBsAbgPRvKcP3AQDW8+nfOeMyLf7RHeP19W8IkuGeDuYogSocHnr81Aag+1z/WBiT8GE5'
    + 'V8mAZ/ru6OJv+/sjWAGD8ycLZD5OHEP69uU3BM3n1AcxM2waLR3yKHz2/y7NASAecwPZ75IJZjhJGhgdDmPfR1ITKwYLJbDm'
    + 'ItWvHfz/P0x+PCEkHiErFwGARP/HLC5b11jU+I7SAwP+TPYvlbkv2ps6eUepGvgvesrrOLYrNSyfRDMS8SnC8QMyVhH4DzTz'
    + 'Od6gJZ42AzBPW6RGAEb/HnDagDG/6sUFvgGL/tTnCx8cIAQA5CslFqnsq+ZtOCPs7TF+IM8Jgig9FiLmY9hrH40PjPScGhgH'
    + 'fB99NwEmgiGdIIEgTg7oRnkg5OpROIbgqBFN6QgfP/nPDFmvE/wl+nkjBu53/Tcc/xzeDMsPTet8A8MUygFDGb/69OTB0n3u'
    + 'whfVsb8Rd9k9Jp3l9/UnArpIh97C+ajtDOjR1FTjrQVDyaMOBDnkDekyVwDoFyfK+eNq6plA7PHX9SPyUPjnApwyHzKOF74c'
    + 'Rkzy3fQIHhiR8sgWBOtH5HPA/R019rP6/SYBzy8U9Q9HAH4HaN3O91oHOv5aIjXmZw5IFGQFLv1i5CYEjh1qCmuUTNUWDezd'
    + 'NFiUr2DMxQ/p90rR/f+R/3XwQAfoI6kOmxANz6cFBPbEG7kx/wB+Ml9tYhiDBfMA7wZh0YfFjQxh7S7tIidTBeLR6tqAtQvq'
    + 'PQDk9MYt3fb1/5j+ofJk2By+8rzHDFYjdhOPQFe/uvicIlS6aRW3zFghjvjuDcMUqQ9Nu2kKgOCUFQjr7Li1AQXDNtdk3Fqs'
    + 'TfDb9y0B+wgp/rzeYhhu75QYr9Ci0qnDuPeaBLfRae5f5wry6/dIFQGAt7yPPW3Os/1k5y7VuM6IKu79E9zH3LTrcMHT1c7m'
    + 'Jh4n64XhcAaW6YD0/AzD91f31vMI4TnjVAj+0ak49fWP7JLhcOXmKA/nHB7EDdQGjsxc/3bXk/CRrFfJuLj67pbPb/uP31gB'
    + 'DB4nC2P0Thx4w/blPcrN528SMTOaCi0d4OV89pnWzQHLDHMDisWSCab1SRqrNg5jVfFSEwrRCyWQ+iLVzN38/5i/fjwtCB4h'
    + 'rhcBgG/oxyyS59dYHtWO0i3y/kyf5ZW529ebOhQ8qRocDXrKOxK2K1Men0QHHPEpTfUDMhwO+A81/TneuhaeNuYUT1u8/QBG'
    + '/d5w2n4Sv+rvB74B/c/U57EiHCB1M+QrtGmp7LYHbTjJA+0xc/HPCScfPRbaH2PYUP6ND7IUnBo82HwfczsBJnwCnSD8G04O'
    + 'P+15IEgKUTjiFKgRQB4IHxkvzwzATxP84Dd5I6c/d/3+T/8cKzLLD3AdfAOiQMoBf0K/+sMzwdIf7MIXbwC/ER4TPSZGNvf1'
    + 'jxq6SCNBwvmARgzo3EFU41VBQ8ms9AQ5TSfpMpkB6BeH3fnjvwqZQGxA1/VSIlD4GlacMvcWjhfdYkZMNhX0CBgPkfI34gTr'
    + 'JjJzwMz6NfYT9f0mbjUvFHswRwDULmjdm/taB2cFWiJqBGcONiBkBaA5YuT/EI4dsEZrlMUhFg0P+zRYgB5gzLA76fcpRf3/'
    + 'ayl18OkB6CNz+ZsQ8ROnBcM4xBu8Dv8ARw9fbY0BgwWq9O8GLvqHxSkEYe1+OSInfPfi0VkBgLVw4j0AzBfGLcIt9f+CNqHy'
    + 'sQYcvkQTxwzU+nYT3RFXv7oKnCIwAmkV7gRYIZEP7g1+9qkPQ/hpCuk5lBWrW+y439cFw/nVZNwU4E3wt/wtATIeKf7LE2IY'
    + 'gQWUGEsRotL757j3w/a30fv9X+cKyev34NYBgMvXjz25FrP9ywQu1Y8QiCqlvRPcBsm064gQ09U/nCYeDCKF4fW6lunJE/wM'
    + '29hX9yEZCOHTYFQI9aepOMcKj+zitXDlCQAP5+bpxA1Q9I7Me9B212EIkay4vLi4FxaWz9ndj9+tuwweYB9j9NDmeMM+KD3K'
    + 'dRBvEgPMmgo24+DlcumZ1ucXywzR8orFgumm9Wbcqzbx4FXx7g0K0f/hkPpX1MzdbM6Yv5nOLQgSsq4X1cdv6CATkucc2h7V'
    + 'vfgt8mSOn+Wk9NvXjdwUPD3SHA3f6DsSwtJTHuScBxxzA031de0cDp/bNf2pxroWu7bmFFXwvP3PH/3evvF+Ety97wfI9P3P'
    + 's+yxIp8MdTNUBbRppo62B/8FyQOt03PxJccnH83x2h9MB1D+ScSyFBsUPNiVF3M7MQF8AjDk/Bv84T/tbCZICkLT4hSyKkAe'
    + 'IwMZL+YGwE+M0uA3BginP78i/k8L4ysyhiFwHRwVokDj/X9C/jDDMzLMH+w2Im8AoE0eE5NIRjZ1Jo8aPBAjQd0FgEamEdxB'
    + 'fC5VQQsCrPSoNk0n5mSZASoch93D8b8K/PFsQMU4UiIHHRpWOzz3FkIN3WKROjYVgRkYDy8GN+LxECYyJPbM+r5fE/XvGW41'
    + 'FzJ7MEUK1C6T+Jv7KBNnBeI+agRGCDYg7vugOUUd/xDoJ7BGHE3FIXIhD/s+KoAe4iuwO9PsKUVA8mspXu3pAT7kc/kCKvET'
    + 'WRjDOHwQvA7stkcPXVCNAaDtqvSUTi76mdkpBPbtfjkUv3z3cxNZATbicOJ74swX6dfCLZkegjbWG7EGyT9EE3fs1Pr6Cd0R'
    + 'jde6Csj2MAJS8O4EkhCRD5QifvZzIUP4duTpOUIhq1uO/t/XH/X51UzoFOAi7bf8TjkyHsEJyxNYBYEF5PZLEY1Q++fRKsP2'
    + '0ef7/bD2Csm5+ODWtQTL18TouRaODssEJjCPEMHUpb322gbJWvCIEO/xP5x7QgwijCH1uqYfyROv99vY7PYhGVnQ02AQGvWn'
    + 'WBDHCnYq4rXY+AkA7Prm6fsEUPSOHHvQQM5hCMQWuLxr/RcWvdrZ3W+4rbtF+GAfCizQ5vsyPijdBnUQRDsDzHn4NuOqGHLp'
    + 'ounnF9Hm0fKy4ILpULJm3OYf8eB93+4NY9n/4RDMV9Rc62zOWCuZzlk1ErK8uNXH5+IgE5/LHNphDb34ZfVkjiHWpPSl7I3c'
    + 'tdk90scd3+jb+cLSJf3knJOOcwN743Xtlymf2w4QqcYOp7u2ANlV8Ey7zx+xGr7xD+rcvXHIyPSN4rPseIufDGS9VAUt4qaO'
    + 'wvz/BSuhrdOQ1CXHcgLN8cuxTAdU6UnEVeQbFO4alReL2zEBCd4w5GIA/OFwuWwmgt5C05/Xsirp4iMDRATmBpv7jNLk0QYI'
    + 'EPC/IqYdC+On0oYh8/McFSTq4/297/4wrb0yzNgiNiKZ3KBNGRmTSIvkdSbm5TwQsCPdBQMephHKBXwubRkLAov4qDY+A+Zk'
    + 'WO8qHCUkw/FJ8fzxHjrFOI0ABx36DDs8iSZCDc8PkTqUBoEZnRAvBhYw8RBM/iT2/RC+X4gW7xmEMxcy6hRFCkNUk/jQFCgT'
    + '8RLiPtgVRggI8e77yfpFHd0L6CfTQhxN/RxyIY0OPirCRuIrkFHT7ARIQPIoA17t2g4+5D9aAiq6JlkY6hV8EOE17LYDP11Q'
    + 'FQug7YEklE4iO5nZevb27TYcFL/U9nMTd/o24oMHe+LCKOnX7g2ZHoIC1huPGMk/o/B37DYj+glHOY3X7BDI9gYMUvDuHZIQ'
    + 'uc6UIn0hcyE+dHbkOwpCIXsJjv6/JB/1TEFM6J4qIu3Lw045nBvBCUpcWAUIHOT2b+GNUIoP0SoA3NHnPC2w9l/lufhbBrUE'
    + 'fufE6CTxjg7aMiYwbAXB1Hrv9toO3FrwG8Tv8QTYe0IfBIwhJyCmH9ztr/cDM+z2eehZ0Pn3EBqJ3FgQzh92KsJD2PhLxuz6'
    + 'VPT7BLcojhyi0EDOIBLEFncna/1kAr3azRFvuDU5RfhfPwosJ/77MvPu3QZu4kQ7EyB5+N3Tqhg6+KLpxQPR5hvwsuB7CVCy'
    + 'klPmH1X8fd8M8mPZ/CAQzKgHXOtiLlgr0QRZNSv3vLgYxefiGcqfy77CYQ0qCmX1StEh1q4lpex5/bXZDfTHHQ7g2/n3DiX9'
    + 'HeCTjpnZe+NSH5cpmQMOEMTvDqdgCwDZG/ZMu2gBsRq82Q/qWzZxyLjfjeL4I3iLn+pkvfgJLeK6BsL8MRMroQPSkNQhD3IC'
    + 'MifLsULiVOnq6lXkDdjuGvzci9vAHgneOMZiAIfHcLlgGYLe3fif15so6eL81EQEHueb+z3N5NHQ5hDwh6imHar3p9LA6/Pz'
    + 'Rd8k6mjUve8RxK29dvjYIjy7mdy08RkZViSL5JgR5uVtsbAjFdEDHnnwygUl4W0Z4LaL+B3xPgMZ5Vjv8yMlJOjeSfGmDR46'
    + 'HcCNANvI+gxXAokmJA/PD4vOlAZo750QYsMWMGDrTP6GDf0Q8OWIFlfthDNq0uoUY+NDVF0y0BSZ/fESfdzYFSb0CPFizMn6'
    + 'r+DdC6Eu00LH//0ctEKNDkgEwkapB5BR4h4ESLi1KAOsE9oO3Qw/Wo0/uiYRMOoV1+3hNWs7Az8zDBULqfiBJBwdIjs/EXr2'
    + 'Iko2HIMk1Pb9IHf6ETiDB+w+wiicNe4NlUqCAggxjxhKI6PwDUY2I6IbRznYH+wQMlYGDBVT7h3JHrnOdBB9Id1NPnRuODsK'
    + 'pyh7CewTvySOKExB1ByeKscHy8O8IJwbkiRKXHEPCBzVN2/hg0OKD5c4ANzrDzwtPTBf5boZWwbU7n7nJisk8W4Z2jL4ZmwF'
    + 'skF67+soDtw9GRvEnhUE2FzvHwTy1icg0fHc7VwLAzOmyHnoyvn593cCidy0As4fqPPCQyf9S8aAPlT01hu3KBP0otArAyAS'
    + '2AN3J6HrZAIO680RciM1OUH1Xz9A3yf+dQDz7j4FbuIcwhMgjP/d01EcOvjFDsUDY0cb8PQnewkiLpJTK1lV/OAXDPLRBPwg'
    + 'qR6oB7btYi4BA9EE7Oor91UMGMXi6hnK1Om+wgINKgqA+0rRfMKuJaDRef2K2w30DOQO4H0N9w5QBx3gWCKZ2WoYUh+aIpkD'
    + '0xPE7xkHYAtpIxv2mx1oATQMvNmZKFs2O7W434n2+CPX9Z/qDCT4CRsxugaW0DETWisD0sHYIQ9P2TInvfVC4pby6uqbyg3Y'
    + 'VBD83LAQwB7+GzjGBuyHx+H3YBl49934Yy2bKNCc/NS91x7ni/U9zQnS0OaA64eo2u6q9xfdwOss80XfNARo1NrnEcQU4Hb4'
    + 'Veg8u3zstPGTtFYkqPmYEdbbbbFkERXRTft58OcMJeHpxuC2gNod8Sq+GeWSzvMjEwzo3vkSpg3Tvh3APdTbyPDfVwKP9CQP'
    + '2KmLzo+uaO+58GLDQKNg687Shg0Y5vDlLe5X7Z7catKx1WPjS/xdMuDqmf22zX3c2uMm9E7vYswrGq/gSv2hLo0Lx/+F0rRC'
    + 'FtZIBCDgqQf74+Ien8m4taoSrBOqB90MMuONP2ICETBj9tftZwdrO2/HMwy67qn45vIcHeMJPxG+4yJKCaqDJGLY/SAq+hE4'
    + 'of/sPls0nDUSE5VKwAQIMasCSiMYKA1GDfSiG70D2B855zJW4zcVU94YyR6A93QQkQvdTZQgbjjUCacoFgLsE3r/jijzH9Qc'
    + 'BAvHBwMJvCAi7pIkpBtxD1AU1TepEINDyyGXOMQz6w/iMj0wtS66GSMW1O48DCYrhv1uGfwL+GZ9H7JBNQbrKBIiPRmcAJ4V'
    + 'oOpc76U48tavD9HxAgRcC537psgHK8r5lkh3AiAQtAKDFajzez0n/STigD5pWNYbv2YT9OzDKwNJFdgD9ACh63MODuvMCHIj'
    + 'qS5B9boQQN/B9nUAHQ0+BdchHMKM64z/H9xRHKhNxQ7w+WNH8gj0J+n/Ii7MHCtZdkLgFysc0QR12ake69y27SP7AQOK/uzq'
    + 'M9BVDF0f4urn4tTpUjMCDQo9gPuR+3zCpxCg0cLbituVFQzk//F9DSvfUAfm91giFvJqGEH2miIIHtMTb+cZB1Q2aSM+1psd'
    + 'WzI0DMPfmSiP/zu1M/CJ9sv01/WyGAwkni4bMfgkltAJ81orjgXB2FznT9ng4L31HdyW8mXym8r9B1QQYMSwENz+/hvTLwbs'
    + 'hiPh9xzuePe31GMt0Q7QnOC3vdcVI4v1lfkJ0nQ5gOsBytrulRwX3Yj8LPMZ9TQEW9Ta54cRFOC3E1XoBjZ87FUdk7TV6qj5'
    + 'jt3W26rRZBHvKU37BOPnDPoo6caBCoDavgMqvirvks6pDBMMzfb5Ev3q0750Cz3Ua/Dw3ynbj/T1BdipYvCPrsQAufB44kCj'
    + 'BcrO0gAlGOY8Hi3urAie3CPgsdUC4kv8ohXg6qnets0p1drjeCJO79nlKxq6HUr9ULqNC2P1hdImJRbW8+Qg4EHb++OZvp/J'
    + 'QASqEibKqgfY3jLjD7tiAsMRY/YSBWcHBOBvxwW9uu7IEObyqdXjCc2+vuOSqgmql81i2Ma0KvoTz6H/GPpbNM3XEhMo78AE'
    + 'Rc6rAonnGCgLIg30V9y9Aw70OedpuOM3XxneGGDcgPcADZELtumUIMcB1AnmBBYCUON6/6UU8x+J3AQLsA0DCdvqIu5LA6Qb'
    + 'lOtQFPr8qRCT28shJAbEM1oB4jK+8LUuUQEjFrIIPAzq8ob9hwP8C8zpfR8zUzUGtCwSIrYVnADyMqDqitKlOOTBrw8MBgIE'
    + '4+id+20NBys6HJZIazMgEJr0gxUvJXs9HRok4j0laVgcC79mvEbsw00ZSRUAVPQADwVzDvQ0zAh0HKkubxS6EF8ywfavFR0N'
    + 'pMzXIUPAjOthRh/c9kSoTR9Z8Pn1HfIIO/bp/+QQzBzUHXZC5P0rHIRPddk9YevcMioj+3Iaiv4X8jPQN0ldHwsb5+L9DlIz'
    + 'ASYKPToEkfsIGqcQF+jC2141lRWxD//x0zUr3/IK5vcRDBby9+lB9vglCB6c8m/nxv1UNvkLPtbaDlsyp9XD32ICj/9FITPw'
    + 'UvzL9FYAshiWC54uCAL4JILlCfOQA44FxCJc5y3j4OCL9x3cCNhl8jQf/Qfz/mDEPOfc/vMD0y+824YjuOAc7lvTt9RI39EO'
    + 'yCngt0TpFSMYDpX56eV0Of0WAcr935UcxQCI/DIBGfU9R1vUChOHEXPttxPVFAY2m0FVHcXN1eoR5o7dx/iq0VDz7yn79QTj'
    + 'Ltj6KIErgQqn1L4DRPoq75UgqQyC/832UeL96u3WdAs9+Wvw9Ogp22QG9QXk1GLwvBjEABkDeOIjBQXKSCsAJUjxPB4Z6KwI'
    + 'MO0j4K73AuJZ+qIVKeOp3g6+KdVg6ngiCgbZ5ZH+uh2IHlC6CjVj9aMPJiUEIvPkXg5B24Eqmb4ELkAEnBEmykMJ2N547A+7'
    + 'ofDDEavmEgUtAwTgMNkFvYXoyBBYpanVZiHNvgDlkqra+JfNsxbGtHDyE8+pFBj6psHN108wKO97B0XO7euJ534QCyKDwFfc'
    + '4toO9GEPabibqV8ZdPNg3DjyAA3bHbbp9rDHAWUS5gTvz1DjTdOlFJm7idzBv7ANdu3b6lC/SwMv+JTrns36/DO9k9uW0iQG'
    + 'hO1aAVfbvvCC5VEBcPqyCAAH6vJS3YcDzcfM6ffqM1MG+LQsIr62FajQ8jIQ14rS4ufkwUPYDAZaBuPoJ8FtDU7DOhy36msz'
    + '+vCa9G3LLyXE5h0aiO49JUfwHAtqArxGJOtNGeAtAFQ7EQ8FR+v0NEEIdBymCm8UWi1fMoP3rxWaIqTM6A1DwG07YUalNvZE'
    + 'oRYfWecJ9R2GIjv2xQ7kEIZI1B3UGOT9GguET2kKPWFi9DIqDityGvIBF/IBPTdJ6/QLG7Eg/Q5QQAEmVdw6BIVbCBqJERfo'
    + 'ACNeNUIwsQ8SNdM1XyfyClc9EQy5LvfpT1T4JXkunPIHWsb9Zjn5C9Hm2g6IbKfVUQtiAqZJRSF8HFL8RztWAIQFlgu5LAgC'
    + 'VBGC5S9IkAPMJMQiFjMt4zbUi/duEgjYnyA0HxYa8/6ULzzncwbzAyQSvNuYM7jg0slb0+UfSN8LA8gpqvBE6awVGA7ZL+nl'
    + 'Vyn9FvoE/d/ZIsUA4SEyATwEPUc38QoTU/Jz7VEe1RQWA5tBJOTFzUzQEeYAHMf41PFQ8/YL+/UaJy7YpNmBK5T/p9SB+0T6'
    + '6guVILQlgv/W11HiIRHt1vkePfkP+vToeftkBjwM5NT9CbwYKxEZA4wQIwXy4Ugrlx1I8fsiGehqBTDtu9Ku93v8WfrlBSnj'
    + 'it0Ovk/1YOqy1QoGphKR/mAFiB65zgo1CQujD7z+BCICEF4OlPSBKifoBC7/6JwR6e9DCZMAeOxOBKHw5vmr5qjyLQOQ9DDZ'
    + 'ekqF6E3nWKVa7WYhEGEA5QcK2vhI07MWwxVw8mngqRSnFqbBTvRPMMfsewfUKe3ruQl+ED8Vg8BKBOLaC+lhDwkIm6k4GXTz'
    + 'Cvg48l0p2x3fC/awyfdlEhn478/H803THsmZuyzrwb+o83btnt9Qv271L/gS657N3QAzvbv8ltII7YTtJb5X21gcguWO4XD6'
    + 'u+IABz7aUt1H1c3HzxH36pEMBvjW7yK+3t6o0Fv0ENey4+Lni9tD2D/rWga/0yfBh+hOwxvnt+oq8/rwo85ty8H2xOaIxoju'
    + '59BH8KPSagLVwiTrAwLgLRrHOxHkz0frPwtBCE3Vpgqk4Vot38mD9ysCmiKfA+gNfAFtO5n8pTbj76EWNt/nCcrXhiIrGMUO'
    + 'ywmGSILf1Bjk9hoLKO5pCtTWYvRr/w4rKe/yAZngAT1c0uv0WtGxIJH2UECnAFXchuqFW68ZiRG8BQAjaxpCMCEFEjV69F8n'
    + '0BBXPf7ouS4yIE9UUvV5LgYuB1qjCWY5pzTR5m30iGzBAlELXiOmSeE7fByPS0c7zBuEBTJSuSxRE1QRZD0vSPoAzCQjKhYz'
    + 'FNg21Nr8bhKLLJ8gpfcWGrQrlC8WOnMGFRAkEhQCmDO7ENLJ4wHlH3MbCwM4IarwsxSsFV1P2S+FB1cp90X6BOP82SKCHeEh'
    + '+j08BMM7N/HPDFPyJClRHmIkFgP0BiTklShM0OJMAByZItTxjiT2C9UmGidu5qTZwh6U/+bxgfu7/eoLxk60JQEG1tep9iER'
    + 'JS75HtHuD/rl/Hn7lC48DOsJ/Ql02SsRXheMELb68uGiM5cdMPP7It8jagXZOLvSOup7/En95QUeDordqehP9cgJstW2+qYS'
    + 'y/lgBT0Cuc6lAgkLLQW8/lbuAhB575T0T/wn6Gb+/+ig8unvNwmTALPJTgTi6eb5RPeo8jLmkPT9L3pKQQBN5wEFWu2A8RBh'
    + 'cv8HCvLbSNMJ+8MVXeRp4P/3pxZjtE70597H7Mor1CkJGbkJiCc/FY8pSgRaFAvp8vIJCJDhOBkrIgr4/AFdKcxJ3wvt9Mn3'
    + '9DkZ+KP6x/OPJh7J6zAs6w7gqPOZ757f9t5u9a/YEutWEN0AQva7/BL9CO1jCyW+XcNYHLgfjuGn7rviAgg+2uIJR9VNH88R'
    + '4vKRDGS21u8L9t7ecvlb9BfUsuMn9ovbQOY/61zIv9P+Aofont0b52PhKvPa3qPOJBDB9pjpiMZN7OfQItyj0gT21cJpDwMC'
    + '9vkax2b65M9X9z8LE7xN1VvKpOGa3d/Juc0rAkXDnwMJq3wBL7qZ/Aja4+9N3zbfxsnK11vjKxgs1MsJGwGC30Hc5Par9Sju'
    + 'U+fU1ke4a/8/3ynv6L2Z4JbfXNJYzVrRI++R9gG9pwCy5Ybq5/avGZwBvAVM0WsaSOkhBTPvevRiGNAQYcD+6FbSMiDkQFL1'
    + 'mecGLk65owkl4ac0NqJt9Cf8wQJQDl4jJ93hO5nrj0sXFswb/sgyUh3XURPI+GQ95ur6AOb5Iyrq3hTY2Qva/KgCiyymGKX3'
    + '2w+0K3cRFjpR4hUQoBwUAsYFuxDkC+MBzzBzGx/+OCEPPLMU5z9dT6cshQfK+vdFW9jj/Aw5gh18Hfo9HgXDOxo+zwwLAyQp'
    + 'chBiJMcs9AYt/ZUo/BriTG0+mSLsJI4keEPVJjxAbuZGH8Iejdrm8Yr+u/0nNcZOK/EBBr4UqfbnJyUupkjR7lcM5fzcCZQu'
    + 'oxrrCeAldNl5Fl4XDTm2+kICojNxHDDzNCXfI68L2TgpLzrqIBpJ/QAsHg6/GanoNR7ICdX/tvoA/8v5XDQ9AkIipQLl8C0F'
    + 'NhNW7q/Hee9x+0/8didm/ucGoPI0DTcJ3LCzycb84ulhEUT3ZBQy5jwi/S9Z/0EACQABBWjdgPHJ/XL/at7y29TMCfun4l3k'
    + '8i3/96f5Y7SgB+fe7fHKK2fMCRm1G4gn18CPKdnvWhRL/vLyfQaQ4YDqKyIJyvwBO+jMSb3p7fQJ6fQ53Buj+kLcjyZxCOsw'
    + 'WAQO4Mgbme8A/Pbe/xav2AX7VhDDDEL2bdQS/XGzYwtQC13D7Ay4H0AOp+4n8QIIyyviCQrzTR+iDOLyoRFktj8yC/bp9nL5'
    + '/uwX1EDUJ/bFLEDmpQtcyEwM/gJyWZ7d8Qdj4UXY2t4I+CQQ9eCY6VDxTeyc8CLctuoE9rfSaQ/aKPb5oQJm+rvyV/eWDhO8'
    + 'iQVbyh3/mt04CrnNbflFwywICau+CS+6w/cI2sjrTd+3HcbJj+Jb4+b6LNSr+hsBGdxB3HjVq/XF4VPn5txHuAzAP9+d1ui9'
    + 'a/CW350MWM079yPvFZsBvVT4suXp1Of2mfGcAXvjTNHH3Ujp6d8z78rhYhj+CGHAKOFW0uIA5EB0/JnnZfROuUKtJeFGATai'
    + 'u9Mn/Mz1UA4ZxSfdLb+Z6/QaFxZxxv7ItwMd13vmyPh31+bq8+Lm+U+/6t5L5dkLNMeoAvTbphgSA9sPq/B3EYe/UeIUBKAc'
    + 'a+zGBSje5AukBM8wh+sf/gLQDzxrKOc/8fOnLITzyvqe61vY2xoMOR/rfB0szx4Fs+kaPhwlCwNaGHIQgfrHLAIrLf14Gvwa'
    + 'sv5tPhUD7CTUEnhDxvI8QE8MRh91Fo3aQ96K/sIKJzW/CCvxWTC+FLne5ycGCqZINwhXDMsy3AnXFqMawkzgJfAseRbVDg05'
    + 'SCJCAtgRcRxkNTQl0PavC+wFKS8pKyAaqUEALEHfvxlnRjUe8BrV/9PoAP+qyFw0+/JCIkse5fDIHDYTpzCvx1UOcfvr/XYn'
    + 'fxHnBuMdNA0MI9ywLAXG/C41YRHECGQU9QA8IqkJWf9mNwkA7RNo3f4Cyf29MGre21LUzHkap+IGN/IteDCn+XEAoAe3Ee3x'
    + 'P+tnzE0JtRtW/NfA4QHZ7xH3S/6BA30GMRqA6q4GCcrW0zvoKPO96T3cCekbDtwb2xRC3B8NcQiR7lgEoAvIG4P2APzW4v8W'
    + 'PRgF+/YZwwxJHW3URvBxsyUjUAvm8uwMeRNADt7xJ/Hf+csrwboK80z3ogxsAqER+vM/Muwx6fZR3v7scO9A1KrlxSxx76UL'
    + 'Hx1MDPEpclmo6/EHFutF2L7eCPhJJfXgECBQ8Q39nPA82Lbq3tq30iwF2igOEKECVcW78j73lg6wLokFN/od//kqOArmEm35'
    + 'TuEsCNP3vgli/MP3suTI6wTktx2HKo/iV+Pm+sEdq/ow8hnckP141fENxeFn7ObcPA0MwCPCndaOCGvwBbWdDGP0O/eaEhWb'
    + 'VAtU+N3T6dTT1pnxzuN74/37x931u+nftfTK4SL9/ghZ6yjhhwHiABH4dPxh4WX0xLhCrdryRgEE07vT0NzM9RD6GcXqEy2/'
    + 'nun0GqX5ccbsv7cDQO975snld9e9CfPiqdZPv37eS+XdAjTHheH02wrEEgOsK6vw8cOHv2DgFAS562vsLeko3u3bpATj24fr'
    + 'V9oC0DzBaygVHvHzx9qE8yHynuva19sajNcf6wXVLM9UtrPpRN4cJczXWhg7BYH6o8ICK/bUeBqhzLL+8g8VAznP1BLW+Mby'
    + 'bwVPDNXmdRYJxUPelMbCCugGvwgFzFkwN/y53q/1BgqF/jcImwLLMjHc1xZ43MJM4g3wLEXp1Q6prkgihxDYEUviZDVtDtD2'
    + 'LirsBbIEKSvwIalBkgtB36g1Z0YO7PAaUwvT6AUgqsjsCPvyRTBLHrIEyBzDTKcwc09VDoMc6/1FJX8RaDjjHRX2DCN+8ywF'
    + 'Cj0uNQ8ixAioFPUAEhypCefYZjeOF+0TJgj+AtQ3vTBdOttS1S55Gu8pBjea9Hgwti9xANYwtxE0Qj/rxVpNCfTuVvyTE+EB'
    + 'TwkR99IigQPxHTEahBauBqg51tME/SjzJf493AL+Gw4WENsU5fYfDXgXke5qE6ALHAGD9iYv1uL+Ez0YzTL2GXcOSR1qEkbw'
    + 'WgIlIyQR5vKJJHkT+gPe8U8d3/nr9sG6WyJM98b7bAJII/rzLwzsMYU0Ud5i6HDvkN6q5RD2ce+63x8dHd/xKeoWqOuwBBbr'
    + 'u/a+3s34SSVg8hAgKjEN/ZTtPNir3N7a5xcsBRv7DhA7OlXFz/E+9ywYsC6dHjf6WfH5Kvvq5hKaFE7h1g/T9/XXYvzc37Lk'
    + 'RbgE5E0Qhyo8+FfjE/vBHSfQMPLk4JD9YvLxDQDtZ+xGAzwNbhAjwtw/jgij/wW1lR9j9AfpmhJc0VQLhvbd05fT09bYAM7j'
    + 'her9+4zJ9bsGMbX0J/Ei/S7SWesqGYcBXusR+CseYeHM6sS47u/a8nUIBNMVD9DcnxMQ+in76hMMDJ7ppxGl+d4B7L+190Dv'
    + 'otLJ5UwLvQkO+6nWnu1+3kgc3QLJz4XhDSUKxJ71rCtV/vHDkOlg4CDFuesI7y3pcfvt2x8E49vI6lfaGbI8wW7DFR4TJ8fa'
    + 'Ps4h8tcT2tf00IzXIuUF1eT6VLat0UTeVhTM1zHpOwU886PCL9721Gv3ocyDEPIPKOA5z58T1vi80W8FvPfV5qzvCcXYw5TG'
    + 'ZefoBmvhBcw+yTf8+eqv9Qnlhf733psCL98x3MHeeNw+1+INteVF6TbQqa66LIcQzrtL4mDTbQ431i4q7B2yBPnA8CF88pIL'
    + 'a+6oNb3xDuzmC1MLYQwFIAnf7Agr8kUwB7qyBPvxw0xk2nNPpuyDHEPERSXi/2g4ycYV9p37fvPP1go9y+IPIhkcqBTVDRIc'
    + '+h7n2OwrjheI7CYIRC3UN0rcXTpRG9UuUfrvKaDvmvQGHLYvnybWMCwnNEIJFcVaCRT07kcgkxNMG08JEyPSItIa8R2lLYQW'
    + 'B+qoOY8UBP2q8iX+pCEC/llIFhBKDuX2ph94F7cxahPR4xwBMQ8mLzQo/hP8zc0yjQN3Dmk9ahLSOloCbikkEYU3iSTwJPoD'
    + 'QC5PHeUV6/aeIVsijwzG+8hASCOFRy8MIEOFNAkRYuhaAZDemD4Q9qEput/8Ih3fmwfqFjgksASV+bv2bCjN+D08YPJiQiox'
    + '+SeU7Tbtq9wTGOcX+0wb+8z4OzpTDs/xNzYsGEofnR79UVnxNfj76kPwmhSyLNYP7+j118oD3N+nBkW4ZCRNEAMYPPj7EhP7'
    + 'kfon0Kom5ODKc2LyCRcA7SgGRgML324Q2fDcPyT8o//k8pUf3gAH6SAyXNEtI4b2F/yX0+Te2AADJYXqk/6MySLQBjFgEyfx'
    + '9Bsu0qC8KhnP6F7rhPwrHtkTzOph8e7vsuh1CMYTFQ/c8p8TzQ4p+0bhDAy32qcR6xTeASEHtfesGaLSn/FMC3DqDvvoJZ7t'
    + 'c9ZIHO0iyc/RJA0lGRie9WbtVf7H6ZDpY/ogxV/cCO9l5XH7chEfBFoRyOpR4hmyixFuwx0LEyfQJz7Ohg3XE5Ea9NAaCiLl'
    + 'cRfk+ojYrdEJ+FYUt/kx6XXzPPO1BS/eQgpr9+ECgxB98ijgXOKfE/UTvNGa/rz3Kdis7/7t2MOMwmXnkPJr4UPrPskM4Pnq'
    + 'ehoJ5U7O996WAC/fXyjB3gkJPte96bXloco20JDDuize3M67i9Rg0+vSN9YC3ewdfeL5wPrxfPIcwmvuz9C98aXe5gs23WEM'
    + 'ihQJ3zLoK/JItQe6xOz78RXwZNqU3abssb9DxCcR4v+4w8nGS/Od+9/mz9Yg8svixBAZHM3x1Q2V0/oeuAHsK7/SiOwv6UQt'
    + 'CMJK3PLJURuB6FH6F/Kg72S6Bhyi958mrtQsJ0MPCRXN4wkU689HIALyTBsv2BMjTxXSGgD0pS1A8QfqBQePFNPcqvKL1qQh'
    + 'cwZZSL3eSg5A4KYftha3MbcP0eOg4DEPfPM0KDbt/M3qN40DmyFpPdD+0jp2G24pFeiFNxz88CSoEkAubR3lFagPniFIGo8M'
    + 'zBbIQEsRhUe4DiBDKAwJEQwfWgHMJJg+0B+hKQH7/CKWAJsHVSc4JCRFlfmnIWwosRI9PGMkYkKT//kndUI27QUkExjHDPtM'
    + 'gRrM+KYQUw6lQjc2PBlKH8Ei/VHeLTX4uwlD8MoisiyMJO/oRvLKA+0ipwY4GmQkYR4DGCYb+xKJIJH6JT2qJuf3ynPmDQkX'
    + 'iSgoBqciC985Idnwwl4k/LMj5PLfMN4A4wggMlz1LSPtBhf88iHk3sgYAyXTF5P+MQYi0AcBYBN8BfQbQh2gvKQfz+i67IT8'
    + 'ChzZE/j0YfG1ErLoIADGE0Av3PLS+M0OeghG4ZcTt9rx6usUPwAhB5n6rBmG85/xNfVw6gIf6CVY8HPWtw/tIrAI0SQb2hkY'
    + '7g1m7WzZx+mxEGP63PFf3M7/ZeV83HIR4wJaEbYYUeLF6YsRPe8dCxAM0CfPDIYN9r2RGo82GgpeDnEXAROI2FL8CfgLzrf5'
    + 'mRJ18xXxtQUjD0IKhPrhAuAGffJy61ziwxf1Eyngmv73PCnYozz+7R0sjMJGIpDySf1D6+AeDOB2/HoawdROzgwnlgCMHF8o'
    + 'yPwJCRLcvenc7KHK+sqQwysV3ty+z4vUMALr0gLjAt2W0n3i2/768azuHMKPDc/Q7dOl3ufgNt0TtIoUu7gy6F0jSLUzKsTs'
    + 'mvMV8P7ZlN1J57G/BAYnEbPfuMMc80vzfevf5qPbIPLz28QQOfHN8S3OldPq87gBR9q/0rTpL+nhCgjCaODyyR39geh7sxfy'
    + 'ktZkuoPjovclFq7UL61DDxDfzeOeCOvPDswC8lLbL9jn6U8V7OUA9CQLQPEv7QUHBQXT3NnXi9bszXMGJ9y93n3DQOAw8LYW'
    + 'Ydm3D1XSoOCE8nzzIMc27W376je+2pshtQfQ/gHfdhub+xXokPAc/OMAqBIR8W0drcKoD8MLSBql78wWkwhLEU4HuA5v4SgM'
    + 'F98MH7kKzCR88tAfRBUB+934lgCjGlUnDQwkRfEJpyGz+bESegtjJLwmk//CBnVC6hcFJFgMxwzYD4EaGDymEHAvpUKlEjwZ'
    + 'hhfBIi0A3i2GD7sJkh3KIiQtjCRvK0bymfrtImMzOBqsF2EeYwAmG1U/iSBgQyU91SPn90Qw5g1JMokofkOnIu4xOSEo+8Je'
    + 'q1SzI4M73zBpEeMIfANc9Xcs7QZhF/IhdCfIGEEy0xfpDjEG2f8HAZcnfAWLDkIdMSCkH9H3uuxhFAocli349P0ptRIDBCAA'
    + 'HvlAL/sX0vjAJXoIwyCXE2wH8eo0HD8AgTuZ+vwXhvMF5jX1KxYCH21GWPCe7LcP5g6wCDMHG9ryDu4NvBBs2SUpsRAvDNzx'
    + 'NyvO/z4FfNxQ/uMCGfW2GM/Vxen4DD3vxDsQDKEQzwwrFva9VviPNlr8Xg6nHAEThzdS/EQpC867FpkS5wEV8UcGIw9h7IT6'
    + 'rNngBg7icus8AcMXBfgp4JTY9zyk/qM8HfcdLFrgRiK39Un9C/fgHjXvdvxRGMHUGM0MJ/bKjBzz/8j8fgIS3MQK3OzE8frK'
    + 'xecrFQ0Avs+S9DACmCkC48n3ltIE/9v+OUKs7kH7jw0sD+3TgxHn4LETE7TYB7u4LAVdI4YCMypf8JrzFQj+2Qw1SecJHwQG'
    + 'ogaz3+wUHPO+5n3rePaj2xEW89vhIznxbuctzn3u6vOVNEfapPy06cgp4Qo4/mjgiv4d/Srve7N8D5LWshmD43TZJRa46i+t'
    + 'dwsQ3+zunghq5A7MWwtS2/YM5+nv4uzllvMkCxPNL+1/1AUFpO7Z11br7M0T0Cfc6dV9w+LLMPBc82HZgbJV0hzLhPLrsyDH'
    + 'ru9t+0+0vtpO5LUHVg4B38kOm/tdspDwrunjAFrHEfG6wa3CG97DC3cBpe/O8JMIEs5OB7Dzb+HppRffhs25Cu7LfPIe5EQV'
    + 'G93d+Dbfoxrh3g0Ms+TxCQ3zs/l56XoL1N68Js/xwgbv/eoXb9pYDJTo2A/mCRg8SM9wLzAdpRJ6y4YX+uYtAFfYhg94LJId'
    + '4OYkLVzobys87Zn6APtjM07xrBf292MA8p9VPwAAYEN9ANUj6RxEMI4lSTKi/35DlBvuMYzqKPs9HatUZfuDO7HsaRFjCHwD'
    + 'gTN3LLYUYRefOHQnwf5BMjsv6Q6gA9n/0BuXJ58ciw5OKTEgbB/R9z4GYRSmMZYtx0j9KY4MAwRD7B75Mir7F9cUwCWEGsMg'
    + '7ixsB5cSNBy8F4E7URz8F6dFBebWHysWiv5tRnr/nuxhIuYO0wAzBy318g6NLrwQcS8lKVoTLww7JDcr6yA+BTUrUP6jKhn1'
    + 'ttXP1RYT+AxCJsQ7Ig2hEBEYKxb/KVb4mRda/C08pxxSMYc3yQ9EKdIMuxZnxucBsAdHBuXrYexKFKzZoREO4gAfPAGEMAX4'
    + 'ZgqU2AZGpP6TDx33ZeZa4ED5t/V+/Qv3ERY17xntURh4/RjNcwD2ymD48//PGH4C2xPECiMhxPGE+cXnQCENAL3dkvTH3Jgp'
    + 'D+HJ98sABP/GHzlCZPBB+4LzLA8y+oMRtg6xEyzz2Aep8SwFaNyGAp/wX/BYHhUI+QEMNU/sCR/9H6IGePDsFOskvuaQJHj2'
    + 'cgERFu7Y4SPtO27nUwp97tT3lTRMGaT8txLIKaIiOP4n74r+vggq73jhfA/AEbIZtP902YkHuOpF/HcLZPns7h3pauQoFFsL'
    + 'JSb2DIPw7+IlDZbzogkTzTT+f9TK1aTuNdtW60voE9BkxOnVQSDiy5AEXPOW+YGyrMAcy4rJ67NG+K7v6CpPtKbkTuSKDFYO'
    + 'wujJDt71XbI0E67pvOlax+rfusHlFRveTvF3AZ8LzvCH3BLODhKw87fz6aUK94bNTe7uy+XcHuQt6Rvd6tw235YA4d6g4bPk'
    + 'S78N8925een/t9TeUfTP8cjF7/366m/aQ+aU6J7g5glR7UjPvOUwHQKbesvF2PrmE+xX2IsLeCy6DODmob1c6A7YPO2tuAD7'
    + 'AAlO8Sr89vde6/KfCecAAA0HfQA+A+kcggKOJQnxov/r3JQbs/qM6t38PR2642X7lOCx7B4IYwj+FoEzn9m2FG/nnzic+MH+'
    + 'bf07L6HkoANQJNAb3v+fHCEETileJWwfru0+BoP4pjHd28dIXfmODNDYQ+w5FDIqQg3XFL78hBrRAu4smxqXEgHrvBceD1Ec'
    + 'Wx2nRZTe1h+/H4r+F+R6/6ANYSLZ89MAIDgt9WT2jS7D6nEv6hlaE8gMOySN8esg5iY1K7TmoyolALbVwwwWE/owQiZJPiIN'
    + '0TkRGNQZ/ymB35kXkCgtPKxEUjG8PskP8yrSDFoAZ8Z5EbAH1lDl60L6ShT+AKERpjYAH+YShDAt/2YKn0QGRqIokw9hEmXm'
    + 'IP5A+dJPfv3FGREWuT0Z7QUweP3SCnMAQApg+O07zxiEO9sTqeQjIU4ihPkoEEAhzfe93UMYx9zl7Q/hvwPLAFT6xh8kAWTw'
    + 'TQuC8ynyMvrvM7YOUxcs8wA4qfHvBGjcL/qf8Ms0WB4A+PkBmgFP7A4Y/R8c5XjwohbrJMsSkCTpI3IBrhnu2MUj7Tse/1MK'
    + 'auvU93I3TBm32bcSBdyiIvAOJ+/zKb4I6AR44Y4ZwBGJzLT/3vKJB4XPRfydE2T529cd6cbeKBTGDCUm3RqD8Jf7JQ1aDqIJ'
    + 'lw00/lj6ytXg4zXbgw5L6NQPZMQbF0EgQQiQBF3ilvkQEqzAXgCKyQ/0Rvjj+Ogqve6m5CoXigwB3MLozebe9bn3NBNWKbzp'
    + '1xrq36DV5RUEIk7xsyGfC83gh9z7vQ4SUfy3830aCvcNJk3ulObl3C8pLenRwurc1fGWAPnvoOF7F0u/ixrduQwR/7dk1VH0'
    + 'Ow3IxWoD+urjykPm9b+e4H0OUe2D7rzladECmxHsxdjP+RPsgu2LCxjHugwFHqG9oAYO2Izjrbi34wAJlvMq/L3MXusC8Qnn'
    + 'BMYNB23lPgOtyIICRckJ8SIP69wI5rP6POnd/BiwuuOw05TgPe4eCArn/hbSqp/ZweZv55nqnPjRAW39SdCh5M2nUCSTx97/'
    + 'HMUhBAD0XiU5nK7tUNaD+GoG3duz4l351vnQ2L+5ORRju0INdwm+/DPo0QIQ6Zsa18oB687qHg8PzFsdegiU3skwvx/V+Bfk'
    + 'j92gDX+u2fNjxSA4HBlk9r/Yw+ri6uoZZQbIDN4cjfGT8+Ym2u+05nb9JQA07cMMF/D6MKoKST5uBtE5ZznUGeYPgd9+I5Ao'
    + 'huysRIkWvD5H+PMqGBZaAOseeRENENZQN01C+p81/gB8MKY2LyfmEqxBLf+L8Z9EzjmiKN3+YRKcCiD+ByjST905xRkP/rk9'
    + '/A4FMBAf0gpnGEAKQTPtOx11hDv5KKnk+wtOIvf9KBC4Fs33NQdDGOQq5e1xKr8DJBNU+vpQJAHVC00LJBsp8gEu7zMBNFMX'
    + 'Tz0AOE8n7wSENi/6fArLNO0xAPjrMJoBmT8OGF3uHOXcAKIW2SvLEiTT6SPSIa4ZVS/FIxYFHv/qB2rrwvZyN9gDt9mxAwXc'
    + 'Av7wDr/78ymsBugEggWOGS07icwIAd7y4BKFz9P6nRO9+dvX19zG3n3fxgwB6N0adgqX+14gWg5/15cNLvZY+gLh4ONZ/IMO'
    + 'tB3UD9v2GxeKAEEIGSZd4p0MEBKb7V4AiAQP9G/r4/i3Cr3u8wwqF1vdAdwkBM3msPy591QNVimGFNcamAug1fD3BCIeF7Mh'
    + 'punN4G/e+71Gr1H8Ev59GjnrDSYCCpTmb84vKdvv0cIQDNXxXeb576UKexdf8osamf8MEWkPZNVoGDsNvAJqA+Lr48rF9PW/'
    + 'NxB9DmLmg+5x+2nRCPYR7Oz8z/nl5YLtb9AYx8QLBR6PFqAG5tCM48sGt+NKGJbzjgu9zJjxAvHN4wTG8/xt5YQArcgM/EXJ'
    + 'b/QiDxDdCOYfAjzpkQIYsAH7sNPx9z3ueh4K59Lj0qrKEsHmWt+Z6rcM0QH0DknQyOfNp+kXk8ci+RzFftYA9D/iOZwuB1DW'
    + 'FQFqBpnOs+LX5Nb5qey/uRjaY7sxIXcJSesz6D7jEOkGAtfKfdrO6l38D8zkuHoI5NbJMCr81fjnCI/d+81/ruDKY8U77xwZ'
    + 'XtG/2D3a4ur09mUGiNPeHCmwk/MMwdrvLeJ2/bWzNO1Z2xfwfsCqCukMbgazGmc50srmD3zsfiPnzobsFuCJFtwVR/gk3hgW'
    + 'u+PrHnTUDRDRCTdN35yfNZvkfDDU7y8nzuGsQUIJi/EeE845SNPd/kQsnAry1QcoJBvdOTkAD/5u8fwOT/UQHzYAZxjFB0Ez'
    + 'Ie0ddcL/+Sjc8/sLQOr3/aD1uBbB7jUHWgLkKvoYcSqIEiQTCUL6UPfa1Qv3HiQblhQBLtwpATRxKE89ehNPJ9UchDbhBnwK'
    + 'hintMTTs6zALL5k/wRtd7sUQ3ACcF9kr3xkk038+0iH+blUvGj0WBdcQ6gevLsL2zS/YAwEIsQOS/wL+NR2/+6oyrAY49oIF'
    + 'DQwtO9crCAE1HuAS5j/T+hT5vfkPVtfcwPR93+TnAegqGHYKufxeIDEXf9eLFS72tREC4dIAWfymH7QdKgzb9pYuigDSDRkm'
    + 'efmdDKTmm+1hC4gERu9v62fstwohGvMMFeBb3WUuJASADrD8pwhUDUzvhhQrG5gLaQfw98X1HhcQC6bpwNtv3lLcRq+E6BL+'
    + 'Zww56yYDAgrAHG/OhOvb7yUQEAy4/l3m1+mlCnEKX/IA/5n/0fBpDzsBaBjR/LwCFPzi6471xfRg3zcQeAFi5rfrcftQ5gj2'
    + 'nfns/MAR5eU3BG/QifLEC5rxjxaHD+bQmsTLBq0TShiy0Y4LH92Y8XvzzePpNfP8ySmEANURDPw4CW/0adIQ3U8EHwLa8pEC'
    + 'NuwB+yYE8feb9HoemRXS4y3QyhKrAVrf6em3DEb19A6jBsjnPePpF4oCIvnh+H7Wau0/4qrxLgf++BUBWumZzu771+RR9Kns'
    + 'fusY2iQhMSGAA0nrIe8+43D7BgLF3X3ai+td/KDt5Lj31eTWaf0q/I7m5whl6fvNRePgyk45O+8z317Rrrs92lnG9PaV/4jT'
    + '6wwpsF3aDMHMCS3ivvu1swPkWdt84X7AmOvpDAP8sxqA79LKatR87Crg586dFBbghuncFT/4JN6177vjxOh01GTk0QmC99+c'
    + '5vKb5JDn1O/uz87hbupCCVffHhOC2UjTEiNELKq78tVT+SQb88w5AMvlbvEnIk/1/8s2AHzSxQeG5CHt6dDC/zz83PNK2kDq'
    + 'Z/ig9bnIwe4OvloC4uX6GCvGiBIbEwlCk8n32vDW9x7d+5YUtOTcKT7PcSjsJ3oTy97VHAP04QYv9YYpOg007KkICy+X6sEb'
    + 'ZfjFEFf8nBfEFd8ZT+h/Pt03/m5Q9Ro9JwnXEGbury5u7M0vMPgBCC/3kv8bBjUdjvmqMsQjOPbCAA0MLv/XK4MMNR5yL+Y/'
    + 'YR0U+ZcWD1bU9sD0uf7k5yL8KhgEPLn8oSkxFx4IixXaD7UR3wnSALoIph/lKSoM0BeWLtVR0g2YPXn5CT+k5mIvYQuIFEbv'
    + 'Ri1n7OkVIRrxRRXgpSdlLsUjgA4CIKcI4kZM79r4KxsfSGkHEhbF9aD3EAvgBsDbN/BS3KsnhOia/WcMOhomA/EwwBwJBITr'
    + 'Bg0lEOnyuP5XCNfprk9xCgIjAP+1CNHwYv87AWEM0fy8DxT8gwGO9dAXYN/d8ngB9vG3644RUOZX65351xjAEQ4GNwQ+2Yny'
    + 'ygea8YPbhw/aFJrEZv2tEwIwstGTHB/dRuh784jQ6TX67skpUuPVESgtOAk+AGnS+xZPBCr52vKT+zbsBv8mBJ0am/Q3B5kV'
    + '5eUt0AAnqwFz+OnpgvRG9du6owYQDz3jKQKKAjMC4fgQ9mrt9PGq8Qf3/vhUC1rprQ/u+6D6UfRVF37rcP4kISn0gAM9BSHv'
    + 'c99w+xMGxd392ovrbOeg7VDP99Xv+2n9FyeO5g/9ZelRD0XjhzhOOQkJM99o7K67be9Zxk3+lf+P7usM8+9d2uMUzAljFb77'
    + 'GdQD5J7nfOGb75jruggD/D4VgO9OOmrU4+wq4FvtnRTnBIbpW+U/+Kbxte8w6sTo8rNk5IT1gvdB7ebyjA+Q5wvw7s+t0G7q'
    + '5+dX37G6gtkczxIj5vqqu7PkU/klAPPMe7nL5WDiJyL62//L1f180kn2huTf9OnQ9Qk8/DvbStrSA2f42cm5yILIDr5j9OLl'
    + 'hL0rxmPvGxPD45PJA/vw1pXf3ftP4rTkQe0+zwrR7Ccg0Mve0ewD9O7gL/Ul2DoNYOCpCEwJl+qx2GX4mNhX/Hi7xBVZ5E/o'
    + 'APbdNyz7UPWK6icJ8P9m7o37buzTBTD42wMv9yUTGwZ26o752s/EIx0BwgBGBS7/qhmDDB8Uci+NJWEdFweXFir/1PbQ2bn+'
    + 'EwQi/OLwBDzLBKEpigIeCBkO2g/rAd8JQhy6CMHF5SlLDdAXGCfVUZE4mD2XHgk/3DZiL70TiBQIEUYt7x7pFVQT8UXBAaUn'
    + 'RwnFI/37AiBlJOJG6Rja+NwQH0i4DBIWNyeg94Qu4AZAATfwC/6rJ180mv3f/DoaYivxMFhFCQSgRQYNoTDp8gcwVwgUVa5P'
    + 'A+cCI8cTtQgdM2L/dBZhDAA8vA/+HIMBtiDQF4cW3fIaEPbx+w6OEQQiV+tWCNcYFjEOBjMpPtkqM8oHBf2D25Lu2hRgFmb9'
    + 'FVsCMCEzkxyrBkboPh2I0J4j+u6P8FLjODEoLYsLPgCADPsWXw4q+VQok/sH+gb/bOKdGisSNwfD2OXlrAEAJ4Ikc/g/FYL0'
    + 'oB/but4UEA8GPykCu/YzArwNEPY1+fTxChoH9zoBVAtWK60PLvWg+h0jVRdVD3D+FwAp9I8NPQWcBnPfrAgTBhH7/doe72zn'
    + 'wvdQz37X7/u1ExcnGeIP/V/6UQ8ID4c4nhMJCUrVaOx+/W3vtQpN/g0Bj+7xH/PvX+zjFDDPYxVyExnUZvOe51nWm++N/LoI'
    + 'tR0+FU/iTjoaOOPseexb7X0C5wRW41vlTgGm8Qv9MOqj3PKzREOE9QH0Qe3S84wPbRYL8EcqrdCYGefn2+GxuikDHM/k0Ob6'
    + 'rRKz5NfVJQAg6Xu5nftg4rEF+ttL9NX9+x1J9mEK3/TPB/UJhdo722Yf0gMh49nJuB6CyKokY/Tz/4S9cAtj78yow+OM7AP7'
    + 'ewqV32AFT+KQ0UHtreYK0YuwINC49dHsVr7u4AwFJdh2BWDgU91MCS70sdjn4ZjYE+x4u2zKWeTE8wD2cr0s+2a4iupl4PD/'
    + 'zN2N+9bo0wWa0tsDZA4lEznlduq75trPveUdAcD4RgWb7qoZeOsfFIryjSUJthcHLbcq/wPg0NmB3RMEXPDi8JvjywR78YoC'
    + '2MYZDsnk6wEOxkIcyu/BxQ67Sw218Bgns8aROHPhlx7OANw2LPK9ExHHCBFY3+8eCM1UE8vJwQEH9kcJ5AH9+3wAZSTEBekY'
    + 't/jcEAf0uAyh4jcnHPOELs7fQAGW7Av+LQRfNM8A3/yBTWIr0OZYRR8FoEXq56Ew0AEHMC4EFFW0IQPnewTHE+ILHTOBB3QW'
    + '0fEAPKoE/hwqDLYg/heHFnUkGhCyEvsOLxMEImTxVgh9JxYxEAszKcAtKjPDOwX90BiS7pMFYBayHRVboiYhMzwXqwaRET4d'
    + 'QyyeI8Qqj/DhFjgxAfiLC5cpgAyTDF8OciNUKKYhB/pB8WziOR8rEvYow9hWK6wBih6CJKXsPxWXOKAfiCPeFNb8Bj/eBbv2'
    + 'Eh28DdMmNfmKCgoamCg6ASvqVivz+i71DeIdI5z8VQ9HNBcAUECPDZMUnAYv/6wIHAgR+5YXHu/o5sL3W/1+17QrtROn8Bni'
    + '3fZf+gYICA+nDZ4Tp/dK1XsHfv1TE7UKgjINAfIA8R9sAl/swCYwz5H1chP34mbzhgdZ1o0ajfx2CbUdcf5P4oDeGjjk/nns'
    + '/Rx9Av3iVuMQ+k4BoPYL/Ujvo9xmBURD9AkB9LUJ0vOx6G0WDNlHKs0FmBnd89vh1yopA/0r5NCNLq0SAOrX1WwNIOmPFJ37'
    + '/hGxBQL4S/RMHvsdaQBhCmwDzwd03IXagw9mH0/6IeM4C7gexQWqJGYE8//4/nALRRLMqAn7jOxx3XsKggxgBQPskNGl363m'
    + 'WuaLsHgEuPUr+1a+IcsMBYDzdgU/F1Pd1PAu9Oj25+GAEhPsDwxsyqcQxPNXt3K9zh9muGsFZeA7L8zdteLW6PvKmtJ282QO'
    + 'Auw55dAAu+bECb3lxu3A+E/pm+48+njrL+eK8l3kCbacAy238wcD4AQDgd0E5VzwRbab4+7je/H81NjG7OLJ5KTVDsYq5Mrv'
    + '2csOu67FtfB+/7PG+8tz4SzizgAL+Czy0fYRx8zzWN8r6AjN3PHLyekAB/bc6uQBSrZ8AOTUxAWZ8bf4FdMH9LMHoeL04Bzz'
    + '4uTO35n9luzM3y0E0ujPAF36gU0IxNDmfeAfBVD76ueL6tABJgwuBITGtCECxXsEWP/iC84CgQd769HxlvqqBPEDKgwf4f4X'
    + 'BuV1JEn7shJUDS8Tw95k8bz2fScs9xALDgjALa7/wzu+9NAY5R+TBe73sh0r/6ImhOI8F1n4kRFPFkMsMhPEKg0b4RZIGwH4'
    + 'OkCXKcf/kwzR7HIjM/umIWIEQfE2/zkf/xj2KNU0VitpPIoeSyWl7ARMlzjqEogjDPbW/Ns03gV08hIdBwzTJvcpigrpG5go'
    + 'JRor6nUD8/qwHg3iQDac/IIfRzTNC1BACwKTFAMML/+XJxwILiaWF2IL6OZk6lv9xSa0K9EHp/D1K932+QkGCP4Dpw20Haf3'
    + '8k97BwoqUxMfG4Iyeh/yAO/tbAKi+8AmuNqR9co79+I+NoYHKhuNGlUUdgmE7HH+YwqA3vA35P68EP0c0f/94m/jEPoCK6D2'
    + 'uwhI7wnhZgV48/QJk+q1CUcEsehnCwzZXPrNBT0X3fOKBtcqoxz9K2P7jS5MSQDqpPVsDWftjxQt6v4RmfwC+IXZTB6eB2kA'
    + 'sdRsAxEEdNwJ4YMPNfdP+sUNOAvJNMUF2uZmBCb8+P7r7kUSjOsJ+x/vcd2OEoIMafQD7G4zpd9RCVrml+h4BHf3K/uK7SHL'
    + 'dBKA83XaPxdi4dTwrvLo9ggQgBK5HA8MJCCnEJsMV7eI/s4fqxJrBRXmOy/v1bXiPgr7ygHpdvN0/gLshQLQAEMFxAnbFMbt'
    + 'JxJP6TgDPPpC9C/nfwBd5O/vnAOq+PMHwjgEA1kABOXzBUW23Oru49ER/NQ2C+zisgqk1VP9KuRgD9nLDxSuxZ78fv+z8vvL'
    + 'AQks4vLeC/hd4tH2u/DM8y7JK+gnA9zxQtnpAKLj3Oqr6Eq2k+3k1PHjmfFp6RXTwOizBw/f9ODL1uLkdwCZ/c+2zN+L4dLo'
    + '19pd+oHuCMQLw33gUdhQ++Pgi+o7+yYM7umExubGAsWA1lj/pvXOAr3Fe+tA35b6w+DxAyPYH+GbHgblr9dJ+5PrVA0J0MPe'
    + '6e289iD2LPdA1Q4I8uGu/1TPvvRJyuUfzPzu90DZK/+ir4Ti6w9Z+EXWTxb34zITGBANG4joSBs16TpAINLH/xzK0ezn7DP7'
    + 'T/piBGD6Nv/W6f8Ys/bVNM/NaTyoA0slWP4ETCcp6hLc/Qz2uunbNJT/dPLK+gcMrQ33KeQF6RsT6iUa/+J1A7EPsB6iKkA2'
    + 'WQ6CH24gzQtPJgsCnxYDDEb/lyd3Fy4mqS9iC10hZOpmJ8Um3AzRB7wT9SuJFvkJ5xj+A2g1tB0v5vJP5hwKKvoaHxsf/nof'
    + 'BS3v7aoNovtVFrjatkjKO9Q1PjYMLCobsidVFEsbhOxgTGMKCjHwN5kNvBCS/tH/7Cpv42ocAivT/LsIhSYJ4SsWePPBJ5Pq'
    + 'ISVHBKgMZwsjKFz6ww09F34OigZ3C6McZTBj+44PTEk1NKT1qzxn7ZwCLepC0Jn8SCmF2fgIngc1/LHUnQERBK8ECeGdKjX3'
    + '/Q/FDZwoyTTnFdrm5gIm/EgA6+4VFYzrNhof738djhJTAGn0kQluMzQSUQm2+5foKup39xbxiu1m/XQSYhF12nkeYuHv4q7y'
    + 'wvMIEN74uRyoEiQggPSbDIX2iP4h4KsS1goV5iT879Xq8D4KxPkB6Q4ZdP7c6IUCjOxDBeAb2xRTAScSyw44A8sIQvT+/n8A'
    + 'APjv77gSqvhEGsI4lBhZAGrl8wW0HdzqPPjREVPvNguV/LIKLxNT/aEMYA+q+g8UShOe/H4Ds/JW8wEJMPDy3kUJXeL//bvw'
    + 'puAuyYkSJwNa9ELZxiKi4/Deq+gg+pPtB+7x42Tnaenw8cDoSyQP3xr/y9Z46XcAhNHPtk3Ti+FT7dfacuqB7vPyC8MXxFHY'
    + 'afTj4NAMO/tkGe7pZ8nmxinhgNYd36b1vvS9xSXVQN+LFcPgze8j2Cvrmx7gEK/X1OuT61X0CdCa2ent2Mog9h/bQNU1GfLh'
    + 'hvVUz7zsScrtz8z8rflA2RPGoq/KwOsP5tZF1toO9+MiDRgQ/deI6KTSNemqvCDSBeMcyr3k5+y48k/6ZfVg+ovc1umJ7bP2'
    + 'fdHPzXntqANU1lj+XuwnKffq3P2B5LrpVPWU/+nAyvruzK0Nf9/kBQDGE+oa3v/iwd+xD3wGoipe7VkOVQJuICzzTyaa4Z8W'
    + '1vFG/3UAdxcqDKkv1e9dIUvPZickz9wMvu+8Ey3EiRYvIucY3QhoNcruL+a05eYcEBf6GqvoH/5T7AUte/OqDaoIVRZ8FbZI'
    + 'vSPUNeAhDCzxC7InISRLG6v/YExH5woxQQKZDXgAkv6OBewqYv9qHJsL0/zMJIUmPj4rFk/ywSfz/CEl1gioDFosIyhZF8MN'
    + 'Xgx+DhUtdwvpMmUwjR2ODxkMNTSgJKs8mhmcApMZQtCZE0gprzP4CJIkNfz9NZ0BhTyvBLgonSrnEv0PDDWcKNYn5xULV+YC'
    + 'bCNIAIQrFRXZITYaihh/HVEUUwDwH5EJQiQ0Epoxtvv5HSrq+QsW8SwOZv0l92IRvDh5HtIG7+KIJ8LzRBfe+P0WqBK7DID0'
    + '8PyF9g34IeA0M9YKbg4k/Bok6vAQKcT5UwAOGR0S3Oj0CIzsge3gG2sCUwHxEssOKfrLCG/9/v48AAD4fDK4Ek3aRBq+DZQY'
    + 'ivxq5YvztB0/+zz46g9T7+UQlfytBC8TlhihDE4cqvoYEkoTt/N+A7UKVvO8CjDwgO1FCb7c//2t0qbgHwGJEjYGWvRt5cYi'
    + '5Rbw3iIDIPrCHQfuHwhk51fo8PE6CkskAA8a/xT0eOlS4ITRkAJN0zXqU+1CGXLqavfz8qUmF8Ra0Wn0WgPQDPUfZBl97GfJ'
    + 'j/wp4QL3Hd+d8L709AQl1Z7iixWQ/M3vIAor65r54BDZ59TrXBRV9EUNmtmY5djKe98f24DmNRkHB4b1cQC87CwL7c/P8a35'
    + '3uMTxuQLysCV6ubWKfraDvnSIg3R5/3X3wmk0uPiqrzXAwXjer295L3juPJt62X10BSL3KHTie1k+33RCwN57e3aVNbF4V7s'
    + 'U+z36rPHgeSV3VT1CwPpwLTx7swI4n/fWOcAxg/xGt659MHf5tZ8BowEXu1R/1UC2/As8wfPmuHfytbx+Nl1AGDiKgz8udXv'
    + '3OtLz2L9JM/W7b7vbdItxBPQLyKA6N0I6N7K7n/stOWD8BAX5Pur6JLLU+wY6nvz/t2qCKnkfBXD+r0jHP7gIXsI8Qsl9CEk'
    + 'e+mr/4LnR+cgyEECBA14AMbpjgVS/WL/fwKbC5fZzCQb4j4+3xlP8rv/8/wU7tYIkvlaLLwVWRfqE14Ms+AVLVYm6TIsGY0d'
    + 'GwIZDMbsoCSSH5oZVhSTGUvrmRObB68ztFKSJMQP/TVpAIU80vu4KA065xLtJgw1UTTWJ/AbC1cDM2wj1gWEK+cc2SF2IIoY'
    + 'QDlRFKAi8B+PDkIkQR6aMZz4+R3s6vkLZTAsDkQWJff+GLw4GjHSBp09iCfCKkQXREn9FvQpuwxrJfD83CMN+C4CNDPyMm4O'
    + 'GegaJGAQECk8HVMA7AodEsER9AhJQ4HtijJrArAK8RKzDin6Svxv/d4mPAAuEXwy0epN2i8Xvg25HYr8USiL88cQP/taCeoP'
    + 'CTzlEOEPrQSVHpYYMQJOHDIcGBJ37LfzVgG1CjjwvAqZ/IDtWCS+3Oj6rdI7Fx8B+Sc2BpEFbeU5G+UWghAiA+AGwh0pFB8I'
    + 'bStX6OT0Ogpt7QAPvesU9EMXUuDdGZACN/U16hLSQhm08Wr3KAylJpX+WtHSA1oDXvT1H8oVfewaB4/8XQwC9wcDnfD+CvQE'
    + 'kwme4mfrkPzLByAK+BCa+fQY2efuCFwU7+pFDV7umOWj9nvfTwSA5pn9Bwfc53EAyOcsC73Sz/GNvN7jkv3kC+cylep6Jyn6'
    + 'Duv50oID0edK4N8JeOPj4szl1wO8+nq9cfu946MEbetDDdAUMveh0/H+ZPv85QsDG+Dt2kjcxeFyClPsd/Szx5fSld1C+QsD'
    + '39608WEdCOIQ7FjnswYP8csOufSo4ebWPfeMBMgAUf9z9tvw7voHz2LV38pi/fjZ8OVg4i/3/LmrAtzrV/xi/YX01u0D+m3S'
    + 'KPoT0M4KgOjS6OjeTux/7Cv8g/CV3OT7jMmSy3nwGOqq4P7dWcqp5MXuw/pjAhz+m797CJv4JfQkq3vpFNmC508JIMgk2gQN'
    + 'CePG6YDxUv3Ou38CiuKX2XbiG+KFCd8ZuMa7/37ZFO4GzpL5KMy8FWf76hMo5LPgMNhWJrHZLBl32RsCNtzG7P/Lkh+s4lYU'
    + 'fuFL6+3ZmwfA7rRSu/HED7jhaQDg69L75R4NOmQf7SYy3FE0m+DwG+beAzMJDtYFFvDnHFr/diDHJkA5+PygIvQNjw53C0Ee'
    + 'EvWc+CEa7Op38mUwMCNEFhv7/hju/hoxNfOdPSr4wipFBERJaNr0KRoLayV0BtwjqSMuAu4c8jKzBRnoJwxgEAISPB0MOOwK'
    + 'PQfBEU4KSUNLAooybPuwCpwisw75IEr8wjjeJgc0LhGdUdHqwxwvFwQZuR3ZAlEo9C3HEJYhWgkOLQk8fAbhD28mlR4bIzEC'
    + 'ciEyHHcPd+xhN1YBfEk48BQFmfzvK1gkDN7o+q0pOxd98vknuQ6RBRf9ORvtE4IQ0CngBhzvKRR3Dm0rVArk9HU2be3pHL3r'
    + 'f/lDF8UH3RlpMjf1dR8S0or7tPGiCCgMdAiV/hkB0gMc5170cPzKFfYnGgczAV0MZAYHA+EK/gq3NpMJpwZn60Idywdc+PgQ'
    + 'B//0GEsE7gjo8u/qpP5e7pIVo/b58E8EuwGZ/Y4Q3Odm78jnOxi90hQCjbzE/JL9HdXnMvX3eifHBw7rFSWCA80LSuCzF3jj'
    + 'suXM5dr8vPqxGXH7neyjBEsUQw1jDzL3pAXx/s/4/OXT6hvg9SVI3JUNcgpvB3f0Z/eX0hkBQvneA9/e8AhhHR0QEOy477MG'
    + 'GeHLDjUCqOEK2z33YfnIAFH1c/aRCu76Pypi1TbWYv0QMPDlSvov92gGqwJ54Ff8lxOF9NL+A/o0/Cj6udPOCiX+0ugWDk7s'
    + 'c/Yr/PETldxvEozJ9Ot58PMaquAy+VnKjfjF7tf4YwJr95u/FL2b+FvwJKtn1hTZQxVPCYkTJNoFAwnj6uqA8aPZzrs44Iri'
    + 'thZ24rzdhQl0ubjGrwB+2dwJBs5rDCjMaf5n+xsBKOTt5zDY6Lmx2QLmd9kA8jbcTeH/y8ffrOKbzn7hWc3t2VMJwO68Cbvx'
    + 'h+G44VLn4OtNzOUer+5kH1sGMtx2wJvg4erm3pvsCQ6P7BbwgQRa/y8NxyZg3fj8GPH0DR3ldwt/1hL1VOohGo/zd/Kx6jAj'
    + 'O9Qb+wHe7v4i3zXz9Ncq+I/xRQTo9Gja/QEaCz7cdAZ046kj+hHuHN3uswVf9CcMbvECEpgODDjgED0HHRFOCpT7SwIJ6mz7'
    + '1iacIrUR+SBq98I4xiAHNMj4nVGCI8McbiYEGRT12QJcFvQtCByWITpEDi2E/nwG4i1vJjcRGyPT93IhwhB3D4IUYTcp/3xJ'
    + 'OB0UBeAr7yuYHQze+g2tKR4XffLsGrkOTyAX/dAz7ROpItApw/8c7/URdw64IVQKRTZ1Niw66RxpRH/5xiHFBy0vaTJMAHUf'
    + 'AiiK+xEIogg/HXQIR14ZAWEkHOdaC3D8xCX2J8IRMwHeB2QG9kfhCngxtzaYIacGWBFCHVUSXPitOAf/0h1LBIjV6PLISKT+'
    + 'vhiSFUMb+fARKrsBFxyOECQhZu+VBzsYt/UUAqgUxPwMLB3VX//199X8xwcPJRUl4gDNCxIBsxcVAbLl0gba/FTmsRlp+53s'
    + '8QpLFCcKYw84HaQF+yrP+I4j0+p2FvUlnf+VDTL1bwdGAmf32A0ZAXsS3gP/DfAIFP4dEPAQuO+zGhnhhhI1AjX/Cts97mH5'
    + 'qO1R9U3xkQr7BD8qfAo21tnhEDAB9Ur6vARoBsfseeDZCJcTWvnS/rHwNPwTAbnTRggl/k7uFg4a+3P2FArxE1XwbxKW3fTr'
    + 'K+DzGqn3MvnH5I34IfnX+E8ja/do4xS9UPpb8NcsZ9aKCEMVG/iJE1P8BQNhCOrqqCKj2bDzOOCa7rYWN+G83d3/dLnQ368A'
    + 'E/PcCT/paww9Emn+hPAbAd4C7edT2Oi5APwC5lvfAPLp7k3hWiXH380Jm87P8lnNnzdTCbHgvAlfC4fhENJS5yjsTcww1K/u'
    + '4fRbBsnvdsBN5+HqsAOb7CHgj+z38YEEcfsvDXXKYN0E2RjxAOkd5Ur0f9YXBFTqMuGP83Heseo10jvUweoB3iDdIt8g3fTX'
    + 'deCP8Y7t6PTw1f0BUdE+3D3qdOPqofoRYtTd7u3IX/QZ+m7x49eYDo7V4BB54B0RXdWU+8DZCeqc5NYmSNq1EbPaavc3z8Yg'
    + '68zI+P/mgiPy7G4mq8kU9Tf4XBZM+QgcvP46RMfxhP71+eItZxs3Edvo0/em2sIQztGCFK0XKf9XGTgdsOLgK0DomB0e8voN'
    + '1RMeFxHh7Bpy1E8g/ivQM+oGqSJkC8P/Mf/1EacOuCH55kU2dfYsOpcLaUSg28Yh9gUtLw8GTACvCAIo1AQRCNv8Px3p7Ede'
    + '9RZhJNgOWguW+cQlehjCEQUS3gd6D/ZHHO14Md4omCHPAVgRYx1VEuMLrTghFdIdlTWI1RgpyEjXNb4YgSVDGxEnESoG+hcc'
    + 'dBgkIWAalQdcOLf1WhSoFCkkDCwaI1//IDbV/P4aDyWELuIAjvkSAe/6FQGD7NIGhitU5o4oafuBLPEKLQsnCswMOB0yFfsq'
    + 'zzSOIyw5dhayJZ3/Qhsy9TAvRgJeDdgNsQl7EjsO/w3E+xT+hAvwECX3sxqbIoYSyxc1/0cpPe4t6ajtZzFN8cPo+wS+73wK'
    + '8vrZ4RwiAfUMC7wEsQDH7Lr02QgV6Fr5Xhux8PETEwHkHkYIsQpO7n3LGvv65xQK8ApV8GP5lt0z9Svgtump99cTx+SCCSH5'
    + 'SApPI7zyaONZA1D6COTXLOr8ighnyxv4Nt9T/O74YQibMKgigtqw8w/mmu4+BDfhViTd/xcE0N97DhPzIPk/6aP1PRLtAYTw'
    + 'u/LeAkcPU9hM3wD8wxJb3z8B6e4C/Folj97NCSzsz/L3GJ834vux4MgFXwvJ7RDSHP8o7D3jMNRKAeH0kwbJ7zoFTeeu67AD'
    + '2fYh4IMI9/Go+HH7mvZ1yiMjBNnd5wDpDBFK9HXiFwQCBzLhagdx3qftNdJg3sHqIs4g3TXpIN3b/3XgEd6O7V318NUu1FHR'
    + '1+w96jXZ6qFJ7mLUt+TtyK3VGfq33+PXMNmO1YjQeeDiAF3VbuLA2c+7nORt20jaOfqz2hfXN8+8BOvMw9P/5gjv8uxg+avJ'
    + 'y+w3+N7GTPlGz7z+MfrH8VnR9fmO9Wcbftjb6AjkptqbxM7RftStFwfPVxmo5bDiFeNA6NrqHvKZ19UT7c4R4SDmctTFzf4r'
    + 'efnqBqbhZAv73TH/2u6nDp/k+eYaxXX2O9KXC5L+oNus6/YFocgPBmDzrwjp4dQEsdzb/G/Y6eycBfUWUsrYDsXilvnD93oY'
    + 'AxcFEocDeg9m6BztchreKALhzwGkA2MdtQnjC0TvIRUKEZU1zvkYKQAU1zW54YElmg8RJ8sBBvobI3QYIAxgGuMnXDgSGloU'
    + 'ZA4pJFAiGiOkIyA2Nx7+GuvmhC6wAo759jPv+gv/g+yJK4YrwiiOKE0MgSwc8y0L0RDMDFZHMhXeC880tA0sOesJsiVMN0Ib'
    + '0RkwLywSXg3RO7EJ2io7DkkMxPv+BYQLWDYl9+EemyK5/ssXoPlHKdIGLenfA2cx+fLD6LQFvu/MCPL6dxEcIqw8DAsZFLEA'
    + 'ZBW69GciFehvEl4blx7xE1Ub5B5GF7EKLEx9y5Ql+ucw/PAK0hhj+VEAM/WZGLbptfLXE0b3ggnoE0gKVyC88nMVWQPFGwjk'
    + 'OBHq/FsMZ8vh/Tbf4xfu+H4bmzC8BILaAQMP5hQlPgTJA1YkMwUXBPwMew60ACD5nfGj9YUJ7QGzALvyhSZHD9kQTN+G9MMS'
    + 'Jg8/AWgGAvyMGo/eO/Us7JMD9xiq/eL7ywDIBaTtye07Cxz/CQg946EZSgFu/5MGWPc6BboPruu779n23BWDCOQVqPiBGZr2'
    + 'wAcjI1v23ed7AgwRBQh14gz1AgdjG2oHKwyn7WPuYN6CJiLOWQI16TDq2/9w7xHeMh5d9d4kLtQzFNfsQho12fEXSe5VCrfk'
    + 'bAWt1VgJt9/vDDDZrO6I0P8L4gAzGm7iDfjPu1n1bdu3BDn6Xe0X10DfvARWEMPTXO8I7xv4YPmq6svs9w/exp0GRs+57zH6'
    + '79tZ0eXrjvWI/X7Y9vQI5Hvym8Sq837U0f0Hz8nsqOXU9RXj/dfa6oQemdd45O3OeO0g5vvzxc2C33n5Meem4Trm+90209ru'
    + '0O2f5CXDGsUZBzvSPvOS/qvvrOtmv6HICdJg86X96eH6NLHcQflv2O71nAWK61LK5s/F4gX1w/fyygMX7MiHA+bHZuhz9XIa'
    + 'C+EC4avkpAPW4rUJFc1E79/WChGW2M75lMkAFIXcueHP0ZoPGfTLAcb2GyOP0CAMtOXjJxsSEhpV2mQO2/dQIrPypCPbBzce'
    + 'N/nr5gXssAJz9/YzMvkL/zL3iSsN4MIo+hRNDPISHPMf6tEQkPpWR5r93gtw7LQNs9/rCTH5TDf4ANEZrewsEo4O0Tu6I9oq'
    + 'rB5JDJcM/gWM61g2CiDhHtkVuf6XHKD5ADzSBsEF3wO13fnyJwO0BeQizAiJGncRbwKsPBL/GRQMFWQVygNnIq4nbxJ6FZce'
    + 'jBFVGz8PRhfxIyxMtx+UJQcjMPymItIYmB1RAE0KmRg6ELXyvxZG97BH6BMdA1cgVxVzFUQfxRvGFjgRyjFbDJkV4f15FuMX'
    + 'zCp+GwU+vAQ/NQEDpxUUJZ8WyQO/FzMF7hj8DDwEtAABJ53xkBeFCasRswBQ+IUmCxLZECPqhvRuAyYP7QJoBgYTjBrzMTv1'
    + 'AxeTA6wnqv3YFssAoR+k7XctOwsb+QkIGfehGaQTbv+VBVj3bgm6D3//u+8E+NwVrSPkFfvsgRkdEMAHeAxb9jHiewLB8AUI'
    + 'yvMM9fMLYxso+SsMjf5j7g3jgiY5LlkCNgEw6qIJcO/g9DIem/LeJKAlMxRu2UIaHwXxF4PnVQqb92wFB/NYCS3s7wyPAKzu'
    + '38z/C775MxpN/g34J+VZ9VEetwR+9F3tpPtA36L0VhDP/lzvbRob+I4xquo1D/cP9BWdBlsiue8bBe/bNh/l65oPiP2KAvb0'
    + 'aQZ78gzbqvO1BNH99N/J7Pvd1PWqAf3XT+eEHs/8eOQz/3jtjf/782zpgt+TDDHnXPg65jUCNtMO4dDthvQlwxANGQfGCT7z'
    + '9OWr7yLqZr+G4AnSROal/bHW+jTO7kH5Nf3u9Tzgiusc7ebPp+kF9QgC8sop4OzIBeDmx9DZc/U20wvhZPOr5HTl1uJz6BXN'
    + '2v/f1kcAltixxJTJcvGF3ILoz9Ff2hn0e+nG9mrAj9AT/7Tl/esbEmrQVdq31dv3dL+z8sza2wdq1zf5ycYF7GXwc/dr+jL5'
    + '3eAy96TbDeCe6voUDOLyEovNH+qS1pD6N96a/aTpcOyq5bPfb+ox+QzJ+AAx9a3sHOmODnEcuiOF46wesPKXDE0ljOuO8gog'
    + 'q+7ZFdvdlxzOEAA8NN3BBeX9td2V7ScDpvTkIs3diRrVFW8CaPcS/3XmDBWaGMoDhPeuJ44JehUNFYwRUA8/DzXc8SOgFrcf'
    + 'ZQgHI1EFpiIKC5gd2u5NCqUTOhBL9r8WwQywR6YWHQPaKVcVsAVEH2kzxhZ2KsoxUhCZFdQDeRYN/swqhyAFPl8NPzUQNKcV'
    + 'rQ+fFtALvxeHIu4YzhA8BL0eAScqMpAXPiGrEWchUPgUIwsSwf0j6pgmbgPgIe0CCzAGEx8q8zHsGQMXwzGsJ04X2BZoIaEf'
    + '6RV3LX4kG/lrExn3eDqkEwZBlQXcKW4JMDZ///v4BPh8+q0jOQ/77H0VHRDvD3gMw/Ix4qYowfBqO8rzainzC7MkKPn6Eo3+'
    + 'Kv0N4z0OOS45NTYBPwSiCWsB4PQ5H5vywB+gJWv3btktAh8FyPyD504Hm/fpGgfz+fQt7HYZjwCXBd/MnjC++d8ITf5PACfl'
    + 'DQ1RHtv6fvQC3qT7IPyi9I/7z/414W0auP6OMZPXNQ8O+fQVgARbIo4BGwWT9zYf6P2aDz/wigLJ/2kGuwAM2w7utQTqBPTf'
    + '2wT73ZT8qgEsL0/nPP3P/Jz6M//l943/Q+1s6aoNkwzy8lz4TfU1Auv1DuE47Yb0Rt4QDWP3xgloEfTlJQQi6qUehuC8DkTm'
    + 'KQqx1nkkzu6r/TX9jAA84NP+HO3SHKfpcv4IAmPxKeANCQXgQe3Q2REHNtM3BGTz6/d05QoGc+hw3dr/7/xHABPwscQZMHLx'
    + 'rvqC6EjrX9pI23vptQ5qwKztE/8/5P3rVvlq0JH+t9Vj/XS/j/DM2mPyatfs8snGEvRl8Or0a/oQAd3gB+yk2zfanup45gzi'
    + 'H/eLzfvEktZZxDfeE/ik6RQDquVUzG/qQOYMyfnbMfUm3hzprehxHDjJheN1zLDyy9tNJZDejvJUy6vuX/Db3d3YzhDF2DTd'
    + 'febl/Z/ele2M8ab0cc/N3cPG1RU93Gj33eN15ibLmhjiyIT3+OeOCXXWDRXDyVAPd/k13GjboBbj/mUIKupRBWTwCguz59ru'
    + 'h7mlEyjYS/YA7cEMzPemFmrP2iln8rAFHt9pM9L6dipb91IQmQfUA1kPDf4XBYcgXw5fDXn4EDRkN60PuOrQC5v5hyLAFs4Q'
    + 'XhW9HrYRKjLNFj4h5OJnIU0rFCMCCsH9XieYJkjp4CHMFgswKggfKkYf7Bl2G8MxeR1OF/QCaCFDF+kVxxV+JKgjaxP4LXg6'
    + 'ex4GQZUD3CngHjA2t0/7+Ig9fPq95DkPrR99FbAw7w9dG8PyHxamKOUZajuvKWopzQizJL01+hKJHSr9VAw9DrgzOTXj/z8E'
    + 'jBJrAcIROR+VRcAffg5r95HxLQI7D8j8iSJOByUo6RolRPn0njJ2GVYalwW7BJ4wVDTfCBsNTwCqBg0Nbgrb+nr5At6/ByD8'
    + 'VAuP+/8cNeGYBrj+0PST137tDvmKD4AEFQyOATr/k/cdAOj90A8/8Fkiyf/p97sA8AcO7gEY6gQO9tsEFQSU/BoDLC8g6jz9'
    + 'Ewac+v8C5fekDEPtzuqqDXMB8vJ9G031kijr9QQZOO2h6UbetQhj96L2aBE8BSUE4PClHr/evA76+CkKbg15JBcFq/1QB4wA'
    + 'xAPT/mwH0hzgCXL+hvpj8XQBDQleIUHtvgIRB+sANwQmAuv3E/wKBvj3cN1dBO/8t/YT8KX9GTBL8a76fgJI65ULSNtI/LUO'
    + 'zNms7XQLP+RRAlb51uyR/nUOY/2p5I/wLRNj8sj97PIh0xL0mQHq9AX2EAG18gfsyO432vX5eOaT8h/3x9f7xAITWcRh9RP4'
    + 'ZesUAx/jVMy0BkDmaN752wT5Jt6C6q3oz+o4ye7edcxS58vbe/KQ3vD1VMuP4V/w8u3d2MT/xdgrzn3m6+yf3gTajPE213HP'
    + 'cu/DxjnfPdyZ0d3jTgEmy9X44sitwfjnuMl11oLww8kg33f5mABo2zHv4/6o6CrqBM9k8Hvrs+dzyYe5X/oo2FDpAO1h0cz3'
    + 'VPBqz6oLZ/LU3B7fjOvS+v3YW/cP45kHAsVZDw/iFwVR418OOgV5+FnBZDfL3rjqWf2b+fjgwBYe414VY9e2EW3WzRZrxuTi'
    + 'O95NK3nYAgqw7l4np95I6cHlzBaO5yoIj/BGH8jodhsJ4HkdRvf0AmALQxf/+scVdO6oIzT5+C0X1nse7vuVA3/44B7k77dP'
    + '3PSIPd38veQAGa0fYBywMHv3XRu1AB8WnALlGbccryl2Ec0IxhG9NXgbiR00B1QMly24M9EU4/+zBYwSnRLCEVEvlUXOEH4O'
    + 'vSuR8awOOw/ADIkicyglKPsLJUSwLJ4yPCRWGmwNuwT4HFQ0NBQbDWwlqga4Qm4KAhh6+Sgpvwd1H1QLVx//HJUbmAY+DtD0'
    + 'iCR+7WAYig9RDBUMMTA6/14eHQCiF9APuDRZIv736fclMvAHtggBGKEcDva9DBUEngUaAxwvIOqIOBMGZhD/AhAapAztE87q'
    + 'rjJzASbpfRtVF5IolQEEGe7hoenEBrUIoi+i9nz/PAX7GeDw4CC/3jQJ+vjzCm4Nh+cXBbL5UAemF8QDAgdsBysM4AkmB4b6'
    + 'cS10AWz7XiFWIb4CGgXrAB4iJgKp6hP84wT496n5XQRsA7f2lhel/XUHS/EiF34CVfOVC1PwSPwIAMzZ7f50Cxr8UQKD7dbs'
    + 'JRZ1Dr34qeR2Gi0T4v/I/egLIdNDCpkBUPAF9tIGtfJLJMjuzQT1+RwRk/JEDcfXEAYCE9oDYfWvCmXryA4f4wDntAYVBWje'
    + '8/wE+QH5guqrGM/qavLu3tvlUufjDnvyC+Xw9Uvbj+FcEPLt/gHE/5QHK84K9uvs9eME2kfnNtf993Lvt+Q539wBmdHb8k4B'
    + 'bv7V+ED9rcHxALjJYQKC8NfxIN8D+5gAOvsx727IqOhXAQTPM/d76yH+c8mN2l/65+tQ6XrcYdEK/lTw1tSqC+Tc1Nxy94zr'
    + 'wOD92EjaD+PV+wLFw/sP4rb2UeNJ+DoFReNZwQjjy94C2ln9nej44PHaHuMe3GPX6O5t1lf5a8Ym6jve3gN52LXUsO4zv6fe'
    + 'vO7B5bjSjufp24/w2L/I6CLQCeDoxEb3A9lgC/LZ//pE43TuGPk0+fTuF9ZqxO77pO5/+PPl5O+w4tz0z+Td/NbpABnt2WAc'
    + 'WuR799j+tQCV3JwCkde3HMfqdhH818YRJc54GyfpNAfwC5ctgvHRFPD2swU+zZ0SoP5RL6b5zhD57L0rPf6sDpD/wAwj6nMo'
    + 'ngX7C0gXsCw5/jwkz/NsDS4C+BzsFjQUmPFsJbMUuEK0/gIYQBEoKZYDdR/eBFcfHi2VG7r3Pg48HIgknDRgGDwiUQy6/TEw'
    + 'qP9eHngKohdMHLg0ZR7+90UDJTJnC7YILw2hHH8ZvQxQQp4FcQwcLwAMiDhnCWYQjSoQGiEe7RNVDq4yTBgm6U4QVRdyJJUB'
    + 't1Du4dUoxAaYHKIvoxF8/6cE+xnWKuAgWSk0CYgT8wosMofnaBuy+cIophcuHwIHqhUrDHgGJge5FHEtQyZs+10MViEfHRoF'
    + 'AAAeIrchqeorGOMEK/up+W8MbAP/IJYXefd1Bxj6IhfPC1Xz0jNT8PD+CADHE+3+nQ4a/BX+g+0/CyUWOv+9+DEAdhpc5+L/'
    + 'DgXoC5AVQwpiBVDw+xfSBgMOSySuAc0EtvYcEe34RA1T5hAGR/zaA58DrwppIMgOMQoA5zLwFQVj5fP8EfwB+cwOqxib+2ry'
    + 'pgnb5Tz84w7UDAvlBeJL20MdXBAM6/4BWQ6UB7P6Cvap/fXja/tH560E/fd9CLfkrRPcATYa2/JjBm7+/R9A/RYC8QBQFGEC'
    + 'WgjX8Uv2A/vFAzr7rgluyL3/VwHeBzP3HRAh/pH/jdp7yefrnB563On5Cv7x79bUGOrk3E34cvfD88DgJfBI2rnw1fubBsP7'
    + 'xyG29uwKSfjrD0Xjp/MI4+j7AtorAZ3odOzx2grwHtzjBujudApX+c/2Juq73t4Dee611ITYM7+Y87zuC/a40nrr6dsI9Ni/'
    + 'X/Yi0Ivy6MTQ1gPZZ+fy2cHyRONrBxj5iOT07t7yasQb+KTukuPz5Zf7sOLi+8/kgf7W6ezs7dlRD1rkENjY/vIJldyV8JHX'
    + 'tvrH6trb/Nf88CXOePsn6RnN8Av83YLxm7nw9rTdPs0V0qD+PN2m+SkX+exNAT3+rseQ/7/sI+q08Z4FZN1IF37nOf756c/z'
    + '8cwuAozT7BaE6pjxHeqzFEfctP7B20ARyOmWA9b83gRg7B4txwy694zjPBws9Zw0f+w8Iiv/uv1756j/lRp4Cr7ZTBynGWUe'
    + 'Xv1FA1oHZws0Fy8N/Q9/GW70UEJPDnEMCCcADBX2ZwmaLo0qVhAhHsgCVQ7G+0wYawlOEBLrciSRCLdQoAzVKAL/mByHIaMR'
    + '+hCnBG4K1iojEVkpjh6IE1AaLDICDWgb6xzCKGwaLh8vB6oVWBd4Br4nuRQUKEMm0hldDLoqHx25DAAAfg23IWAaKxhlOiv7'
    + 'BiJvDPUZ/yARO3n3chkY+kBHzwvRFNIzVAvw/lsaxxNkGJ0OsQ0V/l5LPwsaITr/ICMxAI8RXOe9Dg4FPyuQFTb5YgUjAvsX'
    + 'qBEDDvctrgGnDbb2NBvt+EATU+Z+KUf8G/SfA4MdaSCYCzEKMh8y8I7+Y+UQDRH86QnMDrL4m/vT8qYJyf48/PQK1AwS+gXi'
    + 'HwFDHR/kDOsM/1kOyxez+mcRqf1tAmv76getBOzzfQgVIK0TuSc2GrgEYwZ8MP0frvQWAgTqUBSc81oITvxL9iMqxQPX+q4J'
    + 'MvC9/2Xv3gddFB0QuBGR/8D2e8l83ZweE+vp+d4e8e8oDBjq5ABN+LQhw/NmIyXwRP+58K7/mwaD9cch/frsCkHl6w8/5afz'
    + 'F+Ho+xEUKwEY5HTszyMK8C/z4wbrH3QKvfnP9uPju953F3nuexmE2HzvmPO2+Qv2F+966xP9CPTtAF/2S/iL8lrd0NZm82fn'
    + 'PwrB8kT5aweh9ojkLeve8m3wG/hlFJLjn+WX+6cG4vvG+YH+pPzs7DfqUQ9X8BDY0fXyCbHrlfBJ+rb6ufva2+UZ/PDC9nj7'
    + 'Q84ZzQAF/N1m65u5lBK03eoHFdJR4zzdo/gpF//fTQHz6a7HTfW/7Gf8tPGy92TdIuh+5+8S+enN3vHMuseM05zKhOo7/h3q'
    + 't+FH3IPlwdtw2MjptNnW/F7TYOzW6ccMY9+M49/oLPUW53/sR9kr/7XGe+dFxZUa8he+2Uf8pxke+l79LtZaB/viNBej1P0P'
    + 'R8xu9PvZTw46/QgnQ/UV9nrVmi4y4lYQVfbIApLfxvtf7GsJTvMS60n0kQgL86AM9uMC/x/nhyH63foQqNduCh3zIxFOBY4e'
    + 'O99QGnj+Ag0sCescg9tsGjf5Lwc4HVgXDgu+JwLhFCgBENIZOfi6KpcTuQw5/H4NIAlgGtcBZTr1DAYiEQT1GZMLETvC+3IZ'
    + '8hpAR3sW0RRy91QLbSdbGnkTZBiLGrENTyZeS1ofGiE0LyAjxRWPEU0uvQ6RHj8rCSY2+askIwIfNKgRKiv3LZIWpw0+EzQb'
    + 'Bh5AE2ERfiktDBv02/iDHSQDmAtgQjIfyhKO/mpAEA0wJekJsByy+D8C0/K/HMn+Cz70Cng3EvrbHx8BtAUf5HIIDP+ZCcsX'
    + 'Ai9nEY40bQIJGuoHRhDs85YwFSB7ArknDxS4BIsafDDuAa70HAUE6tYCnPMUKE78HDAjKg0P1/pZBzLwlQBl74cKXRTd/7gR'
    + 'MAfA9o8PfN0zABPrWwPeHsMCKAzD/+QA8fy0IeARZiMT5ET/VR+u/yYFg/UwDf361g5B5eD0P+Xb8BfhdO4RFDb8GOTeDM8j'
    + 'xPUv890K6x+c1b354vjj44EUdxeR/HsZyfB879nztvmNyRfvi+0T/XwS7QBK9Uv4dfda3TrWZvPO4j8KLRVE+QsLofb/6C3r'
    + '9fRt8L//ZRQD65/lqtynBpT9xvmiCqT8+go36gIQV/C35NH1WgGx63X7SfqS/rn7NvzlGQ30wvbjyUPODRQABfoEZutk5JQS'
    + '4gbqByT2UeM99qP4le//31MG8+kL7k31OOhn/EYPsvdc9yLoR/fvEokFzd6p7LrHe++cynv8O/7h2rfhZ/mD5TrncNgEA7TZ'
    + 'r/xe03n51umx1GPfhu7f6JLaFufw7UfZmsS1xnrRRcUSAfIXqfFH/PzjHvpQ2S7WZdX74mjro9QB4UfM0QH72WniOv0U5kP1'
    + 'y8t61XPdMuJ15lX2OtyS38zZX+zS507zjvxJ9ADkC/OA9fbjFuwf5zL0+t0m1qjXU90d84DdTgXv6jvfh+94/gLkLAmw8YPb'
    + 'n9g3+cbyOB2m9Q4LSvAC4V7nARBh8jn4wdaXE/jqOfy47SAJ4NHXAdry9Qx41REEJuWTC6Duwvs/4vIa7PF7Fvfycven5G0n'
    + 'mP55E3joixreH08m9/ZaH7HlNC+A6sUVrxFNLrT3kR5d6AkmDxGrJCn8HzSLECorBheSFtQMPhO/MwYeb+xhEdr9LQwmCdv4'
    + '6zYkAwwwYEJTKMoSywRqQAcIMCV9BrAcXQg/AokxvxzfEws+HBd4N5Qn2x9h/bQFXBxyCMEImQl+FwIv4BKONG4SCRoLIkYQ'
    + 'SyKWMMgaewJhJQ8UrQ+LGgwr7gFoGxwFdRbWAtoQFChpGhwwWj8ND/8cWQecCZUAhC2HCpMU3f9dITAHKBGPD8ExMwAvEFsD'
    + 'fzLDArwGw/9NE/H8TjDgEdgZE+QDPlUfgBAmBeYYMA0CNdYOCfjg9Pv02/DmAnTuSh42/NXy3gy7GMT1oRbdCugvnNULHuL4'
    + 'PxGBFOshkfy6EsnwbADZ86vzjckP/YvtqgV8EskISvWf33X3pgA61nIEzuIHDS0Veh8LC7wF/+gc8vX0yuG//2ANA+vG8arc'
    + '7g+U/fwYogoz5foKywkCEJcWt+SrEVoB+dp1+6/wkv4q6Tb8vQgN9M4G48lS0A0UV/r6BK0NZORNAuIGVgIk9nb5PfZj7ZXv'
    + 'tv9TBv8AC+7uCjjobAxGD80BXPeDE0f31/mJBSrnqezICHvvowJ7/BcJ4do96mf5lx8655kMBAMD+6/8ie95+YcSsdQ57Ibu'
    + 'wCaS2jr08O2vHJrEC/t60X4ZEgGd8KnxUv38440KUNmIB2XVoQ5o603yAeGr+9EBUg9p4ofsFOYeAsvLj/Nz3Tb6deZO9zrc'
    + 'ROfM2aXv0ufg9Y78s/AA5A0NgPVcAhbs7PQy9K3hJta731PdoQ+A3b7a7+p47Yfv7fAC5GDksPGG15/YhdrG8undpvVV2krw'
    + 'H/1e5ynlYfKQ28HW9eX46i7vuO0L3eDRTPLa8g7MeNU69iblY+Gg7njgP+IR1ezxpcv38vXDp+Sx05j+Q+t46HTQ3h9yxvf2'
    + '19Gx5UzbgOpj3K8RoOC091z1Xei6+Q8RiQcp/CvJixBU1wYXM/PUDBfgvzPo92/slO3a/X8GJglQ/us20P8MMHbnUygx7ssE'
    + '5usHCGfYfQZ6DV0ISAKJMczw3xPjDhwXy+6UJ1XbYf03DlwcFOjBCGP8fhfhBOASgwluEg4TCyLqD0si3hDIGhj7YSVZD60P'
    + 'kvEMKyQoaBsd9nUWvQnaEC36aRqeBVo/sxP/HHQLnAmJKYQtsRqTFLsPXSFfFigRri7BMRsqLxBnB38yBhC8BqYkTRMaI04w'
    + 'TAvYGd4qAz7YDoAQHDXmGO8nAjVZCwn43hX79JkV5gLHIUoeYhvV8vEKuxhsBqEWvyfoL94iCx5bHz8RxSHrIegRuhI/H2wA'
    + 'Wker8ykvD/05FaoFeBDJCGHnn997KqYA0yRyBAoNBw3j/Hof0AC8BZIbHPJ9EcrhFx5gDcMSxvESIe4P4hX8GO0cM+W16csJ'
    + 'm/eXFsMFqxHWHfna1Sqv8MYGKulL/r0IYebOBkAWUtAv/Vf6/jitDZ/4TQIKKVYCFRF2+e/xY+0lB7b/9w//AF3+7gpGEGwM'
    + 'iA/NAWoLgxORANf5Xewq5wr/yAgxA6MCtN8XCcUCPeoW/pcfW+mZDOL5A/s2+onvxCCHElsDOexqEcAmnP069HXfrxxOCwv7'
    + 'gPR+GSD6nfDf7VL9TQGNCnASiAc8EKEOiBtN8gYeq/s73VIP6euH7F/hHgJKC4/zhPQ2+vr3TveY/ETnygal75vm4PVa6rPw'
    + 'z/8NDSgUXALo/uz0fPGt4efZu9/FDqEPbfG+2vXpeO3G3+3wCeRg5LnrhteQ94XaWubp3af9VdqZ9R/9PR8p5TrbkNt7+vXl'
    + '8fku74XkC90D90zyvgEOzGD1OvaVCmPhtMx44LXiEdWECaXL/v71w7/3sdO4AkPr7Mt00Hz5csY6/dfR5d5M21cWY9zn66Dg'
    + 'P8Jc9Yrtuvn72YkHivkryVXuVNcg2jPzev0X4FPz6Peh1JTtwt9/BtLqUP5x29D/sNt259ThMe7Xzubr0rpn2Arleg0Fv0gC'
    + 'JdDM8AXD4w5excvuHelV22neNw493hToscxj/InY4QTN6oMJMOQOE+Pz6g8l994QQ+MY++nIWQ+c3JLx6ugkKHLeHfbe2r0J'
    + 'Qe8t+sMYngVK6LMT5vF0C/LciSnpCbEaDQW7D1QFXxY/EK4uSfMbKuv2Zwe4GgYQ4wmmJNXaGiPnCUwLxfneKnoU2A6gDRw1'
    + 'hervJzAOWQuhDt4VoxKZFZ8XxyGgKGIbghfxCh4SbAZ6Jr8nRTreIs0kWx/QGcUhrR7oEaIcPx9+GVpH1j4pLxAOORUmL3gQ'
    + 'Bhph55YDeyoRGtMkbhQKDewn4/z7H9AAUQ2SG9w3fRGCMRce/DnDEg8jEiFbHuIVxyrtHNQUtemXIJv3FxvDBegE1h10H9Uq'
    + 'VxXGBjEYS/7sIWHmvDBAFhoML/0dFP44IQyf+EgKCimBDRURdhPv8egfJQeRGvcPXQJd/lopRhCMIogPYwJqC4YlkQBvFV3s'
    + 'XQwK/zUUMQPXDLTfpxXFAsEOFv4LBVvpp+fi+RkSNvoWAsQg2RRbAyAPahFoAJz99BZ1330ITgs0B4D0jAEg+tkf3+3R9k0B'
    + '+fxwEhbtPBDtDYgbcvcGHgj5O9329+nrhAFf4RrrSgsm2oT0pwf69xPcmPwiDsoG+Bmb5tH8WuqFFc//KP8oFJga6P7p93zx'
    + 'udfn2V/+xQ6fHG3x4wj16T33xt+RBQnkfBC567v+kPeRLFrmlPen/UYRmfVBDT0fn/Q620f5e/qZEfH51gKF5AsGA/eu5L4B'
    + 'OAtg9d8ElQrL/rTMwgW14o74hAk49f7+1Pq/98P2uAL2IuzLMA18+RbtOv08H+XeJvVXFmf85+tzCj/CktmK7R/2+9nM74r5'
    + 'NvxV7kX+INr/9Xr9cvRT86gHodT/+cLfyvTS6rz1cdtFEbDbbfTU4f7n186pz9K6xNYK5SXmBb9M6yXQ6OIFw0rxXsX74B3p'
    + 'Vtpp3jHzPd4e/7HMvtSJ2LTqzeroxTDkeszj87raJfcX90PjadbpyEnVnNwl4+roxOJy3p/U3trZAkHv1NzDGATjSuhC2ubx'
    + 'Vujy3LD16Qn2/A0FadRUBd/zPxDo6knzYPLr9ujguBrK3+MJKfPV2hb05wkB/8X51Oh6FIPkoA3yvYXqF80wDnfioQ6p16MS'
    + '1fifF2XWoCgh5YIXBuceEjUEeiYr50U6SPrNJF/30BmhBK0eLgWiHNz3fhmF3dY+h/cQDpb8Ji84AwYaoPOWA5EUERo7A24U'
    + 'IPXsJ1z++x/AJ1ENFBTcN/EbgjFt+vw5tQEPIzADWx76EscqRQ7UFDwKlyCFDRcbewfoBNYSdB95KVcVmP4xGJMe7CGzMLww'
    + 'ZxcaDGASHRRQKyEMEgxICqscgQ0tDHYTvv7oH8IbkRqACV0CmR5aKYsxjCL1PWMCmyCGJQAwbxWNJV0MVxg1FGr+1wxVOacV'
    + 'YwzBDog0CwX8JafnRwwZEjMhFgL0PtkUYDQgD5YRaACRDfQWXRp9CC0VNAcgK4wBpyLZH1X50fZMHPn80RAW7YwT7Q0xFnL3'
    + 'HiUI+Y4g9vftAoQBjQ0a6zIGJtrT8KcHIgoT3M0pIg7X7fgZHQnR/NAHhRXIDCj/R/eYGubu6fcD77nXaRtf/l30nxzT++MI'
    + 'jyY99+X2kQVQCHwQ3RO7/qsSkSxT65T3RPVGEdcFQQ2WIJ/0svNH+fP3mRHxBtYCIQoLBgcLruSe8TgLx/bfBCYDy/6BFMIF'
    + 'nvuO+Dv/OPWg7tT6lh7D9k8C9iKxETANZQAW7WQBPB8x5yb1ftxn/PUUcwqSAZLZwgMf9rHrzO918Tb8CBJF/kId//Ug9nL0'
    + 'fQuoB3MD//k4/sr0wB689XH4RRFNFG303gX+5wn/qc++FcTWhwMl5sr8TOvTFOjiQhJK8QYR++BcvFbabAMx8xr/Hv9v+r7U'
    + 'eQS06g3+6MVFBHrM7vO62mMQF/e9A2nWDf9J1XH9JeOUB8TigASf1Ojw2QJCAtTc6PME484PQtpkAVboDuSw9fsT9vzuyWnU'
    + 'Sfbf82vf6OoiCWDybO3o4Frbyt9I4ynzJ9sW9CzhAf8d4NTogNiD5L3o8r0s6hfNxtJ34mTHqddw59X4t+pl1qvtIeV26gbn'
    + 'Gfs1BHnxK+cfDUj6CRRf9wvEoQTuvC4FL+Hc99zphd2g4If32O2W/ELeOAPM16Dz3tqRFCjhOwMM8yD17t1c/gXiwCcO8RQU'
    + 'XOXxGwP8bfqV27UBItkwAwHy+hLc9EUOPuE8CtsGhQ3AEXsHKOnWElQNeSkpz5j+dAmTHifrszDHCmcXdOxgEqT8UCv78RIM'
    + 'Tf2rHGQgLQwTAr7+AyjCG4MAgAnRIJkeGO+LMYIG9T3QA5sgOScAMFwSjSVb7lcYYfxq/ngCVTmSI2MMkiKINIAR/CVwDkcM'
    + 'IyQzIcIG9D6eIWA0/iCWERcXkQ3BIl0afB4tFXolICvoB6ciOChV+UgvTBz3I9EQvCiMEzMdMRalLR4lGSCOICcM7QI9LI0N'
    + '2gMyBvoi0/C+FyIKVBbNKQ4g1+0oER0JoCTQB5wcyAz5EEf3UTDm7hcdA+9XI2kbcS9d9GUu0/stII8m7RDl9qr9UAiPF90T'
    + 'NSWrEjsYU+tE2UT15B7XBQMfliD9CbLzLx7z928X8QYgASEKQCAHC/j1nvHtCMf2hQYmA9r6gRSNDJ77Rxw7/5QaoO5hEZYe'
    + 'R+lPApPusRGIBmUAvwJkAbT6Med1IX7csgP1FHAKkgFcEcID1wGx6+sqdfEa8QgSWPZCHa7wIPZeGX0L2gxzA9P2OP6N8cAe'
    + 'JhZx+HUFTRSKFt4Fm/4J//MHvhWOBIcDkPXK/HL90xSW7EIS/QcGEWoMXLw4EGwDBwsa/yv+b/qRGXkE4g4N/v4WRQQJGO7z'
    + 'Zf5jELsGvQP9DA3/p+1x/e/tlAcG64AEQv7o8G76QgJR6Ojz2QHOD5z9ZAEUEg7kPx/7E5cF7sl38kn22gdr3wj9Igl6+Gzt'
    + '2e1a27zzSOPI9yfbFgcs4akBHeBOFoDY5QK96Bj+LOp38cbSzuRkx5XrcOek6Lfqm8mr7e7hdupnCxn7hfZ58Y7pHw099QkU'
    + 'Oc4LxJfx7rzaAC/hU+nc6bjNoODn4tjtiP1C3jXszNdH0N7a4Qwo4YXRDPM84e7dvtMF4i/TDvEa3FzlPO0D/GP3ldvZ2yLZ'
    + 'atEB8jvp3PR76T7h/OTbBnTlwBEi3yjpkOJUDSDeKc+I8nQJegUn66Hkxwr54XTso+ak/FnY+/Ho7039SutkIAzeEwIr9AMo'
    + 'teaDAJjX0SDi7RjvBO2CBr/50APC+DkntepcEgvmW+7v7mH8DvZ4AlL5kiO895Iiy/KAEcQFcA4+7CMkmiDCBmQGniFk6f4g'
    + 'FQAXFxQLwSKB+nwejOl6JW3y6AdvDTgo5+lIL0/w9yPMEbwo/gYzHcgApS1oBRkgCPcnDNsXPSxTBNoD7An6IlQZvhe+EFQW'
    + 'nQoOIPX2KBHkHaAkKhqcHGwR+RDZCVEwfhsXHbEjVyMkHnEveTdlLu0oLSBEHO0QNiqq/WQfjxeLHzUlzzM7GJcQRNlrH+Qe'
    + 'IDIDH9kj/QnFGC8eCgNvF7D5IAE1P0AgZCL49ZgT7QgZIoUGtQza+gYWjQyZC0ccWAOUGon3YRHz/kfpPyiT7jUHiAbUHr8C'
    + 'xCS0+tMUdSHoDrID9hRwCkILXBFiJNcBSy7rKpAmGvHo61j2iwau8MMMXhlIE9oMU+/T9kLujfFhHiYWsv91BRLwihaC9Zv+'
    + 'xAzzB6v4jgQXCZD18fRy/R3oluxZGv0HaQlqDDr9OBDM+QcLNxkr/t4KkRlwE+IOcvf+FlgBCRjABmX+Ufe7Bm/+/Qx+9qft'
    + 'HQbv7YLqBuvACEL+igRu+lD8UejDBtkBxPmc/e30FBJkCD8fJQmXBbn3d/Ju9toHEf0I/UD3eviFGNntRwW884UAyPdx8RYH'
    + 'MgypAaf2ThYD9uUCxQwY/pgGd/Fj2M7kx/2V6zMCpOio+pvJewLu4dviZwtY0oX2t++O6YEDPfU7yznO4vCX8Unf2gCs+VPp'
    + 'URy4zST55+Je+oj96Ag17Ef7R9Dk9uEMcAiF0YEAPOHg/L7TVPUv00PxGtybBDzt1O9j9/oH2dvY4mrRgQk76VP5e+mB4fzk'
    + 'KPh05dDkIt/R7pDiqOUg3mrqiPKm+noFEPOh5BHY+eEp2KPmq+xZ2Azt6O8e3Errcv8M3mXyK/Te2rXmutiY1wng4u3e3QTt'
    + 'p/a/+evxwvh34rXqYOwL5m7u7+4W4g72budS+WfqvPe06MvypdTEBWHWPuzA3JogXtZkBoXKZOkK7RUAQ+gUCwbOgfoO4Izp'
    + 'nOFt8iTobw3d1OfpZNFP8AfwzBFo0P4GEubIAKrlaAUB6gj3JPHbF7MHUwRB1uwJ0v5UGXDKvhC7CZ0Kq9T19hkd5B3E8Soa'
    + '3g1sERgM2QmD9X4bP/ixIzXyJB52DXk3z/vtKA/3RBwKDjYq0vhkH0oDix+lC88zNQGXEP4Eax9vJiAyPQzZIxMLxRg/DwoD'
    + 'aRqw+QcENT8/HGQimBqYE0T7GSLeNLUMezAGFowNmQs5CVgDRh+J98QF8/5wMj8o+hU1B3I31B4qEcQkuRzTFMAy6A7MGfYU'
    + 'TiNCC04wYiQ+FksuAwuQJsIH6OvLJ4sGdCTDDMAuSBNKGVPvmwZC7pX3YR5wSbL/7SMS8CgdgvW+HsQMFAOr+GYMFwmuM/H0'
    + 'ySEd6JAKWRpvAmkJzgw6/RsPzPmDMzcZXg/eCrb+cBOmD3L32hNYAaP6wAZGFFH3HiBv/mgOfvbX/h0GPQKC6qfvwAjiBooE'
    + 'IQ1Q/Gb5wwZXJcT5mxLt9EjpZAj/6CUJ0/S594McbvZDERH9UBxA930ChRih/kcF7+2FALYGcfHU/TIM9Pyn9tcZA/Y4/sUM'
    + '8hSYBu7mY9gDKsf90vkzArsKqPowDXsCwffb4m4MWNJEDbfvbfSBA6n0O8txAOLw/f1J378VrPn8ClEc7v4k+aAJXvoS4OgI'
    + 'm/ZH+9YE5PbeEXAIigOBAE4X4PwMDlT1xPhD8TH+mwS7BtTvNvn6ByQY2OKd7oEJxwRT+ScLgeF8+ij4sPbQ5KT90e44C6jl'
    + 'TvZq6v3spvpQDxDzEwMR2BkMKdiqB6vsVR0M7Q0MHtyf7nL/pgBl8t7v3trD8LrYA+EJ4N7x3t0T/qf2s/Pr8bPid+I522Ds'
    + 'NxNu7mf2FuKN427nx/Zn6uYQtOh+96XUWMFh1oAVwNxIzl7WH+eFys7XCu0l3UPoX+wGztDGDuAJ5ZzhrPck6OzX3dTDzmTR'
    + 'ueEH8BXeaNCW2RLm5M+q5SrqAeoF6yTx0tCzB8TSQdY249L+7tFwyr3juwnj96vUJeAZHVDOxPGV594N/t4YDMjfg/X36T/4'
    + '0u018irkdg1K48/7FgUP92T4Cg5989L4bOlKA6XYpQvf+jUBmuz+BHjibybT6D0Mw94TC4X/Pw/6+mkaf/QHBF3yPxzU6Zga'
    + 'sdRE+07h3jQ17XswXOyMDUIAOQnlCUYfzPzEBTsWcDKq9foVQAFyNxMEKhFZF7kcfgnAMmMLzBkH8U4jLf5OMJMePhak7gML'
    + 'ESXCBzsZyycVB3Qk8wbALnUyShkCLJsGQhWV9ywacEn2Du0j8RsoHS0Qvh4mGhQDIjhmDCYbrjPnDMkhbgiQCgIgbwKQEs4M'
    + 'diIbD7YFgzOtKV4PmA62/sMfpg+9GdoTgjmj+lchRhSaPB4g1SZoDuIz1/4lGj0CRyKn704v4gbkKSENgCNm+Y8VVyWCF5sS'
    + '4SpI6V0t/+iSDtP0cQuDHCUIQxEoIlAcEgZ9AkAgof4rG+/taAm2Bikp1P10+fT83yjXGUETOP5i7fIUOCXu5ssaAypOBNL5'
    + 'Nfu7ChPxMA3pLcH3jvluDJbzRA2SCm30duyp9Pz1cQDuE/39Kwu/FYH9/ApCA+7+sPugCSQBEuDz9Zv2ZvjWBJ333hGN9YoD'
    + 'nxBOFy0MDA628cT4g+0x/mT9uwb6IDb5yu8kGBz9ne7wAMcE5P0nC4P4fPprEbD2qAak/b8MOAvbCE72nw397FgYUA+EFBMD'
    + '6SMZDOoSqgfq9VUdWQ0NDEsLn+76HaYAh/He7wcJw/Dx9QPhTAje8Q39E/6qB7Pzeeqz4kUMOdsTAzcTDwJn9oQdjeNe+cf2'
    + 'OwTmEDEAfvdYAVjBFyCAFXn+SM5Q9B/nURnO10r3Jd3H4l/seu/QxhTnCeXr3az3U/Ps1x33w86XCbnhWwAV3t/+ltlf5+TP'
    + '3AEq6ssIBeuh+NLQMfjE0mjdNuMiAO7RZwq94yPz4/ct5CXg8elQzhzllecu5f7e0vPI31rt9+ms99LtMe0q5IHZSuNf3hYF'
    + 'v9xk+OLhffOr/2zpkQGl2Orv3/pz5JrsWc144j3l0+h21cPeUPqF/4jI+vrp5n/0kNNd8tHg1Ok767HU0PBO4W7gNe1I7Vzs'
    + '0NdCAB3m5Qkq8sz8cOg7FtnbqvVY4EAB4vQTBGzVWReI2H4JGfFjCyTiB/Go0y3+oP+THkfbpO456hElB+U7GTfrFQeN4/MG'
    + 'WP11Mn/1Aiw/BEIVWO0sGrUY9g5+3PEb4OItEGIXJhpcBSI42wQmG8EH5wxpC24IyAgCIPb2kBKwE3YiwRK2BewfrSl4JpgO'
    + '+xHDH5H7vRmsKoI5YQFXIVEXmjxxD9Um8g3iM0YhJRplGkcifR9OLykM5CnTFoAjkQ6PFQUYghfwGeEqfThdLfwYkg4M/XEL'
    + 'IDMlCBMlKCKHHBIGGBhAIH4QKxuJPGgJ1h8pKY4EdPnqI98oIjFBE+8gYu2OEDgl3g7LGpsPTgRKNDX7jxsT8ZMC6S1jIY75'
    + 'Eh2W83ATkgoOCnbsqwj89Z8o7hMTGysLyR2B/WcZQgPRGbD73AwkAfsP8/XwI2b42Sad9+f9jfVsDJ8QdRstDG0qtvELKIPt'
    + 'CgBk/age+iBdC8rviRkc/d8U8AD39OT9xg+D+P4VaxHBBagGrgG/DPjs2wicDp8N3QZYGDT1hBTH/ekjnwTqEmj56vWMAVkN'
    + 'peZLC1YV+h3aAIfxt+8HCeba8fWbD0wIVAgN/fMCqgfCDHnqqAxFDIYCEwO3+w8CQPmEHfcFXvnIFDsEH/4xABgWWAF1BRcg'
    + 'pQV5/l4kUPQPGVEZhxlK9yH0x+JwIXrvFv8U5/D8693A31PzXgUd9w3wlwmXBlsA0e7f/oAbX+eSCNwBlSLLCIPwofg4FzH4'
    + 'W+Ro3YICIgCO9WcKB/gj86j2LeRF8PHpp+oc5Y/2LuWF/tLz0w1a7SsArPe+DDHtNeSB2VnzX97wA7/csf3i4cnqq/8fBZEB'
    + 'PO7q77npc+T7+1nN5PM95RDrdtWw6VD6FeGIyF7q6eYJAJDTQvLR4CT8O+uX9NDwt+Ju4DvSSO1H3NDXTt8d5lbdKvKe9nDo'
    + 'tPXZ260HWOAr2uL0FP1s1V78iNhW4BnxcOok4oH1qNOC4aD/999H20DYOerovQflR+I362LWjePM0Fj9Tud/9SnLPwQ47Vjt'
    + 'iui1GHvbftza4ODiRtBiF+PtXAXt5dsEnefBB9vraQtb28gI8s729vz0sBPV8cESYuDsH5PveCZh/fsRsfyR+0XkrCqZ12EB'
    + 'bNtRF9DrcQ/GB/INQehGIaPrZRrB7H0ffO8pDMX40xY555EOMwwFGEf78BkoJH045e78GNwZDP1mGCAz4P4TJZ4Ahxw2+hgY'
    + '2Pt+EOgKiTyiDNYfsfWOBGox6iN2DCIxmRLvIHQJjhADEN4Oxg+bDyoWSjQDF48bPySTAoAcYyF9JBIdlRpwE+keDgp/GKsI'
    + 'tiufKA0iExtRG8kdRBtnGcUc0RkeH9wMAx77D58W8CN7KtkmbCvn/aY5bAzSFXUbnihtKt4BCyh/KgoA+QeoHp8OXQvVIYkZ'
    + 'EhPfFHgQ9/T1E8YPdiX+FfMLwQVdGK4BxxL47OcjnA6HI90Gpvo09dAkx/0+C58EBRdo+ZsEjAFHF6Xm7jZWFd8R2gA8CLfv'
    + 'wQrm2nL3mw8cIlQIUxDzAjL7wgzg+qgMeAmGAmAWt/uX9kD5oRf3BfwEyBTX9x/+HP4YFosedQVB76UFgvheJBwRDxmxBYcZ'
    + 'RfYh9AkQcCFkEBb/8AXw/Jz3wN+o+V4FgAQN8I7slwawE9HuGxmAGzP8kgjvBJUiOxGD8KgcOBe5FlvkxOWCAuv6jvUZBwf4'
    + 'Xfio9kgaRfASGKfqzfOP9pn9hf7z9NMNRP0rAOT8vgx6DjXkKPNZ84fZ8AOY6LH9KvHJ6rH2HwUuAzzuUfC56Uvu+/tg8uTz'
    + 'e+8Q66j3sOnV9hXhsgle6onwCQCh+ULyh/Yk/EEKl/SU+7fiBg070uTrR9zB+07fa/NW3TfpnvbM+bT12xOtB97sK9rv9hT9'
    + 'qORe/L3hVuDu6nDqJO+B9f3uguHS8Pff6dpA2DLp6L0I+UfinNxi1pbqzNBM807nf+Ipy0HyOO3P1Yronfh72wfw2uCb6kbQ'
    + 'nfnj7U7j7eVG3p3n+/rb6zIBW9sM2/LO/eL89Inz1fFh4mLg0+uT7x7uYf3e2bH8B+hF5HLhmddRz2zbgNLQ61/Xxges7kHo'
    + 'K++j6x7sweyu53zvfOfF+MLlOecF6DMMbelH+yXOKCTB1+Xu1tTcGQn1ZhjX/eD+OMaeACz+NvpI6dj76/foCnvxogxWALH1'
    + 'U+9qMU/ZdgwW7ZkShvd0CQzuAxBH/MYPAPMqFpvsAxfR5j8kg/KAHMn8fSRm3pUaSvHpHuPgfxi89rYr+xINImfxURu8DkQb'
    + '1C/FHMUcHh/OCgMe7BafFoz3eyrx9Wwr4Q6mOaUV0hUqIZ4o7wneAVgWfyr8FvkHzxOfDrgV1SE1CxIT0hx4EHIc9RPsE3Yl'
    + '7STzC+8qXRhnJscSrg3nI/QehyOFEKb6rx/QJDkRPguKMQUXcCqbBPUvRxd+Lu42CRvfEakYPAhROMEKGhxy91wKHCKyLFMQ'
    + 'oR8y+y4z4PonIHgJwhtgFtwxl/ZIBKEXmhH8BHoM1/eT+Bz+zySLHgwPQe+vI4L4SRscEaMdsQU0DUX2zgcJEHITZBC3HvAF'
    + 'oA+c9zMFqPkL/YAEuRCO7MIEsBP6ChsZswcz/N8D7wTjDTsR7hCoHNYkuRZwEsTl+R3r+gH6GQfs7V34iARIGroQEhjlDc3z'
    + '2hSZ/ZHd8/SOFET9vQbk/OXqeg64CyjzUgOH2SgGmOj1Dirxcgax9njqLgPF/VHwHehL7iYJYPIIFHvvce2o98L11fav8rIJ'
    + '+PiJ8KcFofk4+Yf2RglBCl8PlPv6DwYNp+/k60cUwfuHFWvz3RY36fn9zPle9dsTBvLe7Fjw7/aaAKjkzAy94XgT7upM+STv'
    + 'wP/97rT+0vDY9unargoy6REFCPmkAZzcjgSW6gcITPOUB3/iNPJB8hkLz9VZAZ343PYH8B4Am+o1AZ35ZQtO49XrRt68Dfv6'
    + 'JPoyAcPxDNud8P3iH+mJ85vdYeIDANPrLRIe7gHd3tng5QfoyP1y4VLxUc8//YDSwe5f1+jmrO4v6yvv9coe7Bfcrueg+Xzn'
    + 'T/zC5ZX+Bei7723pvsclzoXewdc9+tbU2/0J9WL51/2E4TjGXdEs/i7jSOl24+v3gPl78ajlVgA44lPvuuJP2TPnFu1J6ob3'
    + 'itYM7qHRR/zW9ADzMsmb7N340eaUxYPyDtnJ/O/vZt454krxlM/j4FvpvPa45PsSQ+Fn8Q7cvA5e5dQvRN7FHNwKzgoQ5ewW'
    + 'IuSM98Pi8fV0BeEOJtWlFU3zKiHj6+8JCtxYFiDm/Bbx988TPui4FfH5NQuoENIclftyHJPl7BPc7+0kgPnvKg76ZybfAq4N'
    + 'tgb0HrwchRAqBa8fD/Y5Ed8YijHoG3AqcQ71L+0Ifi7bFgkbJgypGM3yUTjmGRoc3R9cCvYosiy1CqEfmRkuM+waJyCJGcIb'
    + '3BrcMZMaSATfHZoROSZ6DMstk/jZEc8kyxoMD6MXryP1FUkbHwejHQkfNA3JJc4HwRxyE+oetx4RJaAPTzMzBcYYC/29DbkQ'
    + 'Eh3CBDc5+gr3DLMHpibfA38t4w03+u4QpSHWJNIjcBKiFvkdfhAB+pUQ7O2cE4gEOBO6ELQP5Q3+ENoUQSaR3ccCjhQ5+r0G'
    + '4yPl6uAOuAsrC1IDRQ4oBgAS9Q6UBnIGiBR46pD+xf04Bx3o5eomCcoaCBSfBnHtBxLC9YIOr/LbDvj4KQanBTQLOPky90YJ'
    + 'mfNfD2oC+g+X+afvWBdHFM4HhxW4990Wuv35/TADXvX//wbymARY8G8BmgBI7MwMMeF4E476TPnVB8D/gPq0/l8R2Pbr/q4K'
    + 'CBMRBRYQpAGoDo4EW+4HCOn/lAdAETTysAMZC84HWQEM7Nz2hRseAML0NQGY42ULN/vV6z7dvA3R8CT6DSXD8fz6nfD96x/p'
    + 'ygCb3YvzAwC4DC0SiPMB3QgE4OWb78j9ECVS8eAGP/1d/cHu//ro5vr2L+uw8/XK7/IX3NIVoPl89U/8eN6V/sDru+8nCb7H'
    + 'uPeF3s/4PfrQCtv9U+5i+cYBhOF67l3Rgf8u4+vwduND8oD5nQCo5cL+OOLd8Lriousz51UISeoJ+YrWKOqh0Yjl1vSb/DLJ'
    + 'vu7d+OTplMUB7Q7ZVu/v7+DoOeIM+pTPDvpb6eruuOQ0+kPhA+YO3BLvXuXs8kTei/LcCojwEOX66yLkbv7D4nHadAWU3ybV'
    + 'c95N8wjc4+vFxArclvQg5lbS8fdk4z7ozczx+QvqqBA71pX7hdGT5dDk3O972ID5xNoO+u/l3wJ877YGIdm8HGrXKgWo5g/2'
    + '3O7fGOz86Bvb2XEOnOXtCPL72xZsCCYMb9/N8knk5hl99d0fLen2KPPntQqb95kZkQvsGmLkiRm/Ddwax/GTGlsA3x2OEzkm'
    + 'GAPLLQ==',
  'coin-flip':
    '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',
  'campaign-log:add':
    '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',
};

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
const iconVariantSubscribers = new Set();
function subscribeIconVariantChange(handler){
  if(typeof handler !== 'function'){
    return () => {};
  }
  iconVariantSubscribers.add(handler);
  return () => {
    iconVariantSubscribers.delete(handler);
  };
}
function notifyIconVariantChange(variant){
  iconVariantSubscribers.forEach(fn => {
    try {
      fn(variant);
    } catch (err) {}
  });
}
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
  notifyIconVariantChange(variant);
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

const tickerDrawer = qs('[data-ticker-drawer]');
const tickerPanel = tickerDrawer ? tickerDrawer.querySelector('[data-ticker-panel]') : null;
const tickerToggle = tickerDrawer ? tickerDrawer.querySelector('[data-ticker-toggle]') : null;
if(tickerDrawer && tickerPanel && tickerToggle){
  const panelInner = tickerPanel.querySelector('.ticker-drawer__panel-inner');
  const toggleLabel = tickerToggle.querySelector('[data-ticker-toggle-label]');
  const toggleIcon = tickerToggle.querySelector('[data-ticker-icon]');
  const iconSources = {
    original: tickerToggle.getAttribute('data-open-icon'),
    inverted: tickerToggle.getAttribute('data-open-icon-inverted')
  };
  const sanitizePanelHeight = value => {
    if(typeof value === 'number' && Number.isFinite(value)){
      return value;
    }
    if(typeof value === 'string'){
      const parsed = Number.parseFloat(value);
      if(Number.isFinite(parsed)){
        return parsed;
      }
    }
    return 0;
  };
  const formatPanelHeight = value => `${Math.max(0, Math.round(sanitizePanelHeight(value)))}px`;
  const getClosedPanelHeight = () => {
    if(!tickerPanel){
      return 0;
    }
    if(typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'){
      const styles = window.getComputedStyle(tickerPanel);
      const borderWidth = Number.parseFloat(styles.getPropertyValue('border-top-width')) || 0;
      return Math.max(0, borderWidth);
    }
    const inlineBorder = Number.parseFloat(tickerPanel.style.borderTopWidth) || 0;
    return Math.max(0, inlineBorder);
  };
  const setPanelOffset = value => {
    const measuredHeight = typeof value === 'number' && Number.isFinite(value)
      ? value
      : tickerPanel.getBoundingClientRect().height;
    const fallbackHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight
      : getClosedPanelHeight();
    const nextHeight = Math.max(0, Math.round((fallbackHeight || 0)));
    tickerDrawer.style.setProperty('--ticker-panel-offset', `${nextHeight}px`);
  };
  const initializePanelObserver = () => {
    let resizeObserver = null;
    if(typeof ResizeObserver === 'function'){
      resizeObserver = new ResizeObserver(entries => {
        for(const entry of entries){
          if(entry?.target === tickerPanel){
            const entryHeight = entry?.contentRect?.height;
            setPanelOffset(typeof entryHeight === 'number' ? entryHeight : undefined);
          }
        }
      });
      resizeObserver.observe(tickerPanel);
      tickerDrawer._tickerPanelResizeObserver = resizeObserver;
    } else if(typeof window !== 'undefined'){
      const handleResize = () => setPanelOffset();
      window.addEventListener('resize', handleResize);
      tickerDrawer._tickerPanelResizeHandler = handleResize;
    }
    setPanelOffset();
  };
  initializePanelObserver();
  let isOpen = tickerDrawer.getAttribute('data-state') !== 'closed';
  let isAnimating = false;

  const resolveIconSource = variant => {
    if(!iconSources) return null;
    if(variant && iconSources[variant]) return iconSources[variant];
    const fallbackVariant = variant === 'original' ? 'inverted' : 'original';
    return iconSources[fallbackVariant] || iconSources.original || iconSources.inverted || null;
  };

  const applyTickerIconVariant = (variant = root.dataset.tabIconVariant || DEFAULT_TAB_ICON_VARIANT) => {
    if(!toggleIcon) return;
    const nextSrc = resolveIconSource(variant);
    if(nextSrc && toggleIcon.getAttribute('src') !== nextSrc){
      toggleIcon.setAttribute('src', nextSrc);
    }
    if(variant){
      tickerToggle.setAttribute('data-icon-variant', variant);
    }else{
      tickerToggle.removeAttribute('data-icon-variant');
    }
  };

  subscribeIconVariantChange(applyTickerIconVariant);
  applyTickerIconVariant();

  const setDrawerState = state => {
    tickerDrawer.setAttribute('data-state', state);
  };

  const updateAccessibilityState = nextOpen => {
    tickerToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    tickerPanel.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
    if(toggleLabel){
      toggleLabel.textContent = nextOpen ? 'Hide live tickers' : 'Show live tickers';
    }
  };

  const updateToggleState = nextOpen => {
    updateAccessibilityState(nextOpen);
    applyTickerIconVariant();
  };

  const finalizeAnimation = () => {
    tickerPanel.classList.remove('is-animating');
    setDrawerState(isOpen ? 'open' : 'closed');
    updateToggleState(isOpen);
    if(isOpen){
      tickerPanel.style.height = '';
    }else{
      tickerPanel.style.height = formatPanelHeight(getClosedPanelHeight());
    }
    setPanelOffset();
    isAnimating = false;
  };

  const animateDrawer = nextOpen => {
    if(isAnimating || nextOpen === isOpen){
      return;
    }
    isAnimating = true;
    const startHeight = sanitizePanelHeight(tickerPanel.getBoundingClientRect().height);
    const targetHeight = nextOpen
      ? sanitizePanelHeight(panelInner ? panelInner.scrollHeight : tickerPanel.scrollHeight)
      : getClosedPanelHeight();
    tickerPanel.style.height = formatPanelHeight(startHeight);
    setPanelOffset(startHeight);
    isOpen = nextOpen;
    requestAnimationFrame(() => {
      tickerPanel.classList.add('is-animating');
      updateToggleState(nextOpen);
      setDrawerState(nextOpen ? 'opening' : 'closing');
      tickerPanel.style.height = formatPanelHeight(targetHeight);
      setPanelOffset(targetHeight);
      const prefersReduce = typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(prefersReduce){
        finalizeAnimation();
      }
    });
  };

  tickerPanel.addEventListener('transitionend', event => {
    if(event.propertyName !== 'height'){
      return;
    }
    finalizeAnimation();
  });

  tickerPanel.addEventListener('transitioncancel', finalizeAnimation);

  tickerToggle.addEventListener('click', () => {
    if(isAnimating){
      return;
    }
    animateDrawer(!isOpen);
  });

  setDrawerState(isOpen ? 'open' : 'closed');
  updateToggleState(isOpen);
  if(!isOpen){
    tickerPanel.style.height = formatPanelHeight(getClosedPanelHeight());
  }
  setPanelOffset();
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

const STATUS_EFFECT_MECHANICS = {
  blinded: {
    badges: ['Attacks at disadvantage'],
    registry: [
      {
        type: 'attack',
        label: 'Blinded',
        breakdown: 'Blinded (attack disadvantage)',
        flags: { disadvantage: true, label: 'Blinded' },
      },
    ],
  },
  frightened: {
    badges: ['Disadvantage on attacks', 'Disadvantage on ability checks'],
    registry: [
      {
        type: 'attack',
        label: 'Frightened',
        breakdown: 'Frightened (attack disadvantage)',
        flags: { disadvantage: true, label: 'Frightened' },
      },
      {
        type: 'ability',
        label: 'Frightened',
        breakdown: 'Frightened (ability disadvantage)',
        flags: { disadvantage: true, label: 'Frightened' },
      },
    ],
  },
  poisoned: {
    badges: ['Disadvantage on attacks', 'Disadvantage on ability checks'],
    registry: [
      {
        type: 'attack',
        label: 'Poisoned',
        breakdown: 'Poisoned (attack disadvantage)',
        flags: { disadvantage: true, label: 'Poisoned' },
      },
      {
        type: 'ability',
        label: 'Poisoned',
        breakdown: 'Poisoned (ability disadvantage)',
        flags: { disadvantage: true, label: 'Poisoned' },
      },
    ],
  },
  paralyzed: {
    badges: ['Disadvantage on attacks', 'DEX saves at disadvantage'],
    registry: [
      {
        type: 'attack',
        label: 'Paralyzed',
        breakdown: 'Paralyzed (attack disadvantage)',
        flags: { disadvantage: true, label: 'Paralyzed' },
      },
      {
        type: 'save',
        ability: 'DEX',
        label: 'Paralyzed',
        breakdown: 'Paralyzed (DEX save disadvantage)',
        flags: { disadvantage: true, label: 'Paralyzed' },
      },
    ],
  },
  petrified: {
    badges: ['Disadvantage on attacks', 'STR and DEX saves at disadvantage'],
    registry: [
      {
        type: 'attack',
        label: 'Petrified',
        breakdown: 'Petrified (attack disadvantage)',
        flags: { disadvantage: true, label: 'Petrified' },
      },
      {
        type: 'save',
        abilities: ['STR', 'DEX'],
        label: 'Petrified',
        breakdown: 'Petrified (STR/DEX save disadvantage)',
        flags: { disadvantage: true, label: 'Petrified' },
      },
    ],
  },
  prone: {
    badges: ['Disadvantage on attacks'],
    registry: [
      {
        type: 'attack',
        label: 'Prone',
        breakdown: 'Prone (attack disadvantage)',
        flags: { disadvantage: true, label: 'Prone' },
      },
    ],
  },
  restrained: {
    badges: ['Disadvantage on attacks', 'DEX saves at disadvantage'],
    registry: [
      {
        type: 'attack',
        label: 'Restrained',
        breakdown: 'Restrained (attack disadvantage)',
        flags: { disadvantage: true, label: 'Restrained' },
      },
      {
        type: 'save',
        ability: 'DEX',
        label: 'Restrained',
        breakdown: 'Restrained (DEX save disadvantage)',
        flags: { disadvantage: true, label: 'Restrained' },
      },
    ],
  },
  stunned: {
    badges: ['Disadvantage on attacks', 'Disadvantage on ability checks', 'STR and DEX saves at disadvantage'],
    registry: [
      {
        type: 'attack',
        label: 'Stunned',
        breakdown: 'Stunned (attack disadvantage)',
        flags: { disadvantage: true, label: 'Stunned' },
      },
      {
        type: 'ability',
        label: 'Stunned',
        breakdown: 'Stunned (ability disadvantage)',
        flags: { disadvantage: true, label: 'Stunned' },
      },
      {
        type: 'save',
        abilities: ['STR', 'DEX'],
        label: 'Stunned',
        breakdown: 'Stunned (STR/DEX save disadvantage)',
        flags: { disadvantage: true, label: 'Stunned' },
      },
    ],
  },
  unconscious: {
    badges: ['Disadvantage on attacks', 'STR and DEX saves at disadvantage'],
    registry: [
      {
        type: 'attack',
        label: 'Unconscious',
        breakdown: 'Unconscious (attack disadvantage)',
        flags: { disadvantage: true, label: 'Unconscious' },
      },
      {
        type: 'save',
        abilities: ['STR', 'DEX'],
        label: 'Unconscious',
        breakdown: 'Unconscious (STR/DEX save disadvantage)',
        flags: { disadvantage: true, label: 'Unconscious' },
      },
    ],
  },
};

const statusGrid = $('statuses');
const statusModifierBadges = $('status-modifiers');
const activeStatuses = new Set();
const statusEffectOwners = new Map();
const statusModifierDescriptions = new Map();

function getStatusEffectOwner(id) {
  if (!statusEffectOwners.has(id)) {
    statusEffectOwners.set(id, { id: `status-effect-${id}` });
  }
  return statusEffectOwners.get(id);
}

function updateStatusModifierBadges() {
  if (!statusModifierBadges) return;
  statusModifierBadges.innerHTML = '';
  const entries = [];
  statusModifierDescriptions.forEach(list => {
    if (Array.isArray(list)) {
      list.forEach(text => {
        if (typeof text === 'string' && text.trim()) entries.push(text.trim());
      });
    }
  });
  if (!entries.length) {
    statusModifierBadges.hidden = true;
    return;
  }
  statusModifierBadges.hidden = false;
  entries.forEach(text => {
    const badge = document.createElement('span');
    badge.className = 'status-modifiers__badge';
    badge.textContent = text;
    statusModifierBadges.appendChild(badge);
  });
}

function applyStatusEffectBonuses(effectId, enabled) {
  const mechanic = STATUS_EFFECT_MECHANICS[effectId];
  if (mechanic?.registry?.length && typeof rollBonusRegistry?.register === 'function') {
    const owner = getStatusEffectOwner(effectId);
    if (enabled) {
      rollBonusRegistry.register(owner, mechanic.registry);
    } else {
      rollBonusRegistry.release(owner);
    }
  } else if (!enabled && typeof rollBonusRegistry?.release === 'function') {
    const owner = getStatusEffectOwner(effectId);
    rollBonusRegistry.release(owner);
  }
  if (enabled && mechanic?.badges?.length) {
    statusModifierDescriptions.set(effectId, mechanic.badges.slice());
  } else {
    statusModifierDescriptions.delete(effectId);
  }
  updateStatusModifierBadges();
}

if (statusGrid) {
  statusGrid.innerHTML = STATUS_EFFECTS.map(s => {
    const checkboxId = `status-${s.id}`;
    const labelId = `status-${s.id}-label`;
    return `
    <div class="status-option">
      <input type="checkbox" id="${checkboxId}" aria-labelledby="${labelId}" />
      <span id="${labelId}">${s.name}</span>
    </div>
  `;
  }).join('');
  STATUS_EFFECTS.forEach(s => {
    const cb = $('status-' + s.id);
    if (cb) {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          activeStatuses.add(s.name);
          toast(`${s.name}: ${s.desc}`, { type: 'info', duration: 8000 });
          logAction(`Status effect gained: ${s.name}`);
          applyStatusEffectBonuses(s.id, true);
        } else {
          activeStatuses.delete(s.name);
          logAction(`Status effect removed: ${s.name}`);
          applyStatusEffectBonuses(s.id, false);
        }
      });
    }
  });
  setTimeout(() => {
    STATUS_EFFECTS.forEach(s => {
      const cb = $('status-' + s.id);
      if (cb && cb.checked) {
        activeStatuses.add(s.name);
        applyStatusEffectBonuses(s.id, true);
      }
    });
  }, 0);
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

  const normalizeFlags = flags => {
    if (!flags || typeof flags !== 'object') return null;
    const normalized = {};
    if (flags.advantage) normalized.advantage = true;
    if (flags.disadvantage) normalized.disadvantage = true;
    if (typeof flags.label === 'string' && flags.label.trim()) normalized.label = flags.label.trim();
    if (typeof flags.breakdown === 'string' && flags.breakdown.trim()) normalized.breakdown = flags.breakdown.trim();
    const notes = [];
    if (Array.isArray(flags.notes)) {
      flags.notes.forEach(note => {
        if (typeof note === 'string' && note.trim()) notes.push(note.trim());
      });
    } else if (typeof flags.note === 'string' && flags.note.trim()) {
      notes.push(flags.note.trim());
    }
    if (notes.length) normalized.notes = notes;
    return Object.keys(normalized).length ? normalized : null;
  };

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
    if (!config || (config.value === undefined && typeof config.getValue !== 'function' && !config.flags && typeof config.getFlags !== 'function')) {
      return null;
    }
    const getValue = typeof config.getValue === 'function' ? config.getValue : null;
    const staticValue = Number(config.value);
    const staticFlags = normalizeFlags(config.flags);
    const getFlags = typeof config.getFlags === 'function' ? config.getFlags : null;
    if (!getValue && (!Number.isFinite(staticValue) || (staticValue === 0 && !staticFlags && !getFlags))) {
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
      flags: staticFlags,
      getFlags,
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
        flags: entry.getFlags ? normalizeFlags(entry.getFlags(opts)) : entry.flags,
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
  const flagBreakdownSet = new Set();
  const advantageSources = new Set();
  const disadvantageSources = new Set();
  registryBonuses.forEach(({ entry, value, breakdown, flags }) => {
    modifier += value;
    if (breakdown) bonusBreakdown.push(breakdown);
    if (flags) {
      const label = flags.label || entry.label || entry.source || breakdown || '';
      if (flags.advantage && label) advantageSources.add(label);
      if (flags.disadvantage && label) disadvantageSources.add(label);
      if (flags.breakdown) flagBreakdownSet.add(flags.breakdown);
      if (Array.isArray(flags.notes)) {
        flags.notes.forEach(note => {
          if (typeof note === 'string' && note.trim()) flagBreakdownSet.add(note.trim());
        });
      }
    }
  });

  const additional = Array.isArray(opts.additionalBonuses) ? opts.additionalBonuses : [];
  additional.forEach(part => {
    const value = Number(part?.value);
    if (!Number.isFinite(value) || value === 0) return;
    modifier += value;
    const text = part?.breakdown || formatBreakdown(part?.label, value, { includeZero: part?.includeZero });
    if (text) bonusBreakdown.push(text);
  });

  const breakdown = [...baseBreakdown, ...bonusBreakdown, ...Array.from(flagBreakdownSet)];
  const appliedBonuses = registryBonuses.map(({ entry, value, breakdown: text, flags }) => ({
    value,
    breakdown: text,
    source: entry.source,
    label: entry.label,
    types: Array.from(entry.types),
    abilities: Array.from(entry.abilities),
    skills: Array.from(entry.skills),
    flags: flags ? { ...flags } : null,
  }));

  const requestedModeRaw = typeof opts.mode === 'string' ? opts.mode.toLowerCase() : '';
  const requestedMode = requestedModeRaw === 'advantage' || requestedModeRaw === 'disadvantage'
    ? requestedModeRaw
    : 'normal';
  const hasManualAdvantage = requestedMode === 'advantage';
  const hasManualDisadvantage = requestedMode === 'disadvantage';
  const advantageList = Array.from(advantageSources);
  const disadvantageList = Array.from(disadvantageSources);
  const finalAdvantage = advantageList.length + (hasManualAdvantage ? 1 : 0);
  const finalDisadvantage = disadvantageList.length + (hasManualDisadvantage ? 1 : 0);
  let mode = 'normal';
  if (finalAdvantage && !finalDisadvantage) {
    mode = 'advantage';
  } else if (!finalAdvantage && finalDisadvantage) {
    mode = 'disadvantage';
  }
  const modeSources = [];
  if (hasManualAdvantage) modeSources.push('Advantage (manual)');
  if (hasManualDisadvantage) modeSources.push('Disadvantage (manual)');
  if (advantageList.length) modeSources.push(`Advantage: ${advantageList.join(', ')}`);
  if (disadvantageList.length) modeSources.push(`Disadvantage: ${disadvantageList.join(', ')}`);

  return {
    modifier,
    baseBonus: base,
    breakdown,
    baseBreakdown,
    bonusBreakdown,
    appliedBonuses,
    advantageSources: advantageList,
    disadvantageSources: disadvantageList,
    mode,
    requestedMode,
    modeSources,
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
const elSPCurrent = $('sp-current');
const elSPMax = $('sp-max');
const elSPTempPill = $('sp-temp-pill');
const elHPBar = $('hp-bar');
const elHPPill = $('hp-pill');
const elHPRoll = $('hp-roll');
const elHPTemp = $('hp-temp');
const elHPCurrent = $('hp-current');
const elHPMax = $('hp-max');
const elHPTempPill = $('hp-temp-pill');
const elHPLevelBonusInput = $('hp-level-bonus');
const elSPLevelBonusInput = $('sp-level-bonus');
const elAbilityCard = $('card-abilities');
const elStoryCard = $('card-story');
const elPowersCard = document.querySelector('fieldset[data-tab="powers"]');
// Cache frequently accessed HP amount field to avoid repeated DOM queries
const elHPAmt = $('hp-amt');
const elHPSettingsToggle = $('hp-settings-toggle');
const elHPRollInput = $('hp-roll-input');
const elHPRollList = $('hp-roll-list');
const hpSettingsOverlay = $('modal-hp-settings');
const elInitiative = $('initiative');
const elInitiativeBonus = $('initiative-bonus');
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
const elAugmentSelectedList = $('augment-selected-list');
const elAugmentSelectedEmpty = $('augment-selected-empty');
const elAugmentAvailableList = $('augment-available-list');
const elAugmentAvailableEmpty = $('augment-available-empty');
const elAugmentSlotSummary = $('augment-slot-summary');
const elAugmentSearch = $('augment-search');
const augmentFilterButtons = Array.from(qsa('.augment-filter'));
const elAugmentStateInput = $('augment-state');
const elLevelProgressInput = $('level-progress-state');
const elLevelRewardList = $('level-reward-reminders');
const elLevelRewardEmpty = $('level-reward-empty');
const elLevelRewardsCard = $('card-level-rewards');

if (elAugmentSearch) {
  elAugmentSearch.addEventListener('input', event => {
    augmentState.search = typeof event?.target?.value === 'string' ? event.target.value : '';
    persistAugmentState();
    refreshAugmentUI();
  });
}

augmentFilterButtons.forEach(button => {
  if (!button) return;
  button.addEventListener('click', () => handleAugmentFilterToggle(button.dataset?.augmentTag));
});

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
const xpNumberFormatter = new Intl.NumberFormat();
const elTier = $('tier');
const elLevelValue = $('level');
const elLevelText = $('level-text');
const elSubTierValue = $('sub-tier');
const elSubTierText = $('sub-tier-text');
const elTierGains = $('tier-gains');
const elCAPCheck = $('cap-check');
const elCAPStatus = $('cap-status');
const elDeathSaves = $('death-saves');
const elCredits = $('credits');
const elCreditsPill = $('credits-total-pill');
const elCreditsGearTotal = $('credits-gear-total');
const elCreditsModeSelect = $('credits-mode');
const elCreditsModeToggle = $('credits-mode-toggle');

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
    const manualBonus = Number(elInitiativeBonus?.value);
    const additionalBonuses = Number.isFinite(manualBonus) && manualBonus !== 0
      ? [{ label: 'Bonus', value: manualBonus }]
      : [];
    rollWithBonus('Initiative', base, elInitiativeRollResult, {
      type: 'initiative',
      baseBonuses,
      additionalBonuses,
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

function getDefaultAugmentState() {
  return {
    selected: [],
    filters: new Set(AUGMENT_CATEGORIES),
    search: '',
  };
}

function getDefaultLevelProgressState() {
  return {
    highestAppliedLevel: 1,
    hpBonus: 0,
    spBonus: 0,
    augmentSlotsEarned: 0,
    statIncreases: 0,
    legendaryGearAccess: false,
    transcendentTrait: false,
    completedRewardIds: new Set(),
  };
}

let augmentState = getDefaultAugmentState();
let levelProgressState = getDefaultLevelProgressState();

function getAugmentSlotsEarned() {
  return Number(levelProgressState?.augmentSlotsEarned) || 0;
}

function getSerializableAugmentState() {
  const filters = augmentState?.filters instanceof Set
    ? Array.from(augmentState.filters)
    : [];
  return {
    selected: Array.isArray(augmentState?.selected) ? augmentState.selected.filter(id => AUGMENT_BY_ID.has(id)) : [],
    filters: filters.length ? filters : AUGMENT_CATEGORIES.slice(),
    search: typeof augmentState?.search === 'string' ? augmentState.search : '',
  };
}

function getSerializableLevelProgressState() {
  const completed = levelProgressState?.completedRewardIds instanceof Set
    ? Array.from(levelProgressState.completedRewardIds)
    : Array.isArray(levelProgressState?.completedRewardIds)
      ? levelProgressState.completedRewardIds.filter(Boolean)
      : [];
  return {
    highestAppliedLevel: Number(levelProgressState?.highestAppliedLevel) || 1,
    hpBonus: Number(levelProgressState?.hpBonus) || 0,
    spBonus: Number(levelProgressState?.spBonus) || 0,
    augmentSlotsEarned: Number(levelProgressState?.augmentSlotsEarned) || 0,
    statIncreases: Number(levelProgressState?.statIncreases) || 0,
    legendaryGearAccess: levelProgressState?.legendaryGearAccess === true,
    transcendentTrait: levelProgressState?.transcendentTrait === true,
    completedRewardIds: completed,
  };
}

function persistAugmentState(opts = {}) {
  if (!elAugmentStateInput) return;
  const serialized = JSON.stringify(getSerializableAugmentState());
  if (elAugmentStateInput.value === serialized) return;
  elAugmentStateInput.value = serialized;
  if (!opts.silent && typeof elAugmentStateInput.dispatchEvent === 'function') {
    elAugmentStateInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function persistLevelProgressState(opts = {}) {
  if (!elLevelProgressInput) return;
  const serialized = JSON.stringify(getSerializableLevelProgressState());
  if (elLevelProgressInput.value === serialized) return;
  elLevelProgressInput.value = serialized;
  if (!opts.silent && typeof elLevelProgressInput.dispatchEvent === 'function') {
    elLevelProgressInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function hydrateAugmentState(state, opts = {}) {
  const next = getDefaultAugmentState();
  if (state && typeof state === 'object') {
    if (Array.isArray(state.selected)) {
      next.selected = state.selected.filter(id => AUGMENT_BY_ID.has(id));
    }
    if (Array.isArray(state.filters) && state.filters.length) {
      const filters = state.filters.map(normalizeAugmentTag).filter(Boolean);
      if (filters.length) next.filters = new Set(filters);
    }
    if (typeof state.search === 'string') {
      next.search = state.search;
    }
  }
  augmentState = next;
  persistAugmentState({ silent: opts.silent });
}

function hydrateLevelProgressState(state, opts = {}) {
  const next = getDefaultLevelProgressState();
  if (state && typeof state === 'object') {
    if (Number.isFinite(Number(state.highestAppliedLevel))) {
      next.highestAppliedLevel = Math.max(1, Number(state.highestAppliedLevel));
    }
    if (Number.isFinite(Number(state.hpBonus))) next.hpBonus = Number(state.hpBonus);
    if (Number.isFinite(Number(state.spBonus))) next.spBonus = Number(state.spBonus);
    if (Number.isFinite(Number(state.augmentSlotsEarned))) next.augmentSlotsEarned = Number(state.augmentSlotsEarned);
    if (Number.isFinite(Number(state.statIncreases))) next.statIncreases = Number(state.statIncreases);
    next.legendaryGearAccess = state.legendaryGearAccess === true;
    next.transcendentTrait = state.transcendentTrait === true;
    if (Array.isArray(state.completedRewardIds) && state.completedRewardIds.length) {
      next.completedRewardIds = new Set(state.completedRewardIds.filter(Boolean));
    }
  }
  levelProgressState = next;
  setDerivedHighestLevel(next.highestAppliedLevel);
  syncLevelBonusInputs();
  persistLevelProgressState({ silent: opts.silent });
  if (opts.render !== false) {
    renderLevelRewardReminders();
  }
  if (opts.schedule !== false) {
    scheduleDerivedUpdate();
  }
}

let hpRolls = [];
if (elHPRoll) {
  const initial = num(elHPRoll.value);
  if (initial) hpRolls = [initial];
}

if (elCAPCheck instanceof HTMLElement && elCAPStatus instanceof HTMLElement) {
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

const DEFAULT_LEVEL = {
  level: 1,
  tierNumber: 5,
  tierLabel: 'Tier 5 – Rookie',
  subTier: 'A',
  xp: 0,
  proficiencyBonus: 2,
  gains: '',
};

const LEVEL_TABLE = Array.isArray(LEVELS) && LEVELS.length
  ? LEVELS.slice().sort((a, b) => (a?.xp ?? 0) - (b?.xp ?? 0))
  : [DEFAULT_LEVEL];

const MAX_LEVEL_INDEX = LEVEL_TABLE.length ? LEVEL_TABLE.length - 1 : 0;

function getLevelEntry(idx) {
  if (!LEVEL_TABLE.length) return DEFAULT_LEVEL;
  if (!Number.isFinite(idx)) return LEVEL_TABLE[0] || DEFAULT_LEVEL;
  const clamped = Math.min(Math.max(idx, 0), MAX_LEVEL_INDEX);
  return LEVEL_TABLE[clamped] || LEVEL_TABLE[0] || DEFAULT_LEVEL;
}

function getLevelIndex(xp) {
  const numericXp = Math.max(0, Number.isFinite(Number(xp)) ? Number(xp) : 0);
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    const threshold = Number(LEVEL_TABLE[i]?.xp ?? 0);
    if (numericXp >= threshold) return i;
  }
  return 0;
}

function formatLevelLabel(entry) {
  if (!entry) return '';
  const levelText = Number.isFinite(Number(entry.level)) ? Number(entry.level) : '';
  const subTierText = entry.subTier ? ` ${entry.subTier}` : '';
  const tierText = entry.tierLabel ? ` – ${entry.tierLabel}` : '';
  return `Level ${levelText}${subTierText}${tierText}`.trim();
}

function formatLevelShort(entry) {
  if (!entry) return '';
  const levelText = Number.isFinite(Number(entry.level)) ? Number(entry.level) : '';
  const subTierText = entry.subTier ? ` ${entry.subTier}` : '';
  return `Level ${levelText}${subTierText}`.trim();
}

let currentLevelIdx = 0;
const derivedLevelState = {
  highestAppliedLevel: Math.max(1, Number(levelProgressState?.highestAppliedLevel) || 1),
};

function setDerivedHighestLevel(level) {
  derivedLevelState.highestAppliedLevel = Math.max(1, Number(level) || 1);
}
let xpInitialized = false;
let catalogRenderScheduler = null;
if (elXP instanceof HTMLElement) {
  const initXP = Math.max(0, num(elXP.value));
  currentLevelIdx = getLevelIndex(initXP);
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
if (elTier) {
  const initialLevel = getLevelEntry(currentLevelIdx);
  elTier.value = initialLevel?.tierLabel || DEFAULT_LEVEL.tierLabel;
}
updateLevelOutputs(getLevelEntry(currentLevelIdx));

/* ========= derived helpers ========= */
function updateTempBadge(target, tempValue){
  if (!target) return;
  const numericTemp = Number.isFinite(tempValue) ? tempValue : Number(tempValue || 0);
  if (Number.isFinite(numericTemp) && numericTemp !== 0){
    const roundedTemp = Math.trunc(numericTemp);
    const prefix = roundedTemp > 0 ? '+' : '';
    target.textContent = `${prefix}${roundedTemp} Temp`;
    target.hidden = false;
  } else {
    target.textContent = '';
    target.hidden = true;
  }
}

function applyProgressGradient(progressEl, labelEl, currentValue, maxValue){
  if (!progressEl) return;
  const numericCurrent = Number(currentValue);
  const numericMax = Number(maxValue);
  const ratio = Number.isFinite(numericCurrent) && Number.isFinite(numericMax) && numericMax > 0
    ? Math.min(Math.max(numericCurrent / numericMax, 0), 1)
    : 0;
  const hue = Math.round(120 * ratio);
  const color = `hsl(${hue}deg 68% 46%)`;
  progressEl.style.setProperty('--progress-color', color);
  if (labelEl) {
    labelEl.style.setProperty('--progress-color', color);
  }
}

function getAugmentById(id) {
  return AUGMENT_BY_ID.get(id) || null;
}

function getLevelRewardTasksForLevel(entry) {
  const levelNumber = Number(entry?.level);
  if (!Number.isFinite(levelNumber) || levelNumber < 1) return [];
  const rewards = entry?.rewards || {};
  const tasks = [];
  if (rewards.grantsStatIncrease) {
    tasks.push({
      id: `level-${levelNumber}-stat`,
      level: levelNumber,
      label: `Assign +1 Stat (Level ${levelNumber})`,
      type: 'stat',
    });
  }
  if (rewards.grantsPowerEvolution) {
    tasks.push({
      id: `level-${levelNumber}-power-evolution`,
      level: levelNumber,
      label: `Apply Power Evolution (Level ${levelNumber})`,
      type: 'power-evolution',
    });
  }
  if (rewards.powerEvolutionChoice || rewards.signatureEvolutionChoice) {
    tasks.push({
      id: `level-${levelNumber}-evolution-choice`,
      level: levelNumber,
      label: `Choose Power or Signature Move Evolution (Level ${levelNumber})`,
      type: 'evolution-choice',
    });
  }
  if (rewards.grantsSignatureEvolution) {
    tasks.push({
      id: `level-${levelNumber}-signature-evolution`,
      level: levelNumber,
      label: `Apply Signature Move Evolution (Level ${levelNumber})`,
      type: 'signature-evolution',
    });
  }
  if (rewards.grantsTranscendentTrait) {
    tasks.push({
      id: `level-${levelNumber}-transcendent-trait`,
      level: levelNumber,
      label: `Gain Transcendent Trait (Level ${levelNumber})`,
      type: 'transcendent-trait',
    });
  }
  return tasks;
}

function getLevelRewardTasksUpTo(levelNumber) {
  const safeLevel = Math.max(1, Number(levelNumber) || 1);
  const tasks = [];
  LEVEL_TABLE.forEach(entry => {
    const entryLevel = Number(entry?.level);
    if (!Number.isFinite(entryLevel) || entryLevel < 1 || entryLevel > safeLevel) return;
    tasks.push(...getLevelRewardTasksForLevel(entry));
  });
  return tasks.sort((a, b) => a.level - b.level || a.label.localeCompare(b.label));
}

function describeLevelRewards(entry) {
  if (!entry) return '';
  const rewards = entry?.rewards || {};
  const parts = [];
  if (Number.isFinite(Number(rewards.hpBonus)) && Number(rewards.hpBonus) !== 0) {
    parts.push(`+${Number(rewards.hpBonus)} HP`);
  }
  if (Number.isFinite(Number(rewards.spBonus)) && Number(rewards.spBonus) !== 0) {
    parts.push(`+${Number(rewards.spBonus)} SP Max`);
  }
  if (Number.isFinite(Number(rewards.augmentSlots)) && Number(rewards.augmentSlots) !== 0) {
    const slots = Number(rewards.augmentSlots);
    const slotLabel = slots === 1 ? 'Augment slot' : 'Augment slots';
    parts.push(`+${slots} ${slotLabel}`);
  }
  if (rewards.grantsStatIncrease) {
    parts.push('+1 Stat');
  }
  if (rewards.grantsPowerEvolution) {
    parts.push('Power Evolution');
  }
  if (rewards.powerEvolutionChoice || rewards.signatureEvolutionChoice) {
    parts.push('Power/Signature Evolution choice');
  }
  if (rewards.grantsSignatureEvolution) {
    parts.push('Signature Move Evolution');
  }
  if (rewards.grantsLegendaryGearAccess) {
    parts.push('Legendary Gear Access');
  }
  if (rewards.grantsTranscendentTrait) {
    parts.push('Transcendent Trait');
  }
  return parts.join(', ');
}

function formatLevelRewardSummary(entry) {
  if (!entry) return '';
  const base = formatLevelShort(entry);
  const details = describeLevelRewards(entry);
  return details ? `${base}: ${details}` : '';
}

function applyLevelProgress(targetLevel, opts = {}) {
  const previousState = levelProgressState || getDefaultLevelProgressState();
  const previousSlots = Number(previousState?.augmentSlotsEarned) || 0;
  const previousHighest = Number(previousState?.highestAppliedLevel) || 1;
  const completed = previousState?.completedRewardIds instanceof Set
    ? new Set(previousState.completedRewardIds)
    : new Set(Array.isArray(previousState?.completedRewardIds) ? previousState.completedRewardIds.filter(Boolean) : []);
  const normalizedLevel = Math.max(1, Number(targetLevel) || 1);
  completed.forEach(id => {
    const match = typeof id === 'string' ? id.match(/level-(\d+)-/i) : null;
    if (match && Number(match[1]) > normalizedLevel) {
      completed.delete(id);
    }
  });
  const nextState = getDefaultLevelProgressState();
  nextState.completedRewardIds = completed;
  const newLevelEntries = [];
  LEVEL_TABLE.forEach(entry => {
    const entryLevel = Number(entry?.level);
    if (!Number.isFinite(entryLevel) || entryLevel < 1 || entryLevel > normalizedLevel) return;
    const rewards = entry?.rewards || {};
    if (Number.isFinite(Number(rewards.hpBonus))) nextState.hpBonus += Number(rewards.hpBonus);
    if (Number.isFinite(Number(rewards.spBonus))) nextState.spBonus += Number(rewards.spBonus);
    if (Number.isFinite(Number(rewards.augmentSlots))) nextState.augmentSlotsEarned += Number(rewards.augmentSlots);
    if (rewards.grantsStatIncrease) nextState.statIncreases += 1;
    if (rewards.grantsLegendaryGearAccess) nextState.legendaryGearAccess = true;
    if (rewards.grantsTranscendentTrait) nextState.transcendentTrait = true;
    if (entryLevel > previousHighest && entryLevel <= normalizedLevel) {
      newLevelEntries.push(entry);
    }
  });
  const expectedSlots = AUGMENT_SLOT_LEVELS.filter(level => level <= normalizedLevel).length;
  if (nextState.augmentSlotsEarned < expectedSlots) {
    nextState.augmentSlotsEarned = expectedSlots;
  }
  nextState.highestAppliedLevel = normalizedLevel;
  levelProgressState = nextState;
  setDerivedHighestLevel(nextState.highestAppliedLevel);
  syncLevelBonusInputs();
  persistLevelProgressState({ silent: opts.silent === true });
  const slotsDiff = nextState.augmentSlotsEarned - previousSlots;
  if (slotsDiff > 0 && !opts.suppressNotifications) {
    const slotLabel = slotsDiff === 1 ? 'New Augment slot unlocked!' : `${slotsDiff} Augment slots unlocked!`;
    toast(slotLabel, 'success');
    window.dmNotify?.(slotLabel);
    logAction(`Augment slots unlocked: ${previousSlots} -> ${nextState.augmentSlotsEarned}`);
  }
  if (slotsDiff < 0 && !opts.suppressNotifications) {
    const selectedCount = Array.isArray(augmentState?.selected) ? augmentState.selected.length : 0;
    if (selectedCount > nextState.augmentSlotsEarned) {
      toast('Selected Augments exceed available slots for this level.', 'warning');
    }
  }
  if (!opts.suppressNotifications && newLevelEntries.length) {
    const unlocked = newLevelEntries
      .map(entry => getLevelRewardTasksForLevel(entry))
      .flat()
      .filter(task => !completed.has(task.id));
    if (unlocked.length) {
      const summary = unlocked.map(task => task.label).join('; ');
      toast(`Level rewards unlocked: ${summary}`, 'info');
      window.dmNotify?.(`Level rewards unlocked: ${summary}`);
      logAction(`Level rewards unlocked: ${summary}`);
    }
  }
  return { newLevelEntries, state: nextState };
}

function augmentMatchesFilters(augment, activeFilters) {
  if (!(augment?.tags && Array.isArray(augment.tags))) return false;
  if (!(activeFilters instanceof Set) || !activeFilters.size) return true;
  return augment.tags.some(tag => activeFilters.has(tag));
}

function getAugmentSearchResults() {
  const activeFilters = augmentState?.filters instanceof Set && augmentState.filters.size
    ? augmentState.filters
    : new Set(AUGMENT_CATEGORIES);
  const query = typeof augmentState?.search === 'string' ? augmentState.search.trim().toLowerCase() : '';
  const exclude = new Set(Array.isArray(augmentState?.selected) ? augmentState.selected : []);
  const results = AUGMENTS.filter(augment => {
    if (exclude.has(augment.id)) return false;
    if (!augmentMatchesFilters(augment, activeFilters)) return false;
    if (query && !augment.searchText.includes(query)) return false;
    return true;
  });
  return sortAugments(results);
}

function updateAugmentSlotSummary() {
  if (!elAugmentSlotSummary || typeof elAugmentSlotSummary.textContent === 'undefined') return;
  const earned = getAugmentSlotsEarned();
  const used = Array.isArray(augmentState?.selected) ? augmentState.selected.length : 0;
  elAugmentSlotSummary.textContent = `${used} / ${earned} Slots`;
  if (used > earned && earned >= 0) {
    if (typeof elAugmentSlotSummary.setAttribute === 'function') {
      elAugmentSlotSummary.setAttribute('data-over-limit', 'true');
    }
  } else if (typeof elAugmentSlotSummary.removeAttribute === 'function') {
    elAugmentSlotSummary.removeAttribute('data-over-limit');
  }
}

function renderSelectedAugments() {
  if (!elAugmentSelectedList) return;
  qsa('#augment-selected-list li').forEach(li => rollBonusRegistry.release(li));
  elAugmentSelectedList.innerHTML = '';
  const selected = Array.isArray(augmentState?.selected) ? augmentState.selected.map(id => getAugmentById(id)).filter(Boolean) : [];
  if (selected.length !== (augmentState?.selected?.length || 0)) {
    augmentState.selected = selected.map(augment => augment.id);
    persistAugmentState();
  }
  const ordered = sortAugments(selected);
  ordered.forEach(augment => {
    const item = document.createElement('li');
    item.className = 'augment-card';

    const header = document.createElement('div');
    header.className = 'augment-card__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'augment-card__title';
    const nameEl = document.createElement('h4');
    nameEl.className = 'augment-card__name';
    nameEl.textContent = augment.name;
    const groupEl = document.createElement('p');
    groupEl.className = 'augment-card__group';
    groupEl.textContent = augment.group;
    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(groupEl);

    const actions = document.createElement('div');
    actions.className = 'augment-card__actions';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-sm';
    removeBtn.textContent = 'Remove';
    removeBtn.setAttribute('data-view-allow', '');
    removeBtn.addEventListener('click', () => handleAugmentRemove(augment.id));
    actions.appendChild(removeBtn);

    header.appendChild(titleWrap);
    header.appendChild(actions);
    item.appendChild(header);

    const body = document.createElement('div');
    body.className = 'augment-card__body';
    if (augment.summary) {
      const summary = document.createElement('p');
      summary.className = 'augment-card__summary';
      summary.textContent = augment.summary;
      body.appendChild(summary);
    }
    const effectsList = document.createElement('ul');
    effectsList.className = 'augment-card__effects';
    augment.effects.forEach(effect => {
      const effectItem = document.createElement('li');
      effectItem.textContent = effect;
      effectsList.appendChild(effectItem);
      handlePerkEffects(effectItem, effect);
    });
    if (augment.effects.length) body.appendChild(effectsList);

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'augment-card__tags';
    augment.tags.forEach(tag => {
      const tagChip = document.createElement('span');
      tagChip.className = 'augment-card__tag';
      tagChip.textContent = tag;
      tagsWrap.appendChild(tagChip);
    });
    body.appendChild(tagsWrap);

    item.appendChild(body);
    elAugmentSelectedList.appendChild(item);
  });

  if (elAugmentSelectedEmpty) {
    elAugmentSelectedEmpty.hidden = ordered.length > 0;
  }
}

function renderAugmentPicker() {
  if (!elAugmentAvailableList) return;
  elAugmentAvailableList.innerHTML = '';
  const results = getAugmentSearchResults();
  const earned = getAugmentSlotsEarned();
  const used = Array.isArray(augmentState?.selected) ? augmentState.selected.length : 0;
  const canSelectMore = earned > used;
  results.forEach(augment => {
    const item = document.createElement('li');
    item.className = 'augment-card';

    const header = document.createElement('div');
    header.className = 'augment-card__header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'augment-card__title';
    const nameEl = document.createElement('h4');
    nameEl.className = 'augment-card__name';
    nameEl.textContent = augment.name;
    const groupEl = document.createElement('p');
    groupEl.className = 'augment-card__group';
    groupEl.textContent = augment.group;
    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(groupEl);

    const actions = document.createElement('div');
    actions.className = 'augment-card__actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-sm';
    addBtn.textContent = canSelectMore ? 'Add Augment' : 'No Slots';
    addBtn.disabled = !canSelectMore;
    addBtn.setAttribute('data-view-allow', '');
    addBtn.addEventListener('click', () => handleAugmentAdd(augment.id));
    actions.appendChild(addBtn);

    header.appendChild(titleWrap);
    header.appendChild(actions);
    item.appendChild(header);

    const body = document.createElement('div');
    body.className = 'augment-card__body';
    if (augment.summary) {
      const summary = document.createElement('p');
      summary.className = 'augment-card__summary';
      summary.textContent = augment.summary;
      body.appendChild(summary);
    }
    if (augment.effects.length) {
      const effectsList = document.createElement('ul');
      effectsList.className = 'augment-card__effects';
      augment.effects.forEach(effect => {
        const effectItem = document.createElement('li');
        effectItem.textContent = effect;
        effectsList.appendChild(effectItem);
      });
      body.appendChild(effectsList);
    }
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'augment-card__tags';
    augment.tags.forEach(tag => {
      const tagChip = document.createElement('span');
      tagChip.className = 'augment-card__tag';
      tagChip.textContent = tag;
      tagsWrap.appendChild(tagChip);
    });
    body.appendChild(tagsWrap);
    item.appendChild(body);

    elAugmentAvailableList.appendChild(item);
  });

  if (elAugmentAvailableEmpty) {
    elAugmentAvailableEmpty.hidden = results.length > 0;
  }
}

function renderAugmentFilters() {
  if (!augmentFilterButtons.length) return;
  const active = augmentState?.filters instanceof Set ? augmentState.filters : new Set();
  augmentFilterButtons.forEach(button => {
    const tag = normalizeAugmentTag(button?.dataset?.augmentTag);
    if (tag && active.has(tag)) {
      button.setAttribute('data-active', 'true');
      button.setAttribute('aria-pressed', 'true');
    } else {
      button.removeAttribute('data-active');
      button.setAttribute('aria-pressed', 'false');
    }
  });
}

function refreshAugmentUI() {
  if (elAugmentSearch && typeof augmentState?.search === 'string') {
    if (elAugmentSearch.value !== augmentState.search) {
      elAugmentSearch.value = augmentState.search;
    }
  }
  renderAugmentFilters();
  renderSelectedAugments();
  renderAugmentPicker();
  updateAugmentSlotSummary();
}

function updateLevelChoiceHighlights(pendingTasks = []) {
  const pendingTypes = new Set(Array.isArray(pendingTasks) ? pendingTasks.map(task => task?.type).filter(Boolean) : []);
  if (elAbilityCard) {
    if (pendingTypes.has('stat')) {
      elAbilityCard.setAttribute('data-level-choice', 'stat');
    } else {
      elAbilityCard.removeAttribute('data-level-choice');
    }
  }
  if (elPowersCard) {
    if (pendingTypes.has('power-evolution') || pendingTypes.has('evolution-choice') || pendingTypes.has('signature-evolution')) {
      elPowersCard.setAttribute('data-level-choice', 'power');
    } else {
      elPowersCard.removeAttribute('data-level-choice');
    }
  }
  if (elStoryCard) {
    if (pendingTypes.has('transcendent-trait')) {
      elStoryCard.setAttribute('data-level-choice', 'story');
    } else {
      elStoryCard.removeAttribute('data-level-choice');
    }
  }
}

function renderLevelRewardReminders() {
  if (!elLevelRewardList) return;
  elLevelRewardList.innerHTML = '';
  const tasks = getLevelRewardTasksUpTo(levelProgressState?.highestAppliedLevel || 1);
  const completed = levelProgressState?.completedRewardIds instanceof Set
    ? levelProgressState.completedRewardIds
    : new Set(Array.isArray(levelProgressState?.completedRewardIds) ? levelProgressState.completedRewardIds : []);
  const pendingTasks = [];
  tasks.forEach(task => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'inline';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = completed.has(task.id);
    checkbox.dataset.rewardId = task.id;
    checkbox.setAttribute('data-view-allow', '');
    checkbox.addEventListener('change', () => {
      if (!(levelProgressState.completedRewardIds instanceof Set)) {
        levelProgressState.completedRewardIds = new Set(Array.isArray(levelProgressState.completedRewardIds) ? levelProgressState.completedRewardIds : []);
      }
      if (checkbox.checked) levelProgressState.completedRewardIds.add(task.id);
      else levelProgressState.completedRewardIds.delete(task.id);
      persistLevelProgressState();
      renderLevelRewardReminders();
    });
    const text = document.createElement('span');
    text.textContent = task.label;
    label.appendChild(checkbox);
    label.appendChild(text);
    li.appendChild(label);
    elLevelRewardList.appendChild(li);
    if (!completed.has(task.id)) pendingTasks.push(task);
  });

  const hasTasks = tasks.length > 0;
  if (elLevelRewardEmpty) {
    elLevelRewardEmpty.hidden = hasTasks;
  }
  elLevelRewardList.hidden = !hasTasks;
  if (elLevelRewardsCard && typeof elLevelRewardsCard.setAttribute === 'function') {
    if (hasTasks && tasks.some(task => !(levelProgressState.completedRewardIds instanceof Set && levelProgressState.completedRewardIds.has(task.id)))) {
      elLevelRewardsCard.setAttribute('data-pending', 'true');
    } else if (typeof elLevelRewardsCard.removeAttribute === 'function') {
      elLevelRewardsCard.removeAttribute('data-pending');
    }
  }
  updateLevelChoiceHighlights(pendingTasks);
}

function handleAugmentAdd(id) {
  const augment = getAugmentById(id);
  if (!augment) return;
  if (!Array.isArray(augmentState.selected)) augmentState.selected = [];
  if (augmentState.selected.includes(id)) return;
  const earned = getAugmentSlotsEarned();
  if (augmentState.selected.length >= earned) {
    toast('No Augment slots available.', 'error');
    return;
  }
  augmentState.selected.push(id);
  persistAugmentState();
  refreshAugmentUI();
  scheduleDerivedUpdate();
  window.dmNotify?.(`Selected Augment: ${augment.name}`);
  logAction(`Augment selected: ${augment.name}`);
}

function handleAugmentRemove(id) {
  if (!Array.isArray(augmentState.selected)) augmentState.selected = [];
  const idx = augmentState.selected.indexOf(id);
  if (idx === -1) return;
  const augment = getAugmentById(id);
  augmentState.selected.splice(idx, 1);
  persistAugmentState();
  refreshAugmentUI();
  scheduleDerivedUpdate();
  if (augment) {
    window.dmNotify?.(`Removed Augment: ${augment.name}`);
    logAction(`Augment removed: ${augment.name}`);
  }
}

function handleAugmentFilterToggle(tag) {
  const normalized = normalizeAugmentTag(tag);
  if (!normalized) return;
  if (!(augmentState.filters instanceof Set)) augmentState.filters = new Set(AUGMENT_CATEGORIES);
  if (augmentState.filters.has(normalized)) {
    if (augmentState.filters.size === 1) {
      augmentState.filters = new Set(AUGMENT_CATEGORIES);
    } else {
      augmentState.filters.delete(normalized);
    }
  } else {
    augmentState.filters.add(normalized);
  }
  persistAugmentState();
  refreshAugmentUI();
}

function updateHPDisplay({ current, max } = {}){
  const currentValue = Number.isFinite(current) ? current : num(elHPBar.value);
  const maxValue = Number.isFinite(max) ? max : num(elHPBar.max);
  const tempValue = elHPTemp ? num(elHPTemp.value) : 0;
  if (elHPCurrent) elHPCurrent.textContent = currentValue;
  if (elHPMax) elHPMax.textContent = maxValue;
  const hpDisplay = `${currentValue}/${maxValue}` + (tempValue ? ` (+${tempValue})` : ``);
  if (elHPPill) elHPPill.textContent = hpDisplay;
  if (elHPBar) elHPBar.setAttribute('aria-valuetext', hpDisplay);
  applyProgressGradient(elHPBar, elHPPill, currentValue, maxValue);
  updateTempBadge(elHPTempPill, tempValue);
}

function updateSPDisplay({ current, max } = {}){
  const currentValue = Number.isFinite(current) ? current : num(elSPBar.value);
  const maxValue = Number.isFinite(max) ? max : num(elSPBar.max);
  const tempValue = elSPTemp ? num(elSPTemp.value) : 0;
  if (elSPCurrent) elSPCurrent.textContent = currentValue;
  if (elSPMax) elSPMax.textContent = maxValue;
  const spDisplay = `${currentValue}/${maxValue}` + (tempValue ? ` (+${tempValue})` : ``);
  if (elSPPill) elSPPill.textContent = spDisplay;
  if (elSPBar) elSPBar.setAttribute('aria-valuetext', spDisplay);
  applyProgressGradient(elSPBar, elSPPill, currentValue, maxValue);
  updateTempBadge(elSPTempPill, tempValue);
}

function syncLevelBonusInputs() {
  if (elHPLevelBonusInput) {
    const hpBonus = Number(levelProgressState?.hpBonus) || 0;
    elHPLevelBonusInput.value = String(hpBonus);
  }
  if (elSPLevelBonusInput) {
    const spBonus = Number(levelProgressState?.spBonus) || 0;
    elSPLevelBonusInput.value = String(spBonus);
  }
}

function updateSP(){
  const levelBonus = Number(levelProgressState?.spBonus) || 0;
  if (elSPLevelBonusInput) elSPLevelBonusInput.value = String(levelBonus);
  const spMax = 5 + mod(elCon.value) + levelBonus;
  elSPBar.max = spMax;
  if (elSPBar.value === '' || Number.isNaN(Number(elSPBar.value))) elSPBar.value = spMax;
  updateSPDisplay({ current: num(elSPBar.value), max: spMax });
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
  const levelBonus = Number(levelProgressState?.hpBonus) || 0;
  if (elHPLevelBonusInput) elHPLevelBonusInput.value = String(levelBonus);
  const total = base + conMod + num(elHPRoll.value||0) + levelBonus;
  const prevMax = num(elHPBar.max);
  elHPBar.max = Math.max(0, total);
  if (!num(elHPBar.value) || num(elHPBar.value) === prevMax) elHPBar.value = elHPBar.max;
  updateHPDisplay({ current: num(elHPBar.value), max: num(elHPBar.max) });
  updateDeathSaveAvailability();
  if(num(elHPBar.value) > 0){
    try { resetDeathSaves(); } catch {}
  }
}

function updateLevelOutputs(entry) {
  const levelEntry = entry || getLevelEntry(currentLevelIdx);
  const levelNumber = Number.isFinite(Number(levelEntry?.level)) ? String(levelEntry.level) : '';
  const subTier = levelEntry?.subTier ? String(levelEntry.subTier) : '';
  const tierLabel = levelEntry?.tierLabel ? String(levelEntry.tierLabel) : '';
  const gainsText = levelEntry?.gains ? String(levelEntry.gains).trim() : '';
  if (elTier) elTier.value = tierLabel;
  if (elLevelValue) elLevelValue.value = levelNumber;
  if (elLevelText) elLevelText.textContent = levelNumber || '—';
  if (elSubTierValue) elSubTierValue.value = subTier;
  if (elSubTierText) elSubTierText.textContent = subTier || '—';
  if (elTierGains) {
    elTierGains.textContent = gainsText;
    elTierGains.hidden = !gainsText;
  }
}

function updateXP(){
  const xp = Math.max(0, num(elXP.value));
  const idx = getLevelIndex(xp);
  const prevIdx = currentLevelIdx;
  const prevLevel = getLevelEntry(prevIdx);
  const levelEntry = getLevelEntry(idx);
  const levelNumber = Number.isFinite(Number(levelEntry?.level)) ? Number(levelEntry.level) : 1;
  const appliedLevel = Math.max(1, Number(levelProgressState?.highestAppliedLevel) || 1);
  const derivedHighest = Math.max(1, Number(derivedLevelState?.highestAppliedLevel) || appliedLevel);
  const shouldApplyProgress = levelNumber !== appliedLevel || levelNumber !== derivedHighest;
  const levelProgressResult = shouldApplyProgress
    ? applyLevelProgress(levelNumber, { suppressNotifications: !xpInitialized, silent: !xpInitialized })
    : null;
  if (xpInitialized && idx !== prevIdx) {
    logAction(`Level: ${formatLevelLabel(prevLevel)} -> ${formatLevelLabel(levelEntry)}`);
  }
  if (xpInitialized && idx > prevIdx) {
    launchConfetti();
    launchFireworks();
    const baseMessage = `Level up! ${formatLevelLabel(levelEntry)}`;
    const toastMessage = levelEntry?.gains
      ? `${baseMessage}. Gains: ${levelEntry.gains}.`
      : `${baseMessage}.`;
    toast(toastMessage, 'success');
    window.dmNotify?.(`Level up to ${formatLevelLabel(levelEntry)}`);
    if (levelProgressResult?.newLevelEntries?.length) {
      const rewardSummary = levelProgressResult.newLevelEntries
        .map(entry => formatLevelRewardSummary(entry))
        .filter(Boolean)
        .join('; ');
      if (rewardSummary) {
        window.dmNotify?.(`Level bonuses applied: ${rewardSummary}`);
        logAction(`Level bonuses applied: ${rewardSummary}`);
      }
    }
  } else if (xpInitialized && idx < prevIdx) {
    window.dmNotify?.(`Level down to ${formatLevelLabel(levelEntry)}`);
  }
  currentLevelIdx = idx;
  xpInitialized = true;
  updateLevelOutputs(levelEntry);
  if (elProfBonus) {
    const pb = Number.isFinite(Number(levelEntry?.proficiencyBonus)) ? Number(levelEntry.proficiencyBonus) : DEFAULT_LEVEL.proficiencyBonus;
    elProfBonus.value = pb;
  }
  const nextLevel = idx + 1 < LEVEL_TABLE.length ? LEVEL_TABLE[idx + 1] : null;
  const currentLevelXP = Number(levelEntry?.xp ?? 0);
  if (nextLevel) {
    const xpIntoLevel = Math.max(0, xp - currentLevelXP);
    const xpForNextLevel = Math.max(1, Number(nextLevel?.xp ?? 0) - currentLevelXP);
    elXPBar.max = xpForNextLevel;
    elXPBar.value = Math.min(xpForNextLevel, xpIntoLevel);
    elXPPill.textContent = `${xpNumberFormatter.format(xpIntoLevel)} / ${xpNumberFormatter.format(xpForNextLevel)}`;
  } else {
    elXPBar.max = 1;
    elXPBar.value = 1;
    elXPPill.textContent = `${xpNumberFormatter.format(xp)}+`;
  }
  if (typeof catalogRenderScheduler === 'function') {
    catalogRenderScheduler();
  }
  renderLevelRewardReminders();
  refreshAugmentUI();
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
  const currentLevel = getLevelEntry(currentLevelIdx);
  const pb = Number.isFinite(Number(currentLevel?.proficiencyBonus))
    ? Number(currentLevel.proficiencyBonus)
    : DEFAULT_LEVEL.proficiencyBonus;
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
  if (!elCreditsGearTotal) return;
  const total = calculateEquippedGearTotal();
  elCreditsGearTotal.textContent = `Equipped Gear: ${formatCreditsValue(total)}`;
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
  const reason = mode==='add' ? 'Manual credit gain' : 'Manual credit spend';
  setCredits(current + delta, { reason });
  if (amtField) amtField.value='';
});

const isElement = (node, ctor) => typeof ctor !== 'undefined' && node instanceof ctor;

const updateCreditsModeToggle = ()=>{
  if (!isElement(elCreditsModeToggle, HTMLElement) || !isElement(elCreditsModeSelect, HTMLSelectElement)) {
    return;
  }
  const mode = elCreditsModeSelect.value === 'subtract' ? 'subtract' : 'add';
  const label = elCreditsModeToggle.querySelector('[data-mode-label]');
  const icon = elCreditsModeToggle.querySelector('[data-mode-icon]');
  elCreditsModeToggle.dataset.mode = mode;
  elCreditsModeToggle.setAttribute('aria-pressed', mode === 'subtract' ? 'true' : 'false');
  if (label) label.textContent = mode === 'add' ? 'Add' : 'Spend';
  if (icon) icon.textContent = mode === 'add' ? '✓' : '−';
};

if (isElement(elCreditsModeToggle, HTMLElement) && isElement(elCreditsModeSelect, HTMLSelectElement)) {
  elCreditsModeToggle.addEventListener('click', () => {
    elCreditsModeSelect.value = elCreditsModeSelect.value === 'add' ? 'subtract' : 'add';
    elCreditsModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    updateCreditsModeToggle();
  });
  elCreditsModeSelect.addEventListener('change', updateCreditsModeToggle);
  updateCreditsModeToggle();
}


/* ========= HP/SP controls ========= */
function setHP(v){
  const prev = num(elHPBar.value);
  elHPBar.value = Math.max(0, Math.min(num(elHPBar.max), v));
  const current = num(elHPBar.value);
  updateHPDisplay({ current, max: num(elHPBar.max) });
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
  updateSPDisplay({ current, max: num(elSPBar.max) });
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
  statusModifierDescriptions.clear();
  if (typeof rollBonusRegistry?.release === 'function') {
    statusEffectOwners.forEach(owner => rollBonusRegistry.release(owner));
  }
  statusEffectOwners.clear();
  updateStatusModifierBadges();
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
  const resolution = resolveRollBonus(bonus, opts);
  const numericBonus = Number(bonus);
  const fallbackBonus = Number.isFinite(numericBonus) ? numericBonus : 0;
  const modifier = resolution && Number.isFinite(resolution.modifier)
    ? resolution.modifier
    : fallbackBonus;

  const normalizeDiceSet = set => {
    if (!set) return null;
    if (typeof set === 'string') {
      const match = set.match(/(\d+)d(\d+)/i);
      if (match) {
        return {
          count: Math.max(1, Math.floor(Number(match[1]))),
          sides: Math.max(1, Math.floor(Number(match[2]))),
        };
      }
      return null;
    }
    const countRaw = Number(set.count ?? set.qty ?? set.diceCount ?? set.number ?? 0);
    const sidesRaw = Number(set.sides ?? set.die ?? set.faces ?? set.size ?? 0);
    if (!Number.isFinite(countRaw) || countRaw <= 0) return null;
    if (!Number.isFinite(sidesRaw) || sidesRaw <= 0) return null;
    return {
      count: Math.max(1, Math.floor(countRaw)),
      sides: Math.max(1, Math.floor(sidesRaw)),
    };
  };

  const diceSetsRaw = Array.isArray(opts.dice) ? opts.dice : [];
  const diceSets = diceSetsRaw
    .map(normalizeDiceSet)
    .filter(Boolean);

  const requestedCountRaw = Number(opts.diceCount);
  const diceCount = Number.isFinite(requestedCountRaw) && requestedCountRaw > 1
    ? Math.floor(requestedCountRaw)
    : 1;

  const breakdownParts = [];
  const rollDetails = [];
  let rollTotal = 0;
  let rollMode = resolution?.mode || (typeof opts.mode === 'string' ? opts.mode.toLowerCase() : 'normal');
  let attemptRolls = [];

  if (diceSets.length) {
    diceSets.forEach(({ count, sides: setSides }) => {
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * setSides));
      rollDetails.push({ count, sides: setSides, rolls });
      breakdownParts.push(`${count}d${setSides}: ${rolls.join(' + ')}`);
      rollTotal += rolls.reduce((sum, value) => sum + value, 0);
    });
    rollMode = 'normal';
  } else if (diceCount > 1) {
    const rolls = Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * sides));
    rollDetails.push({ count: diceCount, sides, rolls });
    breakdownParts.push(`${diceCount}d${sides}: ${rolls.join(' + ')}`);
    rollTotal = rolls.reduce((sum, value) => sum + value, 0);
    rollMode = 'normal';
  } else {
    const normalizedMode = rollMode === 'advantage' || rollMode === 'disadvantage' ? rollMode : 'normal';
    rollMode = normalizedMode;
    const attemptCount = rollMode === 'normal' ? 1 : 2;
    attemptRolls = Array.from({ length: attemptCount }, () => 1 + Math.floor(Math.random() * sides));
    const chosen = rollMode === 'advantage'
      ? Math.max(...attemptRolls)
      : rollMode === 'disadvantage'
        ? Math.min(...attemptRolls)
        : attemptRolls[0];
    rollDetails.push({ count: 1, sides, rolls: attemptRolls.slice(), chosen });
    rollTotal = chosen;
    if (rollMode !== 'normal') {
      breakdownParts.push(`d${sides}: ${attemptRolls.join(' / ')} ⇒ ${chosen}`);
    } else {
      breakdownParts.push(`d${sides}: ${chosen}`);
    }
  }

  const total = rollTotal + modifier;

  if (out) {
    out.textContent = total;
    if (out.dataset) {
      const combinedBreakdown = [
        ...breakdownParts,
        ...(resolution?.breakdown || []),
      ].filter(Boolean);
      if (combinedBreakdown.length) {
        out.dataset.rollBreakdown = combinedBreakdown.join(' | ');
      } else if (out.dataset.rollBreakdown) {
        delete out.dataset.rollBreakdown;
      }
      out.dataset.rollModifier = String(modifier);
      if (rollMode && rollMode !== 'normal') {
        out.dataset.rollMode = rollMode;
        if (attemptRolls.length) {
          out.dataset.rolls = attemptRolls.join('/');
        }
      } else {
        if (out.dataset.rollMode) delete out.dataset.rollMode;
        if (out.dataset.rolls) delete out.dataset.rolls;
      }
      if (resolution?.modeSources?.length && rollMode !== 'normal') {
        out.dataset.rollModeSources = resolution.modeSources.join(' | ');
      } else if (out.dataset.rollModeSources) {
        delete out.dataset.rollModeSources;
      }
    }
  }

  const modifierSign = modifier >= 0 ? '+' : '';
  const diceSummary = breakdownParts.length ? breakdownParts.join(' | ') : String(rollTotal);
  let message = `${name}: ${diceSummary}`;
  if (modifier) {
    message += ` ${modifierSign}${modifier}`;
  }
  message += ` = ${total}`;
  const metaSections = [];
  if (rollMode && rollMode !== 'normal' && resolution?.modeSources?.length) {
    metaSections.push(resolution.modeSources.join(' | '));
  }
  if (resolution?.breakdown?.length) {
    metaSections.push(resolution.breakdown.join(' | '));
  }
  if (metaSections.length) {
    message += ` [${metaSections.join(' | ')}]`;
  }
  logAction(message);

  if (opts && typeof opts.onRoll === 'function') {
    try {
      const baseBonusValue = resolution && Number.isFinite(resolution.baseBonus)
        ? resolution.baseBonus
        : fallbackBonus;
      opts.onRoll({
        roll: rollTotal,
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
        options: { ...opts, mode: rollMode },
        sides,
        rolls: rollDetails,
        rollMode,
        modeSources: resolution?.modeSources || [],
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
const diceCriticalStateClasses = ['dice-result--crit-success', 'dice-result--crit-failure'];
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
    let criticalState = '';
    if (count === 1 && sides === 20) {
      const chosen = rollDetails[0]?.chosen;
      if (chosen === 20) {
        criticalState = 'success';
      } else if (chosen === 1) {
        criticalState = 'failure';
      }
    }
    const keptSum = rollDetails.reduce((total, detail) => total + detail.chosen, 0);
    const total = keptSum + modifier;
    const breakdownDisplay = rollDetails.map(detail => {
      if (normalizedMode !== 'normal' && Number.isFinite(detail.secondary)) {
        return `${detail.primary}/${detail.secondary}→${detail.chosen}`;
      }
      return String(detail.chosen);
    });
    out.classList.remove('rolling');
    diceCriticalStateClasses.forEach(cls => out.classList.remove(cls));
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
      if (criticalState) {
        out.dataset.rollCritical = criticalState;
      } else if (out.dataset.rollCritical) {
        delete out.dataset.rollCritical;
      }
    }
    if (criticalState === 'success') {
      out.classList.add('dice-result--crit-success');
    } else if (criticalState === 'failure') {
      out.classList.add('dice-result--crit-failure');
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
  'dice-roll': {
    frequency: 260,
    type: 'sine',
    duration: 0.4,
    volume: 0.26,
    attack: 0.012,
    release: 0.2,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.25, amplitude: 0.5 },
      { ratio: 1.75, amplitude: 0.22 },
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
  const rollOptions = { type: 'death-save', baseBonuses, mode: normalizedMode };
  const sides = getRollSides(rollOptions);
  const resolution = resolveRollBonus(baseBonus, rollOptions);
  const numericBonus = Number(baseBonus);
  const fallbackBonus = Number.isFinite(numericBonus) ? numericBonus : 0;
  const modifier = resolution && Number.isFinite(resolution.modifier)
    ? resolution.modifier
    : fallbackBonus;
  const appliedMode = resolution?.mode === 'advantage' || resolution?.mode === 'disadvantage'
    ? resolution.mode
    : normalizedMode;
  const rollCount = appliedMode === 'normal' ? 1 : 2;
  const rolls = Array.from({ length: rollCount }, () => 1 + Math.floor(Math.random() * sides));
  const chosenRoll = appliedMode === 'advantage'
    ? Math.max(...rolls)
    : appliedMode === 'disadvantage'
      ? Math.min(...rolls)
      : rolls[0];
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
      if (appliedMode !== 'normal') {
        deathOut.dataset.rollMode = appliedMode;
        deathOut.dataset.rolls = rolls.join('/');
      } else {
        if (deathOut.dataset.rollMode) delete deathOut.dataset.rollMode;
        if (deathOut.dataset.rolls) delete deathOut.dataset.rolls;
      }
      if (resolution?.modeSources?.length && appliedMode !== 'normal') {
        deathOut.dataset.rollModeSources = resolution.modeSources.join(' | ');
      } else if (deathOut.dataset.rollModeSources) {
        delete deathOut.dataset.rollModeSources;
      }
    }
  }
  const sign = modifier >= 0 ? '+' : '';
  const modeLabel = appliedMode === 'normal' ? '' : ` (${appliedMode})`;
  const rollDisplay = appliedMode === 'normal'
    ? String(chosenRoll)
    : `${rolls.join('/')}→${chosenRoll}`;
  let message = `Death save${modeLabel}: ${rollDisplay}${sign}${modifier} = ${total}`;
  if (resolution?.breakdown?.length) {
    const extra = resolution.modeSources?.length && appliedMode !== 'normal'
      ? [...resolution.modeSources, ...resolution.breakdown]
      : resolution.breakdown;
    message += ` [${extra.join(' | ')}]`;
  } else if (resolution?.modeSources?.length && appliedMode !== 'normal') {
    message += ` [${resolution.modeSources.join(' | ')}]`;
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

function parseWeaponDamageFormula(text, { fallbackAbility } = {}) {
  const raw = typeof text === 'string' ? text : '';
  if (!raw.trim()) return null;
  const diceMatches = Array.from(raw.matchAll(/(\d+)\s*d\s*(\d+)/gi));
  if (!diceMatches.length) return null;
  const dice = diceMatches.map(match => ({
    count: Math.max(1, Number(match[1])),
    sides: Math.max(1, Number(match[2])),
  }));
  const abilityMatch = raw.match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/i);
  const ability = abilityMatch ? abilityMatch[1].toLowerCase() : (fallbackAbility || null);
  const modifierMatches = Array.from(raw.matchAll(/[+-]\s*\d+/g));
  const staticModifier = modifierMatches.reduce((total, match) => total + Number(match[0].replace(/\s+/g, '')), 0);
  return { dice, ability, staticModifier };
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
  if (kind === 'weapon') {
    const damageBtn = document.createElement('button');
    damageBtn.className = 'btn-sm';
    damageBtn.textContent = 'Roll Damage';
    const damageOut = document.createElement('span');
    damageOut.className = 'pill result';
    damageOut.dataset.placeholder = 'Damage';
    damageBtn.addEventListener('click', () => {
      const damageField = qs("[data-f='damage']", card);
      const rawDamage = damageField?.value || '';
      const extracted = extractWeaponDetails(rawDamage);
      const damageFormulaText = extracted.damage || rawDamage;
      const abilityField = qs("[data-f='attackAbility']", card);
      const selectedAbility = (abilityField?.value || '').toLowerCase();
      const rangeValue = qs("[data-f='range']", card)?.value || '';
      const inferredAbility = selectedAbility || inferWeaponAttackAbility({ range: rangeValue });
      const parsed = parseWeaponDamageFormula(damageFormulaText, { fallbackAbility: inferredAbility });
      if (!parsed || !Array.isArray(parsed.dice) || !parsed.dice.length) {
        toast('Set damage dice before rolling damage.', 'error');
        return;
      }
      const nameField = qs("[data-f='name']", card);
      const weaponName = nameField?.value || 'Weapon';
      const abilityKey = parsed.ability;
      let abilityMod = 0;
      const baseBonuses = [];
      if (abilityKey) {
        const abilityInput = $(abilityKey);
        abilityMod = abilityInput ? mod(abilityInput.value) : 0;
        baseBonuses.push({ label: `${abilityKey.toUpperCase()} mod`, value: abilityMod, includeZero: true });
      }
      const flatBonus = Number.isFinite(parsed.staticModifier) ? parsed.staticModifier : 0;
      if (flatBonus) baseBonuses.push({ label: 'Flat', value: flatBonus });
      const modifier = abilityMod + flatBonus;
      const diceSets = parsed.dice.map(set => ({ count: Math.max(1, Number(set.count)), sides: Math.max(1, Number(set.sides)) }));
      const outputs = [damageOut];
      rollWithBonus(`${weaponName} damage`, modifier, damageOut, {
        type: 'damage',
        dice: diceSets,
        baseBonuses,
        onRoll: ({ total }) => {
          outputs.forEach(outEl => {
            if (!outEl) return;
            outEl.textContent = total;
          });
          playDamageAnimation(total);
        },
      });
    });
    delWrap.appendChild(damageBtn);
    delWrap.appendChild(damageOut);
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
  const currentLevel = getLevelEntry(currentLevelIdx);
  const tierNumber = Number.isFinite(Number(currentLevel?.tierNumber))
    ? Number(currentLevel.tierNumber)
    : null;
  const tierLabel = Number.isFinite(tierNumber) ? `T${tierNumber}` : '';
  const tierValue = tierLabel ? tierRank(tierLabel) : null;
  const tierLabelText = currentLevel?.tierLabel ? String(currentLevel.tierLabel) : '';
  const levelNumber = Number.isFinite(Number(currentLevel?.level))
    ? Number(currentLevel.level)
    : null;
  const levelLabel = Number.isFinite(levelNumber) ? `Level ${levelNumber}` : '';
  const subTierLabel = currentLevel?.subTier ? String(currentLevel.subTier) : '';
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
  if (Number.isFinite(tierNumber)) {
    addTokens(`Tier ${tierNumber}`);
    addTokens(String(tierNumber));
  }
  if (Number.isFinite(tierValue)) addTokens(String(tierValue));
  addTokens(levelLabel);
  if (Number.isFinite(levelNumber)) {
    addTokens(`L${levelNumber}`);
    addTokens(String(levelNumber));
  }
  addTokens(subTierLabel);
  if (subTierLabel) addTokens(`Sub-Tier ${subTierLabel}`);
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
  if (tierLabel) setAttr('tier', tierLabel);
  if (tierLabelText) setAttr('tier label', tierLabelText);
  if (Number.isFinite(tierNumber)) {
    setAttr('tier level', `Tier ${tierNumber}`);
    setAttr('tier number', String(tierNumber));
  }
  if (Number.isFinite(tierValue)) {
    setAttr('tier rank', String(tierValue));
  }
  if (levelLabel) setAttr('level label', levelLabel);
  if (Number.isFinite(levelNumber)) {
    setAttr('level', String(levelNumber));
    setAttr('level number', String(levelNumber));
  }
  if (subTierLabel) {
    setAttr('sub tier', subTierLabel);
    setAttr('sub-tier', subTierLabel);
    setAttr('subtier', subTierLabel);
  }
  return {
    tierLabel,
    tierValue,
    tierLabelText,
    level: levelNumber,
    subTier: subTierLabel,
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
      let prebuilt = null;
      try {
        prebuilt = await fetchCatalogJson(CATALOG_JSON_SRC, 'Catalog JSON fetch failed');
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
const ENCOUNTER_STATUS_IDS = new Set(STATUS_EFFECTS.map(effect => effect.id));
const encounterTemplate = $('encounter-combatant-template');

function generateEncounterId(seed = 0) {
  return `enc-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numValue = Number(value);
  if (!Number.isFinite(numValue)) return null;
  return Math.trunc(numValue);
}

function normalizeEncounterCombatant(entry = {}, idx = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' && entry.id ? entry.id : generateEncounterId(idx);
  const name = typeof entry.name === 'string' ? entry.name : '';
  const initRaw = Number(entry.init);
  const init = Number.isFinite(initRaw) ? Math.trunc(initRaw) : 0;
  const hpCurrentRaw = normalizeNullableNumber(entry.hpCurrent ?? entry.hp?.current);
  const hpMaxRaw = normalizeNullableNumber(entry.hpMax ?? entry.hp?.max);
  const tcRaw = normalizeNullableNumber(entry.tc ?? entry.ac);
  const notes = typeof entry.notes === 'string' ? entry.notes : '';
  const rawConditions = Array.isArray(entry.conditions) ? entry.conditions : [];
  const normalizedConditions = Array.from(new Set(rawConditions.map(cond => {
    const key = typeof cond === 'string' ? cond.toLowerCase() : '';
    return ENCOUNTER_STATUS_IDS.has(key) ? key : null;
  }).filter(Boolean)));
  const current = hpCurrentRaw !== null ? Math.max(hpCurrentRaw, 0) : null;
  const max = hpMaxRaw !== null ? Math.max(hpMaxRaw, 0) : null;
  const defeated = entry.defeated === true || (current !== null && current <= 0);
  return {
    id,
    name,
    init,
    hpCurrent: current,
    hpMax: max,
    tc: tcRaw !== null ? tcRaw : null,
    notes,
    conditions: normalizedConditions,
    defeated,
  };
}

function normalizeEncounterRoster(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry, idx) => normalizeEncounterCombatant(entry, idx)).filter(Boolean);
}

const roster = normalizeEncounterRoster(safeParse('enc-roster'));
let round = Number(localStorage.getItem('enc-round')||'1')||1;
let turn = Number(localStorage.getItem('enc-turn')||'0')||0;

function saveEnc(){
  localStorage.setItem('enc-roster', JSON.stringify(roster));
  localStorage.setItem('enc-round', String(round));
  localStorage.setItem('enc-turn', String(turn));
}

function formatCombatantHpText(combatant) {
  if (!combatant) return '—';
  const current = Number.isFinite(combatant.hpCurrent) ? combatant.hpCurrent : null;
  const max = Number.isFinite(combatant.hpMax) ? combatant.hpMax : null;
  if (current === null && max === null) return '—';
  if (current !== null && max !== null) return `${current}/${max}`;
  if (current !== null) return String(current);
  return `—/${max}`;
}

function updateCombatantActiveDisplay() {
  const activeEl = $('enc-active');
  if (!activeEl) return;
  const activeCombatant = roster.length ? roster[turn] : null;
  if (!activeCombatant) {
    activeEl.textContent = 'No active combatant';
    return;
  }
  const name = activeCombatant.name ? String(activeCombatant.name) : 'Unnamed combatant';
  const init = Number.isFinite(activeCombatant.init) ? Math.trunc(activeCombatant.init) : null;
  const hpText = formatCombatantHpText(activeCombatant);
  const parts = [name];
  if (init !== null) parts.push(`Init ${init}`);
  if (hpText !== '—') parts.push(`HP ${hpText}`);
  activeEl.textContent = parts.join(' • ');
}

function updateCombatantConditionsSummary(row, combatant) {
  if (!row) return;
  const summary = row.querySelector('.encounter-combatant__conditions summary');
  if (!summary) return;
  const count = Array.isArray(combatant?.conditions) ? combatant.conditions.length : 0;
  summary.textContent = count ? `Conditions (${count})` : 'Conditions';
}

function updateCombatantRow(row, combatant) {
  if (!row || !combatant) return;
  const initPill = qs('[data-field="initiative"]', row);
  if (initPill) initPill.textContent = Number.isFinite(combatant.init) ? String(combatant.init) : '—';
  const initInput = qs('[data-field="init"]', row);
  if (initInput) initInput.value = Number.isFinite(combatant.init) ? String(combatant.init) : '';
  const nameInput = qs('[data-field="name"]', row);
  if (nameInput && nameInput.value !== (combatant.name || '')) nameInput.value = combatant.name || '';
  const hpCurrentInput = qs('[data-field="hpCurrent"]', row);
  if (hpCurrentInput) hpCurrentInput.value = Number.isFinite(combatant.hpCurrent) ? String(combatant.hpCurrent) : '';
  const hpMaxInput = qs('[data-field="hpMax"]', row);
  if (hpMaxInput) hpMaxInput.value = Number.isFinite(combatant.hpMax) ? String(combatant.hpMax) : '';
  const tcInput = qs('[data-field="tc"]', row);
  if (tcInput) tcInput.value = Number.isFinite(combatant.tc) ? String(combatant.tc) : '';
  const notesInput = qs('[data-field="notes"]', row);
  if (notesInput && notesInput.value !== (combatant.notes || '')) notesInput.value = combatant.notes || '';
  if (combatant.defeated) {
    row.classList.add('encounter-combatant--defeated');
    row.setAttribute('data-defeated', 'true');
  } else {
    row.classList.remove('encounter-combatant--defeated');
    row.removeAttribute('data-defeated');
  }
  updateCombatantConditionsSummary(row, combatant);
}

function adjustCombatantHp(combatant, delta, { row } = {}) {
  if (!combatant || !Number.isFinite(delta) || delta === 0) return;
  const base = Number.isFinite(combatant.hpCurrent) ? combatant.hpCurrent : 0;
  const max = Number.isFinite(combatant.hpMax) ? combatant.hpMax : null;
  let next = base + delta;
  if (max !== null && next > max) next = max;
  if (next < 0) next = 0;
  combatant.hpCurrent = next;
  const wasDefeated = combatant.defeated === true;
  combatant.defeated = next <= 0;
  const name = combatant.name ? combatant.name : 'Unnamed combatant';
  const summary = formatCombatantHpText(combatant);
  if (delta < 0) {
    const amount = Math.abs(delta);
    const message = `${name} takes ${amount} damage (${summary})`;
    toast(message, 'warning');
    logAction(message);
  } else if (delta > 0) {
    const message = `${name} recovers ${delta} HP (${summary})`;
    toast(message, 'success');
    logAction(message);
  }
  if (combatant.defeated && !wasDefeated) {
    const defeatMessage = `${name} is defeated.`;
    toast(defeatMessage, 'error');
    logAction(defeatMessage);
  } else if (!combatant.defeated && wasDefeated && combatant.hpCurrent > 0) {
    const backMessage = `${name} is back in the fight.`;
    toast(backMessage, 'info');
    logAction(backMessage);
  }
  if (row) updateCombatantRow(row, combatant);
  updateCombatantActiveDisplay();
  saveEnc();
}

function bindCombatantRow(row, combatant, idx) {
  if (!row || !combatant) return;
  row.dataset.index = String(idx);
  const nameInput = qs('[data-field="name"]', row);
  if (nameInput) {
    nameInput.value = combatant.name || '';
    nameInput.addEventListener('input', () => {
      combatant.name = nameInput.value;
      updateCombatantRow(row, combatant);
      updateCombatantActiveDisplay();
      saveEnc();
    });
  }
  const initInput = qs('[data-field="init"]', row);
  if (initInput) {
    initInput.value = Number.isFinite(combatant.init) ? String(combatant.init) : '';
    initInput.addEventListener('input', () => {
      const value = normalizeNullableNumber(initInput.value);
      combatant.init = value !== null ? value : 0;
      updateCombatantRow(row, combatant);
      saveEnc();
    });
    initInput.addEventListener('change', () => {
      roster.sort((a,b)=>(Number.isFinite(b.init) ? b.init : 0)-(Number.isFinite(a.init) ? a.init : 0) || String(a.name).localeCompare(String(b.name)));
      turn = Math.min(turn, roster.length ? roster.length - 1 : 0);
      renderEnc();
      saveEnc();
    });
  }
  const hpCurrentInput = qs('[data-field="hpCurrent"]', row);
  if (hpCurrentInput) {
    hpCurrentInput.value = Number.isFinite(combatant.hpCurrent) ? String(combatant.hpCurrent) : '';
    hpCurrentInput.addEventListener('input', () => {
      const value = normalizeNullableNumber(hpCurrentInput.value);
      combatant.hpCurrent = value !== null ? Math.max(value, 0) : null;
      combatant.defeated = combatant.hpCurrent !== null && combatant.hpCurrent <= 0;
      updateCombatantRow(row, combatant);
      updateCombatantActiveDisplay();
      saveEnc();
    });
  }
  const hpMaxInput = qs('[data-field="hpMax"]', row);
  if (hpMaxInput) {
    hpMaxInput.value = Number.isFinite(combatant.hpMax) ? String(combatant.hpMax) : '';
    hpMaxInput.addEventListener('input', () => {
      const value = normalizeNullableNumber(hpMaxInput.value);
      combatant.hpMax = value !== null ? Math.max(value, 0) : null;
      if (Number.isFinite(combatant.hpCurrent) && Number.isFinite(combatant.hpMax) && combatant.hpCurrent > combatant.hpMax) {
        combatant.hpCurrent = combatant.hpMax;
      }
      updateCombatantRow(row, combatant);
      updateCombatantActiveDisplay();
      saveEnc();
    });
  }
  const tcInput = qs('[data-field="tc"]', row);
  if (tcInput) {
    tcInput.value = Number.isFinite(combatant.tc) ? String(combatant.tc) : '';
    tcInput.addEventListener('input', () => {
      const value = normalizeNullableNumber(tcInput.value);
      combatant.tc = value !== null ? value : null;
      saveEnc();
    });
  }
  const notesInput = qs('[data-field="notes"]', row);
  if (notesInput) {
    notesInput.value = combatant.notes || '';
    notesInput.addEventListener('input', () => {
      combatant.notes = notesInput.value;
      saveEnc();
    });
  }
  const conditionsContainer = qs('[data-field="conditions"]', row);
  if (conditionsContainer) {
    conditionsContainer.innerHTML = '';
    STATUS_EFFECTS.forEach(effect => {
      const wrapper = document.createElement('label');
      wrapper.className = 'inline';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.condition = effect.id;
      checkbox.checked = combatant.conditions.includes(effect.id);
      checkbox.addEventListener('change', () => {
        const name = combatant.name ? combatant.name : 'Unnamed combatant';
        if (checkbox.checked) {
          if (!combatant.conditions.includes(effect.id)) combatant.conditions.push(effect.id);
          toast(`${name} gains ${effect.name}`, 'info');
          logAction(`${name} gains ${effect.name}`);
        } else {
          combatant.conditions = combatant.conditions.filter(id => id !== effect.id);
          toast(`${name} is no longer ${effect.name}`, 'info');
          logAction(`${name} is no longer ${effect.name}`);
        }
        updateCombatantConditionsSummary(row, combatant);
        saveEnc();
      });
      wrapper.appendChild(checkbox);
      const label = document.createElement('span');
      label.textContent = ` ${effect.name}`;
      wrapper.appendChild(label);
      conditionsContainer.appendChild(wrapper);
    });
    updateCombatantConditionsSummary(row, combatant);
  }
  qsa('[data-action]', row).forEach(btn => {
    btn.addEventListener('click', event => {
      event.preventDefault();
      const step = Number(btn.dataset.step);
      if (!Number.isFinite(step) || step === 0) return;
      adjustCombatantHp(combatant, step, { row });
    });
  });
  const delBtn = row.querySelector('[data-del]');
  if (delBtn) {
    delBtn.dataset.del = String(idx);
    delBtn.addEventListener('click', event => {
      event.preventDefault();
      const index = roster.indexOf(combatant);
      if (index >= 0) {
        roster.splice(index, 1);
        if (turn >= roster.length) turn = roster.length ? Math.min(turn, roster.length - 1) : 0;
        renderEnc();
        saveEnc();
      }
    });
    applyDeleteIcon(delBtn);
  }
  updateCombatantRow(row, combatant);
}

function createCombatantRow(combatant, idx) {
  let row;
  if (encounterTemplate?.content?.firstElementChild) {
    row = encounterTemplate.content.firstElementChild.cloneNode(true);
  } else {
    row = document.createElement('div');
    row.className = 'catalog-item encounter-combatant';
  }
  bindCombatantRow(row, combatant, idx);
  return row;
}

function renderEnc(){
  const list=$('enc-list');
  if(!list) return;
  const roundEl=$('enc-round');
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
  roster.forEach((r,idx)=>{
    const row=createCombatantRow(r, idx);
    if(idx===turn){
      row.classList.add('active');
      row.setAttribute('aria-current','true');
    }
    list.appendChild(row);
  });
  if(roundEl){
    roundEl.textContent = total ? String(round) : '—';
  }
  updateCombatantActiveDisplay();
}
$('btn-enc').addEventListener('click', ()=>{ renderEnc(); show('modal-enc'); });
$('enc-add').addEventListener('click', ()=>{
  const name=$('enc-name').value.trim();
  const initValue=Number($('enc-init').value);
  const init = Number.isFinite(initValue) ? Math.trunc(initValue) : 0;
  if(!name) return toast('Enter a name','error');
  roster.push(normalizeEncounterCombatant({name, init}, roster.length));
  roster.sort((a,b)=>(Number.isFinite(b.init) ? b.init : 0)-(Number.isFinite(a.init) ? a.init : 0) || String(a.name).localeCompare(String(b.name)));
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
    id: typeof entry?.id === 'string' ? entry.id : '',
    name: typeof entry?.name === 'string' ? entry.name : '',
    init: Number.isFinite(entry?.init) ? Math.trunc(entry.init) : 0,
    hpCurrent: Number.isFinite(entry?.hpCurrent) ? Math.trunc(entry.hpCurrent) : null,
    hpMax: Number.isFinite(entry?.hpMax) ? Math.trunc(entry.hpMax) : null,
    tc: Number.isFinite(entry?.tc) ? Math.trunc(entry.tc) : null,
    notes: typeof entry?.notes === 'string' ? entry.notes : '',
    conditions: Array.isArray(entry?.conditions)
      ? entry.conditions.filter(id => ENCOUNTER_STATUS_IDS.has(id))
      : [],
    defeated: entry?.defeated === true,
  }));
  const safeTurn = safeRoster.length
    ? Math.min(Math.max(0, safeTurnBase), safeRoster.length - 1)
    : 0;
  data.encounter = {
    round: safeRound,
    turn: safeTurn,
    roster: safeRoster
  };
  persistAugmentState({ silent: true });
  persistLevelProgressState({ silent: true });
  data.augmentState = getSerializableAugmentState();
  data.levelProgressState = getSerializableLevelProgressState();
  if (window.CC && CC.partials && Object.keys(CC.partials).length) {
    try { data.partials = JSON.parse(JSON.stringify(CC.partials)); } catch { data.partials = {}; }
  }
  return data;
}
const DEFAULT_STATE = serialize();
function deserialize(data){
  migratePublicOpinionSnapshot(data);
  const storedLevelProgress = data && (data.levelProgressState || data.levelProgress);
  const storedAugments = data && data.augmentState;
  hydrateLevelProgressState(storedLevelProgress, { silent: true });
  hydrateAugmentState(storedAugments, { silent: true });
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
    currentLevelIdx = getLevelIndex(xp);
  }
  if(data && data.partials && window.CC){
    CC.partials = data.partials;
    if(CC.RP && typeof CC.RP.load==='function' && CC.partials.resonance){
      CC.RP.load(CC.partials.resonance);
    }
  }
  const encounterData = data?.encounter || null;
  const restoredRoster = normalizeEncounterRoster(encounterData?.roster);
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
    if (typeof syncStatusTrigger.setAttribute === 'function') {
      syncStatusTrigger.setAttribute('data-has-errors', 'true');
    }
  } else {
    if (typeof syncStatusTrigger.removeAttribute === 'function') {
      syncStatusTrigger.removeAttribute('data-has-errors');
    }
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
        if (typeof syncStatusTrigger.setAttribute === 'function') {
          syncStatusTrigger.setAttribute('data-queue-count', badgeLabel);
        }
      } else if (typeof syncStatusTrigger.removeAttribute === 'function') {
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
      if (typeof syncStatusTrigger.setAttribute === 'function') {
        syncStatusTrigger.setAttribute('data-queue-count', badgeLabel);
      }
    } else if (typeof syncStatusTrigger.removeAttribute === 'function') {
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
const welcomeHideToggle = $('welcome-hide-toggle');
if (welcomeHideToggle) {
  welcomeHideToggle.checked = welcomeModalDismissed;
  welcomeHideToggle.addEventListener('change', () => {
    const shouldHide = welcomeHideToggle.checked;
    welcomeModalDismissed = shouldHide;
    if (typeof localStorage !== 'undefined') {
      try {
        if (shouldHide) {
          localStorage.setItem(WELCOME_MODAL_PREFERENCE_KEY, 'true');
        } else {
          localStorage.removeItem(WELCOME_MODAL_PREFERENCE_KEY);
        }
      } catch {}
    }
  });
}
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

