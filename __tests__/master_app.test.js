import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import mime from 'mime-types';
import { TestResponse as Response } from '../tests/test-response.js';

const __filename = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(TEST_DIR, '..');

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
  const html = fs.readFileSync(path.resolve(ROOT_DIR, 'index.html'), 'utf8');
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

  const locationProto = Object.getPrototypeOf(window.location);
  if (locationProto) {
    try {
      Object.defineProperty(locationProto, 'reload', { configurable: true, value: jest.fn() });
      Object.defineProperty(locationProto, 'assign', { configurable: true, value: jest.fn() });
      Object.defineProperty(locationProto, 'replace', { configurable: true, value: jest.fn() });
    } catch (err) {}
  } else {
    try {
      window.location.reload = jest.fn();
      window.location.assign = jest.fn();
      window.location.replace = jest.fn();
    } catch (err) {}
  }
  try {
    Object.defineProperty(window.location, 'reload', { configurable: true, value: jest.fn() });
    Object.defineProperty(window.location, 'assign', { configurable: true, value: jest.fn() });
    Object.defineProperty(window.location, 'replace', { configurable: true, value: jest.fn() });
  } catch (err) {}
  globalThis.location = window.location;

  globalThis.prefersReducedMotion = () => false;
  window.confirm = jest.fn(() => true);
  globalThis.confirm = window.confirm;
  window.prompt = jest.fn(() => '');
  globalThis.prompt = window.prompt;

  const raf = cb => setTimeout(() => cb(Date.now()), 0);
  const caf = id => clearTimeout(id);
  window.requestAnimationFrame = raf;
  window.cancelAnimationFrame = caf;
  globalThis.requestAnimationFrame = raf;
  globalThis.cancelAnimationFrame = caf;
  global.requestAnimationFrame = raf;
  global.cancelAnimationFrame = caf;

  let isOnline = true;
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => isOnline,
    set: value => {
      isOnline = Boolean(value);
    },
  });
  window.requestIdleCallback = cb => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 2 }), 0);
  window.cancelIdleCallback = id => clearTimeout(id);
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));

  class IntersectionObserverMock {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = IntersectionObserverMock;
  globalThis.IntersectionObserver = IntersectionObserverMock;
  window.scrollTo = () => {};

  class AudioNodeMock {
    connect(target = null) {
      return target ?? this;
    }
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
    static instances = [];
    constructor() {
      this.state = 'suspended';
      this.destination = new AudioNodeMock();
      AudioContextMock.instances.push(this);
    }
    createBuffer(channels, length, sampleRate) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length),
        copyToChannel: () => {},
      };
    }
    createBufferSource() {
      const node = {
        connect: target => target ?? node,
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
      };
      return node;
    }
    decodeAudioData(buffer, success) {
      const data = this.createBuffer(1, 1, 44100);
      if (typeof success === 'function') {
        success(data);
      }
      return Promise.resolve(data);
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    resume() {
      this.state = 'running';
      this.__ccPrimed = true;
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
  }

  window.AudioContext = AudioContextMock;
  window.webkitAudioContext = AudioContextMock;
  globalThis.__AudioContextInstances = AudioContextMock.instances;

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

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverMock;
  globalThis.ResizeObserver = ResizeObserverMock;

  class MutationObserverMock {
    constructor() {}
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.MutationObserver = MutationObserverMock;
  globalThis.MutationObserver = MutationObserverMock;

  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      closePath: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
    }));
  }

  if (typeof globalThis.crypto !== 'object') {
    globalThis.crypto = {};
  }
  globalThis.crypto.getRandomValues = array => array.fill(1);
  globalThis.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
  globalThis.crypto.subtle = {
    digest: async () => new ArrayBuffer(0),
  };

  const textDecoder = class {
    constructor(encoding = 'utf-8') {
      this.encoding = encoding;
    }
    decode(input = new Uint8Array()) {
      return Buffer.from(input).toString(this.encoding);
    }
  };
  const textEncoder = class {
    encode(input = '') {
      return Buffer.from(String(input));
    }
  };
  if (typeof globalThis.TextDecoder !== 'function') {
    globalThis.TextDecoder = textDecoder;
  }
  if (typeof globalThis.TextEncoder !== 'function') {
    globalThis.TextEncoder = textEncoder;
  }

  globalThis.Option = function Option(text = '', value = '', defaultSelected = false, selected = false) {
    const option = document.createElement('option');
    option.textContent = text;
    option.value = value ?? '';
    option.selected = Boolean(selected);
    option.defaultSelected = Boolean(defaultSelected);
    return option;
  };
  window.Option = globalThis.Option;
}

