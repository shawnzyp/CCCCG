import { jest } from '@jest/globals';

describe('Resonance Points tracker', () => {
  test('clicking a dot updates the displayed RP value', async () => {
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
          <button type="button" class="rp-dot" data-rp="1" aria-pressed="false"></button>
          <button type="button" class="rp-dot" data-rp="2" aria-pressed="false"></button>
          <button type="button" class="rp-dot" data-rp="3" aria-pressed="false"></button>
          <button type="button" class="rp-dot" data-rp="4" aria-pressed="false"></button>
          <button type="button" class="rp-dot" data-rp="5" aria-pressed="false"></button>
        </div>
        <button id="rp-reset"></button>
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

    const dot = document.querySelector('.rp-dot[data-rp="3"]');
    dot.click();

    const output = document.getElementById('rp-value');
    expect(output.textContent).toBe('3');
    expect(output.value).toBe('3');
  });
});

