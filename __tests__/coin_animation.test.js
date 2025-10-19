import { jest } from '@jest/globals';

function createStubElement() {
  return {
    innerHTML: '',
    value: '',
    style: { setProperty: () => {}, getPropertyValue: () => '' },
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    setAttribute: () => {},
    removeAttribute: () => {},
    getAttribute: () => null,
    add: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: () => {},
    click: () => {},
    closest: () => null,
    textContent: '',
    disabled: false,
    checked: false,
    hidden: false,
    dataset: {},
  };
}

describe('coin flip animation states', () => {
  let originalGetElementById;
  let originalMatchMedia;
  let originalFetch;
  let originalConfirm;
  let originalAudioContext;
  let originalWebkitAudioContext;
  let originalMathRandom;
  let originalQueueMicrotask;

  const audioContextMock = {
    sampleRate: 48000,
    createBuffer: jest.fn((channels, length) => ({
      getChannelData: jest.fn(() => new Float32Array(length)),
    })),
    createBufferSource: jest.fn(() => ({
      connect: jest.fn(() => ({ connect: jest.fn() })),
      start: jest.fn(),
    })),
    createGain: jest.fn(() => ({
      gain: { value: 0 },
      connect: jest.fn(() => ({ connect: jest.fn() })),
    })),
    resume: jest.fn().mockResolvedValue(),
    destination: {},
  };

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();

    audioContextMock.createBuffer.mockClear();
    audioContextMock.createBufferSource.mockClear();
    audioContextMock.createGain.mockClear();

    document.body.innerHTML = `
      <div id="dice-tools">
        <input id="dice-sides" value="20" />
        <input id="dice-count" value="1" />
        <span id="dice-out"></span>
        <ul id="dice-breakdown"></ul>
        <div id="damage-animation"></div>
        <button id="roll-dice" type="button"></button>
        <button id="dm-roll" type="button"></button>
        <button id="flip" type="button"></button>
        <span id="flip-out"></span>
        <div id="coin-animation" data-heads="Heads" data-tails="Tails">
          <span class="coin-result"></span>
          <span class="coin-face coin-face--heads" aria-hidden="true"></span>
          <span class="coin-face coin-face--tails" aria-hidden="true"></span>
        </div>
      </div>
      <div id="log-action"></div>
      <div id="full-log-action"></div>
      <div id="toast"></div>
    `;

    originalGetElementById = document.getElementById;
    const realGet = document.getElementById.bind(document);
    document.getElementById = (id) => realGet(id) || createStubElement();

    originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });

    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);

    originalAudioContext = window.AudioContext;
    originalWebkitAudioContext = window.webkitAudioContext;
    window.AudioContext = jest.fn(() => audioContextMock);
    window.webkitAudioContext = undefined;

    originalMathRandom = Math.random;
    originalQueueMicrotask = global.queueMicrotask;
    global.queueMicrotask = () => {};
  });

  afterEach(() => {
    document.getElementById = originalGetElementById;
    window.matchMedia = originalMatchMedia;
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.AudioContext = originalAudioContext;
    window.webkitAudioContext = originalWebkitAudioContext;
    Math.random = originalMathRandom;
    global.queueMicrotask = originalQueueMicrotask;
  });

  async function loadMain() {
    const module = await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    return module;
  }

  test('heads result applies heads animation class', async () => {
    await loadMain();
    const coinButton = document.getElementById('flip');
    const coinAnimation = document.getElementById('coin-animation');

    Math.random = jest.fn(() => 0.25);

    coinButton.click();

    expect(coinAnimation.classList.contains('is-heads')).toBe(true);
    expect(coinAnimation.classList.contains('is-tails')).toBe(false);
    const resultLabel = coinAnimation.querySelector('.coin-result');
    expect(resultLabel?.textContent).toBe('Heads');
    const headsFace = coinAnimation.querySelector('.coin-face--heads');
    expect(headsFace?.textContent).toBe('');
  });

  test('tails result applies tails animation class', async () => {
    await loadMain();
    const coinButton = document.getElementById('flip');
    const coinAnimation = document.getElementById('coin-animation');

    Math.random = jest.fn(() => 0.75);

    coinButton.click();

    expect(coinAnimation.classList.contains('is-tails')).toBe(true);
    expect(coinAnimation.classList.contains('is-heads')).toBe(false);
    const resultLabel = coinAnimation.querySelector('.coin-result');
    expect(resultLabel?.textContent).toBe('Tails');
    const tailsFace = coinAnimation.querySelector('.coin-face--tails');
    expect(tailsFace?.textContent).toBe('');
  });
});
