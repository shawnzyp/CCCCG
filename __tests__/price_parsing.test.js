import { extractPriceValue } from '../scripts/catalog-utils.js';

describe('extractPriceValue', () => {
  test('returns numeric value for plain numbers', () => {
    expect(extractPriceValue('1200')).toBe(1200);
  });

  test('handles currency symbols and separators', () => {
    expect(extractPriceValue('₡1,200')).toBe(1200);
    expect(extractPriceValue('1,200 Cr')).toBe(1200);
  });

  test('extracts the largest numeric value from mixed text', () => {
    expect(extractPriceValue('Pack of 3 for 1,500 credits')).toBe(1500);
    expect(extractPriceValue('Cr 3,500 (x3 bundle)')).toBe(3500);
  });

  test('supports decimal prices', () => {
    expect(extractPriceValue('Cost: 42.5 Cr')).toBe(42.5);
  });

  test('returns null when no positive price is present', () => {
    expect(extractPriceValue('Free item')).toBeNull();
    expect(extractPriceValue('0')).toBeNull();
    expect(extractPriceValue('')).toBeNull();
  });
});
