import { jest } from '@jest/globals';

describe('DM character viewer tool', () => {
  test('shows character modal from DM tools menu', async () => {
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    const listCharacters = jest.fn(async () => ['The DM']);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter }));

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
      <div id="dm-characters-modal" class="overlay hidden" aria-hidden="true">
        <section class="modal dm-characters">
          <button id="dm-characters-close"></button>
          <ul id="dm-characters-list"></ul>
        </section>
      </div>
    `;

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();

    expect(listCharacters).toHaveBeenCalled();
    const modal = document.getElementById('dm-characters-modal');
    expect(modal.classList.contains('hidden')).toBe(false);
  });
});
