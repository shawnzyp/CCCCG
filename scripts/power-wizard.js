/* scripts/power-wizard.js
   Power Wizard v2: responsive, intuitive, supports create/edit/duplicate,
   and updates existing powers in-place without duplication.

   This module is self-contained and best-effort reuses repo helpers/constants if present.
*/

import * as PowerMeta from './power-metadata.js';

let wizardState = {
  isOpen: false,
  mode: 'create', // 'create' | 'edit'
  step: 0,
  powers: [],
  selectedPowerId: null,
  originalPowerSnapshot: null,
  draft: null,
  options: null,
  els: null,
  lastFocus: null,
};

const STEPS = [
  { key: 'pick', label: 'Pick or Edit' },
  { key: 'identity', label: 'Core Identity' },
  { key: 'shape', label: 'Gameplay' },
  { key: 'effects', label: 'Effects' },
  { key: 'review', label: 'Review' },
];

function getGlobal() {
  try {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined') return globalThis;
  } catch (_) {}
  return null;
}

function $(sel, root = document) {
  return root ? root.querySelector(sel) : null;
}

function $all(sel, root = document) {
  return root ? Array.from(root.querySelectorAll(sel)) : [];
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeText(v) {
  return String(v == null ? '' : v);
}

function deepClone(obj) {
  try {
    return structuredClone(obj);
  } catch (_) {
    return JSON.parse(JSON.stringify(obj || {}));
  }
}

function uid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `pw_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

function escapeHtml(str) {
  return safeText(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* Best-effort access to existing repo helpers/constants */
function readConst(name, fallback) {
  if (PowerMeta && name in PowerMeta) return PowerMeta[name];
  const g = getGlobal();
  if (g && name in g) return g[name];
  try {
    if (typeof window !== 'undefined' && window[name] != null) return window[name];
  } catch (_) {}
  return fallback;
}

function readFn(name, fallback) {
  if (PowerMeta && typeof PowerMeta[name] === 'function') return PowerMeta[name];
  const g = getGlobal();
  const fn = g && typeof g[name] === 'function' ? g[name] : null;
  return fn || fallback;
}

const POWER_WIZARD_TYPES = () => readConst('POWER_WIZARD_TYPES', {});
const POWER_EFFECT_TAGS = () => readConst('POWER_EFFECT_TAGS', ['Damage', 'Control', 'Utility', 'Support']);
const POWER_DAMAGE_DICE = () => readConst('POWER_DAMAGE_DICE', ['1d6', '1d8', '1d10', '2d6']);
const POWER_DAMAGE_TYPES = () => readConst('POWER_DAMAGE_TYPES', ['Kinetic', 'Energy', 'Psychic', 'Elemental']);
const POWER_ON_SAVE_OPTIONS = () => readConst('POWER_ON_SAVE_OPTIONS', ['Half', 'Negates', 'Reduced']);
const POWER_SAVE_ABILITIES = () => readConst('POWER_SAVE_ABILITIES', ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const POWER_TARGET_SHAPES = () => readConst('POWER_TARGET_SHAPES', ['Melee', 'Ranged Single', 'Cone', 'Line', 'Area']);
const POWER_DURATIONS = () => readConst('POWER_DURATIONS', ['Instant', '1 Round', '1 Minute', 'Sustained']);
const POWER_USES = () => readConst('POWER_USES', ['At-will', 'Per Scene', 'Per Rest', 'Cooldown']);
const POWER_ACTION_TYPES = () => readConst('POWER_ACTION_TYPES', ['Action', 'Bonus', 'Reaction', 'Free']);
const POWER_INTENSITIES = () => readConst('POWER_INTENSITIES', ['Core', 'Surge', 'Overcharge']);
const POWER_RANGE_QUICK_VALUES = () => readConst('POWER_RANGE_QUICK_VALUES', ['Melee', '10 ft', '30 ft', '60 ft', '120 ft']);

const getMoveTypeConfig = readFn('getMoveTypeConfig', (k) => (k ? { label: k, description: '' } : null));
const getSubtypeConfig = readFn('getSubtypeConfig', (_moveType, subtype) => (subtype ? { label: subtype } : null));
const inferPowerSubtype = readFn('inferPowerSubtype', (_primary, power) => (power && power.subtype ? power.subtype : null));
const applyMoveTypeDefaults = readFn('applyMoveTypeDefaults', () => {});
const applySubtypeDefaults = readFn('applySubtypeDefaults', () => {});
const suggestSpCost = readFn('suggestSpCost', (intensity) => {
  const t = String(intensity || '').toLowerCase();
  if (t.includes('over')) return 6;
  if (t.includes('sur')) return 4;
  return 2;
});
const defaultDamageType = readFn('defaultDamageType', (_style) => POWER_DAMAGE_TYPES()[0]);
const suggestOnSaveBehavior = readFn('suggestOnSaveBehavior', (_effectTag) => POWER_ON_SAVE_OPTIONS()[0]);
const getCharacterPowerSettings = readFn('getCharacterPowerSettings', () => null);
const formatPowerRange = readFn('formatPowerRange', (compiled, _settings) => compiled.range || '—');

function rangeOptionsForShape(shape) {
  const s = String(shape || '');
  if (s === 'Melee') return ['Melee', '5 ft', '10 ft'];
  if (s.toLowerCase().includes('ranged')) return ['10 ft', '30 ft', '60 ft', '120 ft'];
  if (s === 'Cone') return ['10 ft', '15 ft', '30 ft', '60 ft'];
  if (s === 'Line') return ['30 ft', '60 ft', '120 ft'];
  if (s === 'Area') return ['10 ft', '20 ft', '30 ft'];
  return ['Melee', '10 ft', '30 ft', '60 ft'];
}

function normalizePower(power) {
  const p = deepClone(power || {});
  if (!p.id) p.id = uid();
  if (!p.name) p.name = '';
  if (!p.description) p.description = '';
  if (!p.special) p.special = '';
  if (!p.moveType) p.moveType = null;
  if (!p.subtype) p.subtype = null;
  if (!p.style) p.style = '';
  if (!p.actionType) p.actionType = POWER_ACTION_TYPES()[0];
  if (!p.intensity) p.intensity = POWER_INTENSITIES()[0];
  if (!Number.isFinite(Number(p.spCost))) p.spCost = suggestSpCost(p.intensity);
  if (!p.effectTag) p.effectTag = POWER_EFFECT_TAGS()[0];
  if (!p.shape) p.shape = POWER_TARGET_SHAPES()[0];
  if (!p.range) {
    const opts = rangeOptionsForShape(p.shape);
    p.range = opts[0] || 'Melee';
  }
  if (!p.duration) p.duration = POWER_DURATIONS()[0];
  if (!p.uses) p.uses = POWER_USES()[0];
  if (!Number.isFinite(Number(p.cooldown))) p.cooldown = 0;
  if (typeof p.concentration !== 'boolean') p.concentration = false;
  if (typeof p.requiresSave !== 'boolean') p.requiresSave = false;
  if (!p.saveAbilityTarget) p.saveAbilityTarget = POWER_SAVE_ABILITIES()[0];
  if (typeof p.signature !== 'boolean') p.signature = !!p.signature;
  if (p.damage && typeof p.damage === 'object') {
    if (!p.damage.dice) p.damage.dice = POWER_DAMAGE_DICE()[0];
    if (!p.damage.type) p.damage.type = defaultDamageType(p.style) || POWER_DAMAGE_TYPES()[0];
    if (!p.damage.onSave) p.damage.onSave = suggestOnSaveBehavior(p.effectTag);
  }
  if (typeof p.damageOptIn !== 'boolean') p.damageOptIn = !!p.damage;
  return p;
}

function compileDraft(draft) {
  const settings = getCharacterPowerSettings();
  const d = draft || {};
  const compiled = {
    id: d.id || uid(),
    name: safeText(d.name).trim(),
    description: safeText(d.description),
    special: safeText(d.special),
    moveType: d.moveType || null,
    subtype: d.subtype || null,
    style: d.style || '',
    actionType: d.actionType || POWER_ACTION_TYPES()[0],
    intensity: d.intensity || POWER_INTENSITIES()[0],
    spCost: Math.max(1, Math.floor(Number(d.spCost) || suggestSpCost(d.intensity || 'Core'))),
    shape: d.shape || POWER_TARGET_SHAPES()[0],
    range: d.range || 'Melee',
    duration: d.duration || POWER_DURATIONS()[0],
    concentration: !!d.concentration,
    uses: d.uses || POWER_USES()[0],
    cooldown: Math.max(0, Math.floor(Number(d.cooldown) || 0)),
    effectTag: d.effectTag || POWER_EFFECT_TAGS()[0],
    secondaryTag: d.secondaryTag || undefined,
    requiresSave: !!d.requiresSave,
    saveAbilityTarget: d.saveAbilityTarget || POWER_SAVE_ABILITIES()[0],
    damage: null,
    signature: d.signature === true,
  };
  const subtypeCfg = getSubtypeConfig(compiled.moveType, compiled.subtype);
  const showDamage = !!subtypeCfg && !!subtypeCfg.showDamage;
  const wantsDamage = showDamage && d.damageOptIn !== false;
  if (wantsDamage) {
    const diceList = POWER_DAMAGE_DICE();
    const typeList = POWER_DAMAGE_TYPES();
    const onSaveList = POWER_ON_SAVE_OPTIONS();
    const dice = d.damage?.dice && diceList.includes(d.damage.dice) ? d.damage.dice : diceList[0];
    const type = d.damage?.type && typeList.includes(d.damage.type)
      ? d.damage.type
      : (defaultDamageType(compiled.style) || typeList[0]);
    const onSave = d.damage?.onSave && onSaveList.includes(d.damage.onSave)
      ? d.damage.onSave
      : suggestOnSaveBehavior(compiled.effectTag);
    compiled.damage = { dice, type, onSave };
  }
  compiled._rangeDisplay = formatPowerRange(compiled, settings) || compiled.range;
  return compiled;
}

function isValid(draft) {
  const d = draft || {};
  const issues = [];
  if (!d.name || !String(d.name).trim()) issues.push('Add a power name.');
  if (!d.moveType || !d.subtype) issues.push('Select a primary type and secondary focus.');
  if (!d.effectTag) issues.push('Choose a primary effect.');
  if (!d.shape || !d.range) issues.push('Confirm target shape and range.');
  const subtypeCfg = getSubtypeConfig(d.moveType, d.subtype);
  const showDamage = !!subtypeCfg && !!subtypeCfg.showDamage;
  if (showDamage && d.damageOptIn !== false) {
    const diceList = POWER_DAMAGE_DICE();
    const typeList = POWER_DAMAGE_TYPES();
    if (!d.damage || !diceList.includes(d.damage.dice) || !typeList.includes(d.damage.type)) {
      issues.push('Complete the damage package or turn it off.');
    }
  }
  if (subtypeCfg?.allowSave && d.requiresSave) {
    const allowed = POWER_SAVE_ABILITIES();
    if (!allowed.includes(d.saveAbilityTarget)) issues.push('Choose a valid saving throw ability.');
  }
  return { ok: issues.length === 0, issues };
}
function buildModalOnce() {
  if (wizardState.els && wizardState.els.overlay) return wizardState.els;

  const overlay = document.createElement('div');
  overlay.className = 'power-wizard__overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.hidden = true;
  overlay.style.pointerEvents = 'none';

  const modal = document.createElement('section');
  modal.className = 'power-wizard__modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Power wizard');
  modal.tabIndex = -1;

  modal.innerHTML = `
    <header class="power-wizard__header">
      <div class="power-wizard__header-left">
        <div class="power-wizard__title">Power Wizard</div>
        <div class="power-wizard__subtitle" data-pw-subtitle></div>
      </div>

      <div class="power-wizard__header-right">
        <button type="button" class="btn-sm power-wizard__ghost" data-pw-duplicate>Duplicate</button>
        <button type="button" class="btn-sm power-wizard__ghost" data-pw-revert>Revert</button>
        <button type="button" class="btn-sm power-wizard__close" data-pw-close aria-label="Close wizard">Close</button>
      </div>
    </header>

    <div class="power-wizard__progress" aria-label="Wizard progress">
      <div class="power-wizard__steps" data-pw-steps></div>
    </div>

    <div class="power-wizard__body">
      <div class="power-wizard__grid">
        <div class="power-wizard__panel power-wizard__panel--form">
          <div class="power-wizard__scroll" data-pw-content></div>
          <div class="power-wizard__nav" data-pw-nav>
            <button type="button" class="btn-sm" data-pw-back>Back</button>
            <div class="power-wizard__nav-spacer"></div>
            <button type="button" class="btn-sm power-wizard__ghost" data-pw-startover>Start over</button>
            <button type="button" class="btn-sm btn-primary" data-pw-next>Next</button>
          </div>
        </div>

        <aside class="power-wizard__panel power-wizard__panel--preview" aria-label="Live preview">
          <div class="power-wizard__preview-header">
            <div class="power-wizard__preview-title">Live Preview</div>
            <button type="button" class="btn-sm power-wizard__ghost power-wizard__preview-toggle" data-pw-preview-toggle aria-expanded="true">Collapse</button>
          </div>
          <div class="power-wizard__preview" data-pw-preview></div>
        </aside>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const els = {
    overlay,
    modal,
    subtitle: $('[data-pw-subtitle]', modal),
    steps: $('[data-pw-steps]', modal),
    content: $('[data-pw-content]', modal),
    preview: $('[data-pw-preview]', modal),
    previewToggle: $('[data-pw-preview-toggle]', modal),
    btnClose: $('[data-pw-close]', modal),
    btnBack: $('[data-pw-back]', modal),
    btnNext: $('[data-pw-next]', modal),
    btnStartOver: $('[data-pw-startover]', modal),
    btnDuplicate: $('[data-pw-duplicate]', modal),
    btnRevert: $('[data-pw-revert]', modal),
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) requestClose();
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key === 'Tab') trapFocus(e, modal);
  });

  els.btnClose.addEventListener('click', () => requestClose());
  els.btnBack.addEventListener('click', () => goStep(wizardState.step - 1));
  els.btnNext.addEventListener('click', () => handleNext());
  els.btnStartOver.addEventListener('click', () => startOver());
  els.btnDuplicate.addEventListener('click', () => duplicateDraft());
  els.btnRevert.addEventListener('click', () => revertDraft());

  els.previewToggle.addEventListener('click', () => {
    const collapsed = modal.classList.toggle('power-wizard--preview-collapsed');
    els.previewToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    els.previewToggle.textContent = collapsed ? 'Expand' : 'Collapse';
  });

  wizardState.els = els;
  return els;
}

