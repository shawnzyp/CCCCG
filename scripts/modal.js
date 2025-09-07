import { $, qsa } from './helpers.js';

let lastFocus = null;
let openModals = 0;

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
    if (e.target === ov) hide(ov.id);
  });
});

// Allow closing with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openModals > 0) {
    const open = qsa('.overlay').find(o => !o.classList.contains('hidden'));
    if (open) hide(open.id);
  }
});

export function show(id) {
  const el = $(id);
  if (!el || !el.classList.contains('hidden')) return;
  lastFocus = document.activeElement;
    if (openModals === 0) {
      document.body.classList.add('modal-open');
      qsa('body > :not(.overlay):not(#dm-login):not(#dm-toast)').forEach(e => e.setAttribute('inert', ''));
    }
  openModals++;
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
    }
  };
  el.addEventListener('transitionend', onEnd);
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  removeTrapFocus(el);
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus();
  }
  openModals = Math.max(0, openModals - 1);
    if (openModals === 0) {
      document.body.classList.remove('modal-open');
      qsa('body > :not(.overlay):not(#dm-login):not(#dm-toast)').forEach(e => e.removeAttribute('inert'));
    }
}
