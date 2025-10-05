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
    const loadCharacter = jest.fn(async () => ({}));
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

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
          <div id="dm-character-sheet"></div>
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
    const loadCharacter = jest.fn(async () => ({ str: 10 }));
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

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
          <div id="dm-character-sheet"></div>
        </section>
      </div>
      <div id="modal-load" class="overlay hidden" aria-hidden="true"></div>
      <div id="modal-load-list" class="overlay hidden" aria-hidden="true"></div>
      <div id="load-confirm-text"></div>
    `;

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();
    await new Promise(r => setTimeout(r, 0));
    const link = document.querySelector('#dm-characters-list a');
    link.click();
    await new Promise(r => setTimeout(r, 0));
    const view = document.getElementById('dm-character-sheet');
    expect(loadCharacter).toHaveBeenCalledWith('Test', { bypassPin: true });
    expect(view.textContent).toContain('Test');
  });

  test('character card displays all character data', async () => {
    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    const characterData = {
      'hp-bar': '30/30',
      tc: '12',
      'sp-bar': '5/5',
      str: 10,
      dex: 12,
      con: 14,
      int: 8,
      wis: 11,
      cha: 13,
      powers: [{
        name: 'Fireball',
        style: 'Pyro',
        actionType: 'Action',
        intensity: 'Core',
        uses: 'At-will',
        spCost: 2,
        requiresSave: true,
        saveAbilityTarget: 'DEX',
        rulesText: 'Action • 30 ft • Cost: 2 SP',
        description: 'boom',
        special: 'Splash'
      }],
      signatures: [{
        signature: true,
        name: 'Signature',
        style: 'Arcane',
        actionType: 'Action',
        intensity: 'Ultimate',
        uses: 'Cooldown',
        spCost: 5,
        requiresSave: true,
        saveAbilityTarget: 'STR',
        rulesText: 'Action • Melee • Cost: 5 SP',
        description: 'Strong',
        special: 'Knockback'
      }],
      weapons: [{ name: 'Sword', damage: '1d8', range: 'melee' }],
      armor: [{ name: 'Chainmail', slot: 'Body', bonus: 1, equipped: true }],
      items: [{ name: 'Potion', qty: 2, notes: 'healing' }]
    };

    const listCharacters = jest.fn(async () => ['Hero']);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    const loadCharacter = jest.fn(async () => characterData);
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

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
          <div id="dm-character-sheet"></div>
        </section>
      </div>
      <div id="modal-load" class="overlay hidden" aria-hidden="true"></div>
      <div id="modal-load-list" class="overlay hidden" aria-hidden="true"></div>
      <div id="load-confirm-text"></div>
    `;

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();
    await new Promise(r => setTimeout(r, 0));
    const link = document.querySelector('#dm-characters-list a');
    link.click();
    await new Promise(r => setTimeout(r, 0));
    const view = document.getElementById('dm-character-sheet');
    const text = view.textContent;
    expect(loadCharacter).toHaveBeenCalledWith('Hero', { bypassPin: true });
    expect(text).toContain('Fireball');
    expect(text).toContain('Signature');
    expect(text).toContain('Sword');
    expect(text).toContain('Chainmail');
    expect(text).toContain('Potion');
    expect(text).toContain('Qty');
    expect(text).toContain('2');
    expect(text).toContain('healing');
  });
});
