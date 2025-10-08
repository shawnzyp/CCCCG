import { sanitizeNormalizedCatalogEntry, extractPriceValue } from './catalog-utils.js';

function parseCatalogTags(value) {
  if (!value) return [];
  const text = Array.isArray(value) ? value.join(',') : String(value || '');
  return text
    .split(/[;,\n]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function mapCatalogType(typeId) {
  switch (typeId) {
    case 'weapons':
      return 'Weapon';
    case 'armor':
      return 'Armor';
    case 'items':
      return 'Item';
    case 'gear':
    default:
      return 'Gear';
  }
}

function combineNotes(...segments) {
  return segments
    .flat()
    .map(segment => (segment == null ? '' : String(segment).trim()))
    .filter(Boolean)
    .join('\n');
}

function buildGearEntryFromMetadata(typeId, metadata = {}, {
  entryId = '',
  dmLock = false,
  label = '',
  updatedAt = new Date().toISOString(),
} = {}) {
  if (!metadata || typeof metadata !== 'object') return null;
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  if (!name) return null;
  const typeLabel = mapCatalogType(typeId);
  const priceText = typeof metadata.price === 'string' ? metadata.price.trim() : '';
  const perkSources = [metadata.mechanics, metadata.function, metadata.trigger, metadata.reward];
  const descriptionParts = [metadata.description, metadata.special, metadata.effect, metadata.operation, metadata.usage, metadata.narrative];
  const attunement = [metadata.availability, metadata.cost]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join(' • ');
  const tags = parseCatalogTags(metadata.tags);
  const baseEntry = {
    section: 'Gear',
    type: typeLabel,
    rawType: typeLabel,
    name,
    tier: typeof metadata.tier === 'string' ? metadata.tier.trim() : '',
    priceText,
    priceRaw: priceText,
    perk: combineNotes(perkSources),
    description: combineNotes(descriptionParts),
    use: typeof metadata.operation === 'string' ? metadata.operation.trim() : '',
    attunement,
    source: label ? `${label} · DM Catalog` : 'DM Catalog',
    classifications: tags,
    dmEntryId: entryId || '',
    dmLock: !!dmLock,
    dmKind: typeId,
    dmSource: 'dm-catalog',
    dmTimestamp: updatedAt,
  };
  if (typeof metadata.dmNotes === 'string' && metadata.dmNotes.trim()) {
    baseEntry.dmNotes = metadata.dmNotes.trim();
  }
  const numericPrice = extractPriceValue(priceText);
  if (Number.isFinite(numericPrice) && numericPrice > 0) {
    baseEntry.price = numericPrice;
  }
  const sanitized = sanitizeNormalizedCatalogEntry(baseEntry);
  if (!sanitized) return null;
  if (tags.length) {
    sanitized.dmTags = tags;
  }
  sanitized.dmEntryId = entryId || sanitized.dmEntryId || '';
  sanitized.dmLock = !!dmLock;
  sanitized.dmKind = typeId;
  sanitized.dmSource = 'dm-catalog';
  sanitized.dmTimestamp = updatedAt;
  if (baseEntry.dmNotes) {
    sanitized.dmNotes = baseEntry.dmNotes;
  }
  return sanitized;
}

const POWER_STYLE_KEYWORDS = [
  { value: 'Physical Powerhouse', patterns: [/powerhouse/i, /physical/i, /brawler/i] },
  { value: 'Energy Manipulator', patterns: [/energy/i, /plasma/i, /ion/i] },
  { value: 'Speedster', patterns: [/speed/i, /swift/i, /dash/i] },
  { value: 'Telekinetic/Psychic', patterns: [/psych/i, /telekin/i, /mind/i] },
  { value: 'Illusionist', patterns: [/illusion/i, /trick/i, /phantom/i] },
  { value: 'Shape-shifter', patterns: [/shapeshift/i, /morph/i, /form/i] },
  { value: 'Elemental Controller', patterns: [/element/i, /fire/i, /ice/i, /storm/i, /earth/i] },
];

const POWER_EFFECT_KEYWORDS = [
  { value: 'Damage', patterns: [/damage/i, /blast/i, /strike/i, /burn/i, /shot/i] },
  { value: 'Control', patterns: [/control/i, /push/i, /pull/i, /zone/i] },
  { value: 'Stun', patterns: [/stun/i, /daze/i, /immobil/i] },
  { value: 'Shield', patterns: [/shield/i, /barrier/i, /ward/i] },
  { value: 'Heal', patterns: [/heal/i, /restore/i, /mend/i] },
  { value: 'Charm', patterns: [/charm/i, /influence/i, /persuade/i] },
  { value: 'Summon/Clone', patterns: [/summon/i, /clone/i, /construct/i] },
];

function matchKeyword(tags, metadataText, keywordSet, fallback) {
  const sources = [];
  if (Array.isArray(tags)) sources.push(...tags);
  if (typeof metadataText === 'string') sources.push(metadataText);
  for (const source of sources) {
    if (!source) continue;
    const text = String(source).toLowerCase();
    for (const entry of keywordSet) {
      if (entry.patterns.some(pattern => pattern.test(text))) {
        return entry.value;
      }
    }
  }
  return fallback;
}

function deriveIntensity(metadata = {}, tags = []) {
  const candidates = [];
  const tier = typeof metadata.tier === 'string' ? metadata.tier : '';
  const rarity = typeof metadata.rarity === 'string' ? metadata.rarity : '';
  if (tier) candidates.push(tier);
  if (rarity) candidates.push(rarity);
  candidates.push(...tags);
  const lowered = candidates.map(value => String(value || '').toLowerCase());
  if (lowered.some(value => value.includes('ultimate'))) return 'Ultimate';
  if (lowered.some(value => value.includes('control'))) return 'Control';
  if (lowered.some(value => value.includes('aoe'))) return 'AoE';
  if (lowered.some(value => value.includes('minor'))) return 'Minor';
  return 'Core';
}

function deriveUses(costText = '') {
  const text = String(costText || '').toLowerCase();
  if (!text) return 'At-will';
  if (text.includes('per session')) return 'Per Session';
  if (text.includes('per scene')) return 'Per Session';
  if (text.includes('per encounter') || text.includes('per battle')) return 'Per Encounter';
  if (text.includes('cooldown')) return 'Cooldown';
  return 'At-will';
}

function deriveDuration(raw = '') {
  const text = String(raw || '').toLowerCase();
  if (!text) return 'Instant';
  if (text.includes('scene')) return 'Scene';
  if (text.includes('session')) return 'Session';
  if (text.includes('sustain') || text.includes('maintain')) return 'Sustained';
  if (text.includes('round')) return '1 Round';
  return 'Instant';
}

function buildPowerDataFromMetadata(metadata = {}, {
  entryId = '',
  dmLock = false,
  signature = false,
} = {}) {
  if (!metadata || typeof metadata !== 'object') return null;
  const name = typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : (signature ? 'Signature Move' : 'Power');
  const tags = parseCatalogTags(metadata.tags);
  const style = matchKeyword(tags, metadata.style, POWER_STYLE_KEYWORDS, '');
  const effectTag = matchKeyword(tags, metadata.effect, POWER_EFFECT_KEYWORDS, 'Damage');
  const intensity = deriveIntensity(metadata, tags);
  const uses = deriveUses(metadata.cost);
  const duration = deriveDuration(metadata.duration);
  const special = combineNotes(
    metadata.mechanics,
    metadata.effect,
    metadata.trigger ? `Trigger: ${metadata.trigger}` : '',
    metadata.reward ? `Reward: ${metadata.reward}` : '',
    metadata.cost ? `Cost: ${metadata.cost}` : '',
    metadata.duration ? `Duration: ${metadata.duration}` : '',
    metadata.tier ? `Tier: ${metadata.tier}` : '',
    metadata.rarity ? `Rarity: ${metadata.rarity}` : '',
    metadata.tags ? `Tags: ${metadata.tags}` : ''
  );
  const description = signature
    ? combineNotes(metadata.narrative, metadata.description)
    : combineNotes(metadata.description, metadata.narrative);
  const data = {
    name,
    style,
    actionType: 'Action',
    shape: 'Ranged Single',
    range: '',
    effectTag,
    intensity,
    uses,
    duration,
    description,
    special,
    legacyText: special,
    originalText: special,
    dmEntryId: entryId || '',
    dmLock: !!dmLock,
  };
  if (metadata.dmNotes && typeof metadata.dmNotes === 'string') {
    const notes = metadata.dmNotes.trim();
    if (notes) data.dmNotes = notes;
  }
  if (signature) {
    data.signature = true;
  }
  return data;
}

function buildPowerPresetFromMetadata(metadata = {}, options = {}) {
  const data = buildPowerDataFromMetadata(metadata, { entryId: options.entryId, dmLock: options.dmLock, signature: false });
  if (!data) return null;
  const label = typeof metadata.name === 'string' && metadata.name.trim()
    ? metadata.name.trim()
    : (options.label || 'Custom Power');
  return { label, data };
}

function buildSignaturePresetFromMetadata(metadata = {}, options = {}) {
  const data = buildPowerDataFromMetadata(metadata, { entryId: options.entryId, dmLock: options.dmLock, signature: true });
  if (!data) return null;
  const label = typeof metadata.name === 'string' && metadata.name.trim()
    ? metadata.name.trim()
    : (options.label || 'Signature Move');
  return { label, data };
}

export {
  buildGearEntryFromMetadata,
  buildPowerPresetFromMetadata,
  buildSignaturePresetFromMetadata,
  parseCatalogTags,
};
