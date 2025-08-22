/* ========= helpers ========= */
import { $, qs, qsa, num, mod, calculateArmorBonus, wizardProgress } from './helpers.js';
import { saveLocal, saveCloud } from './storage.js';
import { currentPlayer, getPlayers, loadPlayerCharacter, isDM } from './users.js';
import { show, hide } from './modal.js';
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.module.mjs';
let cccgPage = 1;
const cccgCanvas = qs('#cccg-canvas');
const cccgCtx = cccgCanvas ? cccgCanvas.getContext('2d') : null;
const CCCCG_SRC = './ccccg.pdf';
let cccgDoc = null;
let dmPlayer = null;

/* ========= viewport ========= */
function setVh(){
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
setVh();
window.addEventListener('resize', setVh);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setVh);
}
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 7.5h12m-9 0v9m6-9v9M4.5 7.5l1 12A2.25 2.25 0 007.75 21h8.5a2.25 2.25 0 002.25-2.25l1-12M9.75 7.5V4.875A1.125 1.125 0 0110.875 3.75h2.25A1.125 1.125 0 0114.25 4.875V7.5"/></svg>';

async function renderCCCG(){
  if(!cccgCanvas || !cccgCtx || typeof pdfjsLib === 'undefined') return;
  if(!cccgDoc){
    try{
      cccgDoc = await pdfjsLib.getDocument(CCCCG_SRC).promise;
    }catch(e){ return; }
  }
  const total = cccgDoc.numPages;
  if(cccgPage < 1) cccgPage = 1;
  if(cccgPage > total) cccgPage = total;
  const page = await cccgDoc.getPage(cccgPage);
  const viewport = page.getViewport({ scale:1 });
  const width = cccgCanvas.parentElement.clientWidth;
  const scale = width / viewport.width;
  const vp = page.getViewport({ scale });
  cccgCanvas.height = vp.height;
  cccgCanvas.width = vp.width;
  await page.render({ canvasContext: cccgCtx, viewport: vp }).promise;
}

function applyDeleteIcon(btn){
  if(!btn) return;
  btn.innerHTML = ICON_TRASH;
  btn.setAttribute('aria-label','Delete');
  btn.style.width = '15px';
  btn.style.height = '15px';
  btn.style.minHeight = '15px';
  btn.style.padding = '0';
  btn.style.flex = '0 0 auto';
}

