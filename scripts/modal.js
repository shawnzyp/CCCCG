import { $, qsa } from './helpers.js';
import { coverFloatingLauncher, releaseFloatingLauncher } from './floating-launcher.js';

function getInertTargets(activeModalEl) {
  const targets = new Set();

  qsa('body > :not(.overlay):not([data-launch-shell]):not(#launch-animation):not(#cc-focus-sink)')
    .forEach(el => targets.add(el));

  const shell = document.querySelector('[data-launch-shell]');
  if (shell) {
    qsa(':scope > :not(.overlay):not(#somf-reveal-alert)', shell).forEach(el => targets.add(el));
  }

  if (activeModalEl) {
    for (const el of Array.from(targets)) {
      try {
        if (el === activeModalEl || (typeof el.contains === 'function' && el.contains(activeModalEl))) {
          targets.delete(el);
        }
      } catch (_) {}
    }
  }

  return Array.from(targets);
}

let lastFocus = null;
let openModals = 0;

const MODAL_STYLE_PROPS = [
  ['modalAccentHue', '--modal-accent-hue'],
  ['modalGlowStrength', '--modal-glow-strength'],
];

function applyModalStyles(overlay) {
  if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  const sources = [];
  if (modal) sources.push(modal.dataset);
  sources.push(overlay.dataset);
  const style = overlay.style;
  const setStyleProperty = style && typeof style.setProperty === 'function'
    ? (prop, value) => {
        try {
          style.setProperty(prop, value);
        } catch {}
      }
    : (prop, value) => {
        try {
          if (style) {
            style[prop] = value;
          }
        } catch {}
      };
  const removeStyleProperty = style && typeof style.removeProperty === 'function'
    ? prop => {
        try {
          style.removeProperty(prop);
        } catch {}
      }
    : prop => {
        if (!style) return;
        try {
          if (Object.prototype.hasOwnProperty.call(style, prop)) {
            delete style[prop];
          } else {
            style[prop] = '';
          }
        } catch {}
      };
  MODAL_STYLE_PROPS.forEach(([dataKey, cssVar]) => {
    const value = sources
      .map(source => (source ? source[dataKey] : undefined))
      .find(v => v !== undefined && v !== '');
    if (value !== undefined && value !== '') {
      setStyleProperty(cssVar, value);
    } else {
      removeStyleProperty(cssVar);
    }
  });
}

function clearModalStyles(overlay) {
  if (!overlay) return;
  const { style } = overlay;
  MODAL_STYLE_PROPS.forEach(([, cssVar]) => {
    if (style && typeof style.removeProperty === 'function') {
      try {
        style.removeProperty(cssVar);
      } catch {}
    } else if (style) {
      try {
        if (Object.prototype.hasOwnProperty.call(style, cssVar)) {
          delete style[cssVar];
        } else {
          style[cssVar] = '';
        }
      } catch {}
    }
  });
}

function cancelModalStyleReset(overlay) {
  if (overlay && overlay._modalStyleTimer) {
    clearTimeout(overlay._modalStyleTimer);
    overlay._modalStyleTimer = null;
  }
}

// Helper to keep focus within an open modal
function trapFocus(el) {
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = el.querySelectorAll(
      'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable]'
    );
    if (!focusable.length) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', handler);
  el._trapFocus = handler;
}

function removeTrapFocus(el) {
  if (el._trapFocus) {
    el.removeEventListener('keydown', el._trapFocus);
    delete el._trapFocus;
  }
}

function focusFallbackOutsideOverlay(overlay) {
  if (!overlay || typeof overlay.contains !== 'function') return;
  const doc = overlay.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const active = doc.activeElement;
  if (!active || !overlay.contains(active)) return;

  const candidates = [
    lastFocus && lastFocus.isConnected && !overlay.contains(lastFocus) ? lastFocus : null,
    doc.querySelector('[data-pt-phone-home]'),
    doc.querySelector('[data-skip-launch]'),
    doc.querySelector('#character-name'),
    doc.querySelector('#player-tools-tab'),
    doc.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ].filter(el => el && !overlay.contains(el));

  const focusTarget = candidates.find(target => target && typeof target.focus === 'function');
  if (focusTarget) {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (err) {
      try { focusTarget.focus(); } catch (_) {}
    }
    return;
  }

  if (typeof active.blur === 'function') {
    try { active.blur(); } catch (_) {}
  }
}

