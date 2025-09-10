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
    hidden: false,
  };
}

describe('auto character naming on save', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    setupDom();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null });
    window.confirm = jest.fn(() => true);
    console.error = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
  });

  test('uses secret identity when vigilante is blank', async () => {
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('secret').value = 'Bruce';
    document.getElementById('btn-save').click();
    await new Promise(res => setTimeout(res, 0));
    expect(localStorage.getItem('save:Bruce')).not.toBeNull();
  });

  test('prioritizes vigilante name over secret identity', async () => {
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('superhero').value = 'Batman';
    document.getElementById('secret').value = 'Bruce';
    document.getElementById('btn-save').click();
    await new Promise(res => setTimeout(res, 0));
    expect(localStorage.getItem('save:Batman')).not.toBeNull();
    expect(localStorage.getItem('save:Bruce')).toBeNull();
  });
});
