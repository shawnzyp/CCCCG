/* ========= helpers ========= */
import { $, qs, qsa, num, mod, calculateArmorBonus } from './helpers.js';
function show(id){ $(id).classList.remove('hidden'); }
function hide(id){ $(id).classList.add('hidden'); }
let audioCtx = null;
window.addEventListener('unload', () => audioCtx?.close());
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

/* ========= theme ========= */
const root = document.documentElement;
const btnTheme = $('btn-theme');
function applyTheme(t){
  root.classList.toggle('theme-light', t==='light');
  if(btnTheme){
    qs('#icon-sun', btnTheme).style.display = t==='light' ? 'none' : 'block';
    qs('#icon-moon', btnTheme).style.display = t==='light' ? 'block' : 'none';
  }
}
applyTheme(localStorage.getItem('theme')==='light'?'light':'dark');
btnTheme?.addEventListener('click', ()=>{
  const next = root.classList.contains('theme-light') ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

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
  <div class="card">
    <label>${a.toUpperCase()}</label>
    <div class="inline"><select id="${a}"></select><span class="pill" id="${a}-mod">+0</span></div>
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
const elClass = $('classification');
const elClassPerk = $('class-perk');
const elResist = $('resist');
const elVuln = $('vuln');
const elCPBar = $('cp-bar');
const elCPPill = $('cp-pill');
const elStyle = $('power-style');
const elStyle2 = $('power-style-2');
const elStylePerk = $('style-perk');
const elStyle2Perk = $('style2-perk');
const elOrigin = $('origin');
const elOriginPerk = $('origin-perk');

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

function updateDerived(){
  elPP.value = 10 + mod(elWis.value);
  const armorAuto = calculateArmorBonus();
  elArmorBonus.value = armorAuto;
  elTC.value = 10 + mod(elDex.value) + armorAuto + num(elOriginBonus.value||0);
  updateSP();
  updateHP();
  elInitiative.value = mod(elDex.value);
  const pb = num(elProfBonus.value)||2;
  // Compute power save DC based on selected ability
  elPowerSaveDC.value = 8 + pb + mod($( elPowerSaveAbility.value ).value);
  ABILS.forEach(a=>{
    const val = mod($(a).value) + ($('save-'+a+'-prof')?.checked ? pb : 0);
    $('save-'+a).textContent = (val>=0?'+':'') + val;
  });
  SKILLS.forEach((s,i)=>{
    const val = mod($(s.abil).value) + ($('skill-'+i+'-prof')?.checked ? pb : 0);
    $('skill-'+i).textContent = (val>=0?'+':'') + val;
  });
}
ABILS.forEach(a=> $(a).addEventListener('change', updateDerived));
['hp-roll','hp-bonus','hp-temp','origin-bonus','prof-bonus','power-save-ability'].forEach(id=> $(id).addEventListener('input', updateDerived));
ABILS.forEach(a=> $('save-'+a+'-prof').addEventListener('change', updateDerived));
SKILLS.forEach((s,i)=> $('skill-'+i+'-prof').addEventListener('change', updateDerived));

const CLASS_DATA = {
  'Mutant': { perk: 'Reroll one failed saving throw per long rest.', res: 'Radiation, Psychic', vuln: 'Necrotic, Force' },
  'Enhanced Human': { perk: 'Advantage on all Technology-related checks.', res: 'Piercing, Fire', vuln: 'Psychic, Radiation' },
  'Magic User': { perk: 'Cast one minor magical effect (prestidigitation) per long rest.', res: 'Force, Necrotic', vuln: 'Confusion, Radiation' },
  'Alien/Extraterrestrial': { perk: 'Immune to environmental hazard and no penalty to movement in rough terrain.', res: 'Cold, Acid, Lightning', vuln: 'Radiant, Emotion' },
  'Mystical Being': { perk: '+2 to Persuasion or Intimidation checks.', res: 'Corruption, Radiation', vuln: 'Radiant, Psychic' }
};

const STYLE_DATA = {
  'Physical Powerhouse': 'Cut one attack by half once per combat encounter.',
  'Energy Manipulator': 'Reroll 1s once per turn.',
  'Speedster': '+10 ft movement and +1 AC while moving 20+ ft.',
  'Telekinetic/Psychic': 'Force enemies to reroll all rolls above a 17 once per rest.',
  'Illusionist': 'Create a 1-min decoy illusion once per combat encounter.',
  'Shape-shifter': 'Advantage on Deception, disguise freely.',
  'Elemental Controller': '+2 to hit and +5 to damage once per turn when using elemental powers.'
};

const ORIGIN_DATA = {
  'The Accident': 'Resistance to one damage type.',
  'The Experiment': 'Reroll a failed CON or INT save once per long rest.',
  'The Legacy': 'Use the powers of one other character you’ve met or are related to once per long rest.',
  'The Awakening': '+5 to hit and +10 to damage when below ½ HP.',
  'The Pact': 'Auto-success on one save or +10 to any roll once per long rest.',
  'The Lost Time': 'Once per combat when using a power, roll a d20 (DC17); on success it costs no SP and gains +1d6 bonus.',
  'The Exposure': '+5 elemental damage once per round.',
  'The Rebirth': 'If knocked out, stand up with 1 HP and resistance to all damage for 1 round.',
  'The Vigil': 'Create a shield once per combat reducing ally damage to 0 for one turn.',
  'The Redemption': 'Once per day take damage for an ally to heal them 1d6 and give advantage; after combat you gain advantage on all saves till dawn.'
};
function updateClassDetails(){
  const d = CLASS_DATA[elClass.value] || {};
  elClassPerk.value = d.perk || '';
  elResist.value = d.res || '';
  elVuln.value = d.vuln || '';
}
elClass.addEventListener('change', updateClassDetails);
updateClassDetails();

function updateStyleDetails(){
  elStylePerk.value = STYLE_DATA[elStyle.value] || '';
  elStyle2Perk.value = STYLE_DATA[elStyle2.value] || '';
}
elStyle.addEventListener('change', updateStyleDetails);
elStyle2.addEventListener('change', updateStyleDetails);
updateStyleDetails();

function updateOriginDetails(){
  elOriginPerk.value = ORIGIN_DATA[elOrigin.value] || '';
}
elOrigin.addEventListener('change', updateOriginDetails);
updateOriginDetails();

/* ========= HP/SP controls ========= */
function setHP(v){
  elHPBar.value = Math.max(0, Math.min(num(elHPBar.max), v));
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
}
function setSP(v){
  elSPBar.value = Math.max(0, Math.min(num(elSPBar.max), v));
  elSPPill.textContent = `${num(elSPBar.value)}/${num(elSPBar.max)}`;
}
$('hp-dmg').addEventListener('click', ()=>{ let d=num($('hp-amt').value); if(!d) return; let tv=num(elHPTemp.value); if(d>0 && tv>0){ const use=Math.min(tv,d); tv-=use; elHPTemp.value=tv; d-=use; } setHP(num(elHPBar.value)-d); });
$('hp-heal').addEventListener('click', ()=>{ const d=num($('hp-amt').value)||0; setHP(num(elHPBar.value)+d); });
$('hp-full').addEventListener('click', ()=> setHP(num(elHPBar.max)));
$('sp-full').addEventListener('click', ()=> setSP(num(elSPBar.max)));
qsa('[data-sp]').forEach(b=> b.addEventListener('click', ()=> setSP(num(elSPBar.value) + num(b.dataset.sp)||0)));
$('long-rest').addEventListener('click', ()=>{ setHP(num(elHPBar.max)); setSP(num(elSPBar.max)); });

function setCP(v){
  elCPBar.value = Math.max(0, Math.min(num(elCPBar.max), v));
  elCPPill.textContent = `${num(elCPBar.value)}/${num(elCPBar.max)}`;
}
$('cp-use').addEventListener('click', ()=>{ const d=num($('cp-amt').value)||0; setCP(num(elCPBar.value)-d); });
$('cp-reset').addEventListener('click', ()=> setCP(num(elCPBar.max)));
setCP(num(elCPBar.value)||num(elCPBar.max));

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
const fmt = (ts)=>new Date(ts).toLocaleTimeString();
function pushLog(arr, entry, key){ arr.push(entry); if (arr.length>30) arr.splice(0, arr.length-30); localStorage.setItem(key, JSON.stringify(arr)); }
function renderLogs(){
  $('log-dice').innerHTML = diceLog.slice(-10).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('log-coin').innerHTML = coinLog.slice(-10).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
}
$('roll-dice').addEventListener('click', ()=>{
  const s = num($('dice-sides').value), c=num($('dice-count').value)||1;
  const rolls = Array.from({length:c}, ()=> 1+Math.floor(Math.random()*s));
  const sum = rolls.reduce((a,b)=>a+b,0);
  $('dice-out').textContent = `Rolls: ${rolls.join(', ')} (Sum: ${sum})`;
  pushLog(diceLog, {t:Date.now(), text:`${c}×d${s}: ${rolls.join(', ')} = ${sum}`}, 'dice-log');
});
$('flip').addEventListener('click', ()=>{
  const v = Math.random()<.5 ? 'Heads' : 'Tails';
  $('flip-out').textContent = v;
  pushLog(coinLog, {t:Date.now(), text:v}, 'coin-log');
});
$('btn-log').addEventListener('click', ()=>{ renderLogs(); show('modal-log'); });
qsa('[data-close]').forEach(b=> b.addEventListener('click', ()=> b.closest('.overlay')?.classList.add('hidden') ));

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
  });
  delWrap.appendChild(delBtn);
  card.appendChild(delWrap);
  if (cfg.onChange) {
    qsa('input,select', card).forEach(el => el.addEventListener('input', cfg.onChange));
  }
  return card;
}

