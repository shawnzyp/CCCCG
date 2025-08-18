/* ========= helpers ========= */
import { $, qs, qsa, num, mod, calculateArmorBonus } from './helpers.js';
import { saveCloud, loadCloud } from './storage.js';
let lastFocus = null;
function show(id){
  const el = $(id);
  if(!el) return;
  lastFocus = document.activeElement;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden','false');
  const focusEl = el.querySelector('[autofocus],input,select,textarea,button');
  if (focusEl && typeof focusEl.focus === 'function') {
    focusEl.focus();
  }
}
function hide(id){
  const el = $(id);
  if(!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden','true');
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus();
  }
}
let audioCtx = null;
window.addEventListener('unload', () => {
  if (audioCtx && typeof audioCtx.close === 'function') {
    audioCtx.close();
  }
});
function playTone(type){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = type==='error'?220:880;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  }catch(e){ /* noop */ }
}
function toast(msg, type='info'){
  const t=$('toast');
  t.textContent=msg;
  t.className=`toast ${type}`;
  t.classList.add('show');
  playTone(type);
  setTimeout(()=>t.classList.remove('show'),1200);
}

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
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
const btnTheme = $('btn-theme');
function applyTheme(t){
  root.classList.remove('theme-light','theme-high');
  if(t==='light') root.classList.add('theme-light');
  if(t==='high') root.classList.add('theme-high');
  if(btnTheme){
    qs('#icon-sun', btnTheme).style.display = t==='dark' ? 'block' : 'none';
    qs('#icon-contrast', btnTheme).style.display = t==='light' ? 'block' : 'none';
    qs('#icon-moon', btnTheme).style.display = t==='high' ? 'block' : 'none';
  }
}
applyTheme(localStorage.getItem('theme') || 'dark');
if (btnTheme) {
  btnTheme.addEventListener('click', ()=>{
    const themes=['dark','light','high'];
    const curr=localStorage.getItem('theme')||'dark';
    const next=themes[(themes.indexOf(curr)+1)%themes.length];
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
}

/* ========= tabs ========= */
function setTab(name){
  qsa('section[data-tab]').forEach(s=> s.style.display = s.getAttribute('data-tab')===name ? 'block':'none');
  qsa('.tab').forEach(b=> b.classList.toggle('active', b.getAttribute('data-go')===name));
}
qsa('.tab').forEach(b=> b.addEventListener('click', ()=> setTab(b.getAttribute('data-go'))));
setTab('combat');

/* ========= ability grid + autos ========= */
const ABILS = ['str','dex','con','int','wis','cha'];
const abilGrid = $('abil-grid');
abilGrid.innerHTML = ABILS.map(a=>`
  <div class="ability-box">
    <label>${a.toUpperCase()}</label>
    <div class="score">
      <select id="${a}"></select>
      <span class="mod" id="${a}-mod">+0</span>
    </div>
  </div>`).join('');
ABILS.forEach(a=>{ const sel=$(a); for(let v=10; v<=24; v++) sel.add(new Option(v,v)); sel.value='10'; });

const saveGrid = $('saves');
saveGrid.innerHTML = ABILS.map(a=>`
  <div class="card">
    <label>${a.toUpperCase()}</label>
    <div class="inline"><input type="checkbox" id="save-${a}-prof"/><span class="pill" id="save-${a}">+0</span></div>
  </div>`).join('');

const SKILLS = [
  { name: 'Acrobatics', abil: 'dex' },
  { name: 'Animal Handling', abil: 'wis' },
  { name: 'Arcana', abil: 'int' },
  { name: 'Athletics', abil: 'str' },
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
  { name: 'Survival', abil: 'wis' }
];
const skillGrid = $('skills');
skillGrid.innerHTML = SKILLS.map((s,i)=>`
  <div class="card">
    <label>${s.name}</label>
    <div class="inline"><input type="checkbox" id="skill-${i}-prof"/><span class="pill" id="skill-${i}">+0</span></div>
  </div>`).join('');

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

function setupPerkSelect(selId, perkId, data){
  const sel = $(selId);
  const perkEl = $(perkId);
  if(!sel || !perkEl) return;
  function render(){
    const perks = data[sel.value] || [];
    perkEl.innerHTML = perks.map(p=>`<li>${p}</li>`).join('');
    perkEl.style.display = perks.length ? 'block' : 'none';
  }
  sel.addEventListener('change', render);
  render();
}

/* ========= cached elements ========= */
const elPP = $('pp');
const elTC = $('tc');
const elArmorBonus = $('armor-bonus');
const elOriginBonus = $('origin-bonus');
const elDex = $('dex');
const elCon = $('con');
const elWis = $('wis');
const elSPBar = $('sp-bar');
const elSPPill = $('sp-pill');
const elHPBar = $('hp-bar');
const elHPPill = $('hp-pill');
const elHPRoll = $('hp-roll');
const elHPBonus = $('hp-bonus');
const elHPTemp = $('hp-temp');
const elInitiative = $('initiative');
const elProfBonus = $('prof-bonus');
const elPowerSaveAbility = $('power-save-ability');
const elPowerSaveDC = $('power-save-dc');
const elXP = $('xp');
const elXPBar = $('xp-bar');
const elXPPill = $('xp-pill');
const elTier = $('tier');

const XP_TIERS = [
  { xp: 0, label: 'Tier 5 – Rookie' },
  { xp: 2000, label: 'Tier 4 – Emerging Vigilante' },
  { xp: 6000, label: 'Tier 3 – Field-Tested Operative' },
  { xp: 18000, label: 'Tier 2 – Respected Force' },
  { xp: 54000, label: 'Tier 1 – Heroic Figure' },
  { xp: 162000, label: 'Tier 0 – Transcendent / Legendary' }
];

// set initial tier display
if(elTier){
  elTier.value = XP_TIERS[0].label;
}

/* ========= derived helpers ========= */
function updateSP(){
  const spMax = 5 + mod(elCon.value);
  elSPBar.max = spMax;
  if (!num(elSPBar.value)) elSPBar.value = spMax;
  elSPPill.textContent = `${num(elSPBar.value)}/${spMax}`;
}

function updateHP(){
  const total = 30 + mod(elCon.value) + num(elHPRoll.value||0) + num(elHPBonus.value||0);
  elHPBar.max = Math.max(0, total);
  if (!num(elHPBar.value)) elHPBar.value = elHPBar.max;
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
}

function updateXP(){
  const xp = Math.max(0, num(elXP.value));
  let idx = 0;
  for(let i=XP_TIERS.length-1;i>=0;i--){
    if(xp >= XP_TIERS[i].xp){ idx = i; break; }
  }
  if(elTier) elTier.value = XP_TIERS[idx].label;
  const nextTier = XP_TIERS[idx+1];
  if(nextTier){
    elXPBar.max = nextTier.xp;
    elXPBar.value = xp;
    elXPPill.textContent = `${xp}/${nextTier.xp}`;
  }else{
    elXPBar.max = 1;
    elXPBar.value = 1;
    elXPPill.textContent = `${xp}+`;
  }
}

function updateDerived(){
  elPP.value = 10 + mod(elWis.value);
  const armorAuto = calculateArmorBonus();
  elArmorBonus.value = armorAuto;
  elTC.value = 10 + mod(elDex.value) + armorAuto + num(elOriginBonus.value||0);
  updateSP();
  updateHP();
  elInitiative.value = mod(elDex.value);
  const pb = num(elProfBonus.value)||2;
  elPowerSaveDC.value = 8 + pb + mod($( elPowerSaveAbility.value ).value);
  ABILS.forEach(a=>{
    const m = mod($(a).value);
    $(a+'-mod').textContent = (m>=0?'+':'') + m;
    const saveEl = $('save-'+a+'-prof');
    const val = m + (saveEl && saveEl.checked ? pb : 0);
    $('save-'+a).textContent = (val>=0?'+':'') + val;
  });
  SKILLS.forEach((s,i)=>{
    const skillEl = $('skill-'+i+'-prof');
    const val = mod($(s.abil).value) + (skillEl && skillEl.checked ? pb : 0);
    $('skill-'+i).textContent = (val>=0?'+':'') + val;
  });
  updateXP();
}
ABILS.forEach(a=> $(a).addEventListener('change', updateDerived));
['hp-roll','hp-bonus','hp-temp','origin-bonus','prof-bonus','power-save-ability'].forEach(id=> $(id).addEventListener('input', updateDerived));
ABILS.forEach(a=> $('save-'+a+'-prof').addEventListener('change', updateDerived));
SKILLS.forEach((s,i)=> $('skill-'+i+'-prof').addEventListener('change', updateDerived));
if (elXP) {
  elXP.addEventListener('input', updateXP);
}

function setXP(v){
  elXP.value = Math.max(0, v);
  updateXP();
}
$('xp-submit').addEventListener('click', ()=>{
  const amt = num($('xp-amt').value)||0;
  if(!amt) return;
  const mode = $('xp-mode').value;
  setXP(num(elXP.value) + (mode==='add'? amt : -amt));
});

/* ========= HP/SP controls ========= */
function setHP(v){
  const prev = num(elHPBar.value);
  elHPBar.value = Math.max(0, Math.min(num(elHPBar.max), v));
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
  if(prev > 0 && num(elHPBar.value) === 0) alert('Player is down');
}
function setSP(v){
  const prev = num(elSPBar.value);
  elSPBar.value = Math.max(0, Math.min(num(elSPBar.max), v));
  elSPPill.textContent = `${num(elSPBar.value)}/${num(elSPBar.max)}`;
  if(prev > 0 && num(elSPBar.value) === 0) alert('Player is out of SP');
}
$('hp-dmg').addEventListener('click', ()=>{ let d=num($('hp-amt').value); if(!d) return; let tv=num(elHPTemp.value); if(d>0 && tv>0){ const use=Math.min(tv,d); tv-=use; elHPTemp.value=tv; d-=use; } setHP(num(elHPBar.value)-d); });
$('hp-heal').addEventListener('click', ()=>{ const d=num($('hp-amt').value)||0; setHP(num(elHPBar.value)+d); });
$('hp-full').addEventListener('click', ()=> setHP(num(elHPBar.max)));
$('sp-full').addEventListener('click', ()=> setSP(num(elSPBar.max)));
qsa('[data-sp]').forEach(b=> b.addEventListener('click', ()=> setSP(num(elSPBar.value) + num(b.dataset.sp)||0) ));
$('long-rest').addEventListener('click', ()=>{ setHP(num(elHPBar.max)); setSP(num(elSPBar.max)); });

/* ========= Dice/Coin + Logs ========= */
function safeParse(key){
  try{
    return JSON.parse(localStorage.getItem(key)||'[]');
  }catch(e){
    return [];
  }
}
const diceLog = safeParse('dice-log');
const coinLog = safeParse('coin-log');
const deathLog = safeParse('death-log');
const campaignLog = safeParse('campaign-log');
const fmt = (ts)=>new Date(ts).toLocaleTimeString();
function pushLog(arr, entry, key){ arr.push(entry); if (arr.length>30) arr.splice(0, arr.length-30); localStorage.setItem(key, JSON.stringify(arr)); }
function renderLogs(){
  $('log-dice').innerHTML = diceLog.slice(-5).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('log-coin').innerHTML = coinLog.slice(-5).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('log-death').innerHTML = deathLog.slice(-5).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
}
function renderFullLogs(){
  $('full-log-dice').innerHTML = diceLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('full-log-coin').innerHTML = coinLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('full-log-death').innerHTML = deathLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
}
$('roll-dice').addEventListener('click', ()=>{
  const s = num($('dice-sides').value), c=num($('dice-count').value)||1;
  const out = $('dice-out');
  out.classList.remove('rolling');
  const rolls = Array.from({length:c}, ()=> 1+Math.floor(Math.random()*s));
  const sum = rolls.reduce((a,b)=>a+b,0);
  out.textContent = sum;
  void out.offsetWidth; out.classList.add('rolling');
  pushLog(diceLog, {t:Date.now(), text:`${c}×d${s}: ${rolls.join(', ')} = ${sum}`}, 'dice-log');
});
$('flip').addEventListener('click', ()=>{
  const v = Math.random()<.5 ? 'Heads' : 'Tails';
  $('flip-out').textContent = v;
  pushLog(coinLog, {t:Date.now(), text:v}, 'coin-log');
});
const deathBoxes = ['death-save-1','death-save-2','death-save-3'].map(id => $(id));
deathBoxes.forEach((box, idx) => {
  box.addEventListener('change', () => {
    if (box.checked) {
      pushLog(deathLog, {t: Date.now(), text: `Failure ${idx + 1}`}, 'death-log');
    }
    if (deathBoxes.every(b => b.checked)) {
      alert('Your character has fallen and their sacrifice will be remembered.');
    }
  });
});
const btnCampaignAdd = $('campaign-add');
if (btnCampaignAdd) {
  btnCampaignAdd.addEventListener('click', ()=>{
    const text = $('campaign-entry').value.trim();
    if(!text) return;
    pushLog(campaignLog, {t:Date.now(), text}, 'campaign-log');
    $('campaign-entry').value='';
    renderCampaignLog();
    pushHistory();
  });
}
function renderCampaignLog(){
  $('campaign-log').innerHTML = campaignLog
    .slice()
    .reverse()
    .map((e,i)=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div>${e.text}</div><div><button class="btn-sm" data-del="${i}">Delete</button></div></div>`)
    .join('');
}
renderCampaignLog();
$('campaign-log').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-del]');
  if(!btn) return;
  const idx = Number(btn.dataset.del);
  if(!Number.isFinite(idx)) return;
  if(confirm('Delete this entry?')){
    campaignLog.splice(campaignLog.length-1-idx,1);
    localStorage.setItem('campaign-log', JSON.stringify(campaignLog));
    renderCampaignLog();
    pushHistory();
  }
});
const btnLog = $('btn-log');
if (btnLog) {
  btnLog.addEventListener('click', ()=>{ renderLogs(); show('modal-log'); });
}
const btnLogFull = $('log-full');
if (btnLogFull) {
  btnLogFull.addEventListener('click', ()=>{ renderFullLogs(); hide('modal-log'); show('modal-log-full'); });
}
const btnCampaign = $('btn-campaign');
if (btnCampaign) {
  btnCampaign.addEventListener('click', ()=>{ renderCampaignLog(); show('modal-campaign'); });
}
qsa('[data-close]').forEach(b=> b.addEventListener('click', ()=>{ const ov=b.closest('.overlay'); if(ov) hide(ov.id); }));

/* ========= Card Helper ========= */
const CARD_CONFIG = {
  power: {
    rows: [
      { class: 'inline', fields: [
        { f: 'name', placeholder: 'Power Name' },
        { f: 'sp', placeholder: 'SP', style: 'max-width:100px' },
        { f: 'save', placeholder: 'Save', style: 'max-width:160px' },
        { f: 'range', placeholder: 'Range', style: 'max-width:160px' }
      ]},
      { tag: 'textarea', f: 'effect', placeholder: 'Effect', rows: 3 }
    ]
  },
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
        { f: 'range', placeholder: 'Range', style: 'max-width:160px' }
      ]}
    ]
  },
  armor: {
    rows: [
      { class: 'inline', fields: [
        { f: 'name', placeholder: 'Name' },
        { tag: 'select', f: 'slot', style: 'max-width:140px', options: ['Body','Head','Shield','Misc'], default: 'Body' },
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
  }
};

function createCard(kind, pref = {}) {
  const cfg = CARD_CONFIG[kind];
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.kind = kind;
  if (!cfg) return card;
  (cfg.rows || []).forEach(row => {
    if (row.fields) {
      const wrap = document.createElement('div');
      if (row.class) wrap.className = row.class;
      row.fields.forEach(f => {
        if (f.tag === 'select') {
          const sel = document.createElement('select');
          sel.dataset.f = f.f;
          (f.options || []).forEach(opt => sel.add(new Option(opt, opt)));
          sel.value = pref[f.f] || f.default || '';
          if (f.style) sel.style.cssText = f.style;
          wrap.appendChild(sel);
        } else if (f.tag === 'checkbox') {
          const label = document.createElement('label');
          label.className = 'inline';
          if (f.style) label.style.cssText = f.style;
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.dataset.f = f.f;
          chk.checked = !!pref[f.f];
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
  const delWrap = document.createElement('div');
  delWrap.className = 'inline';
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-sm';
  delBtn.dataset.act = 'del';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => {
    card.remove();
    if (cfg.onDelete) cfg.onDelete();
    pushHistory();
  });
  delWrap.appendChild(delBtn);
  card.appendChild(delWrap);
  if (cfg.onChange) {
    qsa('input,select', card).forEach(el => el.addEventListener('input', cfg.onChange));
  }
  return card;
}

$('add-power').addEventListener('click', () => { $('powers').appendChild(createCard('power')); pushHistory(); });
$('add-sig').addEventListener('click', () => { $('sigs').appendChild(createCard('sig')); pushHistory(); });

/* ========= Gear ========= */
$('add-weapon').addEventListener('click', () => { $('weapons').appendChild(createCard('weapon')); pushHistory(); });
$('add-armor').addEventListener('click', () => { $('armors').appendChild(createCard('armor')); pushHistory(); });
$('add-item').addEventListener('click', () => { $('items').appendChild(createCard('item')); pushHistory(); });

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
['powers','sigs','weapons','armors','items'].forEach(enableDragReorder);

/* ========= Rule Tooltips ========= */
qsa('[data-rule]').forEach(el=>{
  const page = el.dataset.rule;
  el.title = `See CCCCG p.${page}`;
  el.addEventListener('click', ()=>{
    const frame = qs('#modal-rules iframe');
    if(frame) frame.src = `./CCCCG - Catalyst Core Character Creation Guide.pdf#page=${page}`;
    show('modal-rules');
  });
});

