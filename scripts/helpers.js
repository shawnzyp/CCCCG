export const $ = (id) => document.getElementById(id);
export const qs = (s, r=document) => r.querySelector(s);
export const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const mod = (score) => Math.floor((num(score) - 10) / 2);
// Proficiency bonuses in 5e are based on character level and always assume a
// minimum level of 1. The previous implementation allowed invalid or
// non-numeric values to fall through as level 0 which produced an incorrect
// bonus of 1. Clamp the provided level to at least 1 so that malformed input
// still yields the baseline +2 bonus.
export const proficiencyBonus = (level) => {
  const lvl = Math.max(1, num(level));
  return Math.floor((lvl - 1) / 4) + 2;
};
// When reverting temporary ability score increases, simply subtract the bonus
// without enforcing a 10-point floor. Ability scores in the system may start
// below 10, so clamping to that value would incorrectly inflate low abilities
// when a perk is removed.
export const revertAbilityScore = (score) => Math.max(0, num(score) - 1);
export function calculateArmorBonus(){
  let body=[], head=[], shield=0, misc=0;
  qsa("[data-kind='armor']").forEach(card=>{
    const eq = qs("input[type='checkbox'][data-f='equipped']", card);
    const bonusEl = qs("input[data-f='bonus']", card);
    const bonus = Math.max(0, num(bonusEl ? bonusEl.value : 0));
    const slotEl = qs("select[data-f='slot']", card);
    const slot = slotEl ? slotEl.value : 'Body';
    if (eq && eq.checked){
      if (slot==='Body') body.push(bonus);
      else if (slot==='Head') head.push(bonus);
      else if (slot==='Shield') shield += bonus;
      else misc += bonus;
    }
  });
  return (body.length?Math.max(...body):0) + (head.length?Math.max(...head):0) + shield + misc;
}
