import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="log-action"></div>
    <div id="full-log-action"></div>
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

describe('action log marks DM actions', () => {
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    setupDom();
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addListener: () => {}, removeListener: () => {} });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => null,
    });
    window.confirm = jest.fn(() => true);
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
  });

  test('prefixes entries with DM when logged in', () => {
    sessionStorage.setItem('dmLoggedIn', '1');
    window.logAction('Test event');
    const log = JSON.parse(localStorage.getItem('action-log'));
    const last = log[log.length - 1];
    expect(last.text).toBe('DM: Test event');
  });
});