/* ========= Gear Catalog (seeded; extend as needed) ========= */
const CATALOG = (()=>{ const mk=(style,type,rarity,name,tc,notes)=>({style,type,rarity,name,tc,notes}); const out=[];
  out.push(
    mk('Universal','Armor','Common','Tactical Mesh Undersuit','+1 TC','Lightweight, breathable'),
    mk('Universal','Armor','Uncommon','Guardian Field Plate','+2 TC','+1 to STR or DEX saves'),
    mk('Universal','Armor','Rare','Reflex-Reinforced Vest','+3 TC','Advantage vs knocked prone'),
    mk('Universal','Armor','Elite','Deflection Halo Exosuit','+3 TC','First hit each encounter reduced by 5'),
    mk('Universal','Armor','Legendary','Aegis Core Cuirass','+4 TC','Auto-block one physical hit per session'),
    mk('Universal','Shield','Common','Polysteel Riot Plate','+1 TC vs melee',''),
    mk('Universal','Shield','Uncommon','Echo-Deflector Disk','+2 TC vs ranged',''),
    mk('Universal','Shield','Rare','Quantum-Stitch Bracer','+2 TC','Phase through one AoE per combat'),
    mk('Universal','Shield','Elite','Mirror Field Buckler','+3 TC','Reflect one ranged hit per encounter'),
    mk('Universal','Shield','Legendary','Nova Dome Projector','+2 TC to allies (10ft) 1/day',''),
    mk('Universal','Utility','Common','Combat Reflex Enhancer','+1 TC (first round)',''),
    mk('Universal','Utility','Uncommon','Adrenaline Booster Patch','+2 TC under 1/2 HP',''),
    mk('Universal','Utility','Rare','Perception Sync Visor','+1 TC & +1 Passive Perception',''),
    mk('Universal','Utility','Elite','Aegis Burst Pack','+3 TC for 1 turn (1/short rest)',''),
    mk('Universal','Utility','Legendary','Null Pulse Core','+2 TC to allies (5ft)','Emit protective wave')
  );
  out.push(
    mk('Physical Powerhouse','Armor','Common','Combat Vest MK-I','+1 TC','Reinforced plating'),
    mk('Physical Powerhouse','Armor','Uncommon','Shockframe Bodysuit','+2 TC','+1 STR saves'),
    mk('Physical Powerhouse','Armor','Rare','Tectonic Armor Rig','+3 TC','Immune to knockback'),
    mk('Physical Powerhouse','Shield','Common','Bunker Bracer','+1 TC vs melee',''),
    mk('Physical Powerhouse','Utility','Uncommon','Momentum Harness','+2 TC if immobile','')
  );
  out.push(
    mk('Energy Manipulator','Armor','Uncommon','Livewire Vest','+2 TC vs energy',''),
    mk('Energy Manipulator','Armor','Legendary','Stormcell Frame','+3 TC','Gain 1 SP when hit'),
    mk('Energy Manipulator','Shield','Uncommon','Plasma Flicker Disk','+2 TC vs ranged powers',''),
    mk('Energy Manipulator','Utility','Rare','Amplifier Ring','+2 TC after 4+ SP power','')
  );
  out.push(
    mk('Speedster','Armor','Common','Aerodynamic Skinsuit','+1 TC, +10 ft move',''),
    mk('Speedster','Armor','Elite','Reactive Velocity Mesh','+2 TC','+2 Initiative'),
    mk('Speedster','Shield','Common','Momentum Redirector','+2 TC if moved 10+ ft',''),
    mk('Speedster','Utility','Uncommon','Stutter-Blink Harness','+1 TC','Teleport 5 ft as reaction (1/combat)')
  );
  out.push(
    mk('Telekinetic/Psychic','Armor','Uncommon','Psionic Feedback Mesh','+2 TC','Attacker takes 1 psychic on miss'),
    mk('Telekinetic/Psychic','Shield','Common','Mind Ward Halo','+2 TC vs mental',''),
    mk('Telekinetic/Psychic','Utility','Common','Telekinetic Aegis','+2 TC (spend 1 SP, 1 round)','')
  );
  out.push(
    mk('Illusionist','Armor','Common','Refraction Cloak','+2 TC vs first attack each round',''),
    mk('Illusionist','Shield','Elite','Shadowlight Barrier','+2 TC','Redirect one ranged attack per combat'),
    mk('Illusionist','Utility','Rare','Vanishing Step Locket','—','Become invisible as reaction')
  );
  out.push(
    mk('Shape-shifter','Armor','Elite','Phaseform Hide','+3 TC','Enter semi-liquid state'),
    mk('Shape-shifter','Shield','Legendary','Shifting Scale Dome','+3 TC','Attacker –2 to hit next round'),
    mk('Shape-shifter','Utility','Elite','Shedskin Matrix','+3 TC','Leave decoy clone')
  );
  out.push(
    mk('Elemental Controller','Armor','Elite','Stoneguard Core','+3 TC','Immunity to knockdown'),
    mk('Elemental Controller','Shield','Elite','Galehalo Barrier','+3 TC vs ranged','Deflect projectiles'),
    mk('Elemental Controller','Utility','Elite','Cyclone Core Belt','—','Immune to AoE for 1 turn (1 SP)')
  );
  return out;})();

