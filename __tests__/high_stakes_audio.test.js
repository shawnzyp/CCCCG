import { jest } from '@jest/globals';

function createStubElement() {
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
}

describe('high-stakes audio cues', () => {
  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });
    window.matchMedia = window.matchMedia || (() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: () => Promise.resolve(),
        ready: Promise.resolve({ active: null }),
        addEventListener: () => {},
        removeEventListener: () => {},
        controller: null,
      },
    });

    document.body.innerHTML = `
      <div id="statuses"></div>
      <div id="log-action"></div>
      <div id="full-log-action"></div>
      <div id="sp-controls">
        <output id="sp-pill"></output>
        <input id="sp-bar" value="3" max="3" />
        <input id="sp-temp" value="0" />
        <button id="sp-full" type="button"></button>
        <button id="sp-dec" type="button" data-sp="-1"></button>
        <div id="sp-animation"></div>
      </div>
      <div id="hp-controls">
        <output id="hp-pill"></output>
        <input id="hp-bar" value="3" max="3" />
        <input id="hp-temp" value="0" />
        <input id="hp-amt" value="3" />
        <button id="hp-dmg" type="button"></button>
        <div id="damage-animation"></div>
        <div id="down-animation"></div>
        <div id="death-animation"></div>
      </div>
      <fieldset id="death-saves" disabled hidden>
        <input type="checkbox" id="death-success-1" />
        <input type="checkbox" id="death-success-2" />
        <input type="checkbox" id="death-success-3" />
        <input type="checkbox" id="death-fail-1" />
        <input type="checkbox" id="death-fail-2" />
        <input type="checkbox" id="death-fail-3" />
      </fieldset>
      <div id="death-save-out"></div>
      <select id="death-save-mode"><option value="normal">Normal</option></select>
      <input id="death-save-mod" value="0" />
      <button id="death-save-reset" type="button"></button>
      <div id="sp-settings-toggle"></div>
      <div id="modal-sp-settings"></div>
      <div id="heal-animation"></div>
      <div id="coin-animation"></div>
      <div id="sp-settings"></div>
      <div id="sp-temp-wrapper"></div>
    `;

    const realGet = document.getElementById.bind(document);
    document.getElementById = (id) => realGet(id) || createStubElement();

    console.error = jest.fn();
    window.dmNotify = jest.fn();
    window.logAction = jest.fn();
  });

  afterEach(() => {
    delete window.__cccgTestAudioHook;
  });

  test('each high-stakes handler emits its bespoke cue', async () => {
    const hook = jest.fn();
    window.__cccgTestAudioHook = hook;
    const eventHook = jest.fn();
    window.addEventListener('cccg:audio-cue', eventHook);

    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Status gained cue
    const statusCheckbox = document.querySelector('#statuses input[type="checkbox"]');
    expect(statusCheckbox).toBeTruthy();
    statusCheckbox.checked = true;
    statusCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(hook).toHaveBeenCalledWith('status-alert');

    // Exhaust SP cue
    hook.mockClear();
    eventHook.mockClear();
    const spBar = document.getElementById('sp-bar');
    spBar.value = '1';
    const testHooks = window.__cccgTestHooks || {};
    expect(typeof testHooks.setSP).toBe('function');
    await testHooks.setSP(0);
    expect(spBar.value).toBe('0');
    expect(eventHook).toHaveBeenCalledWith(expect.objectContaining({ detail: { cue: 'sp-exhausted' } }));
    expect(typeof window.__cccgTestAudioHook).toBe('function');
    expect(hook).toHaveBeenCalledWith('sp-exhausted');

    // Player down cue
    hook.mockClear();
    expect(typeof testHooks.playDownAnimation).toBe('function');
    await testHooks.playDownAnimation();
    expect(hook).toHaveBeenCalledWith('down');

    // Death save failure cue
    hook.mockClear();
    expect(typeof testHooks.playDeathAnimation).toBe('function');
    await testHooks.playDeathAnimation();
    expect(hook).toHaveBeenCalledWith('death');
  });
});
