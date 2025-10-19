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
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
  });
}