function setOverlayInteractive(on) {
  const els = wizardState.els;
  if (!els?.overlay) return;
  els.overlay.style.pointerEvents = on ? 'auto' : 'none';
  try {
    els.overlay.inert = !on;
  } catch (_) {}
}

function destroyOverlay() {
  const els = wizardState.els;
  if (!els?.overlay) return;
  try {
    els.overlay.hidden = true;
    els.overlay.style.display = 'none';
    setOverlayInteractive(false);
    els.overlay.remove();
  } catch (_) {}
  wizardState.els = null;
}

function trapFocus(event, modal) {
  const focusable = $all(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    modal
  ).filter((el) => !el.disabled && !el.hidden && el.getAttribute('aria-hidden') !== 'true');

  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || active === modal) {
      event.preventDefault();
      last.focus();
    }
  } else {
    if (active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function setSubtitle() {
  const els = wizardState.els;
  if (!els) return;
  const modeLabel = wizardState.mode === 'edit' ? 'Editing existing power' : 'Creating new power';
  const stepLabel = STEPS[wizardState.step]?.label || '';
  els.subtitle.textContent = `${modeLabel} • ${stepLabel}`;
}

function renderSteps() {
  const els = wizardState.els;
  if (!els) return;
  els.steps.innerHTML = '';
  STEPS.forEach((s, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'power-wizard__step';
    b.setAttribute('aria-current', idx === wizardState.step ? 'step' : 'false');
    b.innerHTML = `
      <span class="power-wizard__step-dot" aria-hidden="true"></span>
      <span class="power-wizard__step-label">${escapeHtml(s.label)}</span>
    `;
    b.addEventListener('click', () => {
      if (idx <= wizardState.step) goStep(idx);
    });
    els.steps.appendChild(b);
  });
}

function preflightCleanup() {
  // If anything went wrong previously, do not allow a stale overlay to block the app.
  try { document.documentElement.classList.remove('power-wizard-open'); } catch (_) {}
  try {
    document.querySelectorAll('.power-wizard__overlay').forEach((ov) => {
      try {
        ov.hidden = true;
        ov.style.display = 'none';
        ov.style.pointerEvents = 'none';
        try { ov.inert = true; } catch (_) {}
      } catch (_) {}
      try { ov.remove(); } catch (_) {}
    });
  } catch (_) {}
  // Also reset internal refs if DOM was out of sync.
  wizardState.els = null;
  wizardState.isOpen = false;
}

function openOverlay() {
  preflightCleanup();
  const els = buildModalOnce();
  wizardState.lastFocus = document.activeElement;
  els.overlay.hidden = false;
  setOverlayInteractive(true);
  document.documentElement.classList.add('power-wizard-open');
  wizardState.isOpen = true;

  renderSteps();
  setSubtitle();
  render();
  requestAnimationFrame(() => {
    els.modal.focus();
    const first = $('input, select, textarea, button', els.content) || els.btnNext;
    if (first) first.focus();
  });
}

function closeOverlay() {
  try {
    document.documentElement.classList.remove('power-wizard-open');
  } catch (_) {}
  wizardState.isOpen = false;

  destroyOverlay();

  try {
    if (wizardState.lastFocus && typeof wizardState.lastFocus.focus === 'function') {
      wizardState.lastFocus.focus();
    }
  } catch (_) {}
}

function hardCleanup() {
  try {
    document.documentElement.classList.remove('power-wizard-open');
  } catch (_) {}
  destroyOverlay();
  wizardState.isOpen = false;
}

function isDirty() {
  if (!wizardState.originalPowerSnapshot) return true;
  try {
    return JSON.stringify(wizardState.originalPowerSnapshot) !== JSON.stringify(wizardState.draft);
  } catch (_) {
    return true;
  }
}

function requestClose() {
  const dirty = isDirty();
  const onCancel = wizardState.options?.onCancel;
  if (dirty) {
    const ok = confirm('Discard changes to this power?');
    if (!ok) return;
  }
  try {
    if (typeof onCancel === 'function') onCancel({ dirty, draftPower: deepClone(wizardState.draft) });
  } catch (_) {}
  try {
    closeOverlay();
  } catch (_) {
    hardCleanup();
  }
}

function startOver() {
  if (wizardState.mode !== 'create') {
    const ok = confirm('Start over will switch you to create mode. Continue?');
    if (!ok) return;
  }
  wizardState.mode = 'create';
  wizardState.selectedPowerId = null;
  wizardState.originalPowerSnapshot = null;
  wizardState.draft = normalizePower({ id: uid(), signature: wizardState.draft?.signature });
  wizardState.step = 0;
  setSubtitle();
  renderSteps();
  render();
}

function revertDraft() {
  if (wizardState.mode !== 'edit') return;
  if (!wizardState.originalPowerSnapshot) return;
  const ok = confirm('Revert changes to the last saved version?');
  if (!ok) return;
  wizardState.draft = normalizePower(deepClone(wizardState.originalPowerSnapshot));
  setSubtitle();
  render();
}

function duplicateDraft() {
  const d = deepClone(wizardState.draft || {});
  d.id = uid();
  d.name = d.name ? `${d.name} (Copy)` : 'New Power (Copy)';
  wizardState.mode = 'create';
  wizardState.originalPowerSnapshot = null;
  wizardState.selectedPowerId = null;
  wizardState.draft = normalizePower(d);
  wizardState.step = 1;
  setSubtitle();
  renderSteps();
  render();
}

function goStep(idx) {
  wizardState.step = clamp(idx, 0, STEPS.length - 1);
  setSubtitle();
  renderSteps();
  render();
}

function handleNext() {
  if (wizardState.step < STEPS.length - 1) {
    goStep(wizardState.step + 1);
    return;
  }

  const v = isValid(wizardState.draft);
  if (!v.ok) {
    renderReview(true);
    return;
  }

  saveDraft();
}

function saveDraft() {
  const compiled = compileDraft(wizardState.draft);
  const onSave = wizardState.options?.onSave;
  const onPowersUpdated = wizardState.options?.onPowersUpdated;

  let nextPowers = Array.isArray(wizardState.powers) ? deepClone(wizardState.powers) : [];
  if (!compiled.id) compiled.id = uid();

  if (wizardState.mode === 'edit') {
    const idxById = nextPowers.findIndex((p) => p && p.id && p.id === compiled.id);
    if (idxById >= 0) {
      nextPowers[idxById] = compiled;
    } else if (wizardState.selectedPowerId) {
      const idxSel = nextPowers.findIndex((p) => p && p.id === wizardState.selectedPowerId);
      if (idxSel >= 0) nextPowers[idxSel] = compiled;
      else nextPowers.push(compiled);
    } else {
      const idxName = nextPowers.findIndex((p) => p && p.name && p.name === compiled.name);
      if (idxName >= 0) nextPowers[idxName] = compiled;
      else nextPowers.push(compiled);
    }
  } else {
    if (nextPowers.some((p) => p && p.id === compiled.id)) compiled.id = uid();
    nextPowers.push(compiled);
  }

  try {
    if (typeof onPowersUpdated === 'function') onPowersUpdated(nextPowers);
  } catch (_) {}

  try {
    if (typeof onSave === 'function') onSave(compiled, { mode: wizardState.mode });
  } catch (_) {}

  wizardState.originalPowerSnapshot = deepClone(compiled);
  closeOverlay();
}
function fieldRow(label, controlEl, helperText) {
  const wrap = document.createElement('div');
  wrap.className = 'power-wizard__field';
  const lab = document.createElement('label');
  lab.className = 'power-wizard__label';
  lab.textContent = label;
  const body = document.createElement('div');
  body.className = 'power-wizard__control';
  body.appendChild(controlEl);
  wrap.append(lab, body);
  if (helperText) {
    const help = document.createElement('div');
    help.className = 'power-wizard__helper';
    help.textContent = helperText;
    wrap.appendChild(help);
  }
  return wrap;
}

function makeInput(type, value, placeholder) {
  const i = document.createElement('input');
  i.type = type;
  if (value != null) i.value = value;
  if (placeholder) i.placeholder = placeholder;
  i.className = 'power-wizard__input';
  return i;
}

function makeTextArea(value, placeholder, rows = 4) {
  const t = document.createElement('textarea');
  t.rows = rows;
  t.value = value || '';
  if (placeholder) t.placeholder = placeholder;
  t.className = 'power-wizard__textarea';
  return t;
}

function makeSelect(options, value, { includeEmpty = false, emptyLabel = 'Select…', format = (x) => x } = {}) {
  const s = document.createElement('select');
  s.className = 'power-wizard__select';
  if (includeEmpty) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = emptyLabel;
    s.appendChild(opt);
  }
  (options || []).forEach((k) => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = format(k);
    s.appendChild(opt);
  });
  s.value = value || '';
  return s;
}

