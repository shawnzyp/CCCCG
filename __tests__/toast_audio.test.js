import { getToastTonePattern, mapToastToneKey, normalizeToastToneType, playToastToneForType } from '../scripts/toast-audio.js';

function createMockAudioContext() {
  const oscillatorCalls = [];
  const gainCalls = [];

  class FrequencyParam {
    constructor() {
      this.events = [];
      this.value = 0;
    }
    setValueAtTime(value, time) {
      this.events.push({ value, time });
      this.value = value;
    }
  }

  class GainParam {
    constructor() {
      this.cancelledAt = [];
      this.events = [];
      this.value = 0;
    }
    cancelScheduledValues(time) {
      this.cancelledAt.push(time);
    }
    setValueAtTime(value, time) {
      this.events.push({ type: 'set', value, time });
      this.value = value;
    }
    linearRampToValueAtTime(value, time) {
      this.events.push({ type: 'ramp', value, time });
      this.value = value;
    }
  }

  class GainNodeMock {
    constructor() {
      this.gain = new GainParam();
      this.connections = [];
    }
    connect(node) {
      this.connections.push(node);
    }
  }

  class OscillatorNodeMock {
    constructor() {
      this.frequency = new FrequencyParam();
      this.connections = [];
      this.started = [];
      this.stopped = [];
      this.type = '';
    }
    connect(node) {
      this.connections.push(node);
    }
    start(time) {
      this.started.push(time);
    }
    stop(time) {
      this.stopped.push(time);
    }
  }

  return {
    currentTime: 1,
    destination: { id: 'dest', connections: [] },
    createOscillator() {
      const osc = new OscillatorNodeMock();
      oscillatorCalls.push(osc);
      return osc;
    },
    createGain() {
      const gain = new GainNodeMock();
      gainCalls.push(gain);
      return gain;
    },
    oscillators: oscillatorCalls,
    gains: gainCalls,
  };
}

describe('toast audio mapping', () => {
  test('normalizes toast types safely', () => {
    expect(normalizeToastToneType('  SUCCESS  ')).toBe('success');
    expect(normalizeToastToneType(null)).toBe('');
    expect(mapToastToneKey('custom-warning')).toBe('warning');
    expect(mapToastToneKey('unknown-type')).toBe('default');
  });

  test('info toasts schedule a single mellow tone', () => {
    const ctx = createMockAudioContext();
    playToastToneForType(ctx, 'INFO');
    const osc = ctx.oscillators[0];
    expect(osc.frequency.events).toEqual([{ value: 587.33, time: 1 }]);
  });

  test('success toasts play an ascending triad', () => {
    const ctx = createMockAudioContext();
    playToastToneForType(ctx, 'success');
    const events = ctx.oscillators[0].frequency.events;
    expect(events).toHaveLength(3);
    expect(events.map(evt => evt.value)).toEqual([784, 1046.5, 1318.5]);
    expect(events.map(evt => Number(evt.time.toFixed(2)))).toEqual([1, 1.14, 1.3]);
  });

  test('warning toasts pulse between mid tones', () => {
    const ctx = createMockAudioContext();
    playToastToneForType(ctx, 'warning');
    const events = ctx.oscillators[0].frequency.events;
    expect(events.map(evt => evt.value)).toEqual([784, 659.25, 784]);
    expect(events.map(evt => Number(evt.time.toFixed(2)))).toEqual([1, 1.12, 1.24]);
  });

  test('error toasts descend sharply', () => {
    const ctx = createMockAudioContext();
    playToastToneForType(ctx, 'error');
    const events = ctx.oscillators[0].frequency.events;
    expect(events.map(evt => ({ value: evt.value, time: Number(evt.time.toFixed(2)) }))).toEqual([
      { value: 392, time: 1 },
      { value: 261.63, time: 1.18 },
    ]);
  });

  test('pattern lookup returns copies for external use', () => {
    const pattern = getToastTonePattern('success');
    expect(pattern).toEqual([
      { frequency: 784, duration: 0.14 },
      { frequency: 1046.5, duration: 0.16 },
      { frequency: 1318.5, duration: 0.18 },
    ]);
    pattern[0].frequency = 0;
    const nextPattern = getToastTonePattern('success');
    expect(nextPattern[0].frequency).toBe(784);
  });
});
