import { $, qs, qsa } from './helpers.js';

const MODE_EDIT = 'edit';
const MODE_VIEW = 'view';
const STORAGE_KEY = 'view-mode';
const FIELD_SELECTOR = 'input, select, textarea';
const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'reset',
  'button',
  'file',
  'color',
  'image',
  'range',
]);

let mode = MODE_EDIT;
let rootEl = null;
let switchEl = null;
let statusEl = null;
let initialized = false;

const listeners = new Set();
const fieldRegistry = new Map();
const radioGroups = new Map();
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });

function isSensitiveField(el) {
  if (!el) return false;
  const type = (el.getAttribute('type') || '').toLowerCase();
  return type === 'password' || el.dataset.viewSensitive === 'true';
}

function shouldSkipControl(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
  if (el.closest('[data-view-allow]')) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return false;
  if (tag === 'SELECT') return false;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (SKIP_INPUT_TYPES.has(type)) return true;
    return false;
  }
  return true;
}

function resolveDisplayContainer(el) {
  if (!el) return null;
  if (el.dataset.viewDisplayTarget) {
    const target = qs(`#${el.dataset.viewDisplayTarget}`);
    if (target) return target;
  }
  const labelled = el.getAttribute('aria-labelledby');
  if (labelled) {
    const labelTarget = qs(`#${labelled}`);
    if (labelTarget) return labelTarget.parentElement || labelTarget;
  }
  const card = el.closest('.card, .card__field, .field, .grid-item, label, .inline');
  return card || el.parentElement;
}

function createValueShell(el, { inline = false } = {}) {
  const wrapper = document.createElement(inline ? 'span' : 'div');
  wrapper.classList.add('field-value');
  if (inline) {
    wrapper.classList.add('field-value--inline');
  }
  wrapper.setAttribute('data-mode-value', '');
  wrapper.setAttribute('aria-live', 'off');
  wrapper.setAttribute('aria-hidden', mode === MODE_EDIT ? 'true' : 'false');

  const text = document.createElement('span');
  text.classList.add('field-value__text');
  text.style.whiteSpace = 'pre-wrap';
  wrapper.appendChild(text);

  return { wrapper, text };
}

function ensureExpander(meta) {
  if (!meta || meta.expander) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('field-value__expander');
  btn.textContent = 'Show more';
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    meta.expanded = !meta.expanded;
    btn.setAttribute('aria-expanded', meta.expanded ? 'true' : 'false');
    btn.textContent = meta.expanded ? 'Show less' : 'Show more';
    if (meta.wrapper) {
      meta.wrapper.toggleAttribute('data-expanded', meta.expanded);
    }
    scheduleClampCheck(meta);
  });
  meta.expander = btn;
  if (meta.wrapper) meta.wrapper.appendChild(btn);
}

function ensureReveal(meta) {
  if (!meta || meta.revealBtn) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.classList.add('field-value__reveal');
  btn.textContent = 'Reveal';
  btn.addEventListener('click', () => {
    meta.revealed = !meta.revealed;
    btn.textContent = meta.revealed ? 'Hide' : 'Reveal';
    updateFieldDisplay(meta);
  });
  meta.revealBtn = btn;
  if (meta.wrapper) meta.wrapper.appendChild(btn);
}

function toChips(values) {
  return values.map((value) => {
    const chip = document.createElement('span');
    chip.classList.add('chip');
    chip.textContent = value;
    return chip;
  });
}

function markEmpty(meta) {
  if (!meta || !meta.wrapper) return;
  meta.wrapper.setAttribute('data-empty', 'true');
  meta.wrapper.setAttribute('aria-label', 'Empty value');
}

function clearEmpty(meta) {
  if (!meta || !meta.wrapper) return;
  meta.wrapper.removeAttribute('data-empty');
  meta.wrapper.removeAttribute('aria-label');
}

function renderCheckbox(meta) {
  if (!meta || !meta.control) return;
  const { control, text } = meta;
  const yes = control.dataset.viewYesLabel || 'Yes';
  const no = control.dataset.viewNoLabel || 'No';
  text.textContent = control.checked ? yes : no;
  clearEmpty(meta);
}

