import { $ } from './helpers.js';

const AUDIO_CUE_SOURCES = {
  'hp-damage': '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',
  'hp-heal': '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',
  'hp-down': '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',
  'sp-gain': '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',
  'sp-spend': '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',
  'sp-empty': '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',
  'info': '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',
  'danger': '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',
  'failure': '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',
};

const AUDIO_CUE_TYPE_MAP = {
  success: 'hp-heal',
  info: 'info',
  warn: 'hp-down',
  warning: 'hp-down',
  error: 'failure',
  danger: 'danger',
  failure: 'failure',
  'hp-damage': 'hp-damage',
  'hp-heal': 'hp-heal',
  'hp-down': 'hp-down',
  'sp-gain': 'sp-gain',
  'sp-spend': 'sp-spend',
  'sp-empty': 'sp-empty',
};

const LOW_FREQUENCY_CUES = new Set([
  'hp-damage',
  'hp-down',
  'sp-spend',
  'sp-empty',
  'danger',
  'failure'
]);

const audioCueData = new Map();
const audioCueBufferPromises = new Map();

function decodeBase64ToUint8Array(base64){
  try {
    if (typeof globalThis?.atob === 'function') {
      const binary = globalThis.atob(base64);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    if (typeof globalThis?.Buffer === 'function') {
      return Uint8Array.from(globalThis.Buffer.from(base64, 'base64'));
    }
  } catch {}
  return new Uint8Array(0);
}

function preloadAudioCues(){
  if (audioCueData.size) return;
  try {
    Object.entries(AUDIO_CUE_SOURCES).forEach(([key, value]) => {
      const bytes = decodeBase64ToUint8Array(value);
      if (bytes.length) {
        audioCueData.set(key, bytes);
      }
    });
  } catch {}
}

preloadAudioCues();

let cueAudioCtx = null;

function ensureCueAudioContext(){
  if (cueAudioCtx) return cueAudioCtx;
  const Ctor = window?.AudioContext || window?.webkitAudioContext;
  if (!Ctor) return null;
  try {
    cueAudioCtx = new Ctor();
  } catch {
    cueAudioCtx = null;
  }
  return cueAudioCtx;
}

function resolveAudioCueType(type){
  if (typeof type !== 'string') return 'success';
  const normalized = type.toLowerCase();
  return AUDIO_CUE_TYPE_MAP[normalized] || 'success';
}

function decodeAudioBuffer(ctx, arrayBuffer){
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = buffer => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const rejectOnce = err => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    try {
      const maybePromise = ctx.decodeAudioData(arrayBuffer, resolveOnce, rejectOnce);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolveOnce, rejectOnce);
      }
    } catch (err) {
      rejectOnce(err);
    }
  });
}

function getAudioCueBufferPromise(ctx, cue){
  if (!ctx || !audioCueData.has(cue)) return null;
  let promise = audioCueBufferPromises.get(cue);
  if (!promise) {
    const bytes = audioCueData.get(cue);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    promise = decodeAudioBuffer(ctx, arrayBuffer).catch(err => {
      audioCueBufferPromises.delete(cue);
      throw err;
    });
    audioCueBufferPromises.set(cue, promise);
  }
  return promise;
}

const closeCueAudioContext = () => {
  if (cueAudioCtx && typeof cueAudioCtx.close === 'function') {
    const ctx = cueAudioCtx;
    cueAudioCtx = null;
    audioCueBufferPromises.clear();
    try {
      ctx.close();
    } catch {}
  }
};

window.addEventListener('pagehide', closeCueAudioContext, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    closeCueAudioContext();
  }
});
function playToneFallback(type){
  try {
    const cue = resolveAudioCueType(type);
    const ctx = ensureCueAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const rampUpDuration = 0.015;
    const totalDuration = 0.15;
    const sustainEnd = now + totalDuration - 0.03;
    osc.type = 'sine';
    osc.frequency.value = LOW_FREQUENCY_CUES.has(cue) ? 220 : 880;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + rampUpDuration);
    gain.gain.setValueAtTime(0.1, sustainEnd);
    gain.gain.linearRampToValueAtTime(0, now + totalDuration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + totalDuration);
  } catch (e) { /* noop */ }
}

