import { $ } from './helpers.js';

const scrollOptions = { top: 0, left: 0, behavior: 'smooth' };

export function scrollToTop() {
  window.scrollTo(scrollOptions);
  if (document.documentElement) {
    document.documentElement.scrollTo(scrollOptions);
  }
  if (document.body) {
    document.body.scrollTop = 0;
  }
}

function getScrollY() {
  return window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
}

export function initBackToTop() {
  const backToTop = $('back-to-top');
  if (!backToTop) return;
  const toggleBackToTop = () => {
    const show = getScrollY() > 200;
    backToTop.classList.toggle('show', show);
    backToTop.hidden = !show;
  };
  window.addEventListener('scroll', toggleBackToTop, { passive: true });
  toggleBackToTop();
  backToTop.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToTop();
  });
}
