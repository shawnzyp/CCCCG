import { jest } from '@jest/globals';

function buildDom({ includeLoadModals = false } = {}) {
  return `
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
        <header class="dm-characters__header">
          <h3 id="dm-characters-title">Character Roster</h3>
          <div class="dm-characters__controls">
            <label class="sr-only" for="dm-characters-search">Search characters</label>
            <input id="dm-characters-search" class="dm-characters__search" type="search" />
            <div class="dm-characters__sort" role="group" aria-label="Sort characters">
              <button id="dm-characters-sort-asc" data-char-sort="asc" aria-pressed="true"></button>
              <button id="dm-characters-sort-desc" data-char-sort="desc" aria-pressed="false"></button>
            </div>
          </div>
        </header>
        <ul id="dm-characters-list"></ul>
      </section>
    </div>
    <div id="dm-character-modal" class="overlay hidden" aria-hidden="true">
      <section class="modal dm-character" role="dialog" aria-modal="true" aria-labelledby="dm-character-title">
        <button id="dm-character-close"></button>
        <h3 id="dm-character-title"></h3>
        <div id="dm-character-sheet"></div>
      </section>
    </div>
    ${includeLoadModals ? `
      <div id="modal-load" class="overlay hidden" aria-hidden="true"></div>
      <div id="modal-load-list" class="overlay hidden" aria-hidden="true"></div>
      <div id="load-confirm-text"></div>
    ` : ''}
  `;
}

beforeEach(() => {
  jest.resetModules();
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
  }
});

describe('DM character viewer tool', () => {
  test('shows character modal from DM tools menu', async () => {
    const listCharacters = jest.fn(async () => ['The DM']);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    const loadCharacter = jest.fn(async () => ({}));
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

    sessionStorage.setItem('dmLoggedIn', '1');

    document.body.innerHTML = buildDom();

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();

    expect(listCharacters).toHaveBeenCalled();
    const modal = document.getElementById('dm-characters-modal');
    expect(modal.classList.contains('hidden')).toBe(false);
  });

  test('clicking a character opens the character modal', async () => {
    const listCharacters = jest.fn(async () => ['Test']);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    const loadCharacter = jest.fn(async () => ({ str: 10 }));
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

    sessionStorage.setItem('dmLoggedIn', '1');

    document.body.innerHTML = buildDom({ includeLoadModals: true });

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();
    await new Promise(r => setTimeout(r, 0));
    const link = document.querySelector('#dm-characters-list a');
    link.click();
    await new Promise(r => setTimeout(r, 0));
    const view = document.getElementById('dm-character-sheet');
    const viewModal = document.getElementById('dm-character-modal');
    const rosterModal = document.getElementById('dm-characters-modal');
    expect(loadCharacter).toHaveBeenCalledWith('Test', { bypassPin: true });
    expect(viewModal.classList.contains('hidden')).toBe(false);
    expect(rosterModal.classList.contains('hidden')).toBe(true);
    expect(view.textContent).toContain('Test');

    document.getElementById('dm-character-close').click();
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(rosterModal.classList.contains('hidden')).toBe(false);
  });

  test('character card displays all character data', async () => {
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

    document.body.innerHTML = buildDom({ includeLoadModals: true });

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

  test('filters character list from search input', async () => {
    const listCharacters = jest.fn(async () => ['Alpha', 'Beta', 'Gamma']);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    const loadCharacter = jest.fn(async () => ({}));
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

    sessionStorage.setItem('dmLoggedIn', '1');

    document.body.innerHTML = buildDom();

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();
    await new Promise(r => setTimeout(r, 0));

    const search = document.getElementById('dm-characters-search');
    search.value = 'ga';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    const visibleNames = Array.from(document.querySelectorAll('#dm-characters-list .dm-characters__link')).map(link => link.textContent);
    expect(visibleNames).toEqual(['Gamma']);

    search.value = 'zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(document.getElementById('dm-characters-list').textContent).toContain('No matching characters.');
  });

  test('preserves focus when resorting characters', async () => {
    const listCharacters = jest.fn(async () => ['Alpha', 'Beta', 'Gamma']);
    const currentCharacter = jest.fn(() => null);
    const setCurrentCharacter = jest.fn();
    const loadCharacter = jest.fn(async () => ({}));
    jest.unstable_mockModule('../scripts/characters.js', () => ({ listCharacters, currentCharacter, setCurrentCharacter, loadCharacter }));

    sessionStorage.setItem('dmLoggedIn', '1');

    document.body.innerHTML = buildDom();

    await import('../scripts/dm.js');

    document.getElementById('dm-tools-characters').click();
    await new Promise(r => setTimeout(r, 0));

    const links = Array.from(document.querySelectorAll('#dm-characters-list .dm-characters__link'));
    links[1].focus();
    expect(document.activeElement.dataset.characterName).toBe('Beta');

    const sortDesc = document.querySelector('[data-char-sort="desc"]');
    sortDesc.click();
    await new Promise(r => setTimeout(r, 0));

    expect(document.activeElement.dataset.characterName).toBe('Beta');
    const ordered = Array.from(document.querySelectorAll('#dm-characters-list .dm-characters__link')).map(link => link.dataset.characterName);
    expect(ordered).toEqual(['Gamma', 'Beta', 'Alpha']);
  });
});
