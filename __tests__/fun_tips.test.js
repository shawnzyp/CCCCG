import { getNextTip, tips } from '../scripts/funTips.js';

test('getNextTip cycles through tips without repeats until all are shown', () => {
  const seen = new Set();
  for (let i = 0; i < tips.length; i++) {
    const tip = getNextTip();
    expect(seen.has(tip)).toBe(false);
    seen.add(tip);
  }
  expect(seen.size).toBe(tips.length);
});
