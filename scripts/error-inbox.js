const ERROR_INBOX_BASE = 'https://cccg-error-inbox.shawnpeiris22.workers.dev/report';
const OWNER_TOKEN = 'YOUR_OWNER_TOKEN_HERE';

function safeString(x, max = 2000) {
  const s = String(x ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function toStack(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return safeString(err.stack || err.stacktrace || '', 8000);
}

function post(entry, context = {}) {
  const url = `${ERROR_INBOX_BASE}?t=${encodeURIComponent(OWNER_TOKEN)}`;
  const payload = {
    v: 1,
    sentAt: Date.now(),
    href: location.href,
    release: window.__ccRelease || null,
    context,
    entry: {
      ts: Date.now(),
      level: entry.level || 'error',
      domain: entry.domain || 'runtime',
      code: entry.code || 'unknown',
      message: safeString(entry.message || ''),
      stack: safeString(entry.stack || ''),
      data: entry.data && typeof entry.data === 'object' ? entry.data : null,
    },
  };

  try {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function installGlobalErrorInbox() {
  window.__ccBootState = window.__ccBootState || { phase: 'unknown', ts: Date.now() };

  window.addEventListener('error', (e) => {
    post({
      level: 'error',
      domain: 'runtime',
      code: 'window.error',
      message: safeString(e.message || 'Script error'),
      stack: e.error ? toStack(e.error) : '',
      data: { filename: e.filename || null, lineno: e.lineno || null, colno: e.colno || null },
    }, { phase: window.__ccBootState?.phase || null });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    post({
      level: 'error',
      domain: 'runtime',
      code: 'unhandledrejection',
      message: safeString(r?.message || r || 'Unhandled rejection'),
      stack: toStack(r),
    }, { phase: window.__ccBootState?.phase || null });
  });

  const orig = console.error?.bind(console);
  if (orig) {
    console.error = (...args) => {
      try {
        const errObj = args.find(a => a instanceof Error);
        post({
          level: 'error',
          domain: 'console',
          code: 'console.error',
          message: safeString(args.map(a => (a instanceof Error ? a.message : String(a))).join(' | ')),
          stack: errObj ? toStack(errObj) : '',
        }, { phase: window.__ccBootState?.phase || null });
      } catch {}
      return orig(...args);
    };
  }
}
