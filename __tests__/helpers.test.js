import { num, mod, calculateArmorBonus, proficiencyBonus, wizardProgress } from '../scripts/helpers.js';

describe('num', () => {
  test('converts strings to numbers and defaults to 0', () => {
    expect(num('5')).toBe(5);
    expect(num('abc')).toBe(0);
  });
});

describe('mod', () => {
  test('calculates ability modifiers', () => {
    expect(mod(10)).toBe(0);
    expect(mod(15)).toBe(2);
  });
});

describe('proficiencyBonus', () => {
  test('computes proficiency bonus from level', () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus('12')).toBe(4);
  });
});

describe('calculateArmorBonus', () => {
  test('aggregates equipped armor bonuses correctly', () => {
    document.body.innerHTML = `
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped" checked>
        <input data-f="bonus" value="2">
        <select data-f="slot"><option>Body</option></select>
      </div>
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped" checked>
        <input data-f="bonus" value="4">
        <select data-f="slot"><option>Body</option></select>
      </div>
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped" checked>
        <input data-f="bonus" value="1">
        <select data-f="slot"><option>Head</option></select>
      </div>
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped" checked>
        <input data-f="bonus" value="3">
        <select data-f="slot"><option>Shield</option></select>
      </div>
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped" checked>
        <input data-f="bonus" value="2">
        <select data-f="slot"><option>Misc</option></select>
      </div>
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped">
        <input data-f="bonus" value="99">
        <select data-f="slot"><option>Head</option></select>
      </div>
    `;
    expect(calculateArmorBonus()).toBe(10);
  });
});

describe('wizardProgress', () => {
  test('formats current step out of total', () => {
    expect(wizardProgress(0, 3)).toBe('Step 1 of 3');
    expect(wizardProgress(2, 3)).toBe('Step 3 of 3');
  });
});