const styles = ['Universal','Physical Powerhouse','Energy Manipulator','Speedster','Telekinetic/Psychic','Illusionist','Shape-shifter','Elemental Controller'];
const styleSel = $('catalog-filter-style'); styles.forEach(s=> styleSel.add(new Option(s,s))); styleSel.value='Universal';
function renderCatalog(){
  const s = $('catalog-search').value.toLowerCase().trim();
  const style = styleSel.value, type=$('catalog-filter-type').value, rar=$('catalog-filter-rarity').value;
  const rows = CATALOG.filter(g => (!style || g.style===style) && (!type || g.type===type) && (!rar || g.rarity===rar) &&
    (!s || (g.name.toLowerCase().includes(s) || g.notes.toLowerCase().includes(s))));
  $('catalog-list').innerHTML = rows.map((g,i)=>`
    <div class="catalog-item">
      <div class="pill">${g.rarity}</div>
      <div><b>${g.name}</b> <span class="small">— ${g.type} — ${g.tc}${g.notes?` — ${g.notes}`:''}</span></div>
      <div><button class="btn-sm" data-add="${i}">Add</button></div>
    </div>`).join('');
    qsa('[data-add]').forEach(btn => btn.addEventListener('click', ()=>{
      const it = rows[Number(btn.dataset.add)];
      if (it.type==='Armor' || it.type==='Shield'){
        const slot = it.type==='Shield' ? 'Shield' : 'Body';
        $('armors').appendChild(createCard('armor', {name:it.name, slot, bonus: Number((it.tc.match(/\+(\d+)/)||[,0])[1]), equipped:true}));
      } else {
        $('items').appendChild(createCard('item', {name:it.name, notes:`${it.rarity} — ${it.tc}${it.notes?(' — '+it.notes):''}`}));
      }
      updateDerived(); toast('Added to sheet','success');
    }));
}
$('open-catalog').addEventListener('click', ()=>{ renderCatalog(); show('modal-catalog'); });
['catalog-filter-style','catalog-filter-type','catalog-filter-rarity','catalog-search'].forEach(id=> $(id).addEventListener('input', renderCatalog));

