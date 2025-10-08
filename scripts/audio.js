const EFFECT_SETTINGS = {
  damage: {
    frequency: 220,
    type: 'triangle',
    duration: 0.4,
    volume: 0.25,
    attack: 0.01,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.35 },
    ],
  },
  heal: {
    frequency: 660,
    type: 'sine',
    duration: 0.7,
    volume: 0.22,
    attack: 0.015,
    release: 0.3,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.55 },
      { ratio: 2, amplitude: 0.3 },
    ],
  },
  down: {
    frequency: 110,
    type: 'sawtooth',
    duration: 0.55,
    volume: 0.3,
    attack: 0.02,
    release: 0.25,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.6 },
    ],
  },
  death: {
    frequency: 70,
    type: 'square',
    duration: 0.85,
    volume: 0.28,
    attack: 0.01,
    release: 0.35,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.45 },
    ],
  },
  save: {
    frequency: 523.25,
    type: 'sine',
    duration: 0.35,
    volume: 0.18,
    attack: 0.015,
    release: 0.12,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.25, amplitude: 0.4 },
    ],
  },
  coin: {
    frequency: 880,
    type: 'triangle',
    duration: 0.25,
    volume: 0.2,
    attack: 0.005,
    release: 0.1,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 2, amplitude: 0.5 },
    ],
  },
  sp: {
    frequency: 392,
    type: 'square',
    duration: 0.3,
    volume: 0.2,
    attack: 0.01,
    release: 0.15,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 0.5, amplitude: 0.3 },
    ],
  },
  load: {
    frequency: 261.63,
    type: 'sawtooth',
    duration: 0.45,
    volume: 0.2,
    attack: 0.02,
    release: 0.18,
    partials: [
      { ratio: 1, amplitude: 1 },
      { ratio: 1.5, amplitude: 0.35 },
    ],
  },
};

let audioContext;
const audioBufferCache = new Map();

function ensureAudioContext(){
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) {
    audioContext = new Ctx();
  }
  if (audioContext?.state === 'suspended') {
    audioContext.resume?.().catch(() => {});
  }
  return audioContext;
}

function renderWaveSample(type, freq, t){
  const phase = 2 * Math.PI * freq * t;
  switch (type) {
    case 'square':
      return Math.sign(Math.sin(phase)) || 0;
    case 'triangle':
      return (2 * Math.asin(Math.sin(phase))) / Math.PI;
    case 'sawtooth':
      return 2 * (freq * t - Math.floor(0.5 + freq * t));
    default:
      return Math.sin(phase);
  }
}

function buildAudioBuffer(name){
  const ctx = ensureAudioContext();
  if (!ctx) return null;
  const config = EFFECT_SETTINGS[name];
  if (!config) return null;
  const {
    duration = 0.4,
    frequency = 440,
    type = 'sine',
    volume = 0.2,
    attack = 0.01,
    release = 0.1,
    partials,
  } = config;
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);
  const voices = (partials && partials.length) ? partials : [{ ratio: 1, amplitude: 1 }];
  const normalization = voices.reduce((sum, part) => sum + Math.abs(part.amplitude ?? 1), 0) || 1;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let envelope = 1;
    if (attack > 0 && t < attack) {
      envelope = t / attack;
    } else if (release > 0 && t > duration - release) {
      envelope = Math.max((duration - t) / release, 0);
    }
    let sample = 0;
    for (const part of voices) {
      const ratio = part.ratio ?? 1;
      const amplitude = part.amplitude ?? 1;
      sample += amplitude * renderWaveSample(type, frequency * ratio, t);
    }
    data[i] = (sample / normalization) * envelope * volume;
  }

  audioBufferCache.set(name, buffer);
  return buffer;
}

function playEffect(name){
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const buffer = audioBufferCache.get(name) ?? buildAudioBuffer(name);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 1;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

export { playEffect };
export const __TEST_EXPORTS__ = { ensureAudioContext, buildAudioBuffer, EFFECT_SETTINGS };
