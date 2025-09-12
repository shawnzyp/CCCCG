import { jest } from '@jest/globals';

const stubRef = {
  get: async () => ({ exists: () => false, val: () => null }),
  on: () => {},
  set: async () => {},
  child: () => stubRef,
  limitToLast: () => stubRef,
  push: async () => {},
  remove: async () => {}
};

beforeAll(async () => {
  window._somf_db = { ref: () => stubRef, ServerValue: { TIMESTAMP: 0 } };
  await import('../shard-of-many-fates.js');
});

beforeEach(() => {
  window._somf_db = { ref: () => stubRef, ServerValue: { TIMESTAMP: 0 } };
});

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

  test('clicking draw blurs the shard input', () => {
    document.body.innerHTML = `
      <input id="somf-min-count">
      <button id="somf-min-draw" type="button"></button>
    `;
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const count = document.getElementById('somf-min-count');
    count.focus();
    document.getElementById('somf-min-draw').click();
    expect(document.activeElement).not.toBe(count);
    confirmSpy.mockRestore();
  });
});
