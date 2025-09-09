import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('dm login', () => {
  test('clicking login link opens modal', async () => {
    document.body.innerHTML = `
      <button id="dm-login-link"></button>
      <button id="dm-login" hidden></button>
      <div id="dm-tools-menu" hidden></div>
      <button id="dm-tools-tsomf"></button>
      <button id="dm-tools-logout"></button>
      <div id="dm-login-modal" class="hidden" aria-hidden="true">
        <input id="dm-login-pin">
        <button id="dm-login-submit"></button>
      </div>
    `;
    await import('../scripts/dm.js');
    document.getElementById('dm-login-link').click();
    expect(document.getElementById('dm-login-modal').classList.contains('hidden')).toBe(false);
  });

  test('successful login unlocks tools and shows toast', async () => {
    document.body.innerHTML = `
      <button id="dm-login-link"></button>
      <button id="dm-login" hidden></button>
      <div id="dm-tools-menu" hidden></div>
      <button id="dm-tools-tsomf"></button>
      <button id="dm-tools-logout"></button>
      <div id="dm-login-modal" class="hidden" aria-hidden="true">
        <input id="dm-login-pin">
        <button id="dm-login-submit"></button>
      </div>
    `;
    window.toast = jest.fn();
    await import('../scripts/dm.js');
    document.getElementById('dm-login-link').click();
    document.getElementById('dm-login-pin').value = '1231';
    document.getElementById('dm-login-submit').click();
    expect(window.toast).toHaveBeenCalledWith('DM tools unlocked','success');
    const dmBtn = document.getElementById('dm-login');
    const menu = document.getElementById('dm-tools-menu');
    expect(dmBtn.hidden).toBe(false);
    expect(menu.hidden).toBe(true);
    dmBtn.click();
    expect(menu.hidden).toBe(false);
    delete window.toast;
  });
});
