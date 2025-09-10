import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

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

  test('clicking a character opens the character modal', async () => {
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    const listCharacters = jest.fn(async () => ['Test']);
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
      <div id="modal-load" class="overlay hidden" aria-hidden="true"></div>
      <div id="modal-load-list" class="overlay hidden" aria-hidden="true"></div>
      <div id="load-confirm-text"></div>
    `;

    window.openCharacterModal = jest.fn();

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();
    await new Promise(r => setTimeout(r, 0));
    const btn = document.querySelector('#dm-characters-list button');
    btn.click();

    expect(window.openCharacterModal).toHaveBeenCalledWith('Test');
  });
});
