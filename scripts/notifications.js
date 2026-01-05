import { $ } from './helpers.js';
import { playCue, playTone as basePlayTone } from './audio.js';

export function playTone(type, options = {}) {
  const overrideFn = getOverrideFunction('playTone', playTone);
  if (overrideFn) {
    try {
      return overrideFn(type, options);
    } catch {
      return undefined;
    }
  }
  return basePlayTone(type, options);
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

  t.className = toastType ? `toast toast--speech-bubble ${toastType}` : 'toast toast--speech-bubble';
  t.innerHTML = '';

  const bubble = document.createElement('div');
  bubble.className = 'toast__bubble';
  const content = document.createElement('div');
  content.className = 'toast__content';

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
  content.appendChild(body);

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
    content.appendChild(actions);
  }

  if (icon && icon !== 'none') {
    const iconEl = document.createElement('span');
    iconEl.className = 'toast__icon';
    iconEl.style.setProperty('--toast-icon-image', icon);
    iconEl.setAttribute('aria-hidden', 'true');
    bubble.appendChild(iconEl);
  }

  bubble.appendChild(content);
  t.appendChild(bubble);

  t.classList.add('show');
  playToastCue(toastType);
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

function playToastCue(toastType) {
  const cueOverride = getOverrideFunction('playCue', playCue);
  if (cueOverride) {
    try {
      return cueOverride(toastType, { source: 'toast' });
    } catch {
      return undefined;
    }
  }
  const toneOverride = getOverrideFunction('playTone', playTone);
  if (toneOverride) {
    try {
      return toneOverride(toastType, { source: 'toast' });
    } catch {
      return undefined;
    }
  }
  return playCue(toastType, { source: 'toast' });
}

function realToast(msg, type = 'info') {
  const request = normalizeToastRequest(msg, type);
  toastQueue.push(request);
  processToastQueue();
}

export function toast(msg, type = 'info') {
  try {
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
  } catch (err) {
    console.error('Failed to display toast', err);
    return null;
  }
}

export function dismissToast() {
  try {
    const overrideFn = getOverrideFunction('dismissToast', dismissToast);
    if (overrideFn) {
      try {
        return overrideFn();
      } catch {
        return undefined;
      }
    }
    return hideToastElement();
  } catch (err) {
    console.error('Failed to dismiss toast', err);
    return undefined;
  }
}

export function clearToastQueue({ dismissActive = true, restoreFocus = false } = {}) {
  try {
    toastQueue.length = 0;
    if (dismissActive) {
      hideToastElement({ restoreFocus });
    }
    return true;
  } catch (err) {
    console.error('Failed to clear toast queue', err);
    return false;
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
