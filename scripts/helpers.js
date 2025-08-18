export const $ = (id) => document.getElementById(id);
export const qs = (s, r=document) => r.querySelector(s);
export const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const mod = (score) => Math.floor((num(score) - 10) / 2);
export const proficiencyBonus = (level) => Math.floor((num(level) - 1) / 4) + 2;
export function calculateArmorBonus(){
  let body=[], head=[], shield=0, misc=0;
  qsa("[data-kind='armor']").forEach(card=>{
    const eq = qs("input[type='checkbox'][data-f='equipped']", card);
    const bonusEl = qs("input[data-f='bonus']", card);
    const bonus = num(bonusEl ? bonusEl.value : 0);
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