function applyDeleteIcons(root=document){
  qsa('button[data-del], button[data-act="del"]', root).forEach(applyDeleteIcon);
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
const THEME_ICONS = {
  dark: 'icon-dark',
  light: 'icon-light',
  high: 'icon-high',
  forest: 'icon-forest',
  ocean: 'icon-ocean',
  mutant: 'icon-mutant',
  enhanced: 'icon-enhanced',
  magic: 'icon-magic',
  alien: 'icon-alien',
  mystic: 'icon-mystic'
};
function applyTheme(t){
  root.classList.remove('theme-light','theme-high','theme-forest','theme-ocean','theme-mutant','theme-enhanced','theme-magic','theme-alien','theme-mystic');
  if(t==='light') root.classList.add('theme-light');
  if(t==='high') root.classList.add('theme-high');
  if(t==='forest') root.classList.add('theme-forest');
  if(t==='ocean') root.classList.add('theme-ocean');
  if(t==='mutant') root.classList.add('theme-mutant');
  if(t==='enhanced') root.classList.add('theme-enhanced');
  if(t==='magic') root.classList.add('theme-magic');
  if(t==='alien') root.classList.add('theme-alien');
  if(t==='mystic') root.classList.add('theme-mystic');
  if(btnTheme){
    qsa('svg', btnTheme).forEach(i => i.style.display = 'none');
    const iconId = THEME_ICONS[t] || 'icon-dark';
    const icon = qs(`#${iconId}`, btnTheme);
    if(icon) icon.style.display = 'block';
  }
}
function loadTheme(){
  const player=currentPlayer();
  const key=player?`theme:${player}`:'theme';
  const theme=localStorage.getItem(key)||localStorage.getItem('theme')||'dark';
  applyTheme(theme);
}
loadTheme();
if (btnTheme) {
  btnTheme.addEventListener('click', ()=>{
    const themes=['dark','light','high','forest','ocean'];
    const player=currentPlayer();
    const key=player?`theme:${player}`:'theme';
    const curr=localStorage.getItem(key)||'dark';
    const next=themes[(themes.indexOf(curr)+1)%themes.length];
    localStorage.setItem(key, next);
    if(player) localStorage.setItem('theme', next);
    applyTheme(next);
  });
}
window.addEventListener('playerChanged', loadTheme);

const CLASS_THEMES = {
  'Mutant':'mutant',
  'Enhanced Human':'enhanced',
  'Magic User':'magic',
  'Alien/Extraterrestrial':'alien',
  'Mystical Being':'mystic'
};
function bindClassificationTheme(id){
  const sel=$(id);
  if(!sel) return;
  const apply=()=>{
    const t=CLASS_THEMES[sel.value];
    if(t){
      const player=currentPlayer();
      const key=player?`theme:${player}`:'theme';
      localStorage.setItem(key,t);
      if(player) localStorage.setItem('theme', t);
      applyTheme(t);
    }
  };
  sel.addEventListener('change', apply);
  apply();
}
bindClassificationTheme('classification');
bindClassificationTheme('wiz-classification');

const btnMenu = $('btn-menu');
const menuActions = $('menu-actions');
if (btnMenu && menuActions) {
  btnMenu.addEventListener('click', () => {
    menuActions.classList.toggle('show');
  });
  document.addEventListener('click', e => {
    if (!btnMenu.contains(e.target) && !menuActions.contains(e.target)) {
      menuActions.classList.remove('show');
    }
  });
}

/* ========= header ========= */
const headerEl = qs('header');

/* ========= tabs ========= */
function setTab(name){
  qsa('section[data-tab]').forEach(s=> s.style.display = s.getAttribute('data-tab')===name ? 'block':'none');
  qsa('.tab').forEach(b=> b.classList.toggle('active', b.getAttribute('data-go')===name));
  try {
    localStorage.setItem('active-tab', name);
  } catch (e) {}
}

const switchTab = name => {
  if (headerEl && window.scrollY > 0) {
    headerEl.classList.add('hide-tabs');
    const onScroll = () => {
      if (window.scrollY === 0) {
        headerEl.classList.remove('hide-tabs');
        setTab(name);
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    setTab(name);
  }
};
qsa('.tab').forEach(b=> b.addEventListener('click', ()=> switchTab(b.getAttribute('data-go'))));
let initialTab = 'combat';
try {
  const storedTab = localStorage.getItem('active-tab');
  if (storedTab && qs(`.tab[data-go="${storedTab}"]`)) initialTab = storedTab;
} catch (e) {}
setTab(initialTab);

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
  <div class="ability-box">
    <label>${a.toUpperCase()}</label>
    <div class="score"><span class="score-val" id="save-${a}">+0</span></div>
    <label class="inline"><input type="checkbox" id="save-${a}-prof"/> Proficient</label>
    <button class="btn-sm" data-roll-save="${a}">Roll</button>
    <span class="pill result" id="save-${a}-res" data-placeholder="000"></span>
  </div>
`).join('');

const SKILLS = [
  { name: 'Acrobatics', abil: 'dex' },
  { name: 'Biocontrol', abil: 'wis' },
  { name: 'Technology', abil: 'int' },
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
  <div class="ability-box">
    <label>${s.name}</label>
    <div class="score"><span class="score-val" id="skill-${i}">+0</span></div>
    <label class="inline"><input type="checkbox" id="skill-${i}-prof"/> Proficient</label>
    <button class="btn-sm" data-roll-skill="${i}">Roll</button>
    <span class="pill result" id="skill-${i}-res" data-placeholder="000"></span>
  </div>
`).join('');

qsa('[data-roll-save]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const a = btn.dataset.rollSave;
    const pb = num(elProfBonus.value)||2;
    const bonus = mod($(a).value) + ($('save-'+a+'-prof').checked ? pb : 0);
    rollWithBonus(`${a.toUpperCase()} save`, bonus, $('save-'+a+'-res'));
  });
});
qsa('[data-roll-skill]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const i = num(btn.dataset.rollSkill);
    const s = SKILLS[i];
    const pb = num(elProfBonus.value)||2;
    const bonus = mod($(s.abil).value) + ($('skill-'+i+'-prof').checked ? pb : 0);
    rollWithBonus(`${s.name} check`, bonus, $('skill-'+i+'-res'));
  });
});

const STATUS_EFFECTS = [
  { id: 'blinded', name: 'Blinded', desc: 'A blinded creature cannot see and automatically fails any ability check that requires sight. Attack rolls against the creature have advantage, and the creature’s attack rolls have disadvantage.' },
  { id: 'charmed', name: 'Charmed', desc: 'A charmed creature can’t attack the charmer or target the charmer with harmful abilities or magical effects.' },
  { id: 'deafened', name: 'Deafened', desc: 'A deafened creature can’t hear and automatically fails any ability check that requires hearing.' },
  { id: 'frightened', name: 'Frightened', desc: 'A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.' },
  { id: 'grappled', name: 'Grappled', desc: 'A grappled creature’s speed becomes 0, and it can’t benefit from any bonus to its speed.' },
  { id: 'incapacitated', name: 'Incapacitated', desc: 'An incapacitated creature can’t take actions or reactions.' },
  { id: 'invisible', name: 'Invisible', desc: 'An invisible creature is impossible to see without the aid of magic or a special sense.' },
  { id: 'paralyzed', name: 'Paralyzed', desc: 'A paralyzed creature is incapacitated and can’t move or speak.' },
  { id: 'petrified', name: 'Petrified', desc: 'A petrified creature is transformed, along with any nonmagical object it is wearing or carrying, into a solid inanimate substance.' },
  { id: 'poisoned', name: 'Poisoned', desc: 'A poisoned creature has disadvantage on attack rolls and ability checks.' },
  { id: 'prone', name: 'Prone', desc: 'A prone creature’s only movement option is to crawl unless it stands up.' },
  { id: 'restrained', name: 'Restrained', desc: 'A restrained creature’s speed becomes 0, and it can’t benefit from any bonus to its speed.' },
  { id: 'stunned', name: 'Stunned', desc: 'A stunned creature is incapacitated, can’t move, and can speak only falteringly.' },
  { id: 'unconscious', name: 'Unconscious', desc: 'An unconscious creature is incapacitated, can’t move or speak, and is unaware of its surroundings.' }
];

