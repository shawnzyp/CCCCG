/* ========= helpers ========= */
import { $, qs, qsa, num, mod, calculateArmorBonus, revertAbilityScore } from './helpers.js';
import { setupFactionRepTracker, ACTION_HINTS, updateFactionRep, migratePublicOpinionSnapshot } from './faction.js';
import {
  currentCharacter,
  setCurrentCharacter,
  listCharacters,
  loadCharacter,
  loadBackup,
  listBackups,
  deleteCharacter,
  saveCharacter,
  renameCharacter,
  listRecoverableCharacters,
} from './characters.js';
import { show, hide } from './modal.js';
import { cacheCloudSaves, subscribeCloudSaves } from './storage.js';
import { hasPin, setPin, verifyPin as verifyStoredPin, clearPin, syncPin } from './pin.js';
import { extractPriceValue } from './catalog-utils.js';
// Global CC object for cross-module state
window.CC = window.CC || {};
CC.partials = CC.partials || {};
CC.savePartial = (k, d) => { CC.partials[k] = d; };
CC.loadPartial = k => CC.partials[k];

const LAUNCH_REVEAL_DELAY = 2600;
(function setupLaunchAnimation(){
  const body = document.body;
  if(!body || !body.classList.contains('launching')) return;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const launchEl = document.getElementById('launch-animation');
  let revealed = false;
  const cleanup = () => {
    if(launchEl && launchEl.parentNode){
      launchEl.parentNode.removeChild(launchEl);
    }
  };
  const reveal = () => {
    if(revealed) return;
    revealed = true;
    body.classList.remove('launching');
    if(launchEl){
      launchEl.addEventListener('transitionend', cleanup, { once: true });
      window.setTimeout(cleanup, 1000);
    }
  };
  if(launchEl){
    const skipLaunch = () => reveal();
    launchEl.addEventListener('click', skipLaunch, { passive: true });
    launchEl.addEventListener('pointerdown', skipLaunch, { passive: true });
  }
  if(prefersReducedMotion){
    reveal();
    return;
  }
  const scheduleReveal = () => window.setTimeout(reveal, LAUNCH_REVEAL_DELAY);
  if(document.readyState === 'complete'){
    scheduleReveal();
  } else {
    window.addEventListener('load', scheduleReveal, { once: true });
  }
  window.setTimeout(reveal, LAUNCH_REVEAL_DELAY + 2000);
})();
// Ensure numeric inputs accept only digits and trigger numeric keypad
document.addEventListener('input', e => {
  if(e.target.matches('input[inputmode="numeric"]')){
    e.target.value = e.target.value.replace(/[^0-9]/g,'');
  }
});
// Load the optional confetti library lazily so tests and offline environments
// don't attempt a network import on startup.
let confettiPromise = null;
function loadConfetti() {
  if (!confettiPromise) {
    confettiPromise = import('https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.module.mjs')
      .then(m => m.default)
      .catch(() => (() => {}));
  }
  return confettiPromise;
}
const rulesEl = qs('#rules-text');
const RULES_SRC = './ruleshelp.txt';
let rulesLoaded = false;

// ----- animation lock -----
// Animations should only run after an explicit user action. To prevent them
// from firing on initial page load, keep them locked until a user interaction
// (click or keydown) occurs.
let animationsEnabled = false;
const INTERACTIVE_SEL = 'button, .icon, .tab, a, input, select, textarea, [role="button"], [data-act]';
function enableAnimations(e){
  if(animationsEnabled) return;
  if(e.type==='click'){
    const interactive=e.target.closest(INTERACTIVE_SEL);
    if(!interactive) return;
  }
  animationsEnabled=true;
  document.removeEventListener('click', enableAnimations, true);
  document.removeEventListener('keydown', enableAnimations, true);
}
// Use capture so the lock is evaluated before other handlers. Do not use `once`
// so clicks from pull-to-refresh are ignored until a real interaction occurs.
document.addEventListener('click', enableAnimations, true);
document.addEventListener('keydown', enableAnimations, true);
// Avoid using 'touchstart' so pull-to-refresh on iOS doesn't enable animations
document.addEventListener('click', e=>{
  if(!animationsEnabled) return;
  const el=e.target.closest(INTERACTIVE_SEL);
  if(el){
    el.classList.add('action-anim');
    el.addEventListener('animationend', ()=>el.classList.remove('action-anim'), {once:true});
  }
}, true);

/* ========= view mode ========= */
const VIEW_LOCK_SKIP_TYPES = new Set(['checkbox','radio','button','submit','reset','file','color','range','hidden','image']);
let viewMode = false;
let viewModeButton = null;

function hasViewAllow(el){
  if (!el || !el.closest) return false;
  if (el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'viewAllow')) return true;
  return !!el.closest('[data-view-allow]');
}

function shouldLockElement(el){
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (hasViewAllow(el)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (VIEW_LOCK_SKIP_TYPES.has(type)) return false;
    return true;
  }
  return false;
}

function lockViewElement(el){
  if (!shouldLockElement(el) || el.dataset.viewLocked === 'true') return;
  el.dataset.viewLocked = 'true';
  if (el.tagName === 'SELECT') {
    el.dataset.viewPrevDisabled = el.disabled ? '1' : '0';
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  } else if (el.tagName === 'TEXTAREA') {
    el.dataset.viewPrevReadonly = el.readOnly ? '1' : '0';
    el.readOnly = true;
    el.setAttribute('aria-readonly', 'true');
  } else {
    el.dataset.viewPrevReadonly = el.readOnly ? '1' : '0';
    el.dataset.viewPrevDisabled = el.disabled ? '1' : '0';
    el.readOnly = true;
    el.setAttribute('aria-readonly', 'true');
  }
}

function unlockViewElement(el){
  if (!el || el.dataset.viewLocked !== 'true') return;
  if (el.tagName === 'SELECT') {
    const wasDisabled = el.dataset.viewPrevDisabled === '1';
    el.disabled = wasDisabled;
    if (!wasDisabled) el.removeAttribute('disabled');
    el.removeAttribute('aria-disabled');
  } else if (el.tagName === 'TEXTAREA') {
    const wasReadonly = el.dataset.viewPrevReadonly === '1';
    el.readOnly = wasReadonly;
    if (!wasReadonly) el.removeAttribute('readonly');
    el.removeAttribute('aria-readonly');
    if (el.dataset.viewPrevDisabled) {
      const wasDisabled = el.dataset.viewPrevDisabled === '1';
      el.disabled = wasDisabled;
      if (!wasDisabled) el.removeAttribute('disabled');
    }
  } else {
    const wasReadonly = el.dataset.viewPrevReadonly === '1';
    const wasDisabled = el.dataset.viewPrevDisabled === '1';
    el.readOnly = wasReadonly;
    if (!wasReadonly) el.removeAttribute('readonly');
    el.removeAttribute('aria-readonly');
    el.disabled = wasDisabled;
    if (!wasDisabled) el.removeAttribute('disabled');
  }
  delete el.dataset.viewPrevReadonly;
  delete el.dataset.viewPrevDisabled;
  delete el.dataset.viewLocked;
}

function applyViewLockState(root=document){
  if (!root) return;
  const targets = new Set();
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root;
    if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) targets.add(el);
  }
  const scope = (root && typeof root.querySelectorAll === 'function') ? root : document;
  qsa('input,select,textarea', scope).forEach(el => targets.add(el));
  targets.forEach(el => {
    if (viewMode) lockViewElement(el);
    else unlockViewElement(el);
  });
}

function syncViewModeButton(){
  if (!viewModeButton) return;
  viewModeButton.setAttribute('aria-pressed', viewMode ? 'true' : 'false');
  viewModeButton.textContent = viewMode ? 'Edit Mode' : 'View Mode';
  viewModeButton.setAttribute('title', viewMode ? 'Switch to Edit Mode' : 'Switch to View Mode');
}

function setViewMode(enabled, { skipPersist = false } = {}){
  const next = !!enabled;
  const changed = viewMode !== next;
  viewMode = next;
  if (document.body) document.body.classList.toggle('is-view-mode', viewMode);
  if (viewMode && document.activeElement && shouldLockElement(document.activeElement)) {
    document.activeElement.blur();
  }
  applyViewLockState();
  syncViewModeButton();
  if (!skipPersist && changed) {
    try { localStorage.setItem('view-mode', viewMode ? '1' : '0'); } catch (e) {}
  }
}

viewModeButton = $('btn-view-mode');
let storedViewMode = false;
try { storedViewMode = localStorage.getItem('view-mode') === '1'; } catch (e) {}
setViewMode(storedViewMode, { skipPersist: true });
if (viewModeButton) {
  viewModeButton.addEventListener('click', () => setViewMode(!viewMode));
}

/* ========= viewport ========= */
function setVh(){
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
setVh();
// Update the CSS viewport height variable on resize or orientation changes
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);
const ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 7.5h12m-9 0v9m6-9v9M4.5 7.5l1 12A2.25 2.25 0 007.75 21h8.5a2.25 2.25 0 002.25-2.25l1-12M9.75 7.5V4.875A1.125 1.125 0 0110.875 3.75h2.25A1.125 1.125 0 0114.25 4.875V7.5"/></svg>';
const ICON_LOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75C16.5 4.26472 14.4853 2.25 12 2.25C9.51472 2.25 7.5 4.26472 7.5 6.75V10.5M6.75 21.75H17.25C18.4926 21.75 19.5 20.7426 19.5 19.5V12.75C19.5 11.5074 18.4926 10.5 17.25 10.5H6.75C5.50736 10.5 4.5 11.5074 4.5 12.75V19.5C4.5 20.7426 5.50736 21.75 6.75 21.75Z"/></svg>';
const ICON_UNLOCK = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75C13.5 4.26472 15.5147 2.25 18 2.25C20.4853 2.25 22.5 4.26472 22.5 6.75V10.5M3.75 21.75H14.25C15.4926 21.75 16.5 20.7426 16.5 19.5V12.75C16.5 11.5074 15.4926 10.5 14.25 10.5H3.75C2.50736 10.5 1.5 11.5074 1.5 12.75V19.5C1.5 20.7426 2.50736 21.75 3.75 21.75Z"/></svg>';

async function renderRules(){
  if (!rulesEl || rulesLoaded) return;
  try {
    const res = await fetch(RULES_SRC);
    rulesEl.textContent = await res.text();
    rulesLoaded = true;
  } catch (e) {
    rulesEl.textContent = 'Failed to load rules.';
  }
}

const DELETE_ICON_STYLE = {
  width: '15px',
  height: '15px',
  minHeight: '15px',
  padding: '0',
  flex: '0 0 auto'
};

function applyDeleteIcon(btn){
  if(!btn) return;
  btn.innerHTML = ICON_TRASH;
  btn.setAttribute('aria-label','Delete');
  Object.assign(btn.style, DELETE_ICON_STYLE);
}

function applyDeleteIcons(root=document){
  qsa('button[data-del], button[data-act="del"]', root).forEach(applyDeleteIcon);
}

async function applyLockIcon(btn){
  if(!btn) return;
  const name = btn.dataset.lock;
  await syncPin(name);
  btn.innerHTML = hasPin(name) ? ICON_LOCK : ICON_UNLOCK;
  btn.setAttribute('aria-label','Toggle PIN');
  Object.assign(btn.style, DELETE_ICON_STYLE);
}

