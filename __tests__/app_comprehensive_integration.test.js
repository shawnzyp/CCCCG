import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import { Response } from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof globalThis.window !== 'undefined' && globalThis.window?.document) {
  globalThis.document = globalThis.window.document;
}

function createStorageMock() {
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: key => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: index => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

class EventSourceMock {
  static instances = new Set();

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.onerror = null;
    EventSourceMock.instances.add(this);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  dispatch(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) handler(event);
  }

  close() {
    EventSourceMock.instances.delete(this);
  }
}

function installDomScaffolding() {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  document.documentElement.innerHTML = html;
  document.querySelector('[data-m24n-ticker-track]')?.remove();
  document.querySelector('[data-m24n-ticker-text]')?.remove();
}

function installCoreMocks() {
  if (typeof globalThis.btoa !== 'function') {
    globalThis.btoa = value => Buffer.from(String(value), 'binary').toString('base64');
  }
  if (typeof globalThis.atob !== 'function') {
    globalThis.atob = value => Buffer.from(String(value), 'base64').toString('binary');
  }

  Object.defineProperty(window, 'localStorage', {
    value: createStorageMock(),
    configurable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    value: createStorageMock(),
    configurable: true,
  });

  globalThis.document = window.document;
  global.document = window.document;

  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = id => clearTimeout(id);
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;
  if (typeof requestAnimationFrame !== 'function') {
    globalThis.eval?.('var requestAnimationFrame = function(cb){ return setTimeout(function(){ cb(Date.now()); }, 0); };');
    globalThis.eval?.('var cancelAnimationFrame = function(id){ clearTimeout(id); };');
  }
  window.requestIdleCallback = cb => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 2 }), 0);
  window.cancelIdleCallback = id => clearTimeout(id);
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  window.scrollTo = () => {};

  class AudioNodeMock {
    connect() {}
    disconnect() {}
  }

  class OscillatorNodeMock extends AudioNodeMock {
    constructor() {
      super();
      this.frequency = { value: 440 };
      this.type = 'sine';
    }
    start() {}
    stop() {}
  }

  class GainNodeMock extends AudioNodeMock {
    constructor() {
      super();
      this.gain = { value: 1 };
    }
  }

  class AudioContextMock {
    constructor() {
      this.state = 'running';
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      return new OscillatorNodeMock();
    }
    createGain() {
      return new GainNodeMock();
    }
    createAnalyser() {
      return new AudioNodeMock();
    }
    destination = new AudioNodeMock();
  }

  window.AudioContext = AudioContextMock;
  window.webkitAudioContext = AudioContextMock;

  const clipboard = {
    writeText: jest.fn().mockResolvedValue(),
    readText: jest.fn().mockResolvedValue(''),
  };

  const serviceWorkerController = {
    postMessage: jest.fn(),
  };

  window.navigator = {
    userAgentData: { platform: 'macOS', brands: [], mobile: false },
    userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    clipboard,
    serviceWorker: {
      controller: serviceWorkerController,
      register: jest.fn().mockResolvedValue({}),
      ready: Promise.resolve({
        active: serviceWorkerController,
        pushManager: {
          subscribe: jest.fn().mockResolvedValue({
            endpoint: 'https://example.com/endpoint',
            keys: { p256dh: 'p', auth: 'a' },
            toJSON() {
              return { endpoint: this.endpoint, keys: this.keys };
            },
          }),
        },
      }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  };

  window.screen = { width: 1280, height: 720, colorDepth: 24 };

  globalThis.Notification = {
    permission: 'granted',
    requestPermission: jest.fn().mockResolvedValue('granted'),
  };

  globalThis.BroadcastChannel = class {
    constructor() {
      this.listeners = new Map();
    }
    postMessage() {}
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    removeEventListener(type) {
      this.listeners.delete(type);
    }
    close() {
      this.listeners.clear();
    }
  };

  globalThis.EventSource = EventSourceMock;

  globalThis.crypto = {
    getRandomValues(array) {
      return array.fill(1);
    },
    randomUUID() {
      return '00000000-0000-4000-8000-000000000000';
    },
    subtle: {
      digest: async () => new ArrayBuffer(0),
    },
  };

  globalThis.fetch = jest.fn(async resource => {
    const url = typeof resource === 'string' ? resource : resource.url;
    if (url.endsWith('asset-manifest.json')) {
      return new Response(JSON.stringify({ assets: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.endsWith('CatalystCore_Master_Book.csv') || url.endsWith('CatalystCore_Items_Prices.csv')) {
      return new Response('id,name\n1,Test Item', {
        headers: { 'Content-Type': 'text/csv' },
      });
    }
    if (url.endsWith('News.txt')) {
      return new Response('1. System synchronized', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    if (url.endsWith('ruleshelp.txt') || url.endsWith('ruleshelp')) {
      return new Response('Rule summary', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    if (url.endsWith('sw.js')) {
      return new Response('', { status: 200 });
    }
    return new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    });
  });

  globalThis.Response = Response;

  if (typeof globalThis.TextDecoder !== 'function') {
    globalThis.TextDecoder = class {
      constructor(encoding = 'utf-8') {
        this.encoding = encoding;
      }
      decode(input = new Uint8Array()) {
        return Buffer.from(input).toString(this.encoding);
      }
    };
  }
  if (typeof globalThis.TextEncoder !== 'function') {
    globalThis.TextEncoder = class {
      encode(input = '') {
        return Buffer.from(String(input));
      }
    };
  }
}

function flushAllTimers() {
  jest.runOnlyPendingTimers();
  return Promise.resolve();
}

describe('Comprehensive app integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    installDomScaffolding();
    installCoreMocks();
    expect(typeof requestAnimationFrame).toBe('function');
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    EventSourceMock.instances.clear();
  });

  test('core UI and cloud features function cohesively', async () => {
    await import('../scripts/main.js');

    const toastEl = document.getElementById('toast');
    expect(toastEl).toBeTruthy();

    let toastShownDetail = null;
    const toastListener = e => {
      toastShownDetail = e.detail?.message ?? null;
    };
    window.addEventListener('cc:toast-shown', toastListener);

    window.toast('System online', { type: 'success', duration: 0 });
    await flushAllTimers();
    expect(toastEl.classList.contains('show')).toBe(true);
    expect(toastEl.textContent).toContain('System online');
    expect(toastShownDetail).toBe('System online');

    window.dismissToast();
    await flushAllTimers();
    expect(toastEl.classList.contains('show')).toBe(false);
    window.removeEventListener('cc:toast-shown', toastListener);

    const { show, hide } = await import('../scripts/modal.js');
    show('modal-help');
    const modal = document.getElementById('modal-help');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    hide('modal-help');
    expect(modal.classList.contains('hidden')).toBe(true);

    const { cacheCloudSaves, subscribeCloudSaves } = await import('../scripts/storage.js');
    const saveFn = jest.fn().mockResolvedValue();
    await cacheCloudSaves(
      async () => ['alpha', 'beta'],
      async key => ({ id: key, data: `payload-${key}` }),
      saveFn,
    );
    expect(saveFn).toHaveBeenCalledTimes(2);

    const onChange = jest.fn();
    const subscription = subscribeCloudSaves(onChange);
    expect(typeof subscription?.dispatch).toBe('function');
    expect(onChange).toHaveBeenCalledTimes(1);

    subscription.dispatch('put');
    expect(onChange).toHaveBeenCalledTimes(2);
    subscription.dispatch('patch');
    expect(onChange).toHaveBeenCalledTimes(3);
    subscription.close();

    const launchVideo = document.querySelector('#launch-animation video');
    expect(launchVideo).toBeTruthy();
    launchVideo.dispatchEvent(new Event('loadedmetadata'));
    await flushAllTimers();
    expect(launchVideo?.getAttribute('muted')).toBe('');
  });
});