/* ========= Encounter / Initiative ========= */
let round = Number(localStorage.getItem('enc-round')||'1')||1;
let turn = Number(localStorage.getItem('enc-turn')||'0')||0;
const roster = JSON.parse(localStorage.getItem('enc-roster')||'[]');
function saveEnc(){
  localStorage.setItem('enc-roster', JSON.stringify(roster));
  localStorage.setItem('enc-round', String(round));
  localStorage.setItem('enc-turn', String(turn));
  // mirror encounter data to the cloud
  const heroEl = $('superhero');
  const name = localStorage.getItem('last-save') || (heroEl && heroEl.value ? heroEl.value.trim() : '');
  if(name){
    // fire-and-forget; ignore toast to keep backups silent
    saveCloud(name + '-enc', { roster, round, turn }, { getRTDB }).catch(()=>{});
  }
}
function renderEnc(){
  $('round-pill').textContent='Round '+round;
  const list=$('enc-list'); list.innerHTML='';
  roster.forEach((r,idx)=>{
    const row=document.createElement('div');
    row.className='catalog-item'+(idx===turn?' active':'');
    row.innerHTML = `<div class="pill">${r.init}</div><div><b>${r.name}</b></div><div><button class="btn-sm" data-del="${idx}">Delete</button></div>`;
    list.appendChild(row);
  });
  const turnName = roster[turn] && roster[turn].name ? roster[turn].name : '';
  const turnEl = $('turn-pill');
  if(turnEl){
    turnEl.textContent = turnName ? `Turn: ${turnName}` : '';
    turnEl.style.display = turnName ? '' : 'none';
  }
  qsa('[data-del]', list).forEach(b=> b.addEventListener('click', ()=>{
    const i=Number(b.dataset.del);
    roster.splice(i,1);
    if(turn>=roster.length) turn=0;
    renderEnc();
    saveEnc();
  }));
}
$('btn-enc').addEventListener('click', ()=>{ renderEnc(); show('modal-enc'); });
$('enc-add').addEventListener('click', ()=>{
  const name=$('enc-name').value.trim();
  const init=Number($('enc-init').value||0);
  if(!name) return toast('Enter a name','error');
  roster.push({name, init});
  roster.sort((a,b)=>(b.init||0)-(a.init||0) || String(a.name).localeCompare(String(b.name)));
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
$('enc-reset').addEventListener('click', ()=>{
  if(!confirm('Reset encounter and round?')) return;
  round=1;
  turn=0;
  roster.length=0;
  renderEnc();
  saveEnc();
});
qsa('#modal-enc [data-close]').forEach(b=> b.addEventListener('click', ()=> hide('modal-enc')));

/* ========= Save / Load (cloud-first, silent local mirror) ========= */
let firebaseCfgPromise;
async function loadFirebaseConfig(){
  if(!firebaseCfgPromise){
    // Fetch config from the same directory as the main page.
    // Using "../firebase-config.json" attempted to go one level above the
    // application root when the page is served from "/", resulting in a 404 and
    // preventing cloud save/load from functioning. The correct relative path is
    // simply "firebase-config.json".
    const url = window.FIREBASE_CONFIG_URL || 'firebase-config.json';
    firebaseCfgPromise = fetch(url).then(r=>r.ok?r.json():null).catch(()=>null);
  }
  let cfg = await firebaseCfgPromise;
  if(window.FIREBASE_CONFIG) cfg = Object.assign({}, cfg, window.FIREBASE_CONFIG);
  if(!cfg || !cfg.apiKey || !cfg.databaseURL){
    console.warn('Cloud config missing required fields', cfg);
    toast('Cloud config missing.','error');
    return null;
  }
  return cfg;
}
async function getRTDB(){
  const cfg = await loadFirebaseConfig();
  if (!cfg){
    console.warn('RTDB init skipped: no cloud config');
    return null;
  }
  try{
    const [{ initializeApp }, { getAuth, signInAnonymously, onAuthStateChanged }, { getDatabase, ref, get, set }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js')
    ]);
    let app; try{ app = window.firebaseApp || initializeApp(cfg); window.firebaseApp = app; } catch(e){ app = window.firebaseApp; }
    const auth = getAuth(app);
    await new Promise(res => onAuthStateChanged(auth, ()=>res(), ()=>res()));
    if(!auth.currentUser){
      try{ await signInAnonymously(auth); }
      catch(e){
        console.error('Anonymous sign-in failed', e);
        if (!navigator.onLine) toast('Offline: unable to authenticate','error');
        else toast('Authentication failed. Check connectivity','error');
        return null;
      }
    }
    const db=getDatabase(app);
    return { db, ref, get, set };
  }catch(e){
    console.error('RTDB init failed', e);
    if (!navigator.onLine) toast('Offline: cloud unavailable','error');
    else toast('Cloud unavailable; check connectivity','error');
    return null;
  }
}
function serialize(){
  const data={};
  function getVal(sel, root){ const el = qs(sel, root); return el ? el.value : ''; }
  function getChecked(sel, root){ const el = qs(sel, root); return el ? el.checked : false; }
  qsa('input,select,textarea').forEach(el=>{
    const id = el.id; if (!id) return;
    if (el.type==='checkbox') data[id] = !!el.checked; else data[id] = el.value;
  });
  data.powers = qsa("[data-kind='power']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    sp: getVal("[data-f='sp']", card) || '',
    save: getVal("[data-f='save']", card) || '',
    range: getVal("[data-f='range']", card) || '',
    effect: getVal("[data-f='effect']", card) || ''
  }));
  data.signatures = qsa("[data-kind='sig']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    sp: getVal("[data-f='sp']", card) || '',
    save: getVal("[data-f='save']", card) || '',
    special: getVal("[data-f='special']", card) || '',
    desc: getVal("[data-f='desc']", card) || ''
  }));
  data.weapons = qsa("[data-kind='weapon']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    damage: getVal("[data-f='damage']", card) || '',
    range: getVal("[data-f='range']", card) || ''
  }));
  data.armor = qsa("[data-kind='armor']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    slot: getVal("[data-f='slot']", card) || 'Body',
    bonus: Number(getVal("[data-f='bonus']", card) || 0),
    equipped: !!getChecked("[data-f='equipped']", card)
  }));
  data.items = qsa("[data-kind='item']").map(card => ({
    name: getVal("[data-f='name']", card) || '',
    qty: Number(getVal("[data-f='qty']", card) || 1),
    notes: getVal("[data-f='notes']", card) || ''
  }));
  data.campaignLog = campaignLog;
  return data;
}
function deserialize(data){
  $('powers').innerHTML=''; $('sigs').innerHTML=''; $('weapons').innerHTML=''; $('armors').innerHTML=''; $('items').innerHTML='';
  Object.entries(data||{}).forEach(([k,v])=>{ const el=$(k); if (!el) return; if (el.type==='checkbox') el.checked=!!v; else el.value=v; });
  (data && data.powers ? data.powers : []).forEach(p=> $('powers').appendChild(createCard('power', p)));
  (data && data.signatures ? data.signatures : []).forEach(s=> $('sigs').appendChild(createCard('sig', s)));
  (data && data.weapons ? data.weapons : []).forEach(w=> $('weapons').appendChild(createCard('weapon', w)));
  (data && data.armor ? data.armor : []).forEach(a=> $('armors').appendChild(createCard('armor', a)));
  (data && data.items ? data.items : []).forEach(i=> $('items').appendChild(createCard('item', i)));
  campaignLog.length=0; (data && data.campaignLog ? data.campaignLog : []).forEach(e=>campaignLog.push(e));
  localStorage.setItem('campaign-log', JSON.stringify(campaignLog));
  renderCampaignLog();
  updateDerived();
}

