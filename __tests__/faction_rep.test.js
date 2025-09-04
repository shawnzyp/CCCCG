import { jest } from '@jest/globals';
import { setupFactionRepTracker } from '../scripts/faction.js';

describe('faction reputation tracker', () => {
  test('gain button updates value and pushes history', () => {
    document.body.innerHTML = `
      <div>
        <progress id="omni-rep-bar" max="100" value="0"></progress>
        <span id="omni-rep-tier"></span>
        <p id="omni-rep-perk"></p>
        <button id="omni-rep-gain"></button>
        <button id="omni-rep-lose"></button>
        <input type="hidden" id="omni-rep" value="200" />
      </div>
    `;
    const pushHistory = jest.fn();
    const handlePerkEffects = jest.fn();

    setupFactionRepTracker(handlePerkEffects, pushHistory);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('omni-rep-gain').click();

    const repInput = document.getElementById('omni-rep');
    const bar = document.getElementById('omni-rep-bar');
    expect(repInput.value).toBe('205');
    expect(bar.value).toBe(205);
    expect(bar.max).toBe(699);
    expect(bar.getAttribute('value')).toBe('205');
    expect(bar.getAttribute('max')).toBe('699');
    const expectedHue = 120 * (205 / 699);
    const expectedColor = `hsl(${expectedHue}, 70%, 50%)`;
    expect(bar.style.getPropertyValue('--progress-color')).toBe(expectedColor);
    const tier = document.getElementById('omni-rep-tier');
    expect(tier.style.getPropertyValue('--progress-color')).toBe(expectedColor);
    expect(pushHistory).toHaveBeenCalled();
  });

  test('lose button updates value and pushes history', () => {
    document.body.innerHTML = `
      <div>
        <progress id="omni-rep-bar" max="100" value="0"></progress>
        <span id="omni-rep-tier"></span>
        <p id="omni-rep-perk"></p>
        <button id="omni-rep-gain"></button>
        <button id="omni-rep-lose"></button>
        <input type="hidden" id="omni-rep" value="200" />
      </div>
    `;
    const pushHistory = jest.fn();
    const handlePerkEffects = jest.fn();

    setupFactionRepTracker(handlePerkEffects, pushHistory);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('omni-rep-lose').click();

    const repInput = document.getElementById('omni-rep');
    const bar = document.getElementById('omni-rep-bar');
    expect(repInput.value).toBe('195');
    expect(bar.value).toBe(195);
    expect(bar.max).toBe(699);
    expect(bar.getAttribute('value')).toBe('195');
    expect(bar.getAttribute('max')).toBe('699');
    const expectedHue = 120 * (195 / 699);
    const expectedColor = `hsl(${expectedHue}, 70%, 50%)`;
    expect(bar.style.getPropertyValue('--progress-color')).toBe(expectedColor);
    const tier = document.getElementById('omni-rep-tier');
    expect(tier.style.getPropertyValue('--progress-color')).toBe(expectedColor);
    expect(pushHistory).toHaveBeenCalled();
  });
});
