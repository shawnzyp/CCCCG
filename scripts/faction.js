import { $, num } from './helpers.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const COMMON_REP_TIERS = {
  Hostile: ['You are hunted, sabotaged, or attacked on sight.'],
  Untrusted: ['Faction denies you resources, spreads bad PR.'],
  Neutral: ['No strong opinion—standard interactions only.'],
  Recognized: ['Minor perks, small-scale favors.'],
  Trusted: ['Reliable allies, access to mid-tier resources.'],
  Favored: ['Priority treatment, elite support, story leverage.'],
  Champion: ['Icon status, legendary backing, may call in major faction powers.'],
};

export const FACTION_REP_PERKS = {
  'O.M.N.I.': { ...COMMON_REP_TIERS },
  'P.F.V.': { ...COMMON_REP_TIERS },
  'Cosmic Conclave': { ...COMMON_REP_TIERS },
  'Greyline PMC': { ...COMMON_REP_TIERS },
  'The Government': {
    Hostile: [
      [
        'O.M.N.I. is under investigation, assets frozen.',
        'Team loses access to advanced gear requisition (Elite/Legendary restricted).',
        'NPC allies may be recalled, leaving the team isolated.',
        'Missions may be sabotaged or interrupted by official audits and oversight committees.',
      ].join(' '),
    ],
    Distrusted: [
      [
        'Limited funding: +25% cost on all requisition gear.',
        'O.M.N.I. cannot deploy heavy support (airstrikes, drone swarms, etc.).',
        "Media leaks and political speeches undermine the team's credibility.",
        'PCs may find travel restricted or jurisdiction challenged by local authorities.',
      ].join(' '),
    ],
    Neutral: [
      [
        'Baseline funding. Access to standard gear lists.',
        'Team operates quietly under radar.',
        'Government neither hinders nor actively champions the group.',
      ].join(' '),
    ],
    Supported: [
      [
        'O.M.N.I. granted discretionary budget boosts.',
        'PCs gain access to one free Rare item per mission from requisition.',
        'Airlift and surveillance support available in critical encounters.',
        'Government officials defend the team in public hearings.',
      ].join(' '),
    ],
    Favored: [
      [
        'Elite clearance. All Rare gear discounted by 50%.',
        "Access to high-level intel on rival factions at GM's discretion.",
        'PCs may call in government strike teams once per mission.',
        'Diplomatic immunity shields the team from legal entanglements.',
      ].join(' '),
    ],
    Patroned: [
      [
        'The team is a flagship program for O.M.N.I.',
        'Access to Legendary prototypes, orbital defense satellites, and experimental vehicles.',
        'Governments bend laws to support operations.',
        'PCs become de facto ambassadors of Earth-9 power projection.',
        'Enemies risk being branded terrorists if they oppose the team.',
      ].join(' '),
    ],
  },
  'Public Opinion': {
    Hostile: [
      'Mobs form, rumors spread, and you are blamed by default. Deception to hide identity is at disadvantage around locals. Police set perimeters against you—not for you. Expect ambush interviews and hostile headlines.',
    ],
    Untrusted: [
      'Civilians are wary. Persuasion vs. civilians is at disadvantage if you are masked or armed unless you take time to explain. Expect phones out and hostile streaming. Crowds may scatter or obstruct and officials demand proof before offering aid.',
    ],
    Neutral: ['No modifier. People judge you by the moment.'],
    Recognized: [
      'Bystanders give you the benefit of the doubt. Minor favors are easy—camera access from a shop owner, a rushed statement from a witness. Reduce one crowd-control or de-escalation DC by 2 per scene.',
    ],
    Trusted: [
      'Persuasion checks with civilians are at advantage when the stakes involve safety or rescue. You can clear an area fast, no questions asked. First responder NPCs share operational updates if asked politely.',
    ],
    Favored: [
      'Civilians trust you on sight. Reduce Persuasion and Deception DCs with civilians by 5. One scene per session, a crowd or witness will take a personal risk to help you. Local officials default to cooperation unless there is direct harm.',
    ],
    Champion: [
      'You are the face of heroism. News outlets amplify your victories, civic leaders coordinate with you in advance, and once per session you can declare a public appeal that grants advantage on the next reputation check with any faction.',
    ],
  },
};

