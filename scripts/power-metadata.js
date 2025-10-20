export const POWER_STYLES = [
  'Physical Powerhouse',
  'Energy Manipulator',
  'Speedster',
  'Telekinetic/Psychic',
  'Illusionist',
  'Shape-shifter',
  'Elemental Controller',
];

export const POWER_ACTION_TYPES = ['Action', 'Bonus', 'Reaction', 'Out-of-Combat'];
export const POWER_TARGET_SHAPES = ['Melee', 'Ranged Single', 'Cone', 'Line', 'Radius', 'Self', 'Aura'];
export const POWER_EFFECT_TAGS = [
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
export const POWER_INTENSITIES = ['Minor', 'Core', 'AoE', 'Control', 'Ultimate'];
export const POWER_SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const POWER_DURATIONS = [
  'Instant',
  'End of Target’s Next Turn',
  '1 Round',
  'Sustained',
  'Scene',
  'Session',
];
export const POWER_USES = ['At-will', 'Per Encounter', 'Per Session', 'Cooldown'];
export const POWER_ON_SAVE_OPTIONS = ['Full', 'Half', 'Negate'];
export const POWER_DAMAGE_TYPES = [
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
export const POWER_SCALING_OPTIONS = ['Static', 'Level-based', 'Ability-based'];
export const POWER_DAMAGE_DICE = ['1d6', '2d6', '3d6', '4d6', '5d6', '6d6'];

export const POWER_RANGE_QUICK_VALUES = [
  'Melee',
  '10 ft',
  '30 ft',
  '60 ft',
  '90 ft',
  '120 ft',
  'Unlimited (narrative)',
];

export const POWER_STYLE_CASTER_SAVE_DEFAULTS = {
  'Physical Powerhouse': ['STR'],
  'Energy Manipulator': ['INT', 'CON'],
  Speedster: ['DEX'],
  'Telekinetic/Psychic': ['WIS', 'INT'],
  Illusionist: ['CHA'],
  'Shape-shifter': ['CON', 'DEX'],
  'Elemental Controller': ['WIS', 'CON'],
};

export const POWER_STYLE_ATTACK_DEFAULTS = {
  'Physical Powerhouse': 'str',
  'Energy Manipulator': 'int',
  Speedster: 'dex',
  'Telekinetic/Psychic': 'wis',
  Illusionist: 'cha',
  'Shape-shifter': 'con',
  'Elemental Controller': 'wis',
};

export const POWER_RANGE_UNITS = ['feet', 'narrative'];
export const POWER_SUGGESTION_STRENGTHS = ['off', 'conservative', 'assertive'];

export const POWER_SHAPE_RANGES = {
  Melee: ['Melee'],
  Cone: ['15 ft', '30 ft', '60 ft'],
  Line: ['30 ft', '60 ft', '120 ft'],
  Radius: ['10 ft', '15 ft', '20 ft', '30 ft'],
  Self: ['Self', '5 ft', '10 ft', '15 ft', '20 ft'],
  Aura: ['Self', '5 ft', '10 ft', '15 ft', '20 ft'],
  'Ranged Single': ['10 ft', '30 ft', '60 ft', '90 ft', '120 ft', 'Unlimited (narrative)'],
};

export const EFFECT_SAVE_SUGGESTIONS = {
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

export const EFFECT_ON_SAVE_SUGGESTIONS = {
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

export function getRangeOptionsForShape(shape) {
  const options = POWER_SHAPE_RANGES[shape];
  if (options && options.length) return options;
  return POWER_RANGE_QUICK_VALUES.filter(value => value !== 'Melee');
}
