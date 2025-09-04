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
          <button type="button" id="rp-inc">+</button>
          <div class="rp-bank">
            <span class="rp-bank-label">Bank</span>
            <span class="rp-dot rp-bank-dot" data-bank="1" aria-pressed="false"></span>
            <span class="rp-dot rp-bank-dot" data-bank="2" aria-pressed="false"></span>
          </div>
        </div>
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
    const dec = document.getElementById('rp-dec');

    // At start, decrement should be disabled while increment is enabled.
    expect(dec.disabled).toBe(true);
    expect(inc.disabled).toBe(false);

    for (let i = 0; i < 5; i++) inc.click();

    const output = document.getElementById('rp-value');
    expect(output.textContent).toBe('5');
    expect(output.value).toBe('5');
    expect(output.getAttribute('value')).toBe('5');

    // Mid-range: both controls active.
    expect(dec.disabled).toBe(false);
    expect(inc.disabled).toBe(false);

    const bankDots = document.querySelectorAll('.rp-bank-dot');
    expect(bankDots[0].getAttribute('aria-pressed')).toBe('true');
    expect(bankDots[1].getAttribute('aria-pressed')).toBe('false');

    // Push to maximum to confirm increment disables at cap
    for (let i = 0; i < 5; i++) inc.click();
    expect(output.textContent).toBe('10');
    expect(inc.disabled).toBe(true);
    expect(dec.disabled).toBe(false);
  });
});

