const ERROR_INBOX_URL = 'https://cccg-error-inbox.shawnpeiris22.workers.dev/report';
const LOCAL_LOG_KEY = 'cccg:last-error-report';
const BREADCRUMB_KEY = 'cccg:breadcrumbs';
const LAST_CRASH_KEY = 'cccg:last-crash';
const CRASH_COUNT_KEY = 'cccg:crash-count';
const SAFE_MODE_KEY = 'cc:safe-mode';
const MAX_BREADCRUMBS = 50;
const MAX_STACK_CHARS = 12000;
const CRASH_WINDOW_MS = 60000;

function safeString(x, max = 2000) {
  try {
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    return String(s || '').slice(0, max);
  } catch {
    return String(x || '').slice(0, max);
  }
}

function addBreadcrumb(type, data) {
  try {
    const raw = sessionStorage.getItem(BREADCRUMB_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.push({
      ts: Date.now(),
      type: String(type || 'log'),
      data: safeString(data, 500),
    });
    while (next.length > MAX_BREADCRUMBS) next.shift();
    sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(next));
  } catch {}
}

function readBreadcrumbs() {
  try {
    const raw = sessionStorage.getItem(BREADCRUMB_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function readLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function getVisibilityState() {
  try {
    return document?.visibilityState || 'unknown';
  } catch {
    return 'unknown';
  }
}

function collectCrashSnapshot({ error, eventType, source, lineno, colno, reason }) {
  const stack = safeString(error?.stack || '', MAX_STACK_CHARS);
  const snapshot = {
    ts: Date.now(),
    eventType: String(eventType || 'error'),
    error: {
      name: safeString(error?.name || ''),
      message: safeString(error?.message || ''),
      stack,
    },
    reason: reason ? safeString(reason, 4000) : undefined,
    source: safeString(source || '', 2000),
    lineno: Number.isFinite(lineno) ? lineno : undefined,
    colno: Number.isFinite(colno) ? colno : undefined,
    url: safeString(location?.href || '', 2000),
    userAgent: safeString(navigator?.userAgent || '', 400),
    visibility: getVisibilityState(),
    breadcrumbs: readBreadcrumbs(),
    lastResourceFail: readLocalStorage('cccg:last-resource-fail'),
    disableSw: readLocalStorage('cc:disable-sw'),
    safeMode: readLocalStorage(SAFE_MODE_KEY),
  };
  return snapshot;
}

function recordCrashSnapshot(snapshot) {
  try {
    writeLocalStorage(LAST_CRASH_KEY, JSON.stringify(snapshot));
  } catch {}
}

function trackCrashCount() {
  try {
    const now = Date.now();
    const raw = readLocalStorage(CRASH_COUNT_KEY);
    let state = raw ? JSON.parse(raw) : null;
    if (!state || typeof state !== 'object') {
      state = { firstAt: now, count: 0 };
    }
    const firstAt = Number(state.firstAt);
    if (!Number.isFinite(firstAt) || now - firstAt > CRASH_WINDOW_MS) {
      state.firstAt = now;
      state.count = 0;
    }
    state.count = Number(state.count) || 0;
    state.count += 1;
    state.lastAt = now;
    writeLocalStorage(CRASH_COUNT_KEY, JSON.stringify(state));
    if (state.count >= 2) {
      writeLocalStorage(SAFE_MODE_KEY, '1');
    }
  } catch {}
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
      breadcrumbs: readBreadcrumbs(),
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
  globalThis.__cccgBreadcrumb = addBreadcrumb;

  try {
    const raw = localStorage.getItem('cccg:last-resource-fail');
    if (raw) {
      localStorage.removeItem('cccg:last-resource-fail');
      const payload = JSON.parse(raw);
      sendReport('resource-fail', 'Resource failed before main booted', {
        extra: payload && typeof payload === 'object' ? payload : undefined,
      });
    }
  } catch {}

  function copyCrashReport(snapshot) {
    try {
      const data = snapshot || readLocalStorage(LAST_CRASH_KEY) || '';
      const json = typeof data === 'string' ? data : JSON.stringify(data);
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(json);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = json;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.setAttribute('readonly', 'true');
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    } catch {}
  }

  function showPanicOverlay(error, snapshot) {
    try {
      if (document.getElementById('cccg-panic-overlay')) return;
      const name = error?.name || 'Runtime error';
      const message = error?.message || '(no message provided)';
      const stack = safeString(error?.stack || '', MAX_STACK_CHARS);
      const el = document.createElement('div');
      el.id = 'cccg-panic-overlay';
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '999999';
      el.style.background = '#0b0f1a';
      el.style.color = '#e6e6e6';
      el.style.padding = '16px';
      el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      el.style.whiteSpace = 'normal';
      el.style.overflow = 'auto';
      const title = document.createElement('div');
      title.style.fontSize = '18px';
      title.style.fontWeight = '700';
      title.style.marginBottom = '8px';
      title.textContent = name;
      const line = document.createElement('div');
      line.style.marginBottom = '12px';
      line.textContent = message;
      const details = document.createElement('details');
      details.style.marginBottom = '12px';
      const summary = document.createElement('summary');
      summary.textContent = 'Details';
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.textContent = stack || 'No stack captured.';
      details.appendChild(summary);
      details.appendChild(pre);
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = 'Copy crash report';
      copyButton.style.marginRight = '8px';
      copyButton.addEventListener('click', () => copyCrashReport(snapshot));
      const note = document.createElement('div');
      note.style.marginTop = '12px';
      note.textContent = 'Open DevTools Console. A report was sent (or attempted).';
      el.appendChild(title);
      el.appendChild(line);
      el.appendChild(details);
      el.appendChild(copyButton);
      el.appendChild(note);
      document.documentElement.appendChild(el);
    } catch {}
  }

  window.addEventListener('error', (event) => {
    const isResourceError = event?.target && (event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK');
    const message = isResourceError
      ? `Resource failed to load: ${event.target?.tagName} ${event.target?.src || event.target?.href || ''}`
      : (event?.message || 'Unknown error');
    const error = event?.error instanceof Error ? event.error : new Error(message);
    const stack = error?.stack || '';
    const snapshot = collectCrashSnapshot({
      error,
      eventType: 'error',
      source: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
    });
    sendReport('error', message, { stack, extra: { snapshot } });
    if (!isResourceError) {
      recordCrashSnapshot(snapshot);
      trackCrashCount();
      showPanicOverlay(error, snapshot);
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const error = reason instanceof Error ? reason : new Error(String(reason || 'Unhandled rejection'));
    const message = safeString(error?.message || 'Unhandled rejection');
    const stack = error?.stack || '';
    const snapshot = collectCrashSnapshot({
      error,
      eventType: 'unhandledrejection',
      reason: reason instanceof Error ? reason.message : safeString(reason, 2000),
    });
    recordCrashSnapshot(snapshot);
    trackCrashCount();
    sendReport('unhandledrejection', message, { stack, extra: { snapshot } });
    showPanicOverlay(error, snapshot);
  });

  window.addEventListener('cccg:report', (event) => {
    const kind = event?.detail?.kind || 'custom';
    const message = event?.detail?.message || 'custom report';
    const extra = event?.detail?.extra || {};
    sendReport(kind, message, { extra });
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
