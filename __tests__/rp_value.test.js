import { jest } from '@jest/globals';

describe('Resonance Points tracker', () => {
  test('adjusting RP via buttons updates the displayed value and bank indicator', async () => {
    // Stub fetch to avoid network requests for optional assets like rules text.
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });

    document.body.innerHTML = `
      <div id="abil-grid"></div>
      <div id="saves"></div>
      <div id="skills"></div>
      <fieldset id="resonance-points">
        <div class="rp-row">
          <output id="rp-value" aria-live="polite">0</output>
        </div>
      <div class="rp-track" role="group">
          <button type="button" id="rp-dec">-</button>
          <button type="button" class="rp-dot" data-rp="1" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="2" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="3" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="4" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="5" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="6" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="7" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="8" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="9" aria-pressed="false" disabled></button>
          <button type="button" class="rp-dot" data-rp="10" aria-pressed="false" disabled></button>
          <button type="button" id="rp-inc">+</button>
        </div>
        <div id="rp-banked"></div>
        <input type="checkbox" id="rp-trigger" />
        <button id="rp-clear-aftermath"></button>
        <span id="rp-surge-state"></span>
        <span id="rp-tag-active"></span>
        <span id="rp-tag-aftermath"></span>
      </fieldset>
    `;

    // Return stub elements for any ids not defined above so that the large
    // main script can attach listeners without throwing errors during import.
    const realGet = document.getElementById.bind(document);
    document.getElementById = (id) => realGet(id) || {
      innerHTML: '',
      value: '',
      style: {},
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

    // Import after DOM is ready so the RP module can bind to elements.
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const inc = document.getElementById('rp-inc');
    inc.click();
    inc.click();
    inc.click();

    const output = document.getElementById('rp-value');
    expect(output.textContent).toBe('3');
    expect(output.value).toBe('3');
    expect(output.getAttribute('value')).toBe('3');

    const banked = document.getElementById('rp-banked');
    expect(banked.hidden).toBe(true);

    for (let i = 0; i < 2; i++) inc.click();
    const indicator = document.getElementById('rp-banked');
    expect(indicator.hidden).toBe(false);
    expect(indicator.textContent).toBe('1 Banked Surge');
  });
});

