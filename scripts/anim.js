// Full-screen hit FX (separate from Player Tools drawer cracks)
(() => {
  const HIT_FX_ID = 'cccg-hit-fx';
  const HIT_FX_CLASS = 'cccg-hit-active';

  // Extend by +1000ms (add exactly 1 second)
  // If you previously used 1200ms, this becomes 2200ms total.
  const HIT_FX_DURATION_MS = 2200;
  const HIT_FX_COOLDOWN_MS = 250;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const queryFirst = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const readNumberFromEl = (el) => {
    if (!el) return NaN;
    const v =
      typeof el.value === 'string'
        ? el.value
        : typeof el.textContent === 'string'
        ? el.textContent
        : '';
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };

  const getHpState = () => {
    const curEl = queryFirst([
      '#hp-current',
      '#current-hp',
      '#hpCurrent',
      '[data-hp-current]',
      '.hp-current input',
      '.hp-current',
      '[name="hp-current"]'
    ]);

    const maxEl = queryFirst([
      '#hp-max',
      '#max-hp',
      '#hpMax',
      '[data-hp-max]',
      '.hp-max input',
      '.hp-max',
      '[name="hp-max"]'
    ]);

    const cur = readNumberFromEl(curEl);
    const max = readNumberFromEl(maxEl);
    if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return null;
    const pct = clamp(cur / max, 0, 1);
    return { cur, max, pct };
  };

  const ensureHitFxEl = () => {
    let el = document.getElementById(HIT_FX_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HIT_FX_ID;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  };

  let lastFxAt = 0;
  let clearTimer = null;
  let lastHpCur = null;

  const playHitFx = (severity = 0.5) => {
    const now = Date.now();
    if (now - lastFxAt < HIT_FX_COOLDOWN_MS) return;
    lastFxAt = now;

    const el = ensureHitFxEl();
    const s = clamp(severity, 0, 1);

    // Drive intensity via CSS variables
    el.style.setProperty('--cccg-hit-alpha', String(0.35 + s * 0.55));
    el.style.setProperty('--cccg-hit-glow', String(0.20 + s * 0.55));
    el.style.setProperty('--cccg-hit-blur', `${0.6 + s * 1.2}px`);
    el.style.setProperty('--cccg-hit-dur', `${HIT_FX_DURATION_MS}ms`);

    document.documentElement.classList.add(HIT_FX_CLASS);

    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      document.documentElement.classList.remove(HIT_FX_CLASS);
    }, HIT_FX_DURATION_MS + 50);
  };

  // Poll HP; trigger when HP decreases.
  // This is intentionally decoupled from the Player Tools drawer cracks.
  const tick = () => {
    const hp = getHpState();
    if (!hp) return;

    if (typeof lastHpCur === 'number' && hp.cur < lastHpCur) {
      const delta = lastHpCur - hp.cur;
      // Severity scales with missing chunk and current danger
      const danger = 1 - hp.pct;
      const severity = clamp((delta / Math.max(1, hp.max)) * 4 + danger * 0.75, 0.15, 1);
      playHitFx(severity);
    }
    lastHpCur = hp.cur;
  };

  // Start after DOM ready
  const start = () => {
    ensureHitFxEl();
    setInterval(tick, 220);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

const root = () => document.documentElement;

function readVarRaw(name) {
  try {
    return getComputedStyle(root()).getPropertyValue(name).trim();
  } catch (err) {
    console.warn('Animation variable read failed', name, err);
    return '';
  }
}

export function motion(name, fallback) {
  const value = Number.parseFloat(readVarRaw(name));
  if (Number.isFinite(value)) return value;
  return fallback;
}

export function easing(name, fallback) {
  const value = readVarRaw(name);
  if (value) return value;
  return fallback;
}

export function animate(el, keyframes, options) {
  if (!el) return null;
  try {
    const anim = el.animate(keyframes, options);
    anim.finished.catch(() => {});
    return anim;
  } catch (err) {
    console.warn('Animation failed', err);
    return null;
  }
}

export function fadePop(
  el,
  {
    duration = 240,
    scaleFrom = 0.98,
    scaleTo = 1,
    easing: ease = 'cubic-bezier(.16,1,.3,1)',
    blurFrom = 2,
    blurTo = 0,
  } = {}
) {
  return animate(
    el,
    [
      { opacity: 0, transform: `scale(${scaleFrom})`, filter: `blur(${blurFrom}px)` },
      { opacity: 1, transform: `scale(${scaleTo})`, filter: `blur(${blurTo}px)` },
    ],
    { duration, easing: ease, fill: 'forwards' }
  );
}

export function fadeOut(el, { duration = 240, easing: ease = 'linear', delay = 0, from } = {}) {
  if (!el) return null;

  let currentOpacity = 1;
  if (Number.isFinite(from)) {
    currentOpacity = from;
  } else {
    try {
      currentOpacity = Number.parseFloat(getComputedStyle(el).opacity) || 1;
    } catch (_) {
      currentOpacity = 1;
    }
  }

  return animate(
    el,
    [
      { opacity: currentOpacity },
      { opacity: 0 },
    ],
    { duration, easing: ease, fill: 'forwards', delay }
  );
}
