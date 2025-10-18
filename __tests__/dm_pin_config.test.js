import { afterEach, expect, test } from '@jest/globals';
import { loadDmConfig, getDmPinSync, resetDmConfig } from '../scripts/dm-pin.js';

function createDeferred() {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  resetDmConfig();
  delete global.__DM_CONFIG__;
});

test('PIN remains unavailable until configuration resolves', async () => {
  resetDmConfig();
  const deferred = createDeferred();
  global.__DM_CONFIG__ = deferred.promise;

  expect(getDmPinSync()).toBeNull();

  const configPromise = loadDmConfig();
  expect(getDmPinSync()).toBeNull();

  deferred.resolve({ pin: '654321', deviceFingerprint: 'test-device' });

  const config = await configPromise;
  expect(config.pin).toBe('654321');
  expect(config.deviceFingerprint).toBe('test-device');
  expect(getDmPinSync()).toBe('654321');
});
