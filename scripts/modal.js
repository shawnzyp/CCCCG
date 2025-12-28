import { $, qsa } from './helpers.js';
import { coverFloatingLauncher, releaseFloatingLauncher } from './floating-launcher.js';

const INERT_MARK = 'data-cc-inert-by-modal';
const INERT_PREV = 'data-cc-inert-prev';
let openModals = 0;

function isModalOverlay(node) {
  try {
    if (!node || !node.classList || !node.classList.contains('overlay')) return false;
    const id = node.id || '';
    return id.startsWith('modal-');
  } catch (_) {
    return false;
  }
}

function isOverlayOpen(node) {
  try {
    if (!isModalOverlay(node)) return false;
    if (node.classList.contains('hidden')) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    if (node.style && node.style.display === 'none') return false;
    return true;
  } catch (_) {
    return false;
  }
}

function wasNodeInert(node) {
  try {
    if (!node) return false;
    if (node.hasAttribute && node.hasAttribute('inert')) return true;
    if ('inert' in node && node.inert === true) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function setNodeInert(node, on) {
  if (!node) return;
  try { node.inert = !!on; } catch (_) {}
  try {
    if (on) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
  } catch (_) {}
}

function getInertTargets(activeModalEl) {
  const targets = new Set();

  qsa('body > :not(.overlay[id^="modal-"]):not(#launch-animation):not(#cc-focus-sink)')
    .forEach(el => targets.add(el));

  const shell = document.querySelector('[data-launch-shell]');
  if (shell) {
    qsa(':scope > :not(.overlay[id^="modal-"]):not(#somf-reveal-alert)', shell).forEach(el => targets.add(el));
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

function isLaunchShellNode(node) {
  try {
    if (!node || !node.matches) return false;
    return node.matches('[data-launch-shell], [data-launch-shell] *');
  } catch (_) {
    return false;
  }
}

function isLaunchingNow() {
  try {
    return !!(document.body && document.body.classList && document.body.classList.contains('launching'));
  } catch (_) {
    return false;
  }
}

function markAndInert(node) {
  if (!node) return;
  try {
    // If the app is done launching, never preserve a stale inert on the launch shell.
    // This prevents the "sometimes everything freezes" race where the shell stays inert forever.
    const prev =
      (!isLaunchingNow() && isLaunchShellNode(node))
        ? '0'
        : (wasNodeInert(node) ? '1' : '0');
    node.setAttribute(INERT_MARK, '1');
    node.setAttribute(INERT_PREV, prev);
    if (prev !== '1') setNodeInert(node, true);
  } catch (_) {}
}

function restoreMarkedInert() {
  try {
    document.querySelectorAll(`[${INERT_MARK}]`).forEach((node) => {
      const prev = node.getAttribute(INERT_PREV) || '0';
      if (prev !== '1') setNodeInert(node, false);
    });
  } catch (_) {}
}

function cleanupMarkedInert() {
  try {
    document.querySelectorAll(`[${INERT_MARK}]`).forEach((node) => {
      try { node.removeAttribute(INERT_MARK); } catch (_) {}
      try { node.removeAttribute(INERT_PREV); } catch (_) {}
    });
  } catch (_) {}
}

function countOpenModalsInDom() {
  try {
    const overlays = document.querySelectorAll?.('.overlay[id^="modal-"]');
    if (!overlays || !overlays.length) return 0;
    let n = 0;
    overlays.forEach((el) => {
      try {
        const hidden =
          el.classList.contains('hidden') ||
          el.getAttribute('aria-hidden') === 'true' ||
          el.style.display === 'none';
        if (!hidden) n += 1;
      } catch (_) {}
    });
    return n;
  } catch (_) {
    return 0;
  }
}

export function syncOpenModalsFromDom(reason = 'sync') {
  try {
    if (typeof document === 'undefined') return 0;
    const n = countOpenModalsInDom();
    openModals = n;

    // Keep body class and launcher consistent with reality.
    try {
      if (n > 0) {
        document.body.classList.add('modal-open');
        coverFloatingLauncher();
      } else {
        document.body.classList.remove('modal-open');
        releaseFloatingLauncher();
      }
    } catch (_) {}

    // Ensure hidden overlays never intercept input.
    try {
      const overlays = document.querySelectorAll?.('.overlay[id^="modal-"]');
      overlays?.forEach((el) => {
        const isHidden = el.classList.contains('hidden') || el.getAttribute('aria-hidden') === 'true';
        el.style.pointerEvents = isHidden ? 'none' : 'auto';
      });
    } catch (_) {}

    try { window.__ccModalSync = { ts: Date.now(), reason, open: n }; } catch (_) {}
    return n;
  } catch (_) {
    return 0;
  }
}

export function repairModalInertState() {
  try {
    // First, sync reality. If a modal is actually open, do not rip out inert bookkeeping.
    const n = syncOpenModalsFromDom('repair');
    if (n > 0) {
      // Still enforce that the visible overlays are clickable.
      try {
        const overlays = document.querySelectorAll?.('.overlay[id^="modal-"]:not(.hidden)');
        overlays?.forEach((el) => { try { el.style.pointerEvents = 'auto'; } catch (_) {} });
      } catch (_) {}
      return;
    }

    const nodes = document.querySelectorAll(`[${INERT_MARK}],[${INERT_PREV}]`);
    nodes.forEach((node) => {
      const prev = node.getAttribute(INERT_PREV) || '0';
      try { node.removeAttribute(INERT_MARK); } catch (_) {}
      try { node.removeAttribute(INERT_PREV); } catch (_) {}
      if (prev === '1') setNodeInert(node, true);
      else setNodeInert(node, false);
    });

    // If no modals are open, ensure the main shell is interactive.
    try {
      const shell = document.querySelector('[data-launch-shell]') || document.getElementById('app');
      if (shell) setNodeInert(shell, false);
      try { document.body.classList.remove('modal-open'); } catch (_) {}
    } catch (_) {}
  } catch (_) {}
}

let lastFocus = null;

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
qsa('.overlay[id^="modal-"].hidden').forEach(ov => { ov.style.display = 'none'; });

// Close modal on overlay click
qsa('.overlay[id^="modal-"]').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov && !ov.hasAttribute('data-modal-static')) hide(ov.id);
  });
});

