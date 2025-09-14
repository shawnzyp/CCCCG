import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="dm-tools-menu"></div>
    <button id="dm-tools-notifications"></button>
    <button id="dm-login"></button>
    <div id="dm-login-modal"></div>
    <input id="dm-login-pin" />
    <button id="dm-login-submit"></button>
    <button id="dm-login-close"></button>
    <div id="dm-notifications-modal"></div>
    <div id="dm-notifications-list"></div>
    <button id="dm-notifications-close"></button>
  `;
}

describe('dmNotify labels actions as DM when logged in', () => {
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    const listCharacters = jest.fn(async () => []);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    const loadCharacter = jest.fn(async () => ({}));
    jest.unstable_mockModule('../scripts/characters.js', () => ({
      listCharacters,
      currentCharacter,
      setCurrentCharacter,
      loadCharacter,
    }));

    setupDom();

    await import('../scripts/dm.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    sessionStorage.setItem('dmLoggedIn', '1');
  });

  test('uses DM tag', () => {
    window.dmNotify('testing');
    const list = document.getElementById('dm-notifications-list');
    expect(list.textContent).toContain('DM: testing');
  });
});