/* ========= autosave + history ========= */
const AUTO_KEY = 'autosave';
let history = [];
let histIdx = -1;
const pushHistory = debounce(()=>{
  const snap = serialize();
  history = history.slice(0, histIdx + 1);
  history.push(snap);
  if(history.length > 20){ history.shift(); }
  histIdx = history.length - 1;
  try{ localStorage.setItem(AUTO_KEY, JSON.stringify(snap)); }catch(e){ console.error('Autosave failed', e); }
}, 500);

document.addEventListener('input', pushHistory);
document.addEventListener('change', pushHistory);

function undo(){
  if(histIdx > 0){ histIdx--; deserialize(history[histIdx]); }
}
function redo(){
  if(histIdx < history.length - 1){ histIdx++; deserialize(history[histIdx]); }
}

document.addEventListener('keydown', e=>{

});

(function(){
  const raw = localStorage.getItem(AUTO_KEY);
  if(raw){
    try{ const data = JSON.parse(raw); deserialize(data); history=[data]; histIdx=0; }
    catch(e){ console.error('Auto-load failed', e); }
  }
  pushHistory();
})();
$('btn-save').addEventListener('click', ()=>{ $('save-key').value = localStorage.getItem('last-save') || $('superhero').value || ''; show('modal-save'); });
$('btn-load').addEventListener('click', ()=>{ $('load-key').value = ''; show('modal-load'); });
$('do-save').addEventListener('click', async ()=>{
  const name = $('save-key').value.trim(); if(!name) return toast('Enter a name','error');
  await saveCloud(name, serialize(), { getRTDB, toast }); hide('modal-save'); toast('Saved','success');
});
$('do-load').addEventListener('click', async ()=>{
  const name = $('load-key').value.trim(); if(!name) return toast('Enter a name','error');
  try{ const data = await loadCloud(name, { getRTDB, toast }); deserialize(data); hide('modal-load'); toast('Loaded','success'); }
  catch(e){ console.error('Load failed', e); toast('Could not load: '+(e && e.message ? e.message : ''),'error'); }
});

