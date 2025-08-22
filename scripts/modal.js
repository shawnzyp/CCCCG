import { $, qsa } from './helpers.js';

let lastFocus = null;
let openModals = 0;

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
    qsa('body > :not(.overlay)').forEach(e => e.setAttribute('inert', ''));
  }
  openModals++;
  el.style.display = 'flex';
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
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
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus();
  }
  openModals = Math.max(0, openModals - 1);
  if (openModals === 0) {
    document.body.classList.remove('modal-open');
    qsa('body > :not(.overlay)').forEach(e => e.removeAttribute('inert'));
  }
}