function applyLockIcons(root=document){
  qsa('button[data-lock]', root).forEach(btn=>{ applyLockIcon(btn); });
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
 let toastTimeout;
 function toast(msg, type = 'info'){
   const t = $('toast');
   if(!t) return;
   let opts;
   if (typeof type === 'object' && type !== null) {
     opts = type;
   } else if (typeof type === 'number') {
     opts = { type: 'info', duration: type };
   } else {
     opts = { type, duration: 5000 };
   }
   const toastType = typeof opts.type === 'string' && opts.type ? opts.type : 'info';
   const duration = typeof opts.duration === 'number' ? opts.duration : 5000;
   t.textContent = msg;
   t.className = toastType ? `toast ${toastType}` : 'toast';
   t.classList.add('show');
   playTone(toastType);
   clearTimeout(toastTimeout);
   if (Number.isFinite(duration) && duration > 0) {
     toastTimeout = setTimeout(()=>{
       t.classList.remove('show');
     }, duration);
   } else {
     toastTimeout = null;
   }
 }

 function dismissToast(){
   const t=$('toast');
   if(!t) return;
   t.classList.remove('show');
   clearTimeout(toastTimeout);
   toastTimeout = null;
 }

// Expose toast utilities globally so non-module scripts (e.g. dm.js)
// can display and control notifications.
window.toast = toast;
window.dismissToast = dismissToast;

async function pinPrompt(message){
  const modal = $('modal-pin');
  const title = $('pin-title');
  const input = $('pin-input');
  const submit = $('pin-submit');
  const close = $('pin-close');
  if(!modal || !input || !submit || !close){
    return typeof prompt === 'function' ? prompt(message) : null;
  }
  title.textContent = message;
  return new Promise(resolve => {
    function cleanup(result){
      submit.removeEventListener('click', onSubmit);
      input.removeEventListener('keydown', onKey);
      close.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
      hide('modal-pin');
      resolve(result);
    }
    function onSubmit(){ cleanup(input.value); }
    function onCancel(){ cleanup(null); }
    function onKey(e){ if(e.key==='Enter'){ e.preventDefault(); onSubmit(); } }
    function onOverlay(e){ if(e.target===modal) onCancel(); }
    submit.addEventListener('click', onSubmit);
    input.addEventListener('keydown', onKey);
    close.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
    show('modal-pin');
    input.value='';
    input.focus();
  });
}

window.pinPrompt = pinPrompt;

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

const debouncedSetVh = debounce(setVh, 100);
window.addEventListener('resize', debouncedSetVh, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', debouncedSetVh, { passive: true });
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
// Mapping of theme names to the ID of the SVG icon shown on the theme button
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
/**
 * Apply a visual theme by toggling root classes and updating the button icon.
 * @param {string} t - theme identifier matching keys of THEME_ICONS
 */
function applyTheme(t){
  const classes = Object.keys(THEME_ICONS)
    .filter(n => n !== 'dark')
    .map(n => `theme-${n}`);
  root.classList.remove(...classes);
  if (t !== 'dark') root.classList.add(`theme-${t}`);
}
function loadTheme(){
  const theme = localStorage.getItem('theme') || 'dark';
  applyTheme(theme);
}
loadTheme();

function toggleTheme(){
  const themes = Object.keys(THEME_ICONS);
  const curr = localStorage.getItem('theme') || 'dark';
  const next = themes[(themes.indexOf(curr)+1)%themes.length];
  localStorage.setItem('theme', next);
  applyTheme(next);
}


const CLASS_THEMES = {
  'Mutant':'mutant',
  'Enhanced Human':'enhanced',
  'Magic User':'magic',
  'Alien/Extraterrestrial':'alien',
  'Mystical Being':'mystic'
};
/**
 * Bind a select element so choosing certain classifications updates the theme.
 * @param {string} id - element id of the classification select
 */
function bindClassificationTheme(id){
  const sel=$(id);
  if(!sel) return;
  const apply=()=>{
    const t=CLASS_THEMES[sel.value];
    if(t){
      localStorage.setItem('theme', t);
      applyTheme(t);
    }
  };
  sel.addEventListener('change', apply);
  apply();
}
bindClassificationTheme('classification');

const btnMenu = $('btn-menu');
const menuActions = $('menu-actions');
if (btnMenu && menuActions) {
  const hideMenu = () => {
    if (!menuActions.hidden) {
      menuActions.classList.remove('show');
      menuActions.addEventListener('transitionend', () => menuActions.hidden = true, { once: true });
      btnMenu.setAttribute('aria-expanded', 'false');
      btnMenu.classList.remove('open');
    }
  };
  btnMenu.addEventListener('click', () => {
    if (menuActions.hidden) {
      menuActions.hidden = false;
      requestAnimationFrame(() => menuActions.classList.add('show'));
      btnMenu.setAttribute('aria-expanded', 'true');
      btnMenu.classList.add('open');
    } else {
      hideMenu();
    }
  });
  document.addEventListener('click', e => {
    if (!btnMenu.contains(e.target) && !menuActions.contains(e.target)) hideMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideMenu();
  });
}

/* ========= header ========= */
const headerEl = qs('header');
const logoEl = qs('.logo');
if (logoEl) {
  logoEl.addEventListener('click', e => {
    e.stopPropagation();
    toggleTheme();
  });
}

/* ========= tabs ========= */
function setTab(name){
  qsa('fieldset[data-tab]').forEach(s=> {
    const active = s.getAttribute('data-tab') === name;
    s.classList.toggle('active', active);
  });
  qsa('.tab').forEach(b=> {
    const active = b.getAttribute('data-go')===name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  try {
    localStorage.setItem('active-tab', name);
  } catch (e) {}
}

const switchTab = name => {
  if (headerEl && window.scrollY > 0) {
    headerEl.classList.add('hide-tabs');
    const showTabs = () => {
      if (headerEl.classList.contains('hide-tabs')) {
        headerEl.classList.remove('hide-tabs');
        setTab(name);
      }
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (window.scrollY <= 1) {
        showTabs();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(showTabs, 600);
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
ABILS.forEach(a=>{ const sel=$(a); for(let v=10; v<=28; v++) sel.add(new Option(v,v)); sel.value='10'; });

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
    rollWithBonus(`${a.toUpperCase()} save`, bonus, $('save-'+a+'-res'), { type: 'save', ability: a.toUpperCase() });
  });
});
qsa('[data-roll-skill]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const i = num(btn.dataset.rollSkill);
    const s = SKILLS[i];
    const pb = num(elProfBonus.value)||2;
    const bonus = mod($(s.abil).value) + ($('skill-'+i+'-prof').checked ? pb : 0);
    let roleplay = false;
    try {
      const rpState = CC?.RP?.get?.() || {};
      if (rpState.surgeActive && ['cha','wis','int'].includes(s.abil)) {
        roleplay = window.confirm('Roleplay/Leadership?');
      }
    } catch {}
    rollWithBonus(`${s.name} check`, bonus, $('skill-'+i+'-res'), { type: 'skill', ability: s.abil.toUpperCase(), roleplay });
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
    <div class="inline"><input type="checkbox" id="status-${s.id}"/><span>${s.name}</span></div>
  `).join('');
  STATUS_EFFECTS.forEach(s => {
    const cb = $('status-' + s.id);
    if (cb) {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          activeStatuses.add(s.name);
          alert(`${s.name}: ${s.desc}`);
          logAction(`Status effect gained: ${s.name}`);
        } else {
          activeStatuses.delete(s.name);
          logAction(`Status effect removed: ${s.name}`);
        }
      });
    }
  });
}

const ACTION_BUTTONS = 'button:not(.tab), [role="button"], [data-roll-save], [data-roll-skill], [data-add], [data-del]';
document.addEventListener('click', e => {
  if (!activeStatuses.size) return;

  const btn = e.target.closest(ACTION_BUTTONS);
  if (!btn) return;

  if (btn.closest('header .top, header .tabs, #statuses, #modal-enc, #modal-log, #modal-log-full, #modal-rules, #modal-campaign')) {
    return;
  }

  toast('Afflicted by: ' + Array.from(activeStatuses).join(', '), 'error');
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

// faction reputation configuration moved to separate module

// handle special perk behavior (stat boosts, initiative mods, etc.)

let addWisToInitiative = false;
let enhancedAbility = '';
let powerStyleTCBonus = 0;
let originTCBonus = 0;

function handlePerkEffects(li, text){
  const lower = text.toLowerCase();
  let bonus = 0;
  if(/increase one ability score by 1/.test(lower)){
    const select = document.createElement('select');
    select.id = 'enhanced-ability';
    select.innerHTML = `<option value="">Choose ability</option>` +
      ABILS.map(a=>`<option value="${a}">${a.toUpperCase()}</option>`).join('');
    // restore saved selection without reapplying the bonus
    try{
      const saved = JSON.parse(localStorage.getItem(AUTO_KEY) || '{}')['enhanced-ability'];
      if(saved && ABILS.includes(saved)){
        select.value = saved;
        enhancedAbility = saved;
      }
    }catch(e){ /* noop */ }
    select.addEventListener('change', ()=>{
      const key = select.value;
      if(enhancedAbility && enhancedAbility !== key){
        const elPrev = $(enhancedAbility);
        if(elPrev){
          const reverted = revertAbilityScore(elPrev.value);
          elPrev.value = String(reverted);
          elPrev.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if(ABILS.includes(key)){
        const el = $(key);
        if(el){
          const next = Math.min(28, Number(el.value) + 1);
          el.value = String(next);
          el.dispatchEvent(new Event('change', { bubbles: true }));
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
  const m = text.match(/([+-]\d+)\s*tc\b/i);
  if(m) bonus += Number(m[1]);
  return bonus;
}

function setupPerkSelect(selId, perkId, data){
  const sel = $(selId);
  const perkEl = $(perkId);
  if(!sel || !perkEl) return;
  function render(){
    if(selId==='classification' && enhancedAbility){
      const elPrev = $(enhancedAbility);
      if(elPrev){
        const reverted = revertAbilityScore(elPrev.value);
        elPrev.value = String(reverted);
        elPrev.dispatchEvent(new Event('change', { bubbles: true }));
      }
      enhancedAbility = '';
      updateDerived();
    }
    const perks = data[sel.value] || [];
    perkEl.innerHTML = '';
    if(selId==='alignment') addWisToInitiative = false;
    let tcBonus = 0;
    perks.forEach((p,i)=>{
      const text = typeof p === 'string' ? p : String(p);
      const lower = text.toLowerCase();
      const isAction = ACTION_HINTS.some(k=> lower.includes(k));
      let li;
      if(isAction){
        const id = `${selId}-perk-${i}`;
        const statusId = `${id}-status`;
        li = document.createElement('li');
        li.innerHTML = `<label class="inline"><input type="checkbox" id="${id}"/> <span id="${statusId}" class="perk-status">Available</span> ${text}</label>`;
        const cb = li.querySelector(`#${id}`);
        const status = li.querySelector(`#${statusId}`);
        if (cb && status) {
          cb.addEventListener('change', () => {
            status.textContent = cb.checked ? 'Used' : 'Available';
            window.dmNotify?.(`${text} ${cb.checked ? 'used' : 'reset'}`);
            logAction(`${text} perk ${cb.checked ? 'used' : 'reset'}`);
          });
        }
      }else{
        li = document.createElement('li');
        li.textContent = text;
        li.addEventListener('click', () => {
          window.dmNotify?.(`${text} perk referenced`);
        });
      }
      perkEl.appendChild(li);
      tcBonus += handlePerkEffects(li, text);
    });
    perkEl.style.display = perks.length ? 'block' : 'none';
    if(selId==='power-style') powerStyleTCBonus = tcBonus;
    if(selId==='origin') originTCBonus = tcBonus;
    if(selId==='power-style' || selId==='origin'){
      updateDerived();
    }
    if (typeof catalogRenderScheduler === 'function') {
      catalogRenderScheduler();
    }
  }
  sel.addEventListener('change', () => {
    window.dmNotify?.(`${selId.replace(/-/g,' ')} changed to ${sel.value}`);
    render();
  });
  render();
}

/* ========= cached elements ========= */
const elPP = $('pp');
const elTC = $('tc');
const elStr = $('str');
const elDex = $('dex');
const elCon = $('con');
const elWis = $('wis');
const elSPBar = $('sp-bar');
const elSPPill = $('sp-pill');
const elSPTemp = $('sp-temp');
const elHPBar = $('hp-bar');
const elHPPill = $('hp-pill');
const elHPRoll = $('hp-roll');
const elHPTemp = $('hp-temp');
// Cache frequently accessed HP amount field to avoid repeated DOM queries
const elHPAmt = $('hp-amt');
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
const elDeathSaves = $('death-saves');
const elCredits = $('credits');
const elCreditsPill = $('credits-total-pill');
const elPowerStyleSecondary = $('power-style-2');

if (elPowerStyleSecondary) {
  elPowerStyleSecondary.addEventListener('change', () => {
    if (typeof catalogRenderScheduler === 'function') {
      catalogRenderScheduler();
    }
  });
}

let hpRolls = [];
if (elHPRoll) {
  const initial = num(elHPRoll.value);
  if (initial) hpRolls = [initial];
}