function renderSelect(meta) {
  if (!meta || !meta.control) return;
  const { control, text, wrapper } = meta;
  if (control.multiple) {
    text.textContent = '';
    const selected = Array.from(control.selectedOptions || []).map((opt) => opt.label || opt.textContent || opt.value);
    wrapper.classList.add('field-value--chips');
    wrapper.querySelectorAll('.chip').forEach((chip) => chip.remove());
    if (!selected.length) {
      markEmpty(meta);
      return;
    }
    clearEmpty(meta);
    const chips = toChips(selected);
    chips.forEach((chip) => wrapper.appendChild(chip));
  } else {
    wrapper.classList.remove('field-value--chips');
    wrapper.querySelectorAll('.chip').forEach((chip) => chip.remove());
    const selected = control.selectedOptions && control.selectedOptions[0];
    const label = selected ? (selected.label || selected.textContent || selected.value) : '';
    if (!label) {
      markEmpty(meta);
      text.textContent = '—';
      return;
    }
    clearEmpty(meta);
    text.textContent = label;
  }
}

function renderNumber(meta) {
  if (!meta || !meta.control) return;
  const { control, text } = meta;
  const raw = control.value;
  if (raw === undefined || raw === null || `${raw}`.trim() === '') {
    markEmpty(meta);
    text.textContent = '—';
    return;
  }
  clearEmpty(meta);
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    text.textContent = numberFormatter.format(asNumber);
  } else {
    text.textContent = `${raw}`;
  }
}

function formatDateValue(value, control) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const formatted = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (control) {
    control.dataset.viewIso = date.toISOString();
  }
  return formatted;
}

function renderText(meta) {
  if (!meta || !meta.control) return;
  const { control, text } = meta;
  const raw = control.value || '';
  const trimmed = `${raw}`.trim();
  if (!trimmed) {
    markEmpty(meta);
    text.textContent = '—';
    return;
  }
  clearEmpty(meta);
  text.textContent = trimmed;
}

function renderSensitive(meta) {
  if (!meta || !meta.control) return;
  const { control, text } = meta;
  const raw = control.value || '';
  const masked = raw.length ? '•'.repeat(Math.min(raw.length, 8)) : '• • •';
  if (!raw) {
    markEmpty(meta);
    text.textContent = '—';
    return;
  }
  clearEmpty(meta);
  text.textContent = meta.revealed ? raw : masked;
  if (meta.wrapper && control.dataset.viewIso) {
    meta.wrapper.setAttribute('title', control.dataset.viewIso);
  }
}

function renderDefault(meta) {
  if (!meta || !meta.control) return;
  const { control, text } = meta;
  const raw = control.value;
  if (raw === undefined || raw === null || `${raw}`.trim() === '') {
    markEmpty(meta);
    text.textContent = '—';
    return;
  }
  clearEmpty(meta);
  text.textContent = `${raw}`;
}

function scheduleClampCheck(meta) {
  if (!meta || !meta.wrapper) return;
  if (meta.clampFrame) return;
  meta.clampFrame = requestAnimationFrame(() => {
    meta.clampFrame = null;
    const textEl = meta.text;
    if (!textEl) return;
    const clamp = meta.canExpand && !meta.expanded && textEl.scrollHeight > textEl.clientHeight + 2;
    if (meta.expander) {
      meta.expander.hidden = !clamp;
    }
    meta.wrapper.classList.toggle('field-value--clamp', clamp && !meta.expanded);
  });
}

function updateFieldDisplay(meta) {
  if (!meta || !meta.control) return;
  const { control, kind } = meta;
  if (meta.wrapper) {
    meta.wrapper.setAttribute('aria-hidden', mode === MODE_EDIT ? 'true' : 'false');
  }
  if (kind === 'checkbox') {
    renderCheckbox(meta);
  } else if (kind === 'select') {
    renderSelect(meta);
  } else if (kind === 'number') {
    renderNumber(meta);
  } else if (kind === 'date') {
    const formatted = formatDateValue(control.value, control);
    if (formatted) {
      clearEmpty(meta);
      meta.text.textContent = formatted;
      if (meta.wrapper && control.dataset.viewIso) {
        meta.wrapper.setAttribute('title', control.dataset.viewIso);
      }
    } else {
      markEmpty(meta);
      meta.text.textContent = '—';
    }
  } else if (kind === 'sensitive') {
    renderSensitive(meta);
  } else if (kind === 'text') {
    renderText(meta);
  } else {
    renderDefault(meta);
  }
  scheduleClampCheck(meta);
}

