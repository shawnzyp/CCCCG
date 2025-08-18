export const $ = (id) => document.getElementById(id);
export const qs = (s, r = document) => r.querySelector(s);
export const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const mod = (score) => Math.floor((num(score) - 10) / 2);

export function updateDerived() {
  $('pp').value = 10 + mod($('wis').value);
  let body = [], head = [], shield = 0, misc = 0;
  qsa("[data-kind='armor']").forEach(card => {
    const eq = qs("input[type='checkbox'][data-f='equipped']", card);
    const bonus = num(qs("input[data-f='bonus']", card)?.value || 0);
    const slot = qs("select[data-f='slot']", card)?.value || 'Body';
    if (eq && eq.checked) {
      if (slot === 'Body') body.push(bonus);
      else if (slot === 'Head') head.push(bonus);
      else if (slot === 'Shield') shield += bonus;
      else misc += bonus;
    }
  });
  const armorAuto = (body.length ? Math.max(...body) : 0) +
    (head.length ? Math.max(...head) : 0) + shield + misc;
  $('armor-bonus').value = armorAuto;
  $('tc').value = 10 + mod($('dex').value) + armorAuto + num($('origin-bonus').value || 0);
  const spMax = 5 + mod($('con').value);
  const sb = $('sp-bar');
  sb.max = spMax;
  if (!num(sb.value)) sb.value = spMax;
  $('sp-pill').textContent = `${num(sb.value)}/${spMax}`;
  const hb = $('hp-bar');
  const total = 30 + mod($('con').value) + num($('hp-roll').value || 0) + num($('hp-bonus').value || 0);
  hb.max = Math.max(0, total);
  if (!num(hb.value)) hb.value = hb.max;
  $('hp-pill').textContent = `${num(hb.value)}/${num(hb.max)}` + (num($('hp-temp').value) ? ` (+${num($('hp-temp').value)})` : ``);
  $('initiative').value = mod($('dex').value);
  const pb = num($('prof-bonus').value) || 2;
  $('power-save-dc').value = 8 + pb + mod($( $('power-save-ability').value ).value);
}
