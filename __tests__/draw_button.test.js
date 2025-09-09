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
});