if (elCAPCheck && elCAPStatus) {
  elCAPCheck.addEventListener('change', () => {
    if (elCAPCheck.checked) {
      if (confirm('Use Cinematic Action Point?')) {
        const prev = elCAPStatus.textContent;
        elCAPStatus.textContent = 'Used';
        elCAPCheck.disabled = true;
        window.dmNotify?.('Used Cinematic Action Point');
        logAction(`Cinematic Action Point: ${prev} -> Used`);
      } else {
        elCAPCheck.checked = false;
      }
    } else {
      // Prevent clearing without long rest
      elCAPCheck.checked = true;
    }
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

const PROF_BONUS_TIERS = [2, 3, 4, 5, 6, 7];

function getTierIndex(xp){
  for(let i=XP_TIERS.length-1;i>=0;i--){
    if(xp >= XP_TIERS[i].xp) return i;
  }
  return 0;
}

let currentTierIdx = 0;
let xpInitialized = false;
let catalogRenderScheduler = null;
if (elXP) {
  const initXP = Math.max(0, num(elXP.value));
  currentTierIdx = getTierIndex(initXP);
}

function launchConfetti(){
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  loadConfetti().then(fn => {
    try {
      fn({
        particleCount: 100,
        spread: 70,
        origin: { x: 0, y: 0 }
      });
      fn({
        particleCount: 100,
        spread: 70,
        origin: { x: 1, y: 0 }
      });
    } catch {}
  });
}

function launchFireworks(){
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  loadConfetti().then(fn => {
    const firework = () => {
      try {
        fn({
          particleCount: 80,
          startVelocity: 30,
          spread: 360,
          origin: { x: Math.random(), y: Math.random() * 0.5 }
        });
      } catch {}
    };
    firework();
    setTimeout(firework, 250);
    setTimeout(firework, 500);
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
  if (elSPBar.value === '' || Number.isNaN(Number(elSPBar.value))) elSPBar.value = spMax;
  const temp = elSPTemp ? num(elSPTemp.value) : 0;
  elSPPill.textContent = `${num(elSPBar.value)}/${spMax}` + (temp ? ` (+${temp})` : ``);
}

function updateDeathSaveAvailability(){
  if(!elDeathSaves) return;
  elDeathSaves.disabled = num(elHPBar.value) !== 0;
}

function updateHP(){
  const base = 30;
  const conMod = elCon.value === '' ? 0 : mod(elCon.value);
  const total = base + conMod + num(elHPRoll.value||0);
  const prevMax = num(elHPBar.max);
  elHPBar.max = Math.max(0, total);
  if (!num(elHPBar.value) || num(elHPBar.value) === prevMax) elHPBar.value = elHPBar.max;
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
  updateDeathSaveAvailability();
  if(num(elHPBar.value) > 0){
    try { resetDeathSaves(); } catch {}
  }
}

function updateXP(){
  const xp = Math.max(0, num(elXP.value));
  const idx = getTierIndex(xp);
  const prevIdx = currentTierIdx;
  if (xpInitialized && idx !== prevIdx) {
    logAction(`Tier: ${XP_TIERS[prevIdx].label} -> ${XP_TIERS[idx].label}`);
  }
  if (xpInitialized && idx > currentTierIdx) {
    launchConfetti();
    launchFireworks();
    toast(`Tier up! ${XP_TIERS[idx].label}. Director says: grab your 1d10 HP booster!`, 'success');
    window.dmNotify?.(`Tier up to ${XP_TIERS[idx].label}`);
  } else if(xpInitialized && idx < currentTierIdx){
    window.dmNotify?.(`Tier down to ${XP_TIERS[idx].label}`);
  }
  currentTierIdx = idx;
  xpInitialized = true;
  if(elTier) elTier.value = XP_TIERS[idx].label;
  if(elProfBonus) elProfBonus.value = PROF_BONUS_TIERS[idx] || 2;
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
  if (typeof catalogRenderScheduler === 'function') {
    catalogRenderScheduler();
  }
}

function updateDerived(){
  updateXP();
  const pb = PROF_BONUS_TIERS[currentTierIdx] || 2;
  elPP.value = 10 + mod(elWis.value);
  const armorAuto = calculateArmorBonus();
  elTC.value = 10 + mod(elDex.value) + armorAuto + powerStyleTCBonus + originTCBonus;
  updateSP();
  updateHP();
  const initiative = mod(elDex.value) + (addWisToInitiative ? mod(elWis.value) : 0);
  elInitiative.value = (initiative >= 0 ? '+' : '') + initiative;
  // Guard against missing ability elements when calculating the power save DC.
  // If the selected ability cannot be found in the DOM, default its modifier to 0
  // rather than throwing an error which prevents other derived stats from
  // updating and leaves all modifiers displayed as +0.
  const saveAbilityEl = $(elPowerSaveAbility.value);
  const saveMod = saveAbilityEl ? mod(saveAbilityEl.value) : 0;
  elPowerSaveDC.value = 8 + pb + saveMod;
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
}
ABILS.forEach(a=> {
  const el = $(a);
  el.addEventListener('change', () => {
    window.dmNotify?.(`${a.toUpperCase()} set to ${el.value}`);
    updateDerived();
  });
});
['hp-temp','sp-temp','power-save-ability','xp'].forEach(id=> $(id).addEventListener('input', updateDerived));
ABILS.forEach(a=> $('save-'+a+'-prof').addEventListener('change', updateDerived));
SKILLS.forEach((s,i)=> $('skill-'+i+'-prof').addEventListener('change', updateDerived));

function setXP(v){
  const prev = num(elXP.value);
  elXP.value = Math.max(0, v);
  updateDerived();
  const diff = num(elXP.value) - prev;
  if(diff !== 0){
    window.dmNotify?.(`XP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elXP.value})`);
  }
}
$('xp-submit').addEventListener('click', ()=>{
  const amt = num($('xp-amt').value)||0;
  if(!amt) return;
  const mode = $('xp-mode').value;
  setXP(num(elXP.value) + (mode==='add'? amt : -amt));
});

function updateCreditsDisplay(){
  if (elCreditsPill) elCreditsPill.textContent = num(elCredits.value)||0;
}

function setCredits(v){
  const prev = num(elCredits.value)||0;
  const total = Math.max(0, v);
  elCredits.value = total;
  updateCreditsDisplay();
  const diff = total - prev;
  if(diff !== 0){
    window.dmNotify?.(`Credits ${diff>0?'gained':'spent'} ${Math.abs(diff)} (now ${total})`);
    pushHistory();
    const name = currentCharacter();
    if (name) {
      saveCharacter(serialize(), name).catch(e => {
        console.error('Credits cloud save failed', e);
      });
    }
  }
}

if (elCredits) updateCreditsDisplay();

$('credits-submit').addEventListener('click', ()=>{
  const amt = num($('credits-amt').value)||0;
  if(!amt) return;
  const mode = $('credits-mode').value;
  setCredits(num(elCredits.value) + (mode==='add'? amt : -amt));
  $('credits-amt').value='';
});


/* ========= HP/SP controls ========= */
function setHP(v){
  const prev = num(elHPBar.value);
  elHPBar.value = Math.max(0, Math.min(num(elHPBar.max), v));
  elHPPill.textContent = `${num(elHPBar.value)}/${num(elHPBar.max)}` + (num(elHPTemp.value)?` (+${num(elHPTemp.value)})`:``);
  updateDeathSaveAvailability();
  const diff = num(elHPBar.value) - prev;
  if(diff !== 0){
    window.dmNotify?.(`HP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elHPBar.value}/${elHPBar.max})`);
    logAction(`HP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elHPBar.value}/${elHPBar.max})`);
  }
  if(num(elHPBar.value) > 0){
    try { resetDeathSaves(); } catch {}
  }
  return prev > 0 && num(elHPBar.value) === 0;
}
async function setSP(v){
  const prev = num(elSPBar.value);
  if (num(v) < 0) {
    alert("You don't have enough SP for that.");
    return;
  }
  elSPBar.value = Math.max(0, Math.min(num(elSPBar.max), v));
  const temp = elSPTemp ? num(elSPTemp.value) : 0;
  elSPPill.textContent = `${num(elSPBar.value)}/${num(elSPBar.max)}` + (temp ? ` (+${temp})` : ``);
  const diff = num(elSPBar.value) - prev;
  if(diff !== 0) {
    window.dmNotify?.(`SP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elSPBar.value}/${elSPBar.max})`);
    logAction(`SP ${diff>0?'gained':'lost'} ${Math.abs(diff)} (now ${elSPBar.value}/${elSPBar.max})`);
    await playSPAnimation(diff);
    pushHistory();
  }
  if(prev > 0 && num(elSPBar.value) === 0) alert('Player is out of SP');
}
$('hp-dmg').addEventListener('click', async ()=>{
  let d=num(elHPAmt ? elHPAmt.value : 0);
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
  if(down){
    await playDownAnimation();
    alert('Player is down');
  }
});
$('hp-heal').addEventListener('click', async ()=>{
  const d=num(elHPAmt ? elHPAmt.value : 0)||0;
  setHP(num(elHPBar.value)+d);
  if(d>0) await playHealAnimation(d);
});
$('hp-full').addEventListener('click', async ()=>{
  const diff = num(elHPBar.max) - num(elHPBar.value);
  if(diff>0) await playHealAnimation(diff);
  setHP(num(elHPBar.max));
});
$('sp-full').addEventListener('click', ()=> setSP(num(elSPBar.max)));

function changeSP(delta){
  const current = num(elSPBar.value);
  if(delta < 0 && elSPTemp){
    const temp = num(elSPTemp.value);
    const use = Math.min(temp, -delta);
    if(current + delta + use < 0){
      alert("You don't have enough SP for that.");
      return;
    }
    elSPTemp.value = temp - use || '';
    delta += use;
  }
  setSP(current + delta);
}
qsa('[data-sp]').forEach(b=> b.addEventListener('click', ()=> changeSP(num(b.dataset.sp)||0) ));
$('long-rest').addEventListener('click', ()=>{
  if(!confirm('Take a long rest?')) return;
  setHP(num(elHPBar.max));
  setSP(num(elSPBar.max));
  elHPTemp.value='';
  if (elSPTemp) elSPTemp.value='';
  // clear all checkbox states on the page
  qsa('input[type="checkbox"]').forEach(cb=>{
    cb.checked = false;
    cb.removeAttribute('checked');
  });
  if (elCAPCheck) elCAPCheck.disabled = false;
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
const actionLog = safeParse('action-log');
const campaignLog = safeParse('campaign-log');
const fmt = (ts)=>new Date(ts).toLocaleTimeString();
function pushLog(arr, entry, key){ arr.push(entry); if (arr.length>30) arr.splice(0, arr.length-30); localStorage.setItem(key, JSON.stringify(arr)); }
function renderLogs(){
  $('log-action').innerHTML = actionLog.slice(-10).reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div>${e.text}</div></div>`).join('');
}
function renderFullLogs(){
  $('full-log-action').innerHTML = actionLog.slice().reverse().map(e=>`<div class="catalog-item"><div>${fmt(e.t)}</div><div>${e.text}</div></div>`).join('');
}
function logAction(text){
  try{
    if(sessionStorage.getItem('dmLoggedIn') === '1'){
      text = `DM: ${text}`;
    }
  }catch{}
  pushLog(actionLog, {t:Date.now(), text}, 'action-log');
  renderLogs();
  renderFullLogs();
}
window.logAction = logAction;
const CONTENT_UPDATE_EVENT = 'cc:content-updated';
const DM_PENDING_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
let serviceWorkerUpdateHandled = false;

function queueDmNotification(message, meta = {}) {
  if (typeof window === 'undefined') return;
  const text = typeof message === 'string' ? message : String(message ?? '');
  if (!text) return;
  if (typeof window.dmNotify === 'function') {
    window.dmNotify(text, meta);
    return;
  }
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(DM_PENDING_NOTIFICATIONS_KEY);
    let pending = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) pending = parsed;
    }
    const record = {
      detail: text,
      ts: typeof meta.ts === 'number' || typeof meta.ts === 'string' ? meta.ts : Date.now(),
      char: meta.char || 'System',
    };
    if (typeof meta.html === 'string' && meta.html) {
      record.html = meta.html;
    }
    pending.push(record);
    const MAX_PENDING = 20;
    if (pending.length > MAX_PENDING) {
      pending = pending.slice(pending.length - MAX_PENDING);
    }
    sessionStorage.setItem(DM_PENDING_NOTIFICATIONS_KEY, JSON.stringify(pending));
  } catch {
    /* ignore storage errors */
  }
}

function announceContentUpdate(payload = {}) {
  if (serviceWorkerUpdateHandled) return;
  serviceWorkerUpdateHandled = true;
  const baseMessage =
    typeof payload.message === 'string' && payload.message.trim()
      ? payload.message.trim()
      : 'New Codex content is available.';
  const message = /refresh/i.test(baseMessage) ? baseMessage : `${baseMessage} Refreshing to apply the latest data.`;
  const updatedAt = typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now();
  const detail = {
    ...payload,
    message,
    updatedAt,
    source: payload.source || 'service-worker',
  };
  if (typeof window !== 'undefined') {
    window.__ccLastContentUpdate = detail;
  }
  try {
    logAction(message);
  } catch {
    /* ignore logging errors */
  }
  queueDmNotification(message, { ts: updatedAt, char: detail.char || 'System' });
  try {
    toast(message, 'info');
  } catch {
    /* ignore toast errors */
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(CONTENT_UPDATE_EVENT, { detail }));
    } catch {
      /* ignore event errors */
    }
  }
  setTimeout(() => {
    window.location.reload();
  }, 750);
}


function rollWithBonus(name, bonus, out){
  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + bonus;
  if(out) out.textContent = total;
  const sign = bonus >= 0 ? '+' : '';
  logAction(`${name}: ${roll}${sign}${bonus} = ${total}`);
  return total;
}
renderLogs();
renderFullLogs();
$('roll-dice').addEventListener('click', ()=>{
  const s = num($('dice-sides').value), c=num($('dice-count').value)||1;
  const out = $('dice-out');
  out.classList.remove('rolling');
  const rolls = Array.from({length:c}, ()=> 1+Math.floor(Math.random()*s));
  const sum = rolls.reduce((a,b)=>a+b,0);
  out.textContent = sum;
  void out.offsetWidth; out.classList.add('rolling');
  playDamageAnimation(sum);
  logAction(`${c}×d${s}: ${rolls.join(', ')} = ${sum}`);
  window.dmNotify?.(`Rolled ${c}d${s}: ${rolls.join(', ')} = ${sum}`);
});
$('flip').addEventListener('click', ()=>{
  const v = Math.random()<.5 ? 'Heads' : 'Tails';
  $('flip-out').textContent = v;
  playCoinAnimation(v);
  logAction(`Coin flip: ${v}`);
  window.dmNotify?.(`Coin flip: ${v}`);
});

function playDamageAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('damage-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=String(amount);
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playDownAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('down-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playDeathAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('death-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playHealAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('heal-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=`+${amount}`;
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playSaveAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('save-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playCoinAnimation(result){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('coin-animation');
  if(!anim) return Promise.resolve();
  anim.textContent=result;
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playSPAnimation(amount){
  if(!animationsEnabled) return Promise.resolve();
  const anim = $('sp-animation');
  if(!anim) return Promise.resolve();
  anim.textContent = `${amount>0?'+':''}${amount}`;
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

function playLoadAnimation(){
  if(!animationsEnabled) return Promise.resolve();
  const anim=$('load-animation');
  if(!anim) return Promise.resolve();
  anim.hidden=false;
  return new Promise(res=>{
    anim.classList.add('show');
    const done=()=>{
      anim.classList.remove('show');
      anim.hidden=true;
      anim.removeEventListener('animationend', done);
      res();
    };
    anim.addEventListener('animationend', done);
  });
}

const deathSuccesses = ['death-success-1','death-success-2','death-success-3'].map(id=>$(id));
const deathFailures = ['death-fail-1','death-fail-2','death-fail-3'].map(id=>$(id));
const deathOut = $('death-save-out');
let deathState = null; // null, 'stable', 'dead'

function markBoxes(arr, n){
  for(const box of arr){
    if(!box.checked){
      box.checked=true;
      n--;
      if(n<=0) break;
    }
  }
}

function resetDeathSaves(){
  [...deathSuccesses, ...deathFailures].forEach(b=> b.checked=false);
  deathState=null;
  if(deathOut) deathOut.textContent='';
}
$('death-save-reset')?.addEventListener('click', resetDeathSaves);

async function checkDeathProgress(){
  if(deathFailures.every(b=>b.checked)){
    if(deathState!=='dead'){
      deathState='dead';
      await playDeathAnimation();
      alert('You have fallen, your sacrifice will be remembered.');
    }
  }else if(deathSuccesses.every(b=>b.checked)){
    if(deathState!=='stable'){
      deathState='stable';
      alert('You are stable at 0 HP.');
    }
  }else{
    deathState=null;
  }
}
[...deathSuccesses, ...deathFailures].forEach(box=> box.addEventListener('change', checkDeathProgress));

$('roll-death-save')?.addEventListener('click', ()=>{
  const roll = 1+Math.floor(Math.random()*20);
  if(deathOut) deathOut.textContent = String(roll);
  logAction(`Death save: ${roll}`);
  if(roll===20){
    resetDeathSaves();
    alert('Critical success! You regain 1 HP and awaken.');
    return;
  }
  if(roll===1){
    markBoxes(deathFailures,2);
  }else if(roll>=10){
    markBoxes(deathSuccesses,1);
  }else{
    markBoxes(deathFailures,1);
  }
  checkDeathProgress();
});
const btnCampaignAdd = $('campaign-add');
if (btnCampaignAdd) {
  btnCampaignAdd.addEventListener('click', ()=>{
    const text = $('campaign-entry').value.trim();
    if(!text) return;
    const name = currentCharacter();
    pushLog(campaignLog, {t:Date.now(), name, text}, 'campaign-log');
    logAction(`${name}: ${text}`);
    $('campaign-entry').value='';
    renderCampaignLog();
    pushHistory();
  });
}
  function renderCampaignLog(){
    $('campaign-log').innerHTML = campaignLog
      .slice()
      .reverse()
      .map((e,i)=>`<div class="catalog-item"><div>${fmt(e.t)}${e.name ? ' ' + e.name : ''}</div><div>${e.text}</div><div><button class="btn-sm" data-del="${i}"></button></div></div>`)
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
const btnFun = $('btn-fun');
if (btnFun) {
  // Lazy-load fun tips so the main bundle stays small and fast.
  let getNextTip;
  btnFun.addEventListener('click', async () => {
    if (!getNextTip) {
      ({ getNextTip } = await import('./funTips.js'));
    }
    toast(getNextTip(),'info');
  });
}
const btnLoad = $('btn-load');
async function openCharacterList(){
  await renderCharacterList();
  show('modal-load-list');
}
if (btnLoad) {
  btnLoad.addEventListener('click', openCharacterList);
}
window.openCharacterList = openCharacterList;

async function renderCharacterList(){
  const list = $('char-list');
  if(!list) return;
  let names = [];
  try { names = await listCharacters(); }
  catch (e) { console.error('Failed to list characters', e); }
  const current = currentCharacter();
  list.innerHTML = '';
  names.forEach(c => {
    const item = document.createElement('div');
    item.className = `catalog-item${c===current ? ' active' : ''}`;
    const link = document.createElement('a');
    link.href = '#';
    link.dataset.char = c;
    link.textContent = c;
    item.appendChild(link);
    if(c !== 'The DM'){
      const lock = document.createElement('button');
      lock.className = 'btn-sm';
      lock.dataset.lock = c;
      item.appendChild(lock);
      const btn = document.createElement('button');
      btn.className = 'btn-sm';
      btn.dataset.del = c;
      item.appendChild(btn);
    }
    list.appendChild(item);
  });
  applyLockIcons(list);
  applyDeleteIcons(list);
  selectedChar = current;
}

document.addEventListener('character-saved', renderCharacterList);
document.addEventListener('character-deleted', renderCharacterList);
window.addEventListener('storage', renderCharacterList);

async function renderRecoverCharList(){
  const list = $('recover-char-list');
  if(!list) return;
  let names = [];
  try { names = await listRecoverableCharacters(); }
  catch (e) { console.error('Failed to list characters', e); }
  list.innerHTML = '';
  names.forEach(c => {
    const item = document.createElement('div');
    item.className = 'catalog-item';
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.dataset.char = c;
    btn.textContent = c;
    item.appendChild(btn);
    list.appendChild(item);
  });
}

async function renderRecoverList(name){
  const list = $('recover-list');
  if(!list) return;
  let backups = [];
  try { backups = await listBackups(name); }
  catch (e) { console.error('Failed to list backups', e); }
  if(backups.length === 0){
    list.innerHTML = '<p>No backups found.</p>';
  } else {
    list.innerHTML = backups.map(b=>`<div class="catalog-item"><button class="btn-sm" data-recover-ts="${b.ts}">${name} - ${new Date(b.ts).toLocaleString()}</button></div>`).join('');
  }
  show('modal-recover-list');
}

let pendingLoad = null;
let recoverTarget = null;
let selectedChar = null;
const charList = $('char-list');
if(charList){
  charList.addEventListener('click', async e=>{
    const loadBtn = e.target.closest('[data-char]');
    const delBtn = e.target.closest('button[data-del]');
    const lockBtn = e.target.closest('button[data-lock]');
    if(loadBtn){
      e.preventDefault();
      selectedChar = loadBtn.dataset.char;
      qsa('#char-list .catalog-item').forEach(ci=> ci.classList.remove('active'));
      const item = loadBtn.closest('.catalog-item');
      if(item) item.classList.add('active');
      pendingLoad = { name: selectedChar };
      const text = $('load-confirm-text');
      if(text) text.textContent = `Are you sure you would like to load this character: ${pendingLoad.name}. All current progress will be lost if you haven't saved yet.`;
      show('modal-load');
    } else if(lockBtn){
      const ch = lockBtn.dataset.lock;
      await syncPin(ch);
      if(hasPin(ch)){
        const pin = await pinPrompt('Enter PIN to disable protection');
        if(pin !== null){
          const ok = await verifyStoredPin(ch, pin);
          if(ok){
            await clearPin(ch);
            applyLockIcon(lockBtn);
            toast('PIN disabled','info');
          }else{
            toast('Invalid PIN','error');
          }
        }
      }else{
        const pin1 = await pinPrompt('Set PIN');
        if(pin1){
          const pin2 = await pinPrompt('Confirm PIN');
          if(pin1 === pin2){
            await setPin(ch, pin1);
            applyLockIcon(lockBtn);
            toast('PIN enabled','success');
          }else if(pin2 !== null){
            toast('PINs did not match','error');
          }
        }
      }
    } else if(delBtn){
      const ch = delBtn.dataset.del;
      if(ch === 'The DM'){
        toast('Cannot delete The DM','error');
      }else if(confirm(`Delete ${ch}?`) && confirm('This cannot be undone. Are you sure?')){
        deleteCharacter(ch).then(()=>{
          renderCharacterList();
          toast('Deleted','info');
        }).catch(e=> toast(e.message || 'Delete failed','error'));
      }
    }
  });
}

const recoverCharListEl = $('recover-char-list');
if(recoverCharListEl){
  recoverCharListEl.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-char]');
    if(btn){
      recoverTarget = btn.dataset.char;
      hide('modal-recover-char');
      renderRecoverList(recoverTarget);
    }
  });
}

const recoverBtn = $('recover-save');
if(recoverBtn){
  recoverBtn.addEventListener('click', async ()=>{
    hide('modal-load-list');
    await renderRecoverCharList();
    show('modal-recover-char');
  });
}

const newCharBtn = $('create-character');
if(newCharBtn){
  newCharBtn.addEventListener('click', ()=>{
    if(!confirm('Start a new character? All current progress will be lost.')) return;
    const name = prompt('Enter new character name:');
    if(!name) return toast('Name required','error');
    const clean = name.trim();
    if(!clean) return toast('Name required','error');
    setCurrentCharacter(clean);
    deserialize(DEFAULT_STATE);
    hide('modal-load-list');
    toast(`Switched to ${clean}`,'success');
  });
}



const recoverListEl = $('recover-list');
if(recoverListEl){
  recoverListEl.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-recover-ts]');
    if(btn){
      pendingLoad = { name: recoverTarget, ts: Number(btn.dataset.recoverTs) };
      const text = $('load-confirm-text');
      if(text) text.textContent = `Are you sure you would like to recover ${pendingLoad.name} from ${new Date(pendingLoad.ts).toLocaleString()}? All current progress will be lost if you haven't saved yet.`;
      hide('modal-recover-list');
      show('modal-load');
    }
  });
}

