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

describe('rename save to vigilante name', () => {
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    setupDom();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null });
    window.confirm = jest.fn(() => true);
    console.error = jest.fn();
    localStorage.setItem('save:Bruce', '{}');
    localStorage.setItem('last-save', 'Bruce');
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
  });

  test('saving renames existing save to vigilante name', async () => {
    const input = document.getElementById('superhero');
    input.value = 'Batman';
    document.getElementById('btn-save').click();
    await new Promise(res => setTimeout(res, 0));
    expect(localStorage.getItem('save:Batman')).not.toBeNull();
    expect(localStorage.getItem('save:Bruce')).toBeNull();
  });
});