function makeToggle(checked, label) {
  const wrap = document.createElement('label');
  wrap.className = 'power-wizard__toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!checked;
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(cb, span);
  return { wrap, cb };
}

function setNavLabels() {
  const els = wizardState.els;
  if (!els) return;
  els.btnBack.hidden = wizardState.step === 0;
  els.btnStartOver.hidden = wizardState.mode !== 'create';

  if (wizardState.step < STEPS.length - 1) {
    els.btnNext.textContent = wizardState.step === 0 ? 'Continue' : 'Next';
  } else {
    els.btnNext.textContent = wizardState.mode === 'edit' ? 'Update Power' : 'Create Power';
  }
}

function renderPreview() {
  const els = wizardState.els;
  if (!els) return;
  const compiled = compileDraft(wizardState.draft);
  const subtypeCfg = getSubtypeConfig(compiled.moveType, compiled.subtype) || {};

  els.preview.innerHTML = `
    <div class="pw-card">
      <div class="pw-card__name">${escapeHtml(compiled.name || 'Unnamed Power')}</div>

      <div class="pw-card__meta">
        <span class="pw-chip">${escapeHtml(compiled.actionType || 'Action')}</span>
        <span class="pw-chip">${escapeHtml(compiled.intensity || 'Core')}</span>
        <span class="pw-chip">${escapeHtml(compiled.spCost ? `${compiled.spCost} SP` : 'SP')}</span>
      </div>

      <div class="pw-card__row">
        <div><strong>Type</strong>: ${escapeHtml(getMoveTypeConfig(compiled.moveType)?.label || compiled.moveType || '—')}</div>
        <div><strong>Focus</strong>: ${escapeHtml(subtypeCfg.label || compiled.subtype || '—')}</div>
      </div>

      <div class="pw-card__row">
        <div><strong>Target</strong>: ${escapeHtml(compiled.shape || '—')}</div>
        <div><strong>Range</strong>: ${escapeHtml(compiled._rangeDisplay || compiled.range || '—')}</div>
      </div>

      <div class="pw-card__row">
        <div><strong>Duration</strong>: ${escapeHtml(compiled.duration || '—')}</div>
        <div><strong>Conc.</strong>: ${compiled.concentration ? 'Yes' : 'No'}</div>
      </div>

      <div class="pw-card__row">
        <div><strong>Effect</strong>: ${escapeHtml(compiled.effectTag || '—')}</div>
        <div><strong>Secondary</strong>: ${escapeHtml(compiled.secondaryTag || '—')}</div>
      </div>

      ${compiled.requiresSave ? `<div class="pw-card__row"><div><strong>Save</strong>: ${escapeHtml(compiled.saveAbilityTarget || '—')}</div><div></div></div>` : ''}

      ${compiled.damage ? `<div class="pw-card__damage"><strong>Damage</strong>: ${escapeHtml(compiled.damage.dice)} ${escapeHtml(compiled.damage.type)}${compiled.requiresSave && compiled.damage.onSave ? ` (${escapeHtml(compiled.damage.onSave)} on save)` : ''}</div>` : ''}

      <div class="pw-card__desc">${escapeHtml(compiled.description || 'Add a cinematic description so your table sees it in their heads.')}</div>

      ${compiled.special ? `<div class="pw-card__special"><strong>Special</strong>: ${escapeHtml(compiled.special)}</div>` : ''}
    </div>
  `;
}