async function readResourceFromDisk(url) {
  const parsed = (() => {
    try {
      return new URL(url, 'http://localhost');
    } catch {
      return null;
    }
  })();
  const pathname = parsed ? parsed.pathname : url;
  const decodedPathname = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  const cleanPath = decodedPathname.replace(/^\//, '');
  const candidatePaths = [
    path.resolve(ROOT_DIR, cleanPath),
    path.resolve(ROOT_DIR, decodedPathname),
  ];
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const buffer = fs.readFileSync(candidate);
      const type = mime.lookup(candidate) || 'application/octet-stream';
      return new Response(buffer, {
        headers: { 'Content-Type': type },
      });
    }
  }

  if (pathname.endsWith('asset-manifest.json')) {
    return new Response(JSON.stringify({ assets: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (pathname.endsWith('CatalystCore_Master_Book.csv') || pathname.endsWith('CatalystCore_Items_Prices.csv')) {
    return new Response('id,name\n1,Test Item', {
      headers: { 'Content-Type': 'text/csv' },
    });
  }
  if (pathname.endsWith('News.txt')) {
    return new Response('1. System synchronized', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  if (pathname.endsWith('ruleshelp.txt') || pathname.endsWith('ruleshelp')) {
    return new Response('Rule summary', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  if (pathname.endsWith('sw.js')) {
    return new Response('', { status: 200 });
  }

  return new Response('{}', {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function importAllApplicationScripts() {
  await jest.unstable_mockModule('../scripts/dm.js', () => ({
    initializeDmTools: jest.fn().mockResolvedValue({ dispose: jest.fn() }),
  }));
  await jest.unstable_mockModule('../scripts/funTips.js', () => ({
    getNextTip: jest.fn(() => 'Suit up and protect civilians first.'),
    tips: ['Suit up and protect civilians first.'],
  }));
  const scripts = [
    '../scripts/polyfills.js',
    '../scripts/crash-handler.js',
    '../scripts/header-title.js',
    '../scripts/animated-titles.js',
    '../scripts/animated-title-spacing.js',
    '../scripts/player-tools-drawer.js',
    '../scripts/player-credit-modal.js',
    '../scripts/main.js',
  ];
  for (const script of scripts) {
    await import(script);
  }
  if (typeof window !== 'undefined' && typeof window.resetFloatingLauncherCoverage === 'function') {
    window.resetFloatingLauncherCoverage();
  }
}

function dispatchAppReadyEvents() {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  window.dispatchEvent(new Event('load'));
}

async function advanceAppTime(ms = 0) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function isElementHidden(element) {
  if (!element) return true;
  if (element.hidden) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;
  const style = element.getAttribute('style');
  if (style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) {
    return true;
  }
  return false;
}

function shouldSkipElement(element) {
  if (!element) return true;
  if (element.closest('template')) return true;
  if (element.closest('#launch-animation')) return true;
  const skipSelectors = [
    '#dm-login',
    '#dm-tools-menu',
    '#dm-login-modal',
    '#dm-notifications-modal',
    '#dm-characters-modal',
    '#dm-character-modal',
    '#dm-rewards-modal',
    '#dm-quickRewards-modal',
    '#dm-reward-history',
    '[id^="dm-"]',
    '[class*="dm-"]',
    '[data-role="dm"]',
    '[data-dm-section]',
    '.dm-tools-portal',
    '.somf-dm',
  ];
  return skipSelectors.some(sel => element.matches(sel) || element.closest(sel));
}

const allowedConsolePatterns = [
  /Not implemented: window\.confirm/i,
  /Not implemented: HTMLCanvasElement\.prototype\.getContext/i,
  /navigation.*not implemented/i,
];

function shouldAllowCapturedError(detail) {
  const text = String(detail ?? '');
  return allowedConsolePatterns.some(pattern => pattern.test(text));
}

function collectDomAssetUrls() {
  const urls = new Set();

  document.querySelectorAll('link[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('http') && !href.startsWith('data:')) urls.add(href);
  });

  document.querySelectorAll('script[src]').forEach(script => {
    const src = script.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('data:')) urls.add(src);
  });

  document.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('data:')) urls.add(src);
  });

  document.querySelectorAll('use[href], use[xlink\\:href]').forEach(use => {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href');
    if (href && href.includes('#')) {
      const [path] = href.split('#');
      if (path && !path.startsWith('http') && !path.startsWith('data:')) urls.add(path);
    }
  });

  return [...urls];
}

async function expectAssetsReadable(urls) {
  const failures = [];
  for (const url of urls) {
    try {
      const parsed = (() => {
        try {
          return new URL(url, 'http://localhost');
        } catch {
          return null;
        }
      })();
      const pathname = parsed ? parsed.pathname : url;
      const decodedPathname = (() => {
        try {
          return decodeURIComponent(pathname);
        } catch {
          return pathname;
        }
      })();
      const cleanPath = decodedPathname.replace(/^\//, '');
      const candidatePaths = [
        path.resolve(ROOT_DIR, cleanPath),
        path.resolve(ROOT_DIR, decodedPathname),
      ];
      const existingPath = candidatePaths.find(
        candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      );

      if (!existingPath) {
        failures.push(`${url}: not found on disk`);
        continue;
      }

      const stats = fs.statSync(existingPath);
      if (stats.size <= 0) {
        failures.push(`${url}: empty file`);
        continue;
      }

      const response = await readResourceFromDisk(url);
      if (!response.ok) {
        failures.push(`${url}: status ${response.status}`);
        continue;
      }
      const buf = await response.arrayBuffer();
      if (!(buf?.byteLength > 0)) {
        failures.push(`${url}: empty response`);
      }
    } catch (err) {
      failures.push(`${url}: ${String(err)}`);
    }
  }

  if (failures.length) {
    throw new Error(`Asset failures:\n${failures.join('\n')}`);
  }
}

function getLauncherButtons() {
  return [...document.querySelectorAll('[data-pt-open-app]')].filter(btn => !btn.disabled);
}

async function openAndCloseEveryApp({ advanceAppTime: tick, cycles = 1 } = {}) {
  const buttons = getLauncherButtons();
  expect(buttons.length).toBeGreaterThan(0);

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const btn of buttons) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await tick(0);

      expect(document.body).toBeTruthy();
      expect(document.documentElement).toBeTruthy();

      const back = document.querySelector('[data-pt-launcher-back]');
      const close = document.querySelector('[data-pt-launcher-close]');
      if (back) back.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      else if (close) close.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      await tick(0);
    }
  }
}

function isSafeTarget(el) {
  if (!el) return false;
  if (el.disabled) return false;
  const text = (el.textContent || '').toLowerCase();
  if (/(delete|remove|wipe|reset all|clear all|factory)/i.test(text)) return false;
  return true;
}

async function fuzzClickInteractiveElements({ advanceAppTime: tick, iterations = 250 } = {}) {
  const candidates = [
    ...document.querySelectorAll('button, [role="button"], a[href], summary'),
  ].filter(el => !isElementHidden(el) && !shouldSkipElement(el) && isSafeTarget(el));

  expect(candidates.length).toBeGreaterThan(0);

  for (let i = 0; i < iterations; i += 1) {
    const el = candidates[i % candidates.length];
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(0);
  }
}

async function fuzzForms({ advanceAppTime: tick } = {}) {
  const inputs = [...document.querySelectorAll('input, textarea, select')].filter(
    el => !el.disabled && !isElementHidden(el) && !shouldSkipElement(el),
  );

  for (const el of inputs) {
    if (el.tagName === 'SELECT') {
      if (el.options.length > 0) el.selectedIndex = 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      el.click();
    } else {
      el.focus?.();
      el.value = `${el.value || ''}x`;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await tick(0);
  }
}

async function stressGlobalEvents({ advanceAppTime: tick } = {}) {
  window.dispatchEvent(new Event('resize'));
  window.dispatchEvent(new Event('orientationchange'));

  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  document.dispatchEvent(new Event('visibilitychange'));

  window.navigator.onLine = false;
  window.dispatchEvent(new Event('offline'));
  await tick(0);

  window.navigator.onLine = true;
  window.dispatchEvent(new Event('online'));
  await tick(0);

  window.dispatchEvent(new Event('scroll'));

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  await tick(0);
}

describe('Catalyst Core master application experience', () => {
  jest.setTimeout(60000);

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    installDomScaffolding();
    installCoreMocks();

    globalThis.fetch = jest.fn(async resource => readResourceFromDisk(typeof resource === 'string' ? resource : resource.url));
    globalThis.Response = Response;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    EventSourceMock.instances.clear();
  });

  test('launches the full application and exercises all interactive controls', async () => {
    const capturedErrors = [];
    const captureError = detail => {
      if (shouldAllowCapturedError(detail)) return;
      capturedErrors.push(detail);
    };
    const errorHandler = event => {
      const detail = event?.error ?? event?.message ?? event?.reason ?? event;
      captureError(detail);
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', errorHandler);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      captureError(args.join(' '));
    });

    const assertNoCapturedErrors = stage => {
      if (capturedErrors.length > 0) {
        throw new Error(`Detected issues during ${stage}: ${capturedErrors.map(String).join('\n')}`);
      }
    };

    await importAllApplicationScripts();
    dispatchAppReadyEvents();
    const skipLaunchButton = document.querySelector('[data-skip-launch]');
    if (skipLaunchButton) {
      skipLaunchButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      window.dispatchEvent(new Event('launch-animation-skip'));
    }
    await advanceAppTime(1000);

    const manifestResponse = await fetch('/offline-manifest.json');
    const manifest = manifestResponse?.json ? await manifestResponse.json() : {};
    const domAssets = collectDomAssetUrls();
    const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const rawAssets = [...domAssets, ...manifestAssets];
    const duplicateAssets = rawAssets.filter((url, idx) => rawAssets.indexOf(url) !== idx);
    expect(duplicateAssets).toHaveLength(0);

    const allAssets = [...new Set(rawAssets)];
    expect(allAssets.length).toBeGreaterThan(0);
    await expectAssetsReadable(allAssets);
    assertNoCapturedErrors('asset readability');

    const rootApp = document.getElementById('app') || document.body;
    expect(rootApp).toBeTruthy();

    await openAndCloseEveryApp({ advanceAppTime, cycles: 3 });
    assertNoCapturedErrors('app launch cycles');

    await fuzzForms({ advanceAppTime });
    assertNoCapturedErrors('form fuzzing');

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await stressGlobalEvents({ advanceAppTime });
      assertNoCapturedErrors(`global event cycle ${cycle + 1}`);
    }

    await fuzzClickInteractiveElements({ advanceAppTime, iterations: 400 });
    assertNoCapturedErrors('click fuzzing');

    const toastElement = document.getElementById('toast');
    if (toastElement) {
      window.toast?.('Diagnostics complete', { type: 'success', duration: 0 });
      await advanceAppTime(0);
      expect(toastElement.classList.contains('show')).toBe(true);
      window.dismissToast?.();
      await advanceAppTime(0);
    }

    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', errorHandler);
    consoleErrorSpy.mockRestore();

    await advanceAppTime(8000);
    jest.clearAllTimers();

    if (capturedErrors.length > 0) {
      throw new Error(`Detected issues while exercising interactive elements: ${capturedErrors.map(String).join('\n')}`);
    }
  });

  test('player tools drawer provides resilient interactions and status updates', async () => {
    const capturedErrors = [];
    const captureError = detail => {
      if (shouldAllowCapturedError(detail)) return;
      capturedErrors.push(detail);
    };
    const errorHandler = event => {
      const detail = event?.error ?? event?.message ?? event?.reason ?? event;
      captureError(detail);
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', errorHandler);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      captureError(args.join(' '));
    });

    await importAllApplicationScripts();
    dispatchAppReadyEvents();
    const skipLaunchButton = document.querySelector('[data-skip-launch]');
    if (skipLaunchButton) {
      skipLaunchButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      window.dispatchEvent(new Event('launch-animation-skip'));
    }

    document.documentElement.style.setProperty('--player-tools-transition-duration', '0ms');

    await advanceAppTime(1000);

    const drawerModule = await import('../scripts/player-tools-drawer.js');

    const tab = document.getElementById('player-tools-tab');
    const drawer = document.getElementById('player-tools-drawer');
    expect(tab).toBeTruthy();
    expect(drawer).toBeTruthy();

    const scrim = drawer.querySelector('[data-player-tools-scrim]');
    const historyList = drawer.querySelector('#toast-history-list');
    const diceCount = document.getElementById('dice-count');
    const diceSides = document.getElementById('dice-sides');
    const diceBonus = document.getElementById('dice-bonus');
    const rollDiceBtn = document.getElementById('roll-dice-btn');
    const rollInitiativeBtn = document.getElementById('roll-initiative-btn');
    const flipCoinBtn = document.getElementById('flip-coin-btn');

    expect(scrim).toBeTruthy();
    expect(historyList).toBeTruthy();

    expect(drawer.classList.contains('is-open')).toBe(false);
    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect(drawer.getAttribute('aria-hidden')).toBe('true');

    const stateLog = [];
    const unsubscribe = drawerModule.subscribe(state => {
      stateLog.push({ open: Boolean(state.open), progress: Number(state.progress) });
    });

    await advanceAppTime(0);

    expect(stateLog.length).toBeGreaterThan(0);
    expect(stateLog[0].open).toBe(false);
    expect(stateLog[0].progress).toBeGreaterThanOrEqual(0);
    expect(stateLog[0].progress).toBeLessThanOrEqual(1);

    tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await advanceAppTime(0);

    expect(drawer.classList.contains('is-open')).toBe(true);
    expect(tab.getAttribute('aria-expanded')).toBe('true');
    expect(drawer.getAttribute('aria-hidden')).toBe('false');

    expect(window.PlayerTools).toBeTruthy();
    expect(typeof window.PlayerTools.setLevelRewardReminder).toBe('function');

    window.PlayerTools.setLevelRewardReminder(2, 'Apply rewards');
    await advanceAppTime(0);
    const rewardBadge = drawer.querySelector('#level-reward-count');
    const rewardTrigger = drawer.querySelector('#level-reward-reminder-trigger');
    if (rewardBadge) {
      expect(rewardBadge.textContent.trim()).toBe('2');
      expect(rewardBadge.hidden).toBe(false);
    }
    if (rewardTrigger) {
      expect(rewardTrigger.disabled).toBe(false);
    }

    window.PlayerTools.clearLevelRewardReminder();
    await advanceAppTime(0);
    if (rewardBadge) expect(rewardBadge.hidden).toBe(true);
    if (rewardTrigger) expect(rewardTrigger.disabled).toBe(true);

    let resumeCalled = false;
    window.PlayerTools.setMiniGameReminder({
      name: 'Gridlock Trace',
      status: 'In progress',
      meta: 'Round 3',
      onResume() {
        resumeCalled = true;
      }
    });
    await advanceAppTime(0);
    const miniGameReminder = document.getElementById('mini-game-reminder');
    if (miniGameReminder) {
      expect(miniGameReminder.hidden).toBe(false);
    }

    const miniGameResume = document.getElementById('mini-game-resume');
    if (miniGameResume) {
      miniGameResume.click();
      expect(resumeCalled).toBe(true);
    } else {
      expect(resumeCalled).toBe(false);
    }

    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.5); // initiative d20
    rollInitiativeBtn.click();

    diceCount.value = '2';
    diceSides.value = '6';
    diceBonus.value = '1';
    randomSpy.mockReturnValueOnce(0.1); // first die = 3
    randomSpy.mockReturnValueOnce(0.8); // second die = 10
    rollDiceBtn.click();

    randomSpy.mockReturnValueOnce(0.2); // coin = Heads
    flipCoinBtn.click();
    randomSpy.mockRestore();

    expect(historyList.children.length).toBeGreaterThanOrEqual(3);
    const latestHistory = historyList.querySelector('li');
    expect(latestHistory.textContent).toMatch(/Coin: (Heads|Tails)/);

    scrim.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await advanceAppTime(0);

    expect(drawer.classList.contains('is-open')).toBe(false);
    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect(drawer.getAttribute('aria-hidden')).toBe('true');

    drawerModule.open();
    await advanceAppTime(0);
    drawerModule.close();
    await advanceAppTime(0);

    const loggedStatesBeforeFinalToggle = stateLog.slice();
    unsubscribe();

    drawerModule.open();
    await advanceAppTime(0);
    drawerModule.close();
    await advanceAppTime(0);

    expect(stateLog).toEqual(loggedStatesBeforeFinalToggle);

    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', errorHandler);
    consoleErrorSpy.mockRestore();

    await advanceAppTime(1000);
    jest.clearAllTimers();

    if (capturedErrors.length > 0) {
      throw new Error(`Detected issues while verifying player tools drawer: ${capturedErrors.map(String).join('\n')}`);
    }
  });

  test('stress tests interactive controls under rapid repeated interactions', async () => {
    const capturedErrors = [];
    const captureError = detail => {
      if (shouldAllowCapturedError(detail)) return;
      capturedErrors.push(detail);
    };
    const errorHandler = event => {
      const detail = event?.error ?? event?.message ?? event?.reason ?? event;
      captureError(detail);
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', errorHandler);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      captureError(args.join(' '));
    });

    await importAllApplicationScripts();
    dispatchAppReadyEvents();
    const skipLaunchButton = document.querySelector('[data-skip-launch]');
    if (skipLaunchButton) {
      skipLaunchButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      window.dispatchEvent(new Event('launch-animation-skip'));
    }
    await advanceAppTime(1000);

    const interactiveElements = Array.from(
      document.querySelectorAll(
        'button, [role="button"], input, select, textarea, summary, details, a[href], [contenteditable=""], [contenteditable="true"]',
      ),
    );

    const stressIterations = 4;

    for (const element of interactiveElements) {
      if (!(element instanceof Element)) {
        continue;
      }
      if (shouldSkipElement(element)) {
        continue;
      }
      if (isElementHidden(element)) {
        continue;
      }
      if (!element.isConnected) {
        continue;
      }
      if ('disabled' in element && element.disabled) {
        continue;
      }

      const tagName = element.tagName.toLowerCase();
      for (let iteration = 0; iteration < stressIterations; iteration += 1) {
        try {
          if (element instanceof HTMLElement) {
            element.focus?.();
          }

          switch (tagName) {
            case 'input': {
              const input = element;
              if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = !input.checked;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              } else {
                input.value = `Stress ${iteration}`;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
              break;
            }
            case 'select': {
              const select = element;
              if (select.options.length > 0) {
                const nextIndex = (select.selectedIndex + 1) % select.options.length;
                select.selectedIndex = nextIndex;
              }
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
            case 'textarea': {
              const textarea = element;
              textarea.value = `Multiline stress iteration ${iteration}`;
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
            case 'details': {
              const details = element;
              details.open = !details.open;
              details.dispatchEvent(new Event('toggle'));
              break;
            }
            default: {
              const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
              const pointerUp = new Event('pointerup', { bubbles: true, cancelable: true });
              const clickEvent = new Event('click', { bubbles: true, cancelable: true });
              element.dispatchEvent(pointerDown);
              element.dispatchEvent(clickEvent);
              element.dispatchEvent(pointerUp);
              if (element instanceof HTMLElement) {
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
              }
              break;
            }
          }
        } catch (err) {
          capturedErrors.push(err);
        }

        await advanceAppTime(0);
      }
    }

    const tabLists = Array.from(document.querySelectorAll('[role="tablist"]'));
    for (const tabList of tabLists) {
      const tabs = Array.from(tabList.querySelectorAll('[role="tab"]')).filter(
        tab => tab instanceof HTMLElement && !isElementHidden(tab) && !shouldSkipElement(tab),
      );
      if (tabs.length < 2) {
        continue;
      }

      for (let cycle = 0; cycle < stressIterations; cycle += 1) {
        for (const tab of tabs) {
          try {
            tab.focus?.();
            tab.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
            tab.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
            tab.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
            tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
            tab.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
          } catch (err) {
            capturedErrors.push(err);
          }
          await advanceAppTime(0);
        }
        for (const tab of [...tabs].reverse()) {
          try {
            tab.focus?.();
            tab.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
            tab.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
            tab.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
            tab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
            tab.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
          } catch (err) {
            capturedErrors.push(err);
          }
          await advanceAppTime(0);
        }
      }
    }

    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', errorHandler);
    consoleErrorSpy.mockRestore();

    await advanceAppTime(4000);
    jest.clearAllTimers();

    if (capturedErrors.length > 0) {
      throw new Error(`Detected issues while stress testing interactive elements: ${capturedErrors.map(String).join('\n')}`);
    }
  });

  test('handles offline caching workflows and floating launcher coverage', async () => {
    const capturedErrors = [];
    const captureError = detail => {
      if (shouldAllowCapturedError(detail)) return;
      capturedErrors.push(detail);
    };
    const errorHandler = event => {
      const detail = event?.error ?? event?.message ?? event?.reason ?? event;
      captureError(detail);
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', errorHandler);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      captureError(args.join(' '));
    });

    const manifest = {
      version: 'v-test-offline',
      assets: ['/media/launch.mp4', '/scripts/main.js', '/styles/app.css'],
    };

    const baseFetch = globalThis.fetch;
    const cachePutCalls = [];
    const mockCache = {
      match: jest.fn().mockResolvedValue(null),
      put: jest.fn(async (url, response) => {
        cachePutCalls.push([url, response]);
      }),
    };
    const mockCaches = {
      open: jest.fn().mockResolvedValue(mockCache),
    };
    globalThis.caches = mockCaches;

    globalThis.fetch = jest.fn(async resource => {
      const url = typeof resource === 'string' ? resource : resource?.url;
      if (typeof url === 'string' && url.includes('asset-manifest.json')) {
        return new Response(JSON.stringify(manifest), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      if (typeof url === 'string' && manifest.assets.some(asset => url.includes(asset))) {
        return new Response('ok', { status: 200 });
      }
      return baseFetch(resource);
    });

    await importAllApplicationScripts();
    dispatchAppReadyEvents();
    const skipLaunchButton = document.querySelector('[data-skip-launch]');
    if (skipLaunchButton) {
      skipLaunchButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } else {
      window.dispatchEvent(new Event('launch-animation-skip'));
    }
    await advanceAppTime(1500);

    const offlineButton = document.querySelector('[data-sync-prefetch]');
    const offlineStatus = document.querySelector('[data-sync-prefetch-status]');
    expect(offlineButton).toBeTruthy();
    expect(offlineStatus).toBeTruthy();

    offlineButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await advanceAppTime(0);
    await advanceAppTime(0);

    expect(mockCaches.open).toHaveBeenCalledWith(manifest.version);
    expect(cachePutCalls.length).toBeGreaterThanOrEqual(manifest.assets.length);
    expect(offlineStatus.textContent).toMatch(/Offline ready/i);
    expect(localStorage.getItem('cccg.offlineManifestVersion')).toBe(manifest.version);

    window.navigator.onLine = false;
    offlineButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await advanceAppTime(0);
    expect(offlineStatus.textContent).toMatch(/Connect to the internet/i);
    expect(document.body.classList.contains('dm-floating-covered')).toBe(false);
    const coverCount = window.coverFloatingLauncher?.();
    await advanceAppTime(0);
    expect(coverCount).toBeGreaterThanOrEqual(1);
    expect(document.body.getAttribute('data-floating-covered')).toBe('true');
    const releaseCount = window.releaseFloatingLauncher?.();
    await advanceAppTime(0);
    expect(releaseCount).toBe(0);
    expect(document.body.hasAttribute('data-floating-covered')).toBe(false);

    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', errorHandler);
    consoleErrorSpy.mockRestore();

    await advanceAppTime(1000);
    jest.clearAllTimers();

    if (capturedErrors.length > 0) {
      throw new Error(`Detected issues while validating offline caching and floating launcher coverage: ${capturedErrors.map(String).join('\n')}`);
    }
  });
});
