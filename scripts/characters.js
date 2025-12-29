import {
  saveLocal,
  loadLocal,
  listLocalSaves,
  deleteSave,
  saveCloud,
  loadCloud,
  listCloudSaves,
  listCloudBackups,
  listCloudBackupNames,
  loadCloudBackup,
  saveCloudAutosave,
  listCloudAutosaves,
  listCloudAutosaveNames,
  loadCloudAutosave,
  deleteCloud,
} from './storage.js';
import { clearLastSaveName, readLastSaveName, writeLastSaveName } from './last-save.js';
import { hasPin, verifyPin as verifyStoredPin, clearPin, movePin, syncPin, ensureAuthoritativePinState } from './pin.js';
import { toast, dismissToast } from './notifications.js';
import { canonicalCharacterKey, friendlyCharacterName } from './character-keys.js';

function safeToast(message, type = 'error', options = {}) {
  if (!message) return;
  try {
    const normalizedOptions = typeof options === 'object' && options !== null ? options : {};
    const payload = {
      duration: 5000,
      ...normalizedOptions,
      type: type || normalizedOptions.type || 'error',
    };
    toast(message, payload);
  } catch (err) {
    console.error('Failed to display toast', err);
  }
}

const LOCAL_STORAGE_QUOTA_ERROR_CODE = 'local-storage-quota-exceeded';
const CHARACTER_SAVE_QUOTA_ERROR_CODE = 'character-save-quota-exceeded';
const CHARACTER_ID_STORAGE_PREFIX = 'cc:character-id:';
export const SAVE_SCHEMA_VERSION = 2;
export const UI_STATE_VERSION = 2;
export const APP_VERSION = '1.0.0';

function getLocalStorageSafe() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function normalizedCharacterName(name) {
  const canonical = canonicalCharacterKey(name);
  if (canonical) return canonical;
  return typeof name === 'string' ? name.trim() : '';
}

function getCharacterIdStorageKey(name) {
  const normalized = normalizedCharacterName(name) || name;
  return `${CHARACTER_ID_STORAGE_PREFIX}${normalized}`;
}

function readCharacterIdForName(name) {
  const storage = getLocalStorageSafe();
  if (!storage) return '';
  try {
    const stored = storage.getItem(getCharacterIdStorageKey(name));
    return typeof stored === 'string' && stored.trim() ? stored.trim() : '';
  } catch {
    return '';
  }
}

function writeCharacterIdForName(name, id) {
  const storage = getLocalStorageSafe();
  if (!storage || !id || !name) return;
  try {
    storage.setItem(getCharacterIdStorageKey(name), id);
  } catch {}
}

function removeCharacterIdForName(name) {
  const storage = getLocalStorageSafe();
  if (!storage || !name) return;
  try {
    storage.removeItem(getCharacterIdStorageKey(name));
  } catch {}
}

function generateCharacterId() {
  try {
    if (typeof crypto === 'object' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 20; i++) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return token;
}

function ensureCharacterId(payload, name) {
  if (!payload || typeof payload !== 'object') return '';
  const character = payload.character && typeof payload.character === 'object' ? payload.character : null;
  const existing = character?.characterId;
  const stored = readCharacterIdForName(name);
  const resolved = typeof existing === 'string' && existing.trim()
    ? existing.trim()
    : stored;
  const characterId = resolved || generateCharacterId();
  if (character) {
    character.characterId = characterId;
  }
  if (name && characterId) {
    writeCharacterIdForName(name, characterId);
  }
  return characterId;
}

function migrateCharacterIdKey(oldName, newName, characterId) {
  if (!oldName || !newName || oldName === newName) return;
  if (!characterId) return;
  removeCharacterIdForName(oldName);
  writeCharacterIdForName(newName, characterId);
}

function displayCharacterName(name) {
  const friendly = friendlyCharacterName(name);
  if (friendly) return friendly;
  const canonical = canonicalCharacterKey(name);
  return friendlyCharacterName(canonical || name || '') || '';
}

function reportCharacterError(err, contextMessage) {
  const baseError = err instanceof Error ? err : new Error(String(err));
  const context = contextMessage || 'Character operation failed';
  const detail = baseError.message && !baseError.message.startsWith(context)
    ? `${context}: ${baseError.message}`
    : context;
  baseError.message = detail;
  console.error(detail, err);
  if (baseError.toastShown !== true) {
    safeToast(detail, 'error');
    baseError.toastShown = true;
  }
  return baseError;
}

function normalizeLocalSaveError(err) {
  if (
    err &&
    (
      err.code === LOCAL_STORAGE_QUOTA_ERROR_CODE ||
      err.name === 'LocalStorageQuotaError' ||
      err.isQuotaExceeded === true
    )
  ) {
    const quotaError = new Error('Local storage is full. Open Load/Save to export or delete old saves, then try again.');
    quotaError.name = 'CharacterSaveQuotaError';
    quotaError.code = CHARACTER_SAVE_QUOTA_ERROR_CODE;
    quotaError.isQuotaExceeded = true;
    quotaError.cause = err instanceof Error ? err : undefined;
    quotaError.toastShown = err && err.toastShown === true;
    quotaError.originalError = err;
    return quotaError;
  }
  return err;
}
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
  POWER_SUGGESTION_STRENGTHS,
  POWER_TARGET_SHAPES,
  POWER_USES,
  getRangeOptionsForShape,
} from './power-metadata.js';