const loadCancelBtn = $('load-cancel');
const loadAcceptBtn = $('load-accept');
async function doLoad(){
  if(!pendingLoad) return;
  try{
    const data = pendingLoad.ts
      ? await loadBackup(pendingLoad.name, pendingLoad.ts)
      : await loadCharacter(pendingLoad.name);
    deserialize(data);
    setCurrentCharacter(pendingLoad.name);
    hide('modal-load');
    hide('modal-load-list');
    toast(`Loaded ${pendingLoad.name}`,'success');
    playLoadAnimation();
  }catch(e){
    toast(e.message || 'Load failed','error');
  }
}
if(loadAcceptBtn){ loadAcceptBtn.addEventListener('click', doLoad); }
if(loadCancelBtn){ loadCancelBtn.addEventListener('click', ()=>{ hide('modal-load'); }); }
qsa('[data-close]').forEach(b=> b.addEventListener('click', ()=>{ const ov=b.closest('.overlay'); if(ov) hide(ov.id); }));

function openCharacterModalByName(name){
  if(!name) return;
  selectedChar = name;
  pendingLoad = { name };
  const text = $('load-confirm-text');
  if(text) text.textContent = `Are you sure you would like to load this character: ${name}. All current progress will be lost if you haven't saved yet.`;
  show('modal-load');
}
window.openCharacterModal = openCharacterModalByName;

const params = new URLSearchParams(window.location.search);
const autoChar = params.get('char');
if (autoChar) {
  (async () => {
    const prev = currentCharacter();
    try {
      setCurrentCharacter(autoChar);
      const data = await loadCharacter(autoChar);
      deserialize(data);
    } catch (e) {
      console.error('Failed to load character from URL', e);
    } finally {
      setCurrentCharacter(prev);
    }
  })();
}

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

const pendingManualCards = { weapon: null, armor: null, item: null };

function isCardEmpty(card){
  if (!card) return true;
  const nameField = qs("[data-f='name']", card);
  if (nameField && nameField.value && nameField.value.trim()) return false;
  return true;
}

function clearPendingManualCard(kind, { force = false } = {}){
  const card = pendingManualCards[kind];
  if (!card) return false;
  if (force || isCardEmpty(card)) {
    if (card.isConnected) {
      card.remove();
      if (kind === 'armor') updateDerived();
    }
    pendingManualCards[kind] = null;
    return true;
  }
  return false;
}

function setPendingManualCard(kind, card){
  clearPendingManualCard(kind);
  pendingManualCards[kind] = card;
  const delBtn = qs("[data-act='del']", card);
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (pendingManualCards[kind] === card) pendingManualCards[kind] = null;
    }, { once: true });
  }
}

function cleanupPendingManualCards(){
  let removed = false;
  ['weapon', 'armor', 'item'].forEach(kind => {
    removed = clearPendingManualCard(kind) || removed;
  });
  return removed;
}

function populateCardFromData(card, data){
  if (!card || !data) return;
  Object.entries(data).forEach(([key, value]) => {
    const field = qs(`[data-f='${key}']`, card);
    if (!field) return;
    if (field.type === 'checkbox') {
      field.checked = !!value;
    } else {
      field.value = value ?? '';
    }
  });
}

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
          if (kind === 'armor') {
            chk.addEventListener('change', () => {
              const name = qs("[data-f='name']", card)?.value || 'Armor';
              logAction(`Armor ${chk.checked ? 'equipped' : 'unequipped'}: ${name}`);
            });
          }
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
      logAction(`${kind === 'weapon' ? 'Weapon' : kind === 'power' ? 'Power' : 'Signature move'} used: ${name}`);
      rollWithBonus(`${name} attack roll`, bonus, out, { type: 'attack' });
    });
    delWrap.appendChild(hitBtn);
    delWrap.appendChild(out);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-sm';
  delBtn.dataset.act = 'del';
  applyDeleteIcon(delBtn);
  delBtn.addEventListener('click', () => {
    const name = qs("[data-f='name']", card)?.value || kind;
    logAction(`${kind.charAt(0).toUpperCase()+kind.slice(1)} removed: ${name}`);
    card.remove();
    if (cfg.onDelete) cfg.onDelete();
    pushHistory();
  });
  delWrap.appendChild(delBtn);
  card.appendChild(delWrap);
  if (cfg.onChange) {
    qsa('input,select', card).forEach(el => el.addEventListener('input', cfg.onChange));
  }
  if (viewMode) applyViewLockState(card);
  return card;
}

$('add-power').addEventListener('click', () => { $('powers').appendChild(createCard('power')); pushHistory(); });
$('add-sig').addEventListener('click', () => { $('sigs').appendChild(createCard('sig')); pushHistory(); });

/* ========= Gear ========= */
$('add-weapon').addEventListener('click', () => {
  const list = $('weapons');
  if (!list) return;
  const card = createCard('weapon');
  list.appendChild(card);
  setPendingManualCard('weapon', card);
  pushHistory();
  openCatalogWithFilters({ type: 'Weapon', style: '', tier: '' });
});
$('add-armor').addEventListener('click', () => {
  const list = $('armors');
  if (!list) return;
  const card = createCard('armor');
  list.appendChild(card);
  setPendingManualCard('armor', card);
  pushHistory();
  openCatalogWithFilters({ type: 'Armor', style: '', tier: '' });
});
$('add-item').addEventListener('click', () => {
  const list = $('items');
  if (!list) return;
  const card = createCard('item');
  list.appendChild(card);
  setPendingManualCard('item', card);
  pushHistory();
  openCatalogWithFilters({ type: 'Item', style: '', tier: '' });
});

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

function buildCardInfo(entry){
  if (!entry) return null;
  const rawType = (entry.rawType || entry.type || '').trim();
  const typeKey = rawType.toLowerCase();
  const priceNote = formatPriceNote(entry);
  const name = entry.name || 'Item';
  if (typeKey === 'weapon') {
    const { damage, extras } = extractWeaponDetails(entry.perk);
    const damageParts = [];
    if (damage) damageParts.push(`Damage ${damage}`);
    extras.filter(Boolean).forEach(part => damageParts.push(part));
    if (entry.tier) damageParts.push(`Tier ${entry.tier}`);
    if (priceNote) damageParts.push(priceNote);
    if (entry.use) damageParts.push(`Use: ${entry.use}`);
    if (entry.attunement) damageParts.push(`Attunement: ${entry.attunement}`);
    if (entry.source) damageParts.push(entry.source);
    return {
      kind: 'weapon',
      listId: 'weapons',
      data: {
        name,
        damage: damageParts.join(' — ')
      }
    };
  }
  if (typeKey === 'armor' || typeKey === 'shield') {
    const { bonus: parsedBonus, details } = extractArmorDetails(entry.perk);
    const nameParts = [];
    if (details.length) nameParts.push(details.join(' — '));
    if (entry.tier) nameParts.push(`Tier ${entry.tier}`);
    if (priceNote) nameParts.push(priceNote);
    if (entry.use) nameParts.push(`Use: ${entry.use}`);
    if (entry.attunement) nameParts.push(`Attunement: ${entry.attunement}`);
    if (entry.source) nameParts.push(entry.source);
    const slotBase = typeKey === 'shield' ? 'Shield' : 'Body';
    const slot = (entry.slot || slotBase || '').trim() || slotBase;
    const bonusValue = Number.isFinite(entry.bonus) ? entry.bonus : parsedBonus;
    return {
      kind: 'armor',
      listId: 'armors',
      data: {
        name: nameParts.length ? `${name} — ${nameParts.join(' — ')}` : name,
        slot,
        bonus: Number.isFinite(bonusValue) ? bonusValue : 0,
        equipped: true
      }
    };
  }
  const notes = buildItemNotes(entry);
  const qty = Number.isFinite(entry.qty) && entry.qty > 0 ? entry.qty : 1;
  return {
    kind: 'item',
    listId: 'items',
    data: {
      name,
      notes,
      qty
    }
  };
}

