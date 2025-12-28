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

    console.log('[ROPreload] build', '2025-12-28-v3');

    var MSG_1 = 'ResizeObserver loop completed with undelivered notifications';
    var MSG_2 = 'ResizeObserver loop limit exceeded';
    function includesROMessage(text) {
      try {
        var s = String(text || '');
        return s.indexOf(MSG_1) !== -1 || s.indexOf(MSG_2) !== -1;
      } catch (e) {
        return false;
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

  } catch (e) {
    // never block boot
  }
})();
