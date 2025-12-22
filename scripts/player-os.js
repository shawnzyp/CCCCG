// Classic bootstrap: safe even if included without type="module".
(function () {
  'use strict';
  try { window.__CCCG_APP_CONTROLLER_BOOTING__ = true; } catch {}

  function fail(err) {
    try { window.__CCCG_APP_CONTROLLER_BOOTING__ = false; } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent('cc:pt-controller-failed', {
          detail: { message: String(err && err.message ? err.message : err || '') },
        })
      );
    } catch {}
  }

  function start() {
    // Dynamic import works from classic scripts in modern browsers.
    Promise.resolve()
      .then(function () { return import('./player-os.module.js'); })
      .then(function (mod) {
        try { window.__CCCG_APP_CONTROLLER_BOOTING__ = false; } catch {}
        if (mod && typeof mod.initPlayerOSModule === 'function') {
          mod.initPlayerOSModule();
        } else {
          fail(new Error('player-os.module.js missing initPlayerOSModule export'));
        }
      })
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
