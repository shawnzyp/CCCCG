import { num, mod, calculateArmorBonus, proficiencyBonus, revertAbilityScore } from '../scripts/helpers.js';

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
    expect(proficiencyBonus(0)).toBe(2);
    expect(proficiencyBonus(-3)).toBe(2);
    expect(proficiencyBonus('abc')).toBe(2);
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

  test('ignores negative armor bonuses', () => {
    document.body.innerHTML = `
      <div data-kind="armor">
        <input type="checkbox" data-f="equipped" checked>
        <input data-f="bonus" value="-5">
        <select data-f="slot"><option>Head</option></select>
      </div>
    `;
    expect(calculateArmorBonus()).toBe(0);
  });
});

describe('revertAbilityScore', () => {
  test('decreases ability score by one without clamping to 10', () => {
    expect(revertAbilityScore(9)).toBe(8);
    expect(revertAbilityScore(1)).toBe(0);
  });
});
