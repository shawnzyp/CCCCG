const globalTarget =
  typeof globalThis !== 'undefined' ? globalThis :
  typeof window !== 'undefined' ? window :
  typeof self !== 'undefined' ? self :
  typeof global !== 'undefined' ? global :
  undefined;

if (globalTarget && typeof globalTarget.queueMicrotask !== 'function') {
  const resolvedPromise = Promise.resolve();
  const rethrow = error => setTimeout(() => { throw error; }, 0);

  globalTarget.queueMicrotask = callback => {
    if (typeof callback !== 'function') {
      throw new TypeError(`${callback} is not a function`);
    }

    resolvedPromise.then(callback).catch(rethrow);
  };
}
