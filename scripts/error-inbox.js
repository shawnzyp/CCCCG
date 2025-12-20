const ERROR_INBOX_URL = 'https://cccg-error-inbox.shawnpeiris22.workers.dev/report';
const LOCAL_LOG_KEY = 'cccg:last-error-report';

function safeString(x, max = 2000) {
  try {
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    return String(s || '').slice(0, max);
  } catch {
    return String(x || '').slice(0, max);
  }
}

async function sendReport(kind, message, detail = {}) {
  try {
    const payload = {
      kind,
      message: safeString(message, 2000),
      stack: safeString(detail.stack || '', 8000),
      url: safeString(location.href, 2000),
      ua: safeString(navigator.userAgent, 400),
      build: safeString(window.__ccBuildVersion || '', 200),
      extra: detail.extra && typeof detail.extra === 'object' ? detail.extra : undefined,
    };

    await fetch(ERROR_INBOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    });
  } catch {
    try {
      const record = { ts: Date.now(), kind, message: safeString(message, 500) };
      localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(record));
    } catch {}
  }
}

export function installGlobalErrorInbox() {
  if (window.__ccErrorInboxInstalled) return;
  window.__ccErrorInboxInstalled = true;

  function showPanicOverlay(title, detail) {
    try {
      if (document.getElementById('cccg-panic-overlay')) return;
      const el = document.createElement('div');
      el.id = 'cccg-panic-overlay';
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '999999';
      el.style.background = '#0b0f1a';
      el.style.color = '#e6e6e6';
      el.style.padding = '16px';
      el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      el.style.whiteSpace = 'pre-wrap';
      el.style.overflow = 'auto';
      el.innerText = `${title}\n\n${detail || ''}\n\nOpen DevTools Console. A report was sent (or attempted).`;
      document.documentElement.appendChild(el);
    } catch {}
  }

  window.addEventListener('error', (event) => {
    const isResourceError = event?.target && (event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK');
    const message = isResourceError
      ? `Resource failed to load: ${event.target?.tagName} ${event.target?.src || event.target?.href || ''}`
      : (event?.message || 'Unknown error');
    const stack = event?.error?.stack || '';
    sendReport('error', message, { stack });
    showPanicOverlay('CCCG crashed with a runtime error.', `${message}\n\n${stack}`);
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = safeString(reason?.message || reason || 'Unhandled rejection');
    const stack = reason?.stack || '';
    sendReport('unhandledrejection', message, { stack });
    showPanicOverlay('CCCG crashed with an unhandled promise rejection.', `${message}\n\n${stack}`);
  });

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args) => {
    try { sendReport('console.error', safeString(args, 2000)); } catch {}
    return origError(...args);
  };

  console.warn = (...args) => {
    try { sendReport('console.warn', safeString(args, 2000)); } catch {}
    return origWarn(...args);
  };

  window.__cccgLastErrorReport = () => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || 'null');
    } catch {
      return null;
    }
  };
}
