import { jest } from '@jest/globals';

// Ensure matchMedia exists for main.js if referenced
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
}

describe('DM load from character list', () => {
  test('hides character list before DM login', async () => {
    const loadCharacter = jest.fn(async () => ({}));
    const hide = jest.fn();
    const show = jest.fn();

    jest.unstable_mockModule('../scripts/helpers.js', () => ({
      $: (id) => document.getElementById(id),
      qs: (sel) => document.querySelector(sel),
      qsa: (sel) => Array.from(document.querySelectorAll(sel)),
      num: Number,
      mod: (a, b) => ((a % b) + b) % b,
      calculateArmorBonus: () => 0,
      revertAbilityScore: () => 0,
    }));

    jest.unstable_mockModule('../scripts/faction.js', () => ({
      setupFactionRepTracker: () => {},
      ACTION_HINTS: {},
      updateFactionRep: () => {},
    }));

    jest.unstable_mockModule('../scripts/characters.js', () => ({
      currentCharacter: () => null,
      setCurrentCharacter: jest.fn(),
      listCharacters: jest.fn(async () => ['The DM']),
      loadCharacter,
      loadBackup: jest.fn(),
      listBackups: jest.fn(),
      deleteCharacter: jest.fn(),
      saveCharacter: jest.fn(),
    }));

    jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });
    global.toast = jest.fn();
    global.confirm = jest.fn(() => true);

    document.body.innerHTML = `
      <div id="char-list">
        <div class="catalog-item"><button data-char="The DM">The DM</button></div>
      </div>
      <div id="modal-load-list"></div>
      <div id="dm-login"></div>
      <div id="dm-tools-menu"></div>
      <button id="dm-tools-tsomf"></button>
      <button id="dm-tools-notifications"></button>
      <button id="dm-tools-logout"></button>
      <div id="dm-login-modal" class="hidden" aria-hidden="true">
        <input id="dm-login-pin" />
        <button id="dm-login-submit"></button>
      </div>
      <div id="dm-notifications-modal"></div>
      <div id="dm-notifications-list"></div>
    `;

    // Fallback stub elements for IDs queried elsewhere in main.js
    const realGet = document.getElementById.bind(document);
    document.getElementById = (id) => realGet(id) || {
      innerHTML: '',
      value: '',
      style: { setProperty: () => {}, getPropertyValue: () => '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      contains: () => false,
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      click: () => {},
      textContent: '',
      disabled: false,
      checked: false,
      hidden: false,
      add: () => {},
    };

    await import('../scripts/main.js');

    document.querySelector('[data-char="The DM"]').click();

    expect(hide).toHaveBeenCalledWith('modal-load-list');
    expect(loadCharacter).toHaveBeenCalledWith('The DM');
  });
});
