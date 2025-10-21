import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import vm from 'vm';

const polyfillSource = readFileSync(new URL('../scripts/polyfills.js', import.meta.url), 'utf8');

function runPolyfill() {
  const context = vm.createContext({
    globalThis,
    window: typeof window !== 'undefined' ? window : globalThis,
    self: typeof self !== 'undefined' ? self : globalThis,
    Promise,
    setTimeout
  });

  vm.runInContext(polyfillSource, context, { filename: 'scripts/polyfills.js' });
}

describe('queueMicrotask polyfill', () => {
  const original = globalThis.queueMicrotask;

  afterEach(() => {
    if (original) {
      globalThis.queueMicrotask = original;
    } else {
      delete globalThis.queueMicrotask;
    }
  });

  test('defines queueMicrotask when missing', async () => {
    delete globalThis.queueMicrotask;

    runPolyfill();

    expect(typeof globalThis.queueMicrotask).toBe('function');

    const calls = [];
    globalThis.queueMicrotask(() => {
      calls.push('queued');
    });

    await Promise.resolve();

    expect(calls).toEqual(['queued']);
  });

  test('does not overwrite existing queueMicrotask implementation', () => {
    const stub = jest.fn();
    globalThis.queueMicrotask = stub;

    runPolyfill();

    expect(globalThis.queueMicrotask).toBe(stub);
  });
});
