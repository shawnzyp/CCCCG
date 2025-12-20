import { jest } from '@jest/globals';

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

async function loadMain() {
  await import('../scripts/main.js');
  await flushMicrotasks();
}

describe('launch animation early exits', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.className = 'launching touch-controls-disabled';
    document.body.innerHTML = '<div id="launch-animation"><video></video></div>';
    document.documentElement.setAttribute('data-pt-phone-open', '0');
    delete window.__ccLaunchComplete;
    window.scrollTo = () => {};
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0',
      configurable: true,
    });
    const originalGetElementById = document.getElementById.bind(document);
    document.getElementById = id => {
      const existing = originalGetElementById(id);
      if (existing) return existing;
      // NOTE: fallback elements are generated to let the full script import run in JSDOM.
      // This can hide missing-element bugs, so keep these tests focused on launch flow only.
      const fallback = document.createElement('select');
      fallback.value = '';
      fallback.id = id;
      document.body.appendChild(fallback);
      return fallback;
    };
  });

  test('skips when launch already completed', async () => {
    window.__ccLaunchComplete = { reason: 'ended', ts: Date.now() };

    await loadMain();

    expect(document.body.classList.contains('launching')).toBe(false);
    expect(document.body.classList.contains('touch-controls-disabled')).toBe(false);
    expect(window.__ccLaunchComplete).toBeTruthy();
  });

  test('skips when launch is disarmed', async () => {
    const launchEl = document.getElementById('launch-animation');
    launchEl.setAttribute('data-launch-disarmed', 'true');

    await loadMain();

    expect(document.body.classList.contains('launching')).toBe(false);
    expect(document.body.classList.contains('touch-controls-disabled')).toBe(false);
    expect(window.__ccLaunchComplete).toBeTruthy();
  });

  test('skips when body is not launching', async () => {
    document.body.className = 'touch-controls-disabled';

    await loadMain();

    expect(document.body.classList.contains('touch-controls-disabled')).toBe(false);
    expect(window.__ccLaunchComplete).toBeTruthy();
  });
});
