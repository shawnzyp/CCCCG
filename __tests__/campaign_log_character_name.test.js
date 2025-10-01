import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="abil-grid"></div>
    <div id="saves"></div>
    <div id="skills"></div>
    <div id="powers"></div>
    <div id="sigs"></div>
    <div id="weapons"></div>
    <div id="armors"></div>
    <div id="items"></div>
    <div id="campaign-log"></div>
    <textarea id="campaign-entry"></textarea>
    <button id="campaign-add"></button>
    <div id="toast"></div>
    <div id="save-animation"></div>
    <button id="btn-save"></button>
    <input id="superhero" />
    <input id="secret" />
  `;
  const realGet = document.getElementById.bind(document);
  document.getElementById = (id) =>
    realGet(id) || {
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
      add: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      click: () => {},
      textContent: '',
      disabled: false,
      checked: false,
      hidden: false,
    };
}

describe('campaign log includes character name', () => {
  let characters;
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    setupDom();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => null,
    });
    window.confirm = jest.fn(() => true);
    await import('../scripts/main.js');
    characters = await import('../scripts/characters.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
  });

  test('defaults to mysterious force when no character loaded', () => {
    const entry = document.getElementById('campaign-entry');
    entry.value = 'Test note';
    document.getElementById('campaign-add').click();
    const stored = JSON.parse(localStorage.getItem('campaign-log'));
    expect(stored[stored.length - 1].name).toBe('A Mysterious Force');
  });

  test('records active character name once loaded', () => {
    characters.setCurrentCharacter('Alice');
    const entry = document.getElementById('campaign-entry');
    entry.value = 'Hero note';
    document.getElementById('campaign-add').click();
    const stored = JSON.parse(localStorage.getItem('campaign-log'));
    expect(stored[stored.length - 1].name).toBe('Alice');
  });
});