function requestFieldUpdate(meta) {
  if (!meta) return;
  if (meta.updateId) cancelAnimationFrame(meta.updateId);
  meta.updateId = requestAnimationFrame(() => {
    meta.updateId = null;
    updateFieldDisplay(meta);
  });
}

function handleControlEvents(meta) {
  if (!meta || !meta.control) return;
  ['input', 'change', 'blur'].forEach((evt) => {
    meta.control.addEventListener(evt, () => requestFieldUpdate(meta));
  });
}

function registerField(control) {
  if (!control || fieldRegistry.has(control)) return;
  if (shouldSkipControl(control)) return;

  const tag = control.tagName;
  const type = (control.getAttribute('type') || control.type || '').toLowerCase();
  const sensitive = isSensitiveField(control);
  const kind = sensitive
    ? 'sensitive'
    : tag === 'SELECT'
      ? 'select'
      : tag === 'TEXTAREA'
        ? 'text'
        : type === 'number'
          ? 'number'
          : type === 'date' || type === 'datetime-local' || type === 'time'
            ? 'date'
            : type === 'checkbox'
              ? 'checkbox'
              : 'text';

  const inline = type === 'checkbox';
  const { wrapper, text } = createValueShell(control, { inline });
  const meta = {
    control,
    wrapper,
    text,
    kind,
    sensitive,
    revealed: false,
    canExpand: tag === 'TEXTAREA' || control.dataset.viewClamp === 'true',
  };

  if (meta.canExpand) {
    ensureExpander(meta);
  }
  if (sensitive) {
    ensureReveal(meta);
  }

  fieldRegistry.set(control, meta);
  control.classList.add('field-view__source');
  control.setAttribute('data-mode-field', 'source');

  const target = resolveDisplayContainer(control);
  if (target && target !== control.parentElement) {
    target.appendChild(wrapper);
  } else {
    control.insertAdjacentElement('afterend', wrapper);
  }

  handleControlEvents(meta);
  requestFieldUpdate(meta);
}

function registerRadioGroup(radio) {
  if (!radio || radio.dataset.modeField === 'source') return;
  if (radio.closest('[data-view-allow]')) return;
  const name = radio.name || radio.id;
  if (!name) return;
  let group = radioGroups.get(name);
  if (!group) {
    const container = resolveDisplayContainer(radio) || radio.parentElement;
    const { wrapper, text } = createValueShell(radio);
    group = { controls: new Set(), wrapper, text, name };
    radioGroups.set(name, group);
    if (container && container !== radio.parentElement) {
      container.appendChild(wrapper);
    } else {
      radio.insertAdjacentElement('afterend', wrapper);
    }
  }
  group.controls.add(radio);
  radio.classList.add('field-view__source');
  radio.setAttribute('data-mode-field', 'source');
  radio.addEventListener('change', () => requestRadioUpdate(group));
  requestRadioUpdate(group);
}

function requestRadioUpdate(group) {
  if (!group) return;
  if (group.updateId) cancelAnimationFrame(group.updateId);
  group.updateId = requestAnimationFrame(() => {
    group.updateId = null;
    updateRadioGroup(group);
  });
}

function updateRadioGroup(group) {
  if (!group) return;
  const { controls, text, wrapper } = group;
  let selectedLabel = '';
  controls.forEach((control) => {
    if (control.checked) {
      const label = control.closest('label');
      if (label) {
        const clone = label.cloneNode(true);
        clone.querySelectorAll('input').forEach((input) => input.remove());
        selectedLabel = clone.textContent.trim();
      } else {
        selectedLabel = control.value;
      }
    }
  });
  if (!selectedLabel) {
    markEmpty(group);
    text.textContent = '—';
  } else {
    clearEmpty(group);
    text.textContent = selectedLabel;
  }
  if (wrapper) {
    wrapper.setAttribute('aria-hidden', mode === MODE_EDIT ? 'true' : 'false');
  }
}