$('add-power').addEventListener('click', () => $('powers').appendChild(createCard('power')));
$('add-sig').addEventListener('click', () => $('sigs').appendChild(createCard('sig')));

/* ========= Gear ========= */
$('add-weapon').addEventListener('click', () => $('weapons').appendChild(createCard('weapon')));
$('add-armor').addEventListener('click', () => $('armors').appendChild(createCard('armor')));
$('add-item').addEventListener('click', () => $('items').appendChild(createCard('item')));

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
const roster = JSON.parse(localStorage.getItem('enc-roster')||'[]');
function saveEnc(){ localStorage.setItem('enc-roster', JSON.stringify(roster)); localStorage.setItem('enc-round', String(round)); }
function renderEnc(){
  $('round-pill').textContent='Round '+round;
  const list=$('enc-list'); list.innerHTML='';
  roster.sort((a,b)=>(b.init||0)-(a.init||0) || String(a.name).localeCompare(String(b.name)));
  roster.forEach((r,idx)=>{
    const row=document.createElement('div'); row.className='catalog-item';
    row.innerHTML = `<div class="pill">${r.init}</div><div><b>${r.name}</b></div>
      <div class="inline" style="gap:6px">
        <button class="btn-sm" data-up="${idx}">▲</button>
        <button class="btn-sm" data-down="${idx}">▼</button>
        <button class="btn-sm" data-del="${idx}">Delete</button>
      </div>`;
    list.appendChild(row);
  });
  qsa('[data-del]', $('enc-list')).forEach(b=> b.addEventListener('click', ()=>{ roster.splice(Number(b.dataset.del),1); renderEnc(); saveEnc(); }));
  qsa('[data-up]', $('enc-list')).forEach(b=> b.addEventListener('click', ()=>{ const i=Number(b.dataset.up); if(i>0){ const t=roster[i-1]; roster[i-1]=roster[i]; roster[i]=t; renderEnc(); saveEnc(); }}));
  qsa('[data-down]', $('enc-list')).forEach(b=> b.addEventListener('click', ()=>{ const i=Number(b.dataset.down); if(i<roster.length-1){ const t=roster[i+1]; roster[i+1]=roster[i]; roster[i]=t; renderEnc(); saveEnc(); }}));
}
$('btn-enc').addEventListener('click', ()=>{ renderEnc(); show('modal-enc'); });
$('enc-add').addEventListener('click', ()=>{ const name=$('enc-name').value.trim(); const init=Number($('enc-init').value||0);
  if(!name) return toast('Enter a name','error'); roster.push({name, init}); $('enc-name').value=''; $('enc-init').value=''; renderEnc(); saveEnc(); });