function addEntryToSheet(entry, { toastMessage = 'Added to sheet', cardInfoOverride = null } = {}){
  const info = cardInfoOverride || buildCardInfo(entry);
  if (!info) return null;
  const list = $(info.listId);
  if (!list) return null;
  let card = null;
  const pending = pendingManualCards[info.kind];
  if (pending && pending.isConnected) {
    card = pending;
    pendingManualCards[info.kind] = null;
    populateCardFromData(card, info.data);
  } else {
    card = createCard(info.kind, info.data);
    list.appendChild(card);
  }
  const priceValue = getEntryPriceValue(entry);
  if (Number.isFinite(priceValue) && priceValue > 0) {
    card.dataset.price = String(priceValue);
    const priceDisplay = getPriceDisplay(entry);
    if (priceDisplay) card.dataset.priceDisplay = priceDisplay;
  } else {
    delete card.dataset.price;
    delete card.dataset.priceDisplay;
  }
  updateDerived();
  pushHistory();
  if (toastMessage) toast(toastMessage, 'success');
  return card;
}

/* ========= Gear Catalog (CatalystCore_Master_Book integration) ========= */
const CATALOG_MASTER_SRC = './CatalystCore_Master_Book.csv';
const CATALOG_PRICE_SRC = './CatalystCore_Items_Prices.csv';
let catalogData = null;
let catalogPromise = null;
let catalogPriceEntries = [];
let catalogPriceIndex = new Map();
let catalogError = null;
let catalogFiltersInitialized = false;

const styleSel = $('catalog-filter-style');
const typeSel = $('catalog-filter-type');
const tierSel = $('catalog-filter-rarity');
const catalogCustomBtn = $('catalog-add-custom');
const catalogListEl = $('catalog-list');
let pendingCatalogFilters = null;
const CUSTOM_CATALOG_KEY = 'custom-catalog';
let customCatalogEntries = loadCustomCatalogEntries();
rebuildCatalogPriceIndex();
const customTypeModal = $('modal-custom-item');
const customTypeButtons = customTypeModal ? qsa('[data-custom-type]', customTypeModal) : [];
const requestCatalogRender = debounce(() => renderCatalog(), 100);
catalogRenderScheduler = () => requestCatalogRender();
const catalogOverlay = $('modal-catalog');
if (catalogOverlay) {
  catalogOverlay.addEventListener('transitionend', e => {
    if (e.target === catalogOverlay && catalogOverlay.classList.contains('hidden')) {
      if (cleanupPendingManualCards()) {
        pushHistory();
      }
    }
  });
}

function decodeCatalogBuffer(buffer){
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('windows-1252').decode(buffer);
    } catch (e) {
      try {
        return new TextDecoder().decode(buffer);
      } catch (err) {
        console.error('Catalog decode fallback failed', err);
      }
    }
  }
  let str = '';
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    str += String.fromCharCode(view[i]);
  }
  return str;
}

function parseCsv(text){
  if (!text) return [];
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(field);
      field = '';
    } else if (ch === '\r') {
      // ignore
    } else if (ch === '\n') {
      current.push(field);
      rows.push(current);
      current = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || current.length) {
    current.push(field);
  }
  if (current.length) rows.push(current);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  if (headers.length && headers[0] && headers[0].charCodeAt(0) === 0xfeff) {
    headers[0] = headers[0].slice(1);
  }
  return rows
    .filter(row => row.length && row.some(cell => (cell || '').trim() !== ''))
    .map(row => headers.reduce((acc, header, idx) => {
      acc[header] = (row[idx] || '').trim();
      return acc;
    }, {}));
}

function normalizePriceRow(row){
  const name = (row.Name || '').trim();
  if (!name) return null;
  const priceSource = (row.PriceCr || row.Price || '').trim();
  const numeric = extractPriceValue(priceSource);
  return {
    name,
    price: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
    priceText: priceSource
  };
}

function buildPriceIndex(entries = []){
  const index = new Map();
  entries.forEach(entry => {
    if (!entry || !entry.name) return;
    const key = entry.name.trim().toLowerCase();
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, entry);
    }
  });
  return index;
}

function rebuildCatalogPriceIndex(baseEntries = catalogPriceEntries){
  const index = buildPriceIndex(baseEntries);
  if (Array.isArray(customCatalogEntries)) {
    customCatalogEntries.forEach(entry => {
      if (!entry || !entry.name) return;
      const key = entry.name.trim().toLowerCase();
      if (!key) return;
      let priceText = (entry.priceText || '').trim();
      let priceValue = Number.isFinite(entry.price) ? entry.price : null;
      if (!priceText && Number.isFinite(priceValue) && priceValue > 0) {
        priceText = `₡${priceValue.toLocaleString('en-US')}`;
      }
      if (!priceText && !Number.isFinite(priceValue)) return;
      if ((!Number.isFinite(priceValue) || priceValue <= 0) && priceText) {
        const extracted = extractPriceValue(priceText);
        priceValue = Number.isFinite(extracted) && extracted > 0 ? extracted : null;
      }
      if (!index.has(key)) {
        index.set(key, {
          name: entry.name,
          price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
          priceText
        });
      }
    });
  }
  catalogPriceIndex = index;
  return catalogPriceIndex;
}

function normalizeCatalogToken(value){
  if (value == null) return '';
  const text = String(value).toLowerCase();
  const cleaned = text.replace(/[^a-z0-9+]+/g, ' ').trim();
  return cleaned.replace(/\s+/g, ' ');
}

function splitValueOptions(text){
  if (text == null) return [];
  const raw = String(text).trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?:\s+or\s+|\s*&\s*|\/|\||\s*,\s*)/i)
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw];
}