export const REP_TIERS = Object.keys(COMMON_REP_TIERS);

const COMMON_MAX_REP = REP_TIERS.length * 100 - 1;
const COMMON_STEP = 5;
const COMMON_DEFAULT = 200;

const createCommonFaction = (id, name, overrides = {}) => {
  const tiers = Array.isArray(overrides.tiers) && overrides.tiers.length ? overrides.tiers : REP_TIERS;
  const min = overrides.min ?? 0;
  const derivedMax = tiers.length ? min + tiers.length * 100 - 1 : min + COMMON_MAX_REP;
  const max = overrides.max ?? derivedMax;
  const defaultValueInput = overrides.defaultValue ?? COMMON_DEFAULT;
  const defaultValue = clamp(num(defaultValueInput), min, max);
  const step = overrides.step ?? COMMON_STEP;
  const config = {
    id,
    name,
    min,
    max,
    defaultValue,
    step,
    tiers,
  };
  config.clamp = value => clamp(num(value), config.min, config.max);
  config.getProgressValue = value => config.clamp(value) - config.min;
  config.getProgressMax = () => config.max - config.min;
  config.getRatio = value => {
    const progressMax = config.getProgressMax();
    return progressMax === 0 ? 0 : config.getProgressValue(value) / progressMax;
  };
  config.getTier = value => {
    const clamped = config.clamp(value);
    const offset = clamped - config.min;
    const tierIdx = config.tiers.length
      ? Math.min(config.tiers.length - 1, Math.floor(offset / 100))
      : 0;
    const tierKey = config.tiers[tierIdx] ?? '';
    const factionPerks = FACTION_REP_PERKS[name];
    const tierData = factionPerks ? factionPerks[tierKey] : undefined;
    let label = tierKey;
    let perks = [];
    if (Array.isArray(tierData)) {
      perks = tierData;
    } else if (tierData && typeof tierData === 'object') {
      label = tierData.label ?? tierKey;
      perks = Array.isArray(tierData.perks) ? tierData.perks : [];
    }
    return { name: label, perks };
  };
  return config;
};

export const FACTIONS = [
  createCommonFaction('omni', 'O.M.N.I.'),
  createCommonFaction('pfv', 'P.F.V.'),
  createCommonFaction('conclave', 'Cosmic Conclave'),
  createCommonFaction('greyline', 'Greyline PMC'),
  createCommonFaction('government', 'The Government', {
    tiers: ['Hostile', 'Distrusted', 'Neutral', 'Supported', 'Favored', 'Patroned'],
  }),
  createCommonFaction('public', 'Public Opinion'),
];

const LEGACY_PUBLIC_OPINION_LADDER = [
  { min: -10, name: 'Villainized' },
  { min: -7, name: 'Feared' },
  { min: -3, name: 'Distrusted' },
  { min: 0, name: 'Unknown' },
  { min: 4, name: 'Noticed' },
  { min: 8, name: 'Trusted' },
  { min: 13, name: 'Beloved' },
];

const LEGACY_PUBLIC_OPINION_MAP = {
  Villainized: 0,
  Feared: 100,
  Distrusted: 150,
  Unknown: COMMON_DEFAULT,
  Noticed: 350,
  Trusted: 450,
  Beloved: 600,
};

function getLegacyPublicOpinionTier(value) {
  let tier = LEGACY_PUBLIC_OPINION_LADDER[0];
  for (const candidate of LEGACY_PUBLIC_OPINION_LADDER) {
    if (value >= candidate.min) {
      tier = candidate;
    } else {
      break;
    }
  }
  return tier;
}

export function migratePublicOpinionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const rawValue = snapshot['public-rep'];
  if (rawValue === undefined) return snapshot;
  const rep = Number(rawValue);
  if (!Number.isFinite(rep)) return snapshot;
  const barRaw = snapshot['public-rep-bar'];
  const bar = Number(barRaw);
  if (Number.isFinite(bar) && Math.abs(bar - rep) < 0.001) {
    return snapshot;
  }
  const hasLegacyProgress = Number.isFinite(bar) && Math.abs(bar - rep - 10) < 0.001;
  const looksLegacyRange = !Number.isFinite(bar) && rep >= -10 && rep <= 30;
  if (!hasLegacyProgress && !looksLegacyRange) {
    return snapshot;
  }
  const tier = getLegacyPublicOpinionTier(rep);
  const nextValue = LEGACY_PUBLIC_OPINION_MAP[tier.name];
  if (typeof nextValue !== 'number') return snapshot;
  snapshot['public-rep'] = String(nextValue);
  snapshot['public-rep-bar'] = String(nextValue);
  return snapshot;
}