function forceBlurIfInside(container) {
  if (!container || typeof container.contains !== 'function') return;
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const active = doc.activeElement;
  if (!active || active === doc.body || !container.contains(active)) return;

  if (typeof active.blur === 'function') {
    try { active.blur(); } catch (_) {}
  }

  focusFallbackOutsideOverlay(container);

  const after = doc.activeElement;
  if (after && container.contains(after) && typeof after.blur === 'function') {
    try { after.blur(); } catch (_) {}
  }
}

// Ensure hidden overlays are not focusable on load
qsa('.overlay.hidden').forEach(ov => { ov.style.display = 'none'; });

// Close modal on overlay click
qsa('.overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov && !ov.hasAttribute('data-modal-static')) hide(ov.id);
  });
});

// Allow closing with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openModals > 0) {
    const open = qsa('.overlay').find(o => !o.classList.contains('hidden') && !o.hasAttribute('data-modal-static'));
    if (open) hide(open.id);
  }
});

export function show(id) {
  try {
    const el = $(id);
    if (!el || !el.classList.contains('hidden')) return false;
    try {
      el.inert = false;
      el.removeAttribute('inert');
    } catch (_) {}
    try {
      el.querySelectorAll('[inert]').forEach(node => {
        try { node.inert = false; } catch (_) {}
        try { node.removeAttribute('inert'); } catch (_) {}
      });
    } catch (_) {}
    lastFocus = document.activeElement;
    if (openModals === 0) {
      coverFloatingLauncher();
      try {
        document.body.classList.add('modal-open');
      } catch (err) {
        console.error('Failed to update body class when showing modal', err);
      }
      getInertTargets(el).forEach(e => {
        try {
          e.setAttribute('inert', '');
        } catch (err) {
          console.error('Failed to set inert attribute', err);
        }
      });
      try { el.inert = false; } catch (_) {}
      try { el.removeAttribute('inert'); } catch (_) {}
    }
    openModals++;
    cancelModalStyleReset(el);
    applyModalStyles(el);
    el.style.display = 'flex';
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    trapFocus(el);
    const focusEl = el.querySelector('[autofocus],input,select,textarea,button');
    if (focusEl && typeof focusEl.focus === 'function') {
      try {
        focusEl.focus();
      } catch (err) {
        console.error('Failed to focus modal element', err);
      }
    }
    return true;
  } catch (err) {
    console.error(`Failed to show modal ${id}`, err);
    return false;
  }
}

export function hide(id) {
  try {
    const el = $(id);
    if (!el || el.classList.contains('hidden')) return false;
    cancelModalStyleReset(el);
    const onEnd = (e) => {
      if (e.target === el && e.propertyName === 'opacity') {
        el.style.display = 'none';
        clearModalStyles(el);
        cancelModalStyleReset(el);
        el.removeEventListener('transitionend', onEnd);
      }
    };
    el.addEventListener('transitionend', onEnd);
    el._modalStyleTimer = setTimeout(() => {
      clearModalStyles(el);
      cancelModalStyleReset(el);
    }, 400);
    removeTrapFocus(el);
    forceBlurIfInside(el);
    const sink = el.ownerDocument?.getElementById?.('cc-focus-sink');
    if (sink && typeof sink.focus === 'function') {
      try {
        sink.focus({ preventScroll: true });
      } catch (err) {
        try { sink.focus(); } catch (_) {}
      }
    }
    // Now it is safe to hide from AT and lock focus.
    try {
      el.inert = true;
      el.setAttribute('inert', '');
    } catch (_) {}
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('hidden');
    if (
      lastFocus &&
      typeof lastFocus.focus === 'function' &&
      lastFocus.isConnected &&
      !el.contains(lastFocus)
    ) {
      try {
        lastFocus.focus();
      } catch (err) {
        console.error('Failed to restore focus after closing modal', err);
      }
    }
    openModals = Math.max(0, openModals - 1);
    if (openModals === 0) {
      releaseFloatingLauncher();
      try {
        document.body.classList.remove('modal-open');
      } catch (err) {
        console.error('Failed to update body class when hiding modal', err);
      }
      getInertTargets().forEach(e => {
        try {
          e.removeAttribute('inert');
        } catch (err) {
          console.error('Failed to remove inert attribute', err);
        }
      });
    }
    return true;
  } catch (err) {
    console.error(`Failed to hide modal ${id}`, err);
    return false;
  }
}