function parseCatalogList(value){
  if (Array.isArray(value)) {
    return value.flatMap(parseCatalogList);
  }
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/[\n;]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function parseCatalogPrerequisites(value){
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/[\n;]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(segment => {
      const match = segment.match(/^([^:=]+)[:=]\s*(.+)$/);
      if (match) {
        return {
          key: match[1].trim(),
          values: splitValueOptions(match[2]),
          raw: segment
        };
      }
      return {
        key: '',
        values: splitValueOptions(segment),
        raw: segment
      };
    })
    .filter(entry => Array.isArray(entry.values) && entry.values.length);
}

function getRowValue(row, ...keys){
  for (const key of keys) {
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value != null) {
        const trimmed = String(value).trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return '';
}

function normalizeCatalogRow(row, priceLookup = catalogPriceIndex){
  const rawType = (row.Type || '').trim();
  const section = (row.Section || '').trim() || 'Gear';
  const name = (row.Name || '').trim();
  if (!name) return null;
  const tier = (row.Tier || '').trim();
  const legacyPriceSource = (row.PriceCr || '').trim();
  let priceEntry = null;
  if (priceLookup && name) {
    const key = name.toLowerCase();
    if (priceLookup.has(key)) {
      priceEntry = priceLookup.get(key);
    }
  }
  let priceText = priceEntry ? (priceEntry.priceText || '') : '';
  let price = priceEntry && Number.isFinite(priceEntry.price) ? priceEntry.price : null;
  if (!priceText && legacyPriceSource) {
    priceText = legacyPriceSource;
  }
  if ((!Number.isFinite(price) || price <= 0) && priceText) {
    const parsedPrice = extractPriceValue(priceText);
    price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
  }
  const perk = (row.Perk || '').trim();
  const description = (row.Description || '').trim();
  const use = (row.Use || '').trim();
  const attunement = (row.Attunement || '').trim();
  const source = (row['Where To Find'] || '').trim();
  const displayType = rawType || 'Item';
  const priceSearchText = priceText || legacyPriceSource;
  const classificationValue = getRowValue(
    row,
    'Classification',
    'Classifications',
    'Classification Requirement',
    'Classification Requirements'
  );
  const classifications = parseCatalogList(classificationValue)
    .flatMap(splitValueOptions)
    .map(normalizeCatalogToken)
    .filter(Boolean);
  const tierRestrictionValue = getRowValue(
    row,
    'Tier Requirement',
    'Tier Requirements',
    'Required Tier',
    'Required Tiers',
    'Tier Restriction',
    'Tier Restrictions',
    'Allowed Tier',
    'Allowed Tiers'
  );
  const tierRestrictions = parseCatalogList(tierRestrictionValue)
    .flatMap(splitValueOptions)
    .map(value => {
      const normalized = normalizeCatalogToken(value);
      return normalized ? { raw: value, normalized } : null;
    })
    .filter(Boolean);
  const prerequisitesValue = getRowValue(
    row,
    'Prerequisites',
    'Prerequisite',
    'Requirements',
    'Requirement',
    'Prereqs',
    'Prereq'
  );
  const prerequisites = parseCatalogPrerequisites(prerequisitesValue)
    .map(entry => {
      const normalizedKey = normalizeCatalogToken(entry.key || '');
      const values = entry.values
        .map(value => {
          const normalized = normalizeCatalogToken(value);
          return normalized ? { raw: value, normalized } : null;
        })
        .filter(Boolean);
      if (!values.length) return null;
      return {
        key: normalizedKey || null,
        values,
        raw: entry.raw
      };
    })
    .filter(Boolean);
  const searchParts = [section, displayType, name, tier, priceSearchText || '', perk, description, use, attunement, source];
  if (classifications.length) searchParts.push(classifications.join(' '));
  if (tierRestrictions.length) {
    searchParts.push(tierRestrictions.map(r => r.raw || r.normalized).join(' '));
  }
  if (prerequisites.length) {
    searchParts.push(prerequisites.map(r => r.raw || '').join(' '));
  }
  const search = searchParts.map(part => (part || '').toLowerCase()).join(' ');
  return {
    section,
    type: displayType,
    rawType,
    name,
    tier,
    price,
    priceText,
    priceRaw: legacyPriceSource || priceText,
    perk,
    description,
    use,
    attunement,
    source,
    classifications,
    tierRestrictions,
    prerequisites,
    search
  };
}

function escapeHtml(str){
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function formatPrice(value){
  if (!Number.isFinite(value) || value <= 0) return '';
  return `₡${value.toLocaleString('en-US')}`;
}

function getPriceDisplay(entry){
  if (!entry) return '';
  const formatted = formatPrice(entry.price);
  if (formatted) return formatted;
  const raw = (entry.priceText || entry.priceRaw || '').trim();
  if (!raw) return '';
  return raw;
}

function formatPriceNote(entry){
  const display = getPriceDisplay(entry);
  if (!display) return '';
  return display.startsWith('₡') ? display : `Price: ${display}`;
}

function getEntryPriceValue(entry){
  if (!entry) return null;
  if (Number.isFinite(entry.price) && entry.price > 0) return entry.price;
  const raw = (entry.priceText || entry.priceRaw || '').trim();
  if (!raw) return null;
  const numeric = extractPriceValue(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function tryPurchaseEntry(entry){
  const cost = getEntryPriceValue(entry);
  if (!Number.isFinite(cost) || cost <= 0) return true;
  if (!elCredits) return true;
  const available = num(elCredits.value) || 0;
  if (available < cost) {
    toast('You do not have enough Credits to purchase this item, come back when you have enough Credits.', 'error');
    return false;
  }
  setCredits(available - cost);
  return true;
}

function formatDamageText(damage){
  if (!damage) return '';
  return damage.replace(/(\dd\d)(\dd\d)/ig, '$1 / $2');
}

function extractArmorDetails(perk){
  if (!perk) return { bonus: 0, details: [] };
  const segments = perk.split(/;|\./).map(p => p.trim()).filter(Boolean);
  let bonus = 0;
  const details = [];
  segments.forEach((seg, idx) => {
    const match = seg.match(/\+(\d+)\s*TC/i);
    if (match && bonus === 0) {
      bonus = Number(match[1]) || 0;
      const remainder = seg.replace(/\+(\d+)\s*TC/i, '').trim();
      if (remainder) details.push(remainder.replace(/^[-–—]/, '').trim());
    } else if (idx > 0 || !match) {
      details.push(seg);
    }
  });
  return { bonus, details };
}

function extractWeaponDetails(perk){
  if (!perk) return { damage: '', extras: [] };
  const segments = perk.split(/;|\./).map(p => p.trim()).filter(Boolean);
  let damage = '';
  const extras = [];
  segments.forEach((seg, idx) => {
    const match = seg.match(/^(?:Damage\s*)?(.*)$/i);
    if (idx === 0 && /damage/i.test(seg)) {
      damage = match && match[1] ? match[1].trim() : seg.trim();
    } else if (idx === 0 && !/damage/i.test(seg)) {
      extras.push(seg);
    } else if (seg) {
      extras.push(seg);
    }
  });
  if (damage.toLowerCase().startsWith('damage')) {
    damage = damage.slice(6).trim();
  }
  return { damage: formatDamageText(damage), extras };
}

function buildItemNotes(entry){
  const notes = [];
  if (entry.tier) notes.push(`Tier ${entry.tier}`);
  const priceText = formatPriceNote(entry);
  if (priceText) notes.push(priceText);
  if (entry.perk) notes.push(entry.perk);
  if (entry.description) notes.push(entry.description);
  if (entry.use) notes.push(`Use: ${entry.use}`);
  if (entry.attunement) notes.push(`Attunement: ${entry.attunement}`);
  if (entry.source) notes.push(entry.source);
  return notes.join(' — ');
}

const CUSTOM_ITEM_TYPES = {
  weapon: { displayType: 'Weapon', cardKind: 'weapon', listId: 'weapons' },
  armor: { displayType: 'Armor', cardKind: 'armor', listId: 'armors' },
  shield: { displayType: 'Shield', cardKind: 'armor', listId: 'armors' },
  utility: { displayType: 'Utility', cardKind: 'item', listId: 'items' },
  item: { displayType: 'Item', cardKind: 'item', listId: 'items' }
};

function inferCardKind(type){
  const key = (type || '').toLowerCase();
  if (key === 'weapon') return 'weapon';
  if (key === 'armor' || key === 'shield') return 'armor';
  return 'item';
}

function refreshCustomEntrySearch(entry){
  if (!entry) return;
  entry.search = [
    entry.section,
    entry.type,
    entry.name,
    entry.tier,
    entry.priceText || '',
    entry.perk,
    entry.description,
    entry.use,
    entry.attunement,
    entry.source,
    ...(Array.isArray(entry.classifications) ? entry.classifications : []),
    ...(Array.isArray(entry.tierRestrictions) ? entry.tierRestrictions.map(r => r && (r.raw || r.normalized) || '') : []),
    ...(Array.isArray(entry.prerequisites) ? entry.prerequisites.map(r => r && (r.raw || '')).filter(Boolean) : [])
  ].map(part => (part || '').toLowerCase()).join(' ');
}

function normalizeCustomCatalogEntry(raw = {}){
  const type = raw.type || raw.rawType || 'Item';
  const entry = {
    customId: raw.customId || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: raw.section || 'Custom Gear',
    type,
    rawType: raw.rawType || type,
    name: raw.name || '',
    tier: raw.tier || '',
    price: Number.isFinite(raw.price) ? raw.price : null,
    priceText: raw.priceText || '',
    perk: raw.perk || '',
    description: raw.description || '',
    use: raw.use || '',
    attunement: raw.attunement || '',
    source: raw.source || 'Custom Entry',
    cardKind: raw.cardKind || inferCardKind(type),
    slot: raw.slot || (type === 'Shield' ? 'Shield' : ''),
    bonus: Number.isFinite(raw.bonus) ? raw.bonus : 0,
    qty: Number.isFinite(raw.qty) && raw.qty > 0 ? raw.qty : 1,
    hidden: !(raw.name && String(raw.name).trim()),
    classifications: [],
    tierRestrictions: [],
    prerequisites: []
  };
  refreshCustomEntrySearch(entry);
  return entry;
}

function loadCustomCatalogEntries(){
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCustomCatalogEntry);
  } catch (err) {
    console.error('Failed to load custom catalog entries', err);
    return [];
  }
}

function getVisibleCustomCatalogEntries(){
  return customCatalogEntries.filter(entry => !entry.hidden);
}

function getAllCatalogEntries(){
  const base = Array.isArray(catalogData) ? catalogData : [];
  return base.concat(getVisibleCustomCatalogEntries());
}

function saveCustomCatalogEntries(){
  if (typeof localStorage !== 'undefined') {
    try {
      const toSave = customCatalogEntries
        .filter(entry => !entry.hidden && entry.name && entry.name.trim())
        .map(entry => ({
          customId: entry.customId,
          section: entry.section,
          type: entry.type,
          rawType: entry.rawType,
          name: entry.name,
          tier: entry.tier,
          price: entry.price,
          priceText: entry.priceText,
          perk: entry.perk,
          description: entry.description,
          use: entry.use,
          attunement: entry.attunement,
          source: entry.source,
          search: entry.search,
          cardKind: entry.cardKind,
          slot: entry.slot,
          bonus: entry.bonus,
          qty: entry.qty
        }));
      localStorage.setItem(CUSTOM_CATALOG_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.error('Failed to save custom catalog entries', err);
    }
  }
  rebuildCatalogPriceIndex();
}

function removeCustomCatalogEntry(customId){
  const idx = customCatalogEntries.findIndex(entry => entry.customId === customId);
  if (idx >= 0) {
    customCatalogEntries.splice(idx, 1);
    saveCustomCatalogEntries();
    rebuildCatalogFilterOptions();
    requestCatalogRender();
  }
}

function createCustomCatalogEntry(config){
  const entry = normalizeCustomCatalogEntry({
    customId: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: 'Custom Gear',
    type: config.displayType,
    rawType: config.displayType,
    cardKind: config.cardKind,
    slot: config.displayType === 'Shield' ? 'Shield' : ''
  });
  entry.hidden = true;
  refreshCustomEntrySearch(entry);
  return entry;
}

function updateCustomCatalogEntryFromCard(entry, card){
  if (!entry || !card) return;
  const getVal = field => {
    const el = qs(`[data-f='${field}']`, card);
    if (!el) return '';
    if (el.type === 'number') return el.value || '';
    return el.value || '';
  };
  const name = getVal('name').trim();
  const wasHidden = entry.hidden;
  entry.name = name;
  if (entry.cardKind === 'weapon') {
    const damage = getVal('damage').trim();
    const range = getVal('range').trim();
    entry.perk = damage ? `Damage ${damage}` : '';
    entry.description = '';
    entry.use = range ? `Range ${range}` : '';
  } else if (entry.cardKind === 'armor') {
    const slotValue = getVal('slot') || (entry.type === 'Shield' ? 'Shield' : 'Body');
    const bonusValue = Number(getVal('bonus'));
    entry.slot = slotValue;
    entry.bonus = Number.isFinite(bonusValue) ? bonusValue : 0;
    entry.perk = entry.bonus ? `${entry.bonus >= 0 ? '+' : ''}${entry.bonus} TC` : '';
    entry.description = '';
    entry.use = '';
  } else {
    const qtyValue = Number(getVal('qty'));
    const notes = getVal('notes').trim();
    entry.qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;
    entry.description = notes;
    entry.perk = '';
    entry.use = '';
  }
  entry.tier = '';
  entry.attunement = '';
  entry.source = 'Custom Entry';
  entry.hidden = !entry.name;
  refreshCustomEntrySearch(entry);
  saveCustomCatalogEntries();
  if (wasHidden !== entry.hidden) {
    rebuildCatalogFilterOptions();
  }
  requestCatalogRender();
}

function attachCustomEntryListeners(entry, card){
  const update = debounce(() => updateCustomCatalogEntryFromCard(entry, card), 200);
  qsa('input,select,textarea', card).forEach(el => {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });
  const delBtn = qs("[data-act='del']", card);
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      removeCustomCatalogEntry(entry.customId);
    });
  }
  updateCustomCatalogEntryFromCard(entry, card);
}

if (customCatalogEntries.length) {
  rebuildCatalogFilterOptions();
  requestCatalogRender();
}

function ensureCatalogFilters(data){
  if (catalogFiltersInitialized) return;
  catalogFiltersInitialized = true;
  if (styleSel) {
    styleSel.innerHTML = '';
    styleSel.add(new Option('All Sections', ''));
    [...new Set(data.map(r => r.section).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .forEach(section => styleSel.add(new Option(section, section)));
    styleSel.value = '';
  }
  if (typeSel) {
    typeSel.innerHTML = '';
    typeSel.add(new Option('All Types', ''));
    [...new Set(data.map(r => r.type).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .forEach(type => typeSel.add(new Option(type, type)));
    typeSel.value = '';
  }
  if (tierSel) {
    tierSel.innerHTML = '';
    tierSel.add(new Option('All Tiers', ''));
    [...new Set(data.map(r => r.tier).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .forEach(tier => tierSel.add(new Option(tier, tier)));
    tierSel.value = '';
  }
}

function tierRank(tier){
  if (!tier) return Number.POSITIVE_INFINITY;
  const match = String(tier).match(/T(\d+)/i);
  if (match) {
    const rank = Number(match[1]);
    if (Number.isFinite(rank)) return rank;
  }
  return Number.POSITIVE_INFINITY;
}

function sortCatalogRows(rows){
  return rows.slice().sort((a, b) => {
    const rankA = tierRank(a.tier);
    const rankB = tierRank(b.tier);
    const aHasTier = Number.isFinite(rankA);
    const bHasTier = Number.isFinite(rankB);
    if (aHasTier && bHasTier && rankA !== rankB) {
      return rankA - rankB;
    }
    if (aHasTier !== bHasTier) {
      return aHasTier ? -1 : 1;
    }
    const nameCompare = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    return (a.type || '').localeCompare(b.type || '', 'en', { sensitivity: 'base' });
  });
}

export { tierRank, sortCatalogRows, extractPriceValue };

function setCatalogFilters(filters = {}){
  if (styleSel && Object.prototype.hasOwnProperty.call(filters, 'style')) {
    styleSel.value = filters.style ?? '';
  }
  if (typeSel && Object.prototype.hasOwnProperty.call(filters, 'type')) {
    typeSel.value = filters.type ?? '';
  }
  if (tierSel && Object.prototype.hasOwnProperty.call(filters, 'tier')) {
    tierSel.value = filters.tier ?? '';
  }
}

function getCatalogFilters(){
  return {
    style: styleSel ? styleSel.value : '',
    type: typeSel ? typeSel.value : '',
    tier: tierSel ? tierSel.value : ''
  };
}

function applyPendingCatalogFilters(){
  if (!pendingCatalogFilters) return;
  setCatalogFilters(pendingCatalogFilters);
  pendingCatalogFilters = null;
}

function rebuildCatalogFilterOptions(){
  const current = getCatalogFilters();
  catalogFiltersInitialized = false;
  ensureCatalogFilters(getAllCatalogEntries());
  setCatalogFilters(current);
}

function getPlayerCatalogState(){
  const readValue = id => {
    const el = $(id);
    if (!el || typeof el.value !== 'string') return '';
    return el.value.trim();
  };
  const classificationRaw = readValue('classification');
  const primaryStyleRaw = readValue('power-style');
  let secondaryStyleRaw = readValue('power-style-2');
  if (secondaryStyleRaw && /^none$/i.test(secondaryStyleRaw)) secondaryStyleRaw = '';
  const originRaw = readValue('origin');
  const alignmentRaw = readValue('alignment');
  const highestTierIndex = XP_TIERS.length ? XP_TIERS.length - 1 : 0;
  const safeIdx = Number.isFinite(currentTierIdx) ? Math.min(Math.max(currentTierIdx, 0), XP_TIERS.length ? XP_TIERS.length - 1 : 0) : 0;
  const tierNumber = Math.max(0, highestTierIndex - safeIdx);
  const tierLabel = `T${tierNumber}`;
  const tierValue = tierRank(tierLabel);
  const tierLabelText = XP_TIERS[safeIdx]?.label || '';
  const tags = new Set();
  const addTokens = value => {
    if (!value) return;
    const raw = String(value).trim();
    if (!raw) return;
    const normalized = normalizeCatalogToken(raw);
    if (normalized) tags.add(normalized);
    splitValueOptions(raw).forEach(option => {
      const normalizedOption = normalizeCatalogToken(option);
      if (normalizedOption) tags.add(normalizedOption);
    });
  };
  addTokens(classificationRaw);
  addTokens(primaryStyleRaw);
  addTokens(secondaryStyleRaw);
  addTokens(originRaw);
  addTokens(alignmentRaw);
  addTokens(tierLabelText);
  addTokens(tierLabel);
  addTokens(`Tier ${tierNumber}`);
  addTokens(String(tierNumber));
  if (Number.isFinite(tierValue)) addTokens(String(tierValue));
  const attributes = Object.create(null);
  const setAttr = (key, value) => {
    const normalizedKey = normalizeCatalogToken(key);
    const normalizedValue = normalizeCatalogToken(value);
    if (!normalizedKey || !normalizedValue) return;
    attributes[normalizedKey] = normalizedValue;
    if (normalizedKey.endsWith('s') && normalizedKey.length > 1) {
      const singular = normalizedKey.slice(0, -1);
      if (!attributes[singular]) attributes[singular] = normalizedValue;
    }
  };
  setAttr('classification', classificationRaw);
  setAttr('class', classificationRaw);
  setAttr('power style', primaryStyleRaw);
  setAttr('style', primaryStyleRaw);
  setAttr('primary power style', primaryStyleRaw);
  setAttr('secondary power style', secondaryStyleRaw);
  setAttr('power style 2', secondaryStyleRaw);
  setAttr('origin', originRaw);
  setAttr('origin story', originRaw);
  setAttr('alignment', alignmentRaw);
  setAttr('tier', tierLabel);
  setAttr('tier label', tierLabelText);
  setAttr('tier level', `Tier ${tierNumber}`);
  setAttr('tier number', String(tierNumber));
  if (Number.isFinite(tierValue)) {
    setAttr('tier rank', String(tierValue));
  }
  return {
    tierLabel,
    tierValue,
    classification: attributes.classification || '',
    primaryStyle: attributes['power style'] || '',
    secondaryStyle: attributes['secondary power style'] || '',
    origin: attributes.origin || '',
    alignment: attributes.alignment || '',
    tags,
    attributes
  };
}

function matchesTierRestriction(restriction, playerState){
  if (!restriction || !playerState) return true;
  const raw = typeof restriction === 'string' ? restriction : restriction.raw;
  const normalized = typeof restriction === 'string' ? normalizeCatalogToken(restriction) : restriction.normalized;
  if (!normalized) return true;
  let requiredRank = null;
  let match = normalized.match(/t(\d)/);
  if (match) requiredRank = Number(match[1]);
  if (!Number.isFinite(requiredRank)) {
    match = normalized.match(/tier\s*(\d)/);
    if (match) requiredRank = Number(match[1]);
  }
  if (!Number.isFinite(requiredRank)) {
    match = normalized.match(/\b(\d)\b/);
    if (match) requiredRank = Number(match[1]);
  }
  if (Number.isFinite(requiredRank) && Number.isFinite(playerState.tierValue)) {
    if (/\bor higher\b/.test(normalized) || /\+$/.test(normalized)) {
      return playerState.tierValue <= requiredRank;
    }
    if (/\bor lower\b/.test(normalized) || /\-$/.test(normalized)) {
      return playerState.tierValue >= requiredRank;
    }
    return playerState.tierValue === requiredRank;
  }
  if (Number.isFinite(requiredRank) && !Number.isFinite(playerState.tierValue)) {
    return false;
  }
  return playerState.tags.has(normalized);
}

function isCatalogPrerequisiteMet(prereq, playerState){
  if (!prereq || !playerState) return true;
  const values = Array.isArray(prereq.values) ? prereq.values : [];
  if (!values.length) return true;
  if (prereq.key) {
    if (prereq.key === 'tier' || prereq.key === 'tier level' || prereq.key === 'tier rank') {
      return values.some(value => matchesTierRestriction(value, playerState));
    }
    const attrValue = playerState.attributes[prereq.key];
    if (attrValue) {
      return values.some(value => attrValue === value.normalized || playerState.tags.has(value.normalized));
    }
    return values.some(value => playerState.tags.has(value.normalized));
  }
  return values.some(value => playerState.tags.has(value.normalized));
}

function isEntryAvailableToPlayer(entry, playerState){
  if (!entry || !playerState) return true;
  const playerTier = playerState.tierValue;
  if (entry.tier) {
    const entryTier = tierRank(entry.tier);
    if (Number.isFinite(entryTier) && Number.isFinite(playerTier) && entryTier !== playerTier) {
      return false;
    }
  }
  if (Array.isArray(entry.tierRestrictions) && entry.tierRestrictions.length) {
    const tierOk = entry.tierRestrictions.some(restriction => matchesTierRestriction(restriction, playerState));
    if (!tierOk) return false;
  }
  if (Array.isArray(entry.classifications) && entry.classifications.length) {
    const classOk = entry.classifications.some(token => playerState.tags.has(token));
    if (!classOk) return false;
  }
  if (Array.isArray(entry.prerequisites) && entry.prerequisites.length) {
    for (const prereq of entry.prerequisites) {
      if (!isCatalogPrerequisiteMet(prereq, playerState)) return false;
    }
  }
  return true;
}

function renderCatalog(){
  if (!catalogListEl) return;
  const visibleCustom = getVisibleCustomCatalogEntries();
  if (catalogError && !visibleCustom.length) {
    catalogListEl.innerHTML = '<div class="catalog-empty">Failed to load gear catalog.</div>';
    return;
  }
  const baseLoaded = Array.isArray(catalogData);
  if (!baseLoaded && !visibleCustom.length) {
    catalogListEl.innerHTML = '<div class="catalog-empty">Loading gear catalog...</div>';
    return;
  }
  const style = styleSel ? styleSel.value : '';
  const type = typeSel ? typeSel.value : '';
  const tier = tierSel ? tierSel.value : '';
  const source = (baseLoaded ? catalogData.slice() : []).concat(visibleCustom);
  const playerState = getPlayerCatalogState();
  const rows = sortCatalogRows(source.filter(entry => (
    (!style || entry.section === style) &&
    (!type || entry.type === type) &&
    (!tier || entry.tier === tier) &&
    isEntryAvailableToPlayer(entry, playerState)
  )));
  if (!rows.length) {
    catalogListEl.innerHTML = '<div class="catalog-empty">No matching gear found.</div>';
    return;
  }
  catalogListEl.innerHTML = rows.map((entry, idx) => {
    const priceText = formatPriceNote(entry);
    const details = [];
    if (entry.perk) details.push(`<div class="small">${escapeHtml(entry.perk)}</div>`);
    if (entry.use) details.push(`<div class="small">Use: ${escapeHtml(entry.use)}</div>`);
    if (entry.attunement) details.push(`<div class="small">Attunement: ${escapeHtml(entry.attunement)}</div>`);
    if (entry.description) details.push(`<div class="small">${escapeHtml(entry.description)}</div>`);
    return `
    <div class="catalog-item">
      <div class="pill">${escapeHtml(entry.tier || '—')}</div>
      <div><b>${escapeHtml(entry.name)}</b> <span class="small">— ${escapeHtml(entry.section)}${entry.type ? ` • ${escapeHtml(entry.type)}` : ''}${priceText ? ` • ${escapeHtml(priceText)}` : ''}</span>
        ${details.join('')}
      </div>
      <div><button class="btn-sm" data-add="${idx}">Add</button></div>
    </div>`;
  }).join('');
  qsa('[data-add]', catalogListEl).forEach(btn => btn.addEventListener('click', () => {
    const item = rows[Number(btn.dataset.add)];
    if (!item) return;
    if (!tryPurchaseEntry(item)) return;
    addEntryToSheet(item);
  }));
}

async function fetchCatalogText(url, errorMessage = 'Catalog fetch failed'){
  const res = await fetch(url);
  if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
    throw new Error(errorMessage);
  }
  if (typeof res.arrayBuffer === 'function') {
    const buffer = await res.arrayBuffer();
    return decodeCatalogBuffer(buffer);
  }
  if (typeof res.text === 'function') {
    return await res.text();
  }
  return '';
}

async function ensureCatalog(){
  if (catalogData) return catalogData;
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    try {
      const masterPromise = fetchCatalogText(CATALOG_MASTER_SRC, 'Catalog fetch failed');
      const pricePromise = fetchCatalogText(CATALOG_PRICE_SRC, 'Price fetch failed').catch(err => {
        console.error('Failed to load catalog prices', err);
        return null;
      });
      const [masterText, priceTextRaw] = await Promise.all([masterPromise, pricePromise]);
      const parsedMaster = parseCsv(masterText);
      if (typeof priceTextRaw === 'string') {
        const parsedPrices = parseCsv(priceTextRaw);
        catalogPriceEntries = parsedPrices.map(normalizePriceRow).filter(Boolean);
      } else if (!Array.isArray(catalogPriceEntries) || !catalogPriceEntries.length) {
        catalogPriceEntries = [];
      }
      const priceIndex = rebuildCatalogPriceIndex(catalogPriceEntries);
      const normalized = parsedMaster.map(row => normalizeCatalogRow(row, priceIndex)).filter(Boolean);
      catalogData = normalized;
      catalogError = null;
      rebuildCatalogFilterOptions();
      applyPendingCatalogFilters();
      requestCatalogRender();
      return catalogData;
    } catch (err) {
      console.error('Failed to load catalog', err);
      catalogError = err;
      catalogData = null;
      renderCatalog();
      throw err;
    } finally {
      catalogPromise = null;
    }
  })();
  return catalogPromise;
}

if (styleSel) styleSel.addEventListener('input', renderCatalog);
if (typeSel) typeSel.addEventListener('input', renderCatalog);
if (tierSel) tierSel.addEventListener('input', renderCatalog);
if (catalogCustomBtn) catalogCustomBtn.addEventListener('click', () => {
  handleAddCustomCatalogItem();
});
if (customTypeButtons.length) {
  customTypeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      handleCustomItemTypeSelection(btn.dataset.customType);
    });
  });
}

