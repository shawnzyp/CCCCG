import { jest } from '@jest/globals';

describe('new character reset', () => {
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
      add: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      click: () => {},
      textContent: '',
      disabled: false,
      checked: false,
      hidden: false
    };

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
});
