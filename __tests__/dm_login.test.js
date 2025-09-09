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
});