function realPlayTone(type){
  const cue = resolveAudioCueType(type);
  const ctx = ensureCueAudioContext();
  if (ctx && audioCueData.has(cue)) {
    if (typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch {}
    }
    const bufferPromise = getAudioCueBufferPromise(ctx, cue);
    if (bufferPromise) {
      bufferPromise.then(buffer => {
        try {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          gain.gain.value = LOW_FREQUENCY_CUES.has(cue) ? 0.25 : 0.2;
          source.buffer = buffer;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start();
        } catch {
          playToneFallback(type);
        }
      }).catch(() => {
        playToneFallback(type);
      });
      return;
    }
  }
  playToneFallback(type);
}
export function playTone(type) {
  const overrideFn = getOverrideFunction('playTone', playTone);
  if (overrideFn) {
    try {
      return overrideFn(type);
    } catch {
      return undefined;
    }
  }
  return realPlayTone(type);
}
let toastTimeout;
let toastLastFocus = null;
let toastFocusGuardActive = false;
let toastFocusHandlersBound = false;
let toastControlsBound = false;
const toastQueue = [];
let toastActive = false;
const TOAST_TYPE_DEFAULT_ICONS = {
  success: 'var(--icon-success)',
  error: 'var(--icon-error)',
  danger: 'var(--icon-error)',
  failure: 'var(--icon-error)',
};