const statusGrid = $('statuses');
const activeStatuses = new Set();
if (statusGrid) {
  statusGrid.innerHTML = STATUS_EFFECTS.map(s => `
    <label class="inline"><input type="checkbox" id="status-${s.id}"/> ${s.name}</label>
  `).join('');
  STATUS_EFFECTS.forEach(s => {
    const cb = $('status-' + s.id);
    if (cb) {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          activeStatuses.add(s.name);
          alert(`${s.name}: ${s.desc}`);
        } else {
          activeStatuses.delete(s.name);
        }
      });
    }
  });
}

document.addEventListener('click', e => {
  if (activeStatuses.size &&
      !e.target.closest('header .top') &&
      !e.target.closest('header .tabs') &&
      !e.target.closest('#statuses') &&
      !e.target.closest('#modal-enc') &&
      !e.target.closest('#modal-log') &&
      !e.target.closest('#modal-log-full') &&
      !e.target.closest('#modal-rules') &&
      !e.target.closest('#modal-campaign') &&
      !e.target.closest('#btn-theme')) {
    alert('Afflicted by: ' + Array.from(activeStatuses).join(', '));
  }
}, true);

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

const COMMON_REP_TIERS = {
  Hostile: ['You are hunted, sabotaged, or attacked on sight.'],
  Untrusted: ['Faction denies you resources, spreads bad PR.'],
  Neutral: ['No strong opinion—standard interactions only.'],
  Recognized: ['Minor perks, small-scale favors.'],
  Trusted: ['Reliable allies, access to mid-tier resources.'],
  Favored: ['Priority treatment, elite support, story leverage.'],
  Champion: ['Icon status, legendary backing, may call in major faction powers.'],
};

const FACTION_REP_PERKS = {
  'O.M.N.I.': { ...COMMON_REP_TIERS },
  'P.F.V.': { ...COMMON_REP_TIERS },
  'Cosmic Conclave': { ...COMMON_REP_TIERS },
  'Greyline PMC': { ...COMMON_REP_TIERS },
};

const REP_TIERS = Object.keys(COMMON_REP_TIERS);

// handle special perk behavior (stat boosts, initiative mods, etc.)
const ACTION_HINTS = [
  'once per',
  'per encounter',
  'per day',
  'per long rest',
  'reroll',
  'call upon',
  'protect an ally',
  'gain temporary hit points',
  'dash as a bonus action',
  'add +'
];

let addWisToInitiative = false;
let enhancedAbility = '';

function handlePerkEffects(li, text){
  const lower = text.toLowerCase();
  if(/increase one ability score by 1/.test(lower)){
    const select = document.createElement('select');
    select.innerHTML = `<option value="">Choose ability</option>` +
      ABILS.map(a=>`<option value="${a}">${a.toUpperCase()}</option>`).join('');
    select.addEventListener('change', ()=>{
      const key = select.value;
      if(enhancedAbility && enhancedAbility !== key){
        const elPrev = $(enhancedAbility);
        if(elPrev){
          const reverted = Math.max(10, Number(elPrev.value) - 1);
          elPrev.value = reverted;
        }
      }
      if(ABILS.includes(key)){
        const el = $(key);
        if(el){
          el.value = Number(el.value) + 1;
          enhancedAbility = key;
        }
      }else{
        enhancedAbility = '';
      }
      updateDerived();
    });
    li.appendChild(document.createTextNode(' '));
    li.appendChild(select);
  }else if(/gain proficiency in one skill/.test(lower)){
    const select = document.createElement('select');
    select.innerHTML = `<option value="">Choose skill</option>` +
      SKILLS.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('');
    select.addEventListener('change', ()=>{
      const prev = select.dataset.prev;
      if(prev !== undefined){
        $('skill-'+prev+'-prof').checked = false;
      }
      const idx = select.value;
      if(idx !== ''){
        $('skill-'+idx+'-prof').checked = true;
        select.dataset.prev = idx;
        updateDerived();
      }
    });
    li.appendChild(document.createTextNode(' '));
    li.appendChild(select);
  }else if(/add your wisdom modifier to initiative/.test(lower)){
    addWisToInitiative = true;
    updateDerived();
  }
}

