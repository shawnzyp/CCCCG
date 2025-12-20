const ERROR_INBOX_BASE = 'https://cccg-error-inbox.shawnpeiris22.workers.dev/report';
const OWNER_TOKEN = '123451234512345123451234511111';

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

    const url = `${ERROR_INBOX_BASE}?t=${encodeURIComponent(OWNER_TOKEN)}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    });
  } catch {
    // never throw from reporter
  }
}

export function installGlobalErrorInbox() {
  if (window.__ccErrorInboxInstalled) return;
  window.__ccErrorInboxInstalled = true;

  window.addEventListener('error', (event) => {
    const message = event?.message || 'Unknown error';
    const stack = event?.error?.stack || '';
    sendReport('error', message, { stack });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = safeString(reason?.message || reason || 'Unhandled rejection');
    const stack = reason?.stack || '';
    sendReport('unhandledrejection', message, { stack });
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
}
