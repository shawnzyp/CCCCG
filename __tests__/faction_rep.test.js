import { jest } from '@jest/globals';
import { setupFactionRepTracker, migratePublicOpinionSnapshot } from '../scripts/faction.js';

describe('faction reputation tracker', () => {
  afterEach(() => {
    delete window.logAction;
  });

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

  test('public opinion uses common rules and five-point adjustments', () => {
    document.body.innerHTML = `
      <div>
        <progress id="public-rep-bar" max="100" value="0"></progress>
        <span id="public-rep-tier"></span>
        <p id="public-rep-perk"></p>
        <button id="public-rep-gain"></button>
        <button id="public-rep-lose"></button>
        <input type="hidden" id="public-rep" value="495" />
      </div>
    `;
    const pushHistory = jest.fn();
    const handlePerkEffects = jest.fn();
    window.logAction = jest.fn();

    setupFactionRepTracker(handlePerkEffects, pushHistory);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const repInput = document.getElementById('public-rep');
    const bar = document.getElementById('public-rep-bar');
    expect(repInput.value).toBe('495');
    expect(bar.max).toBe(699);
    expect(bar.value).toBe(495);
    const tier = document.getElementById('public-rep-tier');
    expect(tier.textContent).toBe('Trusted');
    const perk = document.getElementById('public-rep-perk');
    expect(perk.textContent).toContain('Persuasion checks with civilians');

    document.getElementById('public-rep-gain').click();
    expect(repInput.value).toBe('500');
    expect(bar.value).toBe(500);
    expect(tier.textContent).toBe('Favored');
    expect(window.logAction).toHaveBeenCalledWith('Public Opinion Reputation: Trusted -> Favored');

    document.getElementById('public-rep-lose').click();
    expect(repInput.value).toBe('495');
    expect(bar.value).toBe(495);
    expect(tier.textContent).toBe('Trusted');
    expect(pushHistory).toHaveBeenCalledTimes(2);
    expect(handlePerkEffects).toHaveBeenCalled();
  });

  test('government faction uses custom tiers and perks', () => {
    document.body.innerHTML = `
      <div>
        <progress id="government-rep-bar" max="100" value="0"></progress>
        <span id="government-rep-tier"></span>
        <p id="government-rep-perk"></p>
        <button id="government-rep-gain"></button>
        <button id="government-rep-lose"></button>
        <input type="hidden" id="government-rep" value="295" />
      </div>
    `;
    const pushHistory = jest.fn();
    const handlePerkEffects = jest.fn();
    window.logAction = jest.fn();

    setupFactionRepTracker(handlePerkEffects, pushHistory);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const repInput = document.getElementById('government-rep');
    const bar = document.getElementById('government-rep-bar');
    expect(repInput.value).toBe('295');
    expect(bar.max).toBe(599);
    expect(bar.getAttribute('max')).toBe('599');
    expect(bar.value).toBe(295);
    const tier = document.getElementById('government-rep-tier');
    expect(tier.textContent).toBe('Neutral');
    const perk = document.getElementById('government-rep-perk');
    expect(perk.textContent).toContain('Baseline funding');
    expect(handlePerkEffects).toHaveBeenCalled();

    handlePerkEffects.mockClear();
    document.getElementById('government-rep-gain').click();

    expect(repInput.value).toBe('300');
    expect(bar.value).toBe(300);
    expect(tier.textContent).toBe('Supported');
    expect(window.logAction).toHaveBeenCalledWith('The Government Reputation: Neutral -> Supported');
    expect(handlePerkEffects).toHaveBeenCalled();
    expect(pushHistory).toHaveBeenCalled();
  });

  test('migrates legacy public opinion values to the new scale', () => {
    const snapshot = {
      'public-rep': '-3',
      'public-rep-bar': '7',
    };

    migratePublicOpinionSnapshot(snapshot);

    expect(snapshot['public-rep']).toBe('150');
    expect(snapshot['public-rep-bar']).toBe('150');
  });
});
