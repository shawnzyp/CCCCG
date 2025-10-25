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
    <div id="toast"></div>
    <div id="save-animation"></div>
    <button id="btn-save"></button>
    <input id="superhero" />
    <input id="secret" />
    <div id="char-list"></div>
    <div id="recover-char-list"></div>
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

describe('character list displays names with quotes', () => {
  beforeEach(async () => {
    jest.resetModules();
    setupDom();
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '', json: async () => null });
    await jest.unstable_mockModule('../scripts/characters.js', () => ({
      currentCharacter: jest.fn().mockReturnValue(null),
      setCurrentCharacter: jest.fn(),
      listCharacters: jest.fn().mockResolvedValue(['Nico "Specter" Alvarez']),
      loadCharacter: jest.fn(),
      loadBackup: jest.fn(),
      listBackups: jest.fn().mockResolvedValue([]),
      deleteCharacter: jest.fn(),
      saveCharacter: jest.fn(),
      renameCharacter: jest.fn(),
      listRecoverableCharacters: jest.fn().mockResolvedValue([]),
      saveAutoBackup: jest.fn(),
    }));
    await import('../scripts/main.js');
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('renders quoted character names', async () => {
    const { publish } = await import('../scripts/event-bus.js');
    publish('character-saved', 'Nico "Specter" Alvarez');
    await new Promise(res => setTimeout(res, 0));
    const anchor = Array.from(document.querySelectorAll('[data-char]')).find(
      el => el.dataset.char === 'Nico "Specter" Alvarez'
    );
    expect(anchor).not.toBeNull();
    expect(anchor.textContent).toBe('Nico "Specter" Alvarez');
  });
});

