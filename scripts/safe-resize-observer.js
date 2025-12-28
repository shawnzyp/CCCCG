// Safe ResizeObserver wrapper
// Goal: prevent "ResizeObserver loop completed with undelivered notifications."
// by batching callbacks into rAF and blocking re-entrant delivery storms.
//
// Also optionally suppress the known-benign warning text from window.onerror and console,
// because some browsers surface it as an "error" even when nothing is actually broken.

const RO_LOOP_MSG = 'ResizeObserver loop completed with undelivered notifications';

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
      });

      const MAX_DELIVERIES_PER_FRAME = 2; // conservative
      const MAX_TOTAL_ENTRIES_PER_DELIVERY = 500; // safety cap

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
        if (GLOBAL.pending.size) requestGlobalFlush(`again:${phase}`);
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
            if (msg.includes(RO_LOOP_MSG)) {
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
            if (msg.includes(RO_LOOP_MSG)) {
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

        window.__ccConsoleOriginal = window.__ccConsoleOriginal || {
          error: originalError,
          warn: originalWarn,
          log: originalLog,
        };

        const shouldFilter = (args) => {
          try {
            const joined = args.map((a) => String(a)).join(' ');
            return joined.includes(RO_LOOP_MSG);
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
      }
    } catch {}
  }
}