function render() {
  const els = wizardState.els;
  if (!els) return;
  els.content.innerHTML = '';
  els.content.scrollTop = 0;

  setNavLabels();
  setSubtitle();
  renderSteps();
  renderPreview();

  const key = STEPS[wizardState.step].key;
  if (key === 'pick') renderPick();
  if (key === 'identity') renderIdentity();
  if (key === 'shape') renderShape();
  if (key === 'effects') renderEffects();
  if (key === 'review') renderReview(false);

  els.btnRevert.hidden = wizardState.mode !== 'edit';
  els.btnDuplicate.hidden = false;

  if (key === 'review') {
    const v = isValid(wizardState.draft);
    els.btnNext.disabled = !v.ok;
    if (els.btnNext.disabled) els.btnNext.setAttribute('aria-disabled', 'true');
    else els.btnNext.removeAttribute('aria-disabled');
  } else {
    els.btnNext.disabled = false;
    els.btnNext.removeAttribute('aria-disabled');
  }
}

function renderPick() {
  const els = wizardState.els;
  if (!els) return;

  const wrap = document.createElement('div');
  wrap.className = 'power-wizard__step-wrap';

  const h = document.createElement('h3');
  h.className = 'power-wizard__h';
  h.textContent = 'Pick an existing power or build a new one';

  const p = document.createElement('p');
  p.className = 'power-wizard__p';
  p.textContent = 'Search your powers, edit one in place, or start from scratch. Editing updates the existing entry without duplicating it.';

  const actions = document.createElement('div');
  actions.className = 'power-wizard__row';

  const btnNew = document.createElement('button');
  btnNew.type = 'button';
  btnNew.className = 'btn-sm btn-primary';
  btnNew.textContent = 'Create new power';
  btnNew.addEventListener('click', () => {
    wizardState.mode = 'create';
    wizardState.selectedPowerId = null;
    wizardState.originalPowerSnapshot = null;
    wizardState.draft = normalizePower({ id: uid(), signature: wizardState.draft?.signature });
    goStep(1);
  });

  const btnQuickDup = document.createElement('button');
  btnQuickDup.type = 'button';
  btnQuickDup.className = 'btn-sm power-wizard__ghost';
  btnQuickDup.textContent = 'Duplicate selected';
  btnQuickDup.disabled = !wizardState.selectedPowerId;
  btnQuickDup.addEventListener('click', () => {
    if (!wizardState.selectedPowerId) return;
    const found = wizardState.powers.find((pp) => pp && pp.id === wizardState.selectedPowerId);
    if (!found) return;
    wizardState.draft = normalizePower(deepClone(found));
    duplicateDraft();
  });

  actions.append(btnNew, btnQuickDup);

  const searchRow = document.createElement('div');
  searchRow.className = 'power-wizard__row';

  const search = makeInput('text', '', 'Search powers by name, type, or effect…');
  search.classList.add('power-wizard__search');
  searchRow.appendChild(search);

  const list = document.createElement('div');
  list.className = 'power-wizard__list';
  const empty = document.createElement('div');
  empty.className = 'power-wizard__empty';
  empty.textContent = 'No powers found. Use “Create new power” to start.';
  empty.hidden = true;

  function renderList(filter = '') {
    list.innerHTML = '';
    const norm = String(filter || '').trim().toLowerCase();
    const items = (wizardState.powers || []).filter((pp) => {
      if (!norm) return true;
      const text = `${pp?.name || ''} ${pp?.moveType || ''} ${pp?.subtype || ''} ${pp?.effectTag || ''}`.toLowerCase();
      return text.includes(norm);
    });

    empty.hidden = items.length > 0;

    items.forEach((pp) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'power-wizard__list-item';
      card.dataset.id = pp.id;
      card.setAttribute('aria-pressed', pp.id === wizardState.selectedPowerId ? 'true' : 'false');

      const title = document.createElement('div');
      title.className = 'power-wizard__list-title';
      title.textContent = pp.name || '(Unnamed power)';

      const meta = document.createElement('div');
      meta.className = 'power-wizard__list-meta';
      const typeLabel = getMoveTypeConfig(pp.moveType)?.label || pp.moveType || '—';
      const subtypeLabel = getSubtypeConfig(pp.moveType, pp.subtype)?.label || pp.subtype || '—';
      meta.textContent = `${typeLabel} • ${subtypeLabel} • ${pp.effectTag || '—'}`;

      const pillRow = document.createElement('div');
      pillRow.className = 'power-wizard__pill-row';
      pillRow.innerHTML = `
        <span class="pw-pill">${escapeHtml(pp.actionType || 'Action')}</span>
        <span class="pw-pill">${escapeHtml(pp.intensity || 'Core')}</span>
        <span class="pw-pill">${escapeHtml(pp.spCost ? `${pp.spCost} SP` : 'SP')}</span>
      `;

      const controls = document.createElement('div');
      controls.className = 'power-wizard__list-controls';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn-sm';
      edit.textContent = 'Edit';
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        wizardState.mode = 'edit';
        wizardState.selectedPowerId = pp.id;
        wizardState.originalPowerSnapshot = deepClone(pp);
        wizardState.draft = normalizePower(deepClone(pp));
        goStep(1);
      });

      const dup = document.createElement('button');
      dup.type = 'button';
      dup.className = 'btn-sm power-wizard__ghost';
      dup.textContent = 'Duplicate';
      dup.addEventListener('click', (e) => {
        e.stopPropagation();
        wizardState.selectedPowerId = pp.id;
        wizardState.draft = normalizePower(deepClone(pp));
        duplicateDraft();
      });

      controls.append(edit, dup);

      card.append(title, meta, pillRow, controls);
      card.addEventListener('click', () => {
        wizardState.selectedPowerId = pp.id;
        btnQuickDup.disabled = false;
        renderList(search.value);
      });

      list.appendChild(card);
    });
  }

  search.addEventListener('input', () => renderList(search.value));
  renderList('');

  wrap.append(h, p, actions, searchRow, list, empty);
  els.content.appendChild(wrap);
}
function renderIdentity() {
  const els = wizardState.els;
  if (!els) return;

  const wrap = document.createElement('div');
  wrap.className = 'power-wizard__step-wrap';

  const h = document.createElement('h3');
  h.className = 'power-wizard__h';
  h.textContent = 'Define the power’s identity';

  const p = document.createElement('p');
  p.className = 'power-wizard__p';
  p.textContent = 'Lock the concept first: name, power type, and what everyone should picture. Mechanics come next.';

  const grid = document.createElement('div');
  grid.className = 'power-wizard__form-grid';

  const nameInput = makeInput('text', wizardState.draft.name || '', 'Power name');
  nameInput.addEventListener('input', () => {
    wizardState.draft.name = nameInput.value;
    renderPreview();
  });
  grid.appendChild(fieldRow('Power Name', nameInput, 'Short and punchy. What do players call it at the table?'));

  const types = POWER_WIZARD_TYPES();
  const primaryKeys = Object.keys(types || {});
  const primarySelect = makeSelect(primaryKeys, wizardState.draft.moveType || '', {
    includeEmpty: true,
    emptyLabel: 'Select a primary type…',
    format: (k) => types?.[k]?.label || k,
  });

  const primaryHelper = document.createElement('div');
  primaryHelper.className = 'power-wizard__inline-helper';

  const secondarySelect = document.createElement('select');
  secondarySelect.className = 'power-wizard__select';

  const secondaryHelper = document.createElement('div');
  secondaryHelper.className = 'power-wizard__inline-helper';

  function refreshSecondary() {
    const moveType = primarySelect.value;
    secondarySelect.innerHTML = '';
    if (!moveType || !types?.[moveType]) {
      secondarySelect.disabled = true;
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Select a primary type first';
      secondarySelect.appendChild(opt);
      wizardState.draft.moveType = moveType || null;
      wizardState.draft.subtype = null;
      primaryHelper.textContent = moveType ? (types?.[moveType]?.description || '') : 'Pick a primary power type to continue.';
      secondaryHelper.textContent = 'Choose a primary type first.';
      renderPreview();
      return;
    }

    const subtypeEntries = Object.entries(types[moveType].subtypes || {});
    if (!subtypeEntries.length) {
      secondarySelect.disabled = true;
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No secondary options available';
      secondarySelect.appendChild(opt);
      wizardState.draft.moveType = moveType;
      wizardState.draft.subtype = null;
      primaryHelper.textContent = types?.[moveType]?.description || '';
      secondaryHelper.textContent = 'This type has no secondary options configured.';
      renderPreview();
      return;
    }

    secondarySelect.disabled = false;
    subtypeEntries.forEach(([value, cfg]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = cfg?.label || value;
      secondarySelect.appendChild(opt);
    });

    const wanted =
      subtypeEntries.some(([k]) => k === wizardState.draft.subtype)
        ? wizardState.draft.subtype
        : inferPowerSubtype(moveType, wizardState.draft);

    const finalPick = subtypeEntries.some(([k]) => k === wanted) ? wanted : subtypeEntries[0][0];
    secondarySelect.value = finalPick;

    wizardState.draft.moveType = moveType;
    wizardState.draft.subtype = finalPick;

    try { applyMoveTypeDefaults(moveType); } catch (_) {}
    try { applySubtypeDefaults(moveType, finalPick); } catch (_) {}

    const moveCfg = getMoveTypeConfig(moveType);
    const subCfg = getSubtypeConfig(moveType, finalPick);
    primaryHelper.textContent = moveCfg?.description || types?.[moveType]?.description || '';
    secondaryHelper.textContent = subCfg?.description || (types?.[moveType]?.subtypes?.[finalPick]?.description || '');
    renderPreview();
  }

  primarySelect.addEventListener('change', () => {
    const moveType = primarySelect.value;
    if (moveType) {
      wizardState.draft.moveType = moveType;
      wizardState.draft.subtype = inferPowerSubtype(moveType, wizardState.draft);
    } else {
      wizardState.draft.moveType = null;
      wizardState.draft.subtype = null;
    }
    refreshSecondary();
  });

  secondarySelect.addEventListener('change', () => {
    const subtype = secondarySelect.value;
    wizardState.draft.subtype = subtype || null;
    if (wizardState.draft.moveType && wizardState.draft.subtype) {
      try { applySubtypeDefaults(wizardState.draft.moveType, wizardState.draft.subtype); } catch (_) {}
    }
    refreshSecondary();
  });

  const typeBlock = document.createElement('div');
  typeBlock.className = 'power-wizard__block';
  typeBlock.append(
    fieldRow('Primary Type', primarySelect, ''),
    primaryHelper,
    fieldRow('Secondary Focus', secondarySelect, ''),
    secondaryHelper
  );
  grid.appendChild(typeBlock);

  const actionSelect = makeSelect(POWER_ACTION_TYPES(), wizardState.draft.actionType || POWER_ACTION_TYPES()[0]);
  actionSelect.addEventListener('change', () => {
    wizardState.draft.actionType = actionSelect.value;
    renderPreview();
  });

  const intensitySelect = makeSelect(POWER_INTENSITIES(), wizardState.draft.intensity || POWER_INTENSITIES()[0]);
  intensitySelect.addEventListener('change', () => {
    wizardState.draft.intensity = intensitySelect.value;
    const cur = Number(wizardState.draft.spCost);
    if (!Number.isFinite(cur) || cur <= 0) {
      wizardState.draft.spCost = suggestSpCost(wizardState.draft.intensity);
      spInput.value = wizardState.draft.spCost;
    }
    renderPreview();
  });

  const spInput = makeInput('number', String(Math.max(1, Number(wizardState.draft.spCost) || suggestSpCost(wizardState.draft.intensity))), '');
  spInput.min = '1';
  spInput.addEventListener('input', () => {
    const v = Math.max(1, Math.floor(Number(spInput.value) || 1));
    spInput.value = String(v);
    wizardState.draft.spCost = v;
    renderPreview();
  });

  grid.appendChild(fieldRow('Action Economy', actionSelect, 'How much action budget it costs to use.'));
  grid.appendChild(fieldRow('Intensity', intensitySelect, 'Sets the general tier and helps suggest SP cost.'));
  grid.appendChild(fieldRow('SP Cost', spInput, 'Resource cost. You can override the suggestion.'));

  const styleInput = makeInput('text', wizardState.draft.style || '', 'Optional style tag (e.g. Tech, Magic, Brutal)');
  styleInput.addEventListener('input', () => {
    wizardState.draft.style = styleInput.value;
    renderPreview();
  });
  grid.appendChild(fieldRow('Style (optional)', styleInput, 'Used for cosmetic type hints or damage defaults if enabled.'));

  const desc = makeTextArea(wizardState.draft.description || '', 'What does it look/sound/feel like?', 5);
  desc.addEventListener('input', () => {
    wizardState.draft.description = desc.value;
    renderPreview();
  });

  const spec = makeTextArea(wizardState.draft.special || '', 'Optional riders, notes, or reminders.', 3);
  spec.addEventListener('input', () => {
    wizardState.draft.special = spec.value;
    renderPreview();
  });

  grid.appendChild(fieldRow('Description', desc, 'This is the cinematic description shown on the power card.'));
  grid.appendChild(fieldRow('Special Notes (optional)', spec, 'Extra guidance, limits, or narrative riders.'));

  wrap.append(h, p, grid);
  els.content.appendChild(wrap);

  refreshSecondary();
}
function renderShape() {
  const els = wizardState.els;
  if (!els) return;

  const wrap = document.createElement('div');
  wrap.className = 'power-wizard__step-wrap';

  const h = document.createElement('h3');
  h.className = 'power-wizard__h';
  h.textContent = 'Define how it plays';

  const p = document.createElement('p');
  p.className = 'power-wizard__p';
  p.textContent = 'Choose targeting and timing. Keep it table-friendly: simple inputs, clear outputs.';

  const grid = document.createElement('div');
  grid.className = 'power-wizard__form-grid';

  const shapeSelect = makeSelect(POWER_TARGET_SHAPES(), wizardState.draft.shape || POWER_TARGET_SHAPES()[0]);
  const rangeSelect = document.createElement('select');
  rangeSelect.className = 'power-wizard__select';

  const quick = document.createElement('div');
  quick.className = 'power-wizard__quick';

  function refreshRange() {
    const opts = rangeOptionsForShape(shapeSelect.value);
    rangeSelect.innerHTML = '';
    opts.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      rangeSelect.appendChild(opt);
    });

    const current = wizardState.draft.range;
    const final = opts.includes(current) ? current : opts[0];
    wizardState.draft.shape = shapeSelect.value;
    wizardState.draft.range = final;
    rangeSelect.value = final;

    quick.innerHTML = '';
    const quickValues = POWER_RANGE_QUICK_VALUES();
    quickValues.forEach((val) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'power-wizard__pill';
      b.textContent = val;
      const active = val === wizardState.draft.range;
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      b.classList.toggle('is-active', active);
      b.addEventListener('click', () => {
        wizardState.draft.range = val;
        if ($all('option', rangeSelect).some((o) => o.value === val)) {
          rangeSelect.value = val;
        }
        refreshRange();
        renderPreview();
      });
      quick.appendChild(b);
    });

    renderPreview();
  }

  shapeSelect.addEventListener('change', () => {
    wizardState.draft.shape = shapeSelect.value;
    refreshRange();
  });

  rangeSelect.addEventListener('change', () => {
    wizardState.draft.range = rangeSelect.value;
    refreshRange();
    renderPreview();
  });

  grid.appendChild(fieldRow('Target Shape', shapeSelect, 'How the power targets (melee, single target, cone, etc.).'));

  const rangeBlock = document.createElement('div');
  rangeBlock.className = 'power-wizard__block';
  rangeBlock.append(fieldRow('Range', rangeSelect, 'Select a range appropriate to the target shape.'), quick);
  grid.appendChild(rangeBlock);

  const durationSelect = makeSelect(POWER_DURATIONS(), wizardState.draft.duration || POWER_DURATIONS()[0]);
  durationSelect.addEventListener('change', () => {
    wizardState.draft.duration = durationSelect.value;
    renderPreview();
  });

  const conc = makeToggle(!!wizardState.draft.concentration, 'Requires Concentration');
  conc.cb.addEventListener('change', () => {
    wizardState.draft.concentration = conc.cb.checked;
    renderPreview();
  });

  grid.appendChild(fieldRow('Duration', durationSelect, 'How long the effect lasts.'));
  grid.appendChild(fieldRow('Concentration', conc.wrap, 'If checked, the power needs focus to maintain.'));

  const usesSelect = makeSelect(POWER_USES(), wizardState.draft.uses || POWER_USES()[0]);
  const cooldownInput = makeInput('number', String(Math.max(0, Number(wizardState.draft.cooldown) || 0)), '');
  cooldownInput.min = '0';

  function syncCooldownVisibility() {
    const uses = usesSelect.value;
    wizardState.draft.uses = uses;
    const show = uses === 'Cooldown';
    cooldownInput.disabled = !show;
    cooldownInput.closest('.power-wizard__field')?.classList.toggle('is-hidden', !show);
  }

  usesSelect.addEventListener('change', () => {
    syncCooldownVisibility();
    renderPreview();
  });

  cooldownInput.addEventListener('input', () => {
    const v = Math.max(0, Math.floor(Number(cooldownInput.value) || 0));
    cooldownInput.value = String(v);
    wizardState.draft.cooldown = v;
    renderPreview();
  });

  grid.appendChild(fieldRow('Usage', usesSelect, 'How often it can be used.'));
  grid.appendChild(fieldRow('Cooldown (rounds)', cooldownInput, 'Only used when Usage is set to Cooldown.'));

  const subtypeCfg = getSubtypeConfig(wizardState.draft.moveType, wizardState.draft.subtype) || {};
  const allowSave = !!subtypeCfg.allowSave;

  const saveToggle = makeToggle(!!wizardState.draft.requiresSave, 'Requires a saving throw');
  const saveAbility = makeSelect(POWER_SAVE_ABILITIES(), wizardState.draft.saveAbilityTarget || POWER_SAVE_ABILITIES()[0]);

  function syncSaveVisibility() {
    const on = !!saveToggle.cb.checked;
    wizardState.draft.requiresSave = on;
    saveAbility.disabled = !on;
    saveAbility.closest('.power-wizard__field')?.classList.toggle('is-hidden', !on);
    renderPreview();
  }

  saveToggle.cb.addEventListener('change', () => syncSaveVisibility());
  saveAbility.addEventListener('change', () => {
    wizardState.draft.saveAbilityTarget = saveAbility.value;
    renderPreview();
  });

  if (allowSave) {
    grid.appendChild(fieldRow('Saving Throw', saveToggle.wrap, 'If checked, targets roll a save.'));
    grid.appendChild(fieldRow('Target Save Ability', saveAbility, 'Which ability is used for the saving throw.'));
  } else {
    wizardState.draft.requiresSave = false;
  }

  wrap.append(h, p, grid);
  els.content.appendChild(wrap);

  syncCooldownVisibility();
  syncSaveVisibility();
  refreshRange();
}
function renderEffects() {
  const els = wizardState.els;
  if (!els) return;

  const wrap = document.createElement('div');
  wrap.className = 'power-wizard__step-wrap';

  const h = document.createElement('h3');
  h.className = 'power-wizard__h';
  h.textContent = 'Effect and impact';

  const p = document.createElement('p');
  p.className = 'power-wizard__p';
  p.textContent = 'Choose what it generally does, then optionally configure damage (when enabled for this power focus).';

  const grid = document.createElement('div');
  grid.className = 'power-wizard__form-grid';

  const effectSelect = makeSelect(POWER_EFFECT_TAGS(), wizardState.draft.effectTag || POWER_EFFECT_TAGS()[0]);
  effectSelect.addEventListener('change', () => {
    wizardState.draft.effectTag = effectSelect.value;
    renderPreview();
  });

  const secondarySelect = makeSelect(POWER_EFFECT_TAGS(), wizardState.draft.secondaryTag || '', {
    includeEmpty: true,
    emptyLabel: 'None',
  });
  secondarySelect.addEventListener('change', () => {
    const v = secondarySelect.value;
    wizardState.draft.secondaryTag = v || undefined;
    renderPreview();
  });

  grid.appendChild(fieldRow('Primary Effect', effectSelect, 'Broad category: damage, control, support, etc.'));
  grid.appendChild(fieldRow('Secondary Effect (optional)', secondarySelect, 'If this power has a secondary rider category.'));

  const subtypeCfg = getSubtypeConfig(wizardState.draft.moveType, wizardState.draft.subtype) || {};
  const showDamage = !!subtypeCfg.showDamage;

  if (showDamage) {
    const damageBlock = document.createElement('div');
    damageBlock.className = 'power-wizard__block power-wizard__block--damage';

    const dmgToggle = makeToggle(wizardState.draft.damageOptIn !== false, 'Include damage package');
    dmgToggle.cb.addEventListener('change', () => {
      wizardState.draft.damageOptIn = dmgToggle.cb.checked;
      if (!wizardState.draft.damageOptIn) {
        wizardState.draft.damage = null;
      } else {
        if (!wizardState.draft.damage || typeof wizardState.draft.damage !== 'object') wizardState.draft.damage = {};
        if (!wizardState.draft.damage.dice) wizardState.draft.damage.dice = POWER_DAMAGE_DICE()[0];
        if (!wizardState.draft.damage.type) wizardState.draft.damage.type = defaultDamageType(wizardState.draft.style) || POWER_DAMAGE_TYPES()[0];
        if (!wizardState.draft.damage.onSave) wizardState.draft.damage.onSave = suggestOnSaveBehavior(wizardState.draft.effectTag);
      }
      syncDamageVisibility();
      renderPreview();
    });

    const diceSelect = makeSelect(POWER_DAMAGE_DICE(), wizardState.draft.damage?.dice || POWER_DAMAGE_DICE()[0]);
    diceSelect.addEventListener('change', () => {
      if (!wizardState.draft.damage || typeof wizardState.draft.damage !== 'object') wizardState.draft.damage = {};
      wizardState.draft.damage.dice = diceSelect.value;
      renderPreview();
    });

    const typeSelect = makeSelect(POWER_DAMAGE_TYPES(), wizardState.draft.damage?.type || (defaultDamageType(wizardState.draft.style) || POWER_DAMAGE_TYPES()[0]));
    typeSelect.addEventListener('change', () => {
      if (!wizardState.draft.damage || typeof wizardState.draft.damage !== 'object') wizardState.draft.damage = {};
      wizardState.draft.damage.type = typeSelect.value;
      renderPreview();
    });

    const onSaveSelect = makeSelect(POWER_ON_SAVE_OPTIONS(), wizardState.draft.damage?.onSave || suggestOnSaveBehavior(wizardState.draft.effectTag));
    onSaveSelect.addEventListener('change', () => {
      if (!wizardState.draft.damage || typeof wizardState.draft.damage !== 'object') wizardState.draft.damage = {};
      wizardState.draft.damage.onSave = onSaveSelect.value;
      renderPreview();
    });

    const onSaveHint = document.createElement('div');
    onSaveHint.className = 'power-wizard__hint';
    onSaveHint.textContent = '';

    const onSaveField = fieldRow('If target succeeds on save…', onSaveSelect, 'Only applies when a save is enabled and damage is included.');

    function syncDamageVisibility() {
      const enabled = wizardState.draft.damageOptIn !== false;
      diceSelect.disabled = !enabled;
      typeSelect.disabled = !enabled;

      const requiresSave = !!wizardState.draft.requiresSave;
      const showOnSave = enabled && requiresSave;
      onSaveSelect.disabled = !showOnSave;
      onSaveField.classList.toggle('is-hidden', !showOnSave);

      if (showOnSave) {
        const suggestion = suggestOnSaveBehavior(wizardState.draft.effectTag);
        onSaveHint.textContent = `Suggested: ${suggestion}`;
        if (!wizardState.draft.damage || typeof wizardState.draft.damage !== 'object') wizardState.draft.damage = {};
        if (!wizardState.draft.damage.onSave) wizardState.draft.damage.onSave = suggestion;
        onSaveSelect.value = wizardState.draft.damage.onSave;
      } else {
        onSaveHint.textContent = '';
      }

      damageBlock.querySelectorAll('[data-pw-dmg-field]').forEach((el) => {
        if (!enabled) el.classList.add('is-disabled');
        else el.classList.remove('is-disabled');
      });
    }

    const diceField = fieldRow('Damage Dice', diceSelect, 'Choose the dice package.');
    diceField.dataset.pwDmgField = 'true';

    const typeField = fieldRow('Damage Type', typeSelect, 'Type of damage (kinetic/energy/etc.).');
    typeField.dataset.pwDmgField = 'true';

    onSaveField.dataset.pwDmgField = 'true';

    damageBlock.append(dmgToggle.wrap, diceField, typeField, onSaveField, onSaveHint);
    grid.appendChild(damageBlock);

    if (wizardState.draft.damageOptIn !== false && !wizardState.draft.damage) {
      wizardState.draft.damage = {
        dice: POWER_DAMAGE_DICE()[0],
        type: defaultDamageType(wizardState.draft.style) || POWER_DAMAGE_TYPES()[0],
        onSave: suggestOnSaveBehavior(wizardState.draft.effectTag),
      };
    }
    syncDamageVisibility();
  } else {
    wizardState.draft.damageOptIn = false;
    wizardState.draft.damage = null;
  }

  wrap.append(h, p, grid);
  els.content.appendChild(wrap);
}
function renderReview(forceIssuesOpen) {
  const els = wizardState.els;
  if (!els) return;

  const wrap = document.createElement('div');
  wrap.className = 'power-wizard__step-wrap';

  const h = document.createElement('h3');
  h.className = 'power-wizard__h';
  h.textContent = 'Review and confirm';

  const p = document.createElement('p');
  p.className = 'power-wizard__p';
  p.textContent = 'Confirm the essentials and fix anything missing. The live preview on the right reflects exactly what will be saved.';

  const compiled = compileDraft(wizardState.draft);
  const v = isValid(wizardState.draft);

  const summary = document.createElement('div');
  summary.className = 'power-wizard__summary';

  const typeLabel = getMoveTypeConfig(compiled.moveType)?.label || compiled.moveType || '—';
  const subtypeLabel = getSubtypeConfig(compiled.moveType, compiled.subtype)?.label || compiled.subtype || '—';

  summary.innerHTML = `
    <div class="power-wizard__summary-grid">
      <div class="pw-sum"><span>Name</span><strong>${escapeHtml(compiled.name || '—')}</strong></div>
      <div class="pw-sum"><span>Type</span><strong>${escapeHtml(typeLabel)} • ${escapeHtml(subtypeLabel)}</strong></div>
      <div class="pw-sum"><span>Action</span><strong>${escapeHtml(compiled.actionType || '—')}</strong></div>
      <div class="pw-sum"><span>Cost</span><strong>${escapeHtml(compiled.spCost ? `${compiled.spCost} SP` : '—')}</strong></div>
      <div class="pw-sum"><span>Target</span><strong>${escapeHtml(compiled.shape || '—')}</strong></div>
      <div class="pw-sum"><span>Range</span><strong>${escapeHtml(compiled._rangeDisplay || compiled.range || '—')}</strong></div>
      <div class="pw-sum"><span>Duration</span><strong>${escapeHtml(compiled.duration || '—')}</strong></div>
      <div class="pw-sum"><span>Effect</span><strong>${escapeHtml(compiled.effectTag || '—')}</strong></div>
    </div>
  `;

  wrap.append(h, p, summary);

  const issuesWrap = document.createElement('div');
  issuesWrap.className = 'power-wizard__issues';

  if (!v.ok) {
    const t = document.createElement('div');
    t.className = 'power-wizard__issues-title';
    t.textContent = 'Fix required items:';

    const ul = document.createElement('ul');
    ul.className = 'power-wizard__issues-list';
    v.issues.forEach((it) => {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    });

    issuesWrap.append(t, ul);

    const jumpRow = document.createElement('div');
    jumpRow.className = 'power-wizard__row';
    const btnJump = document.createElement('button');
    btnJump.type = 'button';
    btnJump.className = 'btn-sm btn-primary';
    btnJump.textContent = 'Take me to the first missing step';
    btnJump.addEventListener('click', () => {
      if (v.issues.some((x) => x.toLowerCase().includes('name') || x.toLowerCase().includes('type'))) goStep(1);
      else if (v.issues.some((x) => x.toLowerCase().includes('shape') || x.toLowerCase().includes('range') || x.toLowerCase().includes('duration') || x.toLowerCase().includes('save'))) goStep(2);
      else if (v.issues.some((x) => x.toLowerCase().includes('damage') || x.toLowerCase().includes('effect'))) goStep(3);
      else goStep(1);
    });
    jumpRow.appendChild(btnJump);
    issuesWrap.appendChild(jumpRow);
  } else {
    const ok = document.createElement('div');
    ok.className = 'power-wizard__issues-ok';
    ok.textContent = 'All required fields look good. You can finalize when ready.';
    issuesWrap.appendChild(ok);
  }

  if (!v.ok || forceIssuesOpen) wrap.appendChild(issuesWrap);

  const modeNote = document.createElement('div');
  modeNote.className = 'power-wizard__note';
  modeNote.textContent =
    wizardState.mode === 'edit'
      ? 'You are editing an existing power. Saving will update it in place (no duplicates).'
      : 'You are creating a new power. Saving will add it to the character.';
  wrap.appendChild(modeNote);

  els.content.appendChild(wrap);
}

