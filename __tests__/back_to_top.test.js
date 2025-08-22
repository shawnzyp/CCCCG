import { initBackToTop } from '../scripts/back_to_top.js';
import { jest } from '@jest/globals';

describe('back to top button', () => {
  test('shows button on scroll and scrolls to top when clicked', () => {
    document.body.innerHTML = '<div style="height:2000px"></div><button id="back-to-top" hidden></button>';
    window.scrollTo = jest.fn();
    document.documentElement.scrollTo = jest.fn();
    document.body.scrollTop = 500;

    initBackToTop();

    window.pageYOffset = 300;
    window.dispatchEvent(new Event('scroll'));
    const btn = document.getElementById('back-to-top');
    expect(btn.hidden).toBe(false);
    expect(btn.classList.contains('show')).toBe(true);

    btn.click();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'smooth' });
    expect(document.documentElement.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'smooth' });
    expect(document.body.scrollTop).toBe(0);
  });
});
