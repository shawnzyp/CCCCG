import '../scripts/dm.js';

describe('DM login link', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="dm-login-wrapper">
        <button id="dm-login-link" type="button"></button>
      </div>
      <button id="dm-login" hidden></button>
      <div id="dm-tools-menu" hidden></div>
      <div class="overlay hidden" id="dm-login-modal" aria-hidden="true">
        <input id="dm-login-pin" />
        <button id="dm-login-submit"></button>
      </div>`;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem(){ throw new Error('denied'); },
        setItem(){ throw new Error('denied'); },
        removeItem(){ throw new Error('denied'); }
      }
    });
  });

  test('opens modal even if sessionStorage unavailable', () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const link = document.getElementById('dm-login-link');
    link.click();
    const modal = document.getElementById('dm-login-modal');
    expect(modal.classList.contains('hidden')).toBe(false);
  });
});