export const FACTION_NAME_MAP = Object.fromEntries(FACTIONS.map(({ id, name }) => [id, name]));

export const ACTION_HINTS = [
  'once per',
  'per encounter',
  'per day',
  'per long rest',
  'reroll',
  'call upon',
  'protect an ally',
  'gain temporary hit points',
  'dash as a bonus action',
  'add +',
];

export function updateFactionRep(handlePerkEffects = () => {}) {
  FACTIONS.forEach(config => {
    const { id, name } = config;
    const input = $(`${id}-rep`);
    const bar = $(`${id}-rep-bar`);
    const tierEl = $(`${id}-rep-tier`);
    const perkEl = $(`${id}-rep-perk`);
    if (!input || !bar || !tierEl || !perkEl) return;
    const rawValue = input.value === '' ? config.defaultValue : input.value;
    const clamped = config.clamp(rawValue);
    input.value = String(clamped);
    const progressValue = config.getProgressValue(clamped);
    const progressMax = config.getProgressMax();
    bar.max = progressMax;
    bar.value = progressValue;
    bar.setAttribute('max', String(progressMax));
    bar.setAttribute('value', String(progressValue));
    const ratio = config.getRatio(clamped);
    const hue = 120 * ratio;
    const color = `hsl(${hue}, 70%, 50%)`;
    bar.style.setProperty('--progress-color', color);
    const tierInfo = config.getTier(clamped);
    const tierName = tierInfo.name || '';
    tierEl.textContent = tierName;
    tierEl.style.setProperty('--progress-color', color);
    perkEl.innerHTML = '';
    const perks = Array.isArray(tierInfo.perks) ? tierInfo.perks : [];
    const perk = perks[0];
    if (perk) {
      const text = typeof perk === 'string' ? perk : String(perk);
      const lower = text.toLowerCase();
      const isAction = ACTION_HINTS.some(k => lower.includes(k));
      if (isAction) {
        const id = `${config.id}-rep-perk-act`;
        perkEl.innerHTML = `<label class="inline"><input type="checkbox" id="${id}"/> ${text}</label>`;
        const cb = perkEl.querySelector(`#${id}`);
        if (cb) {
          cb.addEventListener('change', () => {
            window.logAction?.(`${text} perk ${cb.checked ? 'used' : 'reset'}`);
          });
        }
      } else {
        perkEl.textContent = text;
      }
      handlePerkEffects(perkEl, text);
      perkEl.style.display = 'block';
    } else {
      handlePerkEffects(perkEl, '');
      perkEl.style.display = 'none';
    }
  });
}

export function setupFactionRepTracker(handlePerkEffects = () => {}, pushHistory) {
  const init = () => {
    FACTIONS.forEach(config => {
      const { id, name } = config;
      const input = $(`${id}-rep`);
      const gain = $(`${id}-rep-gain`);
      const lose = $(`${id}-rep-lose`);
      if (!input || !gain || !lose) return;
      const step = config.step ?? COMMON_STEP;
      function change(delta) {
        const currentVal = config.clamp(input.value);
        const oldTierName = config.getTier(currentVal).name;
        const next = config.clamp(currentVal + delta);
        input.value = String(next);
        updateFactionRep(handlePerkEffects);
        const newTierName = config.getTier(next).name;
        if (oldTierName !== newTierName) {
          window.logAction?.(`${name} Reputation: ${oldTierName} -> ${newTierName}`);
        }
        if (typeof pushHistory === 'function') pushHistory();
      }
      gain.addEventListener('click', e => { e.preventDefault(); change(step); });
      lose.addEventListener('click', e => { e.preventDefault(); change(-step); });
    });
    updateFactionRep(handlePerkEffects);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

