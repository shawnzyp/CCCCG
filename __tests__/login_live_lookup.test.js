import { jest } from '@jest/globals';
import '../scripts/users.js';

describe('live player lookup', () => {
  let initialCalls;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <input id="login-player-name" />
      <div id="login-player-status"></div>
    `;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => null });
    document.dispatchEvent(new Event('DOMContentLoaded'));
    initialCalls = global.fetch.mock.calls.length;
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('fetches from server on input', async () => {
    const input = document.getElementById('login-player-name');
    input.value = 'Alice';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 0));
    expect(global.fetch.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
