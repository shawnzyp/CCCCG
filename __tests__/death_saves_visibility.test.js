import { jest } from '@jest/globals';

const nativeGetElementById = document.getElementById.bind(document);

function createStubElement() {
  return {
    innerHTML: '',
    value: '',
    style: { setProperty: () => {}, getPropertyValue: () => '', removeProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    setAttribute(name, value) {
      this.attributes[name] = String(value ?? '');
      if (name === 'disabled') this.disabled = true;
      if (name === 'hidden') this.hidden = true;
      if (name === 'aria-hidden') this['aria-hidden'] = String(value ?? '');
      if (name === 'inert') this.inert = true;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'disabled') this.disabled = false;
      if (name === 'hidden') this.hidden = false;
      if (name === 'aria-hidden') delete this['aria-hidden'];
      if (name === 'inert') delete this.inert;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    },
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
    dataset: {},
    attributes: {},
    add: () => {},
    remove: () => {},
    options: [],
  };
}

function setupDom() {
  document.body.innerHTML = `
    <progress id="hp-bar" max="30" value="30"></progress>
    <span id="hp-pill"></span>
    <input id="hp-temp" value="0" />
    <input id="hp-roll" value="0" />
    <input id="hp-amt" value="" />
    <button id="hp-dmg" type="button"></button>
    <button id="hp-heal" type="button"></button>
    <button id="hp-full" type="button"></button>
    <button id="hp-settings-toggle" type="button"></button>
    <div id="modal-hp-settings"></div>
    <fieldset id="death-saves" hidden disabled>
      <div class="death-saves-grid">
        <div class="death-save-tracks">
          <div class="death-save-group">
            <input type="checkbox" id="death-success-1" />
            <input type="checkbox" id="death-success-2" />
            <input type="checkbox" id="death-success-3" />
          </div>
          <div class="death-save-group">
            <input type="checkbox" id="death-fail-1" />
            <input type="checkbox" id="death-fail-2" />
            <input type="checkbox" id="death-fail-3" />
          </div>
        </div>
        <span id="death-save-out"></span>
        <div class="death-save-buttons">
          <button id="roll-death-save" type="button"></button>
          <button id="death-save-reset" type="button"></button>
        </div>
      </div>
    </fieldset>
  `;

  document.getElementById = (id) => nativeGetElementById(id) || createStubElement();
}

describe('death saves visibility', () => {
  beforeEach(() => {
    jest.resetModules();
    setupDom();
    if (!window.matchMedia) {
      window.matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      });
    }
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '', json: async () => ({}) });
    window.toast = jest.fn();
    window.logAction = jest.fn();
    window.dmNotify = jest.fn();
    window.coverFloatingLauncher = jest.fn();
    window.releaseFloatingLauncher = jest.fn();
    window.pushHistory = jest.fn();
    window.confirm = jest.fn(() => true);
    console.error = jest.fn();
  });

  afterEach(() => {
    document.getElementById = nativeGetElementById;
    delete global.fetch;
    delete window.toast;
    delete window.logAction;
    delete window.dmNotify;
    delete window.coverFloatingLauncher;
    delete window.releaseFloatingLauncher;
    delete window.pushHistory;
    delete window.confirm;
  });

  test('card toggles visibility based on HP and requires resolution to reset', async () => {
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    const card = document.getElementById('death-saves');
    expect(card.hasAttribute('hidden')).toBe(true);
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(card.hasAttribute('inert')).toBe(true);
    expect(card.disabled).toBe(true);

    const hpAmt = document.getElementById('hp-amt');
    hpAmt.value = '30';
    document.getElementById('hp-dmg').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(card.hasAttribute('hidden')).toBe(false);
    expect(card.getAttribute('aria-hidden')).toBeNull();
    expect(card.hasAttribute('inert')).toBe(false);
    expect(card.disabled).toBe(false);

    const resetBtn = document.getElementById('death-save-reset');
    expect(resetBtn.disabled).toBe(true);

    ['death-success-1', 'death-success-2', 'death-success-3'].forEach(id => {
      const box = document.getElementById(id);
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    });
    await Promise.resolve();

    expect(resetBtn.disabled).toBe(false);

    resetBtn.click();
    await Promise.resolve();

    ['death-success-1', 'death-success-2', 'death-success-3', 'death-fail-1', 'death-fail-2', 'death-fail-3'].forEach(id => {
      expect(document.getElementById(id).checked).toBe(false);
    });
    expect(resetBtn.disabled).toBe(true);
    expect(card.hasAttribute('hidden')).toBe(false);

    hpAmt.value = '1';
    document.getElementById('hp-heal').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(card.hasAttribute('hidden')).toBe(true);
    expect(card.getAttribute('aria-hidden')).toBe('true');
    expect(card.hasAttribute('inert')).toBe(true);
  });
});