function updateAllFieldViews() {
  fieldRegistry.forEach((meta) => requestFieldUpdate(meta));
  radioGroups.forEach((group) => requestRadioUpdate(group));
}

function refreshViewMode(root = document) {
  if (!initialized) {
    initViewMode();
  }
  if (!root) return;
  const candidates = new Set();
  if (root.nodeType === Node.ELEMENT_NODE) {
    candidates.add(root);
  }
  qsa(FIELD_SELECTOR, root).forEach((el) => candidates.add(el));
  candidates.forEach((el) => {
    if (el.matches && el.matches('input[type="radio"]')) {
      registerRadioGroup(el);
    } else if (el.matches) {
      registerField(el);
    }
  });
  if (mode === MODE_VIEW) {
    updateAllFieldViews();
  }
}

function applyMode(nextMode, { skipPersist = false } = {}) {
  if (!rootEl) rootEl = document.querySelector('.app-shell') || document.body;
  if (!rootEl) return;
  mode = nextMode;
  rootEl.dataset.mode = mode;
  rootEl.classList.toggle('view-mode', mode === MODE_VIEW);
  document.body.classList.toggle('is-view-mode', mode === MODE_VIEW);
  updateAllFieldViews();
  updateSwitchLabel();
  announceMode();
  if (!skipPersist) {
    try {
      localStorage.setItem(STORAGE_KEY, mode === MODE_VIEW ? '1' : '0');
    } catch (err) {
      // Ignore persistence errors
    }
  }
  listeners.forEach((listener) => {
    try {
      listener(mode);
    } catch (err) {
      console.error('View mode listener failed', err);
    }
  });
}

function updateSwitchLabel() {
  if (!switchEl) switchEl = $('[data-mode-switch]');
  if (!switchEl) return;
  const isView = mode === MODE_VIEW;
  switchEl.setAttribute('aria-pressed', isView ? 'true' : 'false');
  switchEl.textContent = isView ? 'Switch to Edit' : 'Switch to View';
  switchEl.setAttribute('title', isView ? 'Switch to Edit Mode' : 'Switch to View Mode');
}

function announceMode() {
  if (!statusEl) statusEl = qs('[data-mode-status]');
  if (!statusEl) return;
  statusEl.textContent = mode === MODE_VIEW ? 'View Mode' : 'Edit Mode';
}

function toggleMode() {
  setMode(mode === MODE_VIEW ? MODE_EDIT : MODE_VIEW);
}

function setMode(nextMode, options = {}) {
  const resolved = nextMode === MODE_VIEW ? MODE_VIEW : MODE_EDIT;
  if (!initialized) {
    initViewMode();
  }
  if (resolved === mode && !options.force) {
    updateSwitchLabel();
    return;
  }
  applyMode(resolved, options);
}

function useViewMode(listener, { immediate = true } = {}) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  if (immediate) {
    try {
      listener(mode);
    } catch (err) {
      console.error('View mode listener failed', err);
    }
  }
  return () => listeners.delete(listener);
}

function initViewMode() {
  if (initialized) return;
  initialized = true;
  rootEl = document.querySelector('.app-shell') || document.body;
  switchEl = $('[data-mode-switch]');
  statusEl = qs('[data-mode-status]');

  if (switchEl) {
    switchEl.addEventListener('click', () => toggleMode());
  }

  const stored = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (err) {
      return false;
    }
  })();

  const startingMode = stored ? MODE_VIEW : MODE_EDIT;
  applyMode(startingMode, { skipPersist: true });

  qsa(FIELD_SELECTOR).forEach((el) => {
    if (el.matches('input[type="radio"]')) {
      registerRadioGroup(el);
    } else {
      registerField(el);
    }
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches && node.matches(FIELD_SELECTOR)) {
          if (node.matches('input[type="radio"]')) {
            registerRadioGroup(node);
          } else {
            registerField(node);
          }
        }
        qsa(FIELD_SELECTOR, node).forEach((el) => {
          if (el.matches('input[type="radio"]')) {
            registerRadioGroup(el);
          } else {
            registerField(el);
          }
        });
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function getMode() {
  return mode;
}

export {
  MODE_EDIT,
  MODE_VIEW,
  getMode,
  initViewMode,
  refreshViewMode,
  setMode,
  toggleMode,
  useViewMode,
};

