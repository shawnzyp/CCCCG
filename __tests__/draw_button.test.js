import { jest } from '@jest/globals';
import '../shard-of-many-fates.js';

describe('player draw button', () => {
  test('clicking draw triggers confirmation after DOM ready', () => {
    document.body.innerHTML = `
      <input id="somf-min-count" value="1">
      <button id="somf-min-draw" type="button"></button>
    `;
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('somf-min-draw').click();
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test('shards input is blurred on initialization', () => {
    document.body.innerHTML = `
      <input id="somf-min-count">
      <button id="somf-min-draw" type="button"></button>
    `;
    const count = document.getElementById('somf-min-count');
    count.focus();
    expect(document.activeElement).toBe(count);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.activeElement).not.toBe(count);
  });
});