function setupPerkSelect(selId, perkId, data){
  const sel = $(selId);
  const perkEl = $(perkId);
  if(!sel || !perkEl) return;
  function render(){
    if(selId==='classification' && enhancedAbility){
      const elPrev = $(enhancedAbility);
      if(elPrev){
        elPrev.value = Math.max(10, Number(elPrev.value) - 1);
      }
      enhancedAbility = '';
      updateDerived();
    }
    const perks = data[sel.value] || [];
    perkEl.innerHTML = '';
    if(selId==='alignment') addWisToInitiative = false;
    perks.forEach((p,i)=>{
      const text = typeof p === 'string' ? p : String(p);
      const lower = text.toLowerCase();
      const isAction = ACTION_HINTS.some(k=> lower.includes(k));
      let li;
      if(isAction){
        const id = `${selId}-perk-${i}`;
        li = document.createElement('li');
        li.innerHTML = `<label class="inline"><input type="checkbox" id="${id}"/> ${text}</label>`;
      }else{
        li = document.createElement('li');
        li.textContent = text;
      }
      perkEl.appendChild(li);
      handlePerkEffects(li, text);
    });
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
const elStr = $('str');
const elDex = $('dex');
const elCon = $('con');
const elWis = $('wis');
const elSPBar = $('sp-bar');
const elSPPill = $('sp-pill');
const elHPBar = $('hp-bar');
const elHPPill = $('hp-pill');
const elHPRoll = $('hp-roll');
const elHPTemp = $('hp-temp');
const elHPRollAdd = $('hp-roll-add');
const elHPRollInput = $('hp-roll-input');
const elHPRollList = $('hp-roll-list');
const elInitiative = $('initiative');
const elProfBonus = $('prof-bonus');
const elPowerSaveAbility = $('power-save-ability');
const elPowerSaveDC = $('power-save-dc');
const elXP = $('xp');
const elXPBar = $('xp-bar');
const elXPPill = $('xp-pill');
const elTier = $('tier');
const elCAPCheck = $('cap-check');
const elCAPStatus = $('cap-status');
const FACTIONS = ['omni','pfv','conclave','greyline'];
const FACTION_NAME_MAP = {
  omni: 'O.M.N.I.',
  pfv: 'P.F.V.',
  conclave: 'Cosmic Conclave',
  greyline: 'Greyline PMC',
};

let hpRolls = [];
if (elHPRoll) {
  const initial = num(elHPRoll.value);
  if (initial) hpRolls = [initial];
}

if (elCAPCheck && elCAPStatus) {
  elCAPCheck.addEventListener('change', () => {
    elCAPStatus.textContent = elCAPCheck.checked ? 'Used' : 'Available';
  });
}

const XP_TIERS = [
  { xp: 0, label: 'Tier 5 – Rookie' },
  { xp: 2000, label: 'Tier 4 – Emerging Vigilante' },
  { xp: 6000, label: 'Tier 3 – Field-Tested Operative' },
  { xp: 18000, label: 'Tier 2 – Respected Force' },
  { xp: 54000, label: 'Tier 1 – Heroic Figure' },
  { xp: 162000, label: 'Tier 0 – Transcendent / Legendary' }
];

function getTierIndex(xp){
  for(let i=XP_TIERS.length-1;i>=0;i--){
    if(xp >= XP_TIERS[i].xp) return i;
  }
  return 0;
}

let currentTierIdx = 0;
let xpInitialized = false;
if (elXP) {
  const initXP = Math.max(0, num(elXP.value));
  currentTierIdx = getTierIndex(initXP);
}

function launchConfetti(){
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0 }
  });
}

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
  const base = 30;
  const conMod = elCon.value === '' ? 0 : mod(elCon.value);
  const total = base + conMod + num(elHPRoll.value||0);
  const prevMax = num(elHPBar.max);
  elHPBar.max = Math.max(0, total);
  if (!num(elHPBar.value) || num(elHPBar.value) === prevMax) elHPBar.value = elHPBar.max;
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
}

