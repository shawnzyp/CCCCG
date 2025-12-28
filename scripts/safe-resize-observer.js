// Safe ResizeObserver wrapper
// Goal: prevent "ResizeObserver loop completed with undelivered notifications."
// by batching callbacks into rAF and blocking re-entrant delivery storms.
//
// Also optionally suppress the known-benign warning text from window.onerror and console,
// because some browsers surface it as an "error" even when nothing is actually broken.

const RO_LOOP_MSG_1 = 'ResizeObserver loop completed with undelivered notifications';
const RO_LOOP_MSG_2 = 'ResizeObserver loop limit exceeded';
const RO_LOOP_MSGS = [RO_LOOP_MSG_1, RO_LOOP_MSG_2];
const RO_LOOP_LOWER = RO_LOOP_MSGS.map((s) => String(s).toLowerCase());

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isLikelyJsdom() {
  try {
    const ua = String(navigator?.userAgent || '').toLowerCase();
    return ua.includes('jsdom');
  } catch {
    return false;
  }
}

function trySetDisableRO(reason) {
  try {
    localStorage.setItem('cc:disable-ro', '1');
    sessionStorage.setItem('cc:disable-ro:reason', String(reason || 'storm'));
  } catch {}
}

function now() {
  try {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  } catch {
    return Date.now();
  }
}

function scheduleRAF(fn) {
  try {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  } catch {}
  return setTimeout(fn, 16);
}

function scheduleMicrotask(fn) {
  try {
    if (typeof queueMicrotask === 'function') return queueMicrotask(fn);
  } catch {}
  try {
    return Promise.resolve().then(fn);
  } catch {}
  return setTimeout(fn, 0);
}

