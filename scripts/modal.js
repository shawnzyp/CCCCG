import { $, qsa } from './helpers.js';
import { coverFloatingLauncher, releaseFloatingLauncher } from './floating-launcher.js';

function getInertTargets() {
  const targets = new Set();
  qsa('body > :not(.overlay):not([data-launch-shell])').forEach(el => targets.add(el));
  const shell = document.querySelector('[data-launch-shell]');
  if (shell) {
    qsa(':scope > :not(.overlay):not(#somf-reveal-alert)', shell).forEach(el => targets.add(el));
  }
  return Array.from(targets);
}

let lastFocus = null;
let openModals = 0;

const ACCENT_PROPERTIES = [
  '--modal-accent-hue',
  '--modal-accent-rotation',
  '--modal-accent-offset',
  '--modal-accent-strength',
  '--modal-accent-blur'
];

function applyAccentStyles(overlay) {
  if (!overlay) return;
  const hue = Math.floor(200 + Math.random() * 70);
  const rotation = `${Math.floor(18 + Math.random() * 46)}deg`;
  const offset = `${Math.floor(42 + Math.random() * 32)}%`;
  const strength = (0.42 + Math.random() * 0.22).toFixed(2);
  const blur = `${Math.floor(68 + Math.random() * 36)}px`;
  overlay.style.setProperty('--modal-accent-hue', hue);
  overlay.style.setProperty('--modal-accent-rotation', rotation);
  overlay.style.setProperty('--modal-accent-offset', offset);
  overlay.style.setProperty('--modal-accent-strength', strength);
  overlay.style.setProperty('--modal-accent-blur', blur);
}

function clearAccentStyles(overlay) {
  if (!overlay) return;
  ACCENT_PROPERTIES.forEach(prop => overlay.style.removeProperty(prop));
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
  const el = $(id);
  if (!el || !el.classList.contains('hidden')) return;
  lastFocus = document.activeElement;
  if (openModals === 0) {
    coverFloatingLauncher();
    document.body.classList.add('modal-open');
    getInertTargets().forEach(e => e.setAttribute('inert', ''));
  }
  openModals++;
  applyAccentStyles(el);
  el.style.display = 'flex';
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  trapFocus(el);
  const focusEl = el.querySelector('[autofocus],input,select,textarea,button');
  if (focusEl && typeof focusEl.focus === 'function') {
    focusEl.focus();
  }
}

export function hide(id) {
  const el = $(id);
  if (!el || el.classList.contains('hidden')) return;
  const onEnd = (e) => {
    if (e.target === el && e.propertyName === 'opacity') {
      el.style.display = 'none';
      el.removeEventListener('transitionend', onEnd);
      clearAccentStyles(el);
    }
  };
  el.addEventListener('transitionend', onEnd);
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  removeTrapFocus(el);
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus();
  }
  if (prefersReducedMotion) {
    clearAccentStyles(el);
    el.style.display = 'none';
    el.removeEventListener('transitionend', onEnd);
  }
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) {
    releaseFloatingLauncher();
    document.body.classList.remove('modal-open');
    getInertTargets().forEach(e => e.removeAttribute('inert'));
  }
}