function openCatalogWithFilters(filters = {}){
  pendingCatalogFilters = filters;
  show('modal-catalog');
  renderCatalog();
  ensureCatalog().then(() => {
    applyPendingCatalogFilters();
    renderCatalog();
  }).catch(() => {
    toast('Failed to load gear catalog', 'error');
    pendingCatalogFilters = null;
    renderCatalog();
  });
}

$('open-catalog').addEventListener('click', () => {
  openCatalogWithFilters({ style: '', type: '', tier: '' });
});

async function handleAddCustomCatalogItem(){
  try {
    await ensureCatalog();
  } catch (err) {
    console.error('Custom item catalog load failed', err);
    toast('Failed to load gear catalog', 'error');
    renderCatalog();
  }
  hide('modal-catalog');
  if (customTypeModal) {
    show('modal-custom-item');
  }
}

function handleCustomItemTypeSelection(typeKey){
  const key = String(typeKey || '').toLowerCase();
  const config = CUSTOM_ITEM_TYPES[key];
  if (!config) {
    toast('Unknown item type. Try Weapon, Armor, Shield, Utility, or Item.', 'error');
    return;
  }
  hide('modal-custom-item');
  const list = $(config.listId);
  if (!list) return;
  const entry = createCustomCatalogEntry(config);
  customCatalogEntries.push(entry);
  const card = createCard(config.cardKind);
  card.dataset.customCatalogId = entry.customId;
  if (config.displayType === 'Shield') {
    const slotSel = qs("[data-f='slot']", card);
    if (slotSel) slotSel.value = 'Shield';
  }
  list.appendChild(card);
  attachCustomEntryListeners(entry, card);
  pushHistory();
  const nameInput = qs("[data-f='name']", card);
  if (nameInput && typeof nameInput.focus === 'function') {
    nameInput.focus();
  }
  toast('Custom item card added. Fill in the details to add it to the catalog.', 'success');
}

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
    if (id === 'xp-mode') return;
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
  // Persist save and skill proficiencies explicitly so they restore reliably
  data.saveProfs = ABILS.filter(a => {
    const el = $('save-' + a + '-prof');
    return el && el.checked;
  });
  data.skillProfs = SKILLS.map((_, i) => {
    const el = $('skill-' + i + '-prof');
    return el && el.checked ? i : null;
  }).filter(i => i !== null);
  data.campaignLog = campaignLog;
  if (window.CC && CC.partials && Object.keys(CC.partials).length) {
    try { data.partials = JSON.parse(JSON.stringify(CC.partials)); } catch { data.partials = {}; }
  }
  return data;
}
const DEFAULT_STATE = serialize();
function deserialize(data){
  migratePublicOpinionSnapshot(data);
  $('powers').innerHTML=''; $('sigs').innerHTML=''; $('weapons').innerHTML=''; $('armors').innerHTML=''; $('items').innerHTML='';
 const perkSelects=['alignment','classification','power-style','origin'];
 perkSelects.forEach(id=>{
   const el=$(id);
   const val=data?data[id]:undefined;
   if(el && val!==undefined){
     el.value=val;
     el.dispatchEvent(new Event('change',{bubbles:true}));
   }
 });
  Object.entries(data||{}).forEach(([k,v])=>{
   if(perkSelects.includes(k) || k==='saveProfs' || k==='skillProfs' || k==='xp-mode') return;
   const el=$(k);
   if (!el) return;
   if (el.type==='checkbox') el.checked=!!v; else el.value=v;
 });
 if(data && Array.isArray(data.saveProfs)){
   ABILS.forEach(a=>{
     const el = $('save-'+a+'-prof');
     if(el) el.checked = data.saveProfs.includes(a);
   });
 }
 if(data && Array.isArray(data.skillProfs)){
   SKILLS.forEach((_,i)=>{
     const el = $('skill-'+i+'-prof');
     if(el) el.checked = data.skillProfs.includes(i);
   });
 }
  (data && data.powers ? data.powers : []).forEach(p=> $('powers').appendChild(createCard('power', p)));
  (data && data.signatures ? data.signatures : []).forEach(s=> $('sigs').appendChild(createCard('sig', s)));
  (data && data.weapons ? data.weapons : []).forEach(w=> $('weapons').appendChild(createCard('weapon', w)));
  (data && data.armor ? data.armor : []).forEach(a=> $('armors').appendChild(createCard('armor', a)));
  (data && data.items ? data.items : []).forEach(i=> $('items').appendChild(createCard('item', i)));
  campaignLog.length=0; (data && data.campaignLog ? data.campaignLog : []).forEach(e=>campaignLog.push(e));
  localStorage.setItem('campaign-log', JSON.stringify(campaignLog));
  renderCampaignLog();
  const xpModeEl = $('xp-mode');
  if (xpModeEl) xpModeEl.value = 'add';
  if (elXP) {
    const xp = Math.max(0, num(elXP.value));
    currentTierIdx = getTierIndex(xp);
  }
  if(data && data.partials && window.CC){
    CC.partials = data.partials;
    if(CC.RP && typeof CC.RP.load==='function' && CC.partials.resonance){
      CC.RP.load(CC.partials.resonance);
    }
  }
  updateDerived();
  updateFactionRep(handlePerkEffects);
  updateCreditsDisplay();
  if (viewMode) applyViewLockState();
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

(function(){
  try{ localStorage.removeItem(AUTO_KEY); }catch{}
  deserialize(DEFAULT_STATE);
  const snap = serialize();
  history = [snap];
  histIdx = 0;
  try{ localStorage.setItem(AUTO_KEY, JSON.stringify(snap)); }catch(e){ console.error('Autosave failed', e); }
})();
$('btn-save').addEventListener('click', async () => {
  const btn = $('btn-save');
  const oldChar = currentCharacter();
  const vig = $('superhero')?.value.trim();
  const real = $('secret')?.value.trim();
  let target = oldChar;
  if (vig) {
    target = vig;
  } else if (!oldChar && real) {
    target = real;
  }
  if (!target) return toast('No character selected', 'error');
  if (!confirm(`Save current progress for ${target}?`)) return;
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const data = serialize();
    if (oldChar && vig && vig !== oldChar) {
      await renameCharacter(oldChar, vig, data);
    } else {
      if (target !== oldChar) setCurrentCharacter(target);
      await saveCharacter(data, target);
    }
    toast('Save successful', 'success');
    playSaveAnimation();
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
});

const heroInput = $('superhero');
if (heroInput) {
  heroInput.addEventListener('change', async () => {
    const name = heroInput.value.trim();
    if (!name) return;
    if (!currentCharacter()) {
      setCurrentCharacter(name);
      try {
        await saveCharacter(serialize(), name);
      } catch (e) {
        console.error('Autosave failed', e);
      }
    }
  });
}


/* ========= Rules ========= */
const btnRules = $('btn-rules');
if (btnRules) {
  btnRules.addEventListener('click', ()=>{
    renderRules();
    show('modal-rules');
  });
}

/* ========= Close + click-outside ========= */
qsa('.overlay').forEach(ov=> ov.addEventListener('click', (e)=>{ if (e.target===ov) hide(ov.id); }));
const welcomeOk = $('welcome-ok');
if (welcomeOk) {
  welcomeOk.addEventListener('click', ()=>{ hide('modal-welcome'); });
}
const welcomeCreate = $('welcome-create-character');
if (welcomeCreate) {
  welcomeCreate.addEventListener('click', () => {
    hide('modal-welcome');
    const newCharBtn = $('create-character');
    if (newCharBtn) newCharBtn.click();
  });
}
show('modal-welcome');

/* ========= boot ========= */
setupPerkSelect('alignment','alignment-perks', ALIGNMENT_PERKS);
setupPerkSelect('classification','classification-perks', CLASSIFICATION_PERKS);
setupPerkSelect('power-style','power-style-perks', POWER_STYLE_PERKS);
setupPerkSelect('origin','origin-perks', ORIGIN_PERKS);
setupFactionRepTracker(handlePerkEffects, pushHistory);
updateDerived();
applyDeleteIcons();
applyLockIcons();
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const swUrl = new URL('../sw.js', import.meta.url);
  navigator.serviceWorker.register(swUrl.href).catch(e => console.error('SW reg failed', e));
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (serviceWorkerUpdateHandled) return;
    if (!hadController) {
      hadController = true;
      return;
    }
    announceContentUpdate({
      message: 'New Codex content is available.',
      updatedAt: Date.now(),
      source: 'controllerchange',
    });
  });
  navigator.serviceWorker.addEventListener('message', e => {
    const { data } = e;
    const payload = (data && typeof data === 'object') ? data : { type: data };
    const type = typeof payload.type === 'string' ? payload.type : undefined;
    if (!type) return;
    if (type === 'cacheCloudSaves') {
      cacheCloudSaves();
      return;
    }
    if (type === 'pins-updated') {
      applyLockIcons();
      return;
    }
    if (type === 'sw-updated') {
      announceContentUpdate(payload);
    }
  });
  navigator.serviceWorker.ready
    .then(reg => {
      const triggerFlush = () => {
        const worker = navigator.serviceWorker.controller || reg.active;
        if (reg.sync && typeof reg.sync.register === 'function') {
          reg.sync.register('cloud-save-sync').catch(() => {
            worker?.postMessage({ type: 'flush-cloud-saves' });
          });
        }
        worker?.postMessage({ type: 'flush-cloud-saves' });
      };
      triggerFlush();
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('online', triggerFlush);
      }
    })
    .catch(() => {});
}
subscribeCloudSaves();

