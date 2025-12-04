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

export function fadeOut(el, { duration = 240, easing: ease = 'linear', delay = 0 } = {}) {
  const currentOpacity = Number.parseFloat(getComputedStyle(el).opacity) || 0;
  return animate(
    el,
    [
      { opacity: currentOpacity || 1 },
      { opacity: 0 },
    ],
    { duration, easing: ease, fill: 'forwards', delay }
  );
}