export function installResizeObserverSafety(options = {}) {
  if (!isBrowser()) return;
  if (window.__ccResizeObserverSafetyInstalled) return;

  const {
    // Batch RO callbacks via rAF to avoid sync resize feedback loops.
    patchResizeObserver = true,
    // Filter only the known RO loop message from console.error/warn.
    suppressConsole = true,
    // Prevent window error events for the RO loop message from bubbling.
    suppressWindowError = true,
    // Most aggressive: disable ResizeObserver entirely (fallback/no-op).
    disableResizeObserver = false,
    // Prevent later scripts from overwriting the patched ResizeObserver.
    lockResizeObserver = true,
    // Circuit breaker: if we detect a delivery storm, degrade to Noop and persist a disable flag.
    enableCircuitBreaker = true,
  } = options || {};

  window.__ccResizeObserverSafetyInstalled = true;

  // Hard disable mode: replace ResizeObserver with a no-op implementation.
  // Use for worst-case debugging or to stop warnings in hostile browsers.
  if (disableResizeObserver) {
    try {
      if (!window.__ccNativeResizeObserver) window.__ccNativeResizeObserver = window.ResizeObserver;
    } catch {}
    class NoopResizeObserver {
      constructor() {
        this._disposed = false;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        this._disposed = true;
      }
    }
    try {
      window.ResizeObserver = NoopResizeObserver;
      window.__ccResizeObserverDisabled = { ts: Date.now() };
      // Do not lock in disabled mode.
      window.__ccResizeObserverLocked = null;
    } catch {}
  }

  // 1) Patch ResizeObserver (prevention)
  if (patchResizeObserver && !disableResizeObserver) {
    const Native = window.ResizeObserver;
    // If browser does not support it or it was already patched, do nothing.
    if (typeof Native === 'function' && !window.__ccResizeObserverPatched) {
      window.__ccResizeObserverPatched = true;
      window.__ccNativeResizeObserver = Native;

      // Global batching across all observers.
      // This reduces layout thrash and prevents per-observer delivery storms.
      const GLOBAL = (window.__ccROGlobal = window.__ccROGlobal || {
        pending: new Set(),
        scheduled: false,
        delivering: false,
        frameId: 0,
        deliveriesThisFrame: 0,
        lastFrameAt: 0,
        stormFrames: 0,
        degraded: false,
      });

      const MAX_DELIVERIES_PER_FRAME = 2; // conservative
      const MAX_TOTAL_ENTRIES_PER_DELIVERY = 500; // safety cap
      const STORM_FRAME_LIMIT = 60; // about one second at 60fps

      function degrade(reason) {
        if (!enableCircuitBreaker) return;
        try {
          GLOBAL.degraded = true;
        } catch {}
        try {
          GLOBAL.pending.clear();
        } catch {}
        try {
          // Persist a disable switch so the preload can hard-stop on next load.
          trySetDisableRO(reason || 'storm');
        } catch {}
        try {
          class NoopResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
          }
          // Use defineProperty so it works even if something made it non-writable.
          try {
            Object.defineProperty(window, 'ResizeObserver', {
              configurable: true,
              writable: true,
              value: NoopResizeObserver,
            });
          } catch {
            try {
              window.ResizeObserver = NoopResizeObserver;
            } catch {}
          }
          window.__ccResizeObserverDegraded = { ts: Date.now(), reason: String(reason || 'storm') };
        } catch {}
      }

      function requestGlobalFlush(reason) {
        try {
          window.__ccROLastReason = reason;
        } catch {}
        if (GLOBAL.scheduled) return;
        GLOBAL.scheduled = true;

        scheduleRAF(() => {
          GLOBAL.scheduled = false;

          // Use a microtask inside rAF so the browser can settle layout first.
          scheduleMicrotask(() => {
            flushGlobal('raf');
          });
        });
      }

      function flushGlobal(phase) {
        if (GLOBAL.degraded) return;
        // Prevent re-entrant delivery storms.
        if (GLOBAL.delivering) return;
        if (!GLOBAL.pending.size) return;

        // Track frames and cap repeated deliveries.
        const t = now();
        const isNewFrame = t - GLOBAL.lastFrameAt > 8; // heuristic
        if (isNewFrame) {
          GLOBAL.lastFrameAt = t;
          GLOBAL.deliveriesThisFrame = 0;
          GLOBAL.frameId += 1;
        }
        if (GLOBAL.deliveriesThisFrame >= MAX_DELIVERIES_PER_FRAME) {
          // Too much in one frame. Defer to next frame.
          GLOBAL.stormFrames += 1;
          if (GLOBAL.stormFrames > STORM_FRAME_LIMIT) degrade(`cap:${phase}`);
          requestGlobalFlush(`cap:${phase}`);
          return;
        }

        GLOBAL.deliveriesThisFrame += 1;
        GLOBAL.delivering = true;

        try {
          // Snapshot current pending observers.
          const list = Array.from(GLOBAL.pending);
          GLOBAL.pending.clear();

          for (let i = 0; i < list.length; i += 1) {
            const obs = list[i];
            try {
              obs.__ccDeliver(MAX_TOTAL_ENTRIES_PER_DELIVERY);
            } catch (err) {
              setTimeout(() => {
                throw err;
              }, 0);
            }
          }
        } finally {
          GLOBAL.delivering = false;
        }

        // If more arrived during delivery, schedule again.
        if (GLOBAL.pending.size) {
          GLOBAL.stormFrames += 1;
          if (GLOBAL.stormFrames > STORM_FRAME_LIMIT) {
            degrade(`pending:${phase}`);
            return;
          }
          requestGlobalFlush(`again:${phase}`);
        } else {
          GLOBAL.stormFrames = 0;
        }
      }

      class SafeResizeObserver {
        constructor(callback) {
          this._cb = typeof callback === 'function' ? callback : () => {};
          this._queue = [];
          this._delivering = false;
          this._disposed = false;
          this._lastEnqueueAt = 0;

          // Wrap native observer callback.
          this._native = new Native((entries) => {
            if (this._disposed) return;
            try {
              if (entries && entries.length) {
                for (let i = 0; i < entries.length; i += 1) {
                  this._queue.push(entries[i]);
                }
              }
            } catch {}
            try {
              this._lastEnqueueAt = now();
            } catch {}
            try {
              GLOBAL.pending.add(this);
              requestGlobalFlush('native');
            } catch {
              // Worst case fallback: local delivery scheduling.
              this._scheduleLocal();
            }
          });
        }

        _scheduleLocal() {
          if (this._disposed) return;
          try {
            GLOBAL.pending.add(this);
            requestGlobalFlush('local');
          } catch {}
        }

        __ccDeliver(maxEntries) {
          if (this._disposed) return;
          if (this._delivering) return;
          if (!this._queue.length) return;

          // Cap to avoid pathological memory/CPU.
          const batch =
            this._queue.length > maxEntries ? this._queue.slice(0, maxEntries) : this._queue.slice(0);
          this._queue = this._queue.length > maxEntries ? this._queue.slice(maxEntries) : [];

          this._delivering = true;
          try {
            this._cb(batch, this);
          } finally {
            this._delivering = false;
          }

          // If more remain, queue another pass next frame.
          if (this._queue.length) this._scheduleLocal();
        }

        observe(target, options) {
          try {
            return this._native.observe(target, options);
          } catch {}
        }

        unobserve(target) {
          try {
            return this._native.unobserve(target);
          } catch {}
        }

        disconnect() {
          this._disposed = true;
          try {
            this._native.disconnect();
          } catch {}
          this._queue = [];
        }
      }

      // Replace global class so all future usages are safe.
      window.ResizeObserver = SafeResizeObserver;

      // Optional: lock it so polyfills or late-loaded scripts cannot replace it.
      if (lockResizeObserver) {
        try {
          Object.defineProperty(window, 'ResizeObserver', {
            // Soft lock: keep configurable so we can still replace it via defineProperty
            // (for disable mode or circuit breaker). Writable false blocks casual reassignment.
            configurable: true,
            writable: false,
            value: SafeResizeObserver,
          });
          window.__ccResizeObserverLocked = { ts: Date.now() };
        } catch {}
      }
    }
  }

  // 2) Suppress the benign RO loop message at the window level (containment / noise)
  if (suppressWindowError) {
    try {
      // Some browsers report this via window.onerror.
      window.addEventListener(
        'error',
        (e) => {
          try {
            const msg = String(e?.message || '');
            const lower = msg.toLowerCase();
            if (RO_LOOP_LOWER.some((s) => lower.includes(s))) {
              e.preventDefault?.();
              e.stopImmediatePropagation?.();
              return false;
            }
          } catch {}
          return undefined;
        },
        true
      );
    } catch {}

    try {
      // Some browsers report this via unhandledrejection in odd edge cases.
      window.addEventListener(
        'unhandledrejection',
        (e) => {
          try {
            const msg = String(e?.reason?.message || e?.reason || '');
            const lower = msg.toLowerCase();
            if (RO_LOOP_LOWER.some((s) => lower.includes(s))) {
              e.preventDefault?.();
              return false;
            }
          } catch {}
          return undefined;
        },
        true
      );
    } catch {}
  }

  // 3) Console filtering (optional) so the app console stays useful
  // Only filters the single known message, leaves all other console noise intact.
  if (suppressConsole && !isLikelyJsdom()) {
    try {
      if (!window.__ccConsolePatched) {
        window.__ccConsolePatched = true;
        const originalError = console.error?.bind(console);
        const originalWarn = console.warn?.bind(console);
        const originalLog = console.log?.bind(console);
        const originalInfo = console.info?.bind(console);
        const originalDebug = console.debug?.bind(console);

        window.__ccConsoleOriginal = window.__ccConsoleOriginal || {
          error: originalError,
          warn: originalWarn,
          log: originalLog,
          info: originalInfo,
          debug: originalDebug,
        };

        const shouldFilter = (args) => {
          try {
            const joined = args.map((a) => String(a)).join(' ');
            const lower = joined.toLowerCase();
            return RO_LOOP_LOWER.some((s) => lower.includes(s));
          } catch {
            return false;
          }
        };

        if (typeof originalError === 'function') {
          console.error = (...args) => {
            if (shouldFilter(args)) return;
            return originalError(...args);
          };
        }

        if (typeof originalWarn === 'function') {
          console.warn = (...args) => {
            if (shouldFilter(args)) return;
            return originalWarn(...args);
          };
        }

        // Some environments route this warning to log instead of warn/error.
        if (typeof originalLog === 'function') {
          console.log = (...args) => {
            if (shouldFilter(args)) return;
            return originalLog(...args);
          };
        }

        if (typeof originalInfo === 'function') {
          console.info = (...args) => {
            if (shouldFilter(args)) return;
            return originalInfo(...args);
          };
        }

        if (typeof originalDebug === 'function') {
          console.debug = (...args) => {
            if (shouldFilter(args)) return;
            return originalDebug(...args);
          };
        }
      }
    } catch {}
  }
}
