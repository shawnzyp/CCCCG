import { jest } from '@jest/globals';

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

async function loadMain() {
  await import('../scripts/main.js');
  await flushMicrotasks();
}

describe('main.js import safety', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.className = 'launching touch-controls-disabled';
    document.body.innerHTML = '<div id="launch-animation"><video></video></div>';
    document.documentElement.setAttribute('data-pt-phone-open', '0');
    delete window.__ccLaunchComplete;
    window.scrollTo = () => {};
    const originalGetElementById = document.getElementById.bind(document);
    document.getElementById = id => {
      const existing = originalGetElementById(id);
      if (existing) return existing;
      const fallback = document.createElement('select');
      fallback.value = '';
      fallback.id = id;
      document.body.appendChild(fallback);
      return fallback;
    };
  });

  test('imports without ReferenceError from window/document', async () => {
    await expect(loadMain()).resolves.toBeUndefined();
  });
});