// == Resonance Points (RP) Module ============================================
CC.RP = (function () {
  const api = {};
  // --- Internal state
  let state = {
    rp: 0,                    // 0..4
    banked: 0,                // number of banked surges
    surgeActive: false,
    surgeStartedAt: null,
    surgeMode: "encounter",   // "encounter" | "time"
    surgeEndsAt: null,        // ms timestamp if timed
    aftermathPending: false,  // true when surge just ended until 1st save disadvantage is consumed
    nextCombatRegenPenalty: false // true: apply -1 SP regen on next combat's 1st round
  };

  // --- DOM refs
  const els = {};
  function q(id) { return document.getElementById(id); }

  function init() {
    const root = document.getElementById("resonance-points");
    if (!root) return;

    els.rpValue = q("rp-value");
    els.rpTrack = root.querySelector('.rp-track');
    els.rpDots = Array.from(root.querySelectorAll(".rp-dot[data-rp]"));
    els.bankDots = Array.from(root.querySelectorAll('.rp-bank-dot'));
    els.btnDec = q('rp-dec');
    els.btnInc = q('rp-inc');
    els.chkSurge = q("rp-trigger");
    els.btnClearAftermath = q("rp-clear-aftermath");
    els.surgeState = q("rp-surge-state");
    els.tagActive = q("rp-tag-active");
    els.tagAfter = q("rp-tag-aftermath");

    wireEvents();
    tryLoadFromApp();
    applyStateToUI();
    exposeHooks();
    installIntegrations();
    // Optional background timer for timed surges
    setInterval(tick, 1000 * 10); // 10s cadence is fine for coarse timers
  }

  function wireEvents() {
    if (els.btnInc) els.btnInc.addEventListener('click', () => setRP(state.rp + state.banked * 5 + 1));
    if (els.btnDec) els.btnDec.addEventListener('click', () => setRP(state.rp + state.banked * 5 - 1));
    if (els.chkSurge) {
      els.chkSurge.addEventListener("change", e => {
        if (e.target.checked) {
          if (confirm('Activate Heroic Surge?')) {
            triggerSurge();
          } else {
            e.target.checked = false;
          }
        }
      });
    }
    if (els.btnClearAftermath) {
      els.btnClearAftermath.addEventListener("click", () => {
        if (state.surgeActive) endSurge("aftermath");
        else clearAftermath();
      });
    }
  }

  // --- State transitions
  function setRP(n) {
    const prev = { rp: state.rp, banked: state.banked };
    const total = Math.max(0, Math.min(10, n));
    state.banked = Math.floor(total / 5);
    state.rp = total % 5;
    applyStateToUI();
    save();
    dispatch("rp:changed", { rp: state.rp, banked: state.banked });
    if (state.rp !== prev.rp || state.banked !== prev.banked) {
      const prevTotal = prev.rp + prev.banked * 5;
      const newTotal = state.rp + state.banked * 5;
      window.dmNotify?.(`RP ${state.rp} (bank ${state.banked})`);
      logAction(`RP: ${prevTotal} -> ${newTotal}`);
    }
  }

  function triggerSurge({ mode = "encounter", minutes = 10 } = {}) {
    if (state.banked < 1 || state.surgeActive) return;
    const prevBank = state.banked;
    state.surgeActive = true;
    state.surgeStartedAt = Date.now();
    state.surgeMode = mode;
    state.surgeEndsAt = mode === "time" ? (Date.now() + minutes * 60 * 1000) : null;
    state.banked = Math.max(0, state.banked - 1); // consume 1 banked surge
    state.aftermathPending = false;
    state.nextCombatRegenPenalty = false;
    applyStateToUI();
    save();
    dispatch("rp:surge:start", { mode: state.surgeMode, startedAt: state.surgeStartedAt, endsAt: state.surgeEndsAt });
    window.dmNotify?.(`Heroic Surge activated (${mode})`);
    if (state.banked !== prevBank) {
      window.dmNotify?.(`RP bank ${state.banked}`);
    }
  }

  function endSurge(reason = "natural") {
    if (!state.surgeActive) return;
    state.surgeActive = false;
    state.aftermathPending = true;           // first save at disadvantage
    state.nextCombatRegenPenalty = true;     // first round next combat: -1 SP regen
    state.surgeEndsAt = null;
    state.surgeStartedAt = null;
    applyStateToUI();
    save();
    dispatch("rp:surge:end", { reason });
    window.dmNotify?.(`Heroic Surge ended (${reason})`);
  }

  function clearAftermath() {
    state.aftermathPending = false;
    applyStateToUI();
    save();
    dispatch("rp:aftermath:cleared", {});
    window.dmNotify?.("Heroic Surge aftermath cleared");
  }

  function tick(now = Date.now()) {
    if (state.surgeActive && state.surgeMode === "time" && state.surgeEndsAt && now >= state.surgeEndsAt) {
      endSurge("timer");
    }
  }

  // --- UI sync
  function applyStateToUI() {
    if (!els.rpValue) return;
    // Update both the text and value so screen readers and any logic
    // reading the `value` property receive the current RP. Using only
    // `textContent` leaves `value` stale, which caused the on-screen
    // number to remain at 0 when a dot was toggled in some browsers.
    const total = state.rp + state.banked * 5;
    const val = String(total);
    els.rpValue.textContent = val;
    // The output element exposes a `.value` property that may be used
    // by CSS `attr(value)` or assistive tech; keep it in sync. Updating
    // the property alone does not update the `value` attribute, which some
    // browsers or CSS selectors may rely on, so set both.
    els.rpValue.value = val;
    els.rpValue.setAttribute("value", val);
    const banked = state.banked;
    els.rpDots.forEach(btn => {
      const v = parseInt(btn.dataset.rp, 10);
      btn.setAttribute("aria-pressed", String(v <= state.rp));
    });
    if (els.bankDots) {
      els.bankDots.forEach(dot => {
        const v = parseInt(dot.dataset.bank, 10);
        dot.setAttribute('aria-pressed', String(v <= banked));
      });
    }
    // Disable controls at their bounds so users receive immediate feedback
    // that no further adjustment is possible. Previously the buttons remained
    // active even when the value was clamped, leading to the impression that
    // they were non-functional.
    if (els.btnInc) els.btnInc.disabled = total >= 10;
    if (els.btnDec) els.btnDec.disabled = total <= 0;
    if (els.rpTrack) els.rpTrack.classList.toggle('maxed', total >= 10);

    if (els.surgeState) {
      els.surgeState.textContent = state.surgeActive ? "Active" : "Inactive";
    }
    if (els.chkSurge) {
      els.chkSurge.checked = state.surgeActive;
      els.chkSurge.disabled = state.surgeActive || state.banked < 1;
    }
    if (els.btnClearAftermath) {
      els.btnClearAftermath.disabled = !(state.surgeActive || state.aftermathPending);
    }
    if (els.tagActive) els.tagActive.hidden = !state.surgeActive;
    if (els.tagAfter) els.tagAfter.hidden = !state.aftermathPending;
  }

  // --- Persistence
  function serialize() {
    return {
      resonancePoints: state.rp,
      resonanceBanked: state.banked,
      resonanceSurge: {
        active: state.surgeActive,
        startedAt: state.surgeStartedAt,
        mode: state.surgeMode,
        endsAt: state.surgeEndsAt,
        aftermathPending: state.aftermathPending
      },
      resonanceNextCombatRegenPenalty: state.nextCombatRegenPenalty
    };
  }
  function deserialize(data) {
    if (!data) return;
    const s = data.resonanceSurge || {};
    state.rp = Number.isFinite(data.resonancePoints) ? data.resonancePoints : 0;
    state.banked = Number.isFinite(data.resonanceBanked) ? data.resonanceBanked : 0;
    let total = state.rp + state.banked * 5;
    if (total > 10) {
      total = 10;
      state.banked = Math.floor(total / 5);
      state.rp = total % 5;
    }
    state.surgeActive = !!s.active;
    state.surgeStartedAt = s.startedAt || null;
    state.surgeMode = s.mode || "encounter";
    state.surgeEndsAt = s.endsAt || null;
    state.aftermathPending = !!s.aftermathPending;
    state.nextCombatRegenPenalty = !!data.resonanceNextCombatRegenPenalty;
  }
  function save() {
    if (window.CC && typeof CC.savePartial === "function") {
      CC.savePartial("resonance", serialize());
    } else {
      localStorage.setItem("cc_resonance", JSON.stringify(serialize()));
    }
  }
  function tryLoadFromApp() {
    if (window.CC && typeof CC.loadPartial === "function") {
      const data = CC.loadPartial("resonance");
      if (data) deserialize(data);
      return;
    }
    try {
      const raw = localStorage.getItem("cc_resonance");
      if (raw) deserialize(JSON.parse(raw));
    } catch {}
  }

  // --- Events
  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // --- Public API (for GM buttons/macros, etc.)
  function exposeHooks() {
    api.get = () => ({ ...state });
    api.setRP = setRP;
    api.trigger = triggerSurge;
    api.end = endSurge;
    api.clearAftermath = clearAftermath;
    api.tick = tick;
    api.load = data => { deserialize(data); applyStateToUI(); };
  }

  // --- Integrations (rolls, saves, checks, SP regen)
  function installIntegrations() {
    // 1) Attack rolls
    if (CC.rollAttack && !CC.rollAttack.__rpWrapped) {
      const base = CC.rollAttack.bind(CC);
      CC.rollAttack = function (opts = {}) {
        const res = base(opts);
        try {
          if (state.surgeActive && res && typeof res.total === "number") {
            const bonus = d4();
            res.total += bonus;
            if (res.breakdown) res.breakdown.push(`+ RP Surge: +${bonus}`);
          }
        } catch {}
        return res;
      };
      CC.rollAttack.__rpWrapped = true;
    }

    // 2) Generic roll wrapper (if app uses a single entry point)
    if (CC.roll && !CC.roll.__rpWrapped) {
      const base = CC.roll.bind(CC);
      CC.roll = function (opts = {}) {
        const out = base(opts);
        try {
          // Apply +1d4 to attacks/saves during surge
          if (state.surgeActive && out && typeof out.total === "number") {
            const isAttack = opts?.type === "attack";
            const isSave = opts?.type === "save";
            if (isAttack || isSave) {
              const bonus = d4();
              out.total += bonus;
              out.breakdown = out.breakdown || [];
              out.breakdown.push(`+ RP Surge: +${bonus}`);
            }
          }
          // Aftermath: first save at disadvantage
          if (!state.surgeActive && state.aftermathPending && opts?.type === "save") {
            if (out && Array.isArray(out.rolls) && out.rolls.length >= 2) {
              // assume out.total used highest; recompute with disadvantage (take lowest)
              const low = Math.min(...out.rolls);
              const mod = (out.modifier || 0);
              out.total = low + mod;
              out.breakdown = out.breakdown || [];
              out.breakdown.push(`Aftermath (disadvantage on first save)`);
            }
            clearAftermath(); // consume one-time penalty
          }
          // Roleplay checks +2 (CHA/WIS/INT only) if flagged
          if (state.surgeActive && opts?.type === "skill" && opts?.roleplay === true) {
            const abil = (opts?.ability || "").toUpperCase();
            if (abil === "CHA" || abil === "WIS" || abil === "INT") {
              out.total += 2;
              out.breakdown = out.breakdown || [];
              out.breakdown.push(`+ RP Surge (roleplay +2)`);
            }
          }
        } catch {}
        return out;
      };
      CC.roll.__rpWrapped = true;
    }

    // 3) Generic rollWithBonus wrapper used across the app
    if (typeof rollWithBonus === "function" && !rollWithBonus.__rpWrapped) {
      const base = rollWithBonus;
      rollWithBonus = function (name, bonus, out, opts = {}) {
        const type = opts.type || "";
        const ability = (opts.ability || "").toUpperCase();
        const roleplay = !!opts.roleplay;

        // Aftermath penalty: first save at disadvantage
        if (!state.surgeActive && state.aftermathPending && type === "save") {
          const r1 = 1 + Math.floor(Math.random() * 20);
          const r2 = 1 + Math.floor(Math.random() * 20);
          const roll = Math.min(r1, r2);
          const total = roll + bonus;
          if (out) out.textContent = total;
          logAction(`${name}: ${r1}/${r2}${bonus>=0?'+':''}${bonus} = ${total} (Aftermath disadvantage)`);
          clearAftermath();
          return total;
        }

        let extra = 0;
        let breakdown = [];

        if (state.surgeActive && (type === "attack" || type === "save")) {
          const b = d4();
          extra += b;
          breakdown.push(`+ RP Surge: +${b}`);
        }

        if (state.surgeActive && type === "skill" && roleplay && ["CHA","WIS","INT"].includes(ability)) {
          extra += 2;
          breakdown.push(`+ RP Surge: +2`);
        }

        const total = base(name, bonus + extra, out);
        if (breakdown.length) {
          try {
            const last = actionLog[actionLog.length - 1];
            last.text += ' ' + breakdown.join(' ');
            renderLogs();
            renderFullLogs();
          } catch {}
        }
        return total;
      };
      rollWithBonus.__rpWrapped = true;
    }

    // 4) SP regeneration integration
    if (CC.SP && typeof CC.SP.getRegenBase === "function" && !CC.SP.getRegenBase.__rpWrapped) {
      const base = CC.SP.getRegenBase.bind(CC.SP);
      CC.SP.getRegenBase = function (...args) {
        let regen = base(...args);
        try {
          if (state.surgeActive) regen += 1;
          if (!state.surgeActive && state.nextCombatRegenPenalty && CC.Combat?.isFirstRound?.()) {
            regen = Math.max(0, regen - 1);
            state.nextCombatRegenPenalty = false; // consume
            save();
          }
        } catch {}
        return regen;
      };
      CC.SP.getRegenBase.__rpWrapped = true;
    }

    // Optional: mark encounter end to end surge automatically
    if (CC.Combat && typeof CC.Combat.onEnd === "function" && !CC.Combat.onEnd.__rpHook) {
      CC.Combat.onEnd(() => {
        if (state.surgeActive) endSurge("encounter-end");
      });
      CC.Combat.onStart?.(() => {
        // noop; nextCombatRegenPenalty handled in SP regen hook via isFirstRound()
      });
      CC.Combat.onEnd.__rpHook = true;
    }
  }

  // --- dice helper
  function d4() { return 1 + Math.floor(Math.random() * 4); }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  return api;
})();