function updateXP(){
  const xp = Math.max(0, num(elXP.value));
  const idx = getTierIndex(xp);
  if (xpInitialized && idx > currentTierIdx) {
    launchConfetti();
  }
  currentTierIdx = idx;
  xpInitialized = true;
  if(elTier) elTier.value = XP_TIERS[idx].label;
  const nextTier = XP_TIERS[idx+1];
  const currentTierXP = XP_TIERS[idx].xp;
  if(nextTier){
    const xpIntoTier = xp - currentTierXP;
    const xpForNextTier = nextTier.xp - currentTierXP;
    elXPBar.max = xpForNextTier;
    elXPBar.value = xpIntoTier;
    elXPPill.textContent = `${xpIntoTier}/${xpForNextTier}`;
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
  elInitiative.value = mod(elDex.value) + (addWisToInitiative ? mod(elWis.value) : 0);
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
['hp-temp','origin-bonus','prof-bonus','power-save-ability'].forEach(id=> $(id).addEventListener('input', updateDerived));
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

function updateFactionRep(){
  FACTIONS.forEach(f=>{
    const input = $(`${f}-rep`);
    const bar = $(`${f}-rep-bar`);
    const tierEl = $(`${f}-rep-tier`);
    const perkEl = $(`${f}-rep-perk`);
    if(!input || !bar || !tierEl || !perkEl) return;
    let val = Math.max(0, num(input.value));
    const maxVal = REP_TIERS.length * 100 - 1;
    if(val > maxVal) val = maxVal;
    input.value = val;
    const tierIdx = Math.min(REP_TIERS.length - 1, Math.floor(val / 100));
    const tierName = REP_TIERS[tierIdx];
    bar.value = val % 100;
    tierEl.textContent = tierName;
    perkEl.innerHTML = '';
    const facName = FACTION_NAME_MAP[f];
    const perks = (FACTION_REP_PERKS[facName] && FACTION_REP_PERKS[facName][tierName]) || [];
    perks.forEach((p,i)=>{
      const text = typeof p === 'string' ? p : String(p);
      const lower = text.toLowerCase();
      const isAction = ACTION_HINTS.some(k=> lower.includes(k));
      let li;
      if(isAction){
        const id = `${f}-rep-perk-${i}`;
        li = document.createElement('li');
        li.innerHTML = `<label class="inline"><input type="checkbox" id="${id}"/> ${text}</label>`;
      }else{
        li = document.createElement('li');
        li.textContent = text;
      }
      perkEl.appendChild(li);
      handlePerkEffects(li, text);
    });
    perkEl.style.display = perks.length ? 'block' : 'none';
  });
}

function setupFactionRepTracker(){
  FACTIONS.forEach(f=>{
    const input = $(`${f}-rep`);
    const gain = $(`${f}-rep-gain`);
    const lose = $(`${f}-rep-lose`);
    if(!input || !gain || !lose) return;
    gain.addEventListener('click', ()=>{
      input.value = Math.max(0, num(input.value) + 5);
      updateFactionRep();
    });
    lose.addEventListener('click', ()=>{
      input.value = Math.max(0, num(input.value) - 5);
      updateFactionRep();
    });
  });
  updateFactionRep();
}

/* ========= HP/SP controls ========= */
function setHP(v){
  const prev = num(elHPBar.value);
  elHPBar.value = Math.max(0, Math.min(num(elHPBar.max), v));
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
  return prev > 0 && num(elHPBar.value) === 0;
}
async function setSP(v){
  const prev = num(elSPBar.value);
  if (num(v) < 0) {
    alert("You don't have enough SP for that.");
    return;
  }
  elSPBar.value = Math.max(0, Math.min(num(elSPBar.max), v));
  elSPPill.textContent = `${num(elSPBar.value)}/${num(elSPBar.max)}`;
  const diff = num(elSPBar.value) - prev;
  if(diff !== 0) await playSPAnimation(diff);
  if(prev > 0 && num(elSPBar.value) === 0) alert('Player is out of SP');
}
$('hp-dmg').addEventListener('click', async ()=>{
  let d=num($('hp-amt').value);
  if(!d) return;
  let tv=num(elHPTemp.value);
  if(d>0 && tv>0){
    const use=Math.min(tv,d);
    tv-=use;
    elHPTemp.value=tv;
    d-=use;
  }
  const down = setHP(num(elHPBar.value)-d);
  await playDamageAnimation(-d);
  if(down) alert('Player is down');
});
$('hp-heal').addEventListener('click', async ()=>{
  const d=num($('hp-amt').value)||0;
  setHP(num(elHPBar.value)+d);
  if(d>0) await playHealAnimation(d);
});
$('hp-full').addEventListener('click', async ()=>{
  const diff = num(elHPBar.max) - num(elHPBar.value);
  if(diff>0) await playHealAnimation(diff);
  setHP(num(elHPBar.max));
});
$('sp-full').addEventListener('click', ()=> setSP(num(elSPBar.max)));
qsa('[data-sp]').forEach(b=> b.addEventListener('click', ()=> setSP(num(elSPBar.value) + num(b.dataset.sp)||0) ));
$('long-rest').addEventListener('click', ()=>{
  setHP(num(elHPBar.max));
  setSP(num(elSPBar.max));
  elHPTemp.value='';
  const spTemp=$('sp-temp'); if(spTemp) spTemp.value='';
  // clear all checkbox states on the page
  qsa('input[type="checkbox"]').forEach(cb=>{
    cb.checked = false;
    cb.removeAttribute('checked');
  });
  if (elCAPStatus) elCAPStatus.textContent = 'Available';
  activeStatuses.clear();
});
function renderHPRollList(){
  if(!elHPRollList) return;
  elHPRollList.innerHTML='';
  hpRolls.forEach((val,idx)=>{
    const li=document.createElement('li');
    li.textContent = `+${val}`;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn-sm';
    applyDeleteIcon(btn);
    btn.addEventListener('click', ()=>{
      hpRolls.splice(idx,1);
      elHPRoll.value = hpRolls.reduce((a,b)=>a+b,0);
      updateHP();
      renderHPRollList();
    });
    li.appendChild(btn);
    elHPRollList.appendChild(li);
  });
  elHPRollList.style.display = hpRolls.length ? 'block' : 'none';
}
if (elHPRollAdd) {
  elHPRollAdd.addEventListener('click', ()=>{
    elHPRollInput.value='';
    renderHPRollList();
    show('modal-hp-roll');
  });
  $('hp-roll-save').addEventListener('click', ()=>{
    const v=num(elHPRollInput.value);
    if(!v) return hide('modal-hp-roll');
    hpRolls.push(v);
    elHPRoll.value = hpRolls.reduce((a,b)=>a+b,0);
    updateHP();
    renderHPRollList();
    hide('modal-hp-roll');
  });
  qsa('#modal-hp-roll [data-close]').forEach(b=> b.addEventListener('click', ()=> hide('modal-hp-roll')));
}

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
const campaignLog = safeParse('campaign-log');
const fmt = (ts)=>new Date(ts).toLocaleTimeString();
function pushLog(arr, entry, key){ arr.push(entry); if (arr.length>30) arr.splice(0, arr.length-30); localStorage.setItem(key, JSON.stringify(arr)); }
function renderLogs(){
  $('log-dice').innerHTML = diceLog.slice(-5).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('log-coin').innerHTML = coinLog.slice(-5).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
}
function renderFullLogs(){
  $('full-log-dice').innerHTML = diceLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
  $('full-log-coin').innerHTML = coinLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div><b>${e.text}</b></div></div>`).join('');
}

function rollWithBonus(name, bonus, out){
  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + bonus;
  if(out) out.textContent = total;
  const sign = bonus >= 0 ? '+' : '';
  pushLog(diceLog, { t: Date.now(), text: `${name}: ${roll}${sign}${bonus} = ${total}` }, 'dice-log');
  renderLogs();
  renderFullLogs();
  return total;
}
renderLogs();
$('roll-dice').addEventListener('click', ()=>{
  const s = num($('dice-sides').value), c=num($('dice-count').value)||1;
  const out = $('dice-out');
  out.classList.remove('rolling');
  const rolls = Array.from({length:c}, ()=> 1+Math.floor(Math.random()*s));
  const sum = rolls.reduce((a,b)=>a+b,0);
  out.textContent = sum;
  void out.offsetWidth; out.classList.add('rolling');
  playDamageAnimation(sum);
  pushLog(diceLog, {t:Date.now(), text:`${c}×d${s}: ${rolls.join(', ')} = ${sum}`}, 'dice-log');
  renderLogs();
  renderFullLogs();
});
$('flip').addEventListener('click', ()=>{
  const v = Math.random()<.5 ? 'Heads' : 'Tails';
  $('flip-out').textContent = v;
  playCoinAnimation(v);
  pushLog(coinLog, {t:Date.now(), text:v}, 'coin-log');
  renderLogs();
  renderFullLogs();
});

function playDamageAnimation(amount){
  const anim=$('damage-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=`${amount}`;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playDeathAnimation(){
  const anim = $('death-animation');
  if(!anim) return Promise.resolve();
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playHealAnimation(amount){
  const anim=$('heal-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=`+${amount}`;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playSaveAnimation(){
  const anim=$('save-animation');
  if(!anim) return Promise.resolve();
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playCoinAnimation(result){
  const anim=$('coin-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=result;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playSPAnimation(amount){
  const anim = $('sp-animation');
  if(!anim) return Promise.resolve();
  anim.textContent = `${amount>0?'+':''}${amount}`;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

const deathBoxes = ['death-save-1','death-save-2','death-save-3'].map(id => $(id));
let deathHandled=false;
deathBoxes.forEach((box) => {
  box.addEventListener('change', async () => {
    if (!deathHandled && deathBoxes.every(b => b.checked)) {
      deathHandled=true;
      await playDeathAnimation();
      alert('You have fallen, your sacrifice will be remembered.');
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
      .map((e,i)=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div>${e.text}</div><div><button class="btn-sm" data-del="${i}"></button></div></div>`)
      .join('');
    applyDeleteIcons($('campaign-log'));
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
const btnHelp = $('btn-help');
if (btnHelp) {
  btnHelp.addEventListener('click', ()=>{ show('modal-help'); });
}
const btnPlayer = $('btn-player');
if (btnPlayer) {
  btnPlayer.addEventListener('click', ()=>{ show('modal-player'); });
}
const dmLoginLink = $('dm-login-link');
if (dmLoginLink) {
  dmLoginLink.addEventListener('click', (e)=>{
    e.preventDefault();
    show('modal-dm-login');
  });
}
const btnDM = $('btn-dm');
if (btnDM) {
  btnDM.addEventListener('click', ()=>{
    if (!isDM()) return;
    renderDMList();
    show('modal-dm');
  });
}
function renderDMList(){
  if(!isDM()) return;
  const list = $('dm-player-list');
  if(!list) return;
  const players = getPlayers();
  list.innerHTML = players.map(p=>`<div class="catalog-item"><div>${p}</div><div><button class="btn-sm" data-player="${p}">Load</button></div></div>`).join('');
}
const dmList = $('dm-player-list');
if(dmList){
  dmList.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-player]');
    if(!btn) return;
    const player = btn.dataset.player;
    loadPlayerCharacter(player).then(data=>{
      deserialize(data);
      dmPlayer = player;
      hide('modal-dm');
      toast(`Loaded ${player}`,'success');
    }).catch(()=> toast('Load failed','error'));
  });
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
  if (kind === 'weapon' || kind === 'sig' || kind === 'power') {
    const hitBtn = document.createElement('button');
    hitBtn.className = 'btn-sm';
    hitBtn.textContent = 'Roll to Hit';
    const out = document.createElement('span');
    out.className = 'pill result';
    out.dataset.placeholder = '000';
    hitBtn.addEventListener('click', () => {
      const pb = num(elProfBonus.value)||2;
      const rangeVal = qs("[data-f='range']", card)?.value || '';
      const abil = rangeVal ? elDex.value : elStr.value;
      const bonus = mod(abil) + pb;
      const name = qs("[data-f='name']", card)?.value || (kind === 'sig' ? 'Signature Move' : (kind === 'power' ? 'Power' : 'Attack'));
      rollWithBonus(`${name} attack roll`, bonus, out);
    });
    delWrap.appendChild(hitBtn);
    delWrap.appendChild(out);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-sm';
  delBtn.dataset.act = 'del';
  applyDeleteIcon(delBtn);
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
const roster = safeParse('enc-roster');
function saveEnc(){
  localStorage.setItem('enc-roster', JSON.stringify(roster));
  localStorage.setItem('enc-round', String(round));
  localStorage.setItem('enc-turn', String(turn));
}
function renderEnc(){
  const list=$('enc-list'); list.innerHTML='';
    roster.forEach((r,idx)=>{
      const row=document.createElement('div');
      row.className='catalog-item'+(idx===turn?' active':'');
      row.innerHTML = `<div class="pill">${r.init}</div><div><b>${r.name}</b></div><div><button class="btn-sm" data-del="${idx}"></button></div>`;
      list.appendChild(row);
    });
    applyDeleteIcons(list);
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
$('enc-prev').addEventListener('click', ()=>{
  if(!roster.length) return;
  turn = (turn - 1 + roster.length) % roster.length;
  if(turn===roster.length-1 && round>1) round-=1;
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

/* ========= Save / Load ========= */
function serialize(){
  const data={};
  function getVal(sel, root){ const el = qs(sel, root); return el ? el.value : ''; }
  function getChecked(sel, root){ const el = qs(sel, root); return el ? el.checked : false; }
  qsa('input,select,textarea,progress').forEach(el=>{
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
  if (elXP) {
    const xp = Math.max(0, num(elXP.value));
    currentTierIdx = getTierIndex(xp);
  }
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
  const modal = $('modal-rules');
  if (modal && !modal.classList.contains('hidden')) {
    if (e.key === 'PageDown') {
      e.preventDefault();
      cccgPage++;
      renderCCCG();
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      if (cccgPage > 1) cccgPage--;
      renderCCCG();
    }
  }
});

(function(){
  const raw = localStorage.getItem(AUTO_KEY);
  if(raw){
    try{ const data = JSON.parse(raw); deserialize(data); history=[data]; histIdx=0; }
    catch(e){ console.error('Auto-load failed', e); }
  }
  pushHistory();
})();
$('btn-save').addEventListener('click', async () => {
  const btn = $('btn-save');
  const player = currentPlayer() || (isDM() ? dmPlayer : null);
  if (!player) return toast('Login required', 'error');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = serialize();
    const results = [];
    try {
      await saveLocal('player:' + player, data);
      results.push('Local save successful');
    } catch (e) {
      results.push('Local save failed: ' + e.message);
    }
    try {
      await saveCloud('player:' + player, data);
      results.push('Cloud save successful');
    } catch (e) {
      results.push('Cloud save failed: ' + e.message);
    }
    const isErr = results.some(r => r.includes('failed'));
    toast(results.join(' | '), isErr ? 'error' : 'success');
    if(!isErr) playSaveAnimation();
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
});


/* ========= Character Creation Wizard ========= */
const btnWizard = $('btn-wizard');
const modalWizard = $('modal-wizard');
if (btnWizard && modalWizard) {
  const steps = qsa('#wizard-steps .wizard-step');
  const prevBtn = $('wizard-prev');
  const nextBtn = $('wizard-next');
  const progressEl = $('wizard-progress');
  let stepIndex = 0;

  const abilGrid = $('wizard-abil-grid');
  if (abilGrid) {
    abilGrid.innerHTML = ABILS.map(a => `
      <div class="ability-box">
        <label for="wiz-${a}">${a.toUpperCase()}</label>
        <div class="score">
          <select id="wiz-${a}"></select>
          <span class="mod" id="wiz-${a}-mod">+0</span>
        </div>
      </div>`).join('');
    ABILS.forEach(a => {
      const sel = $('wiz-' + a);
      const orig = $(a);
      const modSpan = $('wiz-' + a + '-mod');
      for (let v = 10; v <= 24; v++) sel.add(new Option(v, v));
      if (orig) sel.value = orig.value;
      const sync = () => {
        if (orig) {
          orig.value = sel.value;
          orig.dispatchEvent(new Event('change', { bubbles: true }));
          if (modSpan) modSpan.textContent = $(a + '-mod').textContent;
        }
      };
      sel.addEventListener('change', sync);
    });
  }

  $('wiz-add-power').addEventListener('click', () => $('add-power').click());
  $('wiz-add-weapon').addEventListener('click', () => $('add-weapon').click());
  $('wiz-add-armor').addEventListener('click', () => $('add-armor').click());
  $('wiz-add-item').addEventListener('click', () => $('add-item').click());

  const selectFields = [
    ['wiz-classification', 'classification'],
    ['wiz-power-style', 'power-style'],
    ['wiz-power-style-2', 'power-style-2'],
    ['wiz-origin', 'origin'],
    ['wiz-alignment', 'alignment']
  ];
  selectFields.forEach(([wizId, baseId]) => {
    const w = $(wizId);
    const b = $(baseId);
    if (w && b) {
      w.addEventListener('change', () => {
        b.value = w.value;
        b.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  });

  const storyFields = [
    ['wiz-superhero', 'superhero'],
    ['wiz-secret', 'secret'],
    ['wiz-public', 'publicIdentity']
  ];
  storyFields.forEach(([wizId, baseId]) => {
    const w = $(wizId);
    const b = $(baseId);
    if (w && b) {
      w.addEventListener('input', () => {
        b.value = w.value;
        b.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  });

  function showWizardStep(i) {
    steps.forEach((s, idx) => s.classList.toggle('active', idx === i));
    prevBtn.disabled = i === 0;
    nextBtn.textContent = i === steps.length - 1 ? 'Finish' : 'Next';
    if (progressEl) {
      progressEl.textContent = wizardProgress(i, steps.length);
    }
    stepIndex = i;
  }

  prevBtn.addEventListener('click', () => {
    if (stepIndex > 0) showWizardStep(stepIndex - 1);
  });
  nextBtn.addEventListener('click', () => {
    if (stepIndex < steps.length - 1) showWizardStep(stepIndex + 1);
    else hide('modal-wizard');
  });

  btnWizard.addEventListener('click', () => {
    ABILS.forEach(a => {
      const sel = $('wiz-' + a);
      const orig = $(a);
      const modSpan = $('wiz-' + a + '-mod');
      if (sel && orig) {
        sel.value = orig.value;
        if (modSpan) modSpan.textContent = $(a + '-mod').textContent;
      }
    });
    selectFields.forEach(([wizId, baseId]) => {
      const w = $(wizId);
      const b = $(baseId);
      if (w && b) w.value = b.value;
    });
    storyFields.forEach(([wizId, baseId]) => {
      const w = $(wizId);
      const b = $(baseId);
      if (w && b) w.value = b.value;
    });
    show('modal-wizard');
    showWizardStep(0);
  });
}

/* ========= Rules ========= */
const btnRules = $('btn-rules');
const btnPageUp = $('cccg-page-up');
const btnPageDown = $('cccg-page-down');
if (btnRules) {
  btnRules.addEventListener('click', ()=>{
    renderCCCG();
    show('modal-rules');
  });
}
if (btnPageUp) {
  btnPageUp.addEventListener('click', ()=>{
    if(cccgPage>1) cccgPage--;
    renderCCCG();
  });
}
if (btnPageDown) {
  btnPageDown.addEventListener('click', ()=>{
    cccgPage++;
    renderCCCG();
  });
}

/* ========= Close + click-outside ========= */
qsa('.overlay').forEach(ov=> ov.addEventListener('click', (e)=>{ if (e.target===ov) hide(ov.id); }));
const welcomeOk = $('welcome-ok');
if (welcomeOk) {
  welcomeOk.addEventListener('click', ()=>{ hide('modal-welcome'); localStorage.setItem('welcome-done','1'); });
}
const welcomeRegister = $('welcome-register');
if (welcomeRegister) {
  welcomeRegister.addEventListener('click', ()=>{ hide('modal-welcome'); localStorage.setItem('welcome-done','1'); show('modal-register'); });
}
if(!localStorage.getItem('welcome-done')) show('modal-welcome');

/* ========= boot ========= */
setupPerkSelect('alignment','alignment-perks', ALIGNMENT_PERKS);
setupPerkSelect('classification','classification-perks', CLASSIFICATION_PERKS);
setupPerkSelect('power-style','power-style-perks', POWER_STYLE_PERKS);
setupPerkSelect('origin','origin-perks', ORIGIN_PERKS);
setupFactionRepTracker();
updateDerived();
applyDeleteIcons();
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const swUrl = new URL('../sw.js', import.meta.url);
  navigator.serviceWorker.register(swUrl.href).catch(e => console.error('SW reg failed', e));
}
