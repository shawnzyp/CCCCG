const TOAST_TONE_PATTERNS = Object.freeze({
  success: Object.freeze([
    Object.freeze({ frequency: 784, duration: 0.14 }),
    Object.freeze({ frequency: 1046.5, duration: 0.16 }),
    Object.freeze({ frequency: 1318.5, duration: 0.18 }),
  ]),
  warning: Object.freeze([
    Object.freeze({ frequency: 784, duration: 0.12 }),
    Object.freeze({ frequency: 659.25, duration: 0.12 }),
    Object.freeze({ frequency: 784, duration: 0.16 }),
  ]),
  error: Object.freeze([
    Object.freeze({ frequency: 392, duration: 0.18 }),
    Object.freeze({ frequency: 261.63, duration: 0.22 }),
  ]),
  info: Object.freeze([
    Object.freeze({ frequency: 587.33, duration: 0.22 }),
  ]),
  default: Object.freeze([
    Object.freeze({ frequency: 523.25, duration: 0.2 }),
  ]),
});

const TYPE_KEYWORDS = [
  { key: 'success', patterns: ['success', 'confirm', 'positive', 'pass', 'ok'] },
  { key: 'warning', patterns: ['warn', 'caution', 'alert'] },
  { key: 'error', patterns: ['error', 'fail', 'danger', 'critical', 'invalid'] },
  { key: 'info', patterns: ['info', 'notice', 'hint', 'status'] },
];

export function normalizeToastToneType(type) {
  if (typeof type !== 'string') return '';
  return type.trim().toLowerCase();
}

export function mapToastToneKey(type) {
  const normalized = normalizeToastToneType(type);
  if (normalized && TOAST_TONE_PATTERNS[normalized]) {
    return normalized;
  }
  if (normalized) {
    const alias = TYPE_KEYWORDS.find(entry =>
      entry.patterns.some(keyword => normalized.includes(keyword))
    );
    if (alias) {
      return alias.key;
    }
  }
  return 'default';
}

export function getToastTonePattern(type) {
  const key = mapToastToneKey(type);
  const pattern = TOAST_TONE_PATTERNS[key] || TOAST_TONE_PATTERNS.default;
  return pattern.map(segment => ({
    frequency: segment.frequency,
    duration: segment.duration,
  }));
}

export function playToastToneForType(audioCtx, type) {
  if (!audioCtx || typeof audioCtx.createOscillator !== 'function' || typeof audioCtx.createGain !== 'function') {
    return false;
  }
  const pattern = getToastTonePattern(type);
  if (!pattern.length) {
    return false;
  }

  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  if (!oscillator || !gain || typeof oscillator.connect !== 'function' || typeof gain.connect !== 'function') {
    return false;
  }

  const now = typeof audioCtx.currentTime === 'number' ? audioCtx.currentTime : 0;
  const rampUpDuration = 0.015;
  const releaseDuration = 0.06;
  const maxGain = 0.12;

  oscillator.type = 'sine';
  oscillator.connect(gain);
  if (audioCtx.destination) {
    gain.connect(audioCtx.destination);
  }

  const gainParam = gain.gain;
  if (gainParam) {
    if (typeof gainParam.cancelScheduledValues === 'function') {
      gainParam.cancelScheduledValues(now);
    }
    if (typeof gainParam.setValueAtTime === 'function') {
      gainParam.setValueAtTime(0, now);
      if (typeof gainParam.linearRampToValueAtTime === 'function') {
        gainParam.linearRampToValueAtTime(maxGain, now + rampUpDuration);
      } else {
        gainParam.setValueAtTime(maxGain, now + rampUpDuration);
      }
    } else {
      gainParam.value = maxGain;
    }
  }

  const frequencyParam = oscillator.frequency;
  const canScheduleFrequency = frequencyParam && typeof frequencyParam.setValueAtTime === 'function';
  let segmentStart = now;
  let totalDuration = 0;
  for (const segment of pattern) {
    const frequency = Number(segment?.frequency);
    const duration = Number(segment?.duration);
    if (!Number.isFinite(frequency) || !Number.isFinite(duration) || duration <= 0) {
      continue;
    }
    if (canScheduleFrequency) {
      frequencyParam.setValueAtTime(frequency, segmentStart);
    } else if (frequencyParam) {
      frequencyParam.value = frequency;
    }
    segmentStart += duration;
    totalDuration += duration;
  }

  if (totalDuration <= 0) {
    totalDuration = 0.18;
  }

  const sustainEnd = now + totalDuration;
  const stopTime = sustainEnd + releaseDuration;

  if (gainParam && typeof gainParam.setValueAtTime === 'function') {
    gainParam.setValueAtTime(maxGain, sustainEnd);
    if (typeof gainParam.linearRampToValueAtTime === 'function') {
      gainParam.linearRampToValueAtTime(0, stopTime);
    } else {
      gainParam.setValueAtTime(0, stopTime);
    }
  }

  if (typeof oscillator.start === 'function') {
    oscillator.start(now);
  }
  if (typeof oscillator.stop === 'function') {
    oscillator.stop(stopTime);
  }

  return true;
}

export { TOAST_TONE_PATTERNS };
