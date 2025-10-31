import { jest } from '@jest/globals';

const setupDom = () => {
  document.body.innerHTML = `
    <div id="player-tools-tab" tabindex="0" aria-expanded="false"></div>
    <div id="player-tools-drawer" aria-hidden="true">
      <div class="player-tools-drawer__scrim" hidden></div>
      <div data-player-tools-content tabindex="-1"></div>
    </div>
  `;

  const tab = document.getElementById('player-tools-tab');
  const drawer = document.getElementById('player-tools-drawer');
  const content = drawer.querySelector('[data-player-tools-content]');

  tab.focus = jest.fn();
  drawer.focus = jest.fn();
  content.focus = jest.fn();

  return { tab, drawer };
};

describe('player tools drawer transition guards', () => {
  let originalRaf;
  let originalCancelRaf;
  let originalGetComputedStyle;
  let rafCallbacks;
  let originalResizeObserver;
  let originalScrollTo;

  beforeEach(() => {
    jest.resetModules();
    rafCallbacks = [];
    originalRaf = window.requestAnimationFrame;
    originalCancelRaf = window.cancelAnimationFrame;
    originalGetComputedStyle = window.getComputedStyle;
    originalResizeObserver = global.ResizeObserver;
    originalScrollTo = window.scrollTo;
    window.requestAnimationFrame = (callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    };
    window.cancelAnimationFrame = jest.fn();

    window.getComputedStyle = (...args) => {
      const style = originalGetComputedStyle ? originalGetComputedStyle(...args) : null;
      return {
        getPropertyValue: (property) => {
          if (property === '--player-tools-transition-duration') {
            return '0.2s';
          }
          if (property === '--drawer-slide-direction') {
            return '-1';
          }
          return style?.getPropertyValue?.(property) ?? '';
        }
      };
    };

    class ResizeObserverStub {
      constructor() {}
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    global.ResizeObserver = ResizeObserverStub;
    window.scrollTo = jest.fn();

    setupDom();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
    window.cancelAnimationFrame = originalCancelRaf;
    window.getComputedStyle = originalGetComputedStyle;
    if (originalResizeObserver) {
      global.ResizeObserver = originalResizeObserver;
    } else {
      delete global.ResizeObserver;
    }
    if (originalScrollTo) {
      window.scrollTo = originalScrollTo;
    } else {
      delete window.scrollTo;
    }
    document.body.innerHTML = '';
  });

  const flushAnimationFrames = () => {
    let timestamp = 0;
    const safetyLimit = 50;
    let iterations = 0;
    while (rafCallbacks.length && iterations < safetyLimit) {
      const callback = rafCallbacks.shift();
      timestamp += 120;
      callback(timestamp);
      iterations += 1;
    }
    if (rafCallbacks.length) {
      throw new Error('requestAnimationFrame queue did not drain');
    }
  };

  test('ignores close requests until the open animation completes', async () => {
    const module = await import('../scripts/player-tools-drawer.js');
    const controller = module.initializePlayerToolsDrawer();
    const drawer = document.getElementById('player-tools-drawer');

    controller.open();
    expect(drawer.classList.contains('is-open')).toBe(true);

    controller.close();
    expect(drawer.classList.contains('is-open')).toBe(true);

    flushAnimationFrames();

    expect(drawer.classList.contains('is-open')).toBe(false);
    expect(document.body.classList.contains('player-tools-open')).toBe(false);
  });

  test('queues a reopen request while a close animation is running', async () => {
    const module = await import('../scripts/player-tools-drawer.js');
    const controller = module.initializePlayerToolsDrawer();
    const drawer = document.getElementById('player-tools-drawer');

    controller.open();
    flushAnimationFrames();

    expect(drawer.classList.contains('is-open')).toBe(true);

    controller.close();
    expect(drawer.classList.contains('is-open')).toBe(false);

    controller.open();
    expect(drawer.classList.contains('is-open')).toBe(false);

    flushAnimationFrames();

    expect(drawer.classList.contains('is-open')).toBe(true);
    expect(document.body.classList.contains('player-tools-open')).toBe(true);
  });
});
