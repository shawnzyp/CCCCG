import { jest } from '@jest/globals';

function setupAudioContextMock() {
  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = {};
      this.resume = jest.fn(() => Promise.resolve());
      this.close = jest.fn(() => Promise.resolve());
    }

    createBuffer(_channels, length) {
      const data = new Float32Array(length);
      return {
        getChannelData: () => data,
      };
    }

    createBufferSource() {
      return {
        buffer: null,
        connect: jest.fn().mockReturnThis(),
        start: jest.fn(),
      };
    }

    createGain() {
      return {
        gain: { value: 0 },
        connect: jest.fn().mockReturnThis(),
      };
    }

    createOscillator() {
      return {
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        disconnect: jest.fn(),
      };
    }
  }

  const ctor = jest.fn(() => new MockAudioContext());
  globalThis.AudioContext = ctor;
  if (globalThis.window) {
    globalThis.window.AudioContext = ctor;
  }
  return ctor;
}

function cleanupAudioContextMock(original) {
  if (original === undefined) {
    delete globalThis.AudioContext;
    if (globalThis.window) {
      delete globalThis.window.AudioContext;
    }
    return;
  }
  globalThis.AudioContext = original;
  if (globalThis.window) {
    globalThis.window.AudioContext = original;
  }
}

function dispatchGesture() {
  if (!globalThis.window) return;
  globalThis.window.dispatchEvent(new Event('pointerdown'));
}

describe('audio playback contract', () => {
  const originalAudioContext = globalThis.AudioContext;

  afterEach(() => {
    cleanupAudioContextMock(originalAudioContext);
    if (globalThis.localStorage) {
      globalThis.localStorage.clear();
    }
    jest.restoreAllMocks();
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('playCue before priming returns not_primed and does not create context', async () => {
    const ctor = setupAudioContextMock();
    const { playCue } = await import('../scripts/audio.js');

    const result = playCue('success');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_primed');
    expect(ctor).not.toHaveBeenCalled();
  });

  test('dedupe prevents duplicate cues per tick unless disabled', async () => {
    setupAudioContextMock();
    const { attachAudioGestureListeners, playCue } = await import('../scripts/audio.js');

    attachAudioGestureListeners();
    dispatchGesture();

    const first = playCue('damage');
    const second = playCue('damage');

    expect(first.status).toBe('played');
    expect(second.status).toBe('deduped');

    const criticalFirst = playCue('error');
    const criticalSecond = playCue('error');

    expect(criticalFirst.status).toBe('played');
    expect(criticalSecond.status).toBe('played');
  });

  test('muted cue returns muted result without creating context', async () => {
    const ctor = setupAudioContextMock();
    const { playCue } = await import('../scripts/audio.js');

    const result = playCue('success', { muted: true });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('muted');
    expect(ctor).not.toHaveBeenCalled();
  });

  test('notifications exports remain stable', async () => {
    const notifications = await import('../scripts/notifications.js');

    expect(typeof notifications.toast).toBe('function');
    expect(typeof notifications.dismissToast).toBe('function');
    expect(typeof notifications.clearToastQueue).toBe('function');
    expect(typeof notifications.playTone).toBe('function');
    expect(typeof notifications.default).toBe('function');
  });

  test('priming listeners are attached once', async () => {
    setupAudioContextMock();
    const addListenerSpy = jest.spyOn(window, 'addEventListener');
    const { attachAudioGestureListeners } = await import('../scripts/audio.js');

    attachAudioGestureListeners();
    attachAudioGestureListeners();

    const gestureEvents = addListenerSpy.mock.calls.filter(([eventName]) =>
      eventName === 'pointerdown' || eventName === 'keydown',
    );
    const pointerListeners = gestureEvents.filter(([eventName]) => eventName === 'pointerdown');
    const keyListeners = gestureEvents.filter(([eventName]) => eventName === 'keydown');

    expect(pointerListeners).toHaveLength(1);
    expect(keyListeners).toHaveLength(1);
  });

  test('SFX settings persist to localStorage', async () => {
    setupAudioContextMock();
    const { setSfxEnabled, setSfxVolume, getSfxSettings } = await import('../scripts/audio.js');

    setSfxEnabled(false);
    setSfxVolume(0.4);

    const settings = getSfxSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.volume).toBeCloseTo(0.4);

    jest.resetModules();
    const reloaded = await import('../scripts/audio.js');
    expect(reloaded.getSfxSettings().enabled).toBe(false);
    expect(reloaded.getSfxSettings().volume).toBeCloseTo(0.4);
  });

  test('toast uses playCue integration', async () => {
    document.body.innerHTML = '<div id="toast"></div>';
    const notifications = await import('../scripts/notifications.js');
    const playCueMock = jest.fn(() => ({ ok: true, status: 'played', reason: 'played' }));
    window.playCue = playCueMock;

    notifications.toast('Hello world', 'success');

    expect(playCueMock).toHaveBeenCalledWith('success', { source: 'toast' });
  });

  test('toast honors playTone overrides when playCue is not overridden', async () => {
    document.body.innerHTML = '<div id="toast"></div>';
    const originalPlayCue = window.playCue;
    const originalPlayTone = window.playTone;
    delete window.playCue;
    const playToneMock = jest.fn();
    window.playTone = playToneMock;

    const notifications = await import('../scripts/notifications.js');

    notifications.toast('Hello world', 'success');

    expect(playToneMock).toHaveBeenCalledWith('success', { source: 'toast' });

    if (originalPlayCue === undefined) {
      delete window.playCue;
    } else {
      window.playCue = originalPlayCue;
    }
    if (originalPlayTone === undefined) {
      delete window.playTone;
    } else {
      window.playTone = originalPlayTone;
    }
  });
});
