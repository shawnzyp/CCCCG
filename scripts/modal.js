import { $, qsa } from './helpers.js';
import { coverFloatingLauncher, releaseFloatingLauncher } from './floating-launcher.js';

function getInertTargets() {
  const targets = new Set();
  qsa('body > :not(.overlay):not([data-launch-shell]):not(#launch-animation)').forEach(el => targets.add(el));
  const shell = document.querySelector('[data-launch-shell]');
  if (shell) {
    qsa(':scope > :not(.overlay):not(#somf-reveal-alert)', shell).forEach(el => targets.add(el));
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

// Ensure hidden overlays are not focusable on load
qsa('.overlay.hidden').forEach(ov => { ov.style.display = 'none'; });

function bindOverlayClickHandler(overlay) {
  if (!overlay || overlay._overlayClickHandler) return;
  const handler = (e) => {
    if (e.target === overlay && !overlay.hasAttribute('data-modal-static')) {
      hide(overlay.id);
    }
  };
  overlay.addEventListener('click', handler);
  overlay._overlayClickHandler = handler;
}

// Close modal on overlay click
qsa('.overlay').forEach(bindOverlayClickHandler);

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
    bindOverlayClickHandler(el);
    lastFocus = document.activeElement;
    if (openModals === 0) {
      coverFloatingLauncher();
      try {
        document.body.classList.add('modal-open');
      } catch (err) {
        console.error('Failed to update body class when showing modal', err);
      }
      getInertTargets().forEach(e => {
        try {
          e.setAttribute('inert', '');
        } catch (err) {
          console.error('Failed to set inert attribute', err);
        }
      });
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
    removeTrapFocus(el);
    const activeElement = document.activeElement;
    if (activeElement && el.contains(activeElement) && typeof activeElement.blur === 'function') {
      try {
        activeElement.blur();
      } catch (err) {
        console.error('Failed to blur active element before hiding modal', err);
      }
    }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try {
        lastFocus.focus();
      } catch (err) {
        console.error('Failed to restore focus after closing modal', err);
      }
    }
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
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
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
