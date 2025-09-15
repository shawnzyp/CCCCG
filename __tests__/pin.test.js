import { jest } from '@jest/globals';
import { setPin, hasPin, verifyPin, clearPin, movePin, syncPin } from '../scripts/pin.js';

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => null }));
});

test('set, verify, clear pin', async () => {
  await setPin('Alice', '1234');
  expect(hasPin('Alice')).toBe(true);
  expect(await verifyPin('Alice', '1234')).toBe(true);
  expect(await verifyPin('Alice', '0000')).toBe(false);
  await clearPin('Alice');
  expect(hasPin('Alice')).toBe(false);
});

test('move pin between names', async () => {
  await setPin('Old', '1111');
  await movePin('Old', 'New');
  expect(hasPin('Old')).toBe(false);
  expect(await verifyPin('New', '1111')).toBe(true);
  await clearPin('New');
});

test('syncs pin from cloud', async () => {
  const store = {};
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'PUT') {
      store[url] = JSON.parse(options.body);
      return { ok: true };
    }
    if (options.method === 'DELETE') {
      delete store[url];
      return { ok: true };
    }
    return { ok: true, json: async () => store[url] ?? null };
  });

  await setPin('Remote', '2222');
  localStorage.clear();
  expect(hasPin('Remote')).toBe(false);
  await syncPin('Remote');
  expect(hasPin('Remote')).toBe(true);
  expect(await verifyPin('Remote', '2222')).toBe(true);
  await clearPin('Remote');
});