// periodic cloud backup every 10 minutes
setInterval(async ()=>{
  const heroEl = $('superhero');
  const name = localStorage.getItem('last-save') || (heroEl && heroEl.value ? heroEl.value.trim() : '');
  if(name){
    try{ await saveCloud(name, serialize(), { getRTDB }); }
    catch(e){ console.error('Periodic cloud save failed', e); }
  }
}, 10 * 60 * 1000);

/* ========= Rules ========= */
const btnRules = $('btn-rules');
if (btnRules) {
  btnRules.addEventListener('click', ()=> show('modal-rules'));
}

/* ========= Close + click-outside ========= */
qsa('.overlay').forEach(ov=> ov.addEventListener('click', (e)=>{ if (e.target===ov) hide(ov.id); }));
const tourOk = $('tour-ok');
if (tourOk) {
  tourOk.addEventListener('click', ()=>{ hide('modal-tour'); localStorage.setItem('tour-done','1'); });
}
if(!localStorage.getItem('tour-done')) show('modal-tour');

/* ========= boot ========= */
setupPerkSelect('alignment','alignment-perks', ALIGNMENT_PERKS);
setupPerkSelect('classification','classification-perks', CLASSIFICATION_PERKS);
setupPerkSelect('power-style','power-style-perks', POWER_STYLE_PERKS);
setupPerkSelect('origin','origin-perks', ORIGIN_PERKS);
updateDerived();
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(e=>console.error('SW reg failed', e));
}
