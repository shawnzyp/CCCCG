import { jest } from '@jest/globals';

if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
}

describe('credits autosave to cloud', () => {
  test('saves character when credits updated', async () => {
    const saveCharacter = jest.fn().mockResolvedValue();

    jest.unstable_mockModule('../scripts/helpers.js', () => ({
      $: (id) => document.getElementById(id),
      qs: (sel) => document.querySelector(sel),
      qsa: (sel) => Array.from(document.querySelectorAll(sel)),
      num: Number,
      mod: () => 0,
      calculateArmorBonus: () => 0,
      revertAbilityScore: () => 0,
    }));

    jest.unstable_mockModule('../scripts/faction.js', () => ({
      setupFactionRepTracker: () => {},
      ACTION_HINTS: {},
      updateFactionRep: () => {},
    }));

    jest.unstable_mockModule('../scripts/characters.js', () => ({
      currentCharacter: () => 'Alice',
      setCurrentCharacter: jest.fn(),
      listCharacters: jest.fn(),
      loadCharacter: jest.fn(),
      loadBackup: jest.fn(),
      listBackups: jest.fn(),
      deleteCharacter: jest.fn(),
      saveCharacter,
      renameCharacter: jest.fn(),
      listRecoverableCharacters: jest.fn(),
    }));

    jest.unstable_mockModule('../scripts/modal.js', () => ({ show: jest.fn(), hide: jest.fn() }));

    jest.unstable_mockModule('../scripts/storage.js', () => ({ cacheCloudSaves: () => {}, subscribeCloudSaves: () => {} }));

    global.toast = jest.fn();
    global.confirm = jest.fn(() => true);
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });

    document.body.innerHTML = `
      <input id="credits" value="0" />
      <span id="credits-total-pill"></span>
      <span id="credits-total-modal"></span>
      <button id="credits-open"></button>
      <input id="credits-amt" />
      <select id="credits-mode"><option value="add" selected>Add</option></select>
      <button id="credits-submit"></button>
    `;

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

    document.getElementById('credits-amt').value = '50';
    document.getElementById('credits-submit').click();

    expect(saveCharacter).toHaveBeenCalled();
  });
});
