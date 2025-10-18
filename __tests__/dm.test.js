import { jest } from '@jest/globals';

describe('dm tools bootstrap', () => {
  const restoreReadyState = (() => {
    const descriptor = Object.getOwnPropertyDescriptor(document, 'readyState');
    return () => {
      if (descriptor) {
        Object.defineProperty(document, 'readyState', descriptor);
      } else {
        delete document.readyState;
      }
    };
  })();

  beforeEach(() => {
    jest.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    global.__DM_CONFIG__ = { pin: '123123', deviceFingerprint: '' };
    document.body.innerHTML = `
      <footer>
        <button id="dm-login"></button>
        <div id="dm-tools-menu" hidden></div>
        <button id="dm-tools-toggle" hidden aria-expanded="false"></button>
      </footer>
    `;
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    });
  });

  afterEach(() => {
    restoreReadyState();
    delete window.dmRequireLogin;
    delete window.computeDmDeviceFingerprint;
    delete global.__DM_CONFIG__;
  });

  test('reveals toggle when logged in and syncs menu expansion', async () => {
    sessionStorage.setItem('dmLoggedIn', '1');
    const module = await import('../scripts/dm.js');
    expect(module).toBeDefined();

    const toggle = document.getElementById('dm-tools-toggle');
    const menu = document.getElementById('dm-tools-menu');

    expect(toggle.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);

    toggle.click();
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const pointerDownEvent = typeof PointerEvent === 'function'
      ? new PointerEvent('pointerdown', { bubbles: true })
      : new Event('pointerdown', { bubbles: true });
    document.body.dispatchEvent(pointerDownEvent);
    menu.dispatchEvent(new Event('transitionend'));
    expect(menu.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  test('registers dmRequireLogin helper on window', async () => {
    await import('../scripts/dm.js');
    expect(typeof window.dmRequireLogin).toBe('function');
  });
});