// Migrate legacy DM saves to the new "The DM" name.
// Older versions stored the DM character under names like "Shawn",
// "Player :Shawn", or simply "DM". Ensure any of these variants are renamed.
try {
  const legacyNames = ['Shawn', 'Player :Shawn', 'DM'];
  for (const name of legacyNames) {
    const legacy = localStorage.getItem(`save:${name}`);
    if (!legacy) continue;
    // Only create the The DM save if it doesn't already exist to avoid
    // overwriting newer data.
    if (!localStorage.getItem('save:The DM')) {
      localStorage.setItem('save:The DM', legacy);
    }
    localStorage.removeItem(`save:${name}`);
    if (readLastSaveName() === name) {
      writeLastSaveName('The DM');
    }
  }
} catch {}


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

function suggestSpCost(intensity = 'Core') {
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
  const { casterSaveAbility = 'WIS', dcFormula = 'Proficiency', proficiencyBonus = 0, abilityMods = {} } = settings;
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
    case 'Shape-shifter':
      return 'Kinetic';
    default:
      return null;
  }
}

function generatePowerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return `power-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function normalizeRangeForShape(shape, range) {
  const trimmed = typeof range === 'string' ? range.trim() : '';
  if (shape === 'Melee') return 'Melee';
  if (shape === 'Self') return trimmed || 'Self';
  if (shape === 'Aura' && (!trimmed || /^self$/i.test(trimmed))) return 'Self';
  const options = getRangeOptionsForShape(shape);
  if (trimmed && options.includes(trimmed)) return trimmed;
  if (trimmed) return trimmed;
  if (options.length) return options[0];
  return shape === 'Aura' ? '10 ft' : '30 ft';
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
  if (lower.includes('fire') || lower.includes('flame') || lower.includes('ember')) return 'Fire';
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
  if (!text) {
    if (shape === 'Melee') return 'Melee';
    if (shape === 'Self') return 'Self';
    return normalizeRangeForShape(shape, '');
  }
  const ftMatch = text.match(/([0-9]{1,3})\s*ft/i);
  if (ftMatch) {
    const candidate = `${ftMatch[1]} ft`;
    return normalizeRangeForShape(shape, candidate);
  }
  if (shape === 'Melee') return 'Melee';
  if (shape === 'Self') return 'Self';
  if (shape === 'Aura' && text.toLowerCase().includes('self')) return 'Self';
  return normalizeRangeForShape(shape, text);
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
    const dice = POWER_DAMAGE_DICE.includes(`${diceMatch[1]}d6`) ? `${diceMatch[1]}d6` : '1d6';
    let type = detectDamageTypeFromText(effectText) || defaultDamageType('');
    if (!type || !POWER_DAMAGE_TYPES.includes(type)) type = 'Kinetic';
    let onSave = 'Half';
    if (/negate/i.test(saveText) || /negate/i.test(effectText)) onSave = 'Negate';
    else if (/full/i.test(saveText)) onSave = 'Full';
    damage = { dice, type, onSave };
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

function damagePackagesEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.dice === b.dice && a.type === b.type && a.onSave === b.onSave;
}

function normalizeStoredPower(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { power: null, changed: false };
  }
  let changed = false;
  let base = raw;
  if (
    raw.effect !== undefined
    || raw.sp !== undefined
    || raw.save !== undefined
    || raw.range !== undefined
  ) {
    base = migrateLegacyPower(raw);
    changed = true;
  }
  const shape = POWER_TARGET_SHAPES.includes(base.shape) ? base.shape : 'Ranged Single';
  const range = normalizeRangeForShape(shape, base.range);
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
    cooldown = Math.max(10, cooldown || 10);
  } else if (uses === 'Cooldown' && cooldown === 0) {
    cooldown = 1;
  }
  const damage = base.damage && typeof base.damage === 'object'
    ? {
        dice: POWER_DAMAGE_DICE.includes(base.damage.dice) ? base.damage.dice : '1d6',
        type: POWER_DAMAGE_TYPES.includes(base.damage.type)
          ? base.damage.type
          : (defaultDamageType(base.style) || 'Kinetic'),
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
    name: typeof base.name === 'string' ? base.name : '',
    style: POWER_STYLES.includes(base.style) ? base.style : (base.style || ''),
    actionType: POWER_ACTION_TYPES.includes(base.actionType) ? base.actionType : 'Action',
    shape,
    range,
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
    special: typeof base.special === 'string' ? base.special : '',
    legacyText: base.legacyText || base.originalText || '',
    originalText: base.originalText || base.legacyText || (typeof base.effect === 'string' ? base.effect : ''),
    migration: !!base.migration,
    needsReview: !!base.needsReview,
  };
  if (normalized.intensity === 'Ultimate') {
    normalized.cooldown = Math.max(10, normalized.cooldown || 10);
    normalized.uses = 'Cooldown';
  }
  if (normalized.duration === 'Sustained') {
    normalized.concentration = true;
  }
  const baseDamage = base.damage && typeof base.damage === 'object'
    ? {
        dice: base.damage.dice,
        type: base.damage.type,
        onSave: base.damage.onSave,
      }
    : null;
  if (!damagePackagesEqual(baseDamage, normalized.damage)) changed = true;
  const compareKeys = [
    'id',
    'name',
    'style',
    'actionType',
    'shape',
    'range',
    'effectTag',
    'intensity',
    'spCost',
    'requiresSave',
    'saveAbilityTarget',
    'duration',
    'description',
    'secondaryTag',
    'concentration',
    'uses',
    'cooldown',
    'scaling',
    'special',
    'legacyText',
    'originalText',
    'migration',
    'needsReview',
  ];
  for (const key of compareKeys) {
    const prev = base ? base[key] : undefined;
    const next = normalized[key];
    if (!(prev === next || (Number.isNaN(prev) && Number.isNaN(next)))) {
      changed = true;
      break;
    }
  }
  return { power: normalized, changed };
}

function formatStoredPowerRange(power) {
  const shape = power.shape;
  const range = power.range;
  switch (shape) {
    case 'Melee':
      return 'Melee range';
    case 'Line':
      return `${range || '30 ft'} Line`;
    case 'Cone':
      return `${range || '15 ft'} Cone`;
    case 'Radius':
      return `${range || '10 ft'} Radius`;
    case 'Self':
      return 'Self';
    case 'Aura':
      if (!range || range === 'Self') return 'Aura';
      return `Aura ${range}`;
    case 'Ranged Single':
    default:
      return range || '30 ft';
  }
}

function composeStoredPowerRulesText(power, settings) {
  if (!power) return '';
  const pieces = [];
  pieces.push(power.actionType || 'Action');
  pieces.push(formatStoredPowerRange(power));
  if (power.requiresSave) {
    const ability = power.saveAbilityTarget || settings?.casterSaveAbility || 'WIS';
    const dc = computeSaveDc(settings);
    pieces.push(`${ability} Save DC ${dc}`);
  }
  let effectPart = '';
  if (power.damage) {
    effectPart = `${power.damage.dice} ${power.damage.type}`;
    if (power.damage.onSave) {
      effectPart += `, ${power.damage.onSave} on Save`;
    }
  } else if (power.effectTag) {
    effectPart = power.effectTag;
  }
  if (power.secondaryTag) {
    effectPart += effectPart ? `, ${power.secondaryTag}` : power.secondaryTag;
  }
  if (effectPart) {
    pieces.push(effectPart);
  }
  pieces.push(`Duration: ${power.duration || 'Instant'}`);
  pieces.push(`Cost: ${power.spCost || 0} SP`);
  if (power.concentration) {
    pieces.push('Concentration +1 SP per round');
  }
  if (power.intensity === 'Ultimate') {
    pieces.push('Cooldown 10 rounds');
  } else if (power.uses === 'Cooldown' && power.cooldown > 0) {
    pieces.push(`Cooldown ${power.cooldown} rounds`);
  }
  return pieces.join(' • ');
}

function normalizeStoredPowerSettings(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { settings: null, changed: false };
  }
  let changed = false;
  const abilityRaw = typeof raw.casterSaveAbility === 'string' ? raw.casterSaveAbility.toUpperCase() : '';
  const casterSaveAbility = POWER_SAVE_ABILITIES.includes(abilityRaw) ? abilityRaw : 'WIS';
  if (casterSaveAbility !== raw.casterSaveAbility) changed = true;
  const dcFormula = raw.dcFormula === 'Simple' ? 'Simple' : 'Proficiency';
  if (dcFormula !== raw.dcFormula) changed = true;
  const profRaw = Number(raw.proficiencyBonus);
  const proficiencyBonus = Number.isFinite(profRaw) ? Math.max(-5, Math.trunc(profRaw)) : 0;
  if (!Number.isFinite(profRaw) || proficiencyBonus !== raw.proficiencyBonus) changed = true;
  const abilityMods = {};
  const sourceMods = raw.abilityMods && typeof raw.abilityMods === 'object' ? raw.abilityMods : {};
  for (const ability of POWER_SAVE_ABILITIES) {
    const rawValue = Number(sourceMods[ability]);
    const normalizedValue = Number.isFinite(rawValue) ? Math.trunc(rawValue) : 0;
    abilityMods[ability] = normalizedValue;
    if (normalizedValue !== sourceMods[ability]) changed = true;
  }
  const rangeUnitRaw = typeof raw.defaultRangeUnit === 'string' ? raw.defaultRangeUnit.toLowerCase() : '';
  const defaultRangeUnit = POWER_RANGE_UNITS.includes(rangeUnitRaw) ? rangeUnitRaw : 'feet';
  if (defaultRangeUnit !== raw.defaultRangeUnit) changed = true;
  const suggestionRaw = typeof raw.autoSuggestionStrength === 'string' ? raw.autoSuggestionStrength.toLowerCase() : '';
  const autoSuggestionStrength = POWER_SUGGESTION_STRENGTHS.includes(suggestionRaw)
    ? suggestionRaw
    : 'conservative';
  if (autoSuggestionStrength !== raw.autoSuggestionStrength) changed = true;
  const showMetricRanges = !!raw.showMetricRanges;
  if (showMetricRanges !== raw.showMetricRanges) changed = true;
  const preferShortRulesText = !!raw.preferShortRulesText;
  if (preferShortRulesText !== raw.preferShortRulesText) changed = true;
  const normalized = {
    casterSaveAbility,
    dcFormula,
    proficiencyBonus,
    abilityMods,
    defaultRangeUnit,
    autoSuggestionStrength,
    showMetricRanges,
    preferShortRulesText,
  };
  return { settings: normalized, changed };
}

function normalizeCharacterData(data) {
  if (!data || typeof data !== 'object') {
    return { data, changed: false };
  }
  let changed = false;
  let settings = null;
  if (data.powerSettings && typeof data.powerSettings === 'object') {
    const { settings: normalizedSettings, changed: settingsChanged } = normalizeStoredPowerSettings(data.powerSettings);
    if (normalizedSettings) {
      data.powerSettings = normalizedSettings;
      settings = normalizedSettings;
    }
    if (settingsChanged) changed = true;
  }
  if (Array.isArray(data.powers)) {
    const normalizedPowers = [];
    for (const entry of data.powers) {
      const { power, changed: powerChanged } = normalizeStoredPower(entry);
      if (!power) {
        if (entry) changed = true;
        continue;
      }
      const prevRules = typeof entry?.rulesText === 'string' ? entry.rulesText : '';
      const nextRules = composeStoredPowerRulesText(power, settings);
      power.rulesText = nextRules;
      if (prevRules !== nextRules) changed = true;
      if (powerChanged) changed = true;
      normalizedPowers.push(power);
    }
    if (normalizedPowers.length !== data.powers.length) changed = true;
    data.powers = normalizedPowers;
  }
  return { data, changed };
}

const normalizedAutosaveName = (name = '') => normalizedCharacterName(name) || '__global';
const AUTOSAVE_LATEST_KEY = (name = '') => `autosave:${normalizedAutosaveName(name)}:latest`;
const AUTOSAVE_PREVIOUS_KEY = (name = '') => `autosave:${normalizedAutosaveName(name)}:previous`;

export function calculateSnapshotChecksum(payload = {}) {
  try {
    const json = JSON.stringify({ character: payload.character ?? {}, ui: payload.ui ?? null });
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
      hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0;
    }
    return `c${Math.abs(hash)}`;
  } catch (err) {
    console.error('Failed to compute snapshot checksum', err);
    return null;
  }
}

function normalizeSnapshotMeta(meta = {}, character = {}, ui = null, fallback = {}) {
  const schemaVersion = typeof meta.schemaVersion === 'number' ? meta.schemaVersion : fallback.schemaVersion;
  const uiVersion = typeof meta.uiVersion === 'number' ? meta.uiVersion : fallback.uiVersion;
  const savedAt = Number.isFinite(meta.savedAt) ? meta.savedAt : Date.now();
  const appVersion = typeof meta.appVersion === 'string' && meta.appVersion ? meta.appVersion : APP_VERSION;
  const ownerUid = typeof meta.ownerUid === 'string' && meta.ownerUid
    ? meta.ownerUid
    : (typeof character?.ownerUid === 'string' ? character.ownerUid : '');
  const checksum = typeof meta.checksum === 'string' && meta.checksum
    ? meta.checksum
    : calculateSnapshotChecksum({ character, ui }) || fallback.checksum || null;
  const normalized = {
    schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : SAVE_SCHEMA_VERSION,
    uiVersion: typeof uiVersion === 'number' ? uiVersion : UI_STATE_VERSION,
    savedAt,
    appVersion,
    checksum,
  };
  if (ownerUid) {
    normalized.ownerUid = ownerUid;
  }
  return normalized;
}

export function isSnapshotChecksumValid(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const expected = snapshot.meta?.checksum || snapshot.checksum || null;
  if (!expected) return true;
  const actual = calculateSnapshotChecksum({ character: snapshot.character, ui: snapshot.ui });
  return expected === actual;
}

function isCharacterPayloadValid(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const character = snapshot.character;
  return !!(character && typeof character === 'object' && !Array.isArray(character));
}

export function loadLocalAutosaveSnapshot(name) {
  if (typeof localStorage === 'undefined') return { latest: null, previous: null };
  const readSnapshot = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return migrateSavePayload(JSON.parse(raw));
    } catch (err) {
      console.error('Failed to read autosave snapshot', err);
      return null;
    }
  };
  return {
    latest: readSnapshot(AUTOSAVE_LATEST_KEY(name)),
    previous: readSnapshot(AUTOSAVE_PREVIOUS_KEY(name)),
  };
}

export function persistLocalAutosaveSnapshot(name, snapshot, serialized) {
  if (typeof localStorage === 'undefined' || !snapshot || !name) return;
  const latestKey = AUTOSAVE_LATEST_KEY(name);
  const previousKey = AUTOSAVE_PREVIOUS_KEY(name);
  try {
    const latestSerialized = serialized || JSON.stringify(snapshot);
    const existing = localStorage.getItem(latestKey);
    if (existing) {
      localStorage.setItem(previousKey, existing);
    }
    localStorage.setItem(latestKey, latestSerialized);
  } catch (err) {
    console.error('Failed to persist autosave snapshots', err);
  }
}

export function preflightSnapshotForLoad(name, snapshot, { showRecoveryToast = true } = {}) {
  const migrated = migrateSavePayload(snapshot);
  const isValid = isSnapshotChecksumValid(migrated) && isCharacterPayloadValid(migrated);
  if (isValid) {
    const { payload, changed } = buildCanonicalPayload(migrated);
    return { payload, recovered: false, changed };
  }
  const autosaves = loadLocalAutosaveSnapshot(name);
  const fallback = [autosaves.latest, autosaves.previous]
    .find(candidate => isSnapshotChecksumValid(candidate) && isCharacterPayloadValid(candidate));
  if (fallback) {
    if (showRecoveryToast) {
      safeToast('Primary save looked corrupted. Recovered from autosave.', 'warning', { duration: 4000 });
    }
    const { payload, changed } = buildCanonicalPayload(fallback);
    return { payload, recovered: true, changed };
  }
  const err = new Error('Character data is corrupted or incomplete. Please try a backup or another autosave.');
  err.toastShown = true;
  throw err;
}

export function migrateSavePayload(payload) {
  const baseMeta = { schemaVersion: SAVE_SCHEMA_VERSION, uiVersion: UI_STATE_VERSION, savedAt: Date.now(), appVersion: APP_VERSION, checksum: null };
  if (!payload || typeof payload !== 'object') {
    const character = {};
    const meta = normalizeSnapshotMeta({}, character, null, baseMeta);
    return { character, ui: null, meta, schemaVersion: meta.schemaVersion, uiVersion: meta.uiVersion, savedAt: meta.savedAt, appVersion: meta.appVersion, checksum: meta.checksum };
  }
  const hasStructuredFields = 'character' in payload || 'ui' in payload || typeof payload.schemaVersion === 'number';
  const character = hasStructuredFields
    ? (payload.character && typeof payload.character === 'object' ? { ...payload.character } : {})
    : { ...payload };
  const legacyUiState = payload?.uiState && typeof payload.uiState === 'object' ? payload.uiState : null;
  const characterUiState = character?.uiState && typeof character.uiState === 'object' ? character.uiState : null;
  const participantState = character && typeof character === 'object' && character.appState && typeof character.appState === 'object'
    ? character.appState
    : null;
  if (character && typeof character === 'object') {
    delete character.uiState;
    delete character.appState;
  }
  let uiState = (payload.ui && typeof payload.ui === 'object') ? { ...payload.ui } : (characterUiState || legacyUiState || null);
  if (participantState) {
    if (uiState && typeof uiState === 'object') {
      uiState = { ...uiState, participants: uiState.participants || participantState };
    } else {
      uiState = { participants: participantState };
    }
  }
  const metaSource = payload.meta && typeof payload.meta === 'object' ? payload.meta : payload;
  const meta = normalizeSnapshotMeta(metaSource, character, uiState, baseMeta);
  const migrated = {
    character,
    ui: uiState,
    meta,
    schemaVersion: meta.schemaVersion,
    uiVersion: meta.uiVersion,
    savedAt: meta.savedAt,
    appVersion: meta.appVersion,
    checksum: meta.checksum,
  };
  return migrated;
}

export function buildCanonicalPayload(migrated) {
  const workingUi = migrated.ui && typeof migrated.ui === 'object' ? { ...migrated.ui } : null;
  const { data: normalized, changed } = normalizeCharacterData({ ...migrated.character });
  const cleanedCharacter = { ...normalized };
  if (cleanedCharacter && typeof cleanedCharacter === 'object' && 'uiState' in cleanedCharacter) {
    delete cleanedCharacter.uiState;
  }
  const meta = normalizeSnapshotMeta(migrated.meta || {}, cleanedCharacter, workingUi, {
    schemaVersion: migrated.schemaVersion ?? SAVE_SCHEMA_VERSION,
    uiVersion: migrated.uiVersion ?? UI_STATE_VERSION,
    savedAt: migrated.savedAt ?? Date.now(),
    appVersion: migrated.appVersion ?? APP_VERSION,
    checksum: migrated.checksum,
  });
  if (meta?.ownerUid && cleanedCharacter && typeof cleanedCharacter === 'object' && !cleanedCharacter.ownerUid) {
    cleanedCharacter.ownerUid = meta.ownerUid;
  }
  const checksum = meta.checksum || calculateSnapshotChecksum({ character: cleanedCharacter, ui: workingUi });
  const payload = {
    meta: { ...meta, checksum },
    schemaVersion: meta.schemaVersion,
    uiVersion: meta.uiVersion,
    savedAt: meta.savedAt,
    appVersion: meta.appVersion,
    checksum,
    character: cleanedCharacter,
    ui: workingUi,
  };
  return { payload, changed };
}

function getPinPrompt(message) {
  if (typeof window !== 'undefined' && typeof window.pinPrompt === 'function') {
    return window.pinPrompt(message);
  }
  if (typeof prompt === 'function') {
    return Promise.resolve(prompt(message));
  }
  return Promise.resolve(null);
}

async function verifyPin(name) {
  const authoritative = await ensureAuthoritativePinState(name, { force: true });
  if (!authoritative.pinned) return;

  let showedToast = false;

  const showToast = (message, type = 'info') => {
    try {
      toast(message, { type, duration: 0 });
      showedToast = true;
    } catch {}
  };

  const hideToast = () => {
    if (!showedToast) return;
    try {
      dismissToast();
    } catch {}
    showedToast = false;
  };

  const promptLabel = 'Enter PIN';
  const suffix = typeof name === 'string' && name ? ` for ${name}` : '';
  showToast(`${promptLabel}${suffix}`, 'info');

  while (true) {
    const pin = await getPinPrompt(promptLabel);
    if (pin === null) {
      hideToast();
      throw new Error('Invalid PIN');
    }
    if (await verifyStoredPin(name, pin)) {
      hideToast();
      return;
    }
    showToast('Invalid PIN. Try again.', 'error');
  }
}

let currentName = null;

export function currentCharacter() {
  return currentName;
}

export function setCurrentCharacter(name) {
  const displayName = name === null ? null : displayCharacterName(name);
  currentName = displayName;
  const storageName = name === null ? null : normalizedCharacterName(name);
  try {
    if (!storageName) {
      clearLastSaveName();
    } else {
      writeLastSaveName(storageName);
    }
  } catch {}
}

export async function listCharacters() {
  try {
    const cloud = (await listCloudSaves())
      .map(displayCharacterName)
      .filter(Boolean);
    return cloud.sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Failed to list cloud saves', e);
    return [];
  }
}

export async function listRecoverableCharacters() {
  try {
    const saves = await listCharacters();
    const backups = (await listCloudBackupNames()).map(displayCharacterName).filter(Boolean);
    const autos = (await listCloudAutosaveNames()).map(displayCharacterName).filter(Boolean);
    const set = new Set([...saves, ...backups, ...autos]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    console.error('Failed to list recoverable characters', e);
    return [];
  }
}

export async function loadCharacter(name, options = {}) {
  const { bypassPin = false } = options || {};
  try {
    const storageName = normalizedCharacterName(name);
    const displayName = displayCharacterName(name || storageName);
    const lookupNames = Array.from(new Set([storageName, typeof name === 'string' ? name.trim() : '']))
      .filter(Boolean);
    let data = null;
    let loadedFrom = null;
    try {
      for (const candidate of lookupNames) {
        try {
          data = await loadLocal(candidate);
          loadedFrom = candidate;
          break;
        } catch (err) {
          console.error(`Failed to load local data for ${candidate}`, err);
        }
      }
    } catch (err) {
      console.error(`Failed to load local data for ${storageName || name}`, err);
    }

    if (!data) {
      try {
        for (const candidate of lookupNames) {
          try {
            data = await loadCloud(candidate);
            loadedFrom = candidate;
            if (data) break;
          } catch (err) {
            console.error(`Failed to load cloud data for ${candidate}`, err);
          }
        }
      } catch (err) {
        console.error(`Failed to load cloud data for ${storageName || name}`, err);
        throw err;
      }
      if (data) {
        try {
          await saveLocal(storageName || loadedFrom || name, data);
        } catch (err) {
          console.error(`Failed to persist cloud data locally for ${storageName || name}`, err);
        }
      }
    }

    if (!data) {
      throw new Error('Character data not found');
    }

    try {
      window.dmNotify?.(`Loaded character ${displayName || storageName || name}`);
    } catch (err) {
      console.error('Failed to notify DM about character load', err);
    }

    const { payload, recovered, changed } = preflightSnapshotForLoad(storageName || name, data);
    if (!bypassPin) {
      await verifyPin(displayName || storageName || name);
    }
    const needsSchemaUpdate =
      recovered ||
      changed ||
      payload.schemaVersion !== SAVE_SCHEMA_VERSION ||
      payload.uiVersion !== UI_STATE_VERSION ||
      payload.character?.uiState ||
      !isSnapshotChecksumValid(payload);
    if (needsSchemaUpdate) {
      try {
        await saveLocal(storageName || name, payload);
      } catch (err) {
        console.error(`Failed to normalize local data for ${storageName || name}`, err);
      }
      try {
        await saveCloud(storageName || name, payload);
      } catch (err) {
        console.error('Cloud save failed', err);
      }
    }

    return payload;
  } catch (err) {
    throw reportCharacterError(err, `Failed to load character "${name}"`);
  }
}

export async function saveCharacter(data, name = currentCharacter()) {
  if (!name) throw new Error('No character selected');
  const storageName = normalizedCharacterName(name) || name;
  try {
    const migrated = migrateSavePayload(data);
    const { payload } = buildCanonicalPayload(migrated);
    ensureCharacterId(payload, storageName);
    let serializedPayload = null;
    try { serializedPayload = JSON.stringify(payload); } catch {}
    await verifyPin(displayCharacterName(name));
    try {
      await saveLocal(storageName, payload);
    } catch (err) {
      console.error(`Failed to persist local save for ${storageName}`, err);
      throw normalizeLocalSaveError(err);
    }
    try {
      persistLocalAutosaveSnapshot(storageName, payload, serializedPayload);
    } catch (err) {
      console.error('Failed to update local recovery snapshot', err);
    }
    try {
      await saveCloud(storageName, payload);
    } catch (err) {
      console.error('Cloud save failed', err);
    }
    try {
      document.dispatchEvent(new CustomEvent('character-saved', { detail: name }));
    } catch (err) {
      console.error('Failed to dispatch character-saved event', err);
    }
    return true;
  } catch (err) {
    throw reportCharacterError(err, `Failed to save character "${name}"`);
  }
}

export async function getLocalCharacterOwnerUid(name) {
  if (!name) return '';
  try {
    const data = await loadLocal(name);
    const migrated = migrateSavePayload(data);
    return typeof migrated?.meta?.ownerUid === 'string' ? migrated.meta.ownerUid : '';
  } catch {
    return '';
  }
}

export async function claimCharacterOwnership(name, ownerUid) {
  if (!name) throw new Error('No character selected');
  if (!ownerUid) throw new Error('Missing owner uid');
  const storageName = normalizedCharacterName(name) || name;
  try {
    const data = await loadLocal(storageName);
    const migrated = migrateSavePayload(data);
    const { payload } = buildCanonicalPayload(migrated);
    ensureCharacterId(payload, storageName);
    payload.meta = {
      ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
      ownerUid,
    };
    if (payload.character && typeof payload.character === 'object') {
      payload.character.ownerUid = ownerUid;
    }
    await saveLocal(storageName, payload);
    try {
      await saveCloud(storageName, payload);
    } catch (err) {
      console.error('Cloud save failed while claiming character', err);
    }
    return payload;
  } catch (err) {
    throw reportCharacterError(err, `Failed to claim character "${name}"`);
  }
}

export async function renameCharacter(oldName, newName, data) {
  try {
    const storageOldName = normalizedCharacterName(oldName) || oldName;
    const storageNewName = normalizedCharacterName(newName) || newName;
    const migrated = migrateSavePayload(data);
    const { payload } = buildCanonicalPayload(migrated);
    const characterId = ensureCharacterId(payload, storageOldName);
    migrateCharacterIdKey(storageOldName, storageNewName, characterId);
    let serializedPayload = null;
    try { serializedPayload = JSON.stringify(payload); } catch {}
    if (!storageOldName || storageOldName === storageNewName) {
      setCurrentCharacter(newName);
      await saveCharacter(payload, storageNewName);
      return true;
    }
    await verifyPin(displayCharacterName(oldName));
    try {
      await saveLocal(storageNewName, payload);
    } catch (err) {
      console.error(`Failed to persist renamed character ${storageNewName} locally`, err);
      throw err;
    }
    try {
      persistLocalAutosaveSnapshot(storageNewName, payload, serializedPayload);
    } catch (err) {
      console.error('Failed to refresh local recovery snapshot during rename', err);
    }
    let cloudStatus;
    try {
      const result = await saveCloud(storageNewName, payload);
      if (result !== 'saved' && result !== 'queued' && result !== 'disabled') {
        throw new Error(`Unexpected cloud save status: ${result ?? 'unknown'}`);
      }
      cloudStatus = result;
    } catch (err) {
      console.error('Cloud save failed', err);
      try {
        await deleteSave(newName);
      } catch (rollbackErr) {
        console.error('Failed to roll back local rename after cloud save failure', rollbackErr);
      }
      if (oldName) {
        try {
          writeLastSaveName(oldName);
        } catch (restoreErr) {
          console.error('Failed to restore last save after rename failure', restoreErr);
        }
      }
      throw err;
    }
    if (cloudStatus === 'saved' || cloudStatus === 'queued' || cloudStatus === 'disabled') {
      const moved = await movePin(storageOldName, storageNewName);
      if (!moved) {
        console.warn(`PIN move skipped for ${oldName} -> ${newName}`);
      }
      await deleteSave(storageOldName);
      if (cloudStatus === 'saved' || cloudStatus === 'queued') {
        try {
          await deleteCloud(storageOldName);
        } catch (err) {
          console.error('Cloud delete failed', err);
        }
      }
    }
    setCurrentCharacter(storageNewName);
    try {
      document.dispatchEvent(new CustomEvent('character-saved', { detail: storageNewName }));
    } catch (err) {
      console.error('Failed to dispatch character-saved event after rename', err);
    }
    return true;
  } catch (err) {
    throw reportCharacterError(err, `Failed to rename character "${oldName}"`);
  }
}

export async function deleteCharacter(name) {
  const canonical = normalizedCharacterName(name) || name;
  if (canonical === 'DM') {
    throw new Error('Cannot delete The DM');
  }
  try {
    const storageName = canonical;
    await verifyPin(displayCharacterName(name));
    let data = null;
    try {
      data = await loadLocal(storageName);
    } catch (err) {
      console.error(`Failed to read local data before deleting ${storageName}`, err);
    }
    if (data === null) {
      try {
        data = await loadCloud(storageName);
      } catch (err) {
        console.error(`Failed to read cloud data before deleting ${storageName}`, err);
      }
    }
    if (data !== null) {
      try {
        await saveCloud(storageName, data);
      } catch (err) {
        console.error('Cloud backup failed', err);
      }
    }
    await deleteSave(storageName);
    removeCharacterIdForName(storageName);
    const cleared = await clearPin(storageName);
    if (!cleared) {
      console.warn(`PIN clear skipped for ${storageName}`);
    }
    try {
      await deleteCloud(storageName);
    } catch (err) {
      console.error('Cloud delete failed', err);
    }
    try {
      document.dispatchEvent(new CustomEvent('character-deleted', { detail: storageName }));
    } catch (err) {
      console.error('Failed to dispatch character-deleted event', err);
    }
    return true;
  } catch (err) {
    throw reportCharacterError(err, `Failed to delete character "${name}"`);
  }
}

export async function listBackups(name) {
  const storageName = normalizedCharacterName(name) || name;
  const characterId = readCharacterIdForName(storageName);
  let manual = [];
  let autos = [];
  try {
    manual = await listCloudBackups(storageName);
  } catch (e) {
    console.error('Failed to list backups', e);
  }
  try {
    autos = await listCloudAutosaves(storageName, { characterId });
  } catch (e) {
    console.error('Failed to list autosaves', e);
  }
  return [
    ...manual.map(entry => ({ ...entry, type: 'manual' })),
    ...autos.map(entry => ({ ...entry, type: 'auto' })),
  ];
}

export async function loadBackup(name, ts, type = 'manual', options = {}) {
  const { bypassPin = false } = options || {};
  try {
    const storageName = normalizedCharacterName(name) || name;
    const loader = type === 'auto' ? loadCloudAutosave : loadCloudBackup;
    const data = type === 'auto'
      ? await loader(storageName, ts, { characterId: readCharacterIdForName(storageName) })
      : await loader(storageName, ts);
    const { payload, recovered, changed } = preflightSnapshotForLoad(storageName, data, { showRecoveryToast: false });
    if (!bypassPin) {
      await verifyPin(displayCharacterName(name));
    }
    const needsSchemaUpdate = recovered || changed || payload.schemaVersion !== SAVE_SCHEMA_VERSION || payload.character?.uiState || !isSnapshotChecksumValid(payload);
    try {
      await saveLocal(storageName, payload);
    } catch (err) {
      console.error(`Failed to persist recovered data for ${storageName}`, err);
    }
    if (changed || needsSchemaUpdate) {
      try {
        await saveCloud(storageName, payload);
      } catch (err) {
        console.error('Cloud save failed', err);
      }
    }
    return payload;
  } catch (err) {
    throw reportCharacterError(err, `Failed to load backup for "${name}"`);
  }
}

const AUTOSAVE_ERROR_THROTTLE_MS = 60_000;
let lastAutosaveErrorKey = null;
let lastAutosaveErrorTime = 0;

function buildAutosaveErrorKey(err, contextMessage) {
  const parts = [contextMessage || 'Autosave failed'];
  if (err) {
    if (err instanceof Error && err.message) {
      parts.push(err.message);
    } else if (typeof err === 'object') {
      try {
        parts.push(JSON.stringify(err));
      } catch {
        parts.push(String(err));
      }
    } else {
      parts.push(String(err));
    }
  }
  return parts.join('::');
}

export async function saveAutoBackup(data, name = currentCharacter()) {
  if (!name) return null;
  const storageName = normalizedCharacterName(name) || name;
  try {
    const migrated = migrateSavePayload(data);
    const { payload } = buildCanonicalPayload(migrated);
    ensureCharacterId(payload, storageName);
    const ts = await saveCloudAutosave(storageName, payload);
    lastAutosaveErrorKey = null;
    lastAutosaveErrorTime = 0;
    try {
      document.dispatchEvent(new CustomEvent('character-autosaved', { detail: { name: storageName, ts } }));
    } catch (err) {
      console.error('Failed to dispatch character-autosaved event', err);
    }
    return ts;
  } catch (err) {
    const contextMessage = `Failed to autosave character "${storageName}"`;
    const errorKey = buildAutosaveErrorKey(err, contextMessage);
    const now = Date.now();
    if (lastAutosaveErrorKey !== errorKey || now - lastAutosaveErrorTime > AUTOSAVE_ERROR_THROTTLE_MS) {
      lastAutosaveErrorKey = errorKey;
      lastAutosaveErrorTime = now;
      reportCharacterError(err, contextMessage);
    } else {
      console.error(contextMessage, err);
    }
    return null;
  }
}
