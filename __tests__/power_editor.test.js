import { jest } from '@jest/globals';

const originalGetElementById = document.getElementById;
const originalMatchMedia = window.matchMedia;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalConsoleError = console.error;

function stubMissingElements() {
  const realGet = originalGetElementById.bind(document);
  document.getElementById = (id) => {
    const found = realGet(id);
    if (found) return found;
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
      removeChild: () => {},
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
      removeAttribute: () => {},
    };
  };
}

function restoreGetElementById() {
  document.getElementById = originalGetElementById;
}

function ensureTestDom() {
  document.body.innerHTML = `
    <div data-launch-shell>
      <button id="btn-view-mode"></button>
      <div id="powers"></div>
      <div id="sigs"></div>
      <button id="add-power" type="button"><span class="btn-label">Add Power</span></button>
      <button id="add-sig" type="button"><span class="btn-label">Add Signature Move</span></button>
    </div>
    <div class="overlay hidden" id="modal-power-editor" aria-hidden="true" data-modal-static data-view-allow>
      <div class="modal modal-power-editor" role="dialog" aria-modal="true" aria-labelledby="power-editor-title" tabindex="-1" data-view-allow>
        <button class="x" type="button" data-power-editor-dismiss aria-label="Close"></button>
        <h3 id="power-editor-title">Edit Power</h3>
        <div class="power-editor__content" data-role="power-editor-content" data-view-allow></div>
        <div class="actions power-editor__actions">
          <button class="btn-sm" type="button" data-power-editor-cancel>Cancel</button>
          <button class="btn-sm btn-primary" type="button" data-power-editor-save>Save</button>
        </div>
      </div>
    </div>
  `;
  stubMissingElements();
}

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = '';
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });
  console.error = jest.fn();
  window.matchMedia = originalMatchMedia || (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  window.requestAnimationFrame = originalRequestAnimationFrame || (cb => { cb(); return 0; });
});

afterEach(() => {
  restoreGetElementById();
  if (originalMatchMedia) window.matchMedia = originalMatchMedia; else delete window.matchMedia;
  if (originalRequestAnimationFrame) window.requestAnimationFrame = originalRequestAnimationFrame; else delete window.requestAnimationFrame;
  console.error = originalConsoleError;
  delete global.fetch;
});

describe('power editor accessibility', () => {
  test('custom power option opens full editor with presets available', async () => {
    ensureTestDom();

    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const addPower = document.getElementById('add-power');
    addPower.click();

    const menu = document.querySelector('.power-preset-menu');
    expect(menu).not.toBeNull();
    expect(menu.dataset.open).toBe('true');

    const customBtn = menu.querySelector('.power-preset-menu__btn');
    expect(customBtn).not.toBeNull();
    customBtn.click();

    const overlay = document.getElementById('modal-power-editor');
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.style.display).toBe('flex');
    expect(overlay.getAttribute('aria-hidden')).toBe('false');

    const content = overlay.querySelector('.power-editor__content');
    expect(content).not.toBeNull();
    const selects = content.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(5);
    const styleSelect = Array.from(selects).find(sel => Array.from(sel.options).some(opt => opt.value === 'Physical Powerhouse'));
    expect(styleSelect).toBeDefined();
    const effectSelect = Array.from(selects).find(sel => Array.from(sel.options).some(opt => opt.value === 'Damage'));
    expect(effectSelect).toBeDefined();

    const cancel = overlay.querySelector('[data-power-editor-cancel]');
    cancel.click();
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  test('add signature move opens editor while in view mode', async () => {
    localStorage.setItem('view-mode', 'view');
    ensureTestDom();

    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(document.body.classList.contains('is-view-mode')).toBe(true);

    document.getElementById('add-sig').click();

    const overlay = document.getElementById('modal-power-editor');
    expect(overlay.classList.contains('hidden')).toBe(false);
    const content = overlay.querySelector('.power-editor__content');
    expect(content).not.toBeNull();

    const inputs = content.querySelectorAll('input, select, textarea');
    expect(inputs.length).toBeGreaterThan(5);
    const nameInput = content.querySelector('input[type="text"]');
    expect(nameInput).not.toBeNull();
    const intensitySelect = Array.from(content.querySelectorAll('select')).find(sel => Array.from(sel.options).some(opt => opt.value === 'Ultimate'));
    expect(intensitySelect).toBeDefined();
    const descriptionArea = content.querySelector('textarea');
    expect(descriptionArea).not.toBeNull();

    overlay.querySelector('[data-power-editor-cancel]').click();
    expect(overlay.classList.contains('hidden')).toBe(true);
  });
});
