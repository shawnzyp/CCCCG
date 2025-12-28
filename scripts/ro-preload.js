// ro-preload.js
// Runs before module scripts. Prevents and suppresses:
// "ResizeObserver loop completed with undelivered notifications."
//
// Why preload:
// Some widgets create ResizeObservers before main.js runs. If that happens, patching later is too late.

(function () {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__CCCG_DISABLE_RO_PRELOAD__) return;
    if (window.__ccROPreloadInstalled) return;
    window.__ccROPreloadInstalled = true;

    var MSG_1 = 'ResizeObserver loop completed with undelivered notifications';
    var MSG_2 = 'ResizeObserver loop limit exceeded';
    var STORAGE_DISABLE_KEY = 'cc:disable-ro';

    function trySetDisableRO(reason) {
      try {
        // Persist a conservative switch if we detect storms.
        localStorage.setItem(STORAGE_DISABLE_KEY, '1');
        sessionStorage.setItem(STORAGE_DISABLE_KEY + ':reason', String(reason || 'storm'));
      } catch (e) {}
    }

    function isIOS() {
      try {
        var ua = String(navigator && navigator.userAgent || '');
        return /iPad|iPhone|iPod/i.test(ua);
      } catch (e) {
        return false;
      }
    }

    function isSafari() {
      try {
        var ua = String(navigator && navigator.userAgent || '');
        var isSaf = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
        return !!isSaf;
      } catch (e) {
        return false;
      }
    }

    function now() {
      try {
        return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
      } catch (e) {
        return Date.now();
      }
    }

    function includesROMessage(text) {
      try {
        var s = String(text || '');
        return s.indexOf(MSG_1) !== -1 || s.indexOf(MSG_2) !== -1;
      } catch (e) {
        return false;
      }
    }

    function bumpWarnWindow() {
      try {
        var t = Date.now();
        var last = window.__ccROWarnLastTs || 0;
        window.__ccROWarnLastTs = t;
        window.__ccROWarnCount = (t - last < 2000) ? ((window.__ccROWarnCount || 0) + 1) : 1;
        return window.__ccROWarnCount;
      } catch (e) {
        return 0;
      }
    }

    // Some environments emit the warning via reportError, not console.*.
    // Wrap it so the benign message does not surface as a fatal error.
    try {
      if (typeof window.reportError === 'function' && !window.__ccROReportErrorWrapped) {
        window.__ccROReportErrorWrapped = true;
        var __origReportError = window.reportError.bind(window);
        window.reportError = function (err) {
          try {
            var msg = String(err && (err.message || err) || '');
            if (includesROMessage(msg)) return;
          } catch (e) {}
          return __origReportError(err);
        };
      }
    } catch (e) {}

    // ------------------------------------------------------------
    // 1) Suppress known benign message from window error plumbing
    // ------------------------------------------------------------
    if (!window.__CCCG_DISABLE_RO_PRELOAD_SUPPRESS__) {
      try {
        window.addEventListener('error', function (e) {
          try {
            var msg = String(e && e.message || '');
            if (includesROMessage(msg)) {
              if (e && typeof e.preventDefault === 'function') e.preventDefault();
              if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
              // If we are seeing this as an actual ErrorEvent repeatedly, consider disabling RO next load.
              try {
                if (bumpWarnWindow() >= 3) trySetDisableRO('error-event');
              } catch (x) {}
              return false;
            }
          } catch (err) {}
          return undefined;
        }, true);
      } catch (e) {}

      try {
        window.addEventListener('unhandledrejection', function (e) {
          try {
            var msg = String(e && (e.reason && e.reason.message || e.reason) || '');
            if (includesROMessage(msg)) {
              if (e && typeof e.preventDefault === 'function') e.preventDefault();
              try {
                if (bumpWarnWindow() >= 3) trySetDisableRO('unhandledrejection');
              } catch (x) {}
              return false;
            }
          } catch (err) {}
          return undefined;
        }, true);
      } catch (e) {}

      // Console filtering: error/warn/log/info/debug
      try {
        if (!window.__ccROPreloadConsolePatched) {
          window.__ccROPreloadConsolePatched = true;
          var orig = window.__ccROPreloadConsoleOrig = window.__ccROPreloadConsoleOrig || {};
          orig.error = console.error && console.error.bind(console);
          orig.warn = console.warn && console.warn.bind(console);
          orig.log = console.log && console.log.bind(console);
          orig.info = console.info && console.info.bind(console);
          orig.debug = console.debug && console.debug.bind(console);

          function shouldFilter(args) {
            try {
              var joined = '';
              for (var i = 0; i < args.length; i += 1) joined += String(args[i]) + ' ';
              return includesROMessage(joined);
            } catch (e) {
              return false;
            }
          }

          function wrap(name) {
            var fn = orig[name];
            if (typeof fn !== 'function') return;
            console[name] = function () {
              if (shouldFilter(arguments)) return;
              return fn.apply(console, arguments);
            };
          }

          wrap('error');
          wrap('warn');
          wrap('log');
          wrap('info');
          wrap('debug');
        }
      } catch (e) {}
    }

    // ------------------------------------------------------------
    // 2) Patch ResizeObserver BEFORE modules (prevention)
    // ------------------------------------------------------------
    if (!window.__CCCG_DISABLE_RO_PRELOAD_PATCH__) {
      try {
        // Honor a persisted disable switch if we already detected storms.
        // This is the "make it stop" lever for hostile browsers.
        try {
          if (localStorage.getItem(STORAGE_DISABLE_KEY) === '1') {
            window.__ccROPreloadDisabled = true;
            window.ResizeObserver = function () {
              this.observe = function () {};
              this.unobserve = function () {};
              this.disconnect = function () {};
            };
            return;
          }
        } catch (e) {}

        var Native = window.ResizeObserver;
        if (typeof Native === 'function' && !window.__ccROPreloadPatched) {
          window.__ccROPreloadPatched = true;
          window.__ccNativeResizeObserver = window.__ccNativeResizeObserver || Native;

          var GLOBAL = window.__ccROPreloadGlobal = window.__ccROPreloadGlobal || {
            pending: new Set(),
            scheduled: false,
            delivering: false,
            deliveriesThisFrame: 0,
            lastFrameAt: 0,
            stormFrames: 0,
            degraded: false,
          };

          var MAX_DELIVERIES_PER_FRAME = 2;
          var MAX_TOTAL_ENTRIES_PER_DELIVERY = 500;
          var STORM_FRAME_LIMIT = 60; // about one second of continuous backlog

          function raf(fn) {
            try {
              return requestAnimationFrame(fn);
            } catch (e) {}
            return setTimeout(fn, 16);
          }

          function micro(fn) {
            try {
              return queueMicrotask(fn);
            } catch (e) {}
            try {
              return Promise.resolve().then(fn);
            } catch (e2) {}
            return setTimeout(fn, 0);
          }

          function requestFlush(reason) {
            try {
              window.__ccROPreloadLastReason = reason;
            } catch (e) {}
            if (GLOBAL.scheduled) return;
            GLOBAL.scheduled = true;
            raf(function () {
              GLOBAL.scheduled = false;
              micro(function () {
                flush('raf');
              });
            });
          }

          function flush(phase) {
            if (GLOBAL.degraded) return;
            if (GLOBAL.delivering) return;
            if (!GLOBAL.pending.size) return;

            var t = now();
            var isNewFrame = (t - GLOBAL.lastFrameAt) > 8;
            if (isNewFrame) {
              GLOBAL.lastFrameAt = t;
              GLOBAL.deliveriesThisFrame = 0;
            }
            if (GLOBAL.deliveriesThisFrame >= MAX_DELIVERIES_PER_FRAME) {
              requestFlush('cap:' + phase);
              GLOBAL.stormFrames += 1;
              if (GLOBAL.stormFrames > STORM_FRAME_LIMIT) degrade('flush-cap');
              return;
            }
            GLOBAL.deliveriesThisFrame += 1;
            GLOBAL.delivering = true;
            try {
              var list = Array.from(GLOBAL.pending);
              GLOBAL.pending.clear();
              for (var i = 0; i < list.length; i += 1) {
                var obs = list[i];
                try {
                  obs.__ccDeliver(MAX_TOTAL_ENTRIES_PER_DELIVERY);
                } catch (err) {
                  setTimeout(function () {
                    throw err;
                  }, 0);
                }
              }
            } finally {
              GLOBAL.delivering = false;
            }
            if (GLOBAL.pending.size) {
              GLOBAL.stormFrames += 1;
              if (GLOBAL.stormFrames > STORM_FRAME_LIMIT) {
                degrade('pending-backlog');
                return;
              }
              requestFlush('again:' + phase);
            } else {
              GLOBAL.stormFrames = 0;
            }
          }

          function degrade(reason) {
            try {
              GLOBAL.degraded = true;
            } catch (e) {}
            try {
              GLOBAL.pending && GLOBAL.pending.clear && GLOBAL.pending.clear();
            } catch (e) {}
            try {
              // Disable RO on next load and keep this session quiet.
              trySetDisableRO(reason || 'storm');
              window.ResizeObserver = function () {
                this.observe = function () {};
                this.unobserve = function () {};
                this.disconnect = function () {};
              };
              window.__ccROPreloadDegraded = { ts: Date.now(), reason: String(reason || 'storm') };
            } catch (e) {}
          }

          function SafeResizeObserver(callback) {
            this._cb = (typeof callback === 'function') ? callback : function () {};
            this._queue = [];
            this._delivering = false;
            this._disposed = false;
            this._native = new Native(function (entries) {
              if (this._disposed) return;
              try {
                if (entries && entries.length) {
                  for (var i = 0; i < entries.length; i += 1) this._queue.push(entries[i]);
                }
              } catch (e) {}
              try {
                GLOBAL.pending.add(this);
                requestFlush('native');
              } catch (e2) {}
            }.bind(this));
          }

          SafeResizeObserver.prototype.__ccDeliver = function (maxEntries) {
            if (this._disposed) return;
            if (this._delivering) return;
            if (!this._queue.length) return;

            var batch = this._queue.length > maxEntries ? this._queue.slice(0, maxEntries) : this._queue.slice(0);
            this._queue = this._queue.length > maxEntries ? this._queue.slice(maxEntries) : [];

            this._delivering = true;
            try {
              this._cb(batch, this);
            } finally {
              this._delivering = false;
            }

            if (this._queue.length) {
              try {
                GLOBAL.pending.add(this);
                requestFlush('again');
              } catch (e) {}
            }
          };

          SafeResizeObserver.prototype.observe = function (target, options) {
            try {
              return this._native.observe(target, options);
            } catch (e) {}
          };
          SafeResizeObserver.prototype.unobserve = function (target) {
            try {
              return this._native.unobserve(target); } catch (e) {}
          };
          SafeResizeObserver.prototype.disconnect = function () {
            this._disposed = true;
            try {
              this._native.disconnect();
            } catch (e) {}
            this._queue = [];
          };

          // Replace global
          window.ResizeObserver = SafeResizeObserver;
          // Marker so later code can detect we already wrapped it.
          try { window.ResizeObserver.__ccROSafe = true; } catch (e) {}

          // Do NOT hard-lock here. main.js may intentionally disable RO in safe-mode.
          // If you want a lock, safe-resize-observer.js does a "soft lock" that remains configurable.

          window.__ccROPreload = {
            ts: Date.now(),
            ios: isIOS(),
            safari: isSafari(),
          };
        }
      } catch (e) {}
    }
  } catch (e) {
    // never block boot
  }
})();
