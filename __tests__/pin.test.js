import { setPin, hasPin, verifyPin, clearPin, movePin } from '../scripts/pin.js';

test('set, verify, clear pin', async () => {
  await setPin('Alice', '1234');
  expect(hasPin('Alice')).toBe(true);
  expect(await verifyPin('Alice', '1234')).toBe(true);
  expect(await verifyPin('Alice', '0000')).toBe(false);
  clearPin('Alice');
  expect(hasPin('Alice')).toBe(false);
});

test('move pin between names', async () => {
  await setPin('Old', '1111');
  movePin('Old', 'New');
  expect(hasPin('Old')).toBe(false);
  expect(await verifyPin('New', '1111')).toBe(true);
  clearPin('New');
});
