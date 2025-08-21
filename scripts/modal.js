import { $, qsa } from './helpers.js';

let lastFocus = null;
let openModals = 0;

export function show(id) {
  const el = $(id);
  if (!el || !el.classList.contains('hidden')) return;
  lastFocus = document.activeElement;
  if (openModals === 0) {
    document.body.classList.add('modal-open');
    qsa('body > :not(.overlay)').forEach(e => e.setAttribute('inert', ''));
  }
  openModals++;
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
