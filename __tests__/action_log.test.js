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
    <div id="campaign-log"></div>
    <textarea id="campaign-entry"></textarea>
    <button id="campaign-add"></button>
    <div id="log-action"></div>
    <div id="full-log-action"></div>
    <button id="btn-log"></button>
    <button id="log-full"></button>
    <button id="btn-campaign"></button>
    <input id="cap-check" type="checkbox" />
    <span id="cap-status">Available</span>
    <input id="xp" value="0" />
    <progress id="xp-bar"></progress>
    <span id="xp-pill"></span>
    <input id="tier" />
    <span id="omni-rep-tier"></span>
    <progress id="omni-rep-bar"></progress>
    <p id="omni-rep-perk"></p>
    <button id="omni-rep-gain"></button>
    <button id="omni-rep-lose"></button>
    <input type="hidden" id="omni-rep" value="200" />
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

describe('action log records key events', () => {
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
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

  test('logs tier changes', () => {
    const xp = document.getElementById('xp');
    // initialize XP processing
    xp.dispatchEvent(new Event('input'));
    xp.value = '2000';
    xp.dispatchEvent(new Event('input'));
    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.includes('Tier:'))).toBe(true);
  });

  test('logs faction reputation rank changes', () => {
    const rep = document.getElementById('omni-rep');
    rep.value = '295';
    document.getElementById('omni-rep-gain').click();
    const log = JSON.parse(localStorage.getItem('action-log'));
    const last = log[log.length - 1];
    expect(last.text).toBe('O.M.N.I. Reputation: Neutral -> Recognized');
  });

  test('logs Cinematic Action Point usage', () => {
    const cap = document.getElementById('cap-check');
    cap.checked = true;
    cap.dispatchEvent(new Event('change'));
    const log = JSON.parse(localStorage.getItem('action-log'));
    const last = log[log.length - 1];
    expect(last.text).toBe('Cinematic Action Point: Available -> Used');
  });
});

