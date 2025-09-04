import { $, num } from './helpers.js';

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
};

export const FACTIONS = ['omni', 'pfv', 'conclave', 'greyline'];

export const FACTION_NAME_MAP = {
  omni: 'O.M.N.I.',
  pfv: 'P.F.V.',
  conclave: 'Cosmic Conclave',
  greyline: 'Greyline PMC',
};

export const REP_TIERS = Object.keys(COMMON_REP_TIERS);

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
  FACTIONS.forEach(f => {
    const input = $(`${f}-rep`);
    const bar = $(`${f}-rep-bar`);
    const tierEl = $(`${f}-rep-tier`);
    const perkEl = $(`${f}-rep-perk`);
    if (!input || !bar || !tierEl || !perkEl) return;
    let val = Math.max(0, num(input.value));
    const maxVal = REP_TIERS.length * 100 - 1;
    if (val > maxVal) val = maxVal;
    input.value = val;
    const tierIdx = Math.min(REP_TIERS.length - 1, Math.floor(val / 100));
    const tierName = REP_TIERS[tierIdx];
    // Display the full reputation total on the progress element so players
    // see overall advancement instead of only the progress within the current
    // tier. Update both the DOM properties and attributes so that CSS
    // selectors or assistive technology reading the raw attributes stay in
    // sync with the underlying values.
    bar.max = maxVal;
    bar.value = val;
    bar.setAttribute('max', String(maxVal));
    bar.setAttribute('value', String(val));
    const ratio = val / maxVal;
    const hue = 120 * ratio;
    const color = `hsl(${hue}, 70%, 50%)`;
    bar.style.setProperty('--progress-color', color);
    tierEl.textContent = tierName;
    tierEl.style.setProperty('--progress-color', color);
    perkEl.innerHTML = '';
    const facName = FACTION_NAME_MAP[f];
    const perks = (FACTION_REP_PERKS[facName] && FACTION_REP_PERKS[facName][tierName]) || [];
    const perk = perks[0];
    if (perk) {
      const text = typeof perk === 'string' ? perk : String(perk);
      const lower = text.toLowerCase();
      const isAction = ACTION_HINTS.some(k => lower.includes(k));
      if (isAction) {
        const id = `${f}-rep-perk-act`;
        perkEl.innerHTML = `<label class="inline"><input type="checkbox" id="${id}"/> ${text}</label>`;
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
    const maxVal = REP_TIERS.length * 100 - 1;
    FACTIONS.forEach(f => {
      const input = $(`${f}-rep`);
      const gain = $(`${f}-rep-gain`);
      const lose = $(`${f}-rep-lose`);
      if (!input || !gain || !lose) return;
      function change(delta) {
        const next = Math.max(0, Math.min(maxVal, num(input.value) + delta));
        input.value = next;
        updateFactionRep(handlePerkEffects);
        if (typeof pushHistory === 'function') pushHistory();
      }
      gain.addEventListener('click', e => { e.preventDefault(); change(5); });
      lose.addEventListener('click', e => { e.preventDefault(); change(-5); });
    });
    updateFactionRep(handlePerkEffects);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

