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

    expect(document.getElementById('omni-rep').value).toBe('205');
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

    expect(document.getElementById('omni-rep').value).toBe('195');
    expect(pushHistory).toHaveBeenCalled();
  });
});
