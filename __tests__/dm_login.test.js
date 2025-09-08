import { jest } from '@jest/globals';

describe('dm login', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve('0') }));
    global.EventSource = undefined;
    global.requestAnimationFrame = cb => cb();
    document.body.innerHTML = `
      <div class="dm-login-wrapper">
        <button id="dm-login-link" type="button"></button>
      </div>
      <button id="dm-login" hidden></button>
      <div class="toast" id="dm-toast" hidden></div>
      <div class="toast" id="toast"></div>
    `;
    await import('../scripts/dm.js');
  });

  test('dm login link opens login toast', () => {
    document.getElementById('dm-login-link').click();
    const dmToast = document.getElementById('dm-toast');
    expect(dmToast.hidden).toBe(false);
    expect(dmToast.innerHTML).toContain('dm-login-btn');
  });

  test('dm tools button opens login when logged out', () => {
    sessionStorage.clear();
    const dmBtn = document.getElementById('dm-login');
    dmBtn.hidden = false;
    dmBtn.click();
    const dmToast = document.getElementById('dm-toast');
    expect(dmToast.hidden).toBe(false);
  });
});