// Allow closing with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openModals > 0) {
    const open = qsa('.overlay[id^="modal-"]').find(o => !o.classList.contains('hidden') && !o.hasAttribute('data-modal-static'));
    if (open) hide(open.id);
  }
});

export function show(id) {
  try {
    const el = $(id);
    if (!el || !el.classList.contains('hidden')) return false;
    const wasFirstModal = (openModals === 0);
    try { el.style.pointerEvents = 'auto'; } catch (_) {}
    try { el.style.visibility = 'visible'; } catch (_) {}
    setNodeInert(el, false);
    try { el.removeAttribute(INERT_MARK); } catch (_) {}
    try { el.removeAttribute(INERT_PREV); } catch (_) {}
    try {
      el.querySelectorAll('[inert]').forEach(node => {
        setNodeInert(node, false);
      });
    } catch (_) {}
    lastFocus = document.activeElement;
    if (wasFirstModal) {
      coverFloatingLauncher();
      try {
        document.body.classList.add('modal-open');
      } catch (err) {
        console.error('Failed to update body class when showing modal', err);
      }
      getInertTargets(el).forEach(e => {
        try {
          markAndInert(e);
        } catch (err) {
          console.error('Failed to set inert attribute', err);
        }
      });
      setNodeInert(el, false);
    }
    openModals++;
    // Special case: welcome modal controls a global class for styling (phone hide, prewarm, etc).
    try {
      if (el.id === 'modal-welcome') document.documentElement.classList.add('cc-welcome-open');
    } catch (_) {}
    cancelModalStyleReset(el);
    applyModalStyles(el);
    el.style.display = 'flex';
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    // If a prior hide() set visibility:hidden, make sure we restore it.
    try { el.style.visibility = 'visible'; } catch (_) {}
    trapFocus(el);
    // Critical: never let a visually hidden overlay eat taps.
    try { el.style.pointerEvents = 'auto'; } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent('cc:modal:shown', { detail: { id: el.id } }));
    } catch (_) {}
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
    try { el.style.pointerEvents = 'none'; } catch (_) {}
    // Do NOT set visibility:hidden here. It can desync visual vs logical modal state.
    // We'll let opacity/display handle the transition and final removal.
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
      try { el.removeEventListener('transitionend', onEnd); } catch (_) {}
      try {
        if (el.classList.contains('hidden')) {
          el.style.display = 'none';
          el.style.pointerEvents = 'none';
          // Reset so future show() is never “invisible but open”.
          try { el.style.visibility = 'visible'; } catch (_) {}
        }
      } catch (_) {}
      clearModalStyles(el);
      cancelModalStyleReset(el);
    }, 450);
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
    setNodeInert(el, true);
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('hidden');
    // Critical: hidden overlays must not intercept input.
    try { el.style.pointerEvents = 'none'; } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent('cc:modal:hidden', { detail: { id: el.id } }));
    } catch (_) {}
    // Remove welcome class early so UI does not stay hidden if anything goes sideways.
    try {
      if (el.id === 'modal-welcome') document.documentElement.classList.remove('cc-welcome-open');
    } catch (_) {}
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
      restoreMarkedInert();
      // Repair before cleanup so we can still read data-cc-inert-prev.
      try { repairModalInertState(); } catch (_) {}
      // Extra safety: if launch is complete, ensure shell is interactive even if some earlier path left inert behind.
      try {
        if (!isLaunchingNow()) {
          const shell = document.querySelector('[data-launch-shell]');
          if (shell) setNodeInert(shell, false);
        }
      } catch (_) {}
      try { document.body.classList.remove('modal-open'); } catch (err) {
        console.error('Failed to update body class when hiding modal', err);
      }
      cleanupMarkedInert();
      // Keep counter honest.
      try { syncOpenModalsFromDom('hide-last'); } catch (_) {}
    } else {
      try { document.body.classList.add('modal-open'); } catch (_) {}
    }
    return true;
  } catch (err) {
    console.error(`Failed to hide modal ${id}`, err);
    return false;
  }
}
