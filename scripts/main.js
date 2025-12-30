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
  migrateSavePayload,
  buildCanonicalPayload,
  preflightSnapshotForLoad,
  SAVE_SCHEMA_VERSION,
  UI_STATE_VERSION,
  APP_VERSION,
  calculateSnapshotChecksum,
  persistLocalAutosaveSnapshot,
  ensureCharacterId,
} from './characters.js';
import {
  initializeAutosaveController,
  markAutoSaveDirty,
  markAutoSaveSynced,
  performScheduledAutoSave,
  isAutoSaveDirty,
} from './autosave-controller.js';
import { show, hide } from './modal.js';
import { canonicalCharacterKey } from './character-keys.js';
import { buildImportedCopyName } from './import-utils.js';
import {
  initFirebaseAuth,
  onAuthStateChanged,
  signInWithUsernamePassword,
  createAccountWithUsernamePassword,
  normalizeUsername,
  getAuthState,
  getFirebaseDatabase,
} from './auth.js';
import { claimCharacterLock } from './claim-utils.js';
import { createClaimToken, consumeClaimToken } from './claim-tokens.js';
import { hasBootableLocalState } from './welcome-utils.js';
import { shouldPullCloudCopy, detectSyncConflict } from './sync-utils.js';
import { buildClaimRow, renderEmptyRow, renderCloudCharacterList } from './cloud-list-renderer.js';
import {
  PASSWORD_POLICY,
  applyPasswordPolicyError,
  getPasswordLengthError,
  renderPasswordPolicyChecklist,
  updatePasswordPolicyChecklist,
} from './password-policy.js';
import {
  loadLocal,
  saveLocal,
  saveCloud,
  saveCloudCharacter,
  listCharacterIndex,
  loadCloudCharacter,
  saveCharacterIndexEntry,
  readLastSyncedAt,
  writeLastSyncedAt,
  listLocalSaves,
  storeConflictSnapshot,
  saveCloudConflictBackup,
  getDeviceId,
  getActiveUserId,
  setActiveUserId,
  setActiveAuthUserId,
  writeLastUserUid,
  listLegacyLocalSaves,
  loadLegacyLocal,
  listCloudSaves,
  listCloudBackupNames,
  listCloudBackups,
  loadCloud,
  loadCloudBackup,
} from './storage.js';
import {
  activateTab,
  getActiveTab,
  getNavigationType,
  setNavigationTypeOverride,
  onTabChange,
  scrollToTopOfCombat,
  triggerTabIconAnimation
} from './tabs.js';
import {
  subscribe as subscribePlayerToolsDrawer,
  onDrawerChange as onPlayerToolsDrawerChange,
  open as openPlayerToolsDrawer,
  close as closePlayerToolsDrawer,
} from './player-tools-drawer.js';
import { sendEventToDiscordWorker } from './discord-events.js';
import { PLAYER_CREDIT_EVENTS } from './player-credit-events.js';
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
import { collectSnapshotParticipants, applySnapshotParticipants, registerSnapshotParticipant } from './snapshot-registry.js';
import { hasPin, setPin, verifyPin as verifyStoredPin, clearPin, syncPin, ensureAuthoritativePinState } from './pin.js';
import { readLastSaveName, writeLastSaveName } from './last-save.js';
import { openPowerWizard } from './power-wizard.js';
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
import {
  POWER_ACTION_TYPES,
  POWER_DAMAGE_DICE,
  POWER_DAMAGE_TYPES,
  POWER_DURATIONS,
  POWER_EFFECT_TAGS,
  POWER_INTENSITIES,
  POWER_ON_SAVE_OPTIONS,
  POWER_RANGE_QUICK_VALUES,
  POWER_RANGE_UNITS,
  POWER_SAVE_ABILITIES,
  POWER_SCALING_OPTIONS,
  POWER_SHAPE_RANGES,
  POWER_STYLES,
  POWER_STYLE_ATTACK_DEFAULTS,
  POWER_STYLE_CASTER_SAVE_DEFAULTS,
  POWER_SUGGESTION_STRENGTHS,
  POWER_TARGET_SHAPES,
  POWER_USES,
  EFFECT_ON_SAVE_SUGGESTIONS,
  EFFECT_SAVE_SUGGESTIONS,
  getRangeOptionsForShape,
} from './power-metadata.js';
import { toast, dismissToast } from './notifications.js';
import {
  ensureOfflineAssets,
  getStoredOfflineManifestTimestamp,
  getStoredOfflineManifestVersion,
  setStoredOfflineManifestVersion,
  supportsOfflineCaching,
} from './offline-cache.js';
import { createVirtualizedList } from './virtualized-list.js';

let animate = () => null;
let fadeOut = () => null;
let fadePop = () => null;
let motion = (_token, fallback) => fallback;
let easingVar = (_token, fallback) => fallback;

(async () => {
  try {
    const anim = await import('./anim.js');
    animate = anim.animate || animate;
    fadeOut = anim.fadeOut || fadeOut;
    fadePop = anim.fadePop || fadePop;
    motion = anim.motion || motion;
    easingVar = anim.easing || easingVar;
  } catch (err) {
    try {
      console.error('Failed to load animation helpers', err);
    } catch (logErr) {}
  }
})();

const REDUCED_MOTION_TOKEN = 'prefers-reduced-motion';
const REDUCED_MOTION_NO_PREFERENCE_PATTERN = /prefers-reduced-motion\s*:\s*no-preference/;
const REDUCED_MOTION_REDUCE_PATTERN = /prefers-reduced-motion\s*:\s*reduce/;
const REDUCED_DATA_TOKEN = 'prefers-reduced-data';
const SAVE_DATA_TOKEN = 'save-data';
const IS_JSDOM_ENV = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');

function cancelFx(el) {
  if (!el) return;
  try {
    (el.getAnimations?.() || []).forEach(a => a.cancel());
    if (typeof el.getAnimations === 'function') {
      (el.getAnimations({ subtree: true }) || []).forEach(a => a.cancel());
    }
  } catch {}
}

function isCharacterSaveQuotaError(err) {
  if (!err) return false;
  if (err.code === 'character-save-quota-exceeded') return true;
  if (err.name === 'CharacterSaveQuotaError') return true;
  if (err.isQuotaExceeded === true) return true;
  if (err.originalError && err.originalError.code === 'local-storage-quota-exceeded') return true;
  return false;
}

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia === 'function') {
    const originalMatchMedia = window.matchMedia.bind(window);
    const suppressedTokens = [REDUCED_DATA_TOKEN, SAVE_DATA_TOKEN];
    const noop = () => {};
    const createSuppressedMediaQueryList = (queryString, matches) => ({
      matches,
      media: queryString,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: () => false,
    });
    window.matchMedia = query => {
      if (typeof query === 'string') {
        const normalizedQuery = query.toLowerCase();
        if (normalizedQuery.includes(REDUCED_MOTION_TOKEN)) {
          const hasNoPreference = REDUCED_MOTION_NO_PREFERENCE_PATTERN.test(normalizedQuery);
          const shouldMatch = hasNoPreference || !REDUCED_MOTION_REDUCE_PATTERN.test(normalizedQuery);
          return createSuppressedMediaQueryList(query, shouldMatch);
        }
        if (suppressedTokens.some(token => normalizedQuery.includes(token))) {
          return createSuppressedMediaQueryList(query, false);
        }
      }
      try {
        return originalMatchMedia(query);
      } catch (err) {
        return createSuppressedMediaQueryList(query, false);
      }
    };
  }

  const disableSaveDataPreference = () => {
    try {
      if (typeof navigator === 'undefined') {
        return;
      }
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!connection) {
        return;
      }
      const forceValue = target => {
        try {
          Object.defineProperty(target, 'saveData', { configurable: true, enumerable: true, value: false, writable: true });
        } catch (err) {
          try {
            target.saveData = false;
          } catch (err2) {
            /* ignore inability to override */
          }
        }
      };
      forceValue(connection);
      if (typeof connection.addEventListener === 'function') {
        const handler = () => forceValue(connection);
        try {
          connection.addEventListener('change', handler);
        } catch (err) {
          /* ignore listener failures */
        }
      }
    } catch (err) {
      /* ignore inability to override data saver */
    }
  };

  disableSaveDataPreference();
}


function isDmSessionActive() {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('dmLoggedIn') === '1';
  } catch {
    return false;
  }
}


let dmBootstrapPromise = null;
let dmToolsInitialized = false;

function ensureDmToolsLoaded() {
  if (!dmBootstrapPromise) {
    dmBootstrapPromise = import('./dm.js')
      .then(module => {
        if (module && typeof module.initializeDmTools === 'function') {
          return Promise.resolve(module.initializeDmTools()).then(result => {
            dmToolsInitialized = true;
            return result;
          });
        }
        dmToolsInitialized = true;
        return null;
      })
      .catch(err => {
        dmBootstrapPromise = null;
        dmToolsInitialized = false;
        console.error('Failed to load DM tools module', err);
        throw err;
      });
  }
  return dmBootstrapPromise;
}

function attachDmBootstrapHandler(element) {
  if (!element) {
    return;
  }
  const handler = () => {
    const alreadyInitialized = dmToolsInitialized;
    ensureDmToolsLoaded()
      .then(() => {
        if (alreadyInitialized) {
          return;
        }
        if (!element.isConnected) {
          return;
        }
        if (typeof element.click === 'function') {
          element.click();
        }
      })
      .catch(error => {
        console.error('Failed to initialize DM tools', error);
      });
  };
  element.addEventListener('click', handler, { once: true });
}

function bootstrapDmToolsOnDemand() {
  if (isDmSessionActive()) {
    ensureDmToolsLoaded().catch(err => {
      console.error('Failed to preload DM tools for active session', err);
    });
  }
  attachDmBootstrapHandler($('dm-login'));
  attachDmBootstrapHandler($('dm-tools-toggle'));
}

bootstrapDmToolsOnDemand();


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
const CC = (window.CC = window.CC || {});
CC.partials = CC.partials || {};
CC.savePartial = (k, d) => { CC.partials[k] = d; };
CC.loadPartial = k => CC.partials[k];

const contentRefreshHandlers = new Set();

function registerContentRefreshTask(handler) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  contentRefreshHandlers.add(handler);
  return () => contentRefreshHandlers.delete(handler);
}

function runContentRefreshHandlers(detail) {
  const handlers = Array.from(contentRefreshHandlers);
  if (!handlers.length) {
    return Promise.resolve({ executed: false, failed: false });
  }
  const outcomes = handlers.map(handler => {
    try {
      const result = handler(detail);
      if (result && typeof result.then === 'function') {
        return result
          .then(() => ({ failed: false }))
          .catch(error => {
            console.error('Content refresh task failed', error);
            return { failed: true };
          });
      }
      return Promise.resolve({ failed: false });
    } catch (error) {
      console.error('Content refresh task failed', error);
      return Promise.resolve({ failed: true });
    }
  });
  return Promise.all(outcomes).then(results => ({
    executed: true,
    failed: results.some(result => result.failed),
  }));
}

CC.registerContentRefreshTask = registerContentRefreshTask;

function resetToastNotifications({ restoreFocus = false } = {}) {
  const candidates = [];
  if (typeof globalThis !== 'undefined') {
    const globalFn = globalThis.clearToastQueue;
    if (typeof globalFn === 'function') {
      candidates.push(globalFn);
    }
  }
  if (typeof window !== 'undefined' && typeof window.clearToastQueue === 'function') {
    const bound = window.clearToastQueue.bind(window);
    candidates.push(bound);
  }
  for (const fn of candidates) {
    try {
      fn({ restoreFocus });
      return true;
    } catch (err) {
      /* ignore failures and try fallbacks */
    }
  }
  try {
    dismissToast();
  } catch (err) {
    /* ignore dismissal failures */
  }
  return false;
}

function ensureToastContent(message) {
  if (typeof document === 'undefined') return;
  const toastEl = document.getElementById('toast');
  if (!toastEl || typeof message !== 'string') return;
  const apply = () => {
    try {
      const messageNode = toastEl.querySelector('.toast__message');
      const currentText = messageNode && typeof messageNode.textContent === 'string'
        ? messageNode.textContent.trim()
        : typeof toastEl.textContent === 'string'
          ? toastEl.textContent.trim()
          : '';
      if (!currentText) {
        if (messageNode) {
          messageNode.textContent = message;
        } else {
          toastEl.textContent = message;
        }
      }
    } catch (err) {
      /* ignore inability to coerce toast content */
    }
  };
  apply();
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(apply);
    return;
  }
  Promise.resolve()
    .then(apply)
    .catch(apply);
}

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

    if (typeof window?.getComputedStyle === 'function') {
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
function schedulePlayerToolsBadgeSync(callback) {
  if (typeof callback !== 'function') return;
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      try {
        callback();
      } catch {
        /* ignore badge sync errors */
      }
    });
    return;
  }
  if (typeof Promise === 'function') {
    Promise.resolve().then(() => {
      try {
        callback();
      } catch {
        /* ignore badge sync errors */
      }
    });
    return;
  }
  if (typeof setTimeout === 'function') {
    setTimeout(() => {
      try {
        callback();
      } catch {
        /* ignore badge sync errors */
      }
    }, 0);
  }
}

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
const miniGameReminderCard = typeof document !== 'undefined'
  ? document.querySelector('[data-mini-game-reminder]')
  : null;
const miniGameReminderSummary = typeof document !== 'undefined'
  ? document.querySelector('[data-mini-game-reminder-summary]')
  : null;
const miniGameReminderGame = typeof document !== 'undefined'
  ? document.querySelector('[data-mini-game-reminder-game]')
  : null;
const miniGameReminderStatus = typeof document !== 'undefined'
  ? document.querySelector('[data-mini-game-reminder-status]')
  : null;
const miniGameReminderMeta = typeof document !== 'undefined'
  ? document.querySelector('[data-mini-game-reminder-meta]')
  : null;
const miniGameReminderAction = typeof document !== 'undefined'
  ? document.querySelector('[data-mini-game-reminder-action]')
  : null;
const MINI_GAME_INVITE_ANIMATION_CLASS = 'mini-game-invite--animate';

const MINI_GAME_REMINDER_ELIGIBLE_STATUSES = new Set(['pending', 'active']);
const MINI_GAME_REMINDER_STATUS_PRIORITY = { pending: 0, active: 1 };

function shouldAnimateMiniGameInvite() {
  return Boolean(miniGameInviteOverlay);
}

function prepareMiniGameInviteAnimation() {
  if (!miniGameInviteOverlay) return;
  miniGameInviteOverlay.classList.remove(MINI_GAME_INVITE_ANIMATION_CLASS);
  if (!shouldAnimateMiniGameInvite()) return;
  void miniGameInviteOverlay.offsetWidth;
  miniGameInviteOverlay.classList.add(MINI_GAME_INVITE_ANIMATION_CLASS);
}

function clearMiniGameInviteAnimation() {
  if (!miniGameInviteOverlay) return;
  miniGameInviteOverlay.classList.remove(MINI_GAME_INVITE_ANIMATION_CLASS);
}

const MINI_GAME_STORAGE_KEY_PREFIX = 'cc:mini-game:deployment:';
const MINI_GAME_LAST_DEPLOYMENT_KEY = 'cc:mini-game:last-deployment';
const hasMiniGameInviteUi = Boolean(miniGameInviteOverlay && miniGameInviteAccept && miniGameInviteDecline);
let miniGameActivePlayer = '';
let miniGameUnsubscribe = null;
let miniGamePlayerCheckTimer = null;
let isPlayerToolsDrawerOpen = false;
let isTickerDrawerOpen = false;
let setTickerDrawerOpen = () => {};
const MINI_GAME_BROADCAST_CHANNEL = 'cc:mini-games';
const miniGameKnownDeployments = new Map();
const miniGamePromptedDeployments = new Set();
const miniGameInviteQueue = [];
let miniGameActiveInvite = null;
let miniGameSyncInitialized = false;

let miniGameBroadcastChannel = null;
let miniGameReminderEntryId = '';

function ensureMiniGameBroadcastChannel() {
  if (miniGameBroadcastChannel || typeof BroadcastChannel !== 'function') {
    return miniGameBroadcastChannel;
  }
  try {
    miniGameBroadcastChannel = new BroadcastChannel(MINI_GAME_BROADCAST_CHANNEL);
  } catch (err) {
    miniGameBroadcastChannel = null;
  }
  return miniGameBroadcastChannel;
}

function broadcastMiniGameDeploymentUpdate(entry, updates = {}) {
  const channel = ensureMiniGameBroadcastChannel();
  if (!channel) return;
  const player = typeof entry?.player === 'string' ? entry.player : '';
  const deploymentId = typeof entry?.id === 'string' ? entry.id : '';
  if (!player || !deploymentId) return;
  const status = typeof updates?.status === 'string'
    ? updates.status
    : typeof entry?.status === 'string'
      ? entry.status
      : '';
  const payload = {
    type: 'mini-game-deployment-update',
    player,
    deploymentId,
    status,
  };
  if (updates && typeof updates === 'object' && Object.keys(updates).length) {
    payload.updates = { ...updates };
  }
  try {
    channel.postMessage(payload);
  } catch (err) {
    /* ignore broadcast errors */
  }
}

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

function normalizeMiniGameStatus(status) {
  if (typeof status !== 'string') return '';
  return status.trim().toLowerCase();
}

function isMiniGameReminderStatus(status) {
  return MINI_GAME_REMINDER_ELIGIBLE_STATUSES.has(normalizeMiniGameStatus(status));
}

function miniGameReminderPriority(entry) {
  const status = normalizeMiniGameStatus(entry?.status);
  if (Object.prototype.hasOwnProperty.call(MINI_GAME_REMINDER_STATUS_PRIORITY, status)) {
    return MINI_GAME_REMINDER_STATUS_PRIORITY[status];
  }
  return Number.MAX_SAFE_INTEGER;
}

function resolveMiniGameReminderEntry(id) {
  if (!id) return null;
  if (miniGameActiveInvite && miniGameActiveInvite.id === id) {
    return miniGameActiveInvite;
  }
  if (miniGameKnownDeployments.has(id)) {
    return miniGameKnownDeployments.get(id);
  }
  for (let i = 0; i < miniGameInviteQueue.length; i++) {
    const queued = miniGameInviteQueue[i];
    if (queued && queued.id === id) {
      return queued;
    }
  }
  return null;
}

function findMiniGameReminderEntry() {
  if (!hasMiniGameInviteUi) return null;
  if (!miniGameReminderCard && !miniGameReminderSummary && !miniGameReminderAction) return null;
  const overlayOpen = miniGameInviteOverlay && !miniGameInviteOverlay.classList.contains('hidden');
  const activeStatus = normalizeMiniGameStatus(miniGameActiveInvite?.status);
  const skipPendingId = overlayOpen && activeStatus === 'pending' ? miniGameActiveInvite?.id : null;
  const candidates = new Map();
  const addCandidate = (entry) => {
    if (!entry || !entry.id) return;
    if (!isMiniGameReminderStatus(entry.status)) return;
    if (skipPendingId && entry.id === skipPendingId) return;
    if (!candidates.has(entry.id)) {
      candidates.set(entry.id, entry);
    }
  };
  if (miniGameActiveInvite) addCandidate(miniGameActiveInvite);
  for (let i = 0; i < miniGameInviteQueue.length; i++) {
    addCandidate(miniGameInviteQueue[i]);
  }
  miniGameKnownDeployments.forEach(entry => addCandidate(entry));
  if (candidates.size === 0) {
    return null;
  }
  const sorted = Array.from(candidates.values()).sort((a, b) => {
    const statusDelta = miniGameReminderPriority(a) - miniGameReminderPriority(b);
    if (statusDelta !== 0) return statusDelta;
    const timeDelta = miniGameTimestamp(a) - miniGameTimestamp(b);
    if (timeDelta !== 0) return timeDelta;
    return (a.id || '').localeCompare(b.id || '');
  });
  return sorted[0] || null;
}

function formatMiniGameReminderStatus(status) {
  const normalized = normalizeMiniGameStatus(status);
  if (!normalized) return 'Pending';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatMiniGameReminderMeta(entry) {
  if (!entry) return '';
  const tagline = typeof entry.tagline === 'string' ? entry.tagline.trim() : '';
  if (tagline) return tagline;
  const issuer = typeof entry.issuedBy === 'string' ? entry.issuedBy.trim() : '';
  if (issuer) return `From ${issuer}`;
  return '';
}

function updateMiniGameReminder() {
  if (!miniGameReminderCard) {
    miniGameReminderEntryId = '';
    schedulePlayerToolsBadgeSync(() => removePlayerToolsBadgeReason('mini-game'));
    return;
  }

  const entry = findMiniGameReminderEntry();
  miniGameReminderEntryId = entry?.id || '';
  if (!entry) {
    miniGameReminderCard.hidden = true;
    miniGameReminderCard.setAttribute('hidden', '');
    miniGameReminderCard.setAttribute('aria-hidden', 'true');
    if (miniGameReminderSummary) {
      miniGameReminderSummary.removeAttribute('data-pending');
      miniGameReminderSummary.removeAttribute('data-animate');
      miniGameReminderSummary.removeAttribute('data-drawer-open');
    }
    if (miniGameReminderAction) {
      miniGameReminderAction.disabled = true;
      miniGameReminderAction.setAttribute('aria-disabled', 'true');
      miniGameReminderAction.setAttribute('aria-label', 'Resume mini-game mission');
    }
    schedulePlayerToolsBadgeSync(() => removePlayerToolsBadgeReason('mini-game'));
    return;
  }

  const status = normalizeMiniGameStatus(entry.status);
  const gameName = entry.gameName || getMiniGameDefinition(entry.gameId)?.name || 'Mini-game';
  const overlayOpen = miniGameInviteOverlay && !miniGameInviteOverlay.classList.contains('hidden');
  const actionAvailable = status === 'pending' || (status === 'active' && typeof entry.gameUrl === 'string' && entry.gameUrl.length > 0);

  miniGameReminderCard.hidden = false;
  miniGameReminderCard.removeAttribute('hidden');
  miniGameReminderCard.setAttribute('aria-hidden', 'false');
  const shouldShowMiniGameBadge = actionAvailable;
  schedulePlayerToolsBadgeSync(() => {
    if (shouldShowMiniGameBadge) {
      addPlayerToolsBadgeReason('mini-game');
    } else {
      removePlayerToolsBadgeReason('mini-game');
    }
  });

  if (miniGameReminderGame) {
    miniGameReminderGame.textContent = gameName;
  }
  if (miniGameReminderStatus) {
    miniGameReminderStatus.textContent = `Status: ${formatMiniGameReminderStatus(status)}`;
  }
  if (miniGameReminderMeta) {
    const metaText = formatMiniGameReminderMeta(entry);
    if (metaText) {
      miniGameReminderMeta.textContent = metaText;
      miniGameReminderMeta.hidden = false;
    } else {
      miniGameReminderMeta.textContent = '';
      miniGameReminderMeta.hidden = true;
    }
  }
  if (miniGameReminderSummary) {
    if (status === 'pending') {
      miniGameReminderSummary.setAttribute('data-pending', 'true');
      miniGameReminderSummary.setAttribute('data-animate', overlayOpen ? 'false' : 'true');
      if (isPlayerToolsDrawerOpen) {
        miniGameReminderSummary.setAttribute('data-drawer-open', 'true');
      } else {
        miniGameReminderSummary.removeAttribute('data-drawer-open');
      }
    } else {
      miniGameReminderSummary.setAttribute('data-pending', 'false');
      miniGameReminderSummary.setAttribute('data-animate', 'false');
      miniGameReminderSummary.removeAttribute('data-drawer-open');
    }
  }
  if (miniGameReminderAction) {
    miniGameReminderAction.disabled = !actionAvailable;
    miniGameReminderAction.setAttribute('aria-disabled', actionAvailable ? 'false' : 'true');
    const actionLabel = status === 'pending' ? 'Accept' : 'Resume';
    miniGameReminderAction.textContent = actionLabel;
    const labelSuffix = actionAvailable ? ` ${gameName}` : '';
    miniGameReminderAction.setAttribute('aria-label', `${actionLabel}${labelSuffix}`.trim());
  }
}

function handleMiniGameReminderAction() {
  if (!hasMiniGameInviteUi || !miniGameReminderEntryId) return;
  const entry = resolveMiniGameReminderEntry(miniGameReminderEntryId);
  if (!entry) {
    updateMiniGameReminder();
    return;
  }
  const status = normalizeMiniGameStatus(entry.status);
  if (status === 'pending') {
    miniGameActiveInvite = entry;
    removeMiniGameQueueEntry(entry.id);
    populateMiniGameInvite(entry);
    prepareMiniGameInviteAnimation();
    show('mini-game-invite');
    updateMiniGameReminder();
    return;
  }
  if (status === 'active') {
    launchMiniGame(entry);
    updateMiniGameReminder();
  }
}

function getLocalStorageSafe() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (err) {
    return null;
  }
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
  const storage = getLocalStorageSafe();
  if (storage) {
    try {
      const stored = readLastSaveName();
      const normalized = sanitizeMiniGamePlayerName(stored);
      if (normalized) return normalized;
    } catch {}
  }
  return '';
}

function removeMiniGameQueueEntry(id) {
  if (!id || !miniGameInviteQueue.length) return;
  let removed = false;
  for (let i = miniGameInviteQueue.length - 1; i >= 0; i--) {
    if (miniGameInviteQueue[i]?.id === id) {
      miniGameInviteQueue.splice(i, 1);
      removed = true;
    }
  }
  if (removed) {
    updateMiniGameReminder();
  }
}

function resetMiniGameInvites() {
  miniGameKnownDeployments.clear();
  miniGamePromptedDeployments.clear();
  miniGameInviteQueue.length = 0;
  miniGameActiveInvite = null;
  if (hasMiniGameInviteUi) {
    clearMiniGameInviteAnimation();
    hide('mini-game-invite');
  }
  updateMiniGameReminder();
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
  updateMiniGameReminder();
}

function showNextMiniGameInvite() {
  if (!hasMiniGameInviteUi) return;
  if (miniGameActiveInvite && miniGameActiveInvite.status === 'pending') return;
  if (!miniGameInviteQueue.length) return;
  const next = miniGameInviteQueue.shift();
  miniGameActiveInvite = next;
  populateMiniGameInvite(next);
  prepareMiniGameInviteAnimation();
  show('mini-game-invite');
  const gameLabel = next.gameName || getMiniGameDefinition(next.gameId)?.name || 'Mini-game';
  toast(`Incoming mini-game: ${gameLabel}`, {
    type: 'info',
    meta: {
      source: 'mini-game',
      importance: 'high',
      action: 'invite',
      log: true,
    },
  });
  updateMiniGameReminder();
}

function closeMiniGameInvite(updatedEntry) {
  if (!hasMiniGameInviteUi) return;
  clearMiniGameInviteAnimation();
  hide('mini-game-invite');
  if (updatedEntry?.id) {
    miniGameKnownDeployments.set(updatedEntry.id, updatedEntry);
  }
  miniGameActiveInvite = null;
  showNextMiniGameInvite();
  updateMiniGameReminder();
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
  updateMiniGameReminder();
}

function persistMiniGameLaunch(entry) {
  if (!entry || !entry.id) return;
  const storage = getLocalStorageSafe();
  if (!storage) return;
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
    storage.setItem(`${MINI_GAME_STORAGE_KEY_PREFIX}${entry.id}`, JSON.stringify(payload));
    storage.setItem(MINI_GAME_LAST_DEPLOYMENT_KEY, entry.id);
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
    toast('Failed to update mini-game assignment', {
      type: 'error',
      meta: {
        source: 'mini-game',
        importance: 'critical',
        action: 'update-failed',
        log: true,
      },
    });
    if (acceptBtn) acceptBtn.disabled = false;
    if (declineBtn) declineBtn.disabled = false;
    return;
  }
  const merged = { ...entry, ...updates };
  miniGameKnownDeployments.set(id, merged);
  miniGamePromptedDeployments.delete(id);
  removeMiniGameQueueEntry(id);
  broadcastMiniGameDeploymentUpdate(merged, updates);
  if (acceptBtn) acceptBtn.disabled = false;
  if (declineBtn) declineBtn.disabled = false;
  clearMiniGameInviteAnimation();
  hide('mini-game-invite');
  miniGameActiveInvite = null;
  let hadToastContent = false;
  if (typeof document !== 'undefined') {
    const toastEl = document.getElementById('toast');
    if (toastEl && typeof toastEl.textContent === 'string') {
      hadToastContent = toastEl.textContent.trim().length > 0;
    }
  }
  if (hadToastContent) {
    resetToastNotifications({ restoreFocus: false });
  }
  if (action === 'accept') {
    toast('Mini-game accepted', {
      type: 'success',
      meta: {
        source: 'mini-game',
        importance: 'high',
        action: 'accepted',
        log: true,
      },
    });
    ensureToastContent('Mini-game accepted');
    launchMiniGame(merged);
  } else {
    toast('Mini-game declined', {
      type: 'info',
      meta: {
        source: 'mini-game',
        importance: 'high',
        action: 'declined',
        log: true,
      },
    });
    ensureToastContent('Mini-game declined');
  }
  showNextMiniGameInvite();
  updateMiniGameReminder();
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
    if (
      miniGamePlayerCheckTimer === null
      && typeof window.setInterval === 'function'
      && !IS_JSDOM_ENV
    ) {
      miniGamePlayerCheckTimer = window.setInterval(
        syncMiniGamePlayerName,
        MINI_GAME_PLAYER_CHECK_INTERVAL_MS,
      );
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('character-saved', syncMiniGamePlayerName);
  }
}

if (typeof document !== 'undefined') {
  setupMiniGamePlayerSync();
  if (miniGameReminderAction) {
    miniGameReminderAction.addEventListener('click', handleMiniGameReminderAction);
  }
  updateMiniGameReminder();
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

const LAUNCH_DURATION_MS = 8000;
const LAUNCH_MIN_VISIBLE = LAUNCH_DURATION_MS;
const LAUNCH_MAX_WAIT = LAUNCH_DURATION_MS;

const WELCOME_MODAL_ID = 'modal-welcome';
const WELCOME_SEEN_KEY_PREFIX = 'cc:welcome-seen:';
const TOUCH_LOCK_CLASS = 'touch-controls-disabled';
const TOUCH_UNLOCK_DELAY_MS = 250;
let welcomeModalDismissed = false;
let welcomeModalQueued = false;
let welcomeModalPrepared = false;
let touchUnlockTimer = null;
let waitingForTouchUnlock = false;
let launchSequenceComplete = false;
let welcomeSequenceComplete = false;
let pendingPinnedAutoLoad = null;
let pendingPinPromptActive = false;
let pinInteractionGuard = null;
let pinUnlockInProgress = false;

const CHARACTER_CONFIRMATION_MODAL_ID = 'modal-character-confirmation';
const CHARACTER_CONFIRMATION_TIMEOUT_MS = 3200;
let characterConfirmationQueue = [];
let characterConfirmationActive = null;
let characterConfirmationTimer = null;
let characterConfirmationPreviousFocus = null;

function isCharacterConfirmationBlocked() {
  const body = typeof document !== 'undefined' ? document.body : null;
  const launching = !!(body && body.classList.contains('launching'));
  if (launching || !launchSequenceComplete) return true;
  const welcomeModal = getWelcomeModal();
  const welcomeVisible = welcomeModal && !welcomeModal.classList.contains('hidden');
  if (welcomeVisible || !welcomeSequenceComplete) return true;
  return false;
}

function describeCharacterConfirmation(entry) {
  const variant = entry?.variant || 'loaded';
  const name = entry?.name || 'Character';
  const copy = {
    loaded: { title: 'Character Loaded', prefix: 'Loaded character' },
    recovered: { title: 'Character Recovered', prefix: 'Recovered character' },
    created: { title: 'Character Created', prefix: 'Created character' },
    unlocked: { title: 'Character Unlocked', prefix: 'Loaded character' },
  };
  const chosen = copy[variant] || copy.loaded;
  return {
    title: chosen.title,
    message: `${chosen.prefix}: ${name}`,
  };
}

function clearCharacterConfirmationTimer() {
  if (characterConfirmationTimer) {
    clearTimeout(characterConfirmationTimer);
    characterConfirmationTimer = null;
  }
}

function dismissCharacterConfirmation() {
  if (!characterConfirmationActive) return;
  clearCharacterConfirmationTimer();
  hide(CHARACTER_CONFIRMATION_MODAL_ID);
  const restoreTarget = characterConfirmationPreviousFocus;
  characterConfirmationActive = null;
  characterConfirmationPreviousFocus = null;
  if (restoreTarget && typeof restoreTarget.focus === 'function' && restoreTarget.isConnected) {
    try { restoreTarget.focus(); } catch {}
  }
  requestAnimationFrame(() => flushCharacterConfirmationQueue());
}

function showCharacterConfirmation(entry) {
  const modal = document.getElementById(CHARACTER_CONFIRMATION_MODAL_ID);
  if (!modal) return;
  const titleEl = document.getElementById('character-confirmation-title');
  const messageEl = document.getElementById('character-confirmation-message');
  const continueBtn = document.getElementById('character-confirmation-continue');
  const description = describeCharacterConfirmation(entry);
  if (titleEl) titleEl.textContent = description.title;
  if (messageEl) messageEl.textContent = description.message;
  characterConfirmationActive = entry;
  characterConfirmationPreviousFocus = document.activeElement || null;
  clearCharacterConfirmationTimer();
  show(CHARACTER_CONFIRMATION_MODAL_ID);
  requestAnimationFrame(() => {
    try {
      if (continueBtn) continueBtn.focus();
    } catch {}
  });
  characterConfirmationTimer = setTimeout(() => {
    dismissCharacterConfirmation();
  }, CHARACTER_CONFIRMATION_TIMEOUT_MS);
}

function flushCharacterConfirmationQueue() {
  if (characterConfirmationActive) return;
  if (isCharacterConfirmationBlocked()) return;
  const next = characterConfirmationQueue.shift();
  if (!next) return;
  showCharacterConfirmation(next);
}

function queueCharacterConfirmation({ name, variant = 'loaded', key, meta } = {}) {
  const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : 'Character';
  const dedupeKey = key || `${variant}:${normalizedName}:${meta?.savedAt ?? Date.now()}`;
  if (characterConfirmationActive?.key === dedupeKey) return;
  if (characterConfirmationQueue.some(entry => entry.key === dedupeKey)) return;
  characterConfirmationQueue.push({ key: dedupeKey, name: normalizedName, variant, meta });
  flushCharacterConfirmationQueue();
}

let playerToolsTabElement = null;

function getPlayerToolsTabElement() {
  if (playerToolsTabElement && playerToolsTabElement.isConnected) {
    return playerToolsTabElement;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  const tab = document.getElementById('player-tools-tab');
  if (tab) {
    playerToolsTabElement = tab;
  }
  return tab;
}

function setPlayerToolsTabHidden(hidden) {
  const tab = getPlayerToolsTabElement();
  if (!tab) return;
  if (tab.hidden !== hidden) {
    tab.hidden = hidden;
  }
  tab.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

function getWelcomeSeenKey() {
  const storage = getLocalStorageSafe();
  const build = storage ? storage.getItem('cc:sw-build') : '';
  return `${WELCOME_SEEN_KEY_PREFIX}${build || 'default'}`;
}

try {
  const storage = getLocalStorageSafe();
  if (storage) {
    welcomeModalDismissed = storage.getItem(getWelcomeSeenKey()) === 'true';
  }
} catch {}

welcomeSequenceComplete = welcomeModalDismissed;

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
  if (typeof document === 'undefined' || !document) return null;
  try {
    return document.getElementById(WELCOME_MODAL_ID);
  } catch {
    return null;
  }
}

function prepareWelcomeModal() {
  const modal = getWelcomeModal();
  if (!modal) return null;
  if (!welcomeModalPrepared) {
    welcomeModalPrepared = true;
    try {
      void modal.offsetHeight;
    } catch {
      /* ignore reflow errors */
    }
  }
  return modal;
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

function maybeShowWelcomeModal({ backgroundOnly = false } = {}) {
  const modal = prepareWelcomeModal();
  if (!modal) {
    unlockTouchControls({ immediate: true });
    markWelcomeSequenceComplete();
    return;
  }
  if (welcomeModalDismissed) {
    unlockTouchControls({ immediate: true });
    markWelcomeSequenceComplete();
    return;
  }
  const wasHidden = modal.classList.contains('hidden');
  if (backgroundOnly) {
    return;
  }
  const body = typeof document !== 'undefined' ? document.body : null;
  const isLaunching = !!(body && body.classList.contains('launching'));
  show(WELCOME_MODAL_ID);
  if (wasHidden) {
    setPlayerToolsTabHidden(true);
  }

  if (isLaunching) {
    if (wasHidden) {
      const skipButton = body ? body.querySelector('[data-skip-launch]') : null;
      if (skipButton && typeof skipButton.focus === 'function') {
        try {
          skipButton.focus();
        } catch {}
      }
    }
    return;
  }

  if (!wasHidden) {
    unlockTouchControls();
    return;
  }
  unlockTouchControls();
}

function dismissWelcomeModal() {
  welcomeModalDismissed = true;
  hide(WELCOME_MODAL_ID);
  setPlayerToolsTabHidden(false);
  unlockTouchControls();
  markWelcomeSequenceComplete();
  const storage = getLocalStorageSafe();
  if (storage) {
    try {
      storage.setItem(getWelcomeSeenKey(), 'true');
    } catch {}
  }
}

function queueWelcomeModal({ immediate = false, preload = false } = {}) {
  if (welcomeModalDismissed) {
    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body || !body.classList.contains('launching')) {
      unlockTouchControls();
    }
    return;
  }

  if (preload) {
    maybeShowWelcomeModal({ backgroundOnly: true });
    if (!immediate) {
      return;
    }
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
  if (typeof document === 'undefined' || IS_JSDOM_ENV) {
    unlockTouchControls();
    queueWelcomeModal({ immediate: true });
    markLaunchSequenceComplete();
    return;
  }
  const body = document.body;
  if(!body || !body.classList.contains('launching')){
    unlockTouchControls();
    queueWelcomeModal({ immediate: true });
    markLaunchSequenceComplete();
    return;
  }

  lockTouchControls();
  queueWelcomeModal({ preload: true });
  queueWelcomeModal({ immediate: true });

  const launchEl = document.getElementById('launch-animation');
  const video = launchEl ? launchEl.querySelector('video') : null;
  const skipButton = launchEl ? launchEl.querySelector('[data-skip-launch]') : null;
  let revealCalled = false;
  let playbackStartedAt = null;
  let fallbackTimer = null;
  let awaitingGesture = false;
  let cleanupMessaging = null;
  let bypassLaunchMinimum = false;
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
    markLaunchSequenceComplete();
    queueWelcomeModal({ immediate: true });
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
    if(typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, '__resetLaunchVideo')){
      try {
        delete window.__resetLaunchVideo;
      } catch (err) {
        window.__resetLaunchVideo = undefined;
      }
    }
    if(!bypassLaunchMinimum && playbackStartedAt && typeof performance !== 'undefined' && typeof performance.now === 'function'){
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

    let modified = false;
    const normalizeDataSource = source => {
      const dataSrc = source.getAttribute('data-src');
      if(!dataSrc) return;
      if(source.getAttribute('src') === dataSrc) return;
      source.setAttribute('src', dataSrc);
      modified = true;
    };

    const existingSources = vid.querySelectorAll('source');
    existingSources.forEach(normalizeDataSource);

    if(!vid.getAttribute('src')){
      const inlineSrc = vid.getAttribute('data-src');
      if(inlineSrc){
        vid.setAttribute('src', inlineSrc);
        modified = true;
      }
    }

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

      let manifestMissing = false;
      if(manifestAssets && manifestAssets.size > 0){
        const normalized = url.replace(/^\.\//, '').replace(/^\//, '');
        const manifestKey = `./${normalized}`;
        manifestMissing = !manifestAssets.has(manifestKey);
      }

      if(manifestMissing && !canProbe){
        continue;
      }

      let ok = false;
      if(canProbe){
        try {
          const response = await fetch(url, { method: 'HEAD' });
          ok = response && (response.ok || response.status === 405);
        } catch (err) {
          ok = false;
        }
      } else if(!manifestMissing){
        ok = true;
      }

      if(!ok) continue;

      const doc = vid.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if(!doc || typeof doc.createElement !== 'function'){
        continue;
      }
      const source = doc.createElement('source');
      source.src = url;
      if(type){
        source.type = type;
      }
      vid.appendChild(source);
      appended = true;
    }

    if((modified || appended) && !IS_JSDOM_ENV && typeof vid.load === 'function'){
      try {
        vid.load();
      } catch (err) {
        // ignore inability to reload with new sources
      }
    }

    return hasExistingSource || appended || modified;
  };

  if(!video){
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
      vid.playsInline = true;
    } catch (err) {
      // ignore inability to set playsInline property
    }
    try {
      vid.webkitPlaysInline = true;
    } catch (err) {
      // ignore inability to set legacy inline playback
    }
    try {
      if(!vid.hasAttribute('muted')){
        vid.setAttribute('muted', '');
      }
      vid.muted = true;
      vid.defaultMuted = true;
    } catch (err) {
      // ignore inability to force muted playback
    }
    try {
      vid.autoplay = true;
      if(!vid.hasAttribute('autoplay')){
        vid.setAttribute('autoplay', '');
      }
    } catch (err) {
      // ignore inability to set autoplay
    }
    try {
      vid.volume = 0;
    } catch (err) {
      // ignore inability to adjust volume
    }
    try {
      vid.setAttribute('disablepictureinpicture', '');
      vid.disablePictureInPicture = true;
    } catch (err) {
      // ignore inability to disable picture-in-picture
    }
    try {
      vid.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback noplaybackrate');
    } catch (err) {
      // ignore inability to set the controls list attribute
    }
    try {
      if (vid.controlsList && typeof vid.controlsList.add === 'function') {
        ['nodownload', 'nofullscreen', 'noremoteplayback', 'noplaybackrate'].forEach(token => {
          try {
            vid.controlsList.add(token);
          } catch (errToken) {
            // ignore failures to register token
          }
        });
      }
    } catch (err) {
      // ignore inability to manipulate the controlsList API
    }
    try {
      vid.setAttribute('disableremoteplayback', '');
      vid.disableRemotePlayback = true;
    } catch (err) {
      // ignore inability to disable remote playback
    }
    try {
      vid.removeAttribute('controls');
      vid.controls = false;
    } catch (err) {
      // ignore inability to disable controls
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
    playbackRetryTimer = clearTimer(playbackRetryTimer);
    if(!IS_JSDOM_ENV){
      try {
        video.pause();
      } catch {
        /* ignore inability to pause */
      }
      notifyServiceWorkerVideoPlayed();
    }
    revealApp();
  };

  if(skipButton){
    skipButton.addEventListener('click', event => {
      event.preventDefault();
      bypassLaunchMinimum = true;
      finalizeLaunch();
    });
  }

  window.addEventListener('launch-animation-skip', () => {
    bypassLaunchMinimum = true;
    finalizeLaunch();
  }, { once: true });

  const scheduleFallback = delay => {
    const rawDelay = typeof delay === 'number' && Number.isFinite(delay) ? delay : LAUNCH_MIN_VISIBLE;
    const clampedDelay = Math.min(Math.max(rawDelay, LAUNCH_MIN_VISIBLE), LAUNCH_MAX_WAIT);
    fallbackTimer = clearTimer(fallbackTimer);
    fallbackTimer = window.setTimeout(finalizeLaunch, clampedDelay);
  };

  let playbackRetryTimer = null;
  const schedulePlaybackRetry = () => {
    playbackRetryTimer = clearTimer(playbackRetryTimer);
    playbackRetryTimer = window.setTimeout(() => {
      playbackRetryTimer = clearTimer(playbackRetryTimer);
      attemptPlayback();
    }, 250);
  };

  function attemptPlayback(){
    ensureLaunchVideoAttributes(video);
    try {
      const playAttempt = video.play();
      if(playAttempt && typeof playAttempt.then === 'function'){
        playAttempt.then(() => {
          playbackRetryTimer = clearTimer(playbackRetryTimer);
        }).catch(() => {
          if(video.paused){
            schedulePlaybackRetry();
          } else {
            playbackRetryTimer = clearTimer(playbackRetryTimer);
          }
        });
      } else if(video.paused){
        schedulePlaybackRetry();
      } else {
        playbackRetryTimer = clearTimer(playbackRetryTimer);
      }
    } catch (err) {
      if(video.paused){
        schedulePlaybackRetry();
      } else {
        playbackRetryTimer = clearTimer(playbackRetryTimer);
      }
    }
  }

  const resetPlayback = () => {
    if(!IS_JSDOM_ENV){
      try {
        video.pause();
      } catch (err) {
        // ignore inability to pause
      }
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
    playbackRetryTimer = clearTimer(playbackRetryTimer);
    const naturalDuration = Number.isFinite(video.duration) && video.duration > 0
      ? (video.duration * 1000) + 500
      : LAUNCH_MAX_WAIT;
    scheduleFallback(naturalDuration);
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
let rulesLoadPromise = null;
let hasOpenedRulesModal = false;

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
  const docEl = document && document.documentElement ? document.documentElement : null;
  const style = docEl && docEl.style ? docEl.style : null;
  if (!docEl || !style || typeof style.setProperty !== 'function') return;
  const viewport = window.visualViewport;
  const fallback = window.innerHeight || docEl.clientHeight || 0;
  const viewportHeight = viewport && typeof viewport.height === 'number' && Number.isFinite(viewport.height) && viewport.height > 0
    ? viewport.height
    : 0;
  const fallbackHeight = typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  const candidate = Math.max(viewportHeight, fallbackHeight);
  if (!Number.isFinite(candidate) || candidate <= 0) return;
  const vh = candidate * 0.01;
  style.setProperty('--vh', `${vh}px`);
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
  if (!rulesEl) return;
  if (rulesLoaded) return;
  if (rulesLoadPromise) return rulesLoadPromise;
  try {
    const current = typeof rulesEl.textContent === 'string' ? rulesEl.textContent.trim() : '';
    if (!current || current === 'Failed to load rules.') {
      rulesEl.textContent = 'Loading rules…';
    }
  } catch {}
  rulesLoadPromise = (async () => {
    try {
      const res = await fetch(RULES_SRC);
      rulesEl.textContent = await res.text();
      rulesLoaded = true;
    } catch (e) {
      rulesEl.textContent = 'Failed to load rules.';
    } finally {
      rulesLoadPromise = null;
    }
  })();
  return rulesLoadPromise;
}

registerContentRefreshTask(async () => {
  if (!rulesEl) return;
  rulesLoaded = false;
  try {
    rulesEl.textContent = 'Loading latest rules…';
  } catch (err) {
    /* ignore text update failures */
  }
  try {
    await renderRules();
  } catch (err) {
    console.warn('Failed to refresh rules content', err);
  }
});

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

async function applyLockIcon(btn, { force = false } = {}){
  if(!btn) return;
  const name = btn.dataset.lock;
  const status = await ensureAuthoritativePinState(name, { force });
  btn.innerHTML = status.pinned ? ICON_LOCK : ICON_UNLOCK;
  btn.setAttribute('aria-label','Toggle PIN');
  Object.assign(btn.style, DELETE_ICON_STYLE);
}

function applyLockIcons(root=document){
  qsa('button[data-lock]', root).forEach(btn=>{
    applyLockIcon(btn).catch(err => console.error('Failed to apply lock icon', err));
  });
}


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
if (themeSpinnerEl) {
  themeSpinnerEl.addEventListener('animationend', () => {
    themeSpinnerEl.classList.remove('theme-toggle__spinner--spinning');
  });
}
const themeOverlayStyle = root ? root.style : null;

const normalizeThemeOverlayUrl = imagePath => {
  if (typeof imagePath !== 'string') return null;
  const trimmed = imagePath.trim();
  if (!trimmed) return null;
  if (/^url\(/i.test(trimmed)) return trimmed;
  const escaped = trimmed.replace(/["'\\)]/g, match => `\\${match}`);
  return `url('${escaped}')`;
};

const applyThemeOverlayStyles = (imagePath, tokens = []) => {
  if (!themeOverlayStyle) return;
  const urlValue = normalizeThemeOverlayUrl(imagePath);
  if (!urlValue) return;
  const backgroundValue = `var(--bg-color) ${urlValue} center/cover no-repeat`;
  themeOverlayStyle.setProperty('--bg-image-set', `image-set(${urlValue} type('image/png') 1x)`);
  tokens.forEach(token => {
    if (typeof token !== 'string' || !token.startsWith('--bg')) return;
    if (token === '--bg') {
      themeOverlayStyle.setProperty(token, backgroundValue);
    } else {
      themeOverlayStyle.setProperty(token, urlValue);
    }
  });
};

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
/**
 * Map CSS custom properties touched by each theme so accent/glow assets stay in sync with overlay layers.
 * Keep these lists aligned with styles/main.css :root.theme-* definitions when rotating art or gradients.
 */
const THEME_CSS_VARIABLES = Object.freeze({
  dark: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Dark.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-dark-avif', '--bg-dark-webp'])
    })
  }),
  light: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Light.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-light-avif', '--bg-light-webp'])
    })
  }),
  high: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/High Contrast.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-high-contrast-avif', '--bg-high-contrast-webp'])
    })
  }),
  forest: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Forest.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-forest-avif', '--bg-forest-webp'])
    })
  }),
  ocean: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Ocean.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-ocean-avif', '--bg-ocean-webp'])
    })
  }),
  mutant: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Mutant.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-mutant-avif', '--bg-mutant-webp'])
    })
  }),
  enhanced: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Enhanced Human.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-enhanced-human-avif', '--bg-enhanced-human-webp'])
    })
  }),
  magic: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Magic User.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-magic-user-avif', '--bg-magic-user-webp'])
    })
  }),
  alien: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Alien:Extraterrestrial.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-alien-extraterrestrial-avif', '--bg-alien-extraterrestrial-webp'])
    })
  }),
  mystic: Object.freeze({
    accentVars: Object.freeze(['--accent', '--accent-2']),
    glowVars: Object.freeze(['--accent', '--accent-2']),
    overlay: Object.freeze({
      backgroundImage: '../images/Mystical Being.PNG?v=2',
      imageTokens: Object.freeze(['--bg', '--bg-mystical-being-avif', '--bg-mystical-being-webp'])
    })
  })
});
/**
 * Apply a visual theme by toggling root classes and updating the button icon.
 * @param {string} t - theme identifier matching supported themes
 */
let activeTheme = null;
// Theme accents drive overlay gradients (card glows, initiative pulses) and the image-set backgrounds listed in THEME_CSS_VARIABLES.
// When updating theme art, ensure the accent variables remain aligned with the overlay tokens so background layers stay cohesive.
function spinThemeToggle(){
  if(!themeSpinnerEl) return;
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
  const themeTokens = THEME_CSS_VARIABLES[themeName];
  if (themeTokens && themeTokens.overlay) {
    root.dataset.themeOverlayTokens = themeTokens.overlay.imageTokens.join(',');
    root.dataset.themeOverlayImage = themeTokens.overlay.backgroundImage;
    applyThemeOverlayStyles(themeTokens.overlay.backgroundImage, themeTokens.overlay.imageTokens);
  }
  if (themeTokens && themeTokens.accentVars) {
    root.dataset.themeAccentVars = themeTokens.accentVars.join(',');
  }
  if (themeTokens && themeTokens.glowVars) {
    root.dataset.themeGlowVars = themeTokens.glowVars.join(',');
  }
  activeTheme = themeName;
}
function getStoredTheme(){
  const storage = getLocalStorageSafe();
  if (!storage) return null;
  try {
    return storage.getItem('theme');
  } catch (error) {
    console.warn('Failed to read stored theme', error);
    return null;
  }
}
function setStoredTheme(value){
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem('theme', value);
  } catch (error) {
    console.warn('Failed to persist theme preference', error);
  }
}
function loadTheme(){
  const stored = getStoredTheme();
  const theme = stored && THEMES.includes(stored) ? stored : 'dark';
  if (stored && !THEMES.includes(stored)) setStoredTheme(theme);
  applyTheme(theme, { animate: false });
}
loadTheme();

function toggleTheme(){
  const curr = getStoredTheme() || 'dark';
  const index = THEMES.includes(curr) ? THEMES.indexOf(curr) : 0;
  const next = THEMES[(index + 1) % THEMES.length];
  setStoredTheme(next);
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
      setStoredTheme(t);
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
  const menuToggleContainer =
    typeof btnMenu.closest === 'function' ? btnMenu.closest('.menu-toggle') : null;
  const menuSurfaceContainer =
    typeof menuActions.closest === 'function' ? menuActions.closest('.menu-surface') : null;

  const setMenuState = state => {
    [menuToggleContainer, menuSurfaceContainer, menuActions].forEach(el => {
      if (!el || typeof el !== 'object') return;
      if (el.dataset) {
        el.dataset.state = state;
      }
      if ((state === 'open' || state === 'closed') && typeof el.removeAttribute === 'function') {
        el.removeAttribute('data-loading');
      }
    });
  };

  setMenuState(isMenuOpen ? 'open' : 'closed');

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
    setMenuState('closed');
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
    setMenuState(immediate ? 'closed' : 'closing');
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
    setMenuState('opening');
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
      requestAnimationFrame(() => {
        if (!isMenuOpen) return;
        setMenuState('open');
      });
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
if (themeToggleEl) {
  themeToggleEl.addEventListener('click', e => {
    e.stopPropagation();
    toggleTheme();
  });
}

/* ========= tabs ========= */
const tabButtons = Array.from(qsa('.tab'));
let lastClickedTab = null;

const pointerActivationThreshold = 400;
const pointerEventTypes = new Set(['touch', 'pen']);
const getPointerTimestamp = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const isInstantPointerEvent = (event) =>
  event
  && typeof event.pointerType === 'string'
  && pointerEventTypes.has(event.pointerType);

const handleTabActivation = (btn, target) => {
  if (!target) return false;
  const activated = activateTab(target);
  if (!activated) {
    return false;
  }
  lastClickedTab = target;
  const iconContainer = btn.querySelector('.tab__icon');
  if (iconContainer) triggerTabIconAnimation(iconContainer);
  return true;
};

let lastInstantTabTarget = '';
let lastInstantTabTime = 0;

tabButtons.forEach(btn => {
  btn.addEventListener('pointerdown', event => {
    if (!isInstantPointerEvent(event)) return;
    const target = btn.getAttribute('data-go');
    if (!target) return;
    if (handleTabActivation(btn, target)) {
      lastInstantTabTarget = target;
      lastInstantTabTime = getPointerTimestamp();
    }
  });

  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-go');
    if (!target) return;
    const now = getPointerTimestamp();
    if (target === lastInstantTabTarget && now - lastInstantTabTime < pointerActivationThreshold) {
      lastInstantTabTarget = '';
      lastInstantTabTime = 0;
      return;
    }
    if (!handleTabActivation(btn, target)) {
      lastInstantTabTarget = '';
      lastInstantTabTime = 0;
    }
  });
});

let hasAnimatedInitialTab = false;
onTabChange(name => {
  if (!hasAnimatedInitialTab) {
    hasAnimatedInitialTab = true;
    lastClickedTab = null;
    return;
  }
  if (lastClickedTab === name) {
    lastClickedTab = null;
    return;
  }
  const btn = qs(`.tab[data-go="${name}"]`);
  const iconContainer = btn?.querySelector('.tab__icon');
  if (iconContainer) triggerTabIconAnimation(iconContainer);
});

const navigationType = getNavigationType();
const shouldForceCombatTab = navigationType === 'navigate' || navigationType === 'reload' || navigationType === null;

let initialTab = getActiveTab() || 'combat';
if (!shouldForceCombatTab) {
  try {
    const storedTab = localStorage.getItem('active-tab');
    if (storedTab && qs(`.tab[data-go="${storedTab}"]`)) initialTab = storedTab;
  } catch (e) {}
} else {
  scrollToTopOfCombat();
}
activateTab(initialTab);

const tickerDrawerPreferenceKeys = {
  open: 'ticker-open',
  initialized: 'ticker-preference-initialized',
};

const getTickerPreferenceStorage = () => {
  try {
    if(typeof window !== 'undefined' && 'localStorage' in window){
      return window.localStorage;
    }
  } catch(err){
    console.warn('Failed to access ticker preference storage', err);
  }
  return null;
};

const getStoredTickerPreference = () => {
  const storage = getTickerPreferenceStorage();
  if(!storage) return null;
  try {
    const raw = storage.getItem(tickerDrawerPreferenceKeys.open);
    if(raw === null) return null;
    if(raw === 'open' || raw === 'closed') return raw === 'open';
    if(raw === 'true' || raw === 'false') return raw === 'true';
    if(raw === '1' || raw === '0') return raw === '1';
  } catch(err){
    console.warn('Failed to read ticker preference', err);
  }
  return null;
};

const hasInitializedTickerPreference = () => {
  const storage = getTickerPreferenceStorage();
  if(!storage) return false;
  try {
    return storage.getItem(tickerDrawerPreferenceKeys.initialized) === '1';
  } catch(err){
    console.warn('Failed to read ticker preference initialization flag', err);
    return false;
  }
};

const markTickerPreferenceInitialized = () => {
  const storage = getTickerPreferenceStorage();
  if(!storage) return;
  try {
    storage.setItem(tickerDrawerPreferenceKeys.initialized, '1');
  } catch(err){
    console.warn('Failed to mark ticker preference initialization', err);
  }
};

const persistTickerPreference = nextOpen => {
  const storage = getTickerPreferenceStorage();
  if(!storage) return;
  try {
    storage.setItem(tickerDrawerPreferenceKeys.open, nextOpen ? 'open' : 'closed');
    storage.setItem(tickerDrawerPreferenceKeys.initialized, '1');
  } catch(err){
    console.warn('Failed to persist ticker preference', err);
  }
};

const tickerDrawer = qs('[data-ticker-drawer]');
const tickerPanel = tickerDrawer ? tickerDrawer.querySelector('[data-ticker-panel]') : null;
const tickerToggle = tickerDrawer ? tickerDrawer.querySelector('[data-ticker-toggle]') : null;
if(tickerDrawer && tickerPanel && tickerToggle){
  const panelInner = tickerPanel.querySelector('.ticker-drawer__panel-inner');
  const toggleLabel = tickerToggle.querySelector('[data-ticker-toggle-label]');
  const toggleIcon = tickerToggle.querySelector('[data-ticker-icon]');
  const TICKER_ICON_OPEN_SRC = 'images/caret (1).png';
  const TICKER_ICON_CLOSED_SRC = 'images/caret.png';
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
  const storedTickerPreference = getStoredTickerPreference();
  const preferenceInitialized = hasInitializedTickerPreference();
  const mobileDefaultState = tickerDrawer.getAttribute('data-mobile-default-state');
  const shouldApplyMobileDefault = !preferenceInitialized
    && storedTickerPreference === null
    && DEVICE_INFO?.isMobile
    && mobileDefaultState;

  let isOpen = tickerDrawer.getAttribute('data-state') !== 'closed';
  isTickerDrawerOpen = isOpen;
  if(storedTickerPreference !== null){
    isOpen = storedTickerPreference;
    if(!preferenceInitialized){
      markTickerPreferenceInitialized();
    }
  }else if(shouldApplyMobileDefault){
    isOpen = mobileDefaultState !== 'closed';
    persistTickerPreference(isOpen);
  }else if(!preferenceInitialized){
    markTickerPreferenceInitialized();
  }
  let isAnimating = false;

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

  const setToggleIcon = nextOpen => {
    if(!toggleIcon){
      return;
    }
    const nextSrc = nextOpen ? TICKER_ICON_OPEN_SRC : TICKER_ICON_CLOSED_SRC;
    if(toggleIcon.getAttribute('src') !== nextSrc){
      toggleIcon.setAttribute('src', nextSrc);
    }
  };

  const updateToggleState = nextOpen => {
    updateAccessibilityState(nextOpen);
    setToggleIcon(nextOpen);
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
    isTickerDrawerOpen = isOpen;
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
    isTickerDrawerOpen = isOpen;
    requestAnimationFrame(() => {
      tickerPanel.classList.add('is-animating');
      updateToggleState(nextOpen);
      setDrawerState(nextOpen ? 'opening' : 'closing');
      tickerPanel.style.height = formatPanelHeight(targetHeight);
      setPanelOffset(targetHeight);
      // Always allow the transition to play through so drawer motion is consistent.
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
    const nextOpen = !isOpen;
    animateDrawer(nextOpen);
    persistTickerPreference(nextOpen);
  });

  setTickerDrawerOpen = nextOpen => {
    if (typeof nextOpen !== 'boolean') {
      return;
    }
    if (isAnimating) {
      finalizeAnimation();
    }
    if (nextOpen === isOpen) {
      persistTickerPreference(nextOpen);
      setDrawerState(nextOpen ? 'open' : 'closed');
      updateToggleState(nextOpen);
      if (nextOpen) {
        tickerPanel.style.height = '';
      } else {
        tickerPanel.style.height = formatPanelHeight(getClosedPanelHeight());
      }
      setPanelOffset();
      isTickerDrawerOpen = nextOpen;
      return;
    }
    animateDrawer(nextOpen);
    persistTickerPreference(nextOpen);
  };

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
      if(typeof fetch !== 'function'){
        throw new Error('fetch not supported');
      }
      const res = await fetch('News.txt', { cache: 'no-store' });
      if(!res || typeof res.ok !== 'boolean'){
        throw new TypeError('invalid response');
      }
      if(!res.ok){
        throw new Error(`Failed to fetch headlines (${res.status})`);
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
      if(!err || (err.message !== 'fetch not supported' && err.name !== 'TypeError')){
        console.error('Failed to load MN24/7 ticker', err);
      }
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

  registerContentRefreshTask(async () => {
    clearTimers();
    resetTrack();
    headlines = [];
    rotationItems = [];
    rotationIndex = 0;
    rotationStart = 0;
    try {
      await loadHeadlines();
      if (rotationItems.length) {
        scheduleNextHeadline();
      }
    } catch (err) {
      console.warn('Failed to refresh MN24/7 ticker', err);
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

const MAX_ABILITY_SCORE = 30;

function applyStatIncreaseToAbility(abilityKey) {
  const normalized = typeof abilityKey === 'string' ? abilityKey.trim().toLowerCase() : '';
  if (!normalized || !ABILS.includes(normalized)) {
    return { success: false, reason: 'invalid' };
  }
  const abilitySelect = $(normalized);
  if (!(abilitySelect instanceof HTMLSelectElement)) {
    return { success: false, reason: 'missing' };
  }
  const currentValue = Number(abilitySelect.value);
  if (!Number.isFinite(currentValue)) {
    return { success: false, reason: 'invalid' };
  }
  if (currentValue >= MAX_ABILITY_SCORE) {
    return { success: false, reason: 'max' };
  }
  const nextValue = currentValue + 1;
  const hasOption = Array.from(abilitySelect.options).some(option => Number(option.value) === nextValue);
  if (!hasOption) {
    abilitySelect.add(new Option(String(nextValue), String(nextValue)));
  }
  abilitySelect.value = String(nextValue);
  abilitySelect.dispatchEvent(new Event('change', { bubbles: true }));
  return { success: true, newValue: nextValue };
}
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
  {
    id: 'blinded',
    name: 'Blinded',
    desc: 'A blinded creature cannot see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature’s attack rolls have disadvantage.',
    highlights: [
      'Perception checks that rely on sight automatically fail.',
      'Attack rolls against the creature have advantage.',
      'The creature’s attack rolls have disadvantage.',
    ],
    remedies: [
      'End the effect or restore sight with magic such as lesser restoration.',
    ],
  },
  {
    id: 'charmed',
    name: 'Charmed',
    desc: 'A charmed creature can’t attack the charmer or target the charmer with harmful abilities or magical effects.',
    highlights: [
      'The creature can’t target the charmer with harmful abilities or magical effects.',
      'The charmer has advantage on social ability checks to interact with the creature.',
    ],
    remedies: [
      'End the charm with features or spells such as calm emotions, dispel magic, or remove curse.',
    ],
  },
  {
    id: 'deafened',
    name: 'Deafened',
    desc: 'A deafened creature can’t hear and automatically fails any ability check that requires hearing.',
    highlights: [
      'Automatically fails ability checks that rely on hearing.',
      'The creature cannot hear spoken commands or verbal warnings.',
    ],
    remedies: [
      'End the effect or restore hearing with magic such as lesser restoration.',
    ],
  },
  {
    id: 'frightened',
    name: 'Frightened',
    desc: 'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.',
    highlights: [
      'The creature cannot willingly move closer to the source of its fear.',
      'Disadvantage applies to attacks and ability checks while the source is visible.',
    ],
    remedies: [
      'End the effect, succeed on the required saving throw, or use features and spells that end the frightened condition.',
    ],
  },
  {
    id: 'grappled',
    name: 'Grappled',
    desc: 'A grappled creature’s speed becomes 0, and it can’t benefit from any bonus to its speed.',
    highlights: [
      'The condition ends if the grappler is incapacitated.',
      'The creature is freed if moved out of the grappler’s reach or restraining effect.',
    ],
    remedies: [
      'Use an action to escape (usually opposed by the grappler) or force movement that breaks the grapple.',
    ],
  },
  {
    id: 'incapacitated',
    name: 'Incapacitated',
    desc: 'An incapacitated creature can’t take actions or reactions.',
    highlights: [
      'The creature cannot take actions, bonus actions, or reactions.',
      'Being incapacitated causes concentration on spells to end.',
    ],
    remedies: [
      'End the source effect or restore the creature with appropriate magic.',
    ],
  },
  {
    id: 'invisible',
    name: 'Invisible',
    desc: 'An invisible creature is impossible to see without the aid of magic or a special sense.',
    highlights: [
      'The creature is considered heavily obscured for hiding.',
      'Attack rolls against the creature have disadvantage.',
      'The creature’s attack rolls have advantage.',
    ],
    remedies: [
      'Reveal the creature with effects such as see invisibility, faerie fire, or end the invisible effect.',
    ],
  },
  {
    id: 'paralyzed',
    name: 'Paralyzed',
    desc: 'A paralyzed creature is incapacitated and can’t move or speak.',
    highlights: [
      'Automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet.',
    ],
    remedies: [
      'End the effect or use potent restoration magic such as greater restoration.',
    ],
  },
  {
    id: 'petrified',
    name: 'Petrified',
    desc: 'A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance.',
    highlights: [
      'The creature is incapacitated, can’t move or speak, and is unaware of its surroundings.',
      'Attack rolls against the creature have advantage.',
      'The creature automatically fails Strength and Dexterity saving throws.',
      'The creature has resistance to all damage and immunity to poison and disease, though ongoing effects aren’t suspended.',
    ],
    remedies: [
      'Reverse the transformation with powerful magic such as greater restoration or wish.',
    ],
  },
  {
    id: 'poisoned',
    name: 'Poisoned',
    desc: 'A poisoned creature has disadvantage on attack rolls and ability checks.',
    highlights: [
      'Disadvantage applies to all attack rolls made by the creature.',
      'Disadvantage applies to all ability checks the creature attempts.',
    ],
    remedies: [
      'End the effect naturally or neutralize it with spells such as protection from poison.',
    ],
  },
  {
    id: 'prone',
    name: 'Prone',
    desc: 'A prone creature’s only movement option is to crawl unless it stands up.',
    highlights: [
      'The creature has disadvantage on attack rolls.',
      'Attack rolls against the creature have advantage if the attacker is within 5 feet.',
      'Attack rolls against the creature have disadvantage if the attacker is farther than 5 feet.',
    ],
    remedies: [
      'Spend half movement to stand up or be moved to a standing position.',
    ],
  },
  {
    id: 'restrained',
    name: 'Restrained',
    desc: 'A restrained creature’s speed becomes 0, and it can’t benefit from any bonus to its speed.',
    highlights: [
      'Attack rolls against the creature have advantage.',
      'The creature’s attack rolls have disadvantage.',
      'The creature has disadvantage on Dexterity saving throws.',
    ],
    remedies: [
      'Escape with a successful Strength or Dexterity check, or break the restraining effect.',
    ],
  },
  {
    id: 'stunned',
    name: 'Stunned',
    desc: 'A stunned creature is incapacitated, can’t move, and can speak only falteringly.',
    highlights: [
      'The creature automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
    ],
    remedies: [
      'Wait for the effect to end or use strong restorative magic to break the stun.',
    ],
  },
  {
    id: 'unconscious',
    name: 'Unconscious',
    desc: 'An unconscious creature is incapacitated, can’t move or speak, and is unaware of its surroundings.',
    highlights: [
      'The creature drops whatever it is holding and falls prone.',
      'The creature automatically fails Strength and Dexterity saving throws.',
      'Attack rolls against the creature have advantage.',
      'Any attack that hits the creature is a critical hit if the attacker is within 5 feet.',
    ],
    remedies: [
      'Regain hit points, receive healing, or otherwise be revived and stabilized.',
    ],
  },
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

const STATUS_INFO_REMEDIES_LABEL = 'Remedies';

function combineClassNames(...names) {
  return names
    .map(name => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

function normalizeStatusDetailList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'number') return String(item).trim();
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  return [];
}

function renderStatusDetailsHtml(status, classes = {}) {
  if (!status) return '';
  const descText = typeof status.desc === 'string' ? status.desc : '';
  const highlights = normalizeStatusDetailList(status.highlights);
  const remedies = normalizeStatusDetailList(status.remedies);
  const parts = [];
  if (descText.trim()) {
    parts.push(
      `<p class="${combineClassNames('status-info__desc', classes.descClass)}">${escapeHtml(descText)}</p>`
    );
  }
  if (highlights.length) {
    const listClassName = combineClassNames(
      'status-info__list',
      'status-info__list--highlights',
      classes.listClass,
      classes.highlightsListClass
    );
    const itemClassName = combineClassNames('status-info__list-item', classes.listItemClass);
    const highlightItems = highlights
      .map(item => `<li class="${itemClassName}">${escapeHtml(item)}</li>`)
      .join('');
    parts.push(`<ul class="${listClassName}">${highlightItems}</ul>`);
  }
  if (remedies.length) {
    const sectionClassName = combineClassNames('status-info__section', classes.sectionClass);
    const labelClassName = combineClassNames('status-info__section-label', classes.sectionLabelClass);
    const remedyListClassName = combineClassNames(
      'status-info__list',
      'status-info__list--remedies',
      classes.listClass,
      classes.remediesListClass
    );
    const itemClassName = combineClassNames('status-info__list-item', classes.listItemClass);
    const remedyItems = remedies
      .map(item => `<li class="${itemClassName}">${escapeHtml(item)}</li>`)
      .join('');
    parts.push(
      `<div class="${sectionClassName}"><span class="${labelClassName}">${escapeHtml(
        STATUS_INFO_REMEDIES_LABEL
      )}</span><ul class="${remedyListClassName}">${remedyItems}</ul></div>`
    );
  }
  return parts.join('');
}

const statusGrid = $('statuses');
const statusModifierBadges = $('status-modifiers');
const activeStatuses = new Set();
const statusEffectOwners = new Map();
const statusModifierDescriptions = new Map();
const STATUS_INFO_TOAST_SOURCE = 'status-info';
const statusInfoPointerDismissEvents = typeof window !== 'undefined'
  ? ('PointerEvent' in window ? ['pointerdown'] : ['touchstart', 'mousedown'])
  : [];
let statusInfoToastActive = false;
let statusInfoPointerDismissListener = null;
const statusInfoPointerDismissOptions = { passive: true };
const TOAST_HISTORY_LIMIT = 50;
const toastHistory = [];
let toastHistoryActiveId = null;
let toastHistoryEntryCounter = 0;
const toastHistoryElements = typeof document !== 'undefined'
  ? {
      panel: document.querySelector('[data-toast-history]'),
      list: document.querySelector('[data-toast-history-list]'),
      actions: document.querySelector('[data-toast-history-actions]'),
      markRead: document.querySelector('[data-toast-history-mark-read]'),
      clear: document.querySelector('[data-toast-history-clear]'),
      unread: document.querySelector('[data-toast-history-unread]'),
    }
  : {
      panel: null,
      list: null,
      actions: null,
      markRead: null,
      clear: null,
      unread: null,
    };
const toastHistoryTimeFormatter =
  typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
    ? new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' })
    : null;

function detachStatusInfoPointerDismiss() {
  if (!statusInfoPointerDismissListener || typeof window === 'undefined') return;
  statusInfoPointerDismissEvents.forEach(eventName => {
    window.removeEventListener(eventName, statusInfoPointerDismissListener, statusInfoPointerDismissOptions);
  });
  statusInfoPointerDismissListener = null;
}

function attachStatusInfoPointerDismiss() {
  if (!statusInfoToastActive || statusInfoPointerDismissListener || typeof window === 'undefined') return;
  statusInfoPointerDismissListener = () => {
    if (!statusInfoToastActive) return;
    detachStatusInfoPointerDismiss();
    dismissToast();
  };
  statusInfoPointerDismissEvents.forEach(eventName => {
    window.addEventListener(eventName, statusInfoPointerDismissListener, statusInfoPointerDismissOptions);
  });
}

function extractToastHistoryMessage(message, options = {}) {
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (trimmed) return trimmed;
  }
  const html = typeof options.html === 'string' ? options.html.trim() : '';
  if (html && typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = html;
    const textContent = container.textContent || '';
    const normalized = textContent.replace(/\s+/g, ' ').trim();
    if (normalized) return normalized;
  }
  return 'Notification';
}

function normalizeToastHistoryType(type) {
  if (typeof type !== 'string') return 'info';
  const cleaned = type.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned || 'info';
}

function formatToastHistoryTypeLabel(type) {
  if (!type) return 'Info';
  return type
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map(segment => (segment ? segment[0].toUpperCase() + segment.slice(1) : segment))
    .join(' ');
}

function formatToastHistoryTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return { iso: '', label: '' };
  }
  const date = new Date(timestamp);
  const label = toastHistoryTimeFormatter
    ? toastHistoryTimeFormatter.format(date)
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { iso: date.toISOString(), label };
}

const IMPORTANT_TOAST_META_SOURCES = new Set(['player-reward', 'mini-game', 'level-reward']);
const IMPORTANT_TOAST_META_IMPORTANCE = new Set(['critical', 'high']);

function shouldLogToastMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return false;
  }
  if (meta.log === false) {
    return false;
  }
  if (meta.log === true) {
    return true;
  }
  const source = typeof meta.source === 'string' ? meta.source.trim().toLowerCase() : '';
  if (source && IMPORTANT_TOAST_META_SOURCES.has(source)) {
    return true;
  }
  const importance = typeof meta.importance === 'string' ? meta.importance.trim().toLowerCase() : '';
  if (importance && IMPORTANT_TOAST_META_IMPORTANCE.has(importance)) {
    return true;
  }
  const category = typeof meta.category === 'string' ? meta.category.trim().toLowerCase() : '';
  if (category === 'gameplay') {
    return true;
  }
  return false;
}

function normalizeToastHistoryEntry(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const options = detail.options || {};
  const meta = options && typeof options.meta === 'object' ? options.meta : null;
  if (meta && meta.silent) {
    return null;
  }
  if (!shouldLogToastMeta(meta)) {
    return null;
  }
  const message = extractToastHistoryMessage(detail.message, options);
  const type = normalizeToastHistoryType(options.type);
  const timestamp = Date.now();
  toastHistoryEntryCounter += 1;
  return {
    id: `toast-history-${timestamp}-${toastHistoryEntryCounter}`,
    message,
    type,
    typeLabel: formatToastHistoryTypeLabel(type),
    timestamp,
    read: false,
  };
}

function markActiveToastHistoryEntryRead() {
  if (!toastHistoryActiveId) return false;
  const existing = toastHistory.find(entry => entry.id === toastHistoryActiveId);
  if (existing && !existing.read) {
    existing.read = true;
    return true;
  }
  return false;
}

function renderToastHistory() {
  const { panel, list, actions, markRead, clear, unread } = toastHistoryElements;
  if (!panel || !list) return;

  const hidePanel = () => {
    panel.hidden = true;
    panel.setAttribute('hidden', 'true');
    list.innerHTML = '';
    if (actions) actions.setAttribute('hidden', 'true');
    if (markRead) markRead.setAttribute('hidden', 'true');
    if (clear) clear.setAttribute('hidden', 'true');
    if (unread) unread.setAttribute('hidden', 'true');
    schedulePlayerToolsBadgeSync(() => removePlayerToolsBadgeReason('notification'));
  };

  if (!toastHistory.length) {
    hidePanel();
    return;
  }

  panel.hidden = false;
  panel.removeAttribute('hidden');
  if (actions) actions.removeAttribute('hidden');
  if (clear) clear.removeAttribute('hidden');

  const unreadCount = toastHistory.reduce((count, entry) => (entry.read ? count : count + 1), 0);
  if (markRead) {
    if (unreadCount > 0) {
      markRead.textContent = unreadCount === 1 ? 'Mark read' : 'Mark all read';
      markRead.removeAttribute('hidden');
    } else {
      markRead.setAttribute('hidden', 'true');
    }
  }
  if (unread) {
    if (unreadCount > 0) {
      unread.textContent = unreadCount > 99 ? '99+' : `${unreadCount}`;
      unread.removeAttribute('hidden');
    } else {
      unread.setAttribute('hidden', 'true');
    }
  }

  const hasUnread = unreadCount > 0;
  schedulePlayerToolsBadgeSync(() => {
    if (hasUnread) {
      addPlayerToolsBadgeReason('notification');
    } else {
      removePlayerToolsBadgeReason('notification');
    }
  });

  const items = toastHistory
    .map(entry => {
      const classes = ['toast-history__item'];
      if (!entry.read) classes.push('toast-history__item--unread');
      const typeClass = `toast-history__type--${entry.type}`;
      const { iso, label } = formatToastHistoryTimestamp(entry.timestamp);
      const timeHtml = label
        ? `<time class="toast-history__time" datetime="${escapeHtml(iso)}">${escapeHtml(label)}</time>`
        : '';
      const dismissLabel = escapeHtml(`Dismiss notification: ${entry.message}`);
      const entryId = escapeHtml(entry.id);
      return `\n        <li>\n          <button type="button" class="${classes.join(' ')}" data-toast-history-entry="${entryId}" aria-label="${dismissLabel}">\n            <div class="toast-history__meta">\n              <span class="toast-history__type ${typeClass}">${escapeHtml(entry.typeLabel)}</span>\n              ${timeHtml}\n            </div>\n            <p class="toast-history__message">${escapeHtml(entry.message)}</p>\n          </button>\n        </li>\n      `;
    })
    .join('');

  list.innerHTML = items;
}

function handleToastHistoryShown(detail) {
  const hadActive = toastHistoryActiveId;
  const updatedPrevious = markActiveToastHistoryEntryRead();
  if (hadActive) {
    toastHistoryActiveId = null;
  }
  const entry = normalizeToastHistoryEntry(detail);
  if (!entry) {
    if (updatedPrevious) {
      renderToastHistory();
    }
    return;
  }
  toastHistory.unshift(entry);
  if (toastHistory.length > TOAST_HISTORY_LIMIT) {
    toastHistory.length = TOAST_HISTORY_LIMIT;
  }
  toastHistoryActiveId = entry.id;
  renderToastHistory();
}

function handleToastHistoryDismissed() {
  const updated = markActiveToastHistoryEntryRead();
  toastHistoryActiveId = null;
  if (updated) {
    renderToastHistory();
  }
}

function dismissToastHistoryEntry(id) {
  if (!id) return false;
  const index = toastHistory.findIndex(entry => entry.id === id);
  if (index === -1) return false;
  const [removed] = toastHistory.splice(index, 1);
  if (toastHistoryActiveId === id) {
    toastHistoryActiveId = null;
  }
  if (removed && !removed.read) {
    removed.read = true;
  }
  renderToastHistory();
  return true;
}

if (toastHistoryElements.markRead) {
  toastHistoryElements.markRead.addEventListener('click', () => {
    let changed = false;
    toastHistory.forEach(entry => {
      if (!entry.read) {
        entry.read = true;
        changed = true;
      }
    });
    toastHistoryActiveId = null;
    if (changed) {
      renderToastHistory();
    }
  });
}

if (toastHistoryElements.clear) {
  toastHistoryElements.clear.addEventListener('click', () => {
    if (!toastHistory.length) return;
    toastHistory.length = 0;
    toastHistoryActiveId = null;
    renderToastHistory();
  });
}

if (toastHistoryElements.list) {
  toastHistoryElements.list.addEventListener('click', event => {
    const target = event?.target;
    const button = target && typeof target.closest === 'function'
      ? target.closest('[data-toast-history-entry]')
      : null;
    if (!button) return;
    const entryId = button.getAttribute('data-toast-history-entry')
      || (button.dataset ? button.dataset.toastHistoryEntry : '')
      || '';
    if (!entryId) return;
    event.preventDefault();
    const dismissed = dismissToastHistoryEntry(entryId);
    if (dismissed) {
      if (typeof button.blur === 'function') {
        button.blur();
      }
      try {
        dismissToast();
      } catch {
        /* ignore toast dismissal failures */
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('cc:toast-shown', event => {
    const detail = event?.detail || {};
    const options = detail.options || {};
    const source = options?.meta?.source;
    const toastEl = typeof document !== 'undefined' ? document.getElementById('toast') : null;
    if (toastEl) {
      const isStatusInfo = source === STATUS_INFO_TOAST_SOURCE;
      toastEl.classList.add('toast--speech-bubble');
      toastEl.classList.toggle('toast--status-info', isStatusInfo);
    }
    if (source === STATUS_INFO_TOAST_SOURCE) {
      statusInfoToastActive = true;
      setTimeout(() => {
        if (statusInfoToastActive) attachStatusInfoPointerDismiss();
      }, 0);
    } else {
      statusInfoToastActive = false;
      detachStatusInfoPointerDismiss();
    }
    handleToastHistoryShown(detail);
  });
  window.addEventListener('cc:toast-dismissed', () => {
    statusInfoToastActive = false;
    detachStatusInfoPointerDismiss();
    const toastEl = typeof document !== 'undefined' ? document.getElementById('toast') : null;
    if (toastEl) {
      toastEl.classList.remove('toast--status-info');
    }
    handleToastHistoryDismissed();
  });
}

function showStatusInfoToast(status) {
  if (!status) return;
  const name = escapeHtml(status.name);
  const details = renderStatusDetailsHtml(status, {
    descClass: 'toast-status__desc',
    listClass: 'toast-status__list',
    listItemClass: 'toast-status__list-item',
    highlightsListClass: 'toast-status__highlights',
    remediesListClass: 'toast-status__remedies',
    sectionClass: 'toast-status__section',
    sectionLabelClass: 'toast-status__section-label',
  });
  const html = `<div class="toast-body toast-status"><strong class="toast-status__name">${name}</strong>${details}</div>`;
  statusInfoToastActive = true;
  toast('', { type: 'info', duration: 15000, html, icon: 'none', meta: { source: STATUS_INFO_TOAST_SOURCE } });
}

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
    const descriptionId = `status-${s.id}-desc`;
    return `
    <div class="status-option">
      <input type="checkbox" id="${checkboxId}" aria-labelledby="${labelId}" />
      <div class="status-option__content">
        <div class="status-option__header">
          <span id="${labelId}" class="status-option__name">${s.name}</span>
          <button
            type="button"
            class="status-option__toggle"
            aria-haspopup="dialog"
            aria-label="Show details for ${s.name}"
            data-status-toggle="${s.id}"
          >
            <span aria-hidden="true" class="status-option__toggle-icon">i</span>
            <span aria-hidden="true" class="status-option__toggle-text" data-status-toggle-label>Info</span>
          </button>
        </div>
        <div
          id="${descriptionId}"
          class="status-option__description"
          hidden
          aria-hidden="true"
          data-status-description
        >${renderStatusDetailsHtml(s, {
          descClass: 'status-option__desc',
          listClass: 'status-option__list',
          listItemClass: 'status-option__list-item',
          highlightsListClass: 'status-option__highlights',
          remediesListClass: 'status-option__remedies',
          sectionClass: 'status-option__section',
          sectionLabelClass: 'status-option__section-label',
        })}</div>
      </div>
    </div>
  `;
  }).join('');
  STATUS_EFFECTS.forEach(s => {
    const cb = $('status-' + s.id);
    const toggle = statusGrid.querySelector(`[data-status-toggle="${s.id}"]`);
    const desc = $('status-' + s.id + '-desc');
    if (desc) {
      desc.hidden = true;
      desc.setAttribute('aria-hidden', 'true');
      desc.removeAttribute('tabindex');
    }
    if (toggle) {
      toggle.addEventListener('click', event => {
        event.preventDefault();
        showStatusInfoToast(s);
      });
    }
    if (cb) {
      cb.addEventListener('change', () => {
        const beforeStatuses = Array.from(activeStatuses);
        if (cb.checked) {
          activeStatuses.add(s.name);
          toast(`${s.name} gained. Tap the info button for mechanics.`, { type: 'info', duration: 4000 });
          logAction(`Status effect gained: ${s.name}`);
          applyStatusEffectBonuses(s.id, true);
          sendImmediateCharacterUpdate(
            'status',
            { active: beforeStatuses },
            { active: Array.from(activeStatuses) },
            `Status gained: ${s.name}`,
          );
        } else {
          activeStatuses.delete(s.name);
          logAction(`Status effect removed: ${s.name}`);
          applyStatusEffectBonuses(s.id, false);
          sendImmediateCharacterUpdate(
            'status',
            { active: beforeStatuses },
            { active: Array.from(activeStatuses) },
            `Status removed: ${s.name}`,
          );
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

function escapeEmptyStateSelector(value = '') {
  const str = typeof value === 'string' ? value : '';
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(str);
  }
  return str.replace(/([!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, '\\$1');
}

function getEmptyStateElement(listEl) {
  if (!listEl) return null;
  const cached = listEl.__emptyStateEl;
  if (cached && cached.isConnected) return cached;
  const id = typeof listEl.id === 'string' ? listEl.id : '';
  let emptyEl = null;
  if (id) {
    emptyEl = document.querySelector(`.empty-state[data-empty-for="${escapeEmptyStateSelector(id)}"]`);
  }
  if (!emptyEl) {
    const parent = listEl.parentElement;
    if (parent) {
      emptyEl = Array.from(parent.children).find(child => child?.classList?.contains('empty-state')) || null;
    }
  }
  if (emptyEl) {
    listEl.__emptyStateEl = emptyEl;
  }
  return emptyEl;
}

function toggleEmptyState(listEl, hasItems) {
  if (!listEl) return;
  const emptyEl = getEmptyStateElement(listEl);
  const showEmpty = !hasItems;
  if ('hidden' in listEl) {
    listEl.hidden = showEmpty;
  }
  if (emptyEl && 'hidden' in emptyEl) {
    emptyEl.hidden = !showEmpty;
  }
  if (showEmpty) {
    if (typeof listEl.setAttribute === 'function') {
      listEl.setAttribute('data-empty', 'true');
    } else if (listEl.dataset) {
      listEl.dataset.empty = 'true';
    }
  } else {
    if (typeof listEl.removeAttribute === 'function') {
      listEl.removeAttribute('data-empty');
    } else if (listEl.dataset) {
      delete listEl.dataset.empty;
    }
  }
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
            window.dmNotify?.(`${text} ${cb.checked ? 'used' : 'reset'}`, { actionScope: 'minor' });
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
    toggleEmptyState(perkEl, perks.length > 0);
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
const elAbilityStatReminderButton = $('ability-stat-reminder');
const elAbilityStatReminderBadge = elAbilityStatReminderButton
  ? elAbilityStatReminderButton.querySelector('[data-ability-reminder-count]')
  : null;
const elStoryRewardReminderButton = $('story-reward-reminder');
const elStoryRewardReminderBadge = elStoryRewardReminderButton
  ? elStoryRewardReminderButton.querySelector('[data-story-reminder-count]')
  : null;
const elCombatRewardReminderButton = $('combat-reward-reminder');
const elCombatRewardReminderBadge = elCombatRewardReminderButton
  ? elCombatRewardReminderButton.querySelector('[data-combat-reminder-count]')
  : null;
const elStoryCard = $('card-story');
const elPowersCard = document.querySelector('fieldset[data-tab="powers"]');
const elCombatCard = $('card-combat');
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
const initiativeRollResultRenderer = elInitiativeRollResult ? ensureDiceResultRenderer(elInitiativeRollResult) : null;
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
const augmentPickerOverlay = $('modal-augment-picker');
const elAugmentSelectedList = $('augment-selected-list');
const elAugmentAvailableList = augmentPickerOverlay
  ? augmentPickerOverlay.querySelector('#augment-available-list')
  : $('augment-available-list');
const augmentPickerScrollContainer = augmentPickerOverlay
  ? augmentPickerOverlay.querySelector('.modal--augment-picker__content')
  : null;
const augmentPickerRenderContext = { canSelectMore: true };
const augmentPickerVirtualList = createVirtualizedList(elAugmentAvailableList, {
  scrollContainer: augmentPickerScrollContainer,
  estimateItemHeight: 240,
  initialRenderCount: 6,
  getItemKey: (augment, index) => (augment && augment.id ? augment.id : `augment-${index}`),
  measureScrollFps: true,
  fpsThreshold: 5000,
  onMetrics: metrics => {
    if (typeof window !== 'undefined') {
      window.__ccVirtualMetrics = window.__ccVirtualMetrics || {};
      window.__ccVirtualMetrics.augment = metrics;
    }
  },
  renderItem: (augment, renderContext) => renderAugmentPickerVirtualItem(augment, renderContext),
});

const PLAYER_CREDIT_LAST_VIEWED_KEY = 'player-credit:last-viewed';
const PLAYER_CREDIT_BROADCAST_CHANNEL = 'cc:player-credit';

let playerCreditAckBroadcastChannel = null;

const ensurePlayerCreditAckBroadcastChannel = () => {
  if (playerCreditAckBroadcastChannel || typeof BroadcastChannel !== 'function') {
    return playerCreditAckBroadcastChannel;
  }
  try {
    playerCreditAckBroadcastChannel = new BroadcastChannel(PLAYER_CREDIT_BROADCAST_CHANNEL);
  } catch {
    playerCreditAckBroadcastChannel = null;
  }
  return playerCreditAckBroadcastChannel;
};

const postPlayerCreditAcknowledgement = (signature) => {
  if (!signature || typeof window === 'undefined') return;
  const channel = ensurePlayerCreditAckBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage({ type: 'CC_PLAYER_ACK', signature });
    } catch {
      /* ignore broadcast failures */
    }
  }
  try {
    const origin = window.location?.origin || '*';
    window.postMessage({ type: 'CC_PLAYER_ACK', signature }, origin);
  } catch {
    try {
      window.postMessage({ type: 'CC_PLAYER_ACK', signature }, '*');
    } catch {
      /* ignore postMessage failures */
    }
  }
};

const readPlayerCreditAcknowledgedSignature = () => {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return '';
    return storage.getItem(PLAYER_CREDIT_LAST_VIEWED_KEY) || '';
  } catch {
    return '';
  }
};

const writePlayerCreditAcknowledgedSignature = (value) => {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return;
    if (value) {
      storage.setItem(PLAYER_CREDIT_LAST_VIEWED_KEY, value);
    } else {
      storage.removeItem(PLAYER_CREDIT_LAST_VIEWED_KEY);
    }
  } catch {
    /* ignore persistence errors */
  }
};

const computePlayerCreditSignature = (detail) => {
  if (!detail || typeof detail !== 'object') return '';
  const payload = detail.payload && typeof detail.payload === 'object' ? detail.payload : null;
  const history = Array.isArray(detail.history) ? detail.history : [];
  const candidate = payload || history[0] || null;
  if (!candidate || typeof candidate !== 'object') return '';
  const id = typeof candidate.txid === 'string' && candidate.txid
    ? candidate.txid
    : (typeof candidate.ref === 'string' ? candidate.ref : '');
  const timestamp = typeof candidate.timestamp === 'string' ? candidate.timestamp : '';
  return `${id}|${timestamp}`;
};

const elPlayerToolsTab = $('player-tools-tab');
if (elPlayerToolsTab) {
  playerToolsTabElement = elPlayerToolsTab;
  const shouldHideTab = !welcomeModalDismissed || elPlayerToolsTab.hidden;
  setPlayerToolsTabHidden(shouldHideTab);
}

const getPlayerToolsTabAttribute = (name, fallback = null) => {
  if (!elPlayerToolsTab) return fallback;
  const getter = typeof elPlayerToolsTab.getAttribute === 'function'
    ? elPlayerToolsTab.getAttribute.bind(elPlayerToolsTab)
    : null;
  if (!getter) return fallback;
  try {
    const value = getter(name);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
};

const setPlayerToolsTabAttribute = (name, value) => {
  if (!elPlayerToolsTab) return;
  const setter = typeof elPlayerToolsTab.setAttribute === 'function'
    ? elPlayerToolsTab.setAttribute.bind(elPlayerToolsTab)
    : null;
  if (!setter) return;
  try {
    setter(name, value);
  } catch {}
};

const removePlayerToolsTabAttribute = (name) => {
  if (!elPlayerToolsTab) return;
  if (typeof elPlayerToolsTab.removeAttribute === 'function') {
    try {
      elPlayerToolsTab.removeAttribute(name);
      return;
    } catch {}
  }
  if (typeof elPlayerToolsTab.setAttribute === 'function') {
    try {
      elPlayerToolsTab.setAttribute(name, '');
    } catch {}
  }
};

const playerToolsTabDefaultLabel = getPlayerToolsTabAttribute('aria-label') || 'Toggle player tools drawer';
const playerToolsBadgeReasons = new Set();
const PLAYER_TOOLS_BADGE_REASON_LABELS = {
  credit: 'new credit update',
  reward: 'new reward',
  'mini-game': 'mini-game mission ready',
  notification: 'new notification',
};
let playerToolsTabBadge = null;
let playerCreditLatestSignature = '';
let playerCreditAcknowledgedSignature = readPlayerCreditAcknowledgedSignature();

const formatPlayerToolsBadgeLabel = (labels) => {
  if (!Array.isArray(labels) || labels.length === 0) {
    return '';
  }
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  const head = labels.slice(0, -1);
  const tail = labels[labels.length - 1];
  return `${head.join(', ')}, and ${tail}`;
};

const syncPlayerToolsTabBadge = () => {
  if (!elPlayerToolsTab || !playerToolsTabBadge) return;
  const hasReasons = playerToolsBadgeReasons.size > 0;
  const hasCredit = playerToolsBadgeReasons.has('credit');
  const hasReward = playerToolsBadgeReasons.has('reward');

  playerToolsTabBadge.hidden = !hasReasons;
  if (hasReasons) {
    playerToolsTabBadge.textContent = '!';
  }

  if (hasCredit) {
    setPlayerToolsTabAttribute('data-player-credit', 'pending');
  } else {
    removePlayerToolsTabAttribute('data-player-credit');
  }

  if (hasReward) {
    setPlayerToolsTabAttribute('data-player-reward', 'pending');
  } else {
    removePlayerToolsTabAttribute('data-player-reward');
  }

  if (playerToolsTabDefaultLabel) {
    const labels = Array.from(playerToolsBadgeReasons)
      .map(reason => PLAYER_TOOLS_BADGE_REASON_LABELS[reason])
      .filter(Boolean);
    if (labels.length) {
      setPlayerToolsTabAttribute('aria-label', `${playerToolsTabDefaultLabel} (${formatPlayerToolsBadgeLabel(labels)})`);
    } else {
      setPlayerToolsTabAttribute('aria-label', playerToolsTabDefaultLabel);
    }
  }
};

const addPlayerToolsBadgeReason = (reason) => {
  if (!reason) return;
  playerToolsBadgeReasons.add(reason);
  syncPlayerToolsTabBadge();
};

const removePlayerToolsBadgeReason = (reason) => {
  if (!reason) return;
  playerToolsBadgeReasons.delete(reason);
  syncPlayerToolsTabBadge();
};

if (playerCreditAcknowledgedSignature) {
  playerCreditLatestSignature = playerCreditAcknowledgedSignature;
}

const clearPlayerCreditBadge = () => {
  removePlayerToolsBadgeReason('credit');
};

const showPlayerCreditBadge = () => {
  addPlayerToolsBadgeReason('credit');
};

const clearPlayerRewardBadge = () => {
  removePlayerToolsBadgeReason('reward');
};

const showPlayerRewardBadge = () => {
  addPlayerToolsBadgeReason('reward');
};

const acknowledgePlayerCredit = (signature = playerCreditLatestSignature) => {
  clearPlayerCreditBadge();
  playerCreditAcknowledgedSignature = signature || '';
  writePlayerCreditAcknowledgedSignature(playerCreditAcknowledgedSignature);
  if (signature) {
    postPlayerCreditAcknowledgement(signature);
  }
};

const handlePlayerCreditEventDetail = (detail) => {
  if (!elPlayerToolsTab || !detail || typeof detail !== 'object') return;
  if (detail.meta?.dmSession) return;
  const signature = computePlayerCreditSignature(detail);
  if (detail.meta?.source === 'hydrate') {
    playerCreditLatestSignature = signature;
    acknowledgePlayerCredit(signature);
    return;
  }
  const history = Array.isArray(detail.history) ? detail.history : [];
  if (!history.length) {
    playerCreditLatestSignature = '';
    acknowledgePlayerCredit('');
    return;
  }
  if (signature) {
    playerCreditLatestSignature = signature;
  } else {
    playerCreditLatestSignature = '';
  }
  if (detail.meta?.reveal === false) {
    return;
  }
  if (signature && signature === playerCreditAcknowledgedSignature) {
    return;
  }
  showPlayerCreditBadge();
};

if (elPlayerToolsTab && typeof elPlayerToolsTab.appendChild === 'function') {
  playerToolsTabBadge = document.createElement('span');
  playerToolsTabBadge.className = 'player-tools-tab__badge';
  playerToolsTabBadge.hidden = true;
  playerToolsTabBadge.setAttribute('aria-hidden', 'true');
  playerToolsTabBadge.textContent = '!';
  elPlayerToolsTab.appendChild(playerToolsTabBadge);
  syncPlayerToolsTabBadge();

  document.addEventListener(PLAYER_CREDIT_EVENTS.UPDATE, event => {
    handlePlayerCreditEventDetail(event?.detail);
  });
  document.addEventListener(PLAYER_CREDIT_EVENTS.SYNC, event => {
    handlePlayerCreditEventDetail(event?.detail);
  });
}

const parseGaugeNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const resolveTracker = el => (el && typeof el.closest === 'function') ? el.closest('.tracker-progress') : null;
const resolveProgressValue = el => (el && typeof el.querySelector === 'function')
  ? el.querySelector('.tracker-progress__value')
  : null;
const elHPTracker = resolveTracker(elHPBar);
const elSPTracker = resolveTracker(elSPBar);
const elHPProgressValue = resolveProgressValue(elHPPill);
const elSPProgressValue = resolveProgressValue(elSPPill);

let hpGaugeMetrics = {
  current: elHPBar ? parseGaugeNumber(elHPBar.value) : 0,
  max: elHPBar ? parseGaugeNumber(elHPBar.max) : 0,
  ratio: 0,
};

let deathGaugeOverride = null;
let deathGaugeRollResetTimer = null;
const elAugmentSlotSummary = $('augment-slot-summary');
const elAugmentSearch = augmentPickerOverlay
  ? augmentPickerOverlay.querySelector('#augment-search')
  : $('augment-search');
const augmentFilterButtons = augmentPickerOverlay
  ? Array.from(augmentPickerOverlay.querySelectorAll('.augment-filter'))
  : Array.from(qsa('.augment-filter'));
const augmentPickerTrigger = $('augment-picker-trigger');
const elAugmentStateInput = $('augment-state');
const elLevelProgressInput = $('level-progress-state');
const elLevelRewardReminderList = $('level-reward-reminders');
const elLevelRewardReminderTrigger = $('level-reward-reminder-trigger');
const elLevelRewardInfoTrigger = $('level-reward-info-trigger');
const elLevelRewardReminderBadge = elLevelRewardReminderTrigger
  ? elLevelRewardReminderTrigger.querySelector('[data-level-reward-count]')
  : null;
const elLevelRewardAcknowledge = $('level-reward-acknowledge');

let levelRewardPendingCount = 0;
let pendingAbilityReminderTasks = [];
let pendingStoryReminderTasks = [];
let pendingCombatReminderTasks = [];

const PLAYER_REWARD_HISTORY_STORAGE_KEY = 'cc:player-reward-history';
const PLAYER_REWARD_LAST_VIEWED_KEY = 'player-reward:last-viewed';
const PLAYER_REWARD_HISTORY_LIMIT = 10;
const PLAYER_REWARD_CHANNEL_NAMES = ['cc:player-rewards', PLAYER_CREDIT_BROADCAST_CHANNEL];
const PLAYER_REWARD_EVENTS = Object.freeze({
  UPDATE: 'player-reward:update',
  SYNC: 'player-reward:sync',
});

let playerRewardHistory = [];
let playerRewardLatestSignature = '';
let playerRewardAcknowledgedSignature = (() => {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return '';
    return storage.getItem(PLAYER_REWARD_LAST_VIEWED_KEY) || '';
  } catch {
    return '';
  }
})();

const playerRewardChannelSubscriptions = new Map();

const allowedRewardOriginsList = (() => {
  try {
    if (Array.isArray(window.CC_PLAYER_ALLOWED_ORIGINS) && window.CC_PLAYER_ALLOWED_ORIGINS.length > 0) {
      return window.CC_PLAYER_ALLOWED_ORIGINS;
    }
  } catch {
    /* ignore origin detection errors */
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return [window.location.origin];
  }
  return ['*'];
})();

const isAllowedRewardOrigin = (origin) => {
  if (!origin) return true;
  if (!Array.isArray(allowedRewardOriginsList) || allowedRewardOriginsList.length === 0) return true;
  if (allowedRewardOriginsList.includes('*')) return true;
  return allowedRewardOriginsList.includes(origin);
};

const sanitizeRewardData = (data) => {
  if (!data || typeof data !== 'object') return null;
  try {
    const clone = JSON.parse(JSON.stringify(data));
    if (clone && typeof clone === 'object' && Object.keys(clone).length === 0) {
      return null;
    }
    return clone;
  } catch {
    return null;
  }
};

const toRewardIsoString = (value) => {
  let date = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    date = value;
  } else if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  } else if (Number.isFinite(value)) {
    const parsed = new Date(Number(value));
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }
  if (!date) {
    date = new Date();
  }
  return date.toISOString();
};

const sanitizePlayerRewardHistoryItem = (item = {}) => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const kind = typeof item.kind === 'string' ? item.kind.trim() : '';
  const player = typeof item.player === 'string' ? item.player.trim() : '';
  const message = typeof item.message === 'string' ? item.message.trim() : '';
  const name = (() => {
    if (typeof item.name === 'string' && item.name.trim()) {
      return item.name.trim();
    }
    if (kind) {
      return `Reward: ${kind}`;
    }
    return 'Reward update';
  })();
  const text = typeof item.text === 'string' && item.text.trim() ? item.text.trim() : (message || name);
  const timestamp = toRewardIsoString(item.timestamp ?? item.t ?? item.time ?? item.ts ?? Date.now());
  const id = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : `reward-${timestamp}-${Math.floor(Math.random() * 1e6)}`;
  return {
    id,
    timestamp,
    name,
    text,
    kind,
    player,
    message: message || text,
    data: sanitizeRewardData(item.data),
  };
};

const playerRewardHistoryKey = (entry = {}) => {
  if (!entry || typeof entry !== 'object') return '';
  if (typeof entry.id === 'string' && entry.id) {
    return entry.id;
  }
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : '';
  const name = typeof entry.name === 'string' ? entry.name : '';
  const text = typeof entry.text === 'string' ? entry.text : '';
  return `${timestamp}|${name}|${text}`;
};

const loadPlayerRewardHistory = () => {
  const storage = getLocalStorageSafe();
  if (!storage) return [];
  try {
    const raw = storage.getItem(PLAYER_REWARD_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
    return list
      .map(entry => sanitizePlayerRewardHistoryItem(entry))
      .filter(Boolean)
      .slice(0, PLAYER_REWARD_HISTORY_LIMIT);
  } catch {
    return [];
  }
};

const persistPlayerRewardHistory = (entries) => {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    if (!entries || !entries.length) {
      storage.removeItem(PLAYER_REWARD_HISTORY_STORAGE_KEY);
    } else {
      storage.setItem(PLAYER_REWARD_HISTORY_STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    /* ignore persistence failures */
  }
};

const addPlayerRewardHistoryEntry = (entry, { persist = true } = {}) => {
  const sanitized = sanitizePlayerRewardHistoryItem(entry);
  if (!sanitized) {
    return { entry: null, isNew: false };
  }
  const key = playerRewardHistoryKey(sanitized);
  const existed = key ? playerRewardHistory.some(item => playerRewardHistoryKey(item) === key) : false;
  const filtered = key
    ? playerRewardHistory.filter(item => playerRewardHistoryKey(item) !== key)
    : playerRewardHistory.slice();
  filtered.unshift(sanitized);
  playerRewardHistory = filtered.slice(0, PLAYER_REWARD_HISTORY_LIMIT);
  if (persist) {
    persistPlayerRewardHistory(playerRewardHistory);
  }
  return { entry: sanitized, isNew: !existed };
};

const writePlayerRewardAcknowledgedSignature = (value) => {
  try {
    const storage = getLocalStorageSafe();
    if (!storage) return;
    if (value) {
      storage.setItem(PLAYER_REWARD_LAST_VIEWED_KEY, value);
    } else {
      storage.removeItem(PLAYER_REWARD_LAST_VIEWED_KEY);
    }
  } catch {
    /* ignore persistence errors */
  }
};

const acknowledgePlayerReward = (signature = playerRewardLatestSignature) => {
  clearPlayerRewardBadge();
  playerRewardAcknowledgedSignature = signature || '';
  writePlayerRewardAcknowledgedSignature(playerRewardAcknowledgedSignature);
};

const cloneRewardEntry = (entry) => ({ ...entry });

const dispatchPlayerRewardEvent = (type, entry, meta = {}) => {
  if (typeof CustomEvent !== 'function') return;
  const detail = {
    entry: entry ? cloneRewardEntry(entry) : null,
    history: playerRewardHistory.map(item => cloneRewardEntry(item)),
    meta: { ...meta },
  };
  if (typeof document?.dispatchEvent === 'function') {
    try {
      document.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {
      /* ignore dispatch failures */
    }
  }
  if (typeof window?.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {
      /* ignore dispatch failures */
    }
  }
};

const buildPlayerRewardHistoryEntryFromPayload = (payload = {}, historyEntry = null) => {
  const source = historyEntry && typeof historyEntry === 'object'
    ? historyEntry
    : (payload && typeof payload === 'object' && (payload.historyEntry || payload.history) && typeof (payload.historyEntry || payload.history) === 'object'
      ? (payload.historyEntry || payload.history)
      : {});
  const record = {
    ...source,
    kind: typeof payload?.kind === 'string' ? payload.kind : (typeof source.kind === 'string' ? source.kind : ''),
    player: typeof payload?.player === 'string' ? payload.player : (typeof source.player === 'string' ? source.player : ''),
    message: typeof payload?.message === 'string' ? payload.message : (typeof source.message === 'string' ? source.message : ''),
    timestamp: payload?.timestamp ?? payload?.timestampMs ?? source.timestamp ?? source.t ?? source.time ?? Date.now(),
    data: payload?.data ?? source.data ?? null,
  };
  return sanitizePlayerRewardHistoryItem(record);
};

const handlePlayerRewardUpdate = (payload = {}, historyEntry = null, { source = 'update', reveal = true } = {}) => {
  if (isDmSessionActive()) return;
  const entry = buildPlayerRewardHistoryEntryFromPayload(payload, historyEntry);
  if (!entry) return;
  const { entry: added, isNew } = addPlayerRewardHistoryEntry(entry);
  if (!added) return;
  const signature = playerRewardHistoryKey(added);
  if (signature) {
    playerRewardLatestSignature = signature;
  } else {
    playerRewardLatestSignature = '';
  }

  const alreadyAcknowledged = signature && signature === playerRewardAcknowledgedSignature;

  dispatchPlayerRewardEvent(PLAYER_REWARD_EVENTS.UPDATE, added, {
    source,
    reveal,
    dmSession: isDmSessionActive(),
  });

  if (!alreadyAcknowledged && reveal !== false && isNew) {
    const message = added.message || added.text || added.name;
    if (message) {
      try {
        toast(message, {
          type: 'success',
          meta: {
            source: 'player-reward',
            kind: added.kind || undefined,
            player: added.player || undefined,
          },
        });
      } catch {
        /* ignore toast failures */
      }
    }
  }

  if (signature) {
    if (alreadyAcknowledged) {
      if (isPlayerToolsDrawerOpen) {
        clearPlayerRewardBadge();
      }
      return;
    }
    if (isPlayerToolsDrawerOpen) {
      acknowledgePlayerReward(signature);
    } else if (source !== 'hydrate' && isNew) {
      showPlayerRewardBadge();
    }
  } else if (!isPlayerToolsDrawerOpen && source !== 'hydrate' && isNew) {
    showPlayerRewardBadge();
  }
};

const handlePlayerRewardEnvelope = (data, options = {}) => {
  if (!data || typeof data !== 'object') return;
  if (data.type !== 'CC_REWARD_UPDATE') return;
  const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};
  const historyEntry = data.historyEntry ?? payload.historyEntry ?? payload.history ?? null;
  handlePlayerRewardUpdate(payload, historyEntry, options);
};

const ensurePlayerRewardBroadcastChannel = (name) => {
  if (!name || playerRewardChannelSubscriptions.has(name)) {
    return playerRewardChannelSubscriptions.get(name)?.channel ?? null;
  }
  if (typeof BroadcastChannel !== 'function') {
    return null;
  }
  try {
    const channel = new BroadcastChannel(name);
    const handler = (event) => {
      handlePlayerRewardEnvelope(event?.data, { source: 'broadcast', channel: name, reveal: true });
    };
    try {
      if (typeof channel.addEventListener === 'function') {
        channel.addEventListener('message', handler);
      } else {
        channel.onmessage = handler;
      }
    } catch {
      channel.onmessage = handler;
    }
    playerRewardChannelSubscriptions.set(name, { channel, handler });
    return channel;
  } catch {
    return null;
  }
};

PLAYER_REWARD_CHANNEL_NAMES.forEach(ensurePlayerRewardBroadcastChannel);

const hydratePlayerRewardHistory = () => {
  if (isDmSessionActive()) return;
  playerRewardHistory = loadPlayerRewardHistory();
  playerRewardLatestSignature = playerRewardHistoryKey(playerRewardHistory[0] || null);
  dispatchPlayerRewardEvent(PLAYER_REWARD_EVENTS.SYNC, playerRewardHistory[0] || null, {
    source: 'hydrate',
    reveal: false,
    dmSession: isDmSessionActive(),
  });
  if (playerRewardLatestSignature && playerRewardLatestSignature !== playerRewardAcknowledgedSignature) {
    showPlayerRewardBadge();
  } else if (!playerRewardHistory.length) {
    acknowledgePlayerReward('');
  }
};

hydratePlayerRewardHistory();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (isDmSessionActive()) return;
    const origin = event?.origin || '';
    if (origin && !isAllowedRewardOrigin(origin)) return;
    handlePlayerRewardEnvelope(event?.data, { source: 'message', reveal: true });
  }, false);

  window.addEventListener('storage', (event) => {
    if (isDmSessionActive()) return;
    if (event.key !== PLAYER_REWARD_HISTORY_STORAGE_KEY) return;
    const next = (() => {
      if (!event.newValue) return [];
      try {
        const parsed = JSON.parse(event.newValue);
        return Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : []);
      } catch {
        return [];
      }
    })();
    playerRewardHistory = next
      .map(entry => sanitizePlayerRewardHistoryItem(entry))
      .filter(Boolean)
      .slice(0, PLAYER_REWARD_HISTORY_LIMIT);
    playerRewardLatestSignature = playerRewardHistoryKey(playerRewardHistory[0] || null);
    dispatchPlayerRewardEvent(PLAYER_REWARD_EVENTS.SYNC, playerRewardHistory[0] || null, {
      source: 'storage',
      reveal: true,
      dmSession: isDmSessionActive(),
    });
    if (!playerRewardHistory.length) {
      acknowledgePlayerReward('');
      return;
    }
    if (playerRewardLatestSignature && playerRewardLatestSignature !== playerRewardAcknowledgedSignature) {
      if (isPlayerToolsDrawerOpen) {
        acknowledgePlayerReward(playerRewardLatestSignature);
      } else {
        showPlayerRewardBadge();
      }
    }
  });
}

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

if (augmentPickerTrigger) {
  augmentPickerTrigger.addEventListener('click', () => {
    show('modal-augment-picker');
  });
}

if (elLevelRewardReminderTrigger) {
  elLevelRewardReminderTrigger.addEventListener('click', () => {
    renderLevelRewardReminders();
    show('modal-level-rewards');
  });
}

if (elLevelRewardInfoTrigger) {
  elLevelRewardInfoTrigger.addEventListener('click', () => {
    toast(
      'This is where reminders to apply level-up rewards are populated. Be sure to check the Combat, Abilities, and Story tabs for other rewards notifications.',
      {
        type: 'info',
        duration: 15000,
        icon: 'info',
        action: {
          label: 'Review rewards',
          callback: () => {
            renderLevelRewardReminders();
            show('modal-level-rewards');
          },
        },
      },
    );
  });
}

if (elLevelRewardAcknowledge) {
  elLevelRewardAcknowledge.addEventListener('click', () => {
    acknowledgePendingLevelRewards();
  });
}

if (elAbilityStatReminderButton) {
  elAbilityStatReminderButton.addEventListener('click', () => {
    showLevelRewardReminderToast('abilities');
  });
}

if (elStoryRewardReminderButton) {
  elStoryRewardReminderButton.addEventListener('click', () => {
    showLevelRewardReminderToast('story');
  });
}

if (elCombatRewardReminderButton) {
  elCombatRewardReminderButton.addEventListener('click', () => {
    showLevelRewardReminderToast('combat');
  });
}

if (typeof subscribePlayerToolsDrawer === 'function') {
  subscribePlayerToolsDrawer(({ open }) => {
    isPlayerToolsDrawerOpen = Boolean(open);
    if (elLevelRewardReminderTrigger) {
      if (open && levelRewardPendingCount > 0) {
        if (typeof elLevelRewardReminderTrigger.setAttribute === 'function') {
          elLevelRewardReminderTrigger.setAttribute('data-drawer-open', 'true');
        } else if (elLevelRewardReminderTrigger.dataset) {
          elLevelRewardReminderTrigger.dataset.drawerOpen = 'true';
        }
      } else {
        if (typeof elLevelRewardReminderTrigger.removeAttribute === 'function') {
          elLevelRewardReminderTrigger.removeAttribute('data-drawer-open');
        } else if (elLevelRewardReminderTrigger?.dataset) {
          delete elLevelRewardReminderTrigger.dataset.drawerOpen;
        }
      }
    }
    syncLevelRewardReminderAnimation();
    if (open) {
      acknowledgePlayerCredit();
      acknowledgePlayerReward();
    }
    updateMiniGameReminder();
  });
}

const pauseActiveTabIconAnimations = () => {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.tab__icon--animating').forEach(container => {
    container.classList.remove('tab__icon--animating');
  });
};

let modeLiveRegionAriaLiveDefault = null;

const updateDrawerLiveRegionState = (isOpen) => {
  if (!modeLiveRegion || !modeLiveRegion.isConnected) return;
  if (modeLiveRegionAriaLiveDefault === null) {
    modeLiveRegionAriaLiveDefault = modeLiveRegion.getAttribute('aria-live');
  }
  if (isOpen) {
    modeLiveRegion.setAttribute('aria-live', 'off');
  } else if (modeLiveRegionAriaLiveDefault && modeLiveRegionAriaLiveDefault.length > 0) {
    modeLiveRegion.setAttribute('aria-live', modeLiveRegionAriaLiveDefault);
  } else {
    modeLiveRegion.removeAttribute('aria-live');
  }
};

const collapseOverlaysForDrawer = () => {
  const overlayIds = [
    hpSettingsOverlay?.id,
    spSettingsOverlay?.id,
    augmentPickerOverlay?.id,
    miniGameInviteOverlay?.id,
    'modal-campaign-edit',
    'modal-catalog',
  ].filter(Boolean);
  overlayIds.forEach(id => {
    const overlay = $(id);
    if (!overlay || overlay.classList.contains('hidden')) return;
    hide(id);
  });
};

if (typeof onPlayerToolsDrawerChange === 'function') {
  onPlayerToolsDrawerChange(({ open }) => {
    updateDrawerLiveRegionState(open);
    if (open) {
      pauseActiveTabIconAnimations();
      collapseOverlaysForDrawer();
    }
    updateMiniGameReminder();
  });
}

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
const xpNumberFormatter = (typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function')
  ? new Intl.NumberFormat()
  : {
      format: value => {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          return String(numeric);
        }
        if (Number.isNaN(numeric)) {
          return 'NaN';
        }
        return String(value ?? '');
      },
    };

const rewardNumberFormatter = (typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function')
  ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
  : null;
const elTier = $('tier');
const elLevelValue = $('level');
const elLevelDisplay = $('level-display');
const elLevelSummaryValue = $('level-summary');
const elLevelSummaryText = $('level-summary-text');
const elSubTierValue = $('sub-tier');
const elSubTierDisplay = $('sub-tier-display');
const elTierShortValue = $('tier-short');
const elTierShortDisplay = $('tier-short-display');
const elTierNumberValue = $('tier-number');
const elTierGains = $('tier-gains');
const elCAPCheck = $('cap-check');
const elCAPStatus = $('cap-status');
const elDeathSaves = $('pt-death-saves');
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

    const resolvedInitiative = resolveRollBonus(base, {
      type: 'initiative',
      baseBonuses,
      additionalBonuses,
    });

    const resolvedModifier = Number.isFinite(resolvedInitiative?.modifier)
      ? resolvedInitiative.modifier
      : base;
    const resolvedBreakdown = Array.isArray(resolvedInitiative?.breakdown)
      ? resolvedInitiative.breakdown
      : baseBonuses
        .map(part => formatBreakdown(part.label, part.value, { includeZero: part.includeZero }))
        .filter(Boolean);

    rollWithBonus('Initiative', base, elInitiativeRollResult, {
      type: 'initiative',
      baseBonuses,
      additionalBonuses,
      resolvedModifier,
      resolvedBreakdown,
      resultRenderer: initiativeRollResultRenderer,
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
      const formula = resolvedModifier
        ? `1d20${resolvedModifier >= 0 ? '+' : ''}${resolvedModifier}`
        : '1d20';
      const rollEntry = Array.isArray(rollDetails.rolls) ? rollDetails.rolls[0] : null;
      const rollSet = Array.isArray(rollEntry?.rolls) ? rollEntry.rolls : [];
      const rollSummary = rollSet.length
        ? rollDetails.rollMode === 'advantage' || rollDetails.rollMode === 'disadvantage'
          ? `d20 (${rollSet.join(' / ')}) => ${rollEntry?.chosen ?? rollDetails.roll}`
          : `d20 (${rollSet.join(', ')})`
        : `d20 (${rollDetails.roll})`;
      const breakdownParts = [rollSummary];
      if (Array.isArray(rollDetails.breakdown) && rollDetails.breakdown.length) {
        breakdownParts.push(rollDetails.breakdown.join(' | '));
      }
      const character = getDiscordCharacterPayload();
      if (character) {
        void sendEventToDiscordWorker({
          type: 'initiative.roll',
          actor: { vigilanteName: character.vigilanteName, uid: character.uid },
          detail: {
            formula,
            total: rollDetails.total,
            breakdown: breakdownParts.filter(Boolean).join(' | '),
            characterId: character.id,
            playerName: character.playerName,
          },
          ts: Date.now(),
        });
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
    statAssignments: new Map(),
    appliedRewardsByLevel: new Map(),
  };
}

function normalizeStatAssignments(rawAssignments) {
  const map = new Map();
  if (!rawAssignments) return map;
  if (rawAssignments instanceof Map) {
    rawAssignments.forEach((ability, rewardId) => {
      if (typeof rewardId === 'string' && typeof ability === 'string' && ability) {
        map.set(rewardId, ability);
      }
    });
    return map;
  }
  const assignEntry = (rewardId, ability) => {
    if (typeof rewardId !== 'string' || !rewardId) return;
    if (typeof ability !== 'string' || !ability) return;
    map.set(rewardId, ability);
  };
  if (Array.isArray(rawAssignments)) {
    rawAssignments.forEach(entry => {
      if (Array.isArray(entry) && entry.length >= 2) {
        assignEntry(entry[0], entry[1]);
      } else if (entry && typeof entry === 'object') {
        assignEntry(entry.rewardId ?? entry.id, entry.ability ?? entry.value);
      }
    });
    return map;
  }
  if (typeof rawAssignments === 'object') {
    Object.entries(rawAssignments).forEach(([rewardId, ability]) => {
      assignEntry(rewardId, ability);
    });
  }
  return map;
}

function ensureStatAssignmentMap() {
  if (levelProgressState?.statAssignments instanceof Map) {
    return levelProgressState.statAssignments;
  }
  const normalized = normalizeStatAssignments(levelProgressState?.statAssignments);
  levelProgressState.statAssignments = normalized;
  return normalized;
}

function normalizeLevelRewardLedgerRecord(raw = {}) {
  const toNumber = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const statCount = Number.isFinite(Number(raw?.statIncreases))
    ? Number(raw.statIncreases)
    : raw?.statIncrease === true || raw?.grantsStatIncrease === true
      ? 1
      : 0;
  return {
    hpBonus: toNumber(raw?.hpBonus),
    spBonus: toNumber(raw?.spBonus),
    augmentSlots: toNumber(raw?.augmentSlots),
    statIncreases: statCount,
    legendaryGearAccess: raw?.legendaryGearAccess === true,
    transcendentTrait: raw?.transcendentTrait === true,
  };
}

function parseStoredLevelRewardLedger(rawLedger) {
  const ledger = new Map();
  if (!rawLedger) return ledger;
  if (rawLedger instanceof Map) {
    rawLedger.forEach((value, level) => {
      const numericLevel = Number(level);
      if (!Number.isFinite(numericLevel) || numericLevel < 1) return;
      ledger.set(numericLevel, normalizeLevelRewardLedgerRecord(value));
    });
    return ledger;
  }
  if (Array.isArray(rawLedger)) {
    rawLedger.forEach(entry => {
      if (!entry) return;
      if (Array.isArray(entry) && entry.length >= 2) {
        const numericLevel = Number(entry[0]);
        if (!Number.isFinite(numericLevel) || numericLevel < 1) return;
        ledger.set(numericLevel, normalizeLevelRewardLedgerRecord(entry[1]));
        return;
      }
      const numericLevel = Number(entry.level);
      if (!Number.isFinite(numericLevel) || numericLevel < 1) return;
      ledger.set(numericLevel, normalizeLevelRewardLedgerRecord(entry));
    });
    return ledger;
  }
  if (rawLedger && typeof rawLedger === 'object') {
    Object.entries(rawLedger).forEach(([key, value]) => {
      const numericLevel = Number(key);
      if (!Number.isFinite(numericLevel) || numericLevel < 1) return;
      ledger.set(numericLevel, normalizeLevelRewardLedgerRecord(value));
    });
  }
  return ledger;
}

function deriveLedgerRecordFromLevelEntry(entry) {
  const rewards = entry?.rewards || {};
  return {
    hpBonus: Number.isFinite(Number(rewards.hpBonus)) ? Number(rewards.hpBonus) : 0,
    spBonus: Number.isFinite(Number(rewards.spBonus)) ? Number(rewards.spBonus) : 0,
    augmentSlots: Number.isFinite(Number(rewards.augmentSlots)) ? Number(rewards.augmentSlots) : 0,
    statIncreases: rewards.grantsStatIncrease ? 1 : 0,
    legendaryGearAccess: rewards.grantsLegendaryGearAccess === true,
    transcendentTrait: rewards.grantsTranscendentTrait === true,
  };
}

function mergeLedgerRecords(existing, baseline) {
  if (!existing) return baseline;
  return {
    hpBonus: Number.isFinite(existing.hpBonus) ? existing.hpBonus : baseline.hpBonus,
    spBonus: Number.isFinite(existing.spBonus) ? existing.spBonus : baseline.spBonus,
    augmentSlots: Number.isFinite(existing.augmentSlots) ? existing.augmentSlots : baseline.augmentSlots,
    statIncreases: Number.isFinite(existing.statIncreases) ? existing.statIncreases : baseline.statIncreases,
    legendaryGearAccess: existing.legendaryGearAccess || baseline.legendaryGearAccess,
    transcendentTrait: existing.transcendentTrait || baseline.transcendentTrait,
  };
}

function buildLevelRewardLedgerUpTo(level, seedLedger) {
  const normalizedLevel = Math.max(1, Number(level) || 1);
  const ledger = new Map();
  const sourceLedger = seedLedger instanceof Map ? seedLedger : null;
  LEVEL_TABLE.forEach(entry => {
    const entryLevel = Number(entry?.level);
    if (!Number.isFinite(entryLevel) || entryLevel < 1 || entryLevel > normalizedLevel) return;
    const baseline = deriveLedgerRecordFromLevelEntry(entry);
    const existing = sourceLedger?.get(entryLevel) || null;
    ledger.set(entryLevel, mergeLedgerRecords(existing, baseline));
  });
  return ledger;
}

function summarizeLevelRewardLedger(ledger, highestLevel) {
  const limit = Math.max(1, Number(highestLevel) || 1);
  const totals = {
    hpBonus: 0,
    spBonus: 0,
    augmentSlotsEarned: 0,
    statIncreases: 0,
    legendaryGearAccess: false,
    transcendentTrait: false,
  };
  if (!(ledger instanceof Map)) return totals;
  for (let level = 1; level <= limit; level += 1) {
    const rewards = ledger.get(level);
    if (!rewards) continue;
    totals.hpBonus += Number.isFinite(rewards.hpBonus) ? rewards.hpBonus : 0;
    totals.spBonus += Number.isFinite(rewards.spBonus) ? rewards.spBonus : 0;
    totals.augmentSlotsEarned += Number.isFinite(rewards.augmentSlots) ? rewards.augmentSlots : 0;
    totals.statIncreases += Number.isFinite(rewards.statIncreases) ? rewards.statIncreases : 0;
    if (rewards.legendaryGearAccess) totals.legendaryGearAccess = true;
    if (rewards.transcendentTrait) totals.transcendentTrait = true;
  }
  const expectedSlots = AUGMENT_SLOT_LEVELS.filter(level => level <= limit).length;
  totals.augmentSlotsEarned = Math.max(totals.augmentSlotsEarned, expectedSlots);
  return totals;
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
  const ledger = parseStoredLevelRewardLedger(levelProgressState?.appliedRewardsByLevel);
  const ledgerEntries = ledger.size
    ? Array.from(ledger.entries())
        .map(([level, record]) => ({ level: Number(level), ...normalizeLevelRewardLedgerRecord(record) }))
        .filter(entry => Number.isFinite(entry.level) && entry.level >= 1)
        .sort((a, b) => a.level - b.level)
    : [];
  const statAssignments = [];
  if (levelProgressState?.statAssignments instanceof Map) {
    levelProgressState.statAssignments.forEach((ability, rewardId) => {
      if (typeof rewardId !== 'string' || !rewardId) return;
      if (typeof ability !== 'string' || !ability) return;
      if (completed.includes(rewardId)) {
        statAssignments.push([rewardId, ability]);
      }
    });
  }
  return {
    highestAppliedLevel: Number(levelProgressState?.highestAppliedLevel) || 1,
    hpBonus: Number(levelProgressState?.hpBonus) || 0,
    spBonus: Number(levelProgressState?.spBonus) || 0,
    augmentSlotsEarned: Number(levelProgressState?.augmentSlotsEarned) || 0,
    statIncreases: Number(levelProgressState?.statIncreases) || 0,
    legendaryGearAccess: levelProgressState?.legendaryGearAccess === true,
    transcendentTrait: levelProgressState?.transcendentTrait === true,
    completedRewardIds: completed,
    appliedRewardsByLevel: ledgerEntries,
    statAssignments,
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
    next.legendaryGearAccess = state.legendaryGearAccess === true;
    next.transcendentTrait = state.transcendentTrait === true;
    if (Array.isArray(state.completedRewardIds) && state.completedRewardIds.length) {
      next.completedRewardIds = new Set(state.completedRewardIds.filter(Boolean));
    }
  }
  next.statAssignments = normalizeStatAssignments(state?.statAssignments);
  const storedLedger = parseStoredLevelRewardLedger(state && (state.appliedRewardsByLevel || state.appliedRewards));
  next.appliedRewardsByLevel = buildLevelRewardLedgerUpTo(next.highestAppliedLevel, storedLedger);
  const totals = summarizeLevelRewardLedger(next.appliedRewardsByLevel, next.highestAppliedLevel);
  next.hpBonus = totals.hpBonus;
  next.spBonus = totals.spBonus;
  next.augmentSlotsEarned = totals.augmentSlotsEarned;
  next.statIncreases = totals.statIncreases;
  next.legendaryGearAccess = totals.legendaryGearAccess || next.legendaryGearAccess;
  next.transcendentTrait = totals.transcendentTrait || next.transcendentTrait;
  if (next.completedRewardIds instanceof Set && next.completedRewardIds.size) {
    next.completedRewardIds.forEach(id => {
      const match = typeof id === 'string' ? id.match(/level-(\d+)-/i) : null;
      if (match && Number(match[1]) > next.highestAppliedLevel) {
        next.completedRewardIds.delete(id);
      }
    });
  }
  if (next.statAssignments instanceof Map && next.statAssignments.size) {
    next.statAssignments.forEach((value, rewardId) => {
      if (!next.completedRewardIds.has(rewardId)) {
        next.statAssignments.delete(rewardId);
      }
    });
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
        window.dmNotify?.('Used Cinematic Action Point', { actionScope: 'major' });
        logAction(`Cinematic Action Point: ${prev} -> Used`);

        if (capBox) {
          resetAuraState();
          capBox.classList.add('cap-box--spent');
        }

        const shouldAnimateCapAura = Boolean(
          capBox && animationsEnabled
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

function fireConfettiBursts(schedule = []) {
  if (!Array.isArray(schedule) || !schedule.length) return;
  loadConfetti().then(fn => {
    schedule.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const { delay = 0, options } = entry;
      if (!options || typeof options !== 'object') return;
      const trigger = () => {
        try {
          fn(options);
        } catch {}
      };
      if (delay > 0) {
        setTimeout(trigger, delay);
      } else {
        trigger();
      }
    });
  });
}

function launchSubTierConfetti(){
  fireConfettiBursts([
    {
      options: {
        particleCount: 60,
        spread: 55,
        startVelocity: 38,
        decay: 0.92,
        scalar: 0.7,
        origin: { x: 0.25, y: 0.9 }
      }
    },
    {
      options: {
        particleCount: 60,
        spread: 55,
        startVelocity: 38,
        decay: 0.92,
        scalar: 0.7,
        origin: { x: 0.75, y: 0.9 }
      }
    }
  ]);
}

function launchTierConfetti(){
  fireConfettiBursts([
    {
      options: {
        particleCount: 160,
        spread: 85,
        startVelocity: 48,
        decay: 0.9,
        scalar: 1,
        origin: { x: 0.2, y: 0.6 }
      }
    },
    {
      options: {
        particleCount: 160,
        spread: 85,
        startVelocity: 48,
        decay: 0.9,
        scalar: 1,
        origin: { x: 0.8, y: 0.6 }
      }
    },
    {
      delay: 250,
      options: {
        particleCount: 220,
        spread: 120,
        startVelocity: 55,
        decay: 0.88,
        scalar: 1.1,
        origin: { x: 0.5, y: 0.4 }
      }
    }
  ]);
}

function launchFireworks(){
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
updateLevelOutputs(getLevelEntry(currentLevelIdx));

function getLevelCelebrationType(prevIdx, nextIdx) {
  if (!Number.isFinite(prevIdx) || !Number.isFinite(nextIdx) || nextIdx <= prevIdx) {
    return 'none';
  }
  let sawTierIncrease = false;
  let sawSubTierIncrease = false;
  for (let i = prevIdx + 1; i <= nextIdx; i++) {
    const current = getLevelEntry(i);
    const previous = getLevelEntry(i - 1);
    if (!current || !previous) continue;
    if (!sawTierIncrease) {
      const prevTierNumber = Number.isFinite(Number(previous.tierNumber)) ? Number(previous.tierNumber) : null;
      const currentTierNumber = Number.isFinite(Number(current.tierNumber)) ? Number(current.tierNumber) : null;
      const prevTierLabel = previous.tierLabel ? String(previous.tierLabel).trim() : '';
      const currentTierLabel = current.tierLabel ? String(current.tierLabel).trim() : '';
      if (currentTierNumber !== prevTierNumber || currentTierLabel !== prevTierLabel) {
        sawTierIncrease = true;
      }
    }
    if (!sawSubTierIncrease) {
      const prevSubTier = previous.subTier ? String(previous.subTier).trim() : '';
      const currentSubTier = current.subTier ? String(current.subTier).trim() : '';
      if (currentSubTier && currentSubTier !== prevSubTier) {
        sawSubTierIncrease = true;
      }
    }
    if (sawTierIncrease && sawSubTierIncrease) break;
  }
  if (sawTierIncrease) return 'tier';
  if (sawSubTierIncrease) return 'subTier';
  return 'none';
}

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

const TRACKER_STATUS_LABELS = {
  healthy: 'Healthy',
  wounded: 'Wounded',
  critical: 'Critical',
  full: 'Full',
  steady: 'Steady',
  low: 'Low',
  depleted: 'Depleted',
  stable: 'Stable',
  unstable: 'Unstable',
  dead: 'Fallen',
};

const TRACKER_STATUS_COLORS = {
  stable: 'var(--success,#22c55e)',
  unstable: 'var(--warning,#f59e0b)',
  dead: 'var(--error,#f87171)',
  full: 'var(--success,#22c55e)',
  steady: 'var(--accent,#6366f1)',
  low: 'var(--warning,#f59e0b)',
  critical: 'var(--error,#f87171)',
  depleted: 'var(--error,#f87171)',
};

const TRACKER_PROGRESS_ROLL_CLASS = 'tracker-progress--death-roll';

function applyProgressGradient(progressEl, labelEl, currentValue, maxValue, opts = {}){
  if (!progressEl) return;
  const numericCurrent = Number(currentValue);
  const numericMax = Number(maxValue);
  const ratio = Number.isFinite(numericCurrent) && Number.isFinite(numericMax) && numericMax > 0
    ? Math.min(Math.max(numericCurrent / numericMax, 0), 1)
    : 0;
  const ratioValue = Number.isFinite(ratio) ? ratio : 0;
  const hue = Math.round(120 * ratioValue);
  const baseColor = `hsl(${hue}deg 68% 46%)`;
  const statusOverride = typeof opts.statusOverride === 'string' ? opts.statusOverride : null;
  const baseStatus = ratio >= 0.7 ? 'healthy' : ratio >= 0.3 ? 'wounded' : 'critical';
  const statusBeforeRemap = statusOverride || baseStatus;
  const statusRemap = opts && typeof opts.statusRemap === 'object' && opts.statusRemap !== null
    ? opts.statusRemap
    : null;
  const statusAfterRemap = statusOverride
    ? statusBeforeRemap
    : (statusRemap?.[statusBeforeRemap] || statusBeforeRemap);
  const statusLabelOverride = typeof opts.statusLabelOverride === 'string' ? opts.statusLabelOverride : null;
  const statusColorOverride = typeof opts.statusColorOverride === 'string' ? opts.statusColorOverride : null;
  const colorOverride = typeof opts.colorOverride === 'string' ? opts.colorOverride : null;
  const statusLabels = opts && typeof opts.statusLabels === 'object' && opts.statusLabels !== null
    ? opts.statusLabels
    : null;
  const statusColors = opts && typeof opts.statusColors === 'object' && opts.statusColors !== null
    ? opts.statusColors
    : null;
  const fallbackStatusColor = typeof TRACKER_STATUS_COLORS[statusAfterRemap] === 'string'
    ? TRACKER_STATUS_COLORS[statusAfterRemap]
    : typeof TRACKER_STATUS_COLORS[statusBeforeRemap] === 'string'
      ? TRACKER_STATUS_COLORS[statusBeforeRemap]
      : null;
  const derivedStatusColor = statusColors?.[statusAfterRemap]
    ?? statusColors?.[statusBeforeRemap]
    ?? null;
  const statusColor = statusColorOverride
    || derivedStatusColor
    || fallbackStatusColor
    || baseColor;
  const color = colorOverride
    || statusColorOverride
    || derivedStatusColor
    || fallbackStatusColor
    || baseColor;
  const percentValue = Math.round(ratioValue * 100);
  const trackerEl = resolveTracker ? resolveTracker(progressEl) : (progressEl && typeof progressEl.closest === 'function'
    ? progressEl.closest('.tracker-progress')
    : null);
  const progressContainer = progressEl && typeof progressEl.parentElement !== 'undefined'
    ? progressEl.parentElement
    : null;
  const applyProgressVars = target => {
    if (!target || typeof target.style?.setProperty !== 'function') return;
    target.style.setProperty('--progress-color', color);
    target.style.setProperty('--progress-ratio', ratioValue.toFixed(4));
    target.style.setProperty('--progress-percent', `${percentValue}`);
    target.style.setProperty('--tracker-color', color);
    target.style.setProperty('--tracker-status-color', statusColor);
  };
  applyProgressVars(progressEl);
  if (progressEl.dataset) progressEl.dataset.status = statusAfterRemap;
  if (progressContainer && progressContainer !== progressEl) {
    applyProgressVars(progressContainer);
    if (progressContainer.dataset) {
      progressContainer.dataset.status = statusAfterRemap;
    }
  }
  if (trackerEl && trackerEl !== progressContainer && trackerEl !== progressEl) {
    applyProgressVars(trackerEl);
    if (trackerEl.dataset) {
      trackerEl.dataset.status = statusAfterRemap;
    }
  }
  if (labelEl) {
    applyProgressVars(labelEl);
    if (labelEl.dataset) {
      labelEl.dataset.status = statusAfterRemap;
    }
    const statusLabel = statusLabelOverride
      || statusLabels?.[statusAfterRemap]
      || statusLabels?.[statusBeforeRemap]
      || TRACKER_STATUS_LABELS[statusAfterRemap]
      || TRACKER_STATUS_LABELS[statusBeforeRemap]
      || '';
    const statusEl = labelEl.querySelector('.tracker-progress__status');
    if (statusEl) {
      statusEl.textContent = statusLabel;
      if (statusEl.dataset) {
        statusEl.dataset.status = statusAfterRemap;
      }
      if ('hidden' in statusEl) {
        statusEl.hidden = statusLabel.length === 0;
      }
      if (typeof statusEl.style?.setProperty === 'function') {
        statusEl.style.setProperty('--tracker-status-color', statusColor);
      }
    }
  }
  const valueContainer = progressEl && typeof progressEl.closest === 'function'
    ? progressEl.closest('.hp-field__status, .sp-field__status')
    : null;
  if (valueContainer && typeof valueContainer.querySelectorAll === 'function') {
    valueContainer.querySelectorAll('.hp-field__value, .sp-field__value').forEach(applyProgressVars);
  }
  return {
    ratio: ratioValue,
    percent: percentValue,
    color,
    status: statusAfterRemap,
    statusLabel: statusLabelOverride
      || statusLabels?.[statusAfterRemap]
      || statusLabels?.[statusBeforeRemap]
      || TRACKER_STATUS_LABELS[statusAfterRemap]
      || TRACKER_STATUS_LABELS[statusBeforeRemap]
      || '',
    trackerEl: trackerEl || progressContainer || null,
  };
}

function getAugmentById(id) {
  return AUGMENT_BY_ID.get(id) || null;
}

const LEVEL_REWARD_CATEGORIES = {
  ABILITIES: 'abilities',
  STORY: 'story',
  COMBAT: 'combat',
};

const LEVEL_REWARD_CATEGORY_CONFIG = {
  [LEVEL_REWARD_CATEGORIES.ABILITIES]: {
    emptyMessage: 'No ability updates pending.',
    heading: 'Ability updates pending',
    ariaLabel: count => (count === 1 ? '1 ability update pending' : `${count} ability updates pending`),
    defaultAriaLabel: 'Ability reward reminders',
  },
  [LEVEL_REWARD_CATEGORIES.STORY]: {
    emptyMessage: 'No story rewards pending.',
    heading: 'Story rewards pending',
    ariaLabel: count => (count === 1 ? '1 story reward pending' : `${count} story rewards pending`),
    defaultAriaLabel: 'Story reward reminders',
  },
  [LEVEL_REWARD_CATEGORIES.COMBAT]: {
    emptyMessage: 'No combat rewards pending.',
    heading: 'Combat rewards pending',
    ariaLabel: count => (count === 1 ? '1 combat reward pending' : `${count} combat rewards pending`),
    defaultAriaLabel: 'Combat reward reminders',
  },
};

const LEVEL_REWARD_CATEGORY_BY_TYPE = new Map([
  ['stat', LEVEL_REWARD_CATEGORIES.ABILITIES],
  ['ability-score', LEVEL_REWARD_CATEGORIES.ABILITIES],
  ['saving-throw', LEVEL_REWARD_CATEGORIES.ABILITIES],
  ['skill', LEVEL_REWARD_CATEGORIES.ABILITIES],
  ['xp', LEVEL_REWARD_CATEGORIES.STORY],
  ['credit', LEVEL_REWARD_CATEGORIES.STORY],
  ['credits', LEVEL_REWARD_CATEGORIES.STORY],
  ['faction', LEVEL_REWARD_CATEGORIES.STORY],
  ['faction-rep', LEVEL_REWARD_CATEGORIES.STORY],
  ['faction-reputation', LEVEL_REWARD_CATEGORIES.STORY],
  ['medal', LEVEL_REWARD_CATEGORIES.STORY],
  ['medals', LEVEL_REWARD_CATEGORIES.STORY],
  ['honor', LEVEL_REWARD_CATEGORIES.STORY],
  ['honors', LEVEL_REWARD_CATEGORIES.STORY],
  ['honour', LEVEL_REWARD_CATEGORIES.STORY],
  ['honours', LEVEL_REWARD_CATEGORIES.STORY],
]);

function normalizeLevelRewardCategory(type, category) {
  const normalizedCategory = typeof category === 'string' ? category : '';
  if (normalizedCategory === LEVEL_REWARD_CATEGORIES.ABILITIES
    || normalizedCategory === LEVEL_REWARD_CATEGORIES.STORY
    || normalizedCategory === LEVEL_REWARD_CATEGORIES.COMBAT) {
    return normalizedCategory;
  }
  const normalizedType = typeof type === 'string' ? type : '';
  return LEVEL_REWARD_CATEGORY_BY_TYPE.get(normalizedType) || LEVEL_REWARD_CATEGORIES.COMBAT;
}

function createLevelRewardTask({ id, level, label, type, category, autoComplete = false, details = [] }) {
  const normalizedType = typeof type === 'string' ? type : '';
  return {
    id,
    level,
    label,
    type: normalizedType,
    category: normalizeLevelRewardCategory(normalizedType, category),
    autoComplete: autoComplete === true,
    details: normalizeTaskDetails(details),
  };
}

function normalizeRewardEntries(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

function normalizeTaskDetails(details) {
  if (!details) return [];
  const entries = Array.isArray(details) ? details : [details];
  return entries
    .map(entry => {
      if (typeof entry === 'string') return entry.trim();
      return '';
    })
    .filter(Boolean);
}

function extractNumericReward(value) {
  if (Number.isFinite(value)) return Number(value);
  if (typeof value === 'string') {
    const normalized = Number(value.replace(/[^0-9+\-.]/g, ''));
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

function parseCreditRewardEntries(rawCredits) {
  const entries = [];
  normalizeRewardEntries(rawCredits).forEach(entry => {
    if (entry == null) return;
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const amount = extractNumericReward(
        entry.amount ?? entry.value ?? entry.delta ?? entry.credits ?? entry.quantity ?? entry.total,
      );
      const note = [entry.reason, entry.note, entry.label, entry.description, entry.summary]
        .find(text => typeof text === 'string' && text.trim());
      if (Number.isFinite(amount) && amount !== 0) {
        entries.push({ amount, note: note ? note.trim() : '' });
      } else if (note) {
        entries.push({ amount: null, note: note.trim() });
      }
      return;
    }
    const amount = extractNumericReward(entry);
    if (Number.isFinite(amount) && amount !== 0) {
      entries.push({ amount, note: '' });
    } else if (typeof entry === 'string' && entry.trim()) {
      entries.push({ amount: null, note: entry.trim() });
    }
  });
  return entries;
}

function parseFactionRewardEntries(rawFactions) {
  const entries = [];
  normalizeRewardEntries(rawFactions).forEach(entry => {
    if (entry == null) return;
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const name = [entry.name, entry.factionName, entry.faction, entry.factionId, entry.id]
        .find(text => typeof text === 'string' && text.trim());
      const delta = extractNumericReward(entry.delta ?? entry.value ?? entry.change ?? entry.amount);
      const note = [entry.reason, entry.note, entry.label, entry.description]
        .find(text => typeof text === 'string' && text.trim());
      if (name || Number.isFinite(delta) || note) {
        entries.push({
          name: name ? name.trim() : '',
          delta: Number.isFinite(delta) ? delta : null,
          note: note ? note.trim() : '',
        });
      }
      return;
    }
    if (typeof entry === 'string' && entry.trim()) {
      entries.push({ name: entry.trim(), delta: null, note: '' });
    }
  });
  return entries;
}

function parseMedalRewardEntries(rawMedals) {
  const entries = [];
  normalizeRewardEntries(rawMedals).forEach(entry => {
    if (entry == null) return;
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const name = [entry.name, entry.title, entry.label]
        .find(text => typeof text === 'string' && text.trim());
      const note = [entry.reason, entry.note, entry.description]
        .find(text => typeof text === 'string' && text.trim());
      if (name || note) {
        entries.push({
          name: name ? name.trim() : '',
          note: note ? note.trim() : '',
        });
      }
      return;
    }
    if (typeof entry === 'string' && entry.trim()) {
      entries.push({ name: entry.trim(), note: '' });
    }
  });
  return entries;
}

function parseHonorRewardEntries(rawHonors) {
  const entries = [];
  normalizeRewardEntries(rawHonors).forEach(entry => {
    if (entry == null) return;
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      const name = [entry.name, entry.title, entry.label]
        .find(text => typeof text === 'string' && text.trim());
      const note = [entry.reason, entry.note, entry.description]
        .find(text => typeof text === 'string' && text.trim());
      if (name || note) {
        entries.push({
          name: name ? name.trim() : '',
          note: note ? note.trim() : '',
        });
      }
      return;
    }
    if (typeof entry === 'string' && entry.trim()) {
      entries.push({ name: entry.trim(), note: '' });
    }
  });
  return entries;
}

function updateReminderButtonUI(button, badge, count, categoryKey) {
  const numericCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  if (badge) {
    if (numericCount > 0) {
      const label = numericCount > 99 ? '99+' : String(numericCount);
      badge.textContent = label;
      badge.hidden = false;
    } else {
      badge.textContent = '0';
      badge.hidden = true;
    }
  }

  if (!button) return;

  const config = LEVEL_REWARD_CATEGORY_CONFIG[categoryKey] || LEVEL_REWARD_CATEGORY_CONFIG[LEVEL_REWARD_CATEGORIES.COMBAT];

  if (numericCount > 0) {
    button.hidden = false;
    if (typeof button.removeAttribute === 'function' && typeof button.setAttribute === 'function') {
      button.removeAttribute('aria-hidden');
      button.setAttribute('data-pending', 'true');
      button.setAttribute('data-animate', 'true');
      button.setAttribute('aria-label', `${config.ariaLabel(numericCount)}. View reminder.`);
    } else {
      button.ariaHidden = 'false';
      if (button?.dataset) {
        button.dataset.pending = 'true';
        button.dataset.animate = 'true';
      }
      button.ariaLabel = `${config.ariaLabel(numericCount)}. View reminder.`;
    }
  } else {
    button.hidden = true;
    if (typeof button.setAttribute === 'function') {
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-label', config.defaultAriaLabel);
      if (typeof button.removeAttribute === 'function') {
        button.removeAttribute('data-pending');
        button.removeAttribute('data-animate');
      } else if (button?.dataset) {
        delete button.dataset.pending;
        delete button.dataset.animate;
      }
    } else {
      button.ariaHidden = 'true';
      if (button?.dataset) {
        delete button.dataset.pending;
        delete button.dataset.animate;
      }
      button.ariaLabel = config.defaultAriaLabel;
    }
  }
}

function getPendingTasksForCategory(category) {
  if (category === LEVEL_REWARD_CATEGORIES.ABILITIES) return pendingAbilityReminderTasks;
  if (category === LEVEL_REWARD_CATEGORIES.STORY) return pendingStoryReminderTasks;
  return pendingCombatReminderTasks;
}

function showLevelRewardReminderToast(categoryKey) {
  const category = normalizeLevelRewardCategory(null, categoryKey);
  const config = LEVEL_REWARD_CATEGORY_CONFIG[category] || LEVEL_REWARD_CATEGORY_CONFIG[LEVEL_REWARD_CATEGORIES.COMBAT];
  const tasks = Array.isArray(getPendingTasksForCategory(category)) ? getPendingTasksForCategory(category) : [];
  resetToastNotifications({ restoreFocus: false });
  if (!tasks.length) {
    toast(config.emptyMessage, { type: 'info', duration: 4000 });
    return;
  }
  const lines = tasks.map(task => task?.label).filter(Boolean);
  const heading = config.heading;
  const summaryText = lines.length ? `${heading}: ${lines.join(', ')}` : heading;
  const htmlLines = lines.map(line => `<span class="toast-line">• ${escapeHtml(line)}</span>`);
  const html = `<div class="toast-body"><strong>${escapeHtml(heading)}</strong>${htmlLines.join('')}</div>`;
  toast(summaryText, {
    type: 'info',
    duration: 0,
    html,
    meta: {
      source: 'level-reward',
      importance: 'high',
      category: 'gameplay',
      log: true,
    },
  });
}

function getLevelRewardTasksForLevel(entry) {
  const levelNumber = Number(entry?.level);
  if (!Number.isFinite(levelNumber) || levelNumber < 1) return [];
  const rewards = entry?.rewards || {};
  const tasks = [];
  const levelIndex = LEVEL_TABLE.findIndex(candidate => Number(candidate?.level) === levelNumber);
  const previousEntry = levelIndex > 0 ? LEVEL_TABLE[levelIndex - 1] : null;

  const previousXp = Number.isFinite(Number(previousEntry?.xp)) ? Number(previousEntry.xp) : 0;
  const currentXp = Number(entry?.xp);
  const xpGain = Number.isFinite(currentXp) ? Math.max(0, currentXp - Math.max(0, previousXp)) : 0;
  if (xpGain > 0) {
    const formattedGain = xpNumberFormatter ? xpNumberFormatter.format(xpGain) : String(xpGain);
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-xp`,
      level: levelNumber,
      label: `Log ${formattedGain} XP (Level ${levelNumber})`,
      type: 'xp',
      category: LEVEL_REWARD_CATEGORIES.STORY,
    }));
  }

  const creditRewards = parseCreditRewardEntries(rewards.credits ?? rewards.credit ?? rewards.storyCredits);
  creditRewards.forEach((reward, index) => {
    const suffix = creditRewards.length > 1 ? `-${index + 1}` : '';
    const amount = Number.isFinite(reward.amount) ? Number(reward.amount) : null;
    const formattedAmount = Number.isFinite(amount)
      ? (rewardNumberFormatter ? rewardNumberFormatter.format(Math.abs(amount)) : String(Math.abs(amount)))
      : '';
    const sign = Number.isFinite(amount) ? (amount >= 0 ? '+' : '−') : '';
    const baseLabel = Number.isFinite(amount)
      ? `Log ${sign}${formattedAmount} Credits (Level ${levelNumber})`
      : `Log Credits reward (Level ${levelNumber})`;
    const label = reward.note ? `${baseLabel} — ${reward.note}` : baseLabel;
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-credits${suffix}`,
      level: levelNumber,
      label,
      type: 'credits',
      category: LEVEL_REWARD_CATEGORIES.STORY,
    }));
  });

  const factionRewards = parseFactionRewardEntries(
    rewards.factionReputation ?? rewards.factionRep ?? rewards.factions ?? rewards.storyFactions,
  );
  factionRewards.forEach((reward, index) => {
    const suffix = factionRewards.length > 1 ? `-${index + 1}` : '';
    const factionName = reward.name || 'Faction';
    const delta = Number.isFinite(reward.delta) ? Number(reward.delta) : null;
    const deltaLabel = Number.isFinite(delta)
      ? ` (${delta >= 0 ? '+' : ''}${delta})`
      : '';
    const baseLabel = `Update faction reputation for ${factionName}${deltaLabel} (Level ${levelNumber})`;
    const label = reward.note ? `${baseLabel} — ${reward.note}` : baseLabel;
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-faction-rep${suffix}`,
      level: levelNumber,
      label,
      type: 'faction-rep',
      category: LEVEL_REWARD_CATEGORIES.STORY,
    }));
  });

  const medalRewards = parseMedalRewardEntries(rewards.medals ?? rewards.medal ?? rewards.medallions);
  medalRewards.forEach((reward, index) => {
    const suffix = medalRewards.length > 1 ? `-${index + 1}` : '';
    const medalName = reward.name || 'Medal';
    const baseLabel = `Record medal: ${medalName} (Level ${levelNumber})`;
    const label = reward.note ? `${baseLabel} — ${reward.note}` : baseLabel;
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-medal${suffix}`,
      level: levelNumber,
      label,
      type: 'medal',
      category: LEVEL_REWARD_CATEGORIES.STORY,
    }));
  });

  const honorRewards = parseHonorRewardEntries(
    rewards.honors ?? rewards.honor ?? rewards.honours ?? rewards.honour,
  );
  honorRewards.forEach((reward, index) => {
    const suffix = honorRewards.length > 1 ? `-${index + 1}` : '';
    const honorName = reward.name || 'Honor';
    const baseLabel = `Record honor: ${honorName} (Level ${levelNumber})`;
    const label = reward.note ? `${baseLabel} — ${reward.note}` : baseLabel;
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-honor${suffix}`,
      level: levelNumber,
      label,
      type: 'honor',
      category: LEVEL_REWARD_CATEGORIES.STORY,
    }));
  });

  const previousProf = Number(previousEntry?.proficiencyBonus);
  const currentProf = Number(entry?.proficiencyBonus);
  if (Number.isFinite(currentProf) && Number.isFinite(previousProf) && currentProf > previousProf) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-saving-throws`,
      level: levelNumber,
      label: `Update saving throws for proficiency ${currentProf} (Level ${levelNumber})`,
      type: 'saving-throw',
      category: LEVEL_REWARD_CATEGORIES.ABILITIES,
    }));
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-skills`,
      level: levelNumber,
      label: `Update skill bonuses for proficiency ${currentProf} (Level ${levelNumber})`,
      type: 'skill',
      category: LEVEL_REWARD_CATEGORIES.ABILITIES,
    }));
  }

  const hpBonus = Number(rewards.hpBonus);
  if (Number.isFinite(hpBonus) && hpBonus !== 0) {
    const sign = hpBonus > 0 ? '+' : '';
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-hp-bonus`,
      level: levelNumber,
      label: `Max HP ${sign}${hpBonus} (Level ${levelNumber})`,
      type: 'hp-bonus',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      autoComplete: true,
      details: `Your maximum HP was automatically adjusted by ${sign}${hpBonus}.`,
    }));
  }

  const spBonus = Number(rewards.spBonus);
  if (Number.isFinite(spBonus) && spBonus !== 0) {
    const sign = spBonus > 0 ? '+' : '';
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-sp-bonus`,
      level: levelNumber,
      label: `SP Max ${sign}${spBonus} (Level ${levelNumber})`,
      type: 'sp-bonus',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      autoComplete: true,
      details: `Your SP maximum was automatically adjusted by ${sign}${spBonus}.`,
    }));
  }

  const augmentSlots = Number(rewards.augmentSlots);
  if (Number.isFinite(augmentSlots) && augmentSlots !== 0) {
    const slotsLabel = augmentSlots === 1
      ? 'Assign +1 Augment Slot'
      : `Assign +${augmentSlots} Augment Slots`;
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-augment-slot`,
      level: levelNumber,
      label: `${slotsLabel} (Level ${levelNumber})`,
      type: 'augment-slot',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
    }));
  }

  if (rewards.grantsStatIncrease) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-stat`,
      level: levelNumber,
      label: `Assign +1 Ability Score (Level ${levelNumber})`,
      type: 'stat',
      category: LEVEL_REWARD_CATEGORIES.ABILITIES,
      details: [
        'Choose which ability score gains +1 using the dropdown.',
        'The selected score will be increased on your sheet automatically.',
      ],
    }));
  }
  if (rewards.grantsPowerEvolution) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-power-evolution`,
      level: levelNumber,
      label: `Apply Power Evolution (Level ${levelNumber})`,
      type: 'power-evolution',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      details: [
        'Add +1 damage die to a power.',
        'Reduce a DC or target number by 1.',
        'Reduce the SP cost of a power by 1 (minimum 0).',
      ],
    }));
  }
  if (rewards.powerEvolutionChoice || rewards.signatureEvolutionChoice) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-evolution-choice`,
      level: levelNumber,
      label: `Choose Power or Signature Move Evolution (Level ${levelNumber})`,
      type: 'evolution-choice',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      details: [
        'Decide whether to evolve a power or your signature move.',
        'Coordinate with your GM to document the new effect or upgrade.',
      ],
    }));
  }
  if (rewards.grantsSignatureEvolution) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-signature-evolution`,
      level: levelNumber,
      label: `Apply Signature Move Evolution (Level ${levelNumber})`,
      type: 'signature-evolution',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      details: [
        'Enhance your signature move with a new effect, extra damage, or reduced cost.',
        'Record the evolution on the Signature Move card.',
      ],
    }));
  }
  if (rewards.grantsLegendaryGearAccess) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-legendary-gear`,
      level: levelNumber,
      label: `Unlock Legendary Gear Access (Level ${levelNumber})`,
      type: 'legendary-gear',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      details: 'You can requisition Legendary gear from the catalog going forward.',
    }));
  }
  if (rewards.grantsTranscendentTrait) {
    tasks.push(createLevelRewardTask({
      id: `level-${levelNumber}-transcendent-trait`,
      level: levelNumber,
      label: `Gain Transcendent Trait (Level ${levelNumber})`,
      type: 'transcendent-trait',
      category: LEVEL_REWARD_CATEGORIES.COMBAT,
      details: 'Select a Transcendent Trait and add it to your Story tab.',
    }));
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
  const creditRewards = parseCreditRewardEntries(rewards.credits ?? rewards.credit ?? rewards.storyCredits);
  if (creditRewards.length) {
    const totalCredits = creditRewards
      .map(entry => (Number.isFinite(entry.amount) ? Number(entry.amount) : 0))
      .reduce((sum, value) => sum + value, 0);
    if (Number.isFinite(totalCredits) && totalCredits !== 0) {
      const formatted = rewardNumberFormatter
        ? rewardNumberFormatter.format(Math.abs(totalCredits))
        : String(Math.abs(totalCredits));
      const sign = totalCredits >= 0 ? '+' : '−';
      parts.push(`${sign}${formatted} Credits`);
    } else {
      parts.push('Credits reward');
    }
  }
  const factionRewards = parseFactionRewardEntries(
    rewards.factionReputation ?? rewards.factionRep ?? rewards.factions ?? rewards.storyFactions,
  );
  if (factionRewards.length) {
    const names = factionRewards.map(entry => entry.name).filter(Boolean);
    if (names.length === 1) {
      const delta = Number.isFinite(factionRewards[0].delta) ? Number(factionRewards[0].delta) : null;
      const deltaText = Number.isFinite(delta) && delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
      parts.push(`Faction rep: ${names[0]}${deltaText}`);
    } else if (names.length > 1) {
      parts.push('Faction rep updates');
    } else {
      parts.push('Faction reputation change');
    }
  }
  const medalRewards = parseMedalRewardEntries(rewards.medals ?? rewards.medal ?? rewards.medallions);
  if (medalRewards.length) {
    const names = medalRewards.map(entry => entry.name).filter(Boolean);
    if (names.length === 1) {
      parts.push(`Medal: ${names[0]}`);
    } else if (names.length > 1) {
      parts.push('Medals awarded');
    } else {
      parts.push('Medal awarded');
    }
  }
  const honorRewards = parseHonorRewardEntries(
    rewards.honors ?? rewards.honor ?? rewards.honours ?? rewards.honour,
  );
  if (honorRewards.length) {
    const names = honorRewards.map(entry => entry.name).filter(Boolean);
    if (names.length === 1) {
      parts.push(`Honor: ${names[0]}`);
    } else if (names.length > 1) {
      parts.push('Honors awarded');
    } else {
      parts.push('Honor awarded');
    }
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
  const previousAssignments = previousState?.statAssignments instanceof Map
    ? new Map(previousState.statAssignments)
    : normalizeStatAssignments(previousState?.statAssignments);
  const normalizedLevel = Math.max(1, Number(targetLevel) || 1);
  completed.forEach(id => {
    const match = typeof id === 'string' ? id.match(/level-(\d+)-/i) : null;
    if (match && Number(match[1]) > normalizedLevel) {
      completed.delete(id);
    }
  });
  previousAssignments.forEach((value, rewardId) => {
    if (!completed.has(rewardId)) {
      previousAssignments.delete(rewardId);
      return;
    }
    const match = typeof rewardId === 'string' ? rewardId.match(/level-(\d+)-/i) : null;
    if (match && Number(match[1]) > normalizedLevel) {
      previousAssignments.delete(rewardId);
    }
  });
  const nextState = getDefaultLevelProgressState();
  nextState.completedRewardIds = completed;
  nextState.statAssignments = previousAssignments;
  nextState.highestAppliedLevel = normalizedLevel;
  nextState.appliedRewardsByLevel = buildLevelRewardLedgerUpTo(normalizedLevel);
  const totals = summarizeLevelRewardLedger(nextState.appliedRewardsByLevel, normalizedLevel);
  nextState.hpBonus = totals.hpBonus;
  nextState.spBonus = totals.spBonus;
  nextState.augmentSlotsEarned = totals.augmentSlotsEarned;
  nextState.statIncreases = totals.statIncreases;
  nextState.legendaryGearAccess = totals.legendaryGearAccess;
  nextState.transcendentTrait = totals.transcendentTrait;
  const newLevelEntries = [];
  LEVEL_TABLE.forEach(entry => {
    const entryLevel = Number(entry?.level);
    if (!Number.isFinite(entryLevel) || entryLevel < 1 || entryLevel > normalizedLevel) return;
    if (entryLevel > previousHighest && entryLevel <= normalizedLevel) {
      newLevelEntries.push(entry);
    }
  });
  levelProgressState = nextState;
  setDerivedHighestLevel(nextState.highestAppliedLevel);
  syncLevelBonusInputs();
  persistLevelProgressState({ silent: opts.silent === true });
  const slotsDiff = nextState.augmentSlotsEarned - previousSlots;
  if (slotsDiff > 0 && !opts.suppressNotifications) {
    const slotLabel = slotsDiff === 1 ? 'New Augment slot unlocked!' : `${slotsDiff} Augment slots unlocked!`;
    toast(slotLabel, 'success');
    window.dmNotify?.(slotLabel, { actionScope: 'major' });
    logAction(`Augment slots unlocked: ${previousSlots} -> ${nextState.augmentSlotsEarned}`);
    show('modal-augment-picker');
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
      renderLevelRewardReminders();
      show('modal-level-rewards');
      const summary = unlocked.map(task => task.label).join('; ');
      window.dmNotify?.(`Level rewards unlocked: ${summary}`, { actionScope: 'major' });
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

  if (elAugmentSelectedList) {
    toggleEmptyState(elAugmentSelectedList, ordered.length > 0);
  }
}

function renderAugmentPickerVirtualItem(augment, { placeholder, context } = {}) {
  if (!augment || !placeholder) return null;
  const canSelectMore = context && context.canSelectMore === true;
  const card = document.createElement('div');
  card.className = 'augment-card';

  const header = document.createElement('div');
  header.className = 'augment-card__header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'augment-card__title';

  const nameEl = document.createElement('h4');
  nameEl.className = 'augment-card__name';
  nameEl.textContent = augment.name || 'Augment';

  const groupEl = document.createElement('p');
  groupEl.className = 'augment-card__group';
  groupEl.textContent = augment.group || '';

  titleWrap.append(nameEl, groupEl);

  const actions = document.createElement('div');
  actions.className = 'augment-card__actions';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-sm';
  addBtn.textContent = canSelectMore ? 'Add Augment' : 'No Slots';
  addBtn.disabled = !canSelectMore;
  addBtn.dataset.focusId = 'augment-add';
  addBtn.setAttribute('data-view-allow', '');
  addBtn.addEventListener('click', () => handleAugmentAdd(augment.id));

  actions.appendChild(addBtn);
  header.append(titleWrap, actions);

  const body = document.createElement('div');
  body.className = 'augment-card__body';

  if (augment.summary) {
    const summary = document.createElement('p');
    summary.className = 'augment-card__summary';
    summary.textContent = augment.summary;
    body.appendChild(summary);
  }

  const effects = Array.isArray(augment.effects) ? augment.effects : [];
  if (effects.length) {
    const effectsList = document.createElement('ul');
    effectsList.className = 'augment-card__effects';
    effects.forEach(effect => {
      const effectItem = document.createElement('li');
      effectItem.textContent = effect;
      effectsList.appendChild(effectItem);
    });
    body.appendChild(effectsList);
  }

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'augment-card__tags';
  const tags = Array.isArray(augment.tags) ? augment.tags : [];
  tags.forEach(tag => {
    const tagChip = document.createElement('span');
    tagChip.className = 'augment-card__tag';
    tagChip.textContent = tag;
    tagsWrap.appendChild(tagChip);
  });
  body.appendChild(tagsWrap);

  card.append(header, body);
  if (augment.id) {
    placeholder.setAttribute('data-augment-id', augment.id);
  } else {
    if (typeof placeholder.removeAttribute === 'function') {
      placeholder.removeAttribute('data-augment-id');
    } else if (placeholder.dataset) {
      delete placeholder.dataset.augmentId;
    }
  }
  if (typeof placeholder.replaceChildren === 'function') {
    placeholder.replaceChildren(card);
  } else {
    placeholder.innerHTML = '';
    placeholder.appendChild(card);
  }
  return card;
}

function renderAugmentPicker() {
  if (!elAugmentAvailableList) return;
  const results = getAugmentSearchResults();
  const earned = getAugmentSlotsEarned();
  const used = Array.isArray(augmentState?.selected) ? augmentState.selected.length : 0;
  const canSelectMore = earned > used;
  augmentPickerRenderContext.canSelectMore = canSelectMore;
  augmentPickerVirtualList.update(results, augmentPickerRenderContext);
  augmentPickerVirtualList.refresh(augmentPickerRenderContext);
  toggleEmptyState(elAugmentAvailableList, results.length > 0);
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
  const taskList = Array.isArray(pendingTasks) ? pendingTasks : [];
  const pendingTypes = new Set(taskList.map(task => task?.type).filter(Boolean));
  const pendingCategories = new Set(taskList.map(task => normalizeLevelRewardCategory(task?.type, task?.category)));

  if (elAbilityCard) {
    if (pendingCategories.has(LEVEL_REWARD_CATEGORIES.ABILITIES)) {
      if (typeof elAbilityCard.setAttribute === 'function') {
        elAbilityCard.setAttribute('data-level-choice', 'stat');
      }
    } else if (typeof elAbilityCard.removeAttribute === 'function') {
      elAbilityCard.removeAttribute('data-level-choice');
    }
  }
  if (elPowersCard) {
    if (pendingTypes.has('power-evolution') || pendingTypes.has('evolution-choice') || pendingTypes.has('signature-evolution')) {
      if (typeof elPowersCard.setAttribute === 'function') {
        elPowersCard.setAttribute('data-level-choice', 'power');
      }
    } else if (typeof elPowersCard.removeAttribute === 'function') {
      elPowersCard.removeAttribute('data-level-choice');
    }
  }
  if (elStoryCard) {
    if (pendingCategories.has(LEVEL_REWARD_CATEGORIES.STORY) || pendingTypes.has('transcendent-trait')) {
      if (typeof elStoryCard.setAttribute === 'function') {
        elStoryCard.setAttribute('data-level-choice', 'story');
      }
    } else if (typeof elStoryCard.removeAttribute === 'function') {
      elStoryCard.removeAttribute('data-level-choice');
    }
  }
  if (elCombatCard) {
    if (pendingCategories.has(LEVEL_REWARD_CATEGORIES.COMBAT)) {
      if (typeof elCombatCard.setAttribute === 'function') {
        elCombatCard.setAttribute('data-level-choice', 'combat');
      }
    } else if (typeof elCombatCard.removeAttribute === 'function') {
      elCombatCard.removeAttribute('data-level-choice');
    }
  }
}

function updateLevelRewardReminderUI(pendingTasks = []) {
  const tasks = Array.isArray(pendingTasks) ? pendingTasks : [];
  const pendingCount = Math.max(0, tasks.length);
  levelRewardPendingCount = pendingCount;

  const tasksByCategory = {
    abilities: [],
    story: [],
    combat: [],
  };

  tasks.forEach(task => {
    if (!task) return;
    const category = normalizeLevelRewardCategory(task.type, task.category);
    if (category === LEVEL_REWARD_CATEGORIES.ABILITIES) {
      tasksByCategory.abilities.push(task);
    } else if (category === LEVEL_REWARD_CATEGORIES.STORY) {
      tasksByCategory.story.push(task);
    } else {
      tasksByCategory.combat.push(task);
    }
  });

  const serializeTasks = (collection = []) => collection.map(task => ({
    id: task?.id,
    label: task?.label,
    level: task?.level,
    type: task?.type,
    category: task?.category,
  }));

  pendingAbilityReminderTasks = serializeTasks(tasksByCategory.abilities);
  pendingStoryReminderTasks = serializeTasks(tasksByCategory.story);
  pendingCombatReminderTasks = serializeTasks(tasksByCategory.combat);

  if (elLevelRewardReminderBadge) {
    if (pendingCount > 0) {
      const label = pendingCount > 99 ? '99+' : String(pendingCount);
      elLevelRewardReminderBadge.textContent = label;
      elLevelRewardReminderBadge.hidden = false;
    } else {
      elLevelRewardReminderBadge.textContent = '0';
      elLevelRewardReminderBadge.hidden = true;
    }
  }

  if (elLevelRewardReminderTrigger) {
    if (pendingCount > 0) {
      elLevelRewardReminderTrigger.hidden = false;
      if (typeof elLevelRewardReminderTrigger.removeAttribute === 'function') {
        elLevelRewardReminderTrigger.removeAttribute('disabled');
        elLevelRewardReminderTrigger.removeAttribute('aria-disabled');
      } else {
        elLevelRewardReminderTrigger.disabled = false;
        if ('ariaDisabled' in elLevelRewardReminderTrigger) {
          elLevelRewardReminderTrigger.ariaDisabled = 'false';
        }
      }
      elLevelRewardReminderTrigger.disabled = false;
      if (typeof elLevelRewardReminderTrigger.removeAttribute === 'function') {
        elLevelRewardReminderTrigger.removeAttribute('aria-hidden');
      } else if (elLevelRewardReminderTrigger?.dataset) {
        delete elLevelRewardReminderTrigger.dataset.ariaHidden;
      }
      if (typeof elLevelRewardReminderTrigger.setAttribute === 'function') {
        elLevelRewardReminderTrigger.setAttribute('data-pending', 'true');
      } else if (elLevelRewardReminderTrigger?.dataset) {
        elLevelRewardReminderTrigger.dataset.pending = 'true';
      }
      const label = pendingCount === 1
        ? 'Rewards (1 pending)'
        : `Rewards (${pendingCount} pending)`;
      if (typeof elLevelRewardReminderTrigger.setAttribute === 'function') {
        elLevelRewardReminderTrigger.setAttribute('aria-label', label);
      } else if (elLevelRewardReminderTrigger) {
        elLevelRewardReminderTrigger.ariaLabel = label;
      }
    } else {
      elLevelRewardReminderTrigger.hidden = true;
      elLevelRewardReminderTrigger.disabled = true;
      if (typeof elLevelRewardReminderTrigger.setAttribute === 'function') {
        elLevelRewardReminderTrigger.setAttribute('aria-hidden', 'true');
        elLevelRewardReminderTrigger.setAttribute('aria-label', 'Rewards');
        elLevelRewardReminderTrigger.setAttribute('disabled', '');
        elLevelRewardReminderTrigger.setAttribute('aria-disabled', 'true');
      } else if (elLevelRewardReminderTrigger) {
        elLevelRewardReminderTrigger.ariaHidden = 'true';
        elLevelRewardReminderTrigger.ariaLabel = 'Rewards';
        elLevelRewardReminderTrigger.disabled = true;
        if ('ariaDisabled' in elLevelRewardReminderTrigger) {
          elLevelRewardReminderTrigger.ariaDisabled = 'true';
        }
      }
      if (typeof elLevelRewardReminderTrigger.removeAttribute === 'function') {
        elLevelRewardReminderTrigger.removeAttribute('data-pending');
        elLevelRewardReminderTrigger.removeAttribute('data-animate');
        elLevelRewardReminderTrigger.removeAttribute('data-drawer-open');
      } else if (elLevelRewardReminderTrigger?.dataset) {
        delete elLevelRewardReminderTrigger.dataset.pending;
        delete elLevelRewardReminderTrigger.dataset.animate;
        delete elLevelRewardReminderTrigger.dataset.drawerOpen;
      }
    }
  }

  if (elLevelRewardInfoTrigger) {
    if (pendingCount > 0) {
      elLevelRewardInfoTrigger.hidden = false;
      if (typeof elLevelRewardInfoTrigger.removeAttribute === 'function') {
        elLevelRewardInfoTrigger.removeAttribute('aria-hidden');
      } else if ('ariaHidden' in elLevelRewardInfoTrigger) {
        delete elLevelRewardInfoTrigger.ariaHidden;
      }
    } else {
      elLevelRewardInfoTrigger.hidden = true;
      if (typeof elLevelRewardInfoTrigger.setAttribute === 'function') {
        elLevelRewardInfoTrigger.setAttribute('aria-hidden', 'true');
      } else {
        elLevelRewardInfoTrigger.ariaHidden = 'true';
      }
    }
  }

  updateReminderButtonUI(
    elAbilityStatReminderButton,
    elAbilityStatReminderBadge,
    tasksByCategory.abilities.length,
    LEVEL_REWARD_CATEGORIES.ABILITIES,
  );
  updateReminderButtonUI(
    elStoryRewardReminderButton,
    elStoryRewardReminderBadge,
    tasksByCategory.story.length,
    LEVEL_REWARD_CATEGORIES.STORY,
  );
  updateReminderButtonUI(
    elCombatRewardReminderButton,
    elCombatRewardReminderBadge,
    tasksByCategory.combat.length,
    LEVEL_REWARD_CATEGORIES.COMBAT,
  );

  if (elLevelRewardAcknowledge) {
    elLevelRewardAcknowledge.disabled = pendingCount === 0;
  }

  syncLevelRewardReminderAnimation();
}

function syncLevelRewardReminderAnimation() {
  if (!elLevelRewardReminderTrigger) return;

  const hasPending = levelRewardPendingCount > 0;
  const hasDisabledAttr = typeof elLevelRewardReminderTrigger.hasAttribute === 'function'
    && elLevelRewardReminderTrigger.hasAttribute('disabled');
  const ariaDisabled = typeof elLevelRewardReminderTrigger.getAttribute === 'function'
    && elLevelRewardReminderTrigger.getAttribute('aria-disabled') === 'true';
  const isDisabled = elLevelRewardReminderTrigger.disabled === true || ariaDisabled || hasDisabledAttr;
  const shouldAnimate = hasPending && !isPlayerToolsDrawerOpen && !isDisabled;

  if (typeof elLevelRewardReminderTrigger.setAttribute === 'function') {
    if (shouldAnimate) {
      elLevelRewardReminderTrigger.setAttribute('data-animate', 'true');
    } else if (hasPending) {
      elLevelRewardReminderTrigger.setAttribute('data-animate', 'false');
    } else if (typeof elLevelRewardReminderTrigger.removeAttribute === 'function') {
      elLevelRewardReminderTrigger.removeAttribute('data-animate');
    }
  } else if (elLevelRewardReminderTrigger?.dataset) {
    if (shouldAnimate) {
      elLevelRewardReminderTrigger.dataset.animate = 'true';
    } else if (hasPending) {
      elLevelRewardReminderTrigger.dataset.animate = 'false';
    } else {
      delete elLevelRewardReminderTrigger.dataset.animate;
    }
  }
}

function appendLevelRewardDetails(container, details = []) {
  if (!container || !Array.isArray(details) || !details.length) return;
  const list = document.createElement('ul');
  list.className = 'level-reward-list__details';
  details.forEach(detail => {
    if (typeof detail !== 'string' || !detail.trim()) return;
    const item = document.createElement('li');
    item.textContent = detail.trim();
    list.appendChild(item);
  });
  if (list.childNodes.length) {
    container.appendChild(list);
  }
}

function renderLevelRewardReminders() {
  const tasks = getLevelRewardTasksUpTo(levelProgressState?.highestAppliedLevel || 1);
  let completed = levelProgressState?.completedRewardIds;
  if (!(completed instanceof Set)) {
    const prior = Array.isArray(levelProgressState?.completedRewardIds)
      ? levelProgressState.completedRewardIds.filter(Boolean)
      : [];
    completed = new Set(prior);
    levelProgressState.completedRewardIds = completed;
  }
  const statAssignments = ensureStatAssignmentMap();
  const pendingTasks = [];
  let stateMutated = false;
  if (elLevelRewardReminderList) {
    elLevelRewardReminderList.innerHTML = '';
  }
  tasks.forEach(task => {
    if (!task) return;
    let isCompleted = completed.has(task.id);
    if (task.type === 'stat' && !isCompleted) {
      const assigned = statAssignments.get(task.id);
      if (assigned) {
        completed.add(task.id);
        isCompleted = true;
        stateMutated = true;
      }
    }
    if (task.autoComplete === true && !isCompleted) {
      completed.add(task.id);
      isCompleted = true;
      stateMutated = true;
    }
    const needsAction = !isCompleted && task.autoComplete !== true;
    if (task.type === 'stat' && !isCompleted) {
      pendingTasks.push(task);
    } else if (needsAction) {
      pendingTasks.push(task);
    }
    if (!elLevelRewardReminderList) return;

    const li = document.createElement('li');
    li.className = 'level-reward-list__item';
    if (typeof task.type === 'string' && task.type) {
      li.dataset.rewardType = task.type;
    }

    if (task.autoComplete === true) {
      const label = document.createElement('label');
      label.className = 'inline level-reward-list__action level-reward-list__action--automatic';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.disabled = true;
      checkbox.setAttribute('aria-hidden', 'true');
      label.appendChild(checkbox);
      const text = document.createElement('span');
      text.textContent = task.label;
      label.appendChild(text);
      li.appendChild(label);
      appendLevelRewardDetails(li, task.details);
      elLevelRewardReminderList.appendChild(li);
      return;
    }

    if (task.type === 'stat') {
      const assignedAbility = statAssignments.get(task.id) || '';
      if (isCompleted) {
        const label = document.createElement('label');
        label.className = 'inline level-reward-list__action level-reward-list__action--complete';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.disabled = true;
        checkbox.setAttribute('aria-hidden', 'true');
        label.appendChild(checkbox);
        const abilityName = ABILITY_FULL_NAMES?.[assignedAbility] || assignedAbility.toUpperCase() || 'Ability Score';
        const text = document.createElement('span');
        text.textContent = `${task.label} — ${abilityName}`;
        label.appendChild(text);
        li.appendChild(label);
        appendLevelRewardDetails(li, task.details);
        elLevelRewardReminderList.appendChild(li);
        return;
      }

      const title = document.createElement('p');
      title.className = 'level-reward-list__title';
      title.textContent = task.label;
      li.appendChild(title);
      appendLevelRewardDetails(li, task.details);

      const control = document.createElement('div');
      control.className = 'level-reward-list__control';
      const select = document.createElement('select');
      select.className = 'level-reward-list__stat-select';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose ability';
      select.appendChild(placeholder);
      ABILS.forEach(abilityKey => {
        const option = document.createElement('option');
        option.value = abilityKey;
        option.textContent = ABILITY_FULL_NAMES?.[abilityKey] || abilityKey.toUpperCase();
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        const ability = typeof select.value === 'string' ? select.value : '';
        if (!ability) return;
        select.disabled = true;
        const result = applyStatIncreaseToAbility(ability);
        if (!result.success) {
          select.disabled = false;
          select.value = '';
          const abilityName = ABILITY_FULL_NAMES?.[ability] || ability.toUpperCase();
          if (result.reason === 'max') {
            toast(`${abilityName} is already at the maximum score.`, 'error');
          } else {
            toast('Unable to apply the stat increase. Try again.', 'error');
          }
          return;
        }
        const abilityName = ABILITY_FULL_NAMES?.[ability] || ability.toUpperCase();
        ensureStatAssignmentMap().set(task.id, ability);
        completed.add(task.id);
        levelProgressState.completedRewardIds = completed;
        persistLevelProgressState();
        toast(`+1 ${abilityName} applied`, { type: 'success', meta: { source: 'level-reward' } });
        window.dmNotify?.(`Level reward applied: +1 ${abilityName}`, { actionScope: 'major' });
        logAction(`Level reward applied: +1 ${abilityName}`);
        renderLevelRewardReminders();
      });
      control.appendChild(select);
      li.appendChild(control);
      elLevelRewardReminderList.appendChild(li);
      return;
    }

    const label = document.createElement('label');
    label.className = 'inline level-reward-list__action';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isCompleted;
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
    appendLevelRewardDetails(li, task.details);
    elLevelRewardReminderList.appendChild(li);
  });

  if (stateMutated) {
    persistLevelProgressState({ silent: true });
  }

  const hasTasks = tasks.length > 0;
  if (elLevelRewardReminderList) {
    toggleEmptyState(elLevelRewardReminderList, hasTasks);
  }

  updateLevelRewardReminderUI(pendingTasks);

  updateLevelChoiceHighlights(pendingTasks);
}

registerContentRefreshTask(() => {
  try {
    renderLevelRewardReminders();
  } catch (err) {
    console.warn('Failed to refresh level reward reminders', err);
  }
  try {
    syncPlayerToolsTabBadge();
  } catch (err) {
    /* ignore badge sync failures */
  }
});

function acknowledgePendingLevelRewards() {
  const tasks = getLevelRewardTasksUpTo(levelProgressState?.highestAppliedLevel || 1);
  if (!(levelProgressState.completedRewardIds instanceof Set)) {
    levelProgressState.completedRewardIds = new Set(
      Array.isArray(levelProgressState.completedRewardIds) ? levelProgressState.completedRewardIds : []
    );
  }
  let updated = false;
  tasks.forEach(task => {
    if (!levelProgressState.completedRewardIds.has(task.id)) {
      levelProgressState.completedRewardIds.add(task.id);
      updated = true;
    }
  });
  if (updated) {
    persistLevelProgressState();
  }
  renderLevelRewardReminders();
  hide('modal-level-rewards');
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
  window.dmNotify?.(`Selected Augment: ${augment.name}`, { actionScope: 'major' });
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
    window.dmNotify?.(`Removed Augment: ${augment.name}`, { actionScope: 'major' });
    logAction(`Augment removed: ${augment.name}`);
  }
}

function handleAugmentFilterToggle(tag) {
  const normalized = normalizeAugmentTag(tag);
  if (!normalized) return;
  if (!(augmentState.filters instanceof Set)) augmentState.filters = new Set(AUGMENT_CATEGORIES);
  const currentFilters = augmentState.filters;
  const totalCategories = AUGMENT_CATEGORIES.length;
  const allActive = currentFilters.size >= totalCategories
    && AUGMENT_CATEGORIES.every(category => currentFilters.has(category));

  if (allActive) {
    augmentState.filters = new Set([normalized]);
  } else if (currentFilters.has(normalized)) {
    if (currentFilters.size === 1) {
      augmentState.filters = new Set(AUGMENT_CATEGORIES);
    } else {
      currentFilters.delete(normalized);
    }
  } else {
    currentFilters.add(normalized);
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
  if (elHPProgressValue) {
    elHPProgressValue.textContent = hpDisplay;
  } else if (elHPPill) {
    elHPPill.textContent = hpDisplay;
  }
  if (elHPBar) {
    elHPBar.setAttribute('aria-valuetext', hpDisplay);
    elHPBar.setAttribute('aria-valuenow', `${currentValue}`);
    elHPBar.setAttribute('aria-valuemax', `${maxValue}`);
  }
  const gaugeState = applyProgressGradient(
    elHPBar,
    elHPPill,
    currentValue,
    maxValue,
    deathGaugeOverride || undefined,
  );
  const nextRatio = gaugeState?.ratio ?? (maxValue > 0 ? currentValue / maxValue : 0);
  hpGaugeMetrics.current = currentValue;
  hpGaugeMetrics.max = maxValue;
  hpGaugeMetrics.ratio = nextRatio;
  updateTempBadge(elHPTempPill, tempValue);
}

function updateSPDisplay({ current, max } = {}){
  const currentValue = Number.isFinite(current) ? current : num(elSPBar.value);
  const maxValue = Number.isFinite(max) ? max : num(elSPBar.max);
  const tempValue = elSPTemp ? num(elSPTemp.value) : 0;
  const ratio = Number.isFinite(maxValue) && maxValue > 0
    ? Math.min(Math.max(currentValue / maxValue, 0), 1)
    : 0;
  let status = 'depleted';
  if (Number.isFinite(maxValue) && maxValue > 0) {
    if (ratio >= 0.8) {
      status = 'full';
    } else if (ratio >= 0.5) {
      status = 'steady';
    } else if (ratio >= 0.25) {
      status = 'low';
    } else if (currentValue > 0) {
      status = 'critical';
    }
  }
  if (elSPCurrent) elSPCurrent.textContent = currentValue;
  if (elSPMax) elSPMax.textContent = maxValue;
  const spDisplay = `${currentValue}/${maxValue}` + (tempValue ? ` (+${tempValue})` : ``);
  if (elSPProgressValue) {
    elSPProgressValue.textContent = spDisplay;
  } else if (elSPPill) {
    elSPPill.textContent = spDisplay;
  }
  if (elSPBar) {
    elSPBar.setAttribute('aria-valuetext', spDisplay);
    elSPBar.setAttribute('aria-valuenow', `${currentValue}`);
    elSPBar.setAttribute('aria-valuemax', `${maxValue}`);
  }
  const gaugeState = applyProgressGradient(
    elSPBar,
    elSPPill,
    currentValue,
    maxValue,
    {
      statusOverride: status,
      statusLabels: {
        full: 'Full',
        steady: 'Steady',
        low: 'Low',
        critical: 'Critical',
        depleted: 'Depleted',
      },
      statusColors: {
        full: 'var(--success,#22c55e)',
        steady: 'var(--accent,#6366f1)',
        low: 'var(--warning,#f59e0b)',
        critical: 'var(--error,#f87171)',
        depleted: 'var(--error,#f87171)',
      },
    },
  );
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
  setDeathSavesVisible(num(elHPBar.value) === 0);
  syncDeathSaveGauge();
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
  const numericLevel = Number.isFinite(Number(levelEntry?.level))
    ? Number(levelEntry.level)
    : null;
  const levelNumber = Number.isFinite(numericLevel) ? String(numericLevel) : '';
  const subTierRaw = levelEntry?.subTier;
  const subTier = subTierRaw ? String(subTierRaw) : '';
  const compactSubTier = subTier ? subTier.replace(/\s+/g, ' ').trim() : '';
  const tierLabel = levelEntry?.tierLabel ? String(levelEntry.tierLabel) : '';
  const numericTier = Number.isFinite(Number(levelEntry?.tierNumber))
    ? Number(levelEntry.tierNumber)
    : null;
  const tierNumber = Number.isFinite(numericTier) ? String(numericTier) : '';
  const tierBase = tierNumber ? `Tier ${tierNumber}` : '';
  const tierJoiner = compactSubTier && /^[A-Za-z]$/.test(compactSubTier) ? '' : ' ';
  const tierShort = tierBase
    ? `${tierBase}${compactSubTier ? `${tierJoiner}${compactSubTier}` : ''}`.trim()
    : compactSubTier;
  const levelSummaryParts = [];
  if (levelNumber) levelSummaryParts.push(`Level ${levelNumber}`);
  if (tierShort) levelSummaryParts.push(tierShort);
  const levelSummary = levelSummaryParts.join(' – ');
  const gainsText = levelEntry?.gains ? String(levelEntry.gains).trim() : '';
  if (elTier) elTier.value = tierLabel;
  if (elLevelValue) elLevelValue.value = levelNumber;
  if (elLevelDisplay) elLevelDisplay.value = levelNumber || '—';
  if (elLevelSummaryValue) elLevelSummaryValue.value = levelSummary;
  if (elLevelSummaryText) elLevelSummaryText.textContent = levelSummary || '—';
  if (elTierShortValue) elTierShortValue.value = tierShort || '';
  if (elTierShortDisplay) elTierShortDisplay.value = tierShort || '—';
  if (elTierNumberValue) elTierNumberValue.value = tierNumber || '';
  if (elSubTierValue) elSubTierValue.value = subTier;
  if (elSubTierDisplay) elSubTierDisplay.value = subTier || '—';
  if (elTierGains) {
    elTierGains.textContent = gainsText;
    elTierGains.hidden = !gainsText;
  }
}

function updateXP(){
  if (!elXP || typeof elXP.value === 'undefined') {
    return;
  }
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
    const celebrationType = getLevelCelebrationType(prevIdx, idx);
    if (celebrationType === 'tier') {
      launchTierConfetti();
    } else if (celebrationType === 'subTier') {
      // Dedicated sub-tier celebration for standard level gains.
      launchSubTierConfetti();
    } else {
      // Fallback to the smaller celebration if tier data is missing but a
      // level was still gained.
      launchSubTierConfetti();
    }
    launchFireworks();
    const baseMessage = `Level up! ${formatLevelLabel(levelEntry)}`;
    const toastMessage = levelEntry?.gains
      ? `${baseMessage}. Gains: ${levelEntry.gains}.`
      : `${baseMessage}.`;
    toast(toastMessage, 'success');
    window.dmNotify?.(`Level up to ${formatLevelLabel(levelEntry)}`, { actionScope: 'major' });
    if (levelProgressResult?.newLevelEntries?.length) {
      const rewardSummary = levelProgressResult.newLevelEntries
        .map(entry => formatLevelRewardSummary(entry))
        .filter(Boolean)
        .join('; ');
      if (rewardSummary) {
        window.dmNotify?.(`Level bonuses applied: ${rewardSummary}`, { actionScope: 'major' });
        logAction(`Level bonuses applied: ${rewardSummary}`);
      }
    }
  } else if (xpInitialized && idx < prevIdx) {
    window.dmNotify?.(`Level down to ${formatLevelLabel(levelEntry)}`, { actionScope: 'major' });
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
    if (elXPBar) {
      elXPBar.max = xpForNextLevel;
      elXPBar.value = Math.min(xpForNextLevel, xpIntoLevel);
    }
    if (elXPPill) {
      elXPPill.textContent = `${xpNumberFormatter.format(xpIntoLevel)} / ${xpNumberFormatter.format(xpForNextLevel)}`;
    }
  } else {
    if (elXPBar) {
      elXPBar.max = 1;
      elXPBar.value = 1;
    }
    if (elXPPill) {
      elXPPill.textContent = `${xpNumberFormatter.format(xp)}+`;
    }
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
    window.dmNotify?.(`${a.toUpperCase()} set to ${el.value}`, { actionScope: 'major' });
    updateDerived();
  });
});
['hp-temp','sp-temp','power-save-ability','xp'].forEach(id=> $(id).addEventListener('input', updateDerived));
ABILS.forEach(a=> $('save-'+a+'-prof').addEventListener('change', updateDerived));
SKILLS.forEach((s,i)=> $('skill-'+i+'-prof').addEventListener('change', updateDerived));

function setXP(v){
  if (!elXP || typeof elXP.value === 'undefined') {
    return;
  }
  const prev = num(elXP.value);
  elXP.value = Math.max(0, v);
  updateDerived();
  const diff = num(elXP.value) - prev;
  if(diff !== 0){
    window.dmNotify?.(`XP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elXP.value})`, { actionScope: 'major' });
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
  const storage = getLocalStorageSafe();
  if (!storage) return [];
  try {
    const stored = storage.getItem(CREDITS_LEDGER_STORAGE_KEY);
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
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(CREDITS_LEDGER_STORAGE_KEY, JSON.stringify(creditsLedgerEntries));
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
    window.dmNotify?.(`Credits ${diff>0?'gained':'spent'} ${Math.abs(diff)} (now ${total})`, { actionScope: 'major' });
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
      saveCharacter(createAppSnapshot(), name).catch(e => {
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


/* ========= Discord Relay helpers ========= */
const DISCORD_UPDATE_DEBOUNCE_MS = 750;
const pendingDiscordUpdates = new Map();

function getDiscordCharacterPayload() {
  const vigilanteName = $('superhero')?.value?.trim() || '';
  const playerName = $('secret')?.value?.trim() || '';
  const fallbackName = vigilanteName || currentCharacter() || playerName;
  if (!fallbackName) return null;
  const payload = { character: {} };
  let characterId = '';
  try {
    characterId = ensureCharacterId(payload, fallbackName);
  } catch {}
  const resolvedId = payload.character?.characterId || characterId || fallbackName;
  const uid = getActiveUserId();
  return {
    id: resolvedId,
    vigilanteName: vigilanteName || fallbackName,
    playerName: playerName || '',
    uid,
  };
}

function queueDiscordCharacterUpdate(type, before, after, reason) {
  const character = getDiscordCharacterPayload();
  if (!character) return;
  const existing = pendingDiscordUpdates.get(type);
  const update = existing || { before, after, reason, timeout: null };
  if (!existing) {
    update.before = before;
  }
  update.after = after;
  update.reason = reason || update.reason;
  if (update.timeout) {
    clearTimeout(update.timeout);
  }
  update.timeout = setTimeout(() => {
    pendingDiscordUpdates.delete(type);
    void sendEventToDiscordWorker({
      type: 'character.update',
      actor: { vigilanteName: character.vigilanteName, uid: character.uid },
      detail: {
        updateType: type,
        before: update.before,
        after: update.after,
        reason: update.reason,
        characterId: character.id,
        playerName: character.playerName,
      },
      ts: Date.now(),
    });
  }, DISCORD_UPDATE_DEBOUNCE_MS);
  pendingDiscordUpdates.set(type, update);
}

function sendImmediateCharacterUpdate(type, before, after, reason) {
  const character = getDiscordCharacterPayload();
  if (!character) return;
  void sendEventToDiscordWorker({
    type: 'character.update',
    actor: { vigilanteName: character.vigilanteName, uid: character.uid },
    detail: {
      updateType: type,
      before,
      after,
      reason,
      characterId: character.id,
      playerName: character.playerName,
    },
    ts: Date.now(),
  });
}

function isActiveCharacterName(name) {
  if (!name) return false;
  const vigilanteName = $('superhero')?.value?.trim() || '';
  const currentName = currentCharacter() || '';
  return name === vigilanteName || name === currentName;
}

if (typeof document !== 'undefined') {
  document.addEventListener('cc:active-character-changed', (event) => {
    const detail = event?.detail || {};
    if (!detail.currentName) return;
    sendImmediateCharacterUpdate(
      'activeCharacter',
      { name: detail.previousName || '' },
      { name: detail.currentName || '' },
      'Active character changed',
    );
  });
}


/* ========= HP/SP controls ========= */
function setHP(v){
  if (deathState === 'dead') return false;
  const prev = num(elHPBar.value);
  const beforeSnapshot = {
    current: prev,
    max: num(elHPBar.max),
    temp: elHPTemp ? num(elHPTemp.value) : 0,
  };
  const next = Math.max(0, Math.min(num(elHPBar.max), v));
  const wasAboveZero = prev > 0;
  elHPBar.value = next;
  const current = num(elHPBar.value);
  updateHPDisplay({ current, max: num(elHPBar.max) });
  const diff = current - prev;
  if(diff !== 0){
    if(diff < 0){
      playActionCue('hp-damage');
      if (typeof playDamageAnimation === 'function') {
        void playDamageAnimation(diff);
      }
    }else{
      playActionCue('hp-heal');
      if (typeof playHealAnimation === 'function') {
        void playHealAnimation(diff);
      }
    }
    window.dmNotify?.(`HP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elHPBar.value}/${elHPBar.max})`, { actionScope: 'minor' });
    logAction(`HP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elHPBar.value}/${elHPBar.max})`);
    queueDiscordCharacterUpdate(
      'hp',
      beforeSnapshot,
      {
        current,
        max: num(elHPBar.max),
        temp: elHPTemp ? num(elHPTemp.value) : 0,
      },
      diff > 0 ? 'HP gained' : 'HP lost',
    );
  }
  const down = wasAboveZero && current === 0;
  if(down){
    playActionCue('hp-down');
    if (typeof playDownAnimation === 'function') {
      void playDownAnimation();
    }
  }
  updateDeathSaveAvailability();
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
  const beforeSnapshot = {
    current: prev,
    max: num(elSPBar.max),
    temp: elSPTemp ? num(elSPTemp.value) : 0,
  };
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
    window.dmNotify?.(`SP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elSPBar.value}/${elSPBar.max})`, { actionScope: 'minor' });
    logAction(`SP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elSPBar.value}/${elSPBar.max})`);
    await playSPAnimation(diff);
    pushHistory();
    queueDiscordCharacterUpdate(
      'sp',
      beforeSnapshot,
      {
        current,
        max: num(elSPBar.max),
        temp: elSPTemp ? num(elSPTemp.value) : 0,
      },
      diff > 0 ? 'SP gained' : 'SP lost',
    );
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
  if(down){
    toast('Player is down', 'warning');
    logAction('Player is down.');
  }
});
$('hp-heal').addEventListener('click', async ()=>{
  const d=num(elHPAmt ? elHPAmt.value : 0)||0;
  setHP(num(elHPBar.value)+d);
});
$('hp-full').addEventListener('click', async ()=>{
  const diff = num(elHPBar.max) - num(elHPBar.value);
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
    ...qsa('#pt-death-saves input[type="checkbox"]'),
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
  toggleEmptyState(elHPRollList, hpRolls.length > 0);
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

function pushLog(arr, entry, key){
  arr.push(entry);
  if (arr.length>30) arr.splice(0, arr.length-30);
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(arr));
  } catch (err) {
    console.error('Failed to persist action log entry', err);
  }
}
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
    const scopeCandidate = meta.actionScope ?? meta.scope ?? meta.kind ?? meta.actionType;
    if (typeof scopeCandidate === 'string' && scopeCandidate) {
      record.actionScope = scopeCandidate;
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
  let snapshot = null;
  try {
    snapshot = createAppSnapshot();
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
  const normalizedMessage = baseMessage.replace(/\s+/g, ' ').trim();
  const message = /background|apply|update/i.test(normalizedMessage)
    ? normalizedMessage
    : `${normalizedMessage} Applying updates in the background.`;
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
  const refreshOutcomePromise = runContentRefreshHandlers(detail);
  detail.refreshPromise = refreshOutcomePromise;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(CONTENT_UPDATE_EVENT, { detail }));
    } catch {
      /* ignore event errors */
    }
  }
  if (refreshOutcomePromise && typeof refreshOutcomePromise.then === 'function') {
    refreshOutcomePromise
      .then(({ executed, failed }) => {
        if (!executed) return;
        try {
          if (failed) {
            toast('Some Codex updates could not be applied automatically. Please refresh manually.', 'error');
          } else {
            toast('Codex content updated in the background.', 'success');
          }
        } catch (err) {
          /* ignore toast failures */
        }
      })
      .catch(err => {
        console.error('Content refresh processing failed', err);
      });
  }
}


function getNextDiceResultPlayIndex() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function renderDiceResultValue(target, value, { renderer = null, playIndex = null, renderOptions = null } = {}) {
  if (!target) return;
  const normalized = value == null ? '' : value;
  const fallbackText = typeof normalized === 'string' ? normalized : String(normalized);
  const resolvedRenderer = renderer || ensureDiceResultRenderer(target);
  if (resolvedRenderer && typeof resolvedRenderer.render === 'function') {
    const resolvedPlayIndex = Number.isFinite(playIndex) ? playIndex : getNextDiceResultPlayIndex();
    resolvedRenderer.render(normalized, resolvedPlayIndex, renderOptions ?? undefined);
    return;
  }
  target.textContent = fallbackText;
}

function createDiceResultListItem(text, { ariaLabel = '', renderOptions = null } = {}) {
  const item = document.createElement('li');
  if (ariaLabel) {
    item.setAttribute('aria-label', ariaLabel);
  }
  const shell = document.createElement('span');
  shell.className = 'dice-result__shell';
  const valueEl = document.createElement('span');
  valueEl.className = 'dice-result__value';
  shell.appendChild(valueEl);
  item.appendChild(shell);
  renderDiceResultValue(valueEl, text, { renderOptions });
  return item;
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
  const options = opts && typeof opts === 'object' ? opts : {};
  const { resultRenderer, resolvedModifier, resolvedBreakdown, ...rollOptions } = options;
  const sides = getRollSides(rollOptions);
  const resolution = Number.isFinite(resolvedModifier)
    ? { modifier: resolvedModifier, breakdown: resolvedBreakdown }
    : resolveRollBonus(bonus, rollOptions);
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

  const diceSetsRaw = Array.isArray(rollOptions.dice) ? rollOptions.dice : [];
  const diceSets = diceSetsRaw
    .map(normalizeDiceSet)
    .filter(Boolean);

  const requestedCountRaw = Number(rollOptions.diceCount);
  const diceCount = Number.isFinite(requestedCountRaw) && requestedCountRaw > 1
    ? Math.floor(requestedCountRaw)
    : 1;

  const breakdownParts = [];
  const rollDetails = [];
  let rollTotal = 0;
  let rollMode = resolution?.mode || (typeof rollOptions.mode === 'string' ? rollOptions.mode.toLowerCase() : 'normal');
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
    const renderer = resultRenderer || ensureDiceResultRenderer(out);
    renderDiceResultValue(out, total, { renderer });
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

  if (typeof rollOptions.onRoll === 'function') {
    try {
      const baseBonusValue = resolution && Number.isFinite(resolution.baseBonus)
        ? resolution.baseBonus
        : fallbackBonus;
      rollOptions.onRoll({
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
        options: { ...rollOptions, mode: rollMode },
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
    const playIndex = getNextDiceResultPlayIndex();
    renderDiceResultValue(out, total, { renderer: diceResultRenderer, playIndex });
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
          const isContested = normalizedMode !== 'normal' && Number.isFinite(detail.secondary);
          const display = isContested
            ? `${detail.primary}/${detail.secondary}→${detail.chosen}`
            : String(detail.chosen);
          const ariaLabel = isContested
            ? `Roll ${index + 1}: ${detail.primary} vs ${detail.secondary}, kept ${detail.chosen}`
            : `Roll ${index + 1}: ${detail.chosen}`;
          const item = createDiceResultListItem(display, { ariaLabel });
          fragment.appendChild(item);
        });
        if (hasModifier) {
          const sign = modifier >= 0 ? '+' : '-';
          const display = `${sign}${Math.abs(modifier)} mod`;
          const ariaLabel = `Modifier ${sign}${Math.abs(modifier)}`;
          const modItem = createDiceResultListItem(display, { ariaLabel });
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
    const formulaModifier = hasModifier ? `${modifier >= 0 ? '+' : ''}${modifier}` : '';
    const breakdownDetail = [
      breakdownDisplay.join(', '),
      hasModifier ? `${modifier >= 0 ? '+' : '-'}${Math.abs(modifier)} mod` : '',
    ].filter(Boolean).join(', ');
    const character = getDiscordCharacterPayload();
    if (character) {
      void sendEventToDiscordWorker({
        type: 'dice.roll',
        actor: { vigilanteName: character.vigilanteName, uid: character.uid },
        detail: {
          formula: `${count}d${sides}${formulaModifier}`.trim(),
          total,
          breakdown: breakdownDetail,
          advantageState: normalizedMode,
          characterId: character.id,
          playerName: character.playerName,
        },
        ts: Date.now(),
      });
    }
    window.dmNotify?.(`Rolled ${message}`, { actionScope: 'minor' });
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
    const character = getDiscordCharacterPayload();
    if (character) {
      void sendEventToDiscordWorker({
        type: 'coin.flip',
        actor: { vigilanteName: character.vigilanteName, uid: character.uid },
        detail: {
          result: v,
          characterId: character.id,
          playerName: character.playerName,
        },
        ts: Date.now(),
      });
    }
    window.dmNotify?.(`Coin flip: ${v}`, { actionScope: 'minor' });
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

function triggerDamageOverlay(amount = 1, { max = 20, lingerMs = 900 } = {}) {
  if (!animationsEnabled) return;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 20;
  const magnitude = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const intensity = Math.max(0, Math.min(1, magnitude / safeMax));

  const crackRot = `${(Math.random() * 8 - 4).toFixed(2)}deg`;
  const crackX = `${(Math.random() * 10 - 5).toFixed(1)}px`;
  const crackY = `${(Math.random() * 10 - 5).toFixed(1)}px`;

  const overlay = $('damage-overlay');
  if (!overlay) return;

  // 0..4 tiers at 0%, 25%, 50%, 75%, 100%
  const tier = Math.min(4, Math.floor(intensity / 0.25));
  const prevTier = overlay.__ccDamageTier || 0;

  overlay.style.setProperty('--crackRot', crackRot);
  overlay.style.setProperty('--crackX', crackX);
  overlay.style.setProperty('--crackY', crackY);
  overlay.style.setProperty('--damage', `${intensity}`);

  // optional: scale shake strength by tier (px)
  overlay.style.setProperty('--shake', `${Math.max(1, tier) * 2}px`);

  const peakOpacity = Math.min(0.95, intensity * 0.95);

  if (overlay.__ccDamageTimer) {
    clearTimeout(overlay.__ccDamageTimer);
    overlay.__ccDamageTimer = null;
  }
  overlay.__fadeOut?.cancel?.();
  overlay.__pop?.cancel?.();

  overlay.__pop = animate(
    overlay,
    [
      { opacity: peakOpacity * 0.4, filter: 'blur(2px)' },
      { opacity: peakOpacity, filter: 'blur(0px)' },
    ],
    {
      duration: motion('--motion-fast', 140),
      easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
      fill: 'forwards',
    }
  );

  if (!overlay.__pop) {
    overlay.style.opacity = `${peakOpacity}`;
    overlay.__ccDamageTimer = setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.setProperty('--damage', '0');
      overlay.__ccDamageTier = 0;
    }, lingerMs);
    return;
  }

  // Only shake when we CROSS UP into a higher tier
  if (tier > prevTier) {
    overlay.__ccDamageTier = tier;

    overlay.__shake?.cancel?.();
    overlay.__shake = animate(
      overlay,
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(calc(var(--shake, 2px) * -1), calc(var(--shake, 2px) * 0.5))` },
        { transform: `translate(var(--shake, 2px), calc(var(--shake, 2px) * -0.5))` },
        { transform: `translate(calc(var(--shake, 2px) * -0.5), 0px)` },
        { transform: 'translate(0, 0)' },
      ],
      {
        duration: motion('--motion-med', 240),
        easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
        fill: 'forwards',
      }
    );
  }

  overlay.__fadeOut = fadeOut(overlay, {
    duration: motion('--motion-slow', 520),
    easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
    delay: Math.max(120, lingerMs * 0.25),
    from: peakOpacity,
  });
  if (!overlay.__fadeOut) {
    overlay.__ccDamageTimer = setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.setProperty('--damage', '0');
      overlay.__ccDamageTier = 0;
    }, lingerMs);
    return;
  }
  overlay.__fadeOut?.finished?.then(() => {
    overlay.style.setProperty('--damage', '0');
    overlay.__ccDamageTier = 0; // reset tiers when overlay clears
  }).catch(()=>{});
}

function playDamageAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const maxHp = elHPBar ? num(elHPBar.max) : 20;
  const scale = Math.max(12, Math.round(maxHp * 0.25));
  triggerDamageOverlay(Math.abs(amount), { max: scale, lingerMs: 900 });
  playStatusCue('damage');

  const anim=$('damage-animation');
  const float = anim?.querySelector('.fx-float') || anim;
  cancelFx(anim);
  cancelFx(float);
  if(!anim) return Promise.resolve();
  float.textContent=String(amount);
  anim.setAttribute('aria-hidden','true');

  const opacityTrack = animate(
    anim,
    [
      { opacity: 0 },
      { opacity: 1 },
      { opacity: 0 },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520)),
      easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
      fill: 'forwards',
    }
  );

  const motionTrack = animate(
    float,
    [
      { offset: 0, transform: 'translateY(0) scale(0.9)', filter: 'blur(3px)' },
      { offset: 0.25, transform: 'translateY(-4px) scale(1.05)', filter: 'blur(0px)' },
      { offset: 0.6, transform: 'translateY(-12px) scale(0.98)', filter: 'blur(0px)' },
      { offset: 1, transform: 'translateY(-24px) scale(0.9)', filter: 'blur(0.5px)' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 1.2),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
      delay: motion('--motion-fast', 140) * 0.35,
    }
  );

  const glow = animate(
    float,
    [
      { textShadow: '0 0 1rem currentColor' },
      { textShadow: '0 0 0.2rem currentColor' },
      { textShadow: '0 0 0rem currentColor' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520)),
      easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
      fill: 'forwards',
    }
  );

  return Promise.all([opacityTrack?.finished, motionTrack?.finished, glow?.finished].filter(Boolean))
    .catch(()=>{})
    .finally(() => {
      if (anim && anim.style) {
        anim.style.opacity = '';
        anim.style.transform = '';
        anim.style.filter = '';
      }
      if (float && float.style) {
        float.style.opacity = '';
        float.style.transform = '';
        float.style.filter = '';
        float.style.textShadow = '';
      }
    });
}

const AUDIO_CUE_SETTINGS = {
  down: {
    frequency: 155,
    type: 'triangle',
    duration: 0.65,
    volume: 0.34,
    attack: 0.01,
    release: 0.4,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.45 },
      { ratio: 1.5, amplitude: 0.35 },
    ],
  },
  death: {
    frequency: 90,
    type: 'square',
    duration: 1.2,
    volume: 0.32,
    attack: 0.02,
    release: 0.55,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.6 },
      { ratio: 2, amplitude: 0.4 },
    ],
  },
  'dice-roll': {
    frequency: 600,
    type: 'sawtooth',
    duration: 0.28,
    volume: 0.3,
    attack: 0.005,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 0.9 },
      { ratio: 1.67, amplitude: 0.6 },
      { ratio: 2.5, amplitude: 0.35 },
      { ratio: 3.4, amplitude: 0.25 },
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
    frequency: 980,
    type: 'triangle',
    duration: 0.3,
    volume: 0.23,
    attack: 0.003,
    release: 0.16,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.4, amplitude: 0.45 },
      { ratio: 3.6, amplitude: 0.22 },
    ],
  },
  'credits-gain': {
    frequency: 820,
    type: 'sine',
    duration: 0.35,
    volume: 0.26,
    attack: 0.004,
    release: 0.22,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.55 },
      { ratio: 2.5, amplitude: 0.32 },
    ],
  },
  'credits-save': {
    frequency: 560,
    type: 'triangle',
    duration: 0.4,
    volume: 0.24,
    attack: 0.012,
    release: 0.24,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.45 },
      { ratio: 2, amplitude: 0.2 },
    ],
  },
  'credits-spend': {
    frequency: 290,
    type: 'sawtooth',
    duration: 0.32,
    volume: 0.26,
    attack: 0.008,
    release: 0.2,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.55 },
      { ratio: 1.8, amplitude: 0.25 },
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
    frequency: 660,
    type: 'triangle',
    duration: 0.26,
    volume: 0.22,
    attack: 0.006,
    release: 0.16,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2.2, amplitude: 0.42 },
      { ratio: 3.4, amplitude: 0.2 },
    ],
  },
  'sp-spend': {
    frequency: 380,
    type: 'sine',
    duration: 0.28,
    volume: 0.2,
    attack: 0.008,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.75, amplitude: 0.4 },
      { ratio: 1.5, amplitude: 0.2 },
    ],
  },
  'sp-empty': {
    frequency: 260,
    type: 'square',
    duration: 0.38,
    volume: 0.27,
    attack: 0.01,
    release: 0.22,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.45 },
      { ratio: 1.25, amplitude: 0.25 },
    ],
  },
  heal: {
    frequency: 620,
    type: 'triangle',
    duration: 0.5,
    volume: 0.28,
    attack: 0.015,
    release: 0.3,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.45 },
      { ratio: 2.8, amplitude: 0.2 },
    ],
  },
  damage: {
    frequency: 260,
    type: 'sawtooth',
    duration: 0.32,
    volume: 0.34,
    attack: 0.006,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.5 },
      { ratio: 1.5, amplitude: 0.28 },
    ],
  },
  save: {
    frequency: 700,
    type: 'sine',
    duration: 0.55,
    volume: 0.26,
    attack: 0.01,
    release: 0.28,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.33, amplitude: 0.6 },
      { ratio: 2.67, amplitude: 0.25 },
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
  const cueRegistry = typeof globalThis !== 'undefined' ? globalThis.audioCueData : undefined;
  if (typeof cueRegistry?.has === 'function' && cueRegistry.has(normalized)) {
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
  const image = anim?.querySelector('img');
  cancelFx(anim);
  cancelFx(image);
  if(!anim || !image) return Promise.resolve();
  playStatusCue('down');
  anim.setAttribute('aria-hidden','true');
  image.setAttribute('aria-hidden','true');

  const veil = animate(
    anim,
    [
      { opacity: 0, filter: 'blur(6px)', transform: 'translateZ(0)' },
      { opacity: 0.92, filter: 'blur(1px)', transform: 'translateZ(0)' },
      { opacity: 0, filter: 'blur(3px)', transform: 'translateZ(0)' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 1.73),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
    }
  );

  const pulse = animate(
    image,
    [
      { opacity: 0, transform: 'scale(0.85) rotate(-16deg)', filter: 'drop-shadow(0 0 1.5rem rgba(120,0,0,.65))' },
      { opacity: 1, transform: 'scale(1.05) rotate(-4deg)', filter: 'drop-shadow(0 0 1.25rem rgba(120,0,0,.7))' },
      { opacity: 0.4, transform: 'scale(0.92) rotate(-8deg)', filter: 'drop-shadow(0 0 0.75rem rgba(120,0,0,.4))' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 1.88),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
    }
  );

  return Promise.all([veil?.finished, pulse?.finished].filter(Boolean))
    .catch(()=>{})
    .finally(() => {
      if (anim?.style) {
        anim.style.opacity = '';
        anim.style.transform = '';
        anim.style.filter = '';
      }
      if (image?.style) {
        image.style.opacity = '';
        image.style.transform = '';
        image.style.filter = '';
      }
    });
}

function playDeathAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('death-animation');
  const image = anim?.querySelector('img');
  cancelFx(anim);
  cancelFx(image);
  if(!anim || !image) return Promise.resolve();
  playStatusCue('death');
  anim.setAttribute('aria-hidden','true');
  image.setAttribute('aria-hidden','true');

  const veil = animate(
    anim,
    [
      { opacity: 0, filter: 'blur(8px)', transform: 'translateZ(0) scale(0.96)' },
      { opacity: 0.95, filter: 'blur(1px)', transform: 'translateZ(0) scale(1)' },
      { opacity: 0, filter: 'blur(3px)', transform: 'translateZ(0) scale(1.04)' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 2.5),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
    }
  );

  const pulse = animate(
    image,
    [
      { opacity: 0, transform: 'scale(0.82) rotate(-18deg)', filter: 'drop-shadow(0 0 1.5rem rgba(136,0,0,0.65))' },
      { opacity: 1, transform: 'scale(1.08) rotate(2deg)', filter: 'drop-shadow(0 0 1.3rem rgba(136,0,0,0.6))' },
      { opacity: 0.5, transform: 'scale(0.95) rotate(-6deg)', filter: 'drop-shadow(0 0 0.9rem rgba(136,0,0,0.4))' },
      { opacity: 0, transform: 'scale(0.9) rotate(-10deg)', filter: 'drop-shadow(0 0 0.4rem rgba(136,0,0,0.35))' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 2.7),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
    }
  );

  return Promise.all([veil?.finished, pulse?.finished].filter(Boolean))
    .catch(()=>{})
    .finally(() => {
      if (anim?.style) {
        anim.style.opacity = '';
        anim.style.transform = '';
        anim.style.filter = '';
      }
      if (image?.style) {
        image.style.opacity = '';
        image.style.transform = '';
        image.style.filter = '';
      }
    });
}

function playHealAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('heal-animation');
  const float = anim?.querySelector('.fx-float') || anim;
  const healOverlay = $('heal-overlay');
  const bloom = healOverlay?.querySelector('svg');
  cancelFx(healOverlay);
  cancelFx(anim);
  cancelFx(bloom);
  cancelFx(float);
  if(anim) {
    float.textContent=`+${amount}`;
    anim.setAttribute('aria-hidden','true');
  }
  playStatusCue('heal');

  const bloomWave = healOverlay ? animate(
    healOverlay,
    [
      { opacity: 0, transform: 'scale(0.96)', filter: 'blur(8px)' },
      { opacity: 0.85, transform: 'scale(1.03)', filter: 'blur(1px)' },
      { opacity: 0, transform: 'scale(1.06)', filter: 'blur(6px)' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 1.58),
      easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
      fill: 'forwards',
    }
  ) : null;

  const shimmer = bloom ? animate(
    bloom,
    [
      { opacity: 0.2, transform: 'scale(0.92) rotate(-4deg)' },
      { opacity: 0.8, transform: 'scale(1.05) rotate(2deg)' },
      { opacity: 0.6, transform: 'scale(1) rotate(0deg)' },
    ],
    {
      duration: Math.max(1, motion('--motion-med', 240) * 1.75),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
    }
  ) : null;

  const opacityTrack = anim ? animate(
    anim,
    [
      { opacity: 0 },
      { opacity: 1 },
      { opacity: 0 },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 1.38),
      easing: easingVar('--ease-out', 'cubic-bezier(.16,1,.3,1)'),
      fill: 'forwards',
    }
  ) : null;

  const motionTrack = anim ? animate(
    float,
    [
      { offset: 0, transform: 'translateY(2px) scale(0.94)', filter: 'blur(1.5px)' },
      { offset: 0.22, transform: 'translateY(-4px) scale(1.08)', filter: 'blur(0px)' },
      { offset: 0.6, transform: 'translateY(-12px) scale(1)', filter: 'blur(0px)' },
      { offset: 1, transform: 'translateY(-22px) scale(0.96)', filter: 'blur(0.4px)' },
    ],
    {
      duration: Math.max(1, motion('--motion-slow', 520) * 1.38),
      easing: easingVar('--ease-in-out', 'cubic-bezier(.4,0,.2,1)'),
      fill: 'forwards',
      delay: motion('--motion-fast', 140) * 0.25,
    }
  ) : null;

  return Promise.all([bloomWave?.finished, shimmer?.finished, opacityTrack?.finished, motionTrack?.finished].filter(Boolean))
    .catch(()=>{})
    .finally(() => {
      if (healOverlay?.style) {
        healOverlay.style.opacity = '';
        healOverlay.style.transform = '';
        healOverlay.style.filter = '';
      }
      if (bloom?.style) {
        bloom.style.opacity = '';
        bloom.style.transform = '';
        bloom.style.filter = '';
      }
      if (anim?.style) {
        anim.style.opacity = '';
        anim.style.transform = '';
        anim.style.filter = '';
      }
      if (float?.style) {
        float.style.opacity = '';
        float.style.transform = '';
        float.style.filter = '';
      }
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
  const resultLabel = anim.querySelector('.coin-result');
  const headsFace = anim.querySelector('.coin-face--heads');
  const tailsFace = anim.querySelector('.coin-face--tails');
  if(headsFace){
    headsFace.textContent='';
  }
  if(tailsFace){
    tailsFace.textContent='';
  }
  const headsLabel = anim.dataset.heads || 'Heads';
  const tailsLabel = anim.dataset.tails || 'Tails';
  if(resultLabel){
    const label = result === 'Heads'
      ? headsLabel
      : result === 'Tails'
        ? tailsLabel
        : result;
    resultLabel.textContent = label;
  }
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

const deathSuccesses = ['pt-death-success-1','pt-death-success-2','pt-death-success-3']
  .map(id => $(id))
  .filter(Boolean);
const deathFailures = ['pt-death-fail-1','pt-death-fail-2','pt-death-fail-3']
  .map(id => $(id))
  .filter(Boolean);
const deathCheckboxes = [...deathSuccesses, ...deathFailures];
const deathOut = $('pt-death-save-out');
const deathSaveResultRenderer = deathOut ? ensureDiceResultRenderer(deathOut) : null;
const deathRollMode = $('pt-death-save-mode');
const deathModifierInput = $('pt-death-save-mod');
let deathState = null; // null, 'stable', 'dead'
const deathOutAnimationClass = 'death-save-result--pulse';

function countChecked(boxes){
  if (!Array.isArray(boxes)) return 0;
  return boxes.reduce((count, box) => count + (box?.checked ? 1 : 0), 0);
}

function getDeathSaveCounts(){
  return {
    successes: countChecked(deathSuccesses),
    failures: countChecked(deathFailures),
  };
}

function setDeathSavesVisible(isVisible) {
  if (!elDeathSaves) return;
  const visible = !!isVisible;

  elDeathSaves.hidden = !visible;
  elDeathSaves.disabled = !visible;
  elDeathSaves.setAttribute('aria-hidden', visible ? 'false' : 'true');

  if (!visible) resetDeathSaves();
}

function overridesEqual(a, b){
  if (a === b) return true;
  if (!a || !b) return false;
  return a.statusOverride === b.statusOverride
    && a.statusLabelOverride === b.statusLabelOverride
    && a.statusColorOverride === b.statusColorOverride
    && a.colorOverride === b.colorOverride;
}

function applyDeathGaugeOverride(override){
  if (!elHPBar || !elHPPill) return;
  const normalized = override
    ? {
        statusOverride: override.statusOverride || override.status || '',
        statusLabelOverride: override.statusLabelOverride || override.statusLabel || '',
        statusColorOverride: override.statusColorOverride || override.statusColor || '',
        colorOverride: override.colorOverride || '',
      }
    : null;
  if (overridesEqual(deathGaugeOverride, normalized)) return;
  deathGaugeOverride = normalized;
  applyProgressGradient(
    elHPBar,
    elHPPill,
    hpGaugeMetrics.current,
    hpGaugeMetrics.max,
    normalized || undefined,
  );
}

function syncDeathSaveGauge({ lastRoll } = {}){
  if (!elHPTracker || !elHPBar || !Array.isArray(deathSuccesses) || !Array.isArray(deathFailures)) return;
  const trackerEl = elHPTracker;
  const { successes, failures } = getDeathSaveCounts();
  const total = successes + failures;
  const atZero = hpGaugeMetrics.current <= 0 && hpGaugeMetrics.max > 0;
  const style = trackerEl.style;
  if (style && typeof style.setProperty === 'function') {
    style.setProperty('--death-success-ratio', (successes / 3).toFixed(4));
    style.setProperty('--death-failure-ratio', (failures / 3).toFixed(4));
    style.setProperty('--death-check-ratio', (total / 3).toFixed(4));
  }
  let gaugeState = 'inactive';
  if (atZero) {
    if (deathState === 'dead') gaugeState = 'dead';
    else if (deathState === 'stable') gaugeState = 'stable';
    else if (total > 0) gaugeState = 'progress';
    else gaugeState = 'idle';
  }
  if (trackerEl.dataset) {
    if (gaugeState === 'inactive') {
      delete trackerEl.dataset.deathState;
    } else {
      trackerEl.dataset.deathState = gaugeState;
    }
  }
  if (!atZero) {
    applyDeathGaugeOverride(null);
  } else if (gaugeState === 'dead') {
    applyDeathGaugeOverride({
      statusOverride: 'dead',
      statusLabelOverride: TRACKER_STATUS_LABELS.dead,
      statusColorOverride: TRACKER_STATUS_COLORS.dead,
    });
  } else if (gaugeState === 'stable') {
    applyDeathGaugeOverride({
      statusOverride: 'stable',
      statusLabelOverride: TRACKER_STATUS_LABELS.stable,
      statusColorOverride: TRACKER_STATUS_COLORS.stable,
    });
  } else if (gaugeState === 'progress') {
    const progressLabel = `S${successes} / F${failures}`;
    const statusColor = failures > successes ? TRACKER_STATUS_COLORS.dead : TRACKER_STATUS_COLORS.unstable;
    applyDeathGaugeOverride({
      statusOverride: 'unstable',
      statusLabelOverride: progressLabel,
      statusColorOverride: statusColor,
    });
  } else {
    applyDeathGaugeOverride(null);
  }
  if (!atZero) {
    trackerEl.classList?.remove(TRACKER_PROGRESS_ROLL_CLASS);
    if (trackerEl.dataset) delete trackerEl.dataset.deathLastRoll;
  }
  if (lastRoll && atZero) {
    if (trackerEl.dataset) trackerEl.dataset.deathLastRoll = lastRoll;
    if (animationsEnabled && !prefersReducedMotion() && trackerEl.classList) {
      trackerEl.classList.remove(TRACKER_PROGRESS_ROLL_CLASS);
      void trackerEl.offsetWidth;
      trackerEl.classList.add(TRACKER_PROGRESS_ROLL_CLASS);
    }
    if (typeof window?.setTimeout === 'function') {
      clearTimeout(deathGaugeRollResetTimer);
      deathGaugeRollResetTimer = window.setTimeout(() => {
        if (trackerEl.dataset?.deathLastRoll === lastRoll) {
          delete trackerEl.dataset.deathLastRoll;
        }
        trackerEl.classList?.remove(TRACKER_PROGRESS_ROLL_CLASS);
      }, 1400);
    }
  }
}

function setDeathSaveOutput({ total, modifier, appliedMode, rolls, resolution }) {
  if (!deathOut) return;
  const dataset = deathOut.dataset;
  if (dataset) {
    if (resolution?.breakdown?.length) {
      dataset.rollBreakdown = resolution.breakdown.join(' | ');
    } else if (dataset.rollBreakdown) {
      delete dataset.rollBreakdown;
    }
    dataset.rollModifier = String(modifier);
    if (appliedMode !== 'normal') {
      dataset.rollMode = appliedMode;
      dataset.rolls = rolls.join('/');
    } else {
      if (dataset.rollMode) delete dataset.rollMode;
      if (dataset.rolls) delete dataset.rolls;
    }
    if (resolution?.modeSources?.length && appliedMode !== 'normal') {
      dataset.rollModeSources = resolution.modeSources.join(' | ');
    } else if (dataset.rollModeSources) {
      delete dataset.rollModeSources;
    }
  }
  const nextValue = total == null ? '' : total;
  renderDiceResultValue(deathOut, nextValue, { renderer: deathSaveResultRenderer });
  if (deathOut.classList) {
    if (animationsEnabled && !prefersReducedMotion()) {
      deathOut.classList.remove(deathOutAnimationClass);
      // Force reflow so the animation replays on consecutive updates.
      void deathOut.offsetWidth;
      deathOut.classList.add(deathOutAnimationClass);
    } else {
      deathOut.classList.remove(deathOutAnimationClass);
    }
  }
}

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
    renderDiceResultValue(deathOut, '', { renderer: deathSaveResultRenderer });
    if (deathOut.classList) {
      deathOut.classList.remove(deathOutAnimationClass);
    }
    if (deathOut.dataset) {
      delete deathOut.dataset.rollBreakdown;
      delete deathOut.dataset.rollModifier;
      delete deathOut.dataset.rollMode;
      delete deathOut.dataset.rolls;
      delete deathOut.dataset.rollModeSources;
    }
  }
  syncDeathSaveGauge();
}
$('pt-death-save-reset')?.addEventListener('click', resetDeathSaves);

async function checkDeathProgress(){
  if (deathSuccesses.length !== 3 || deathFailures.length !== 3) return;
  if(deathFailures.every(b=>b.checked)){
    if(deathState!=='dead'){
      deathState='dead';
      await playDeathAnimation();
      toast('You have fallen, your sacrifice will be remembered.', 'error');
      logAction('Death save failed: character has fallen.');
      if (elDeathSaves) elDeathSaves.disabled = true;
    }
  }else if(deathSuccesses.every(b=>b.checked)){
    if(deathState!=='stable'){
      deathState='stable';
      setHP(1);
      toast('Stabilized. You regain 1 HP.', 'success');
      logAction('Death saves complete: stabilized at 1 HP.');
      updateDeathSaveAvailability();
    }
  }else{
    deathState=null;
  }
  syncDeathSaveGauge();
}
if (deathCheckboxes.length) {
  deathCheckboxes.forEach(box => box.addEventListener('change', checkDeathProgress));
}
syncDeathSaveGauge();
updateDeathSaveAvailability();

$('pt-roll-death-save')?.addEventListener('click', ()=>{
  if (deathSuccesses.length !== 3 || deathFailures.length !== 3) return;
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
  setDeathSaveOutput({ total, modifier, appliedMode, rolls, resolution });
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

  const rawRoll = chosenRoll;
  let rollOutcome = total >= 10 ? 'success' : 'failure';
  let failIncrements = 0;
  let successIncrements = 0;

  if (rawRoll === 1) {
    rollOutcome = 'critical-failure';
    failIncrements = 2;
  } else if (rawRoll === 20) {
    rollOutcome = 'critical-success';
    setHP(1);
    toast('Natural 20. You stabilize and regain 1 HP.', 'success');
    logAction('Death save: natural 20, stabilized to 1 HP.');
    updateDeathSaveAvailability();
    syncDeathSaveGauge({ lastRoll: rollOutcome });
    return;
  } else if (total >= 10) {
    rollOutcome = 'success';
    successIncrements = 1;
  } else {
    rollOutcome = 'failure';
    failIncrements = 1;
  }

  if (successIncrements) {
    const { successes } = getDeathSaveCounts();
    markBoxes(deathSuccesses, successes + successIncrements);
  }
  if (failIncrements) {
    const { failures } = getDeathSaveCounts();
    markBoxes(deathFailures, failures + failIncrements);
  }
  checkDeathProgress();
  syncDeathSaveGauge({ lastRoll: rollOutcome });
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
document.addEventListener('character-cloud-update', event => {
  const detail = event?.detail || {};
  const name = detail.name;
  const payload = detail.payload;
  if (!name || !payload) return;
  const current = currentCharacter();
  if (canonicalCharacterKey(current) !== canonicalCharacterKey(name)) return;
  try {
    const applied = applyAppSnapshot(payload);
    if (applied) {
      applyViewLockState();
    }
  } catch (err) {
    console.error('Failed to apply cloud-updated character', err);
  }
});
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
      const status = await ensureAuthoritativePinState(ch, { force: true });
      if(status.pinned){
        const pin = await pinPrompt('Enter PIN to disable protection');
        if(pin !== null){
          const ok = await verifyStoredPin(ch, pin);
          if(ok){
            const cleared = await clearPin(ch);
            if(cleared){
              applyLockIcon(lockBtn);
              toast('PIN disabled','info');
            }else{
              toast('Failed to disable PIN','error');
            }
          }else{
            toast('Invalid PIN','error');
          }
        }
      }else{
        const pin1 = await pinPrompt('Set PIN');
        if(pin1){
          const pin2 = await pinPrompt('Confirm PIN');
          if(pin1 === pin2){
            const stored = await setPin(ch, pin1);
            if(stored){
              applyLockIcon(lockBtn);
              toast('PIN enabled','success');
            }else{
              toast('Failed to enable PIN','error');
            }
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

const exportCharacterBtn = $('export-character');
const importCharacterBtn = $('import-character');
const importCharacterFile = $('import-character-file');

function resolveImportName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return { decision: 'cancel', name: '' };
  const existing = listLocalSaves();
  const normalized = canonicalCharacterKey(trimmed) || trimmed;
  const exists = existing.some(entry => {
    const entryKey = canonicalCharacterKey(entry) || entry;
    return entryKey.toLowerCase() === normalized.toLowerCase();
  });
  if (!exists) {
    return { decision: 'new', name: trimmed };
  }
  const replace = confirm(`"${trimmed}" already exists. Replace the existing local save?`);
  if (replace) {
    return { decision: 'replace', name: trimmed };
  }
  const saveCopy = confirm('Save as a copy instead?');
  if (!saveCopy) {
    return { decision: 'cancel', name: '' };
  }
  const copyName = buildImportedCopyName(trimmed, existing);
  return { decision: 'copy', name: copyName };
}

if (exportCharacterBtn) {
  exportCharacterBtn.addEventListener('click', async () => {
    try {
      const name = currentCharacter() || readLastSaveName();
      if (!name) {
        toast('Select a character to export.', 'info');
        return;
      }
      const payload = await loadLocal(name);
      const migrated = migrateSavePayload(payload);
      const { payload: canonical } = buildCanonicalPayload(migrated);
      const serialized = JSON.stringify(canonical, null, 2);
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${canonicalCharacterKey(name) || 'character'}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('Exported character JSON.', 'success');
    } catch (err) {
      console.error('Failed to export character', err);
      toast('Failed to export character.', 'error');
    }
  });
}

if (importCharacterBtn && importCharacterFile) {
  importCharacterBtn.addEventListener('click', () => {
    importCharacterFile.click();
  });
  importCharacterFile.addEventListener('change', async () => {
    const file = importCharacterFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const migrated = migrateSavePayload(parsed);
      const { payload } = buildCanonicalPayload(migrated);
      const name = payload?.meta?.name || payload?.character?.name || '';
      if (!name) {
        toast('Imported file missing character name.', 'error');
        return;
      }
      const resolution = resolveImportName(name);
      if (resolution.decision === 'cancel') {
        toast('Import cancelled.', 'info');
        return;
      }
      const resolvedName = resolution.name || name;
      const payloadWithName = {
        ...payload,
        meta: {
          ...(payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}),
          name: resolvedName,
        },
        character: {
          ...(payload?.character && typeof payload.character === 'object' ? payload.character : {}),
          name: resolvedName,
        },
      };
      const characterId = ensureCharacterId(payloadWithName, resolvedName);
      await saveLocal(resolvedName, payloadWithName, { characterId });
      setCurrentCharacter(resolvedName);
      syncMiniGamePlayerName();
      applyAppSnapshot(payloadWithName);
      setMode('edit');
      const suffix = resolution.decision === 'copy' ? ` as ${resolvedName}` : '';
      toast(`Imported ${name}${suffix}.`, 'success');
    } catch (err) {
      console.error('Failed to import character JSON', err);
      toast('Failed to import character JSON.', 'error');
    } finally {
      importCharacterFile.value = '';
    }
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
    setPinInteractionGuard('', { locked: false });
    applyAppSnapshot(createDefaultSnapshot());
    setMode('edit');
    hide('modal-load-list');
    queueCharacterConfirmation({ name: clean, variant: 'created', key: `create:${clean}:${Date.now()}` });
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
  let loadedPinState = { pinned: hasPin(pendingLoad.name), source: 'local-fallback' };
  try {
    loadedPinState = await ensureAuthoritativePinState(pendingLoad.name, { force: true });
  } catch (err) {
    console.error('Failed to sync PIN for load', err);
  }
  try{
    const snapshot = pendingLoad.ts
      ? await loadBackup(pendingLoad.name, pendingLoad.ts, pendingLoad.type, { bypassPin: true })
      : await loadCharacter(pendingLoad.name, { bypassPin: true });
    const applied = applyAppSnapshot(snapshot);
    applyViewLockState();
    const savedViewMode = applied?.ui?.viewMode || applied?.character?.uiState?.viewMode;
    if(previousMode === 'view' && savedViewMode !== 'edit'){
      setMode('view', { skipPersist: true });
    }
    setCurrentCharacter(pendingLoad.name);
    syncMiniGamePlayerName();
    setPinInteractionGuard(pendingLoad.name, { locked: loadedPinState.pinned });
    const variant = pendingLoad.ts ? 'recovered' : 'loaded';
    const key = pendingLoad.ts
      ? `${variant}:${pendingLoad.name}:${pendingLoad.ts}`
      : `${variant}:${pendingLoad.name}:${applied?.meta?.savedAt ?? Date.now()}`;
    queueCharacterConfirmation({ name: pendingLoad.name, variant, key, meta: applied?.meta });
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
      const snapshot = await loadCharacter(autoChar);
      const applied = applyAppSnapshot(snapshot);
      applyViewLockState();
      const savedViewMode = applied?.ui?.viewMode || applied?.character?.uiState?.viewMode;
      if (previousMode === 'view' && savedViewMode !== 'edit') {
        setMode('view', { skipPersist: true });
      }
      queueCharacterConfirmation({
        name: autoChar,
        variant: 'loaded',
        key: `url:${autoChar}:${applied?.meta?.savedAt ?? Date.now()}`,
        meta: applied?.meta,
      });
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
    window.dmNotify?.(message.text, {
      ts: Date.now(),
      char: currentCharacter?.() || 'Hank',
      actionScope: 'minor',
    });
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

function resolvePowerDescription(source = {}) {
  const candidates = [
    source.description,
    source.desc,
    source.summary,
    source.flavor,
    source.legacyText,
    source.originalText,
    source.effect,
  ];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
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
    description: resolvePowerDescription(raw),
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
  const description = resolvePowerDescription(base);
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
    description,
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
let activeConcentrationEffect = null;
const ongoingEffectTrackers = new Map();
let ongoingEffectCounter = 0;

function ensurePowerId(power) {
  if (!power || typeof power !== 'object') {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `pw_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    return { id };
  }
  if (power.id) return power;
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `pw_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  return { ...power, id };
}

function getCurrentPowersArray() {
  const list = $('powers');
  if (!list) return [];
  return Array.from(list.querySelectorAll("[data-kind='power']"))
    .map(card => serializePowerCard(card))
    .filter(Boolean);
}

function getCurrentSignaturesArray() {
  const list = $('sigs');
  if (!list) return [];
  return Array.from(list.querySelectorAll("[data-kind='sig']"))
    .map(card => {
      const sig = serializePowerCard(card);
      if (!sig) return null;
      return { ...sig, signature: true };
    })
    .filter(Boolean);
}

function setCurrentPowersArray(nextPowers) {
  const list = $('powers');
  if (!list) return;
  Array.from(list.querySelectorAll("[data-kind='power']")).forEach(card => {
    activePowerCards.delete(card);
    powerCardStates.delete(card);
  });
  list.innerHTML = '';
  (Array.isArray(nextPowers) ? nextPowers : []).forEach(power => {
    const card = createCard('power', power);
    list.appendChild(card);
  });
}

function setCurrentSignaturesArray(nextSignatures) {
  const list = $('sigs');
  if (!list) return;
  Array.from(list.querySelectorAll("[data-kind='sig']")).forEach(card => {
    activePowerCards.delete(card);
    powerCardStates.delete(card);
  });
  list.innerHTML = '';
  (Array.isArray(nextSignatures) ? nextSignatures : []).forEach(sig => {
    const card = createCard('sig', { ...sig, signature: true });
    list.appendChild(card);
  });
}

function persistAndRerender() {
  activePowerCards.forEach(card => updatePowerCardDerived(card));
  pushHistory();
}

function openPowerCreationWizard({ mode = 'create', power = null, target = 'powers' } = {}) {
  const isSignature = target === 'sigs' || power?.signature === true;
  const current = isSignature ? getCurrentSignaturesArray() : getCurrentPowersArray();
  const initialPower = power ? { ...power, signature: isSignature ? true : power.signature } : (isSignature ? { signature: true } : null);

  openPowerWizard({
    mode,
    power: initialPower || undefined,
    powers: current,
    onPowersUpdated(nextPowers) {
      const normalized = (Array.isArray(nextPowers) ? nextPowers : [])
        .map(entry => ensurePowerId(entry))
        .map(entry => (isSignature ? { ...entry, signature: true } : entry));
      if (isSignature) setCurrentSignaturesArray(normalized);
      else setCurrentPowersArray(normalized);
      persistAndRerender();
    },
    onSave() {
      persistAndRerender();
    },
    onCancel() {},
  });
}

const powerEditorState = {};

const POWER_WIZARD_TYPES = {
  attack: {
    label: 'Attack',
    description: 'Direct offensive abilities that deal damage or impose conditions.',
    defaultIntensity: 'Core',
    subtypes: {
      melee: {
        label: 'Melee Strike',
        description: 'Close-quarters blows, grapples, and brutal finishers.',
        shapes: ['Melee'],
        effectTags: ['Damage', 'Push/Pull', 'Weaken', 'Stun'],
        showDamage: true,
        allowSave: true,
        defaultEffect: 'Damage',
      },
      ranged: {
        label: 'Ranged Assault',
        description: 'Single target shots or blasts at a distance.',
        shapes: ['Ranged Single'],
        effectTags: ['Damage', 'Burn', 'Freeze', 'Blind'],
        showDamage: true,
        allowSave: true,
        defaultEffect: 'Damage',
      },
      area: {
        label: 'Area Control',
        description: 'Cones, lines, and zones that strike multiple foes.',
        shapes: ['Cone', 'Line', 'Radius', 'Aura'],
        effectTags: ['Damage', 'Slow', 'Weaken', 'Burn'],
        showDamage: true,
        allowSave: true,
        defaultEffect: 'Damage',
        defaultIntensity: 'AoE',
      },
    },
  },
  utility: {
    label: 'Utility',
    description: 'Support, battlefield control, and problem-solving powers.',
    defaultIntensity: 'Minor',
    subtypes: {
      support: {
        label: 'Support Buff',
        description: 'Bolster allies or provide protection.',
        shapes: ['Self', 'Aura', 'Ranged Single'],
        effectTags: ['Heal', 'Shield', 'Summon/Clone'],
        showDamage: false,
        allowSave: false,
        defaultEffect: 'Heal',
      },
      control: {
        label: 'Control / Debuff',
        description: 'Impose debilitating conditions or reshape the battlefield.',
        shapes: ['Cone', 'Line', 'Radius', 'Ranged Single'],
        effectTags: ['Stun', 'Blind', 'Weaken', 'Slow', 'Charm', 'Dispel/Nullify'],
        showDamage: false,
        allowSave: true,
        defaultEffect: 'Stun',
      },
      mobility: {
        label: 'Mobility / Movement',
        description: 'Teleportation, repositioning, and traversal tricks.',
        shapes: ['Self', 'Ranged Single'],
        effectTags: ['Teleport/Phase', 'Push/Pull', 'Terrain'],
        showDamage: false,
        allowSave: false,
        defaultEffect: 'Teleport/Phase',
      },
    },
  },
  signature: {
    label: 'Signature',
    description: 'Iconic moves that define the hero’s style.',
    defaultIntensity: 'Ultimate',
    subtypes: {
      finisher: {
        label: 'Signature Finisher',
        description: 'A devastating signature attack or combo.',
        shapes: ['Melee', 'Ranged Single', 'Cone', 'Radius'],
        effectTags: ['Damage', 'Stun', 'Weaken'],
        showDamage: true,
        allowSave: true,
        defaultEffect: 'Damage',
        enforceSignature: true,
      },
      showcase: {
        label: 'Showcase Utility',
        description: 'A flashy, narrative-defining utility move.',
        shapes: ['Self', 'Aura', 'Ranged Single'],
        effectTags: ['Shield', 'Heal', 'Teleport/Phase', 'Summon/Clone'],
        showDamage: false,
        allowSave: true,
        defaultEffect: 'Shield',
        enforceSignature: true,
      },
    },
  },
  cinematic: {
    label: 'Cinematic',
    description: 'Set-piece powers for dramatic moments and ultimate gambits.',
    defaultIntensity: 'Ultimate',
    subtypes: {
      moment: {
        label: 'Heroic Moment',
        description: 'A sweeping narrative beat that protects or inspires.',
        shapes: ['Self', 'Aura', 'Radius'],
        effectTags: ['Shield', 'Heal', 'Terrain', 'Summon/Clone'],
        showDamage: false,
        allowSave: false,
        defaultEffect: 'Shield',
        cinematic: true,
      },
      devastation: {
        label: 'Devastating Assault',
        description: 'A massive, battlefield-altering strike.',
        shapes: ['Cone', 'Line', 'Radius', 'Ranged Single'],
        effectTags: ['Damage', 'Burn', 'Freeze', 'Push/Pull'],
        showDamage: true,
        allowSave: true,
        defaultEffect: 'Damage',
        cinematic: true,
      },
    },
  },
};

const POWER_WIZARD_CONCEPT_FALLBACK = [
  {
    id: 'concept-visual-core',
    prompt: 'What does it look and sound like when this power activates?',
    helper: 'Paint the cinematic picture for the table.',
    assign: 'description',
  },
  {
    id: 'concept-impact-core',
    prompt: 'What lasting impression or change does it leave behind?',
    helper: 'Think about the battlefield, NPC reactions, or story beats.',
    assign: 'description',
  },
  {
    id: 'concept-cost-core',
    prompt: 'What cost, risk, or complication keeps the power interesting?',
    helper: 'Consequences help the move stay dramatic.',
    assign: 'special',
  },
];

const POWER_WIZARD_CONCEPT_QUESTIONS = {
  attack: {
    melee: [
      {
        id: 'attack-melee-visual',
        prompt: 'How does your close-quarters technique look in action?',
        helper: 'Detail stance, weapon, or martial flourish.',
        assign: 'description',
      },
      {
        id: 'attack-melee-identity',
        prompt: 'What unmistakable signature makes the attack yours?',
        helper: 'Consider sound, catchphrases, or energy trails.',
        assign: 'description',
      },
      {
        id: 'attack-melee-risk',
        prompt: 'What risk do you embrace when you close the distance?',
        helper: 'Describe danger, openings, or cost.',
        assign: 'special',
      },
    ],
    ranged: [
      {
        id: 'attack-ranged-visual',
        prompt: 'What form does the projectile or blast take?',
        helper: 'Describe energy, ammo, or delivery method.',
        assign: 'description',
      },
      {
        id: 'attack-ranged-aim',
        prompt: 'How do you aim or adapt it under pressure?',
        helper: 'Show the technique, tech, or instincts at play.',
        assign: 'description',
      },
      {
        id: 'attack-ranged-cost',
        prompt: 'What collateral effect or cost comes with unleashing it?',
        helper: 'Think about recoil, ammo drain, or attention drawn.',
        assign: 'special',
      },
    ],
    area: [
      {
        id: 'attack-area-scope',
        prompt: 'How does this power spread across multiple targets?',
        helper: 'Define the shape, reach, and visual cues.',
        assign: 'description',
      },
      {
        id: 'attack-area-control',
        prompt: 'What lets you shape or steer the area of effect?',
        helper: 'Mention positioning, focus, or gadgets.',
        assign: 'description',
      },
      {
        id: 'attack-area-aftermath',
        prompt: 'What aftermath or lingering danger remains afterward?',
        helper: 'Lingering flames, tremors, or narrative shifts.',
        assign: 'special',
      },
    ],
  },
  utility: {
    support: [
      {
        id: 'utility-support-focus',
        prompt: 'Who or what do you bolster when this power flares?',
        helper: 'Call out allies, gear, or situations.',
        assign: 'description',
      },
      {
        id: 'utility-support-sense',
        prompt: 'What sensory cues show the support taking hold?',
        helper: 'Glowing aura, harmonic notes, clever gadgets, etc.',
        assign: 'description',
      },
      {
        id: 'utility-support-tradeoff',
        prompt: 'What tradeoff keeps the support dramatic or costly?',
        helper: 'Maybe exhaustion, resource drain, or narrative stakes.',
        assign: 'special',
      },
    ],
    control: [
      {
        id: 'utility-control-shape',
        prompt: 'How do you twist the battlefield or an opponent’s senses?',
        helper: 'Describe illusions, restraints, or elemental manipulation.',
        assign: 'description',
      },
      {
        id: 'utility-control-warning',
        prompt: 'What warns foes that your control is taking hold?',
        helper: 'Show the omen or build-up before it snaps shut.',
        assign: 'description',
      },
      {
        id: 'utility-control-cost',
        prompt: 'What complications arise if the control slips?',
        helper: 'Think backlash, collateral effects, or vulnerabilities.',
        assign: 'special',
      },
    ],
    mobility: [
      {
        id: 'utility-mobility-motion',
        prompt: 'What motion, teleport, or traversal does the power create?',
        helper: 'Describe the physics or magic behind it.',
        assign: 'description',
      },
      {
        id: 'utility-mobility-signal',
        prompt: 'How do allies know where you will end up?',
        helper: 'Trail markers, comms, or instinctual cues.',
        assign: 'description',
      },
      {
        id: 'utility-mobility-limit',
        prompt: 'What limitation or cost balances the movement?',
        helper: 'Maybe momentum, cooldown, or disorientation.',
        assign: 'special',
      },
    ],
  },
  signature: {
    finisher: [
      {
        id: 'signature-finisher-flourish',
        prompt: 'What legendary flourish defines this finisher?',
        helper: 'Describe poses, callouts, or cinematic beats.',
        assign: 'description',
      },
      {
        id: 'signature-finisher-escalation',
        prompt: 'How does it eclipse your everyday techniques?',
        helper: 'Bigger stakes, brighter energy, louder fanfare.',
        assign: 'description',
      },
      {
        id: 'signature-finisher-price',
        prompt: 'What toll does this ultimate strike take?',
        helper: 'Fatigue, collateral damage, or story fallout.',
        assign: 'special',
      },
    ],
    showcase: [
      {
        id: 'signature-showcase-spectacle',
        prompt: 'What spectacle makes this signature move iconic?',
        helper: 'Think special effects, narration, or crowd reaction.',
        assign: 'description',
      },
      {
        id: 'signature-showcase-theme',
        prompt: 'How does it reinforce your hero’s core theme?',
        helper: 'Tie it to origins, ideals, or motifs.',
        assign: 'description',
      },
      {
        id: 'signature-showcase-requirement',
        prompt: 'What setup or narrative cost unlocks the move?',
        helper: 'Maybe allies, time, or scarce resources.',
        assign: 'special',
      },
    ],
  },
  cinematic: {
    moment: [
      {
        id: 'cinematic-moment-visual',
        prompt: 'What set-piece visuals define this heroic moment?',
        helper: 'Slow motion shots, comic panels, or sweeping music.',
        assign: 'description',
      },
      {
        id: 'cinematic-moment-support',
        prompt: 'How does it protect, inspire, or rally others?',
        helper: 'Focus on allies, civilians, or the world reacting.',
        assign: 'description',
      },
      {
        id: 'cinematic-moment-consequence',
        prompt: 'What consequences linger once the scene shifts?',
        helper: 'Think debts, promises, or vulnerability.',
        assign: 'special',
      },
    ],
    devastation: [
      {
        id: 'cinematic-devastation-scale',
        prompt: 'Describe the awe-inspiring scale of destruction.',
        helper: 'Cracking skies, shockwaves, or reality warping.',
        assign: 'description',
      },
      {
        id: 'cinematic-devastation-build',
        prompt: 'What dramatic beat signals the attack is coming?',
        helper: 'Foreshadow with dialogue, visuals, or tension.',
        assign: 'description',
      },
      {
        id: 'cinematic-devastation-fallout',
        prompt: 'What price or aftermath balances such power?',
        helper: 'Maybe collateral, depletion, or narrative debt.',
        assign: 'special',
      },
    ],
  },
};

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

function setSummaryRollVisibility(wrapper, button, result, visible) {
  const target = wrapper || button;
  if (!target) return;
  const show = !!visible;
  if (wrapper) {
    wrapper.hidden = !show;
    if (show) {
      wrapper.removeAttribute('aria-hidden');
    } else {
      wrapper.setAttribute('aria-hidden', 'true');
    }
  } else if (button) {
    button.hidden = !show;
  }
  if (button) {
    if (show) {
      button.removeAttribute('aria-hidden');
    } else {
      button.setAttribute('aria-hidden', 'true');
    }
  }
  if (result) {
    if (show) {
      result.removeAttribute('aria-hidden');
    } else {
      result.setAttribute('aria-hidden', 'true');
    }
  }
  if (!show && result) {
    if (result.dataset && result.dataset.placeholder) {
      result.textContent = result.dataset.placeholder;
    } else {
      result.textContent = '';
    }
    if (result.dataset && result.dataset.rollBreakdown) {
      delete result.dataset.rollBreakdown;
    }
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
  let hasDamage = !!power.damage;
  if (!hasDamage && power.effectTag === 'Damage') {
    power.damage = {
      dice: POWER_DAMAGE_DICE[0],
      type: defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0],
      onSave: suggestOnSaveBehavior(power.effectTag),
    };
    hasDamage = true;
  }
  const saveEnabled = !!power.requiresSave;
  const showOnSave = hasDamage && saveEnabled;
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
    if (elements.damageSaveSelect) {
      if (showOnSave && elements.damageSaveSelect.value !== power.damage.onSave) {
        elements.damageSaveSelect.value = power.damage.onSave;
      }
      elements.damageSaveSelect.disabled = !showOnSave;
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
      elements.damageSaveSelect.disabled = true;
    }
  }
  if (elements.damageToggle) {
    elements.damageToggle.checked = hasDamage;
  }
  if (elements.damageSaveHint) {
    elements.damageSaveHint.textContent = showOnSave ? `Suggested: ${onSaveSuggestion}` : '';
  }
  if (elements.damageSaveField?.wrapper) {
    elements.damageSaveField.wrapper.style.display = showOnSave ? '' : 'none';
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
      elements.quickOnSaveField.style.display = showOnSave ? '' : 'none';
    }
    if (showOnSave) {
      const quickOnSaveValue = power.damage?.onSave || suggestOnSaveBehavior(power.effectTag);
      setSelectOptions(elements.quickOnSaveSelect, POWER_ON_SAVE_OPTIONS, quickOnSaveValue);
      elements.quickOnSaveSelect.disabled = false;
    } else {
      elements.quickOnSaveSelect.disabled = true;
    }
  }
  const attackEnabled = shouldEnablePowerAttack(power);
  setButtonDisabled(elements.rollAttackButton, !attackEnabled);
  setButtonDisabled(elements.summaryRollHit, !attackEnabled);
  setSummaryRollVisibility(
    elements.summaryRollHitWrapper,
    elements.summaryRollHit,
    elements.summaryHitResult,
    attackEnabled,
  );
  setButtonDisabled(elements.rollDamageButton, !hasDamage);
  setButtonDisabled(elements.summaryRollDamage, !hasDamage);
  setSummaryRollVisibility(
    elements.summaryRollDamageWrapper,
    elements.summaryRollDamage,
    elements.summaryDamageResult,
    hasDamage,
  );
  setButtonDisabled(elements.summaryRollSave, !saveEnabled);
  setSummaryRollVisibility(
    elements.summaryRollSaveWrapper,
    elements.summaryRollSave,
    elements.summarySaveResult,
    saveEnabled,
  );
  setButtonDisabled(elements.rollSaveBtn, !saveEnabled);
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
  const descriptionParts = [power.description, power.special]
    .map(part => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);
  const hasDescription = descriptionParts.length > 0;
  const descriptionText = hasDescription ? descriptionParts.join(' ') : 'No description provided.';
  if (elements.summaryDescription) {
    elements.summaryDescription.textContent = descriptionText;
    elements.summaryDescription.hidden = false;
    if (hasDescription) {
      elements.summaryDescription.removeAttribute('data-placeholder');
    } else {
      elements.summaryDescription.setAttribute('data-placeholder', 'true');
    }
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
      if (power.requiresSave && dmg.onSave) stats.push(['On Save', dmg.onSave]);
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
  const existing = document.getElementById('modal-power-editor');
  const isElement = typeof Element !== 'undefined' && existing instanceof Element;
  if (existing && isElement) {
    return existing;
  }
  if (existing && typeof existing === 'object' && 'parentNode' in existing) {
    try {
      const parent = existing.parentNode;
      if (parent && typeof parent.removeChild === 'function') {
        parent.removeChild(existing);
      }
    } catch {
      /* ignore invalid cached nodes */
    }
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
  const overlayIsElement = typeof Element !== 'undefined' && overlay instanceof Element;
  if (!overlay || !overlayIsElement || typeof overlay.querySelector !== 'function') {
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
  const { card, content } = powerEditorState;
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
  powerEditorState.wizardElements = {};
}

function resetPowerEditorState() {
  powerEditorState.card = null;
  powerEditorState.targetList = null;
  powerEditorState.initialData = null;
  powerEditorState.isNew = false;
  powerEditorState.stepIndex = 0;
  powerEditorState.workingPower = null;
  powerEditorState.moveType = null;
  powerEditorState.subtype = null;
  powerEditorState.wizardElements = {};
}

function isPowerWizardOpen() {
  const overlay = powerEditorState.overlay || document.getElementById('modal-power-editor');
  if (!overlay) return false;
  const hiddenByClass = typeof overlay.classList !== 'undefined' && overlay.classList.contains('hidden');
  const ariaHidden = overlay.getAttribute && overlay.getAttribute('aria-hidden') === 'true';
  const hiddenByStyle = overlay.style && overlay.style.display === 'none';
  return !(hiddenByClass || ariaHidden || hiddenByStyle);
}

function capturePowerWizardSnapshot() {
  if (!isPowerWizardOpen()) return null;
  const snapshot = {
    open: true,
    stepIndex: Number.isFinite(powerEditorState.stepIndex) ? powerEditorState.stepIndex : 0,
    isNew: !!powerEditorState.isNew,
    target: powerEditorState.targetList?.id === 'sigs' ? 'sigs' : 'powers',
    moveType: powerEditorState.moveType || null,
    subtype: powerEditorState.subtype || null,
  };
  const workingPower = powerEditorState.workingPower || (powerEditorState.card ? serializePowerCard(powerEditorState.card) : null);
  if (workingPower && typeof workingPower === 'object') {
    try {
      snapshot.power = JSON.parse(JSON.stringify(workingPower));
    } catch {
      snapshot.power = { ...workingPower };
    }
  }
  return snapshot;
}

function applyPowerWizardSnapshot(state) {
  if (!state || typeof state !== 'object' || !state.open) return;
  try {
    const target = state.target === 'sigs' ? 'sigs' : 'powers';
    const power = state.power && typeof state.power === 'object' ? { ...state.power } : null;
    openPowerCreationWizard({ mode: state.isNew ? 'create' : 'edit', power, target });
    requestAnimationFrame(() => {
      try {
        if (power && !powerEditorState.workingPower) {
          powerEditorState.workingPower = { ...power };
        }
        if (state.moveType) powerEditorState.moveType = state.moveType;
        if (state.subtype) powerEditorState.subtype = state.subtype;
        if (Number.isFinite(state.stepIndex)) {
          const desiredIndex = Math.max(0, Math.min(state.stepIndex, (powerEditorState.steps || []).length - 1));
          goToWizardStep(desiredIndex);
        }
        if (typeof updatePowerEditorSaveState === 'function') {
          updatePowerEditorSaveState();
        }
      } catch (err) {
        console.error('Failed to finalize power wizard restore', err);
      }
    });
  } catch (err) {
    console.error('Failed to restore power wizard state', err);
  }
}

registerSnapshotParticipant({
  key: 'powerWizard',
  capture: capturePowerWizardSnapshot,
  apply: applyPowerWizardSnapshot,
  priority: 5,
});

function handlePowerEditorSave(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  const { card, targetList, isNew } = powerEditorState;
  if (!card) {
    hide('modal-power-editor');
    return;
  }
  if (!isPowerEditorValid()) {
    updatePowerEditorSaveState();
    return;
  }
  const compiled = compilePowerEditorResult();
  if (!compiled) {
    updatePowerEditorSaveState();
    return;
  }
  applyPowerDataToCard(card, compiled);
  if (isNew && targetList && !card.isConnected) {
    targetList.appendChild(card);
  }
  updatePowerCardDerived(card);
  restorePowerEditorCard();
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
  hide('modal-power-editor');
}

function openPowerEditor(card, { isNew = false, targetList = null } = {}) {
  if (!card) return false;
  const power = serializePowerCard(card);
  const target = card?.dataset?.kind === 'sig' ? 'sigs' : 'powers';
  openPowerCreationWizard({ mode: isNew ? 'create' : 'edit', power, target });
  return true;
}

function clonePowerForEditor(power) {
  const fallback = normalizePowerData({});
  if (!power || typeof power !== 'object') {
    return { ...fallback };
  }
  try {
    const clone = typeof structuredClone === 'function' ? structuredClone(power) : JSON.parse(JSON.stringify(power));
    return clone || { ...fallback };
  } catch {
    return { ...power };
  }
}

function inferPowerMoveType(card, power = {}) {
  if (card?.dataset?.kind === 'sig' || power.signature) return 'signature';
  if (power.intensity === 'Ultimate' || power.uses === 'Cooldown') {
    return power.damage ? 'cinematic' : 'signature';
  }
  if (power.damage) return 'attack';
  return 'utility';
}

function getMoveTypeConfig(moveType) {
  return POWER_WIZARD_TYPES[moveType] || null;
}

function getSubtypeConfig(moveType, subtype) {
  const moveConfig = getMoveTypeConfig(moveType);
  if (!moveConfig || !moveConfig.subtypes) return null;
  return moveConfig.subtypes[subtype] || null;
}

function inferPowerSubtype(moveType, power = {}) {
  const config = getMoveTypeConfig(moveType);
  if (!config) return null;
  const subtypeEntries = Object.entries(config.subtypes || {});
  if (!subtypeEntries.length) return null;
  if (moveType === 'attack') {
    if (power.shape === 'Melee') return 'melee';
    if (['Cone', 'Line', 'Radius', 'Aura'].includes(power.shape)) return 'area';
    return 'ranged';
  }
  if (moveType === 'utility') {
    if (['Heal', 'Shield', 'Summon/Clone'].includes(power.effectTag)) return 'support';
    if (['Teleport/Phase', 'Terrain', 'Push/Pull'].includes(power.effectTag)) return 'mobility';
    if (power.requiresSave || ['Stun', 'Blind', 'Weaken', 'Slow', 'Charm', 'Dispel/Nullify'].includes(power.effectTag)) {
      return 'control';
    }
    return subtypeEntries[0][0];
  }
  if (moveType === 'signature') {
    if (power.damage) return 'finisher';
    return 'showcase';
  }
  if (moveType === 'cinematic') {
    if (power.damage) return 'devastation';
    return 'moment';
  }
  return subtypeEntries[0][0];
}

function applyMoveTypeDefaults(moveType) {
  const working = powerEditorState.workingPower;
  const config = getMoveTypeConfig(moveType);
  if (!working || !config) return;
  if (config.defaultIntensity && (!POWER_INTENSITIES.includes(working.intensity) || working.intensity === '')) {
    working.intensity = config.defaultIntensity;
  }
  if (moveType === 'signature') {
    working.signature = true;
    if (!POWER_INTENSITIES.includes(working.intensity)) working.intensity = 'Ultimate';
  } else if (moveType !== 'signature' && !config.enforceSignature) {
    delete working.signature;
  }
  if (moveType === 'cinematic') {
    working.intensity = 'Ultimate';
    working.uses = 'Cooldown';
    working.cooldown = Math.max(Number(working.cooldown) || 10, 1);
  }
}

function applySubtypeDefaults(moveType, subtype) {
  const working = powerEditorState.workingPower;
  if (!working) return;
  const config = getSubtypeConfig(moveType, subtype);
  if (!config) return;
  const shapes = (config.shapes || []).filter(shape => POWER_TARGET_SHAPES.includes(shape));
  if (shapes.length) {
    if (!shapes.includes(working.shape)) {
      [working.shape] = shapes;
    }
    const settings = typeof getCharacterPowerSettings === 'function' ? getCharacterPowerSettings() : null;
    working.range = ensureRangeForShape(working.shape, working.range, settings);
  }
  const effectOptions = (config.effectTags || []).filter(tag => POWER_EFFECT_TAGS.includes(tag));
  if (effectOptions.length) {
    if (!effectOptions.includes(working.effectTag)) {
      working.effectTag = config.defaultEffect || effectOptions[0];
    }
  }
  if (config.defaultIntensity && POWER_INTENSITIES.includes(config.defaultIntensity)) {
    if (!POWER_INTENSITIES.includes(working.intensity)) {
      working.intensity = config.defaultIntensity;
    }
  }
  if (config.showDamage) {
    if (!working.damage || typeof working.damage !== 'object') {
      working.damage = {
        dice: POWER_DAMAGE_DICE[0],
        type: defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0],
        onSave: 'Half',
      };
    } else {
      if (!POWER_DAMAGE_DICE.includes(working.damage.dice)) {
        working.damage.dice = POWER_DAMAGE_DICE[0];
      }
      const fallbackType = defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0];
      if (!POWER_DAMAGE_TYPES.includes(working.damage.type)) {
        working.damage.type = fallbackType;
      }
      if (!POWER_ON_SAVE_OPTIONS.includes(working.damage.onSave)) {
        working.damage.onSave = 'Half';
      }
    }
    if (working.damageOptIn === false) {
      working.damage = null;
    } else {
      working.damageOptIn = true;
    }
  } else {
    delete working.damage;
    working.damageOptIn = false;
  }
  if (!config.allowSave) {
    working.requiresSave = false;
    delete working.saveAbilityTarget;
  } else if (working.requiresSave && !POWER_SAVE_ABILITIES.includes(working.saveAbilityTarget)) {
    working.saveAbilityTarget = POWER_SAVE_ABILITIES[0];
  }
  if (config.enforceSignature) {
    working.signature = true;
  }
  if (config.cinematic) {
    working.intensity = 'Ultimate';
    working.uses = 'Cooldown';
    working.cooldown = Math.max(Number(working.cooldown) || 10, 1);
  }
  if (!Number.isFinite(Number(working.spCost)) || Number(working.spCost) <= 0) {
    working.spCost = suggestSpCost(working.intensity || 'Core');
  }
}

function exposePowerMeta() {
  const meta = {
    POWER_WIZARD_TYPES,
    POWER_EFFECT_TAGS,
    POWER_DAMAGE_DICE,
    POWER_DAMAGE_TYPES,
    POWER_ON_SAVE_OPTIONS,
    POWER_SAVE_ABILITIES,
    POWER_TARGET_SHAPES,
    POWER_DURATIONS,
    POWER_USES,
    POWER_ACTION_TYPES,
    POWER_INTENSITIES,
    POWER_RANGE_QUICK_VALUES,
    getMoveTypeConfig,
    getSubtypeConfig,
    inferPowerSubtype,
    applyMoveTypeDefaults,
    applySubtypeDefaults,
    suggestSpCost,
    defaultDamageType,
    suggestOnSaveBehavior,
    getCharacterPowerSettings,
    formatPowerRange,
  };
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    g.PowerMeta = { ...(g.PowerMeta || {}), ...meta };
  } catch (_) {}
}

exposePowerMeta();

function goToWizardStep(step) {
  const steps = powerEditorState.steps || [];
  const maxIndex = Math.max(0, steps.length - 1);
  const nextIndex = Math.min(Math.max(step, 0), maxIndex);
  powerEditorState.stepIndex = nextIndex;
  renderPowerEditorStep();
}

function renderPowerEditorStep() {
  const { content, steps, stepIndex } = powerEditorState;
  if (!content) return;
  if (!powerEditorState.wizardElements || typeof powerEditorState.wizardElements !== 'object') {
    powerEditorState.wizardElements = {};
  }
  powerEditorState.wizardElements.details = null;
  powerEditorState.wizardElements.detailsNavNext = null;
  powerEditorState.wizardElements.typeNavNext = null;
  powerEditorState.wizardElements.descriptionNavNext = null;
  powerEditorState.wizardElements.review = null;
  powerEditorState.wizardElements.reviewNavNext = null;
  content.innerHTML = '';
  content.scrollTop = 0;
  const stepKey = steps?.[stepIndex] || 'type-select';
  switch (stepKey) {
    case 'type-select':
      renderPowerWizardTypeSelect(content);
      break;
    case 'description':
      renderPowerWizardDescription(content);
      break;
    case 'details':
      renderPowerWizardDetails(content);
      break;
    case 'review':
      renderPowerWizardReview(content);
      break;
    default:
      renderPowerWizardTypeSelect(content);
      break;
  }
  updatePowerEditorSaveState();
}

function renderPowerWizardTypeSelect(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'power-editor__wizard-step power-editor__wizard-step--types';
  const heading = document.createElement('h4');
  heading.textContent = 'Power type setup';
  const intro = document.createElement('p');
  intro.className = 'power-editor__wizard-helper';
  intro.textContent = 'Pick a primary power type and a complementary focus. These choices unlock tailored guidance for describing your move and configuring its mechanics.';

  const form = document.createElement('div');
  form.className = 'power-editor__wizard-type-grid';

  const primarySelect = document.createElement('select');
  setSelectOptions(primarySelect, Object.keys(POWER_WIZARD_TYPES), powerEditorState.moveType || '', {
    includeEmpty: true,
    formatDisplay: key => POWER_WIZARD_TYPES[key]?.label || key,
  });
  if (primarySelect.options.length) {
    primarySelect.options[0].textContent = 'Select a primary type…';
  }
  const primaryField = createFieldContainer('Primary power type', primarySelect, { minWidth: '260px' });
  const primaryHelper = document.createElement('p');
  primaryHelper.className = 'power-editor__field-helper';
  primaryField.wrapper.appendChild(primaryHelper);

  const secondarySelect = document.createElement('select');
  const secondaryField = createFieldContainer('Secondary focus', secondarySelect, { minWidth: '260px' });
  const secondaryHelper = document.createElement('p');
  secondaryHelper.className = 'power-editor__field-helper';
  secondaryField.wrapper.appendChild(secondaryHelper);

  form.append(primaryField.wrapper, secondaryField.wrapper);

  const summaryCard = document.createElement('div');
  summaryCard.className = 'power-editor__wizard-summary-card';
  const summaryTitle = document.createElement('strong');
  summaryTitle.textContent = 'What you will shape next';
  const summaryBody = document.createElement('p');
  summaryCard.append(summaryTitle, summaryBody);

  wrapper.append(heading, intro, form, summaryCard);

  const nav = createWizardNav({
    showBack: false,
    nextLabel: 'Continue',
    nextDisabled: true,
    onNext: () => {
      goToWizardStep(powerEditorState.stepIndex + 1);
    },
  });
  wrapper.appendChild(nav);
  container.appendChild(wrapper);

  const navNext = nav.querySelector('[data-wizard-next]');
  powerEditorState.wizardElements.typeNavNext = navNext || null;

  function updateSummary() {
    const primaryKey = primarySelect.value;
    const subtypeKey = secondarySelect.value;
    const moveConfig = getMoveTypeConfig(primaryKey);
    const subtypeConfig = getSubtypeConfig(primaryKey, subtypeKey);
    primaryHelper.textContent = moveConfig?.description || 'Select a primary power type to continue.';
    secondaryHelper.textContent = subtypeConfig?.description || (primaryKey ? 'Choose a complementary focus for this power.' : 'Pick a primary type first.');
    if (primaryKey && subtypeConfig) {
      summaryBody.textContent = `${moveConfig?.label || 'Power'} • ${subtypeConfig.label}`;
    } else if (primaryKey) {
      summaryBody.textContent = `${moveConfig?.label || 'Power'} • Secondary focus pending`;
    } else {
      summaryBody.textContent = 'Start by picking your primary power type.';
    }
    const disableNext = !primaryKey || !subtypeConfig;
    if (navNext) {
      navNext.disabled = disableNext;
      if (disableNext) {
        navNext.setAttribute('aria-disabled', 'true');
      } else {
        navNext.removeAttribute('aria-disabled');
      }
    }
  }

  function updateSecondaryOptions() {
    const primaryKey = primarySelect.value;
    secondarySelect.innerHTML = '';
    if (!primaryKey || !POWER_WIZARD_TYPES[primaryKey]) {
      secondarySelect.disabled = true;
      secondarySelect.appendChild(new Option('Select a primary type first', ''));
      powerEditorState.subtype = null;
      updateSummary();
      return;
    }
    secondarySelect.disabled = false;
    const subtypeEntries = Object.entries(POWER_WIZARD_TYPES[primaryKey].subtypes || {});
    if (!subtypeEntries.length) {
      secondarySelect.appendChild(new Option('No secondary options available', ''));
      powerEditorState.subtype = null;
      updateSummary();
      return;
    }
    subtypeEntries.forEach(([value, config]) => {
      secondarySelect.appendChild(new Option(config.label, value));
    });
    const desired = subtypeEntries.some(([key]) => key === powerEditorState.subtype)
      ? powerEditorState.subtype
      : subtypeEntries[0][0];
    secondarySelect.value = desired;
    powerEditorState.subtype = secondarySelect.value || null;
    if (powerEditorState.subtype) {
      applySubtypeDefaults(primaryKey, powerEditorState.subtype);
    }
    updateSummary();
  }

  primarySelect.addEventListener('change', () => {
    const primaryKey = primarySelect.value;
    if (primaryKey && POWER_WIZARD_TYPES[primaryKey]) {
      powerEditorState.moveType = primaryKey;
      applyMoveTypeDefaults(primaryKey);
      powerEditorState.subtype = inferPowerSubtype(primaryKey, powerEditorState.workingPower);
    } else {
      powerEditorState.moveType = null;
      powerEditorState.subtype = null;
    }
    updateSecondaryOptions();
    updatePowerEditorSaveState();
  });

  secondarySelect.addEventListener('change', () => {
    const subtypeKey = secondarySelect.value;
    powerEditorState.subtype = subtypeKey || null;
    if (powerEditorState.moveType && powerEditorState.subtype) {
      applySubtypeDefaults(powerEditorState.moveType, powerEditorState.subtype);
    }
    updateSummary();
    updatePowerEditorSaveState();
  });

  updateSecondaryOptions();
  updateSummary();
}

function renderPowerWizardDescription(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'power-editor__wizard-step power-editor__wizard-step--description';
  const moveType = powerEditorState.moveType;
  const subtype = powerEditorState.subtype;
  const moveConfig = getMoveTypeConfig(moveType);
  const subtypeConfig = getSubtypeConfig(moveType, subtype);
  if (!moveConfig || !subtypeConfig) {
    const info = document.createElement('p');
    info.textContent = 'Choose a primary and secondary type before writing the description.';
    const nav = createWizardNav({
      showBack: true,
      onBack: () => goToWizardStep(Math.max(powerEditorState.stepIndex - 1, 0)),
      nextLabel: 'Continue',
      nextDisabled: true,
    });
    wrapper.append(info, nav);
    container.appendChild(wrapper);
    return;
  }

  const heading = document.createElement('h4');
  heading.textContent = 'Describe your power';

  const summaryBar = document.createElement('div');
  summaryBar.className = 'power-editor__wizard-summary-bar';
  const summaryText = document.createElement('div');
  summaryText.className = 'power-editor__wizard-summary-text';
  summaryText.textContent = `Primary: ${moveConfig.label} • Secondary: ${subtypeConfig.label}`;
  const summaryActions = document.createElement('div');
  summaryActions.className = 'power-editor__wizard-summary-actions';
  const changeTypesBtn = document.createElement('button');
  changeTypesBtn.type = 'button';
  changeTypesBtn.className = 'btn-sm';
  changeTypesBtn.textContent = 'Change types';
  changeTypesBtn.addEventListener('click', () => {
    const index = (powerEditorState.steps || []).indexOf('type-select');
    if (index >= 0) goToWizardStep(index);
  });
  summaryActions.appendChild(changeTypesBtn);
  summaryBar.append(summaryText, summaryActions);

  const intro = document.createElement('p');
  intro.className = 'power-editor__wizard-helper';
  intro.textContent = 'Capture the cinematic beat your table should picture. This text appears on the power card to help everyone remember the story.';

  const working = powerEditorState.workingPower || {};
  const fields = document.createElement('div');
  fields.className = 'power-editor__wizard-description-fields';
  fields.style.display = 'flex';
  fields.style.flexDirection = 'column';
  fields.style.gap = 'var(--control-gap, 12px)';

  const descriptionArea = document.createElement('textarea');
  descriptionArea.rows = 4;
  descriptionArea.placeholder = 'What does unleashing this power look, sound, or feel like?';
  descriptionArea.value = working.description || '';
  descriptionArea.addEventListener('input', () => {
    working.description = descriptionArea.value;
  });
  const descriptionField = createFieldContainer('Description shown on the power card', descriptionArea, { minWidth: '100%' });
  fields.appendChild(descriptionField.wrapper);

  const specialArea = document.createElement('textarea');
  specialArea.rows = 3;
  specialArea.placeholder = 'Optional notes, riders, or reminders to highlight (optional).';
  specialArea.value = working.special || '';
  specialArea.addEventListener('input', () => {
    working.special = specialArea.value;
  });
  const specialField = createFieldContainer('Special notes (optional)', specialArea, { minWidth: '100%' });
  fields.appendChild(specialField.wrapper);

  wrapper.append(heading, summaryBar, intro, fields);

  const nav = createWizardNav({
    showBack: true,
    onBack: () => goToWizardStep(powerEditorState.stepIndex - 1),
    nextLabel: 'Continue to mechanics',
    onNext: () => {
      goToWizardStep(powerEditorState.stepIndex + 1);
    },
  });
  wrapper.appendChild(nav);
  container.appendChild(wrapper);

  const navNext = nav.querySelector('[data-wizard-next]');
  powerEditorState.wizardElements.descriptionNavNext = navNext || null;
}

function renderPowerWizardDetails(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'power-editor__wizard-step power-editor__wizard-step--details';
  const config = getSubtypeConfig(powerEditorState.moveType, powerEditorState.subtype);
  if (!config) {
    const info = document.createElement('p');
    info.textContent = 'Choose a subtype before editing details.';
    const nav = createWizardNav({
      showBack: true,
      onBack: () => goToWizardStep(powerEditorState.stepIndex - 1),
      nextLabel: 'Save',
      nextDisabled: true,
    });
    wrapper.append(info, nav);
    container.appendChild(wrapper);
    return;
  }
  const working = powerEditorState.workingPower || {};
  const moveConfig = getMoveTypeConfig(powerEditorState.moveType);
  if (config.showDamage) {
    if (typeof working.damageOptIn === 'undefined') {
      working.damageOptIn = !!working.damage;
    }
  } else {
    working.damageOptIn = false;
  }
  const summaryBar = document.createElement('div');
  summaryBar.className = 'power-editor__wizard-summary-bar';
  const summaryText = document.createElement('div');
  summaryText.className = 'power-editor__wizard-summary-text';
  summaryText.textContent = `Primary: ${moveConfig?.label || '—'} • Secondary: ${config.label}`;
  const summaryActions = document.createElement('div');
  summaryActions.className = 'power-editor__wizard-summary-actions';
  const changeTypesBtn = document.createElement('button');
  changeTypesBtn.type = 'button';
  changeTypesBtn.className = 'btn-sm';
  changeTypesBtn.textContent = 'Change types';
  changeTypesBtn.addEventListener('click', () => {
    const typeIndex = (powerEditorState.steps || []).indexOf('type-select');
    if (typeIndex >= 0) goToWizardStep(typeIndex);
  });
  const editDescriptionBtn = document.createElement('button');
  editDescriptionBtn.type = 'button';
  editDescriptionBtn.className = 'btn-sm';
  editDescriptionBtn.textContent = 'Edit description';
  editDescriptionBtn.addEventListener('click', () => {
    const descriptionIndex = (powerEditorState.steps || []).indexOf('description');
    if (descriptionIndex >= 0) goToWizardStep(descriptionIndex);
  });
  summaryActions.append(changeTypesBtn, editDescriptionBtn);
  summaryBar.append(summaryText, summaryActions);
  const helperText = document.createElement('p');
  helperText.className = 'power-editor__wizard-helper';
  helperText.textContent = 'Lock in the mechanical pieces: choose effects, dial in damage, and configure saves or resource costs.';
  wrapper.append(summaryBar, helperText);
  const fields = document.createElement('div');
  fields.className = 'power-editor__details-grid';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = working.name || '';
  nameInput.addEventListener('input', () => {
    working.name = nameInput.value.trim();
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Power Name', nameInput, { minWidth: '220px' }).wrapper);

  const styleSelect = document.createElement('select');
  setSelectOptions(styleSelect, POWER_STYLES, working.style, { includeEmpty: true });
  styleSelect.addEventListener('change', () => {
    working.style = styleSelect.value;
    if (working.damage && config.showDamage) {
      working.damage.type = defaultDamageType(working.style) || working.damage.type;
      updateDetailsDamageFields();
    }
  });
  fields.appendChild(createFieldContainer('Style', styleSelect, { minWidth: '200px' }).wrapper);

  const actionSelect = document.createElement('select');
  setSelectOptions(actionSelect, POWER_ACTION_TYPES, working.actionType || POWER_ACTION_TYPES[0]);
  actionSelect.addEventListener('change', () => {
    working.actionType = actionSelect.value;
  });
  fields.appendChild(createFieldContainer('Action Economy', actionSelect, { minWidth: '180px' }).wrapper);

  const intensitySelect = document.createElement('select');
  setSelectOptions(intensitySelect, POWER_INTENSITIES, working.intensity || (config.defaultIntensity || 'Core'));
  intensitySelect.addEventListener('change', () => {
    working.intensity = intensitySelect.value;
    if (!Number.isFinite(Number(working.spCost)) || Number(working.spCost) <= 0) {
      working.spCost = suggestSpCost(working.intensity);
      spInput.value = working.spCost;
    }
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Intensity', intensitySelect, { minWidth: '160px' }).wrapper);

  const shapeSelect = document.createElement('select');
  const shapeOptions = (config.shapes || []).filter(shape => POWER_TARGET_SHAPES.includes(shape));
  const allowedShapes = shapeOptions.length ? shapeOptions : POWER_TARGET_SHAPES;
  if (!allowedShapes.includes(working.shape)) {
    working.shape = allowedShapes[0];
  }
  setSelectOptions(shapeSelect, allowedShapes, working.shape);
  shapeSelect.addEventListener('change', () => {
    working.shape = shapeSelect.value;
    const settings = typeof getCharacterPowerSettings === 'function' ? getCharacterPowerSettings() : null;
    working.range = ensureRangeForShape(working.shape, working.range, settings);
    updateRangeOptions();
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Target Shape', shapeSelect, { minWidth: '160px' }).wrapper);

  const rangeSelect = document.createElement('select');
  const rangeQuickButtons = [];
  const updateRangeOptions = () => {
    const rangeOptions = getRangeOptionsForShape(working.shape);
    setSelectOptions(rangeSelect, rangeOptions, working.range || rangeOptions[0]);
    working.range = rangeSelect.value;
    updateRangeQuickActive();
  };
  const updateRangeQuickActive = () => {
    rangeQuickButtons.forEach(btn => {
      const value = btn.dataset.value;
      const active = value === working.range && (value !== 'Melee' || working.shape === 'Melee');
      if (active) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  };
  updateRangeOptions();
  rangeSelect.addEventListener('change', () => {
    working.range = rangeSelect.value;
    updateRangeQuickActive();
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Range', rangeSelect, { minWidth: '160px' }).wrapper);

  if (!rangeQuickButtons.length) {
    const quickWrapper = document.createElement('div');
    quickWrapper.className = 'power-editor__quick-pills';
    POWER_RANGE_QUICK_VALUES.forEach(value => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'power-editor__quick-pill';
      pill.textContent = value;
      pill.dataset.value = value;
      pill.setAttribute('aria-pressed', 'false');
      pill.addEventListener('click', () => {
        if (value === 'Melee') {
          working.shape = 'Melee';
        } else {
          if (working.shape === 'Melee') {
            working.shape = allowedShapes.includes('Ranged Single') ? 'Ranged Single' : allowedShapes[0];
          }
          if (!getRangeOptionsForShape(working.shape).includes(value)) {
            const matchingShape = allowedShapes.find(shape => getRangeOptionsForShape(shape).includes(value));
            if (matchingShape) {
              working.shape = matchingShape;
            }
          }
        }
        if (shapeSelect.value !== working.shape) {
          shapeSelect.value = working.shape;
          shapeSelect.dispatchEvent(new Event('change'));
        } else {
          updateRangeOptions();
        }
        const rangeOptions = getRangeOptionsForShape(working.shape);
        if (rangeOptions.includes(value)) {
          rangeSelect.value = value;
          rangeSelect.dispatchEvent(new Event('change'));
        }
        updateRangeQuickActive();
      });
      rangeQuickButtons.push(pill);
      quickWrapper.appendChild(pill);
    });
    const quickField = createFieldContainer('Quick range presets', quickWrapper, { minWidth: '100%' });
    quickField.label.classList.add('power-editor__quick-label');
    fields.appendChild(quickField.wrapper);
    updateRangeQuickActive();
  }

  const effectOptions = (config.effectTags || []).filter(tag => POWER_EFFECT_TAGS.includes(tag));
  const resolvedEffectOptions = effectOptions.length ? effectOptions : POWER_EFFECT_TAGS;
  if (!resolvedEffectOptions.includes(working.effectTag)) {
    working.effectTag = config.defaultEffect || resolvedEffectOptions[0];
  }
  const effectSelect = document.createElement('select');
  setSelectOptions(effectSelect, resolvedEffectOptions, working.effectTag);
  effectSelect.addEventListener('change', () => {
    working.effectTag = effectSelect.value;
    if (typeof updateDetailsDamageFields === 'function') {
      updateDetailsDamageFields();
    }
    if (typeof updateSaveVisibility === 'function') {
      updateSaveVisibility();
    }
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Primary Effect', effectSelect, { minWidth: '180px' }).wrapper);

  const secondarySelect = document.createElement('select');
  setSelectOptions(secondarySelect, POWER_EFFECT_TAGS, working.secondaryTag, { includeEmpty: true });
  secondarySelect.addEventListener('change', () => {
    const value = secondarySelect.value;
    working.secondaryTag = value || undefined;
  });
  fields.appendChild(createFieldContainer('Secondary Effect (optional)', secondarySelect, { minWidth: '200px' }).wrapper);

  const spInput = document.createElement('input');
  spInput.type = 'number';
  spInput.min = '1';
  spInput.value = Number.isFinite(Number(working.spCost)) ? Number(working.spCost) : suggestSpCost(working.intensity || 'Core');
  working.spCost = Number(spInput.value) || suggestSpCost(working.intensity || 'Core');
  spInput.addEventListener('input', () => {
    const value = Math.max(1, Math.floor(Number(spInput.value) || 1));
    spInput.value = value;
    working.spCost = value;
  });
  fields.appendChild(createFieldContainer('SP Cost', spInput, { minWidth: '120px' }).wrapper);

  let damageFieldsWrapper = null;
  let damageDiceSelect = null;
  let damageTypeSelect = null;
  let damageSaveSelect = null;
  let damageSaveHint = null;
  let damageSaveField = null;
  let damageToggleControl = null;

  if (config.showDamage) {
    const damageSection = document.createElement('div');
    damageSection.className = 'power-editor__wizard-damage';

    const damageToggle = document.createElement('label');
    damageToggle.className = 'power-editor__toggle';
    const damageToggleInput = document.createElement('input');
    damageToggleInput.type = 'checkbox';
    damageToggleInput.checked = working.damageOptIn !== false;
    damageToggleInput.addEventListener('change', () => {
      const enabled = damageToggleInput.checked;
      working.damageOptIn = enabled;
      if (!enabled) {
        working.damage = null;
      } else if (!working.damage || typeof working.damage !== 'object') {
        working.damage = {
          dice: damageDiceSelect?.value || POWER_DAMAGE_DICE[0],
          type: defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0],
          onSave: damageSaveSelect?.value || suggestOnSaveBehavior(working.effectTag),
        };
      }
      updateDetailsDamageFields();
      updatePowerEditorSaveState();
    });
    const damageToggleText = document.createElement('span');
    damageToggleText.textContent = 'Include Damage Package';
    damageToggle.append(damageToggleInput, damageToggleText);
    damageToggleControl = damageToggleInput;
    damageSection.appendChild(damageToggle);

    damageFieldsWrapper = document.createElement('div');
    damageFieldsWrapper.className = 'power-editor__damage-fields';

    damageDiceSelect = document.createElement('select');
    setSelectOptions(damageDiceSelect, POWER_DAMAGE_DICE, working.damage?.dice || POWER_DAMAGE_DICE[0]);
    damageDiceSelect.addEventListener('change', () => {
      if (!working.damage) working.damage = {};
      working.damage.dice = damageDiceSelect.value;
      updatePowerEditorSaveState();
    });
    damageFieldsWrapper.appendChild(createFieldContainer('Damage Dice', damageDiceSelect, { minWidth: '140px' }).wrapper);

    damageTypeSelect = document.createElement('select');
    const fallbackType = defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0];
    setSelectOptions(damageTypeSelect, POWER_DAMAGE_TYPES, working.damage?.type || fallbackType);
    damageTypeSelect.addEventListener('change', () => {
      if (!working.damage) working.damage = {};
      working.damage.type = damageTypeSelect.value;
    });
    damageFieldsWrapper.appendChild(createFieldContainer('Damage Type', damageTypeSelect, { minWidth: '160px' }).wrapper);

    damageSection.appendChild(damageFieldsWrapper);
    fields.appendChild(damageSection);
  }

  let saveToggle = null;
  let saveAbilitySelect = null;

  if (config.allowSave) {
    saveToggle = document.createElement('label');
    saveToggle.className = 'power-editor__toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!working.requiresSave;
    checkbox.addEventListener('change', () => {
      working.requiresSave = checkbox.checked;
      if (working.requiresSave && !POWER_SAVE_ABILITIES.includes(working.saveAbilityTarget)) {
        working.saveAbilityTarget = POWER_SAVE_ABILITIES[0];
      }
      updateSaveVisibility();
      updatePowerEditorSaveState();
    });
    const labelSpan = document.createElement('span');
    labelSpan.textContent = 'Requires Saving Throw';
    saveToggle.append(checkbox, labelSpan);
    fields.appendChild(saveToggle);

    saveAbilitySelect = document.createElement('select');
    setSelectOptions(saveAbilitySelect, POWER_SAVE_ABILITIES, working.saveAbilityTarget || POWER_SAVE_ABILITIES[0]);
    saveAbilitySelect.addEventListener('change', () => {
      working.saveAbilityTarget = saveAbilitySelect.value;
    });
    const saveAbilityField = createFieldContainer('Save Ability', saveAbilitySelect, { minWidth: '160px' });
    saveAbilityField.wrapper.dataset.powerEditorSaveAbility = 'true';
    fields.appendChild(saveAbilityField.wrapper);

    damageSaveSelect = document.createElement('select');
    const initialOnSave = working.damage?.onSave || suggestOnSaveBehavior(working.effectTag);
    setSelectOptions(damageSaveSelect, POWER_ON_SAVE_OPTIONS, initialOnSave);
    damageSaveSelect.addEventListener('change', () => {
      if (!working.damage || typeof working.damage !== 'object') {
        working.damage = {
          dice: working.damage?.dice || POWER_DAMAGE_DICE[0],
          type: working.damage?.type || defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0],
          onSave: damageSaveSelect.value,
        };
        working.damageOptIn = true;
        if (typeof updateDetailsDamageFields === 'function') {
          updateDetailsDamageFields();
        }
      } else {
        working.damage.onSave = damageSaveSelect.value;
      }
    });
    const damageSaveFieldContainer = createFieldContainer('On Save Effect', damageSaveSelect, { minWidth: '180px' });
    damageSaveFieldContainer.wrapper.dataset.powerEditorSaveOnEffect = 'true';
    damageSaveHint = document.createElement('div');
    damageSaveHint.style.fontSize = '12px';
    damageSaveHint.style.opacity = '0.8';
    damageSaveHint.style.minHeight = '14px';
    damageSaveFieldContainer.wrapper.appendChild(damageSaveHint);
    fields.appendChild(damageSaveFieldContainer.wrapper);
    damageSaveField = damageSaveFieldContainer;
  } else {
    working.requiresSave = false;
    delete working.saveAbilityTarget;
  }

  const durationSelect = document.createElement('select');
  setSelectOptions(durationSelect, POWER_DURATIONS, working.duration || POWER_DURATIONS[0]);
  durationSelect.addEventListener('change', () => {
    working.duration = durationSelect.value;
    if (working.duration === 'Sustained') {
      working.concentration = true;
    }
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Duration', durationSelect, { minWidth: '160px' }).wrapper);

  const concentrationLabel = document.createElement('label');
  concentrationLabel.className = 'power-editor__toggle';
  const concentrationToggle = document.createElement('input');
  concentrationToggle.type = 'checkbox';
  concentrationToggle.checked = !!working.concentration;
  concentrationToggle.addEventListener('change', () => {
    working.concentration = concentrationToggle.checked;
  });
  const concentrationSpan = document.createElement('span');
  concentrationSpan.textContent = 'Requires Concentration';
  concentrationLabel.append(concentrationToggle, concentrationSpan);
  fields.appendChild(concentrationLabel);

  const usesSelect = document.createElement('select');
  setSelectOptions(usesSelect, POWER_USES, working.uses || POWER_USES[0]);
  usesSelect.addEventListener('change', () => {
    working.uses = usesSelect.value;
    if (working.uses !== 'Cooldown') {
      working.cooldown = 0;
      cooldownInput.value = '0';
    } else if (!Number.isFinite(Number(working.cooldown)) || Number(working.cooldown) <= 0) {
      working.cooldown = 1;
      cooldownInput.value = '1';
    }
    updatePowerEditorSaveState();
  });
  fields.appendChild(createFieldContainer('Uses', usesSelect, { minWidth: '160px' }).wrapper);

  const cooldownInput = document.createElement('input');
  cooldownInput.type = 'number';
  cooldownInput.min = '0';
  cooldownInput.value = Number.isFinite(Number(working.cooldown)) ? Number(working.cooldown) : 0;
  cooldownInput.addEventListener('input', () => {
    const value = Math.max(0, Math.floor(Number(cooldownInput.value) || 0));
    cooldownInput.value = value;
    working.cooldown = value;
  });
  fields.appendChild(createFieldContainer('Cooldown (rounds)', cooldownInput, { minWidth: '160px' }).wrapper);

  const scalingSelect = document.createElement('select');
  setSelectOptions(scalingSelect, POWER_SCALING_OPTIONS, working.scaling || POWER_SCALING_OPTIONS[0]);
  scalingSelect.addEventListener('change', () => {
    working.scaling = scalingSelect.value;
  });
  fields.appendChild(createFieldContainer('Scaling', scalingSelect, { minWidth: '160px' }).wrapper);

  wrapper.appendChild(fields);

  const nav = createWizardNav({
    showBack: true,
    onBack: () => goToWizardStep(powerEditorState.stepIndex - 1),
    nextLabel: 'Review & Save',
    nextDisabled: !isPowerEditorValid(),
    onNext: () => {
      if (!isPowerEditorValid()) {
        updatePowerEditorSaveState();
        return;
      }
      goToWizardStep(powerEditorState.stepIndex + 1);
    },
  });
  wrapper.appendChild(nav);
  container.appendChild(wrapper);

  const navNext = nav.querySelector('[data-wizard-next]');
  powerEditorState.wizardElements.detailsNavNext = navNext || null;
  if (navNext) {
    navNext.disabled = !isPowerEditorValid();
  }

  powerEditorState.wizardElements.details = {
    saveAbilitySelect,
    saveToggle,
    damageFieldsWrapper,
    damageDiceSelect,
    damageTypeSelect,
    damageSaveSelect,
    damageSaveHint,
    damageSaveField,
    damageToggle: damageToggleControl,
    rangeQuickButtons,
    updateRangeQuickActive,
  };

  function updateSaveVisibility() {
    const { details } = powerEditorState.wizardElements;
    if (!details) return;
    const requiresSave = !!working.requiresSave;
    if (details.saveAbilitySelect) {
      const field = details.saveAbilitySelect.closest('[data-power-editor-save-ability]') || details.saveAbilitySelect.parentElement;
      if (field) {
        field.style.display = requiresSave ? '' : 'none';
      }
    }
    const hasDamage = working.damageOptIn !== false && !!working.damage;
    const showOnSave = requiresSave && hasDamage;
    if (details.damageSaveField?.wrapper) {
      details.damageSaveField.wrapper.style.display = showOnSave ? '' : 'none';
    } else if (details.damageSaveSelect) {
      const field = details.damageSaveSelect.closest('[data-power-editor-save-on-effect]') || details.damageSaveSelect.parentElement;
      if (field) {
        field.style.display = showOnSave ? '' : 'none';
      }
    }
    if (details.damageSaveSelect) {
      details.damageSaveSelect.disabled = !showOnSave;
      if (showOnSave) {
        const suggestion = suggestOnSaveBehavior(working.effectTag);
        if (!working.damage || typeof working.damage !== 'object') {
          working.damage = {
            dice: working.damage?.dice || POWER_DAMAGE_DICE[0],
            type: working.damage?.type || defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0],
            onSave: suggestion,
          };
        } else if (!POWER_ON_SAVE_OPTIONS.includes(working.damage.onSave)) {
          working.damage.onSave = suggestion;
        }
        details.damageSaveSelect.value = working.damage.onSave || suggestion;
        if (details.damageSaveHint) {
          details.damageSaveHint.textContent = `Suggested: ${suggestion}`;
        }
      } else if (details.damageSaveHint) {
        details.damageSaveHint.textContent = '';
      }
    }
  }

  function updateDetailsDamageFields() {
    if (!config.showDamage) return;
    const { details } = powerEditorState.wizardElements;
    if (!details) return;
    if (working.effectTag === 'Damage' && working.damageOptIn === false) {
      working.damageOptIn = true;
    }
    const enabled = working.damageOptIn !== false;
    if (details.damageFieldsWrapper) {
      details.damageFieldsWrapper.style.display = enabled ? '' : 'none';
    }
    if (details.damageToggle) {
      details.damageToggle.checked = enabled;
    }
    if (!enabled) {
      if (typeof updateSaveVisibility === 'function') {
        updateSaveVisibility();
      }
      return;
    }
    if (!working.damage || typeof working.damage !== 'object') {
      working.damage = {
        dice: working.damage?.dice || POWER_DAMAGE_DICE[0],
        type: working.damage?.type || defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0],
        onSave: working.damage?.onSave || suggestOnSaveBehavior(working.effectTag),
      };
    }
    if (details.damageDiceSelect && working.damage?.dice) {
      if (!POWER_DAMAGE_DICE.includes(working.damage.dice)) {
        working.damage.dice = POWER_DAMAGE_DICE[0];
      }
      details.damageDiceSelect.value = working.damage.dice;
    }
    if (details.damageTypeSelect && working.damage?.type) {
      const fallbackType = defaultDamageType(working.style) || POWER_DAMAGE_TYPES[0];
      if (!POWER_DAMAGE_TYPES.includes(working.damage.type)) {
        working.damage.type = fallbackType;
      }
      details.damageTypeSelect.value = working.damage.type;
    }
    const onSaveSuggestion = suggestOnSaveBehavior(working.effectTag);
    if (!POWER_ON_SAVE_OPTIONS.includes(working.damage.onSave)) {
      working.damage.onSave = onSaveSuggestion;
    }
    if (details.damageSaveSelect) {
      details.damageSaveSelect.value = working.damage.onSave;
    }
    if (typeof updateSaveVisibility === 'function') {
      updateSaveVisibility();
    }
  }

  updateDetailsDamageFields();

  powerEditorState.wizardElements.updateSaveVisibility = updateSaveVisibility;
  powerEditorState.wizardElements.updateDamageFields = updateDetailsDamageFields;
  updatePowerEditorSaveState();
}

function renderPowerWizardReview(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'power-editor__wizard-step power-editor__wizard-step--review';
  const moveConfig = getMoveTypeConfig(powerEditorState.moveType);
  const subtypeConfig = getSubtypeConfig(powerEditorState.moveType, powerEditorState.subtype);
  const working = powerEditorState.workingPower || {};
  const compiled = compilePowerEditorResult() || {};
  const valid = isPowerEditorValid();

  const heading = document.createElement('h4');
  heading.textContent = 'Review and confirm your power';
  wrapper.appendChild(heading);

  const summaryBar = document.createElement('div');
  summaryBar.className = 'power-editor__wizard-summary-bar';
  const summaryText = document.createElement('div');
  summaryText.className = 'power-editor__wizard-summary-text';
  summaryText.textContent = `Primary: ${moveConfig?.label || '—'} • Secondary: ${subtypeConfig?.label || '—'}`;
  const summaryActions = document.createElement('div');
  summaryActions.className = 'power-editor__wizard-summary-actions';

  const editTypesBtn = document.createElement('button');
  editTypesBtn.type = 'button';
  editTypesBtn.className = 'btn-sm';
  editTypesBtn.textContent = 'Edit types';
  editTypesBtn.addEventListener('click', () => {
    const index = (powerEditorState.steps || []).indexOf('type-select');
    if (index >= 0) goToWizardStep(index);
  });

  const editDescriptionBtn = document.createElement('button');
  editDescriptionBtn.type = 'button';
  editDescriptionBtn.className = 'btn-sm';
  editDescriptionBtn.textContent = 'Edit description';
  editDescriptionBtn.addEventListener('click', () => {
    const index = (powerEditorState.steps || []).indexOf('description');
    if (index >= 0) goToWizardStep(index);
  });

  const editDetailsBtn = document.createElement('button');
  editDetailsBtn.type = 'button';
  editDetailsBtn.className = 'btn-sm';
  editDetailsBtn.textContent = 'Adjust mechanics';
  editDetailsBtn.addEventListener('click', () => {
    const index = (powerEditorState.steps || []).indexOf('details');
    if (index >= 0) goToWizardStep(index);
  });

  summaryActions.append(editTypesBtn, editDescriptionBtn, editDetailsBtn);
  summaryBar.append(summaryText, summaryActions);
  wrapper.appendChild(summaryBar);

  const reviewGrid = document.createElement('div');
  reviewGrid.className = 'power-editor__review-grid';

  const addStat = (label, value) => {
    if (!value && value !== 0) return;
    const card = document.createElement('div');
    card.className = 'power-editor__review-card';
    const statLabel = document.createElement('span');
    statLabel.className = 'power-editor__review-label';
    statLabel.textContent = label;
    const statValue = document.createElement('span');
    statValue.className = 'power-editor__review-value';
    statValue.textContent = value;
    card.append(statLabel, statValue);
    reviewGrid.appendChild(card);
  };

  addStat('Power Name', compiled.name || 'Add a name');
  addStat('Primary Effect', compiled.effectTag || '—');
  addStat('Secondary Effect', compiled.secondaryTag || '—');
  addStat('Action Type', compiled.actionType || 'Action');
  addStat('Intensity', compiled.intensity || 'Core');
  addStat('SP Cost', compiled.spCost ? `${compiled.spCost} SP` : '—');
  addStat('Target Shape', compiled.shape || '—');

  const settings = typeof getCharacterPowerSettings === 'function' ? getCharacterPowerSettings() : null;
  const rangeDisplay = formatPowerRange(compiled, settings) || compiled.range || '—';
  addStat('Range', rangeDisplay);
  addStat('Duration', compiled.duration || 'Instant');
  addStat('Concentration', compiled.concentration ? 'Yes' : 'No');
  addStat('Uses', compiled.uses || 'At-will');
  if (compiled.uses === 'Cooldown') {
    addStat('Cooldown', `${compiled.cooldown || 0} rounds`);
  }
  if (compiled.requiresSave && compiled.saveAbilityTarget) {
    addStat('Saving Throw', `${compiled.saveAbilityTarget} Save`);
  }
  if (compiled.damage) {
    const includeSaveText = compiled.requiresSave && compiled.damage.onSave;
    const saveText = includeSaveText ? ` (${compiled.damage.onSave} on Save)` : '';
    addStat('Damage Package', `${compiled.damage.dice} ${compiled.damage.type}${saveText}`);
  } else if (working.damageOptIn === false) {
    addStat('Damage Package', 'Not included');
  }

  wrapper.appendChild(reviewGrid);

  const textColumns = document.createElement('div');
  textColumns.className = 'power-editor__review-columns';

  const descriptionCard = document.createElement('div');
  descriptionCard.className = 'power-editor__review-text';
  const descriptionLabel = document.createElement('h5');
  descriptionLabel.textContent = 'Description';
  const descriptionBody = document.createElement('p');
  descriptionBody.textContent = compiled.description ? compiled.description.trim() : 'Describe how this power looks and feels.';
  descriptionCard.append(descriptionLabel, descriptionBody);
  textColumns.appendChild(descriptionCard);

  const specialCard = document.createElement('div');
  specialCard.className = 'power-editor__review-text';
  const specialLabel = document.createElement('h5');
  specialLabel.textContent = 'Special Notes';
  const specialBody = document.createElement('p');
  specialBody.textContent = compiled.special ? compiled.special.trim() : 'Optional reminders or riders can live here.';
  specialCard.append(specialLabel, specialBody);
  textColumns.appendChild(specialCard);

  wrapper.appendChild(textColumns);

  const rulesPreview = composePowerRulesText(compiled, settings);
  if (rulesPreview) {
    const previewCard = document.createElement('div');
    previewCard.className = 'power-editor__review-preview';
    const previewLabel = document.createElement('h5');
    previewLabel.textContent = 'Card Preview';
    const previewBody = document.createElement('p');
    previewBody.textContent = rulesPreview;
    previewCard.append(previewLabel, previewBody);
    wrapper.appendChild(previewCard);
  }

  const issues = [];
  if (!working.name || !working.name.trim()) issues.push('Add a power name.');
  if (!powerEditorState.moveType || !powerEditorState.subtype) issues.push('Select a primary type and secondary focus.');
  if (!working.effectTag) issues.push('Choose a primary effect.');
  if (!working.shape || !working.range) issues.push('Confirm a target shape and range.');
  const config = getSubtypeConfig(powerEditorState.moveType, powerEditorState.subtype);
  const wantsDamage = config?.showDamage && working.damageOptIn !== false;
  if (wantsDamage && (!working.damage || !working.damage.dice || !working.damage.type)) {
    issues.push('Complete the damage package or turn it off.');
  }

  if (issues.length) {
    const warning = document.createElement('div');
    warning.className = 'power-editor__review-warning';
    const warningTitle = document.createElement('strong');
    warningTitle.textContent = 'Finish required steps:';
    const warningList = document.createElement('ul');
    issues.forEach(issue => {
      const item = document.createElement('li');
      item.textContent = issue;
      warningList.appendChild(item);
    });
    warning.append(warningTitle, warningList);
    wrapper.appendChild(warning);
  }

  container.appendChild(wrapper);

  const nav = createWizardNav({
    showBack: true,
    onBack: () => goToWizardStep(powerEditorState.stepIndex - 1),
    nextLabel: 'Finalize & Save',
    nextDisabled: !valid,
    onNext: () => {
      if (!isPowerEditorValid()) {
        updatePowerEditorSaveState();
        return;
      }
      handlePowerEditorSave();
    },
  });
  wrapper.appendChild(nav);
  const navNext = nav.querySelector('[data-wizard-next]');
  powerEditorState.wizardElements.reviewNavNext = navNext || null;
  powerEditorState.wizardElements.review = { grid: reviewGrid };
}

function createWizardNav({ showBack = false, onBack, nextLabel = 'Next', nextDisabled = false, onNext }) {
  const nav = document.createElement('div');
  nav.className = 'power-editor__wizard-nav';
  if (showBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-sm';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => {
      if (typeof onBack === 'function') onBack();
    });
    nav.appendChild(backBtn);
  }
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-sm btn-primary';
  nextBtn.textContent = nextLabel;
  nextBtn.dataset.wizardNext = 'true';
  nextBtn.disabled = !!nextDisabled;
  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return;
    if (typeof onNext === 'function') onNext();
  });
  nav.appendChild(nextBtn);
  return nav;
}

function isPowerEditorValid() {
  const working = powerEditorState.workingPower;
  const moveType = powerEditorState.moveType;
  const subtype = powerEditorState.subtype;
  if (!working || !moveType || !subtype) return false;
  if (!working.name || !working.name.trim()) return false;
  if (!working.effectTag) return false;
  if (!working.shape || !working.range) return false;
  const config = getSubtypeConfig(moveType, subtype);
  const wantsDamage = config?.showDamage && working.damageOptIn !== false;
  if (wantsDamage) {
    if (!working.damage || !POWER_DAMAGE_DICE.includes(working.damage.dice) || !POWER_DAMAGE_TYPES.includes(working.damage.type)) {
      return false;
    }
  }
  if (config?.allowSave && working.requiresSave && !POWER_SAVE_ABILITIES.includes(working.saveAbilityTarget)) {
    return false;
  }
  return true;
}

function updatePowerEditorSaveState() {
  const { saveButton, steps, stepIndex } = powerEditorState;
  if (!saveButton) return;
  const stepKey = steps?.[stepIndex];
  const isDetailsStep = stepKey === 'details';
  const isReviewStep = stepKey === 'review';
  const valid = isPowerEditorValid();
  saveButton.disabled = !isReviewStep || !valid;
  if (saveButton.disabled) {
    saveButton.setAttribute('aria-disabled', 'true');
  } else {
    saveButton.removeAttribute('aria-disabled');
  }
  const nextButton = powerEditorState.wizardElements?.detailsNavNext;
  if (nextButton) {
    nextButton.disabled = !valid;
  }
  const reviewNext = powerEditorState.wizardElements?.reviewNavNext;
  if (reviewNext) {
    reviewNext.disabled = !valid;
  }
}

function compilePowerEditorResult() {
  const working = powerEditorState.workingPower;
  if (!working) return null;
  const cloned = clonePowerForEditor(working);
  if (cloned.damage) {
    cloned.damage = { ...cloned.damage };
  } else {
    delete cloned.damage;
  }
  delete cloned.damageOptIn;
  if (!cloned.secondaryTag) {
    delete cloned.secondaryTag;
  }
  if (!cloned.requiresSave) {
    cloned.requiresSave = false;
    delete cloned.saveAbilityTarget;
  }
  cloned.name = (cloned.name || '').trim();
  cloned.cooldown = Math.max(0, Math.floor(Number(cloned.cooldown) || 0));
  cloned.spCost = Math.max(1, Math.floor(Number(cloned.spCost) || suggestSpCost(cloned.intensity || 'Core')));
  if (!POWER_INTENSITIES.includes(cloned.intensity)) {
    cloned.intensity = 'Core';
  }
  if (!POWER_ACTION_TYPES.includes(cloned.actionType)) {
    cloned.actionType = POWER_ACTION_TYPES[0];
  }
  if (!POWER_USES.includes(cloned.uses)) {
    cloned.uses = POWER_USES[0];
  }
  if (!POWER_TARGET_SHAPES.includes(cloned.shape)) {
    cloned.shape = 'Ranged Single';
  }
  if (!cloned.range) {
    const settings = typeof getCharacterPowerSettings === 'function' ? getCharacterPowerSettings() : null;
    cloned.range = ensureRangeForShape(cloned.shape, '', settings);
  }
  if (!POWER_DURATIONS.includes(cloned.duration)) {
    cloned.duration = POWER_DURATIONS[0];
  }
  return cloned;
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
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-sm power-card__summary-roll-btn';
    button.textContent = label;
    button.setAttribute('aria-hidden', 'true');
    const result = document.createElement('span');
    result.className = 'pill result power-card__roll-output';
    result.dataset.placeholder = label;
    result.setAttribute('aria-hidden', 'true');
    wrap.append(button, result);
    summaryRolls.appendChild(wrap);
    return { button, result, wrap };
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
  elements.summaryRollHitWrapper = summaryAttack.wrap;
  elements.summaryHitResult = summaryAttack.result;
  elements.summaryRollDamage = summaryDamage.button;
  elements.summaryRollDamageWrapper = summaryDamage.wrap;
  elements.summaryDamageResult = summaryDamage.result;
  elements.summaryRollSave = summarySave.button;
  elements.summaryRollSaveWrapper = summarySave.wrap;
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

  const damageSaveSelect = document.createElement('select');
  const initialOnSave = power.damage?.onSave || suggestOnSaveBehavior(power.effectTag);
  setSelectOptions(damageSaveSelect, POWER_ON_SAVE_OPTIONS, initialOnSave);
  const damageSaveField = createFieldContainer('On Save Effect', damageSaveSelect, { flex: '1', minWidth: '140px' });
  const damageSaveHint = document.createElement('div');
  damageSaveHint.style.fontSize = '12px';
  damageSaveHint.style.opacity = '0.8';
  damageSaveHint.style.minHeight = '14px';
  damageSaveField.wrapper.appendChild(damageSaveHint);
  saveRow.appendChild(damageSaveField.wrapper);

  damageSaveSelect.addEventListener('change', () => {
    if (!power.damage) {
      power.damage = {
        dice: damageDiceSelect.value || POWER_DAMAGE_DICE[0],
        type: damageTypeSelect.value || defaultDamageType(power.style) || POWER_DAMAGE_TYPES[0],
        onSave: damageSaveSelect.value,
      };
      damageToggle.checked = true;
      damageFields.style.display = 'flex';
    } else {
      power.damage.onSave = damageSaveSelect.value;
    }
    state.manualOnSave = true;
    updatePowerCardDerived(card);
  });

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
  descriptionArea.removeAttribute('maxlength');
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
  const onSaveQuick = createQuickField('On Save Effect');
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
    if (!power.requiresSave) {
      power.requiresSave = true;
      requiresSaveToggle.checked = true;
    }
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
  elements.damageSaveField = damageSaveField;
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
      hideMenu();
      openPowerCreationWizard({ mode: 'create', power: clonePresetData(data), target: 'powers' });
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
        { tag: 'select', f: 'slot', style: 'max-width:140px', options: ['Body','Head','Shield','Accessory','Other'], default: 'Body' },
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
  },
  medal: {
    rows: [
      {
        class: 'inline',
        fields: [
          { f: 'name', placeholder: 'Medal or Citation Name' },
          { f: 'awardedAt', placeholder: 'Awarded On', type: 'date', style: 'max-width:170px' }
        ]
      },
      {
        class: 'inline',
        fields: [
          { f: 'awardedBy', placeholder: 'Presented By', style: 'max-width:220px' },
          { f: 'artwork', placeholder: 'Icon or Artwork URL' }
        ]
      },
      { tag: 'textarea', f: 'description', placeholder: 'Citation, story, or flavor text', rows: 3 }
    ]
  }
};

const medalDisplayRefs = new WeakMap();

function generateMedalId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `medal-${timestamp}-${random}`;
}

function normalizeMedalDateValue(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { raw: '', input: '' };
  const dateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return { raw, input: dateMatch[1] };
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const iso = parsed.toISOString();
    return { raw: iso, input: iso.slice(0, 10) };
  }
  return { raw, input: '' };
}

function prepareMedalPref(pref = {}) {
  const clone = { ...(pref || {}) };
  const normalizedName = typeof clone.name === 'string' ? clone.name : '';
  const normalizedDescription = typeof clone.description === 'string' ? clone.description : '';
  const normalizedArtwork = typeof clone.artwork === 'string' ? clone.artwork : '';
  const normalizedAwarder = typeof clone.awardedBy === 'string' ? clone.awardedBy : '';
  const { raw: rawDate, input: inputDate } = normalizeMedalDateValue(
    clone.awardedAt || clone.awardedOn || clone.date || ''
  );
  const id = typeof clone.id === 'string' && clone.id.trim()
    ? clone.id.trim()
    : generateMedalId();
  return {
    pref: {
      ...clone,
      id,
      name: normalizedName,
      description: normalizedDescription,
      artwork: normalizedArtwork,
      awardedBy: normalizedAwarder,
      awardedAt: inputDate,
    },
    rawDate,
  };
}

function initializeMedalCard(card) {
  if (!card) return;
  card.classList.add('card--medal');
  const header = document.createElement('div');
  header.className = 'medal-card__header';
  const iconWrap = document.createElement('div');
  iconWrap.className = 'medal-card__icon';
  const iconImg = document.createElement('img');
  iconImg.className = 'medal-card__icon-img';
  iconImg.alt = '';
  iconImg.decoding = 'async';
  iconImg.loading = 'eager';
  iconImg.hidden = true;
  const iconFallback = document.createElement('span');
  iconFallback.className = 'medal-card__icon-fallback';
  iconFallback.textContent = '🏅';
  iconWrap.appendChild(iconImg);
  iconWrap.appendChild(iconFallback);
  header.appendChild(iconWrap);
  const meta = document.createElement('div');
  meta.className = 'medal-card__meta';
  const title = document.createElement('span');
  title.className = 'medal-card__title';
  title.textContent = 'Medal';
  const details = document.createElement('span');
  details.className = 'medal-card__details';
  details.dataset.empty = 'true';
  details.textContent = 'Details pending';
  meta.appendChild(title);
  meta.appendChild(details);
  header.appendChild(meta);
  const flavor = document.createElement('p');
  flavor.className = 'medal-card__flavor';
  flavor.dataset.empty = 'true';
  flavor.textContent = 'No citation recorded yet.';
  card.appendChild(header);
  card.appendChild(flavor);
  iconImg.addEventListener('error', () => {
    iconImg.hidden = true;
    iconImg.removeAttribute('src');
    iconFallback.hidden = false;
  });
  iconImg.addEventListener('load', () => {
    iconImg.hidden = false;
    iconFallback.hidden = true;
  });
  medalDisplayRefs.set(card, {
    title,
    details,
    flavor,
    iconImg,
    iconFallback,
  });
}

function updateMedalCardDisplay(card) {
  const refs = medalDisplayRefs.get(card);
  if (!refs) return;
  const nameField = qs("[data-f='name']", card);
  const descriptionField = qs("[data-f='description']", card);
  const dateField = qs("[data-f='awardedAt']", card);
  const rawDateField = qs("[data-f='awardedAtRaw']", card);
  const awarderField = qs("[data-f='awardedBy']", card);
  const artworkField = qs("[data-f='artwork']", card);
  const name = nameField && typeof nameField.value === 'string' && nameField.value.trim()
    ? nameField.value.trim()
    : 'Medal';
  refs.title.textContent = name;
  const description = descriptionField && typeof descriptionField.value === 'string'
    ? descriptionField.value.trim()
    : '';
  refs.flavor.textContent = description || 'No citation recorded yet.';
  refs.flavor.dataset.empty = description ? 'false' : 'true';
  const rawDate = rawDateField && typeof rawDateField.value === 'string'
    ? rawDateField.value.trim()
    : '';
  const dateValue = dateField && typeof dateField.value === 'string'
    ? dateField.value.trim()
    : '';
  let dateLabel = '';
  const displaySource = rawDate || dateValue;
  if (displaySource) {
    const parsed = new Date(displaySource);
    if (!Number.isNaN(parsed.getTime())) {
      dateLabel = parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(displaySource)) {
      dateLabel = displaySource;
    } else {
      dateLabel = displaySource;
    }
  }
  const awarder = awarderField && typeof awarderField.value === 'string'
    ? awarderField.value.trim()
    : '';
  const detailParts = [];
  if (dateLabel) detailParts.push(dateLabel);
  if (awarder) detailParts.push(`by ${awarder}`);
  refs.details.textContent = detailParts.length ? detailParts.join(' • ') : 'Details pending';
  refs.details.dataset.empty = detailParts.length ? 'false' : 'true';
  const artwork = artworkField && typeof artworkField.value === 'string'
    ? artworkField.value.trim()
    : '';
  if (artwork) {
    refs.iconFallback.hidden = true;
    refs.iconImg.hidden = false;
    refs.iconImg.src = artwork;
  } else {
    refs.iconImg.hidden = true;
    refs.iconImg.removeAttribute('src');
    refs.iconFallback.hidden = false;
    const fallbackChar = name.charAt(0);
    refs.iconFallback.textContent = fallbackChar ? fallbackChar.toUpperCase() : '🏅';
  }
}

const elMedalList = $('medals');
const elMedalEmpty = $('medal-empty');
const elMedalSummary = $('medal-summary');

function updateMedalSummary() {
  if (!elMedalSummary) return;
  const count = elMedalList ? elMedalList.querySelectorAll("[data-kind='medal']").length : 0;
  elMedalSummary.textContent = count === 1 ? '1 Medal' : `${count} Medals`;
  if (elMedalSummary.dataset) {
    elMedalSummary.dataset.count = String(count);
  }
}

function updateMedalEmptyState() {
  if (!elMedalEmpty) return;
  const hasMedal = !!(elMedalList && elMedalList.querySelector('.card'));
  elMedalEmpty.hidden = hasMedal;
}

function updateMedalIndicators() {
  updateMedalSummary();
  updateMedalEmptyState();
}

updateMedalIndicators();

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

function applyCardDmLockState(card, locked){
  if (!card) return;
  const isLocked = !!locked;
  if (isLocked) {
    card.dataset.dmLock = 'true';
  } else {
    delete card.dataset.dmLock;
  }
  let badge = card.querySelector('[data-role="dm-lock-tag"]');
  if (isLocked) {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'pill';
      badge.dataset.role = 'dm-lock-tag';
      badge.textContent = 'DM Locked';
      card.insertBefore(badge, card.firstChild || null);
    }
    badge.hidden = false;
  } else if (badge) {
    badge.remove();
  }
  card.classList.toggle('card--dm-locked', isLocked);
  const shouldDisable = isLocked && !isDmSessionActive();
  const inputs = card.querySelectorAll('input,select,textarea');
  inputs.forEach(input => {
    if (shouldDisable) {
      if (!input.dataset.dmLockDisabled) {
        input.dataset.dmLockDisabled = input.disabled ? 'preserve' : 'locked';
      }
      input.disabled = true;
    } else if (input.dataset.dmLockDisabled) {
      if (input.dataset.dmLockDisabled === 'locked') {
        input.disabled = false;
      }
      delete input.dataset.dmLockDisabled;
    }
  });
  const delBtn = card.querySelector('[data-act="del"]');
  if (delBtn) {
    if (shouldDisable) {
      if (!delBtn.dataset.dmLockHidden) {
        delBtn.dataset.dmLockHidden = delBtn.hidden ? 'preserve' : 'locked';
      }
      delBtn.hidden = true;
    } else if (delBtn.dataset.dmLockHidden) {
      if (delBtn.dataset.dmLockHidden === 'locked') {
        delBtn.hidden = false;
      }
      delete delBtn.dataset.dmLockHidden;
    }
  }
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
  if (card?.dataset?.kind === 'medal') {
    updateMedalCardDisplay(card);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'dmLock')) {
    applyCardDmLockState(card, data.dmLock);
  }
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
  const dmLock = !!pref.dmLock;
  let medalMeta = null;
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
  if (kind === 'medal') {
    medalMeta = prepareMedalPref(pref);
    pref = medalMeta.pref;
  }
  const cfg = CARD_CONFIG[kind];
  const isMedalCard = kind === 'medal';
  const card = document.createElement(isMedalCard ? 'li' : 'div');
  card.className = 'card';
  card.draggable = !isMedalCard;
  card.dataset.kind = kind;
  if (isMedalCard) {
    initializeMedalCard(card);
  }
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
          const hasPrefValue = Object.prototype.hasOwnProperty.call(pref, f.f);
          let normalizedValue = '';
          if (hasPrefValue) {
            const rawValue = pref[f.f];
            normalizedValue = rawValue === null || rawValue === undefined
              ? ''
              : String(rawValue);
          } else if (f.default !== undefined && f.default !== null) {
            normalizedValue = String(f.default);
          }
          if (normalizedValue) {
            const hasOption = Array.from(sel.options).some(option => option.value === normalizedValue);
            if (!hasOption) {
              sel.add(new Option(normalizedValue, normalizedValue));
            }
            sel.value = normalizedValue;
          } else {
            sel.value = '';
          }
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
  if (kind === 'medal') {
    const idInput = document.createElement('input');
    idInput.type = 'hidden';
    idInput.dataset.f = 'id';
    idInput.value = pref.id || '';
    card.appendChild(idInput);
    const rawDateInput = document.createElement('input');
    rawDateInput.type = 'hidden';
    rawDateInput.dataset.f = 'awardedAtRaw';
    rawDateInput.value = medalMeta?.rawDate || pref.awardedAt || '';
    card.appendChild(rawDateInput);
  }
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
      toast(`${HAMMERSPACE_POWER_NAME} cannot be deleted`, 'error');
      return;
    }
    const name = qs("[data-f='name']", card)?.value || kind;
    logAction(`${kind.charAt(0).toUpperCase()+kind.slice(1)} removed: ${name}`);
    card.remove();
    if (cfg.onDelete) cfg.onDelete();
    if (isGearKind(kind)) updateCreditsGearSummary();
    if (kind === 'medal') updateMedalIndicators();
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
  if (kind === 'medal') {
    const dateField = qs("[data-f='awardedAt']", card);
    const rawDateField = qs("[data-f='awardedAtRaw']", card);
    const syncRawDate = () => {
      if (!rawDateField) return;
      const value = dateField && typeof dateField.value === 'string'
        ? dateField.value.trim()
        : '';
      rawDateField.value = value || '';
      updateMedalCardDisplay(card);
    };
    if (dateField) {
      dateField.addEventListener('input', syncRawDate);
      dateField.addEventListener('change', syncRawDate);
    }
    qsa('input[data-f],textarea[data-f],select[data-f]', card).forEach(el => {
      if (el.type === 'hidden') return;
      if (el === dateField) return;
      const update = () => updateMedalCardDisplay(card);
      el.addEventListener('input', update);
      el.addEventListener('change', update);
    });
    updateMedalCardDisplay(card);
  }
  if (dmLock) {
    applyCardDmLockState(card, true);
  }
  if (mode === 'view') applyViewLockState(card);
  return card;
}

$('add-sig').addEventListener('click', event => {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  openPowerCreationWizard({ mode: 'create', power: { signature: true }, target: 'sigs' });
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
['powers','sigs','weapons','armors','items','medals'].forEach(enableDragReorder);

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
    const dmLock = !!entry.dmLock;
    return {
      kind: 'weapon',
      listId: 'weapons',
      data: {
        name,
        damage: damageParts.join(' — '),
        ...(range ? { range } : {}),
        dmLock,
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
    const dmLock = !!entry.dmLock;
    return {
      kind: 'armor',
      listId: 'armors',
      data: {
        name: nameParts.length ? `${name} — ${nameParts.join(' — ')}` : name,
        slot,
        bonus: Number.isFinite(bonusValue) ? bonusValue : 0,
        equipped: true,
        dmLock,
      }
    };
  }
  const notes = buildItemNotes(entry);
  const qty = Number.isFinite(entry.qty) && entry.qty > 0 ? entry.qty : 1;
  const dmLock = !!entry.dmLock;
  return {
    kind: 'item',
    listId: 'items',
    data: {
      name,
      notes,
      qty,
      dmLock,
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
let hasOpenedCatalogModal = false;
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
const catalogRenderContext = { onAdd: () => {} };
const catalogVirtualList = createVirtualizedList(catalogListEl, {
  scrollContainer: catalogListEl,
  estimateItemHeight: 108,
  initialRenderCount: 8,
  getItemKey: (entry, index) => getCatalogVirtualKey(entry, index),
  measureScrollFps: true,
  fpsThreshold: 5000,
  onMetrics: metrics => {
    if (typeof window !== 'undefined') {
      window.__ccVirtualMetrics = window.__ccVirtualMetrics || {};
      window.__ccVirtualMetrics.catalog = metrics;
    }
  },
  renderItem: (entry, renderContext) => renderCatalogVirtualItem(entry, renderContext),
});
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
  const storage = getLocalStorageSafe();
  if (!storage) return [];
  try {
    const raw = storage.getItem(CUSTOM_CATALOG_KEY);
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
  const storage = getLocalStorageSafe();
  if (storage) {
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
      storage.setItem(CUSTOM_CATALOG_KEY, JSON.stringify(toSave));
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

function invalidateCatalogCache() {
  catalogData = null;
  catalogPromise = null;
  catalogError = null;
  catalogPriceEntries = [];
  catalogPriceIndex = new Map();
  rebuildCatalogPriceIndex();
  catalogFiltersInitialized = false;
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
  const compactSubTier = subTierLabel ? subTierLabel.replace(/\s+/g, ' ').trim() : '';
  const tierBase = Number.isFinite(tierNumber) ? `Tier ${tierNumber}` : '';
  const tierJoiner = compactSubTier && /^[A-Za-z]$/.test(compactSubTier) ? '' : ' ';
  const tierShort = tierBase
    ? `${tierBase}${compactSubTier ? `${tierJoiner}${compactSubTier}` : ''}`.trim()
    : compactSubTier;
  const levelSummaryParts = [];
  if (Number.isFinite(levelNumber)) levelSummaryParts.push(`Level ${levelNumber}`);
  if (tierShort) levelSummaryParts.push(tierShort);
  const levelSummary = levelSummaryParts.join(' – ');
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
  addTokens(tierShort);
  if (Number.isFinite(tierNumber)) {
    addTokens(`Tier ${tierNumber}`);
    addTokens(String(tierNumber));
  }
  if (Number.isFinite(tierValue)) addTokens(String(tierValue));
  addTokens(levelLabel);
  addTokens(levelSummary);
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
  if (tierShort) setAttr('tier short', tierShort);
  if (Number.isFinite(tierNumber)) {
    setAttr('tier level', `Tier ${tierNumber}`);
    setAttr('tier number', String(tierNumber));
  }
  if (Number.isFinite(tierValue)) {
    setAttr('tier rank', String(tierValue));
  }
  if (levelSummary) setAttr('level summary', levelSummary);
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

function getCatalogVirtualKey(entry, index){
  if (!entry) return `catalog-${index}`;
  if (entry.customId) return `custom:${entry.customId}`;
  if (entry.dmEntry && entry.id) return `dm:${entry.id}`;
  if (entry.id) return String(entry.id);
  const section = (entry.section || 'gear').toLowerCase();
  const type = (entry.type || '').toLowerCase();
  const name = (entry.name || `item-${index}`).toLowerCase();
  return `${section}:${type}:${name}:${index}`;
}

function renderCatalogVirtualItem(entry, { placeholder, context, index } = {}){
  if (!entry || !placeholder) return null;
  const card = document.createElement('div');
  card.className = 'catalog-item';

  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.textContent = entry.tier || '—';

  const info = document.createElement('div');
  const nameEl = document.createElement('b');
  nameEl.textContent = entry.name || 'Item';
  info.appendChild(nameEl);

  const metaSpan = document.createElement('span');
  metaSpan.className = 'small';
  const metaParts = [`— ${entry.section || 'Gear'}`];
  if (entry.type) metaParts.push(` • ${entry.type}`);
  const priceText = formatPriceNote(entry);
  if (priceText) metaParts.push(` • ${priceText}`);
  metaSpan.textContent = metaParts.join('');
  info.appendChild(metaSpan);

  const details = [];
  if (entry.perk) details.push(entry.perk);
  if (entry.use) details.push(`Use: ${entry.use}`);
  if (entry.attunement) details.push(`Attunement: ${entry.attunement}`);
  if (entry.description) details.push(entry.description);
  if (entry.dmRecipient) details.push(`Recipient: ${entry.dmRecipient}`);
  if (entry.dmEntry) details.push('DM catalog entry');
  if (entry.dmLock) details.push('Locked by DM');
  details.forEach(detail => {
    const detailEl = document.createElement('div');
    detailEl.className = 'small';
    detailEl.textContent = detail;
    info.appendChild(detailEl);
  });

  const actions = document.createElement('div');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-sm';
  addBtn.textContent = 'Add';
  addBtn.dataset.focusId = 'catalog-add';
  addBtn.setAttribute('data-view-allow', '');
  if (entry.dmLock) addBtn.dataset.dmLock = 'true';
  if (entry.dmEntry) addBtn.dataset.dmEntry = 'true';
  if (Number.isFinite(index)) {
    addBtn.dataset.add = String(index);
  } else if (addBtn.dataset) {
    delete addBtn.dataset.add;
  }
  addBtn.addEventListener('click', () => {
    if (context && typeof context.onAdd === 'function') {
      context.onAdd(entry);
    }
  });
  actions.appendChild(addBtn);

  card.append(pill, info, actions);

  if (typeof placeholder.replaceChildren === 'function') {
    placeholder.replaceChildren(card);
  } else {
    placeholder.innerHTML = '';
    placeholder.appendChild(card);
  }
  return card;
}

function renderCatalog(){
  if (!catalogListEl) return;
  const visibleCustom = getVisibleCustomCatalogEntries();
  if (catalogError && !visibleCustom.length) {
    catalogListEl.hidden = false;
    catalogVirtualList.showMessage('Failed to load gear catalog.', { tone: 'error' });
    return;
  }
  const baseLoaded = Array.isArray(catalogData);
  if (!baseLoaded && !visibleCustom.length) {
    catalogListEl.hidden = false;
    catalogVirtualList.showMessage('Loading gear catalog...');
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
    catalogListEl.hidden = false;
    catalogVirtualList.showMessage('No matching gear found.');
    return;
  }
  catalogListEl.hidden = false;
  catalogRenderContext.onAdd = handleCatalogEntryAdd;
  catalogVirtualList.update(rows, catalogRenderContext);
  catalogVirtualList.refresh(catalogRenderContext);
}

function handleCatalogEntryAdd(entry){
  if (!entry) return;
  if (entry.dmLock && !isDmSessionActive()) {
    toast('This entry is locked by the DM.', 'error');
    return;
  }
  if (!tryPurchaseEntry(entry)) return;
  addEntryToSheet(entry);
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

registerContentRefreshTask(async () => {
  invalidateCatalogCache();
  try {
    await ensureCatalog();
  } catch (err) {
    console.warn('Gear catalog refresh failed', err);
  }
});

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
  hasOpenedCatalogModal = true;
  show('modal-catalog');
  renderCatalog();
  ensureCatalog().then(() => {
    applyPendingCatalogFilters();
    renderCatalog();
  }).catch(() => {
    toast('Failed to load gear catalog', 'error');
    pendingCatalogFilters = null;
    renderCatalog();
  }).finally(() => {
    queueCatalogIdlePrefetch();
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

const shouldScheduleBackgroundPreloads = !(
  typeof process !== 'undefined'
  && process?.env?.NODE_ENV === 'test'
);

const backgroundPreloadTasks = [];
let rulesIdlePrefetchQueued = false;
let catalogIdlePrefetchQueued = false;

function queueRulesIdlePrefetch() {
  if (!hasOpenedRulesModal || rulesIdlePrefetchQueued || !shouldScheduleBackgroundPreloads) return;
  rulesIdlePrefetchQueued = true;
  backgroundPreloadTasks.push(() => rulesLoadPromise || renderRules());
  scheduleBackgroundPreloads();
}

function queueCatalogIdlePrefetch() {
  if (!hasOpenedCatalogModal || catalogIdlePrefetchQueued || !shouldScheduleBackgroundPreloads) return;
  catalogIdlePrefetchQueued = true;
  backgroundPreloadTasks.push(() => {
    if (catalogData) return null;
    return catalogPromise || ensureCatalog();
  });
  scheduleBackgroundPreloads();
}

function runBackgroundPreloads() {
  if (!shouldScheduleBackgroundPreloads || !backgroundPreloadTasks.length) return;
  while (backgroundPreloadTasks.length) {
    const task = backgroundPreloadTasks.shift();
    if (typeof task !== 'function') {
      continue;
    }
    try {
      const result = task();
      if (result && typeof result.then === 'function') {
        result.catch(err => console.warn('Background preload failed', err));
      }
    } catch (err) {
      console.warn('Background preload failed', err);
    }
  }
}

function scheduleBackgroundPreloads() {
  if (!shouldScheduleBackgroundPreloads || !backgroundPreloadTasks.length) return;
  const runTasks = () => runBackgroundPreloads();
  if (typeof window !== 'undefined') {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => runTasks(), { timeout: 2000 });
    } else {
      window.setTimeout(runTasks, 300);
    }
  } else {
    setTimeout(runTasks, 300);
  }
}

if (shouldScheduleBackgroundPreloads) {
  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    scheduleBackgroundPreloads();
  } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', scheduleBackgroundPreloads, { once: true });
  } else {
    scheduleBackgroundPreloads();
  }
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

const ENCOUNTER_ROSTER_STORAGE_KEY = 'enc-roster';
const roster = normalizeEncounterRoster(safeParse(ENCOUNTER_ROSTER_STORAGE_KEY));
const ENCOUNTER_PRESET_STORAGE_KEY = 'encounter-presets';
const ENCOUNTER_ROUND_STORAGE_KEY = 'enc-round';
const ENCOUNTER_TURN_STORAGE_KEY = 'enc-turn';

function readEncounterNumber(key, fallback){
  const storage = getLocalStorageSafe();
  if (!storage) return fallback;
  try {
    const value = Number(storage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  } catch (error) {
    console.warn('Failed to read encounter value from storage', error);
    return fallback;
  }
}
let round = readEncounterNumber(ENCOUNTER_ROUND_STORAGE_KEY, 1);
if (!Number.isFinite(round) || round < 1) round = 1;
let turn = readEncounterNumber(ENCOUNTER_TURN_STORAGE_KEY, 0);
if (!Number.isFinite(turn) || turn < 0) turn = 0;

function writeEncounterValue(key, value){
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch (error) {
    console.warn('Failed to persist encounter value', error);
  }
}

function saveEnc(){
  writeEncounterValue(ENCOUNTER_ROSTER_STORAGE_KEY, JSON.stringify(roster));
  writeEncounterValue(ENCOUNTER_ROUND_STORAGE_KEY, String(round));
  writeEncounterValue(ENCOUNTER_TURN_STORAGE_KEY, String(turn));
}

function createSerializableEncounterStateFromSource(source = {}) {
  const baseRoster = Array.isArray(source?.roster) ? source.roster : [];
  const normalizedRoster = normalizeEncounterRoster(baseRoster);
  const sanitizedRoster = normalizedRoster.map((entry, idx) => ({
    id: typeof entry?.id === 'string' && entry.id ? entry.id : generateEncounterId(idx),
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
  const baseRound = Number.isFinite(Number(source?.round)) ? Math.floor(Number(source.round)) : 1;
  const safeRound = Math.max(1, baseRound);
  const baseTurn = Number.isFinite(Number(source?.turn)) ? Math.floor(Number(source.turn)) : 0;
  const safeTurn = sanitizedRoster.length
    ? Math.min(Math.max(0, baseTurn), sanitizedRoster.length - 1)
    : 0;
  return {
    round: safeRound,
    turn: safeTurn,
    roster: sanitizedRoster,
  };
}

function getSerializableEncounterState(){
  return createSerializableEncounterStateFromSource({ round, turn, roster });
}

function normalizeEncounterPresetEntry(entry){
  if (!entry || typeof entry !== 'object') return null;
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!name) return null;
  const encounterSource = (entry.encounter && typeof entry.encounter === 'object')
    ? entry.encounter
    : entry.state && typeof entry.state === 'object'
      ? entry.state
      : {
          round: entry.round,
          turn: entry.turn,
          roster: entry.roster,
        };
  const encounter = createSerializableEncounterStateFromSource(encounterSource);
  return { name, encounter };
}

function loadEncounterPresetsFromStorage(){
  try {
    const raw = localStorage.getItem(ENCOUNTER_PRESET_STORAGE_KEY) || '[]';
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];
    const deduped = new Map();
    entries.forEach(item => {
      const normalized = normalizeEncounterPresetEntry(item);
      if (!normalized) return;
      deduped.set(normalized.name.toLowerCase(), normalized);
    });
    return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } catch (err) {
    console.error('Failed to load encounter presets', err);
    return [];
  }
}

function persistEncounterPresets({ silent = false } = {}){
  try {
    const payload = encounterPresets.map(preset => ({
      name: preset.name,
      encounter: createSerializableEncounterStateFromSource(preset.encounter || {}),
    }));
    localStorage.setItem(ENCOUNTER_PRESET_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('Failed to persist encounter presets', err);
    if (!silent) {
      try { toast('Failed to update encounter presets', 'error'); } catch {}
    }
    return false;
  }
}

function sortEncounterPresets(){
  encounterPresets.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function isEncounterPresetInteractionLocked(){
  return mode === 'view' && !isDmSessionActive();
}

function guardEncounterPresetInteraction(){
  if (!isEncounterPresetInteractionLocked()) return false;
  try { toast('Encounter presets are locked in View mode.', 'error'); } catch {}
  return true;
}

function renderEncounterPresetList(){
  const list = $('enc-preset-list');
  if (!list) return;
  if (!encounterPresets.length) {
    list.innerHTML = '<div class="encounter-presets__empty">No saved rosters yet.</div>';
    return;
  }
  const items = encounterPresets.map((preset, index) => {
    const state = preset.encounter || {};
    const rosterEntries = Array.isArray(state.roster) ? state.roster : [];
    const count = rosterEntries.length;
    const roundValue = Number.isFinite(state.round) && state.round > 0 ? Math.floor(state.round) : 1;
    const turnIndex = Number.isFinite(state.turn) && count ? Math.min(Math.max(0, Math.floor(state.turn)), count - 1) : 0;
    const activeNameRaw = count ? rosterEntries[turnIndex]?.name : '';
    const activeName = typeof activeNameRaw === 'string' && activeNameRaw ? activeNameRaw : '';
    const metaParts = [`${count} combatant${count === 1 ? '' : 's'}`, `Round ${roundValue}`];
    if (activeName) metaParts.push(`Active: ${activeName}`);
    const nameHtml = escapeHtml(preset.name);
    const metaHtml = escapeHtml(metaParts.join(' • '));
    return `
      <div class="catalog-item encounter-preset" data-preset-index="${index}">
        <div class="encounter-preset__info">
          <div class="encounter-preset__name">${nameHtml}</div>
          <div class="encounter-preset__meta">${metaHtml}</div>
        </div>
        <div class="encounter-preset__actions">
          <button type="button" class="btn-sm" data-view-allow data-action="encounter-preset-load" data-preset-index="${index}">Load</button>
          <button type="button" class="btn-sm" data-view-allow data-action="encounter-preset-delete" data-preset-index="${index}" aria-label="Delete preset ${nameHtml}">Delete</button>
        </div>
      </div>
    `;
  });
  list.innerHTML = items.join('');
}

function applyEncounterPresetState(state){
  const sanitized = createSerializableEncounterStateFromSource(state || {});
  const normalizedRoster = normalizeEncounterRoster(sanitized.roster);
  roster.length = 0;
  normalizedRoster.forEach(entry => roster.push(entry));
  round = sanitized.round;
  if (!normalizedRoster.length) {
    round = 1;
    turn = 0;
  } else {
    turn = sanitized.turn;
  }
  renderEnc();
  saveEnc();
  return sanitized;
}

let encounterPresets = loadEncounterPresetsFromStorage();

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
        const beforeConditions = combatant.conditions.slice();
        if (checkbox.checked) {
          if (!combatant.conditions.includes(effect.id)) combatant.conditions.push(effect.id);
          toast(`${name} gains ${effect.name}`, 'info');
          logAction(`${name} gains ${effect.name}`);
          if (isActiveCharacterName(combatant.name)) {
            sendImmediateCharacterUpdate(
              'conditions',
              { active: beforeConditions },
              { active: combatant.conditions.slice() },
              `Condition gained: ${effect.name}`,
            );
          }
        } else {
          combatant.conditions = combatant.conditions.filter(id => id !== effect.id);
          toast(`${name} is no longer ${effect.name}`, 'info');
          logAction(`${name} is no longer ${effect.name}`);
          if (isActiveCharacterName(combatant.name)) {
            sendImmediateCharacterUpdate(
              'conditions',
              { active: beforeConditions },
              { active: combatant.conditions.slice() },
              `Condition removed: ${effect.name}`,
            );
          }
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

const encPresetNameInput = $('enc-preset-name');
const encPresetSaveButton = $('enc-preset-save');
const encPresetList = $('enc-preset-list');

function normalizePresetName(name){
  return name.trim().replace(/\s+/g, ' ');
}

function handleEncounterPresetSave(){
  if (guardEncounterPresetInteraction()) return;
  const rawName = encPresetNameInput ? encPresetNameInput.value || '' : '';
  const normalizedName = normalizePresetName(rawName);
  if (!normalizedName) {
    toast('Enter a preset name', 'error');
    return;
  }
  if (!roster.length) {
    toast('Add at least one combatant before saving', 'error');
    return;
  }
  const newState = createSerializableEncounterStateFromSource(getSerializableEncounterState());
  const existingIndex = encounterPresets.findIndex(preset => preset.name.toLowerCase() === normalizedName.toLowerCase());
  const entry = {
    name: normalizedName,
    encounter: newState,
  };
  if (existingIndex >= 0) {
    encounterPresets[existingIndex] = entry;
  } else {
    encounterPresets.push(entry);
  }
  sortEncounterPresets();
  if (!persistEncounterPresets()) {
    encounterPresets = loadEncounterPresetsFromStorage();
    renderEncounterPresetList();
    return;
  }
  renderEncounterPresetList();
  if (encPresetNameInput) encPresetNameInput.value = '';
  const verb = existingIndex >= 0 ? 'Updated' : 'Saved';
  const message = `${verb} roster preset: ${normalizedName}`;
  toast(message, 'success');
  logAction(`${verb} encounter preset: ${normalizedName}`);
}

function handleEncounterPresetLoad(index){
  if (guardEncounterPresetInteraction()) return;
  if (!Number.isInteger(index) || index < 0 || index >= encounterPresets.length) return;
  const preset = encounterPresets[index];
  if (!preset) return;
  const applied = applyEncounterPresetState(preset.encounter || {});
  if (applied) {
    encounterPresets[index] = {
      name: preset.name,
      encounter: applied,
    };
  }
  const activeName = preset.name || 'Preset';
  toast(`Loaded roster preset: ${activeName}`, 'success');
  logAction(`Loaded encounter preset: ${activeName}`);
  if (applied && encPresetList) {
    // ensure metadata (like active combatant text) stays current
    renderEncounterPresetList();
  }
}

function handleEncounterPresetDelete(index){
  if (guardEncounterPresetInteraction()) return;
  if (!Number.isInteger(index) || index < 0 || index >= encounterPresets.length) return;
  const [removed] = encounterPresets.splice(index, 1);
  if (!persistEncounterPresets()) {
    encounterPresets = loadEncounterPresetsFromStorage();
    renderEncounterPresetList();
    return;
  }
  renderEncounterPresetList();
  if (removed && removed.name) {
    toast(`Deleted roster preset: ${removed.name}`, 'info');
    logAction(`Deleted encounter preset: ${removed.name}`);
  } else {
    toast('Deleted roster preset', 'info');
    logAction('Deleted encounter preset');
  }
}

if (encPresetSaveButton) {
  encPresetSaveButton.addEventListener('click', handleEncounterPresetSave);
}

if (encPresetNameInput) {
  encPresetNameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleEncounterPresetSave();
    }
  });
}

if (encPresetList) {
  encPresetList.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest('button[data-action][data-preset-index]')
      : null;
    if (!button) return;
    const action = button.dataset.action;
    const idx = Number(button.dataset.presetIndex);
    if (!Number.isInteger(idx)) return;
    if (action === 'encounter-preset-load') {
      handleEncounterPresetLoad(idx);
    } else if (action === 'encounter-preset-delete') {
      handleEncounterPresetDelete(idx);
    }
  });
}

renderEncounterPresetList();

/* ========= Save / Load ========= */
const SNAPSHOT_FORM_VERSION = 1;

function safeCssEscape(value) {
  const raw = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    try {
      return CSS.escape(raw);
    } catch (err) {
      /* fall back to manual escaping */
    }
  }
  return raw.replace(/([\0-\x1f\x7f"'\\])/g, '\\$1');
}

function buildFormFieldPath(el) {
  if (!el || typeof el !== 'object') return null;
  const segments = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
    if (!tag) break;
    let segment = tag;
    if (node.id) {
      segment += `#${safeCssEscape(node.id)}`;
      segments.unshift(segment);
      break;
    }
    if (node.hasAttribute && node.hasAttribute('name')) {
      const nameAttr = node.getAttribute('name');
      if (nameAttr) {
        segment += `[name="${safeCssEscape(nameAttr)}"]`;
      }
    }
    if (node.hasAttribute && node.hasAttribute('data-field')) {
      const fieldAttr = node.getAttribute('data-field');
      if (fieldAttr) {
        segment += `[data-field="${safeCssEscape(fieldAttr)}"]`;
      }
    }
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(sibling => sibling.tagName === node.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(node);
        if (index >= 0) {
          segment += `:nth-of-type(${index + 1})`;
        }
      }
    }
    segments.unshift(segment);
    node = parent;
    if (!node || node === document.body) {
      break;
    }
  }
  if (!segments.length) return null;
  return segments.join(' > ');
}

function detectFormFieldKind(el) {
  if (!el || typeof el !== 'object') return 'text';
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'select') {
    return el.multiple ? 'select-multiple' : 'select-one';
  }
  if (tag === 'textarea') return 'textarea';
  if (tag === 'progress') return 'progress';
  if (tag === 'input') {
    const type = (el.type || '').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    return 'input';
  }
  return tag || 'text';
}

function captureFormFieldSnapshot(el) {
  if (!el || typeof el !== 'object') return null;
  if (typeof el.matches === 'function' && el.matches('[data-snapshot-ignore]')) {
    return null;
  }
  const path = buildFormFieldPath(el);
  if (!path) return null;
  const kind = detectFormFieldKind(el);
  const snapshot = { path, kind };
  if (typeof el.id === 'string' && el.id) {
    snapshot.id = el.id;
  }
  if (typeof el.name === 'string' && el.name) {
    snapshot.name = el.name;
    try {
      const matches = document?.querySelectorAll ? document.querySelectorAll(`[name="${safeCssEscape(el.name)}"]`) : [];
      snapshot.nameIndex = matches ? Array.prototype.indexOf.call(matches, el) : -1;
    } catch {}
  }
  if (typeof el.getAttribute === 'function') {
    const fieldAttr = el.getAttribute('data-field');
    if (fieldAttr) {
      snapshot.field = fieldAttr;
    }
  }
  if (kind === 'select-multiple') {
    snapshot.values = Array.from(el.selectedOptions || []).map(option => option.value);
  } else if (kind === 'checkbox' || kind === 'radio') {
    snapshot.checked = el.checked === true;
    snapshot.value = el.value;
  } else if (kind === 'progress') {
    const raw = typeof el.value === 'number' ? el.value : Number(el.getAttribute ? el.getAttribute('value') : NaN);
    snapshot.value = Number.isFinite(raw) ? raw : 0;
  } else {
    snapshot.value = el.value ?? '';
  }
  return snapshot;
}

function resolveFormFieldFromSnapshot(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.id) {
    const byId = $(record.id);
    if (byId) return byId;
  }
  if (record.path) {
    try {
      const fromPath = document.querySelector(record.path);
      if (fromPath) return fromPath;
    } catch {}
  }
  if (record.field) {
    try {
      const candidates = document.querySelectorAll(`[data-field="${safeCssEscape(record.field)}"]`);
      if (candidates && candidates.length) {
        const index = typeof record.nameIndex === 'number' && record.nameIndex >= 0 ? record.nameIndex : 0;
        return candidates[index] || candidates[0];
      }
    } catch {}
  }
  if (record.name) {
    try {
      const candidates = document.querySelectorAll(`[name="${safeCssEscape(record.name)}"]`);
      if (candidates && candidates.length) {
        const index = typeof record.nameIndex === 'number' && record.nameIndex >= 0 ? record.nameIndex : 0;
        return candidates[index] || candidates[0];
      }
    } catch {}
  }
  return null;
}

function applyFormFieldSnapshot(el, record) {
  if (!el || !record) return false;
  const kind = record.kind || detectFormFieldKind(el);
  let changed = false;
  if (kind === 'checkbox' || kind === 'radio') {
    const next = record.checked === true || record.value === true;
    if (el.checked !== next) {
      el.checked = next;
      changed = true;
    }
  } else if (kind === 'select-multiple' && Array.isArray(record.values)) {
    const desired = record.values.map(value => String(value));
    Array.from(el.options || []).forEach(option => {
      const shouldSelect = desired.includes(option.value);
      if (option.selected !== shouldSelect) {
        option.selected = shouldSelect;
        changed = true;
      }
    });
  } else if (kind === 'progress') {
    const numeric = Number(record.value);
    if (Number.isFinite(numeric)) {
      if (typeof el.value === 'number') {
        if (el.value !== numeric) {
          el.value = numeric;
          changed = true;
        }
      } else if (typeof el.setAttribute === 'function') {
        const currentAttr = Number(el.getAttribute('value'));
        if (!Number.isFinite(currentAttr) || currentAttr !== numeric) {
          el.setAttribute('value', String(numeric));
          changed = true;
        }
      }
    }
  } else {
    const value = record.value != null ? String(record.value) : '';
    if (el.value !== value) {
      el.value = value;
      changed = true;
    }
  }
  return changed;
}

function applySerializedFormState(serialized) {
  const restored = { ids: new Set(), paths: new Set(), names: new Set(), fields: new Set() };
  if (!serialized || typeof serialized !== 'object') {
    return restored;
  }
  const fields = Array.isArray(serialized.fields) ? serialized.fields : [];
  fields.forEach(record => {
    const el = resolveFormFieldFromSnapshot(record);
    if (!el) return;
    applyFormFieldSnapshot(el, record);
    if (record.id) restored.ids.add(record.id);
    if (record.path) restored.paths.add(record.path);
    if (record.name) restored.names.add(record.name);
    if (record.field) restored.fields.add(record.field);
  });
  return restored;
}
const SNAPSHOT_DEBUG = false;
const UI_RESTORE_MAX_ATTEMPTS = 30;

function serialize(){
  const data={};
  function getVal(sel, root){ const el = qs(sel, root); return el ? el.value : ''; }
  function getChecked(sel, root){ const el = qs(sel, root); return el ? el.checked : false; }
  const formSnapshots = [];
  qsa('input,select,textarea,progress').forEach(el=>{
    const snapshot = captureFormFieldSnapshot(el);
    if (!snapshot) return;
    formSnapshots.push(snapshot);
    if (!snapshot.id) return;
    if (snapshot.kind === 'checkbox' || snapshot.kind === 'radio') {
      data[snapshot.id] = snapshot.checked === true;
    } else if (snapshot.kind === 'select-multiple') {
      data[snapshot.id] = Array.isArray(snapshot.values) ? snapshot.values.slice() : [];
    } else if (snapshot.kind === 'progress') {
      data[snapshot.id] = snapshot.value;
    } else {
      data[snapshot.id] = snapshot.value;
    }
  });
  if (formSnapshots.length) {
    data.formState = { version: SNAPSHOT_FORM_VERSION, fields: formSnapshots };
  }
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
    const dmLock = card?.dataset?.dmLock === 'true';
    return {
      name,
      damage,
      range,
      attackAbility: attackAbility || inferWeaponAttackAbility({ range }),
      proficient,
      dmLock
    };
  });
  data.armor = qsa("[data-kind='armor']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    slot: getVal("[data-f='slot']", card) || 'Body',
    bonus: Number(getVal("[data-f='bonus']", card) || 0),
    equipped: !!getChecked("[data-f='equipped']", card),
    dmLock: card?.dataset?.dmLock === 'true'
  }));
  data.items = qsa("[data-kind='item']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    qty: Number(getVal("[data-f='qty']", card) || 1),
    notes: getVal("[data-f='notes']", card) || '',
    dmLock: card?.dataset?.dmLock === 'true'
  }));
  data.medals = qsa("[data-kind='medal']").map(card => {
    let id = getVal("[data-f='id']", card) || '';
    if (!id) {
      id = generateMedalId();
      const idField = qs("[data-f='id']", card);
      if (idField) idField.value = id;
    }
    const awardedAtRaw = getVal("[data-f='awardedAtRaw']", card)
      || getVal("[data-f='awardedAt']", card)
      || '';
    return {
      id,
      name: getVal("[data-f='name']", card) || '',
      description: getVal("[data-f='description']", card) || '',
      artwork: getVal("[data-f='artwork']", card) || '',
      awardedBy: getVal("[data-f='awardedBy']", card) || '',
      awardedAt: awardedAtRaw,
    };
  });
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
  const encounterState = getSerializableEncounterState();
  data.encounter = {
    round: encounterState.round,
    turn: encounterState.turn,
    roster: Array.isArray(encounterState.roster)
      ? encounterState.roster.map(entry => ({
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
        }))
      : [],
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

function getCurrentUserUid() {
  const { uid } = getAuthState();
  return uid || getActiveUserId();
}

function createDefaultSnapshot() {
  let character;
  try {
    character = JSON.parse(JSON.stringify(DEFAULT_STATE));
  } catch {
    character = DEFAULT_STATE;
  }
  const ownerUid = getCurrentUserUid();
  if (ownerUid && character && typeof character === 'object') {
    character.ownerUid = ownerUid;
  }
  const ui = null;
  const meta = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    uiVersion: UI_STATE_VERSION,
    appVersion: APP_VERSION,
    savedAt: Date.now(),
    ...(ownerUid ? { ownerUid } : {}),
  };
  const checksum = calculateSnapshotChecksum({ character, ui });
  return {
    meta: { ...meta, checksum },
    schemaVersion: meta.schemaVersion,
    uiVersion: meta.uiVersion,
    savedAt: meta.savedAt,
    appVersion: meta.appVersion,
    character,
    ui,
    checksum,
  };
}

const UI_SNAPSHOT_INPUT_SELECTORS = [
  '#augment-search',
  '#dm-notifications-filter-character',
  '#dm-notifications-filter-severity',
  '#dm-notifications-filter-resolved',
  '#dm-notifications-filter-search',
  '#dm-characters-search',
];

const UI_SNAPSHOT_MODAL_BLOCKLIST = new Set([
  WELCOME_MODAL_ID,
  'modal-auth',
  'modal-post-auth-choice',
  'modal-claim-characters',
  'modal-pin',
  'modal-character-confirmation',
  'launch-animation',
]);

function captureUiFormInputs() {
  const inputs = {};
  if (typeof document === 'undefined') return inputs;
  UI_SNAPSHOT_INPUT_SELECTORS.forEach(selector => {
    try {
      const el = document.querySelector(selector);
      if (!el) return;
      const snapshot = captureFormFieldSnapshot(el);
      if (!snapshot) return;
      inputs[selector] = snapshot;
    } catch (err) {
      console.error('Failed to capture UI filter input for snapshot', err);
    }
  });
  return inputs;
}

function applyUiFormInputs(inputs = {}) {
  if (typeof document === 'undefined' || !inputs || typeof inputs !== 'object') return;
  Object.entries(inputs).forEach(([selector, record]) => {
    try {
      const el = document.querySelector(selector);
      if (!el) return;
      const applied = applyFormFieldSnapshot(el, record);
      if (!applied) return;
      ['change', 'input'].forEach(type => {
        try {
          el.dispatchEvent(new Event(type, { bubbles: true }));
        } catch {}
      });
    } catch (err) {
      console.error('Failed to apply UI filter input from snapshot', err);
    }
  });
}

function captureOpenModalIds() {
  if (typeof document === 'undefined') return [];
  try {
    return Array.from(document.querySelectorAll('.overlay'))
      .filter(modal => !modal.classList.contains('hidden'))
      .map(modal => modal.id)
      .filter(id => id && !UI_SNAPSHOT_MODAL_BLOCKLIST.has(id));
  } catch (err) {
    console.error('Failed to capture open modals for snapshot', err);
    return [];
  }
}

function applyOpenModalIds(ids = []) {
  if (!Array.isArray(ids) || typeof document === 'undefined') return;
  ids.forEach(id => {
    if (!id || UI_SNAPSHOT_MODAL_BLOCKLIST.has(id)) return;
    const modal = document.getElementById(id);
    if (!modal) return;
    try {
      if (modal.classList.contains('hidden')) {
        show(id);
      }
    } catch (err) {
      console.error('Failed to reopen modal during snapshot restore', err);
    }
  });
}

function createUiSnapshot() {
  const ui = {};
  try {
    const activeTab = typeof getActiveTab === 'function' ? getActiveTab() : null;
    if (typeof activeTab === 'string' && activeTab) {
      ui.activeTabId = activeTab;
    }
  } catch {}
  try {
    const route = typeof getNavigationType === 'function' ? getNavigationType() : null;
    if (typeof route === 'string' && route) {
      ui.route = route;
    }
  } catch {}
  if (mode === 'view' || mode === 'edit') {
    ui.viewMode = mode;
  }
  if (typeof activeTheme === 'string' && activeTheme) {
    ui.theme = activeTheme;
  }
  const openDrawers = {};
  if (typeof isPlayerToolsDrawerOpen === 'boolean') {
    openDrawers.playerTools = isPlayerToolsDrawerOpen;
  }
  if (typeof isTickerDrawerOpen === 'boolean') {
    openDrawers.ticker = isTickerDrawerOpen;
  }
  if (Object.keys(openDrawers).length) {
    ui.openDrawers = openDrawers;
  }
  const scroll = { panels: {} };
  if (typeof window !== 'undefined') {
    scroll.windowY = Number.isFinite(window.scrollY) ? window.scrollY : 0;
  }
  try {
    const playerToolsViewport = document.querySelector('#player-tools-drawer .pt-app__viewport');
    if (playerToolsViewport) {
      scroll.panels['#player-tools-drawer .pt-app__viewport'] = playerToolsViewport.scrollTop || 0;
    }
    const phoneViewport = document.querySelector('.player-tools-phone__viewport');
    if (phoneViewport) {
      scroll.panels['.player-tools-phone__viewport'] = phoneViewport.scrollTop || 0;
    }
  } catch {}
  if (scroll.windowY || Object.keys(scroll.panels).length) {
    ui.scroll = scroll;
  }
  try {
    const inputs = captureUiFormInputs();
    if (inputs && Object.keys(inputs).length) {
      ui.inputs = inputs;
    }
  } catch {}
  const collapsed = {};
  try {
    qsa('details[id]').forEach(detail => {
      collapsed[detail.id] = detail.open === true || detail.getAttribute('open') === '';
    });
  } catch {}
  if (Object.keys(collapsed).length) {
    ui.collapsed = collapsed;
  }
  try {
    const openModals = captureOpenModalIds();
    if (openModals.length) {
      ui.openModals = openModals;
    }
  } catch {}
  try {
    const participantState = collectSnapshotParticipants();
    if (participantState && Object.keys(participantState).length > 0) {
      ui.participants = participantState;
    }
  } catch {}
  if (SNAPSHOT_DEBUG) {
    console.debug('snapshot created', ui);
  }
  return ui;
}

function createAppSnapshot() {
  const character = serialize();
  const ownerUid = typeof character?.ownerUid === 'string' && character.ownerUid ? character.ownerUid : '';
  const ui = createUiSnapshot();
  const meta = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    uiVersion: UI_STATE_VERSION,
    appVersion: APP_VERSION,
    savedAt: Date.now(),
    ...(ownerUid ? { ownerUid } : {}),
  };
  const checksum = calculateSnapshotChecksum({ character, ui });
  meta.checksum = checksum;
  const snapshot = {
    meta,
    schemaVersion: meta.schemaVersion,
    uiVersion: meta.uiVersion,
    savedAt: meta.savedAt,
    appVersion: meta.appVersion,
    checksum,
    character,
    ui,
  };
  if (SNAPSHOT_DEBUG) {
    console.debug('app snapshot created', snapshot);
  }
  return snapshot;
}

function isUiRestoreReady() {
  if (typeof document === 'undefined') return false;
  if (document.readyState === 'loading') return false;
  if (!document.body) return false;
  const hasPowers = !!document.getElementById('powers');
  const hasTabs = !!document.querySelector('.tab[data-go]');
  return hasPowers && hasTabs;
}

function applyUiSnapshot(ui) {
  if (!ui || typeof ui !== 'object') return;
  try {
    if (typeof ui.theme === 'string' && ui.theme) {
      applyTheme(ui.theme, { animate: false });
      setStoredTheme(ui.theme);
    }
  } catch (err) {
    console.error('Failed to apply theme from snapshot', err);
  }
  try {
    if (typeof ui.route === 'string' && ui.route) {
      setNavigationTypeOverride(ui.route);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          try { setNavigationTypeOverride(null); } catch {}
        });
      }
    }
  } catch (err) {
    console.error('Failed to apply route from snapshot', err);
  }
  try {
    if (ui.viewMode === 'view' || ui.viewMode === 'edit') {
      setMode(ui.viewMode, { skipPersist: true });
    }
  } catch (err) {
    console.error('Failed to apply view mode from snapshot', err);
  }
  try {
    const tabId = ui.activeTabId || ui.activeTab;
    if (typeof tabId === 'string' && tabId) {
      try { localStorage.setItem('active-tab', tabId); } catch {}
      if (qs(`.tab[data-go="${tabId}"]`)) {
        activateTab(tabId);
      }
    }
  } catch (err) {
    console.error('Failed to apply active tab from snapshot', err);
  }
  try {
    const drawers = ui.openDrawers && typeof ui.openDrawers === 'object' ? ui.openDrawers : {};
    if ('playerTools' in drawers) {
      if (drawers.playerTools) openPlayerToolsDrawer();
      else closePlayerToolsDrawer();
    }
    if ('ticker' in drawers) {
      setTickerDrawerOpen(drawers.ticker);
    }
  } catch (err) {
    console.error('Failed to apply drawer state from snapshot', err);
  }
  try {
    if (ui.participants && typeof ui.participants === 'object') {
      applySnapshotParticipants(ui.participants);
    }
  } catch (err) {
    console.error('Failed to apply participant state from snapshot', err);
  }
  try {
    if (ui.inputs && typeof ui.inputs === 'object') {
      applyUiFormInputs(ui.inputs);
    }
  } catch (err) {
    console.error('Failed to apply UI filter state from snapshot', err);
  }
  try {
    const collapsed = ui.collapsed || ui.collapsedSections || {};
    Object.entries(collapsed).forEach(([id, isOpen]) => {
      if (!id) return;
      const detail = document.getElementById(id);
      if (!detail || detail.tagName !== 'DETAILS') return;
      detail.open = isOpen === true;
    });
  } catch (err) {
    console.error('Failed to apply collapsed state from snapshot', err);
  }
  try {
    if (Array.isArray(ui.openModals) && ui.openModals.length) {
      applyOpenModalIds(ui.openModals);
    }
  } catch (err) {
    console.error('Failed to apply open modal state from snapshot', err);
  }
  try {
    const scroll = ui.scroll || {};
    if (typeof scroll.windowY === 'number' && typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: scroll.windowY, behavior: 'auto' });
        } catch (err) {
          window.scrollTo(0, scroll.windowY);
        }
      });
    }
    const panels = scroll.panels && typeof scroll.panels === 'object' ? scroll.panels : {};
    Object.entries(panels).forEach(([selector, value]) => {
      if (typeof value !== 'number') return;
      requestAnimationFrame(() => {
        try {
          const el = document.querySelector(selector);
          if (el && typeof el.scrollTop === 'number') {
            el.scrollTop = value;
          }
        } catch {}
      });
    });
  } catch (err) {
    console.error('Failed to apply scroll state from snapshot', err);
  }
  if (SNAPSHOT_DEBUG) {
    console.debug('ui snapshot applied', ui);
  }
}

function applyUiSnapshotWithRetry(ui, attempt = 0) {
  if (!ui) return;
  if (isUiRestoreReady()) {
    applyUiSnapshot(ui);
    return;
  }
  if (attempt === 0 && typeof document !== 'undefined') {
    const nextAttempt = Math.max(attempt + 1, 1);
    const onReady = () => {
      requestAnimationFrame(() => applyUiSnapshotWithRetry(ui, nextAttempt));
    };
    document.addEventListener('app-render-complete', onReady, { once: true });
  }
  if (attempt >= UI_RESTORE_MAX_ATTEMPTS) {
    console.warn('UI restore skipped after retries');
    return;
  }
  requestAnimationFrame(() => applyUiSnapshotWithRetry(ui, attempt + 1));
}

function applyAppSnapshot(snapshot) {
  const migrated = migrateSavePayload(snapshot);
  const { payload } = buildCanonicalPayload(migrated);
  deserialize(payload.character || {});
  const uiState = payload.ui || (payload.character && payload.character.uiState ? payload.character.uiState : null);
  if (uiState) {
    applyUiSnapshotWithRetry(uiState);
  }
  if (SNAPSHOT_DEBUG) {
    console.debug('app snapshot applied', payload);
  }
  return payload;
}

function deserialize(data){
  if (data && typeof data === 'object' && data.character && data.meta) {
    applyAppSnapshot(data);
    return;
  }
  migratePublicOpinionSnapshot(data);
  const storedLevelProgress = data && (data.levelProgressState || data.levelProgress);
  const storedAugments = data && data.augmentState;
  hydrateLevelProgressState(storedLevelProgress, { silent: true });
  hydrateAugmentState(storedAugments, { silent: true });
  $('powers').innerHTML=''; $('sigs').innerHTML=''; $('weapons').innerHTML=''; $('armors').innerHTML=''; $('items').innerHTML=''; $('medals').innerHTML='';
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
   if(perkSelects.includes(k) || k==='saveProfs' || k==='skillProfs' || k==='formState' || k==='appState') return;
   const el=$(k);
   if (!el) return;
   const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : '';
   if (el.type==='checkbox') {
     el.checked=!!v;
     return;
   }
   if (el.type==='radio') {
     el.checked=!!v;
     return;
   }
   if (tag === 'select' && el.multiple && Array.isArray(v)) {
     const desired = v.map(value => String(value));
     Array.from(el.options || []).forEach(option => {
       option.selected = desired.includes(option.value);
     });
     return;
   }
   if (tag === 'progress') {
     const numeric = Number(v);
     if (Number.isFinite(numeric)) {
       if (typeof el.value === 'number') {
         el.value = numeric;
       } else if (typeof el.setAttribute === 'function') {
         el.setAttribute('value', String(numeric));
       }
     }
     return;
   }
   if (v !== undefined) {
     el.value=v;
   }
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
  (data && data.medals ? data.medals : []).forEach(m=> $('medals').appendChild(createCard('medal', m)));
  updateMedalIndicators();
  refreshHammerspaceCards();
  const restoredFormFields = applySerializedFormState(data?.formState);
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
  if (xpModeEl && !(restoredFormFields && restoredFormFields.ids && restoredFormFields.ids.has('xp-mode'))) {
    xpModeEl.value = 'add';
  }
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
  const uiState = data?.uiState && typeof data.uiState === 'object' ? data.uiState : null;
  if (uiState) {
    if (typeof uiState.theme === 'string' && uiState.theme) {
      applyTheme(uiState.theme, { animate: false });
      setStoredTheme(uiState.theme);
    }
    if (uiState.viewMode === 'view' || uiState.viewMode === 'edit') {
      setMode(uiState.viewMode);
    }
    if (typeof uiState.activeTab === 'string' && uiState.activeTab) {
      try {
        localStorage.setItem('active-tab', uiState.activeTab);
      } catch {}
      if (qs(`.tab[data-go="${uiState.activeTab}"]`)) {
        activateTab(uiState.activeTab);
      }
    }
    if (typeof uiState.playerToolsOpen === 'boolean') {
      if (uiState.playerToolsOpen) openPlayerToolsDrawer();
      else closePlayerToolsDrawer();
    }
    if (typeof uiState.tickerOpen === 'boolean') {
      setTickerDrawerOpen(uiState.tickerOpen);
    }
  }
  if (data?.appState) {
    applySnapshotParticipants(data.appState);
  }
  if (mode === 'view') applyViewLockState();
  try {
    document.dispatchEvent(new CustomEvent('app-render-complete'));
  } catch {}
}

/* ========= autosave + history ========= */
const AUTO_KEY = 'autosave';
let history = [];
let histIdx = -1;
const forcedRefreshResume = consumeForcedRefreshState();

const AUTOSAVE_STORAGE_ERROR_TOAST_INTERVAL_MS = 60000;
let lastAutosaveStorageErrorToastAt = 0;
let lastAutosaveStorageErrorLogAt = 0;

function isAutosaveLocalStorageQuotaError(err) {
  if (!err) return false;
  const code = typeof err.code === 'number' ? err.code : null;
  if (code === 22 || code === 1014) return true;
  const name = typeof err.name === 'string' ? err.name : '';
  if (/quotaexceedederror/i.test(name)) return true;
  if (/ns_error_dom_quota_reached/i.test(name)) return true;
  const message = typeof err.message === 'string' ? err.message : '';
  if (/quota/i.test(message) || /ns_error_dom_quota_reached/i.test(message)) return true;
  if (err && typeof err === 'object' && err.originalError && err.originalError !== err) {
    return isAutosaveLocalStorageQuotaError(err.originalError);
  }
  return false;
}

function isAutosaveLocalStorageSecurityError(err) {
  if (!err) return false;
  const code = typeof err.code === 'number' ? err.code : null;
  if (code === 18) return true;
  const name = typeof err.name === 'string' ? err.name : '';
  if (/securityerror/i.test(name)) return true;
  const message = typeof err.message === 'string' ? err.message : '';
  if (/security/i.test(message) || /denied/i.test(message)) return true;
  if (err && typeof err === 'object' && err.originalError && err.originalError !== err) {
    return isAutosaveLocalStorageSecurityError(err.originalError);
  }
  return false;
}

function isAutosaveStoragePersistenceError(err) {
  return isAutosaveLocalStorageQuotaError(err) || isAutosaveLocalStorageSecurityError(err);
}

function getAutosaveStorageErrorMessage(err) {
  if (isAutosaveLocalStorageQuotaError(err)) {
    return 'Autosave paused. Browser storage is full. Free up space to resume.';
  }
  if (isAutosaveLocalStorageSecurityError(err)) {
    return 'Autosave paused. Browser storage access is blocked. Allow storage to resume.';
  }
  return 'Autosave paused. Browser storage is unavailable. Free up space to resume.';
}

function enqueueSyncPanelErrorEntry(entry) {
  if (!entry) return;
  const payload = { ...entry };
  const runner = () => appendSyncPanelErrorEntry(payload);
  if (typeof queueMicrotask === 'function') {
    try { queueMicrotask(runner); } catch { setTimeout(runner, 0); }
  } else {
    setTimeout(runner, 0);
  }
}

function notifyAutosaveStorageFailure(err) {
  const now = Date.now();
  const message = getAutosaveStorageErrorMessage(err);
  if (!lastAutosaveStorageErrorToastAt || now - lastAutosaveStorageErrorToastAt >= AUTOSAVE_STORAGE_ERROR_TOAST_INTERVAL_MS) {
    lastAutosaveStorageErrorToastAt = now;
    try {
      toast(message, 'error');
    } catch (toastErr) {
      console.error('Failed to display autosave storage error toast', toastErr);
    }
  }
  if (!lastAutosaveStorageErrorLogAt || now - lastAutosaveStorageErrorLogAt >= AUTOSAVE_STORAGE_ERROR_TOAST_INTERVAL_MS) {
    lastAutosaveStorageErrorLogAt = now;
    const detailParts = [];
    if (isAutosaveLocalStorageQuotaError(err)) {
      detailParts.push('Autosave could not write to local storage because the browser is out of space.');
    } else if (isAutosaveLocalStorageSecurityError(err)) {
      detailParts.push('Autosave could not access local storage due to browser security settings.');
    } else {
      detailParts.push('Autosave could not write to local storage.');
    }
    if (err && typeof err.message === 'string' && err.message.trim()) {
      detailParts.push(err.message.trim());
    }
    enqueueSyncPanelErrorEntry({
      message: 'Autosave paused (local storage)',
      detail: detailParts.join(' '),
      timestamp: now,
      name: (() => {
        try { return currentCharacter() || null; } catch { return null; }
      })(),
    });
  }
}

initializeAutosaveController({
  getCurrentCharacter: currentCharacter,
  saveAutoBackup,
});

function captureAutosaveSnapshot(options = {}) {
  const { markSynced = false } = options;
  let snapshot;
  try {
    snapshot = createAppSnapshot();
  } catch (err) {
    console.error('Failed to capture autosave snapshot', err);
    return null;
  }

  let serialized;
  try {
    serialized = JSON.stringify(snapshot);
  } catch (err) {
    console.error('Failed to serialize autosave snapshot', err);
    return null;
  }

  history = history.slice(0, histIdx + 1);
  history.push(snapshot);
  if (history.length > 20) {
    history.shift();
  }
  histIdx = history.length - 1;

  let localPersisted = false;
  try {
    localStorage.setItem(AUTO_KEY, serialized);
    localPersisted = true;
  } catch (e) {
    console.error('Autosave failed', e);
    if (isAutosaveStoragePersistenceError(e)) {
      notifyAutosaveStorageFailure(e);
    }
  }

  if (localPersisted) {
    lastAutosaveStorageErrorToastAt = 0;
    lastAutosaveStorageErrorLogAt = 0;
    try {
      const name = currentCharacter();
      if (name) {
        persistLocalAutosaveSnapshot(name, snapshot, serialized);
      }
    } catch (err) {
      console.error('Failed to persist rolling autosave snapshots', err);
    }
  }

  if (markSynced && localPersisted) {
    markAutoSaveSynced(snapshot, serialized);
  } else {
    markAutoSaveDirty(snapshot, serialized);
  }

  return { snapshot, serialized };
}

const pushHistory = debounce(() => {
  captureAutosaveSnapshot();
}, 500);

document.addEventListener('input', pushHistory);
document.addEventListener('change', pushHistory);
document.addEventListener('dm-tab-will-change', () => {
  captureAutosaveSnapshot();
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAutosave('visibilitychange');
    }
  }, { passive: true });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', event => {
    if (event && event.persisted) return;
    flushAutosave('pagehide');
  }, { capture: true });
  window.addEventListener('beforeunload', () => {
    captureAutosaveSnapshot();
  });
}

function undo(){
  if(histIdx > 0){ histIdx--; applyAppSnapshot(history[histIdx]); }
}
function redo(){
  if(histIdx < history.length - 1){ histIdx++; applyAppSnapshot(history[histIdx]); }
}

(function(){
  try{ localStorage.removeItem(AUTO_KEY); }catch{}
  const startingSnapshot = forcedRefreshResume && forcedRefreshResume.data
    ? migrateSavePayload(forcedRefreshResume.data)
    : createDefaultSnapshot();
  applyAppSnapshot(startingSnapshot);
  history = [];
  histIdx = -1;
  const initialCapture = captureAutosaveSnapshot({ markSynced: true });
  if(forcedRefreshResume && typeof forcedRefreshResume.scrollY === 'number' && initialCapture){
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: forcedRefreshResume.scrollY, behavior: 'auto' });
      } catch (err) {
        window.scrollTo(0, forcedRefreshResume.scrollY);
      }
    });
  }
})();

const PIN_INTERACTION_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'option',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-act]',
  '[data-action]',
].join(',');

const cssEscape = (value) => {
  if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
};

function updatePinGuardClass() {
  const body = typeof document !== 'undefined' ? document.body : null;
  if (!body) return;
  body.classList.toggle('pin-locked', !!(pinInteractionGuard && !pinInteractionGuard.unlocked));
}

function setPinInteractionGuard(name, { locked = false } = {}) {
  const normalized = canonicalCharacterKey(name || '');
  if (!locked || !normalized) {
    pinInteractionGuard = null;
    updatePinGuardClass();
    return;
  }
  pinInteractionGuard = { name: normalized, unlocked: false };
  updatePinGuardClass();
}

function isPinGuardLocked() {
  if (!pinInteractionGuard || pinInteractionGuard.unlocked) return false;
  const current = canonicalCharacterKey(currentCharacter() || '');
  if (current && pinInteractionGuard.name && current !== pinInteractionGuard.name) return false;
  return true;
}

function shouldGuardInteraction(target) {
  if (!isPinGuardLocked()) return false;
  if (!target || typeof target.closest !== 'function') return false;

  if (target.closest('#player-tools-drawer')) return false;
  if (target.closest('#main-menu, .main-menu, [data-main-menu]')) return false;
  if (target.closest('.overlay, .modal, [role="dialog"], [aria-modal="true"]')) return false;

  const tabScope = target.closest('fieldset[data-tab]');
  if (!tabScope) return false;

  const label = target.closest('label');
  if (label) {
    const forId = label.getAttribute('for');
    if (forId) {
      try {
        if (tabScope.querySelector(`#${cssEscape(forId)}`)) return true;
      } catch {}
    }
  }

  const interactive = target.closest(PIN_INTERACTION_SELECTOR);
  return !!interactive;
}

async function requestPinUnlock() {
  if (!pinInteractionGuard || pinInteractionGuard.unlocked) return true;
  if (pinUnlockInProgress) return false;
  pinUnlockInProgress = true;
  try {
    const name = pinInteractionGuard.name;
    const pin = await pinPrompt('Enter PIN');
    if (pin === null) return false;
    let verified = false;
    try {
      verified = await verifyStoredPin(name, pin);
    } catch (err) {
      console.error('Failed to verify PIN', err);
    }
    if (verified) {
      pinInteractionGuard.unlocked = true;
      updatePinGuardClass();
      const keyName = currentCharacter() || name;
      queueCharacterConfirmation({
        name: keyName,
        variant: 'unlocked',
        key: `pin-unlock:${keyName}:${Date.now()}`,
      });
      return true;
    }
    toast('Invalid PIN', 'error');
    return false;
  } finally {
    pinUnlockInProgress = false;
  }
}

function handlePinGuard(event) {
  if (pinUnlockInProgress) return;
  if (!shouldGuardInteraction(event.target)) return;
  if (event.type === 'keydown' && event.key && !['Enter', ' ', 'Spacebar'].includes(event.key)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
  if (event.type === 'focusin' && event.target && typeof event.target.blur === 'function') {
    event.target.blur();
  }
  requestPinUnlock();
}

if (typeof document !== 'undefined') {
  ['pointerdown', 'click', 'keydown', 'focusin'].forEach(type => {
    document.addEventListener(type, handlePinGuard, true);
  });
}

async function restoreLastLoadedCharacter(){
  if(forcedRefreshResume && forcedRefreshResume.data) return;
  if (typeof window === 'undefined') return;
  if (currentCharacter()) return;
  let storedName = '';
  storedName = readLastSaveName();
  if (!storedName) return;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('char')) {
      return;
    }
  } catch {}
  let snapshot;
  try {
    snapshot = await loadCharacter(storedName, { bypassPin: true });
  } catch (err) {
    console.error('Failed to load stored character for auto-restore', err);
    return;
  }
  const previousMode = useViewMode();
  let authoritativePin = { pinned: hasPin(storedName), source: 'local-fallback' };
  try {
    authoritativePin = await ensureAuthoritativePinState(storedName, { force: true });
  } catch (err) {
    console.error('Failed to sync PIN before auto-restore', err);
  }
  setCurrentCharacter(storedName);
  syncMiniGamePlayerName();
  setPinInteractionGuard(storedName, { locked: authoritativePin.pinned });
  const applied = applyAppSnapshot(snapshot);
  applyViewLockState();
  const savedViewMode = applied?.ui?.viewMode || applied?.character?.uiState?.viewMode;
  if (previousMode === 'view' && savedViewMode !== 'edit') {
    setMode('view', { skipPersist: true });
  }
  queueCharacterConfirmation({
    name: storedName,
    variant: 'loaded',
    key: `auto-restore:${storedName}:${applied?.meta?.savedAt ?? snapshot?.meta?.savedAt ?? Date.now()}`,
    meta: applied?.meta || snapshot?.meta,
  });
  history = [];
  histIdx = -1;
  captureAutosaveSnapshot({ markSynced: true });
}

if (typeof window !== 'undefined') {
  restoreLastLoadedCharacter().catch(err => {
    console.error('Failed to restore last loaded character', err);
  });
}

function flushAutosave(reason){
  const captured = captureAutosaveSnapshot();
  if (!captured && !isAutoSaveDirty()) {
    return;
  }
  if (!isAutoSaveDirty() || !currentCharacter()) {
    return;
  }
  try {
    const maybePromise = performScheduledAutoSave();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(err => {
        console.error('Autosave flush failed', reason, err);
      });
    }
  } catch (err) {
    console.error('Autosave flush failed', reason, err);
  }
}

if(typeof window !== 'undefined'){
  window.addEventListener('focus', () => {
    if(isAutoSaveDirty()){
      performScheduledAutoSave();
    }
  }, { passive: true });
}

function markLaunchSequenceComplete(){
  if(launchSequenceComplete) return;
  launchSequenceComplete = true;
  attemptPendingPinPrompt();
  flushCharacterConfirmationQueue();
}

function markWelcomeSequenceComplete(){
  if(welcomeSequenceComplete) return;
  welcomeSequenceComplete = true;
  attemptPendingPinPrompt();
  flushCharacterConfirmationQueue();
}

async function attemptPendingPinPrompt(){
  if(pendingPinPromptActive) return;
  if(!pendingPinnedAutoLoad) return;
  if(!launchSequenceComplete || !welcomeSequenceComplete) return;
  pendingPinPromptActive = true;
  try {
    await promptForPendingPinnedCharacter();
  } catch (err) {
    console.error('Failed to prompt for PIN unlock', err);
  } finally {
    pendingPinPromptActive = false;
  }
}

async function promptForPendingPinnedCharacter(){
  const payload = pendingPinnedAutoLoad;
  if(!payload) return;
  const { name } = payload;
  try {
    const authoritative = await ensureAuthoritativePinState(name, { force: true });
    if(!authoritative.pinned){
      if(!pendingPinnedAutoLoad || pendingPinnedAutoLoad.name !== name){
        return;
      }
      const unlocked = pendingPinnedAutoLoad;
      pendingPinnedAutoLoad = null;
      applyPendingPinnedCharacter(unlocked);
      return;
    }
  } catch (err) {
    console.error('Failed to sync PIN for auto-restore', err);
  }

  if(!pendingPinnedAutoLoad || pendingPinnedAutoLoad.name !== name){
    return;
  }

  let showedToast = false;
  const showToastMessage = (message, type = 'info') => {
    try {
      toast(message, { type, duration: 0 });
      showedToast = true;
    } catch {}
  };
  const hideToastMessage = () => {
    if(!showedToast) return;
    try { dismissToast(); }
    catch {}
    showedToast = false;
  };

  const promptLabel = 'Enter PIN';
  const suffix = typeof name === 'string' && name ? ` for ${name}` : '';
  showToastMessage(`${promptLabel}${suffix}`, 'info');

  while(pendingPinnedAutoLoad && pendingPinnedAutoLoad.name === name){
    if(!hasPin(name)){
      hideToastMessage();
      const unlocked = pendingPinnedAutoLoad;
      pendingPinnedAutoLoad = null;
      applyPendingPinnedCharacter(unlocked);
      return;
    }

    const pin = await pinPrompt(promptLabel);
    if(!pendingPinnedAutoLoad || pendingPinnedAutoLoad.name !== name){
      hideToastMessage();
      return;
    }
    if(pin === null){
      hideToastMessage();
      pendingPinnedAutoLoad = null;
      try {
        const result = openCharacterList();
        if(result && typeof result.then === 'function'){
          result.catch(err => console.error('Failed to open load list after PIN cancel', err));
        }
      } catch (err) {
        console.error('Failed to open load list after PIN cancel', err);
      }
      return;
    }

    let verified = false;
    try {
      verified = await verifyStoredPin(name, pin);
    } catch (err) {
      console.error('Failed to verify PIN', err);
    }
    if(verified){
      hideToastMessage();
      const unlocked = pendingPinnedAutoLoad;
      pendingPinnedAutoLoad = null;
      applyPendingPinnedCharacter(unlocked);
      return;
    }
    showToastMessage('Invalid PIN. Try again.', 'error');
  }

  hideToastMessage();
}

function applyPendingPinnedCharacter(payload){
  if(!payload) return;
  const { name, data, previousMode } = payload;
  if(!name || !data) return;
  setPinInteractionGuard(name, { locked: false });
  setCurrentCharacter(name);
  syncMiniGamePlayerName();
  const applied = applyAppSnapshot(data);
  applyViewLockState();
  const savedViewMode = applied?.ui?.viewMode || applied?.character?.uiState?.viewMode;
  if(previousMode === 'view' && savedViewMode !== 'edit'){
    setMode('view', { skipPersist: true });
  }
  queueCharacterConfirmation({
    name,
    variant: 'unlocked',
    key: `pin-unlock:${name}:${applied?.meta?.savedAt ?? data?.meta?.savedAt ?? Date.now()}`,
    meta: applied?.meta || data?.meta,
  });
  history = [];
  histIdx = -1;
  captureAutosaveSnapshot({ markSynced: true });
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
  unsupported: 'Cloud sync unavailable',
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

function appendSyncPanelErrorEntry(entry) {
  if (!entry || !Array.isArray(syncErrorLog)) return;
  const timestamp = Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now();
  const message = typeof entry.message === 'string' && entry.message.trim()
    ? entry.message.trim()
    : 'Cloud sync error';
  const detail = typeof entry.detail === 'string' && entry.detail.trim()
    ? entry.detail.trim()
    : null;
  const name = typeof entry.name === 'string' && entry.name.trim()
    ? entry.name.trim()
    : null;
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
}

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

const syncPanelOfflineBtn = syncPanel?.querySelector('[data-sync-prefetch]');
const syncPanelOfflineStatusEl = syncPanel?.querySelector('[data-sync-prefetch-status]');
const offlineDownloadDefaultLabel = syncPanelOfflineBtn?.textContent?.trim() || 'Download offline assets';
let offlineDownloadInProgress = false;
let offlineDownloadScheduled = false;
let offlineDownloadRetryPending = false;
let offlineDownloadAbortController = null;

function setOfflineDownloadButtonLabel(label) {
  if (!syncPanelOfflineBtn || typeof label !== 'string') return;
  syncPanelOfflineBtn.textContent = label;
}

function setOfflineDownloadButtonLoading(isLoading) {
  if (!syncPanelOfflineBtn) return;
  if (isLoading) {
    syncPanelOfflineBtn.classList.add('loading');
    syncPanelOfflineBtn.disabled = true;
    syncPanelOfflineBtn.setAttribute('aria-busy', 'true');
  } else {
    syncPanelOfflineBtn.classList.remove('loading');
    syncPanelOfflineBtn.removeAttribute('aria-busy');
    syncPanelOfflineBtn.disabled = !supportsOfflineCaching();
  }
}

function updateOfflineDownloadStatus(message, state) {
  if (!syncPanelOfflineStatusEl) return;
  if (!message) {
    syncPanelOfflineStatusEl.hidden = true;
    syncPanelOfflineStatusEl.textContent = '';
    syncPanelOfflineStatusEl.removeAttribute('data-state');
    syncPanelOfflineStatusEl.removeAttribute('title');
    return;
  }
  syncPanelOfflineStatusEl.hidden = false;
  syncPanelOfflineStatusEl.textContent = message;
  if (state) {
    syncPanelOfflineStatusEl.setAttribute('data-state', state);
  } else {
    syncPanelOfflineStatusEl.removeAttribute('data-state');
  }
}

function scheduleOfflinePrefetch(delay = 2000) {
  if (!supportsOfflineCaching()) return;
  if (offlineDownloadInProgress || offlineDownloadScheduled) return;
  offlineDownloadScheduled = true;
  const launch = () => {
    offlineDownloadScheduled = false;
    runOfflineDownload({ forceReload: false, triggeredByUser: false });
  };
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(launch, { timeout: delay });
  } else if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(launch, delay);
  } else {
    launch();
  }
}

async function runOfflineDownload({ forceReload = false, triggeredByUser = false } = {}) {
  if (offlineDownloadInProgress) return;
  if (!supportsOfflineCaching()) {
    updateOfflineDownloadStatus('Offline caching is not supported on this browser.', 'error');
    if (syncPanelOfflineBtn) {
      syncPanelOfflineBtn.disabled = true;
      syncPanelOfflineBtn.setAttribute('aria-disabled', 'true');
      syncPanelOfflineBtn.title = 'Offline caching is not supported on this browser.';
    }
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    offlineDownloadRetryPending = true;
    updateOfflineDownloadStatus('Connect to the internet to download offline assets.', 'error');
    return;
  }
  offlineDownloadRetryPending = false;
  offlineDownloadInProgress = true;
  setOfflineDownloadButtonLoading(true);
  updateOfflineDownloadStatus('Preparing offline download…');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  offlineDownloadAbortController = controller;
  try {
    const result = await ensureOfflineAssets({
      forceReload,
      signal: controller?.signal,
      onProgress(progress) {
        if (!progress) return;
        const total = Number.isFinite(progress.total) ? progress.total : 0;
        const completed = Math.min(
          Number.isFinite(progress.completed) ? progress.completed : 0,
          total
        );
        if (total > 0) {
          updateOfflineDownloadStatus(`Caching assets… ${completed} / ${total}`);
        } else {
          updateOfflineDownloadStatus('Caching assets…');
        }
      },
    });
    const failures = Array.isArray(result?.failed) ? result.failed : [];
    if (failures.length > 0) {
      updateOfflineDownloadStatus(
        `Cached ${result.fetched || 0} assets, ${failures.length} failed.`,
        'error'
      );
    } else {
      const now = Date.now();
      setStoredOfflineManifestVersion(result.manifestVersion, now);
      const relative = formatRelativeTime(now);
      const absolute = formatDateTime(now);
      if (syncPanelOfflineStatusEl) {
        if (absolute) {
          syncPanelOfflineStatusEl.title = `Updated ${absolute}`;
        } else {
          syncPanelOfflineStatusEl.removeAttribute('title');
        }
      }
      let successMessage;
      if (result.total > 0) {
        if (result.fetched > 0) {
          successMessage = `Offline ready! Downloaded ${result.fetched} new assets (${result.total} total).`;
        } else {
          successMessage = `Offline ready! All ${result.total} assets already cached.`;
        }
      } else {
        successMessage = 'Offline ready! Asset cache is current.';
      }
      if (relative) {
        successMessage += ` (updated ${relative})`;
      }
      updateOfflineDownloadStatus(successMessage, 'success');
      setOfflineDownloadButtonLabel('Refresh offline assets');
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      updateOfflineDownloadStatus('Offline download canceled.', 'error');
    } else {
      console.error('Offline asset download failed', err);
      updateOfflineDownloadStatus('Offline download failed. Please try again.', 'error');
    }
  } finally {
    offlineDownloadInProgress = false;
    setOfflineDownloadButtonLoading(false);
    offlineDownloadAbortController = null;
  }
}

if (syncPanelOfflineBtn) {
  if (supportsOfflineCaching()) {
    syncPanelOfflineBtn.disabled = false;
    syncPanelOfflineBtn.removeAttribute('aria-disabled');
    syncPanelOfflineBtn.title = 'Download all assets for offline use';
  } else {
    syncPanelOfflineBtn.disabled = true;
    syncPanelOfflineBtn.setAttribute('aria-disabled', 'true');
    syncPanelOfflineBtn.title = 'Offline caching is not supported on this browser.';
    updateOfflineDownloadStatus('Offline caching is not supported on this browser.', 'error');
  }
  syncPanelOfflineBtn.addEventListener('click', event => {
    const forceReload = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
    runOfflineDownload({ forceReload, triggeredByUser: true });
  });
  if (!syncPanelOfflineBtn.textContent?.trim()) {
    setOfflineDownloadButtonLabel(offlineDownloadDefaultLabel);
  }
}

(function initOfflineCacheStatus() {
  const storedVersion = getStoredOfflineManifestVersion();
  const storedTimestamp = getStoredOfflineManifestTimestamp();
  if (storedVersion && syncPanelOfflineStatusEl) {
    const absolute = storedTimestamp ? formatDateTime(storedTimestamp) : '';
    const relative = storedTimestamp ? formatRelativeTime(storedTimestamp) : '';
    let message = 'Offline assets ready.';
    if (relative) {
      message = `Offline assets ready (updated ${relative}).`;
    }
    updateOfflineDownloadStatus(message, 'success');
    if (absolute) {
      syncPanelOfflineStatusEl.title = `Updated ${absolute}`;
    }
    setOfflineDownloadButtonLabel('Refresh offline assets');
  }
  if (supportsOfflineCaching()) {
    if (typeof window !== 'undefined') {
      if (document.readyState === 'complete') {
        scheduleOfflinePrefetch(2000);
      } else {
        window.addEventListener('load', () => scheduleOfflinePrefetch(2000), { once: true });
      }
      window.addEventListener('online', () => {
        if (offlineDownloadRetryPending || !getStoredOfflineManifestVersion()) {
          scheduleOfflinePrefetch(1500);
        }
      });
    }
  }
})();

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
      const label = entry.name || 'Unnamed save';
      const isAutosave = entry.kind === 'autosave';
      title.textContent = isAutosave ? `${label} (Autosave)` : label;
      item.dataset.queueKind = isAutosave ? 'autosave' : 'manual';
      item.appendChild(title);
      const meta = document.createElement('span');
      meta.className = 'sync-panel__meta';
      const timestamp = Number.isFinite(entry.queuedAt) ? entry.queuedAt : entry.ts;
      const absolute = formatDateTime(timestamp);
      const relative = formatRelativeTime(timestamp);
      if (isAutosave) {
        meta.textContent = relative ? `Autosave queued ${relative}` : 'Autosave queued';
      } else {
        meta.textContent = relative ? `Queued ${relative}` : 'Queued';
      }
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
  if (getLastSyncStatus() === 'unsupported') {
    manualSyncButtons.forEach(btn => {
      btn.classList.remove('loading');
      btn.disabled = false;
    });
    return;
  }
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
  appendSyncPanelErrorEntry({
    message,
    detail,
    timestamp,
    name,
  });
});

subscribeSyncActivity(event => {
  const timestamp = event && Number.isFinite(event.timestamp) ? event.timestamp : null;
  if (timestamp !== null) {
    updateLastSyncDisplay(timestamp);
  } else {
    updateLastSyncDisplay();
  }
  refreshSyncQueue();
});

subscribeSyncQueue(() => {
  refreshSyncQueue();
});

const initialLastSync = getLastSyncActivity();
updateLastSyncDisplay(initialLastSync);
renderSyncErrors();
refreshSyncQueue();

$('btn-save').addEventListener('click', async () => {
  const btn = $('btn-save');
  let oldChar = currentCharacter();
  if(!oldChar){
    const stored = readLastSaveName();
    if(stored && stored.trim()) oldChar = stored.trim();
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
    const data = createAppSnapshot();
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
    if (oldChar && vig && vig !== oldChar) {
      queueCharacterConfirmation({
        name: target,
        variant: 'loaded',
        key: `rename:${oldChar}:${target}:${data?.meta?.savedAt ?? Date.now()}`,
        meta: data?.meta,
      });
    }
    cueSuccessfulSave();
    toast('Save successful', 'success');
  } catch (e) {
    console.error('Save failed', e);
    if (isCharacterSaveQuotaError(e)) {
      try {
        await openCharacterList();
      } catch (modalErr) {
        console.error('Failed to open Load/Save panel after quota error', modalErr);
      }
    } else {
      toast('Save failed', 'error');
    }
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
        const data = createAppSnapshot();
        await saveCharacter(data, name);
        cueSuccessfulSave();
        markAutoSaveSynced(data);
        queueCharacterConfirmation({ name, variant: 'created', key: `create:${name}:${data?.meta?.savedAt ?? Date.now()}`, meta: data?.meta });
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
  btnRules.addEventListener('click', () => {
    hasOpenedRulesModal = true;
    const loadRules = renderRules();
    show('modal-rules');
    if (loadRules && typeof loadRules.then === 'function') {
      loadRules.finally(() => queueRulesIdlePrefetch());
    } else {
      queueRulesIdlePrefetch();
    }
  });
}

/* ========= Auth ========= */
const welcomeLogin = $('welcome-login');
const welcomeContinue = $('welcome-continue');
const welcomeCreate = $('welcome-create');
const authModal = $('modal-auth');
const authTabLogin = $('auth-tab-login');
const authTabCreate = $('auth-tab-create');
const authPanelLogin = $('auth-panel-login');
const authPanelCreate = $('auth-panel-create');
const authLoginUsername = $('auth-login-username');
const authLoginPassword = $('auth-login-password');
const authCreateUsername = $('auth-create-username');
const authCreatePassword = $('auth-create-password');
const authCreateConfirm = $('auth-create-confirm');
const authPasswordPolicy = $('auth-password-policy');
const authLoginSubmit = $('auth-login-submit');
const authCreateSubmit = $('auth-create-submit');
const authError = $('auth-error');
const authCancel = $('auth-cancel');
const postAuthChoiceModal = $('modal-post-auth-choice');
const postAuthImport = $('post-auth-import');
const postAuthCreate = $('post-auth-create');
const postAuthSkip = $('post-auth-skip');
const postAuthCloudList = $('post-auth-cloud-list');
const claimModal = $('modal-claim-characters');
const claimCloudList = $('claim-cloud-list');
const claimDeviceList = $('claim-device-list');
const claimLegacyList = $('claim-legacy-list');
const claimFileInput = $('claim-file-input');
const claimFileImport = $('claim-file-import');
const claimTokenInput = $('claim-token-input');
const claimTokenSubmit = $('claim-token-submit');
const claimTokenAdmin = $('claim-token-admin');
const claimTokenSourceUid = $('claim-token-source-uid');
const claimTokenCharacterId = $('claim-token-character-id');
const claimTokenTargetUid = $('claim-token-target-uid');
const claimTokenExpiry = $('claim-token-expiry');
const claimTokenGenerate = $('claim-token-generate');
const claimTokenOutput = $('claim-token-output');
const conflictModal = $('modal-sync-conflict');
const conflictDescription = $('conflict-description');
const conflictKeepCloud = $('conflict-keep-cloud');
const conflictKeepLocal = $('conflict-keep-local');
const conflictMergeLater = $('conflict-merge-later');

let pendingPostAuthChoice = false;
const passwordPolicy = { ...PASSWORD_POLICY };
const syncConflictQueue = [];
let activeSyncConflict = null;

function setAuthView(view) {
  const isLogin = view === 'login';
  if (authTabLogin) authTabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
  if (authTabCreate) authTabCreate.setAttribute('aria-selected', isLogin ? 'false' : 'true');
  if (authPanelLogin) {
    authPanelLogin.hidden = !isLogin;
    authPanelLogin.setAttribute('aria-hidden', isLogin ? 'false' : 'true');
  }
  if (authPanelCreate) {
    authPanelCreate.hidden = isLogin;
    authPanelCreate.setAttribute('aria-hidden', isLogin ? 'true' : 'false');
  }
  if (!isLogin) {
    updatePasswordPolicyChecklist(authPasswordPolicy, authCreatePassword?.value || '', passwordPolicy);
  }
}

function setAuthError(message) {
  if (!authError) return;
  const text = typeof message === 'string' ? message.trim() : '';
  authError.textContent = text;
  authError.hidden = !text;
}

function setAuthBusy(busy) {
  const disabled = !!busy;
  [authLoginSubmit, authCreateSubmit, authTabLogin, authTabCreate].forEach(btn => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  });
}

function getFriendlySignupError(error) {
  const code = error?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That username is already taken.';
    case 'auth/invalid-email':
      return 'Enter a valid username.';
    case 'auth/network-request-failed':
      return 'Network error. Please try again.';
    default:
      return 'Unable to create account. Please try again.';
  }
}

if (authPasswordPolicy) {
  renderPasswordPolicyChecklist(authPasswordPolicy, passwordPolicy);
  updatePasswordPolicyChecklist(authPasswordPolicy, authCreatePassword?.value || '', passwordPolicy);
}

if (authCreatePassword) {
  authCreatePassword.addEventListener('input', () => {
    updatePasswordPolicyChecklist(authPasswordPolicy, authCreatePassword.value || '', passwordPolicy);
  });
}

function setDmVisibility(isDm) {
  const dmLogin = $('dm-login');
  const dmToggle = $('dm-tools-toggle');
  const dmMenu = $('dm-tools-menu');
  const hidden = !isDm;
  if (dmLogin) dmLogin.hidden = hidden;
  if (dmToggle) dmToggle.hidden = hidden;
  if (dmMenu) dmMenu.hidden = hidden;
}

function updateWelcomeContinue() {
  if (!welcomeContinue) return;
  const { uid } = getAuthState();
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const lastSave = readLastSaveName();
  const hasLocalSave = hasBootableLocalState({ storage, lastSaveName: lastSave, uid });
  const allowed = !!(uid || hasLocalSave);
  welcomeContinue.hidden = !hasLocalSave && !uid;
  welcomeContinue.disabled = !allowed;
  welcomeContinue.setAttribute('aria-disabled', allowed ? 'false' : 'true');
}

async function rehydrateLocalCache(uid) {
  const entries = await listCharacterIndex(uid);
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const hadLocal = hasBootableLocalState({ storage, lastSaveName: readLastSaveName(), uid });
  let restoredCount = 0;
  let updatedCount = 0;
  let firstRestoredName = '';
  const localUpdatedAt = payload => Number(
    payload?.meta?.updatedAtServer ??
    payload?.updatedAtServer ??
    payload?.meta?.updatedAt ??
    payload?.updatedAt
  ) || 0;
  for (const entry of entries) {
    const characterId = entry?.characterId || '';
    if (!characterId) continue;
    const name = entry?.name || characterId;
    let localPayload = null;
    try {
      localPayload = await loadLocal(name, { characterId });
    } catch {}
    const localUpdated = localPayload ? localUpdatedAt(localPayload) : 0;
    const cloudUpdated = Number(entry?.updatedAtServer || entry?.updatedAt) || 0;
    const lastSyncedAt = readLastSyncedAt(characterId);
    if (!lastSyncedAt && cloudUpdated > 0 && localUpdated === cloudUpdated) {
      writeLastSyncedAt(characterId, cloudUpdated);
    }
    if (lastSyncedAt > 0 && detectSyncConflict({ localUpdatedAt: localUpdated, cloudUpdatedAt: cloudUpdated, lastSyncedAt })) {
      try {
        const cloudPayload = await loadCloudCharacter(uid, characterId);
        queueSyncConflict({
          uid,
          name,
          characterId,
          localPayload,
          cloudPayload,
          localUpdatedAt: localUpdated,
          cloudUpdatedAt: cloudUpdated,
        });
      } catch (err) {
        console.error('Failed to load cloud data for conflict detection', err);
      }
      continue;
    }
    const shouldPull = !localPayload || shouldPullCloudCopy(localUpdated, cloudUpdated);
    if (!shouldPull) continue;
    try {
      const cloudPayload = await loadCloudCharacter(uid, characterId);
      ensureCharacterId(cloudPayload, name);
      await saveLocal(name, cloudPayload, { characterId });
      writeLastSyncedAt(characterId, Number(cloudPayload?.meta?.updatedAtServer ?? cloudPayload?.updatedAtServer ?? cloudPayload?.meta?.updatedAt ?? cloudPayload?.updatedAt) || cloudUpdated);
      if (!localPayload) {
        restoredCount += 1;
        if (!firstRestoredName) {
          firstRestoredName = name;
        }
      } else if (cloudUpdated > localUpdated) {
        updatedCount += 1;
      }
    } catch (err) {
      console.error('Failed to refresh local cache from cloud', err);
    }
  }
  if (!readLastSaveName() && firstRestoredName) {
    writeLastSaveName(firstRestoredName);
  }
  return {
    hadLocal,
    restoredCount,
    updatedCount,
    totalCloud: entries.length,
  };
}

function queueSyncConflict(conflict) {
  syncConflictQueue.push(conflict);
  if (!activeSyncConflict) {
    openNextSyncConflict();
  }
}

function openNextSyncConflict() {
  if (activeSyncConflict || !syncConflictQueue.length || !conflictModal) return;
  activeSyncConflict = syncConflictQueue.shift();
  const name = activeSyncConflict?.name || 'This character';
  if (conflictDescription) {
    conflictDescription.textContent = `${name} was edited locally and in the cloud since the last sync. Choose which version to keep.`;
  }
  show('modal-sync-conflict');
}

async function recordConflictBackups(conflict) {
  const { uid, characterId, localPayload, cloudPayload } = conflict || {};
  if (!characterId) return;
  try {
    if (localPayload) {
      storeConflictSnapshot(characterId, localPayload, { label: 'local' });
      if (uid) {
        await saveCloudConflictBackup(uid, characterId, localPayload, { label: 'local' });
      }
    }
  } catch (err) {
    console.error('Failed to store local conflict backup', err);
  }
  try {
    if (cloudPayload) {
      storeConflictSnapshot(characterId, cloudPayload, { label: 'cloud' });
      if (uid) {
        await saveCloudConflictBackup(uid, characterId, cloudPayload, { label: 'cloud' });
      }
    }
  } catch (err) {
    console.error('Failed to store cloud conflict backup', err);
  }
}

async function resolveSyncConflict(action) {
  if (!activeSyncConflict) return;
  const conflict = activeSyncConflict;
  activeSyncConflict = null;
  hide('modal-sync-conflict');
  await recordConflictBackups(conflict);
  const { uid, name, characterId, localPayload, cloudPayload, localUpdatedAt, cloudUpdatedAt } = conflict;
  try {
    if (action === 'keep-cloud' && cloudPayload) {
      await saveLocal(name, cloudPayload, { characterId });
      writeLastSyncedAt(characterId, cloudUpdatedAt);
      toast('Kept cloud version.', 'info');
    } else if (action === 'keep-local' && localPayload && uid) {
      const updatedAt = Date.now();
      const nextPayload = {
        ...localPayload,
        meta: {
          ...(localPayload?.meta && typeof localPayload.meta === 'object' ? localPayload.meta : {}),
          updatedAt,
        },
      };
      if (nextPayload.meta && Object.prototype.hasOwnProperty.call(nextPayload.meta, 'updatedAtServer')) {
        delete nextPayload.meta.updatedAtServer;
      }
      await saveCloudCharacter(uid, characterId, nextPayload);
      await saveCharacterIndexEntry(uid, characterId, {
        name: nextPayload?.meta?.name || name,
        updatedAt,
      });
      writeLastSyncedAt(characterId, updatedAt);
      toast('Kept local version.', 'info');
    } else {
      const resolved = Math.max(localUpdatedAt || 0, cloudUpdatedAt || 0);
      if (resolved) {
        writeLastSyncedAt(characterId, resolved);
      }
      toast('Saved both versions for later merge.', 'info');
    }
  } catch (err) {
    console.error('Failed to resolve sync conflict', err);
    toast('Failed to resolve conflict.', 'error');
  } finally {
    openNextSyncConflict();
  }
}

function openAuthModal(view = 'login') {
  if (!authModal) return;
  setAuthError('');
  setAuthView(view);
  hide(WELCOME_MODAL_ID);
  show('modal-auth');
}

function openPostAuthChoice() {
  if (!postAuthChoiceModal) return;
  show('modal-post-auth-choice');
  refreshPostAuthCloudList().catch(err => {
    console.error('Failed to refresh post-auth cloud list', err);
  });
}

function closePostAuthChoice() {
  hide('modal-post-auth-choice');
}

function openClaimModal() {
  if (!claimModal) return;
  show('modal-claim-characters');
  if (claimTokenOutput) {
    claimTokenOutput.textContent = '';
    claimTokenOutput.hidden = true;
  }
  refreshClaimModal().catch(err => console.error('Failed to refresh claim modal', err));
}

function closeClaimModal() {
  hide('modal-claim-characters');
}

async function handleAuthSubmit(mode) {
  try {
    setAuthError('');
    setAuthBusy(true);
    await initFirebaseAuth();
    if (mode === 'create') {
      const username = authCreateUsername?.value?.trim() || '';
      const password = authCreatePassword?.value || '';
      const confirm = authCreateConfirm?.value || '';
      const normalized = normalizeUsername(username);
      if (!username || !password) {
        setAuthError('Enter a username and password to continue.');
        return;
      }
      if (!normalized) {
        setAuthError('Username must be 3-20 characters using letters, numbers, or underscores.');
        return;
      }
      if (password !== confirm) {
        setAuthError('Passwords do not match.');
        return;
      }
      const lengthError = getPasswordLengthError(password, passwordPolicy);
      if (lengthError) {
        updatePasswordPolicyChecklist(authPasswordPolicy, password, passwordPolicy);
        setAuthError(lengthError);
        return;
      }
      pendingPostAuthChoice = true;
      await createAccountWithUsernamePassword(username, password);
    } else {
      const username = authLoginUsername?.value?.trim() || '';
      const password = authLoginPassword?.value || '';
      const normalized = normalizeUsername(username);
      if (!username || !password) {
        setAuthError('Enter your username and password to continue.');
        return;
      }
      if (!normalized) {
        setAuthError('Username must be 3-20 characters using letters, numbers, or underscores.');
        return;
      }
      pendingPostAuthChoice = true;
      await signInWithUsernamePassword(username, password);
    }
    hide('modal-auth');
  } catch (err) {
    console.error('Auth failed', err);
    if (mode === 'create') {
      const password = authCreatePassword?.value || '';
      const policyFeedback = applyPasswordPolicyError({
        container: authPasswordPolicy,
        password,
        policy: passwordPolicy,
        error: err,
      });
      if (policyFeedback) {
        setAuthError(policyFeedback.message);
      } else {
        setAuthError(getFriendlySignupError(err));
      }
    } else {
      setAuthError(err?.message || 'Unable to sign in.');
    }
  } finally {
    setAuthBusy(false);
  }
}


function setClaimTokenAdminVisibility(isDm) {
  if (!claimTokenAdmin) return;
  claimTokenAdmin.hidden = !isDm;
}

async function handleClaimTokenSubmit() {
  const token = claimTokenInput?.value?.trim() || '';
  if (!token) {
    toast('Enter a claim token.', 'info');
    return;
  }
  const { uid } = getAuthState();
  if (!uid) {
    toast('Login required to claim a token.', 'error');
    return;
  }
  try {
    const db = await getFirebaseDatabase();
    const tokenData = await consumeClaimToken(db, token, uid);
    const sourceUid = tokenData?.sourceUid || '';
    const characterId = tokenData?.characterId || '';
    if (!sourceUid || !characterId) {
      throw new Error('Invalid claim token payload.');
    }
    const cloudPayload = await loadCloudCharacter(sourceUid, characterId);
    const migrated = migrateSavePayload(cloudPayload);
    const { payload } = buildCanonicalPayload(migrated);
    payload.meta = {
      ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      ownerUid: uid,
      uid,
      deviceId: getDeviceId(),
      updatedAt: Date.now(),
    };
    payload.updatedAt = payload.meta.updatedAt;
    await saveCloudCharacter(uid, characterId, payload);
    await saveCharacterIndexEntry(uid, characterId, {
      name: payload?.meta?.name || payload?.character?.name || characterId,
      updatedAt: payload.meta.updatedAt,
    });
    writeLastSyncedAt(characterId, payload.meta.updatedAt);
    await saveLocal(payload?.meta?.name || characterId, payload, { characterId });
    toast('Character claimed from token.', 'success');
    claimTokenInput.value = '';
    await refreshClaimModal();
  } catch (err) {
    console.error('Failed to claim token', err);
    toast(err?.message || 'Failed to claim token.', 'error');
  }
}

async function handleClaimTokenGenerate() {
  const sourceUid = claimTokenSourceUid?.value?.trim() || '';
  const characterId = claimTokenCharacterId?.value?.trim() || '';
  const targetUid = claimTokenTargetUid?.value?.trim() || '';
  const expiryHours = Number(claimTokenExpiry?.value) || 24;
  if (!sourceUid || !characterId || !targetUid) {
    toast('Enter source UID, character ID, and target UID.', 'info');
    return;
  }
  try {
    const db = await getFirebaseDatabase();
    const expiresAt = Date.now() + Math.max(1, expiryHours) * 60 * 60 * 1000;
    const token = await createClaimToken(db, {
      sourceUid,
      characterId,
      targetUid,
      expiresAt,
    });
    if (claimTokenOutput) {
      claimTokenOutput.textContent = `Token: ${token}`;
      claimTokenOutput.hidden = false;
    }
    toast('Claim token generated.', 'success');
  } catch (err) {
    console.error('Failed to generate claim token', err);
    toast(err?.message || 'Failed to generate token.', 'error');
  }
}

async function refreshPostAuthCloudList() {
  if (!postAuthCloudList) return;
  const { uid } = getAuthState();
  if (!uid) {
    renderEmptyRow(postAuthCloudList, 'Sign in to view cloud characters.');
    return;
  }
  const entries = await listCharacterIndex(uid);
  renderCloudCharacterList(postAuthCloudList, entries, {
    actionLabel: 'Open',
    emptyMessage: 'No cloud characters found.',
    onOpen: async (entry) => {
      const characterId = entry?.characterId || '';
      if (!characterId) return;
      const name = entry?.name || characterId;
      try {
        const cloudPayload = await loadCloudCharacter(uid, characterId);
        ensureCharacterId(cloudPayload, name);
        await saveLocal(name, cloudPayload, { characterId });
        writeLastSaveName(name);
        closePostAuthChoice();
        toast(`Loaded ${name}.`, 'success');
      } catch (err) {
        console.error('Failed to open cloud character', err);
        toast('Failed to open cloud character.', 'error');
      }
    },
  });
}

async function handleLegacyClaim({ name, source }) {
  const { uid } = getAuthState();
  if (!uid) return;
  const data = source === 'cloud'
    ? await loadCloud(name)
    : await loadLegacyLocal(name);
  const migrated = migrateSavePayload(data);
  const { payload } = buildCanonicalPayload(migrated);
  const ownerUid = payload?.meta?.ownerUid || payload?.meta?.uid || '';
  if (ownerUid && ownerUid !== uid) {
    toast('This character is already claimed by another account.', 'error');
    return;
  }
  const characterId = ensureCharacterId(payload, name);
  try {
    const db = await getFirebaseDatabase();
    await claimCharacterLock(db, characterId, uid);
  } catch (err) {
    console.error('Failed to claim character lock', err);
    toast('This character is already claimed by another account.', 'error');
    return;
  }
  payload.meta = {
    ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    ownerUid: uid,
    uid,
    deviceId: getDeviceId(),
    name,
    displayName: name,
    legacyName: name,
    updatedAt: Date.now(),
  };
  payload.updatedAt = payload.meta.updatedAt;
  await saveCloudCharacter(uid, characterId, payload);
  await saveCharacterIndexEntry(uid, characterId, {
    name,
    updatedAt: payload.meta.updatedAt,
  });
  await saveLocal(name, payload, { characterId });
  setCurrentCharacter(name);
  syncMiniGamePlayerName();
  applyAppSnapshot(payload);
  setMode('edit');
  toast(`Claimed ${name}.`, 'success');
  await refreshClaimModal();
}

async function handleFileImport() {
  if (!claimFileInput?.files?.length) {
    toast('Choose a JSON file to import.', 'info');
    return;
  }
  const file = claimFileInput.files[0];
  const text = await file.text();
  const parsed = JSON.parse(text);
  const migrated = migrateSavePayload(parsed);
  const { payload } = buildCanonicalPayload(migrated);
  let name = payload?.meta?.name || payload?.character?.name || '';
  if (!name && typeof prompt === 'function') {
    name = prompt('Enter a character name for this import:') || '';
  }
  name = name.trim();
  if (!name) {
    toast('Character name required to import.', 'error');
    return;
  }
  const { uid } = getAuthState();
  if (!uid) return;
  const existingOwner = payload?.meta?.ownerUid || payload?.meta?.uid || '';
  if (existingOwner && existingOwner !== uid) {
    toast('This character is already claimed by another account.', 'error');
    return;
  }
  const characterId = ensureCharacterId(payload, name);
  try {
    const db = await getFirebaseDatabase();
    await claimCharacterLock(db, characterId, uid);
  } catch (err) {
    console.error('Failed to claim character lock', err);
    toast('This character is already claimed by another account.', 'error');
    return;
  }
  payload.meta = {
    ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
    ownerUid: uid,
    uid,
    deviceId: getDeviceId(),
    name,
    displayName: name,
    updatedAt: Date.now(),
  };
  payload.updatedAt = payload.meta.updatedAt;
  await saveCloudCharacter(uid, characterId, payload);
  await saveCharacterIndexEntry(uid, characterId, {
    name,
    updatedAt: payload.meta.updatedAt,
  });
  await saveLocal(name, payload, { characterId });
  setCurrentCharacter(name);
  syncMiniGamePlayerName();
  applyAppSnapshot(payload);
  setMode('edit');
  toast(`Imported ${name}.`, 'success');
  claimFileInput.value = '';
  await refreshClaimModal();
}

async function refreshClaimModal() {
  const { uid } = getAuthState();
  if (!uid) return;
  if (claimCloudList) {
    claimCloudList.textContent = '';
    const entries = await listCharacterIndex(uid);
    renderCloudCharacterList(claimCloudList, entries, {
      actionLabel: 'Open',
      emptyMessage: 'No cloud characters found.',
      onOpen: (entry) => {
        const name = entry?.name || entry?.characterId;
        if (!name) return;
        openCharacterModalByName(name);
        closeClaimModal();
      },
    });
  }

  if (claimDeviceList) {
    claimDeviceList.textContent = '';
    const legacyLocal = listLegacyLocalSaves();
    if (!legacyLocal.length) {
      renderEmptyRow(claimDeviceList, 'No legacy local saves found.');
    } else {
      legacyLocal.forEach(name => {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'cc-btn cc-btn--primary';
        claimBtn.type = 'button';
        claimBtn.textContent = 'Claim';
        claimBtn.addEventListener('click', () => handleLegacyClaim({ name, source: 'local' }).catch(err => {
          console.error('Failed to claim legacy save', err);
          toast('Failed to claim legacy save.', 'error');
        }));
        claimDeviceList.append(buildClaimRow({
          name,
          meta: 'Legacy local save',
          actions: [claimBtn],
        }));
      });
    }
  }

  if (claimLegacyList) {
    claimLegacyList.textContent = '';
    let legacyCloud = [];
    try {
      legacyCloud = await listCloudSaves();
    } catch (err) {
      console.warn('Failed to list legacy cloud saves', err);
    }
    if (!legacyCloud.length) {
      renderEmptyRow(claimLegacyList, 'No legacy cloud saves found.');
    } else {
      legacyCloud.forEach(name => {
        const claimBtn = document.createElement('button');
        claimBtn.className = 'cc-btn cc-btn--primary';
        claimBtn.type = 'button';
        claimBtn.textContent = 'Claim';
        claimBtn.addEventListener('click', () => handleLegacyClaim({ name, source: 'cloud' }).catch(err => {
          console.error('Failed to claim legacy save', err);
          toast('Failed to claim legacy save.', 'error');
        }));
        claimLegacyList.append(buildClaimRow({
          name,
          meta: 'Legacy cloud save',
          actions: [claimBtn],
        }));
      });
    }
  }
}

function createNewCharacterFromModal() {
  if (!getAuthState().uid) {
    openAuthModal();
    return;
  }
  const name = typeof prompt === 'function' ? prompt('Enter new character name:') : '';
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;
  setCurrentCharacter(clean);
  syncMiniGamePlayerName();
  setPinInteractionGuard('', { locked: false });
  applyAppSnapshot(createDefaultSnapshot());
  setMode('edit');
  queueCharacterConfirmation({ name: clean, variant: 'created', key: `create:${clean}:${Date.now()}` });
  toast(`Switched to ${clean}`, 'success');
}

function handleAuthStateChange({ uid, isDm } = {}) {
  setDmVisibility(!!isDm);
  setClaimTokenAdminVisibility(!!isDm);
  if (uid) {
    setActiveUserId(uid);
    setActiveAuthUserId(uid);
    writeLastUserUid(uid);
    welcomeModalDismissed = true;
    dismissWelcomeModal();
    updateWelcomeContinue();
    rehydrateLocalCache(uid)
      .then(({ hadLocal, restoredCount, updatedCount, totalCloud } = {}) => {
        restoreLastLoadedCharacter().catch(err => {
          console.error('Failed to restore last loaded character', err);
        });
        if (!hadLocal && totalCloud === 1 && restoredCount === 1) {
          pendingPostAuthChoice = false;
          toast('Restored from cloud', 'info', { duration: 3000 });
        } else {
          if (!hadLocal && restoredCount > 0) {
            toast(`Restored ${restoredCount} character(s) from cloud`, 'info', { duration: 3000 });
          } else if (hadLocal && updatedCount > 0) {
            toast(`Updated ${updatedCount} character(s) from cloud`, 'info', { duration: 3000 });
          }
          if (pendingPostAuthChoice) {
            pendingPostAuthChoice = false;
            openPostAuthChoice();
          }
        }
      })
      .catch(err => console.error('Failed to rehydrate local cache', err));
    return;
  }
  setActiveUserId('');
  setActiveAuthUserId('');
  welcomeModalDismissed = false;
  welcomeSequenceComplete = false;
  updateWelcomeContinue();
  queueWelcomeModal({ immediate: true });
}

if (welcomeLogin) {
  welcomeLogin.addEventListener('click', () => openAuthModal('login'));
}
if (welcomeCreate) {
  welcomeCreate.addEventListener('click', () => openAuthModal('create'));
}
if (welcomeContinue) {
  welcomeContinue.addEventListener('click', () => {
    updateWelcomeContinue();
    if (!welcomeContinue.disabled) {
      dismissWelcomeModal();
      restoreLastLoadedCharacter().catch(err => {
        console.error('Failed to restore last loaded character', err);
      });
      return;
    }
    openAuthModal();
  });
}
if (authTabLogin) {
  authTabLogin.addEventListener('click', () => setAuthView('login'));
}
if (authTabCreate) {
  authTabCreate.addEventListener('click', () => setAuthView('create'));
}
if (authLoginSubmit) {
  authLoginSubmit.addEventListener('click', () => handleAuthSubmit('login'));
}
if (authCreateSubmit) {
  authCreateSubmit.addEventListener('click', () => handleAuthSubmit('create'));
}
if (authCancel) {
  authCancel.addEventListener('click', () => {
    hide('modal-auth');
    if (!getAuthState().uid) {
      queueWelcomeModal({ immediate: true });
    }
  });
}
if (postAuthImport) {
  postAuthImport.addEventListener('click', () => {
    closePostAuthChoice();
    openClaimModal();
  });
}
if (postAuthCreate) {
  postAuthCreate.addEventListener('click', () => {
    closePostAuthChoice();
    createNewCharacterFromModal();
  });
}
if (postAuthSkip) {
  postAuthSkip.addEventListener('click', () => {
    closePostAuthChoice();
  });
}
if (claimFileImport) {
  claimFileImport.addEventListener('click', () => {
    handleFileImport().catch(err => {
      console.error('Failed to import file', err);
      toast('Failed to import file.', 'error');
    });
  });
}
if (claimTokenSubmit) {
  claimTokenSubmit.addEventListener('click', () => {
    handleClaimTokenSubmit();
  });
}
if (claimTokenGenerate) {
  claimTokenGenerate.addEventListener('click', () => {
    handleClaimTokenGenerate();
  });
}
if (conflictKeepCloud) {
  conflictKeepCloud.addEventListener('click', () => {
    resolveSyncConflict('keep-cloud');
  });
}
if (conflictKeepLocal) {
  conflictKeepLocal.addEventListener('click', () => {
    resolveSyncConflict('keep-local');
  });
}
if (conflictMergeLater) {
  conflictMergeLater.addEventListener('click', () => {
    resolveSyncConflict('merge-later');
  });
}
if (conflictModal) {
  const handleConflictDismiss = event => {
    const isOverlay = event.target === conflictModal;
    const closeButton = event.target?.closest?.('[data-close]');
    if (!isOverlay && !closeButton) return;
    event.preventDefault();
    event.stopPropagation();
    resolveSyncConflict('merge-later');
  };
  conflictModal.addEventListener('click', handleConflictDismiss, true);
}

setAuthView('login');
initFirebaseAuth().catch(err => console.error('Failed to initialize auth', err));
onAuthStateChanged(handleAuthStateChange);
handleAuthStateChange(getAuthState());

const welcomeOverlay = getWelcomeModal();
const welcomeOverlayIsElement = Boolean(
  welcomeOverlay &&
  typeof welcomeOverlay === 'object' &&
  typeof welcomeOverlay.addEventListener === 'function' &&
  typeof welcomeOverlay.classList?.contains === 'function' &&
  typeof welcomeOverlay.nodeType === 'number'
);
if (welcomeOverlayIsElement) {
  const updatePlayerToolsTabForWelcome = () => {
    const shouldHideTab = !welcomeOverlay.classList.contains('hidden');
    setPlayerToolsTabHidden(shouldHideTab);
  };
  updatePlayerToolsTabForWelcome();
  if (typeof MutationObserver === 'function') {
    const welcomeModalObserver = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.type === 'attributes')) {
        updatePlayerToolsTabForWelcome();
      }
    });
    try {
      welcomeModalObserver.observe(welcomeOverlay, { attributes: true, attributeFilter: ['class', 'hidden'] });
    } catch (err) {
      // jsdom may provide a mock that is not a fully qualified Node instance
      console.warn('Unable to observe welcome overlay mutations; falling back to transition listener.', err);
      welcomeOverlay.addEventListener('transitionend', event => {
        if (event.target === welcomeOverlay) {
          updatePlayerToolsTabForWelcome();
        }
      });
    }
  } else {
    welcomeOverlay.addEventListener('transitionend', event => {
      if (event.target === welcomeOverlay) {
        updatePlayerToolsTabForWelcome();
      }
    });
  }
}

const characterConfirmationModal = $(CHARACTER_CONFIRMATION_MODAL_ID);
const characterConfirmationContinue = $('character-confirmation-continue');
const characterConfirmationClose = $('character-confirmation-close');
if (characterConfirmationModal) {
  characterConfirmationModal.addEventListener('click', event => {
    if (event.target === characterConfirmationModal) {
      dismissCharacterConfirmation();
    }
  }, { capture: true });
}
if (characterConfirmationContinue) {
  characterConfirmationContinue.addEventListener('click', () => {
    dismissCharacterConfirmation();
  });
}
if (characterConfirmationClose) {
  characterConfirmationClose.addEventListener('click', () => {
    dismissCharacterConfirmation();
  });
}
document.addEventListener('keydown', event => {
  if (event?.key === 'Escape' && characterConfirmationActive) {
    dismissCharacterConfirmation();
  }
});

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
  let swUrl = 'sw.js';
  const SW_BUILD_STORAGE_KEY = 'cc:sw-build';
  try {
    if (typeof document !== 'undefined' && document.baseURI) {
      swUrl = new URL('sw.js', document.baseURI).href;
    } else if (typeof window !== 'undefined' && window.location?.href) {
      swUrl = new URL('sw.js', window.location.href).href;
    }
  } catch (error) {
    swUrl = 'sw.js';
  }
  navigator.serviceWorker.register(swUrl).catch(e => console.error('SW reg failed', e));
  let hadController = Boolean(navigator.serviceWorker.controller);
  const getLocalStorageSafe = () => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  };
  const handleSwBuild = payload => {
    const build = typeof payload?.build === 'string' ? payload.build : '';
    if (!build) return;
    const storage = getLocalStorageSafe();
    const previous = storage ? storage.getItem(SW_BUILD_STORAGE_KEY) : '';
    if (previous && previous !== build) {
      navigator.serviceWorker.ready
        .then(reg => reg.update())
        .catch(() => {});
      announceContentUpdate({
        message: 'New Codex content is available.',
        updatedAt: Date.now(),
        source: 'sw-build',
      });
    }
    if (storage) {
      try {
        storage.setItem(SW_BUILD_STORAGE_KEY, build);
      } catch {}
    }
  };
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
      scheduleOfflinePrefetch(1500);
      return;
    }
    if (type === 'sw-build') {
      handleSwBuild(payload);
      return;
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
        scheduleOfflinePrefetch(2000);
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

  let surgeTimerId = null;
  const SURGE_TICK_INTERVAL_MS = 1000 * 10;

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
    // Optional background timer for timed surges. In testing environments like
    // jsdom the perpetual interval prevents Jest from exiting, so only install
    // it when we're running in a real browser context.
    if (!IS_JSDOM_ENV && surgeTimerId === null && typeof setInterval === 'function') {
      surgeTimerId = setInterval(tick, SURGE_TICK_INTERVAL_MS);
    }
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
      window.dmNotify?.(`RP ${state.rp} (bank ${state.banked})`, { actionScope: 'minor' });
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
    window.dmNotify?.(`Heroic Surge activated (${mode})`, { actionScope: 'major' });
    if (state.banked !== prevBank) {
      window.dmNotify?.(`RP bank ${state.banked}`, { actionScope: 'minor' });
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
    window.dmNotify?.(`Heroic Surge ended (${reason})`, { actionScope: 'major' });
  }

  function clearAftermath() {
    state.aftermathPending = false;
    applyStateToUI();
    save();
    dispatch("rp:aftermath:cleared", {});
    window.dmNotify?.("Heroic Surge aftermath cleared", { actionScope: 'minor' });
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
