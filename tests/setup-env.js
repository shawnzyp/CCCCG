import { TestResponse } from './test-response.js';

if (typeof globalThis.Response !== 'function') {
  globalThis.Response = TestResponse;
}

if (typeof globalThis.IntersectionObserver !== 'function') {
  class IntersectionObserverMock {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  globalThis.IntersectionObserver = IntersectionObserverMock;
  if (typeof window !== 'undefined') {
    window.IntersectionObserver = IntersectionObserverMock;
  }
}

if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = async (_input, init = {}) => {
    const { status = 200, statusText = '', headers = {} } = init ?? {};
    const body = init && Object.prototype.hasOwnProperty.call(init, 'body') ? init.body : '{}';
    return new TestResponse(body, { status, statusText, headers });
  };
}