function focusToastElement(el, { preserveSource = true } = {}) {
  if (!el) return;
  if (typeof el.setAttribute === 'function') {
    const canCheck = typeof el.hasAttribute === 'function';
    if (!canCheck || !el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
  }
  if (preserveSource) {
    const active = document.activeElement;
    if (active && active !== el && active !== document.body && document.contains(active)) {
      toastLastFocus = active;
    }
  }
  if (typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function restoreToastFocus() {
  const target = toastLastFocus;
  toastLastFocus = null;
  if (!target || typeof target.focus !== 'function') return;
  if (!document.contains(target)) return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

function ensureToastFocusHandlers() {
  if (toastFocusHandlersBound) return;
  toastFocusHandlersBound = true;
  document.addEventListener('focusin', e => {
    if (!toastFocusGuardActive) return;
    const toastEl = $('toast');
    if (!toastEl || !toastEl.classList.contains('show')) return;
    if (toastEl.contains(e.target)) return;
    focusToastElement(toastEl, { preserveSource: false });
  });
}

function hideToastElement(options = {}) {
  const { restoreFocus = true } = options;
  const t = $('toast');
  if (!t) return;
  const wasShown = t.classList.contains('show');
  t.classList.remove('show');
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  toastFocusGuardActive = false;
  if (restoreFocus) {
    restoreToastFocus();
  } else {
    toastLastFocus = null;
  }
  toastActive = false;
  if (wasShown) {
    dispatchToastEvent('cc:toast-dismissed');
  }
  if (toastQueue.length) {
    setTimeout(processToastQueue, 0);
  }
}

function dispatchToastEvent(name, detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

function normalizeToastIcon(rawIcon) {
  if (typeof rawIcon !== 'string') return null;
  const trimmed = rawIcon.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'none' || lowered === 'hide') return 'none';
  if (lowered === 'auto' || lowered === 'default') return null;
  if (/^(url|var)\(/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('--')) return `var(${trimmed})`;
  if (/^data:/i.test(trimmed)) return trimmed.startsWith('url(') ? trimmed : `url(${trimmed})`;
  if (/^[a-z0-9_-]+$/i.test(trimmed)) return `var(--icon-${trimmed})`;
  return trimmed;
}

function resolveToastIcon(iconOverride, toastType) {
  if (iconOverride === 'none') return 'none';
  if (typeof iconOverride === 'string' && iconOverride) return iconOverride;
  const key = typeof toastType === 'string' ? toastType.toLowerCase() : '';
  if (key && TOAST_TYPE_DEFAULT_ICONS[key]) return TOAST_TYPE_DEFAULT_ICONS[key];
  return 'none';
}

function normalizeToastAction(opts = {}) {
  const candidate = opts.primaryAction ?? opts.action ?? null;
  let callback = null;
  let label = null;
  let ariaLabel = null;
  let dismissOnAction = true;

  if (typeof candidate === 'function') {
    callback = candidate;
  } else if (candidate && typeof candidate === 'object') {
    if (typeof candidate.callback === 'function') callback = candidate.callback;
    else if (typeof candidate.onSelect === 'function') callback = candidate.onSelect;
    else if (typeof candidate.handler === 'function') callback = candidate.handler;
    if (typeof candidate.label === 'string' && candidate.label.trim()) label = candidate.label.trim();
    if (typeof candidate.ariaLabel === 'string' && candidate.ariaLabel.trim()) ariaLabel = candidate.ariaLabel.trim();
    if (candidate.dismiss === false || candidate.dismissOnAction === false) {
      dismissOnAction = false;
    } else if (candidate.dismiss === true || candidate.dismissOnAction === true) {
      dismissOnAction = true;
    }
  }

  if (!callback) {
    const fallback = opts.onPrimaryAction ?? opts.onAction ?? null;
    if (typeof fallback === 'function') callback = fallback;
  }

  if (!label) {
    const fallbackLabel = opts.primaryActionLabel ?? opts.actionLabel ?? opts.actionText;
    if (typeof fallbackLabel === 'string' && fallbackLabel.trim()) label = fallbackLabel.trim();
  }

  if (!ariaLabel) {
    const fallbackAria = opts.primaryActionAriaLabel ?? opts.actionAriaLabel;
    if (typeof fallbackAria === 'string' && fallbackAria.trim()) ariaLabel = fallbackAria.trim();
  }

  if (!callback) return null;

  return {
    label: label && label.trim() ? label.trim() : 'View',
    ariaLabel: ariaLabel && ariaLabel.trim() ? ariaLabel.trim() : null,
    callback,
    dismissOnAction,
  };
}

function normalizeToastRequest(message, type) {
  let opts;
  if (typeof type === 'object' && type !== null) {
    opts = { ...type };
  } else if (typeof type === 'number') {
    opts = { type: 'info', duration: type };
  } else {
    opts = { type, duration: 5000 };
  }
  const toastType = typeof opts.type === 'string' && opts.type ? opts.type : 'info';
  const duration = typeof opts.duration === 'number' ? opts.duration : 5000;
  const html = typeof opts.html === 'string' ? opts.html : '';
  const iconSource = opts.icon ?? opts.iconName ?? null;
  const iconOverride = normalizeToastIcon(iconSource);
  const icon = resolveToastIcon(iconOverride, toastType);
  const action = normalizeToastAction(opts);
  const normalized = {
    ...opts,
    type: toastType,
    duration,
    html,
    icon,
  };
  if (iconSource !== undefined) normalized.iconName = iconSource;
  if (action) normalized.action = action;
  else if (normalized.action) delete normalized.action;
  return { message, options: normalized };
}

function processToastQueue() {
  if (toastActive) return;
  const next = toastQueue.shift();
  if (!next) return;
  toastActive = true;
  renderToastRequest(next);
}

function renderToastRequest(request) {
  const t = $('toast');
  if (!t) {
    toastActive = false;
    setTimeout(processToastQueue, 0);
    return;
  }

  const { message, options } = request;
  const toastType = options.type;
  const duration = options.duration;
  const html = options.html;
  const icon = typeof options.icon === 'string' ? options.icon : 'none';
  const action = options.action;

  t.className = toastType ? `toast ${toastType}` : 'toast';
  if (icon && icon !== 'none') {
    t.style.setProperty('--toast-icon-image', icon);
    t.classList.remove('toast--no-icon');
  } else {
    t.style.setProperty('--toast-icon-image', 'none');
    t.classList.add('toast--no-icon');
  }

  t.innerHTML = '';
  const body = document.createElement('div');
  body.className = 'toast__body';
  if (html) {
    body.innerHTML = html;
  } else {
    const messageEl = document.createElement('div');
    messageEl.className = 'toast__message';
    messageEl.textContent = message ?? '';
    body.appendChild(messageEl);
  }
  t.appendChild(body);

  if (action) {
    const actions = document.createElement('div');
    actions.className = 'toast__actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__actionButton';
    button.textContent = action.label;
    if (action.ariaLabel) {
      button.setAttribute('aria-label', action.ariaLabel);
    }
    button.addEventListener('click', event => {
      event.stopPropagation();
      try {
        action.callback({ message, options });
      } catch (err) {
        console.error('Failed to execute toast action', err);
      }
      if (action.dismissOnAction !== false) {
        hideToastElement();
      }
    });
    actions.appendChild(button);
    t.appendChild(actions);
  }

  t.classList.add('show');
  playTone(toastType);
  clearTimeout(toastTimeout);
  ensureToastFocusHandlers();
  const shouldTrap = !(document?.body?.classList?.contains('modal-open'));
  toastFocusGuardActive = shouldTrap;
  focusToastElement(t, { preserveSource: true });
  if (!toastControlsBound) {
    toastControlsBound = true;
    t.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Esc' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hideToastElement();
      }
    });
    t.addEventListener('click', () => hideToastElement());
  }
  if (Number.isFinite(duration) && duration > 0) {
    toastTimeout = setTimeout(() => {
      toastTimeout = null;
      hideToastElement();
    }, duration);
  } else {
    toastTimeout = null;
  }
  dispatchToastEvent('cc:toast-shown', { message, options });
}

function realToast(msg, type = 'info') {
  const request = normalizeToastRequest(msg, type);
  toastQueue.push(request);
  processToastQueue();
}

export function toast(msg, type = 'info') {
  const result = realToast(msg, type);
  const overrideFn = getOverrideFunction('toast', toast);
  if (overrideFn) {
    try {
      overrideFn(msg, type);
    } catch {
      /* ignore override failures */
    }
  }
  return result;
}

export function dismissToast() {
  const overrideFn = getOverrideFunction('dismissToast', dismissToast);
  if (overrideFn) {
    try {
      return overrideFn();
    } catch {
      return undefined;
    }
  }
  return hideToastElement();
}

export function clearToastQueue({ dismissActive = true, restoreFocus = false } = {}) {
  toastQueue.length = 0;
  if (dismissActive) {
    hideToastElement({ restoreFocus });
  }
}

export default toast;
function getOverrideFunction(name, original) {
  if (typeof globalThis === 'undefined') return null;
  const candidate = globalThis[name];
  if (typeof candidate !== 'function') return null;
  if (candidate === original) return null;
  return candidate;
}

function ensureGlobalFunction(name, fn) {
  const targets = [];
  if (typeof window !== 'undefined') targets.push(window);
  if (typeof globalThis !== 'undefined') targets.push(globalThis);
  const seen = new Set();
  targets.forEach(target => {
    if (!target || seen.has(target)) return;
    seen.add(target);
    if (typeof target[name] !== 'function') {
      try {
        target[name] = fn;
      } catch {
        try {
          Object.defineProperty(target, name, {
            configurable: true,
            writable: true,
            value: fn,
          });
        } catch {}
      }
    }
  });
}

ensureGlobalFunction('toast', toast);
ensureGlobalFunction('dismissToast', dismissToast);
ensureGlobalFunction('playTone', playTone);
ensureGlobalFunction('clearToastQueue', clearToastQueue);
