import { jest } from '@jest/globals';
import '../scripts/users.js';

describe('DM Players button visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div class="dropdown">
        <div id="menu-actions" class="menu">
          <button id="btn-dm" class="btn-sm" hidden>Players</button>
        </div>
      </div>
      <div id="modal-dm-login" class="overlay hidden"></div>
      <input id="dm-password" />
      <button id="login-dm"></button>
      <button id="logout-dm"></button>
      <div id="toast"></div>
    `;
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  test('hidden by default and toggles with DM login/logout', () => {
    const dmBtn = document.getElementById('btn-dm');
    expect(dmBtn.hidden).toBe(true);
    document.getElementById('dm-password').value = 'Dragons22!';
    document.getElementById('login-dm').click();
    expect(dmBtn.hidden).toBe(false);
    document.getElementById('logout-dm').click();
    expect(dmBtn.hidden).toBe(true);
  });
});

