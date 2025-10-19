import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function getMediaQueryList() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY);
  } catch (err) {
    return null;
  }
}

function subscribeToChange(mql, handler) {
  if (!mql) return () => {};
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => {
      try {
        mql.removeEventListener('change', handler);
      } catch (err) {
        /* ignore teardown errors */
      }
    };
  }
  if (typeof mql.addListener === 'function') {
    mql.addListener(handler);
    return () => {
      try {
        mql.removeListener(handler);
      } catch (err) {
        /* ignore teardown errors */
      }
    };
  }
  return () => {};
}

export default function useSafeReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    const mql = getMediaQueryList();
    return mql ? Boolean(mql.matches) : false;
  });

  useEffect(() => {
    const mql = getMediaQueryList();
    if (!mql) {
      return undefined;
    }

    const handleChange = event => {
      setPrefersReducedMotion(Boolean(event?.matches));
    };

    const unsubscribe = subscribeToChange(mql, handleChange);

    // Ensure the value stays in sync if the preference changed before the effect ran.
    setPrefersReducedMotion(Boolean(mql.matches));

    return unsubscribe;
  }, []);

  return prefersReducedMotion;
}
