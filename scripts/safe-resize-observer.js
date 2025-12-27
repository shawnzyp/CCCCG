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
  } = options || {};

  window.__ccResizeObserverSafetyInstalled = true;

  // 1) Patch ResizeObserver (prevention)
  if (patchResizeObserver) {
    const Native = window.ResizeObserver;
    // If browser does not support it or it was already patched, do nothing.
    if (typeof Native === 'function' && !window.__ccResizeObserverPatched) {
      window.__ccResizeObserverPatched = true;
      window.__ccNativeResizeObserver = Native;

      class SafeResizeObserver {
        constructor(callback) {
          this._cb = typeof callback === 'function' ? callback : () => {};
          this._queue = [];
          this._scheduled = false;
          this._delivering = false;
          this._disposed = false;

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
            this._scheduleDeliver();
          });
        }

        _scheduleDeliver() {
          if (this._disposed) return;
          if (this._scheduled) return;
          this._scheduled = true;

          // rAF breaks the synchronous resize -> mutate -> resize loop.
          const schedule =
            typeof requestAnimationFrame === 'function'
              ? requestAnimationFrame
              : (fn) => setTimeout(fn, 16);

          schedule(() => {
            this._scheduled = false;
            if (this._disposed) return;

            // Prevent re-entrant delivery in the same tick.
            if (this._delivering) {
              // If we got here while delivering, try again next frame.
              this._scheduleDeliver();
              return;
            }

            const batch = this._queue;
            this._queue = [];
            if (!batch || !batch.length) return;

            this._delivering = true;
            try {
              // Call user callback with batched entries.
              // Pass "this" as observer to match typical usage patterns.
              this._cb(batch, this);
            } catch (err) {
              // Do not swallow real exceptions.
              setTimeout(() => {
                throw err;
              }, 0);
            } finally {
              this._delivering = false;
            }

            // If new entries arrived during callback, deliver next frame.
            if (this._queue.length) this._scheduleDeliver();
          });
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
          this._scheduled = false;
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

        window.__ccConsoleOriginal = window.__ccConsoleOriginal || {
          error: originalError,
          warn: originalWarn,
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
      }
    } catch {}
  }
}
