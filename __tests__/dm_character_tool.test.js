import { jest } from '@jest/globals';

describe('DM character viewer tool', () => {
  test('opens character list from DM tools menu', async () => {
    // Ensure matchMedia exists
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    window.openCharacterList = jest.fn();
    sessionStorage.setItem('dmLoggedIn', '1');

    document.body.innerHTML = `
      <div id="dm-tools-menu"></div>
      <button id="dm-tools-tsomf"></button>
      <button id="dm-tools-notifications"></button>
      <button id="dm-tools-characters"></button>
      <button id="dm-tools-logout"></button>
      <div id="dm-login"></div>
      <div id="dm-login-modal"></div>
      <input id="dm-login-pin" />
      <button id="dm-login-submit"></button>
      <button id="dm-login-close"></button>
      <div id="dm-notifications-modal"></div>
      <div id="dm-notifications-list"></div>
      <button id="dm-notifications-close"></button>
    `;

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();

    expect(window.openCharacterList).toHaveBeenCalled();
  });
});