export function openPowerWizard(options = {}) {
  if (wizardState.isOpen) return;
  const opts = options && typeof options === 'object' ? options : {};
  wizardState.options = opts;

  const powers = Array.isArray(opts.powers) ? opts.powers : [];
  wizardState.powers = powers.map((p) => normalizePower(p));

  const providedPower = opts.power ? normalizePower(opts.power) : null;
  const mode = opts.mode || (providedPower ? 'edit' : 'create');

  wizardState.mode = mode === 'edit' ? 'edit' : 'create';
  wizardState.step = 0;

  if (wizardState.mode === 'edit' && providedPower) {
    wizardState.selectedPowerId = providedPower.id;
    wizardState.originalPowerSnapshot = deepClone(providedPower);
    wizardState.draft = normalizePower(providedPower);
    wizardState.step = 1;
  } else {
    wizardState.selectedPowerId = null;
    wizardState.originalPowerSnapshot = null;
    wizardState.draft = normalizePower({ id: uid() });
  }

  openOverlay();
}

export function closePowerWizard() {
  requestClose();
}

export function isPowerWizardOpen() {
  return !!wizardState.isOpen;
}

try {
  const g = getGlobal();
  if (g) {
    g.PowerWizard = g.PowerWizard || {};
    g.PowerWizard.openPowerWizard = openPowerWizard;
    g.PowerWizard.closePowerWizard = closePowerWizard;
    g.PowerWizard.isPowerWizardOpen = isPowerWizardOpen;

    if (!g.__PW_UNLOCK_INSTALLED__) {
      g.__PW_UNLOCK_INSTALLED__ = true;
      const unlock = () => {
        try { document.documentElement.classList.remove('power-wizard-open'); } catch (_) {}
        try {
          const ov = document.querySelector('.power-wizard__overlay');
          if (ov) {
            ov.hidden = true;
            ov.style.display = 'none';
            ov.style.pointerEvents = 'none';
            try { ov.inert = true; } catch (_) {}
          }
        } catch (_) {}
      };
      g.addEventListener('error', unlock);
      g.addEventListener('unhandledrejection', unlock);
    }
  }
} catch (_) {}
