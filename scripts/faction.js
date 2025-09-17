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
  'Public Opinion': {
    Beloved: [
      'Civilians trust you on sight. Reduce Persuasion and Deception DCs with civilians by 5. One scene per session, a crowd or witness will take a personal risk to help you. Local officials default to cooperation unless there is direct harm.',
    ],
    Trusted: [
      'Persuasion checks with civilians are at advantage when the stakes involve safety or rescue. You can clear an area fast, no questions asked. First responder NPCs share operational updates if asked politely.',
    ],
    Noticed: [
      'Bystanders give you the benefit of the doubt. Minor favors are easy—camera access from a shop owner, a rushed statement from a witness. Reduce one crowd-control or de-escalation DC by 2 per scene.',
    ],
    Unknown: ['No modifier. People judge you by the moment.'],
    Distrusted: [
      'Civilians are wary. Persuasion vs. civilians is at disadvantage if you are masked or armed unless you take time to explain. Expect phones out and hostile streaming.',
    ],
    Feared: [
      'Crowds scatter or obstruct. Intimidation gains advantage while Persuasion suffers a –5 DC penalty. Officials require proof or warrants. Collateral damage is amplified by the media.',
    ],
    Villainized: [
      'Mobs form, rumors spread, and you are blamed by default. Deception to hide identity is at disadvantage around locals. Police set perimeters against you—not for you. Expect ambush interviews and hostile headlines.',
    ],
  },
};

export const REP_TIERS = Object.keys(COMMON_REP_TIERS);

const COMMON_MAX_REP = REP_TIERS.length * 100 - 1;
const COMMON_STEP = 5;
const COMMON_DEFAULT = 200;

const createCommonFaction = (id, name) => {
  const config = {
    id,
    name,
    min: 0,
    max: COMMON_MAX_REP,
    defaultValue: COMMON_DEFAULT,
    step: COMMON_STEP,
  };
  config.clamp = value => clamp(num(value), config.min, config.max);
  config.getProgressValue = value => config.clamp(value) - config.min;
  config.getProgressMax = () => config.max - config.min;
  config.getRatio = value => {
    const max = config.getProgressMax();
    return max === 0 ? 0 : config.getProgressValue(value) / max;
  };
  config.getTier = value => {
    const clamped = config.clamp(value);
    const tierIdx = Math.min(REP_TIERS.length - 1, Math.floor(clamped / 100));
    const tierName = REP_TIERS[tierIdx];
    const perks = (FACTION_REP_PERKS[name] && FACTION_REP_PERKS[name][tierName]) || [];
    return { name: tierName, perks };
  };
  return config;
};

const PUBLIC_OPINION_MIN = -10;
const PUBLIC_OPINION_MAX = 20;
const PUBLIC_OPINION_STEP = 1;

const PUBLIC_OPINION_LADDER = [
  { min: PUBLIC_OPINION_MIN, name: 'Villainized' },
  { min: -7, name: 'Feared' },
  { min: -3, name: 'Distrusted' },
  { min: 0, name: 'Unknown' },
  { min: 4, name: 'Noticed' },
  { min: 8, name: 'Trusted' },
  { min: 13, name: 'Beloved' },
];

const createPublicOpinionFaction = () => {
  const config = {
    id: 'public',
    name: 'Public Opinion',
    min: PUBLIC_OPINION_MIN,
    max: PUBLIC_OPINION_MAX,
    defaultValue: 0,
    step: PUBLIC_OPINION_STEP,
  };
  config.clamp = value => clamp(num(value), config.min, config.max);
  config.getProgressValue = value => config.clamp(value) - config.min;
  config.getProgressMax = () => config.max - config.min;
  config.getRatio = value => {
    const max = config.getProgressMax();
    return max === 0 ? 0 : config.getProgressValue(value) / max;
  };
  config.getTier = value => {
    const clamped = config.clamp(value);
    let tier = PUBLIC_OPINION_LADDER[0];
    for (const candidate of PUBLIC_OPINION_LADDER) {
      if (clamped >= candidate.min) {
        tier = candidate;
      } else {
        break;
      }
    }
    const perks = (FACTION_REP_PERKS[config.name] && FACTION_REP_PERKS[config.name][tier.name]) || [];
    return { name: tier.name, perks };
  };
  return config;
};

export const FACTIONS = [
  createCommonFaction('omni', 'O.M.N.I.'),
  createCommonFaction('pfv', 'P.F.V.'),
  createCommonFaction('conclave', 'Cosmic Conclave'),
  createCommonFaction('greyline', 'Greyline PMC'),
  createPublicOpinionFaction(),
];

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

