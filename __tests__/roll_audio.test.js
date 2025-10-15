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
    textContent: '',
    disabled: false,
    checked: false,
    hidden: false,
    dataset: {},
  };
}

describe('roll and coin audio cues', () => {
  let audioContextMock;
  let sourceNode;
  let gainNode;
  let originalGetElementById;
  let originalMatchMedia;
  let originalFetch;
  let originalConfirm;
  let originalAudioContext;
  let originalWebkitAudioContext;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();

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
        <div id="coin-animation"></div>
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

    gainNode = {
      gain: { value: 0 },
      connect: jest.fn(() => ({ connect: jest.fn() })),
    };
    sourceNode = {
      connect: jest.fn(() => gainNode),
      start: jest.fn(),
    };
    audioContextMock = {
      sampleRate: 48000,
      createBuffer: jest.fn((channels, length) => ({
        getChannelData: jest.fn(() => new Float32Array(length)),
      })),
      createBufferSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => gainNode),
      resume: jest.fn().mockResolvedValue(),
      destination: {},
    };
    originalAudioContext = window.AudioContext;
    originalWebkitAudioContext = window.webkitAudioContext;
    window.AudioContext = jest.fn(() => audioContextMock);
    window.webkitAudioContext = undefined;
  });

  afterEach(() => {
    document.getElementById = originalGetElementById;
    window.matchMedia = originalMatchMedia;
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.AudioContext = originalAudioContext;
    window.webkitAudioContext = originalWebkitAudioContext;
  });

  async function loadMain() {
    const module = await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    return module;
  }

  test('triggers audio helper when rolling dice', async () => {
    await loadMain();
    const rollButton = document.getElementById('roll-dice');
    window.AudioContext.mockClear();
    audioContextMock.createBufferSource.mockClear();

    rollButton.click();

    expect(window.AudioContext).toHaveBeenCalled();
    expect(audioContextMock.createBufferSource).toHaveBeenCalled();
  });

  test('triggers audio helper on dm-roll button when distinct', async () => {
    await loadMain();
    const dmRollButton = document.getElementById('dm-roll');
    window.AudioContext.mockClear();
    audioContextMock.createBufferSource.mockClear();

    dmRollButton.click();

    expect(window.AudioContext).toHaveBeenCalled();
    expect(audioContextMock.createBufferSource).toHaveBeenCalled();
  });

  test('triggers audio helper on coin flip', async () => {
    await loadMain();
    const coinButton = document.getElementById('flip');
    window.AudioContext.mockClear();
    audioContextMock.createBufferSource.mockClear();

    coinButton.click();

    expect(window.AudioContext).toHaveBeenCalled();
    expect(audioContextMock.createBufferSource).toHaveBeenCalled();
  });
});