$('enc-next').addEventListener('click', ()=>{ round+=1; renderEnc(); saveEnc(); });
$('enc-reset').addEventListener('click', ()=>{ if(!confirm('Reset encounter and round?')) return; round=1; roster.length=0; renderEnc(); saveEnc(); });
qsa('#modal-enc [data-close]').forEach(b=> b.addEventListener('click', ()=> hide('modal-enc')));

/* ========= Save / Load (cloud-first, silent local mirror) ========= */
let firebaseCfgPromise;
async function loadFirebaseConfig(){
  if(!firebaseCfgPromise){
    const url = window.FIREBASE_CONFIG_URL || '../firebase-config.json';
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
  qsa('input,select,textarea').forEach(el=>{
    const id = el.id; if (!id) return;
    if (el.type==='checkbox') data[id] = !!el.checked; else data[id] = el.value;
  });
  data.powers = qsa("[data-kind='power']").map(card => ({
    name: qs("[data-f='name']", card)?.value || '',
    sp: qs("[data-f='sp']", card)?.value || '',
    save: qs("[data-f='save']", card)?.value || '',
    range: qs("[data-f='range']", card)?.value || '',
    effect: qs("[data-f='effect']", card)?.value || ''
  }));
  data.signatures = qsa("[data-kind='sig']").map(card => ({
    name: qs("[data-f='name']", card)?.value || '',
    sp: qs("[data-f='sp']", card)?.value || '',
    save: qs("[data-f='save']", card)?.value || '',
    special: qs("[data-f='special']", card)?.value || '',
    desc: qs("[data-f='desc']", card)?.value || ''
  }));
  data.weapons = qsa("[data-kind='weapon']").map(card => ({
    name: qs("[data-f='name']", card)?.value || '',
    damage: qs("[data-f='damage']", card)?.value || '',
    range: qs("[data-f='range']", card)?.value || ''
  }));
  data.armor = qsa("[data-kind='armor']").map(card => ({
    name: qs("[data-f='name']", card)?.value || '',
    slot: qs("[data-f='slot']", card)?.value || 'Body',
    bonus: Number(qs("[data-f='bonus']", card)?.value || 0),
    equipped: !!qs("[data-f='equipped']", card)?.checked
  }));
  data.items = qsa("[data-kind='item']").map(card => ({
    name: qs("[data-f='name']", card)?.value || '',
    qty: Number(qs("[data-f='qty']", card)?.value || 1),
    notes: qs("[data-f='notes']", card)?.value || ''
  }));
  return data;
}
function deserialize(data){
  $('powers').innerHTML=''; $('sigs').innerHTML=''; $('weapons').innerHTML=''; $('armors').innerHTML=''; $('items').innerHTML='';
  Object.entries(data||{}).forEach(([k,v])=>{ const el=$(k); if (!el) return; if (el.type==='checkbox') el.checked=!!v; else el.value=v; });
  (data?.powers||[]).forEach(p=> $('powers').appendChild(createCard('power', p)));
  (data?.signatures||[]).forEach(s=> $('sigs').appendChild(createCard('sig', s)));
  (data?.weapons||[]).forEach(w=> $('weapons').appendChild(createCard('weapon', w)));
  (data?.armor||[]).forEach(a=> $('armors').appendChild(createCard('armor', a)));
  (data?.items||[]).forEach(i=> $('items').appendChild(createCard('item', i)));
  updateDerived();
}
const ENCODE = (s)=>encodeURIComponent(String(s||''));
async function saveCloud(name, payload){
  const r = await getRTDB().catch(err=>{ console.error('RTDB init failed', err); return null; });
  if (r){
    const { db, ref, set } = r;
    let tries = 2;
    while(tries--){
      try{
        await set(ref(db, '/saves/'+ENCODE(name)), { updatedAt: Date.now(), data: payload });
        break;
      }catch(e){
        console.error('Firebase set failed', e);
        if (!tries){ toast('Cloud save failed. Data saved locally.','error'); }
        else{ await new Promise(res=>setTimeout(res,1000)); }
      }
    }
  } else {
    if (!navigator.onLine) toast('Offline: saved locally only','error');
    else toast('Cloud unavailable; saved locally','error');
  }
  try{ localStorage.setItem('save:'+name, JSON.stringify(payload)); localStorage.setItem('last-save', name);}catch(e){ console.error('Local save failed', e); }
}
async function loadCloud(name){
  const r = await getRTDB().catch(err=>{ console.error('RTDB init failed', err); return null; });
  if (r){
    const { db, ref, get } = r;
    let snap=null, tries=2;
    while(tries--){
      try{
        snap = await get(ref(db, '/saves/'+ENCODE(name)));
        if (!snap.exists()) snap = await get(ref(db, '/saves/'+name));
        break;
      }catch(e){
        console.error('Firebase get failed', e);
        if (!tries){ toast('Cloud load failed. Trying local save.','error'); }
        else{ await new Promise(res=>setTimeout(res,1000)); }
      }
    }
    if (snap && snap.exists()){
      const v = snap.val();
      return v?.data || v?.character || v?.sheet || v;
    }
  } else {
    if (!navigator.onLine) toast('Offline: using local save','error');
    else toast('Cloud unavailable; using local save','error');
  }
  try{ const raw=localStorage.getItem('save:'+name); if(raw) return JSON.parse(raw); }catch(e){ console.error('Local load failed', e); }
  throw new Error('No save found');
}
$('btn-save').addEventListener('click', ()=>{ $('save-key').value = localStorage.getItem('last-save') || $('superhero').value || ''; show('modal-save'); });
$('btn-load').addEventListener('click', ()=>{ $('load-key').value = ''; show('modal-load'); });
$('do-save').addEventListener('click', async ()=>{
  const name = $('save-key').value.trim(); if(!name) return toast('Enter a name','error');
  await saveCloud(name, serialize()); hide('modal-save'); toast('Saved','success');
});
$('do-load').addEventListener('click', async ()=>{
  const name = $('load-key').value.trim(); if(!name) return toast('Enter a name','error');
  try{ const data = await loadCloud(name); deserialize(data); hide('modal-load'); toast('Loaded','success'); } catch(e){ console.error('Load failed', e); toast('Could not load: '+(e?.message||''),'error'); }
});

/* ========= Rules ========= */
$('btn-rules').addEventListener('click', ()=> show('modal-rules'));

/* ========= Close + click-outside ========= */
qsa('.overlay').forEach(ov=> ov.addEventListener('click', (e)=>{ if (e.target===ov) ov.classList.add('hidden'); }));

/* ========= boot ========= */
updateDerived();
