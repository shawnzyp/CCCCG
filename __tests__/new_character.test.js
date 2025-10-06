import { jest } from '@jest/globals';

const originalGetElementById = document.getElementById;
const originalConsoleError = console.error;
const originalConfirm = window.confirm;
const originalPrompt = window.prompt;

function stubMissingElements(){
  const realGet = originalGetElementById.bind(document);
  document.getElementById = (id) => {
    const found = realGet(id);
    if(found) return found;
    return {
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
      dataset: {},
      closest: () => null,
    };
  };
}

describe('new character reset', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    document.getElementById = originalGetElementById;
    console.error = originalConsoleError;
    window.confirm = originalConfirm;
    window.prompt = originalPrompt;
    jest.clearAllMocks();
    delete global.fetch;
  });

  test('starting a new character resets ability scores and story fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });

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
      <button id="create-character"></button>
      <input id="superhero" />
    `;

    stubMissingElements();

    console.error = jest.fn();

    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('str').value = '18';
    document.getElementById('superhero').value = 'Vigilante';

    window.confirm = jest.fn().mockReturnValue(true);
    window.prompt = jest.fn().mockReturnValue('Hero');

    document.getElementById('create-character').click();

    expect(document.getElementById('str').value).toBe('10');
    expect(document.getElementById('superhero').value).toBe('');
  });

  test('creating a new character exits view mode for editing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });
    localStorage.setItem('view-mode', 'view');

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
      <button id="create-character"></button>
      <button id="btn-view-mode"></button>
      <input id="superhero" />
    `;

    stubMissingElements();

    console.error = jest.fn();

    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(document.body.classList.contains('is-view-mode')).toBe(true);

    window.confirm = jest.fn().mockReturnValue(true);
    window.prompt = jest.fn().mockReturnValue('New Hero');

    document.getElementById('create-character').click();

    expect(document.body.classList.contains('is-view-mode')).toBe(false);
    expect(localStorage.getItem('view-mode')).toBe('edit');
  });
});
