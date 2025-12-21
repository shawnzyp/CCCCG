const ERROR_INBOX_URL = 'https://cccg-error-inbox.shawnpeiris22.workers.dev/report';
const LOCAL_LOG_KEY = 'cccg:last-error-report';
const BREADCRUMB_KEY = 'cccg:breadcrumbs';
const LAST_CRASH_KEY = 'cccg:last-crash';
const CRASH_COUNT_KEY = 'cccg:crash-count';
const SAFE_MODE_KEY = 'cc:safe-mode';
const ERROR_REPORTS_KEY = 'cccg:error-reports';
const AUTH_KEY = 'cccg:discord-auth';
const AUTH_STATE_KEY = 'cccg:discord-auth-state';
const MAX_BREADCRUMBS = 50;
const MAX_STACK_CHARS = 12000;
const CRASH_WINDOW_MS = 60000;

let remoteDisabled = false;
let remoteDisabledReason = '';

function markRemoteDisabled(reason, status) {
  remoteDisabled = true;
  remoteDisabledReason = String(reason || 'disabled');
  try {
    localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({
      ts: Date.now(),
      reason: remoteDisabledReason,
      status: Number(status) || 0,
    }));
  } catch {}
}

function safeString(x, max = 2000) {
  try {
    const s = typeof x === 'string' ? x : JSON.stringify(x);
    return String(s || '').slice(0, max);
  } catch {
    return String(x || '').slice(0, max);
  }
}

function isIgnorableErrorMessage(message) {
  if (!message) return false;
  const text = String(message);
  return text.includes('ResizeObserver loop limit exceeded')
    || text.includes('ResizeObserver loop completed with undelivered notifications');
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

function readErrorReports() {
  try {
    const raw = localStorage.getItem(ERROR_REPORTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeErrorReports(list) {
  try {
    localStorage.setItem(ERROR_REPORTS_KEY, JSON.stringify(list));
  } catch {}
}

function appendErrorReport(entry) {
  try {
    const list = readErrorReports();
    list.push(entry);
    while (list.length > 50) list.shift();
    writeErrorReports(list);
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cccg:error-report', { detail: entry }));
      }
    } catch {}
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
  const href = (typeof location !== 'undefined' && location?.href) ? location.href : '';
  const ua = (typeof navigator !== 'undefined' && navigator?.userAgent) ? navigator.userAgent : '';
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
    url: safeString(href, 2000),
    userAgent: safeString(ua, 400),
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
    if (remoteDisabled) {
      throw new Error(`remote_disabled:${remoteDisabledReason || 'unknown'}`);
    }
    const href = (typeof location !== 'undefined' && location?.href) ? location.href : '';
    const ua = (typeof navigator !== 'undefined' && navigator?.userAgent) ? navigator.userAgent : '';
    const auth = readLocalStorage(AUTH_KEY);
    const payload = {
      kind,
      message: safeString(message, 2000),
      stack: safeString(detail.stack || '', 8000),
      url: safeString(href, 2000),
      ua: safeString(ua, 400),
      build: safeString(globalThis.__ccBuildVersion || '', 200),
      extra: detail.extra && typeof detail.extra === 'object' ? detail.extra : undefined,
      breadcrumbs: readBreadcrumbs(),
    };

    const res = await fetch(ERROR_INBOX_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { 'X-CCCG-Auth': auth } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res || !res.ok) {
      const status = Number(res?.status) || 0;
      if (status === 401 || status === 403) {
        markRemoteDisabled('unauthorized', status);
      } else if (status) {
        markRemoteDisabled('remote_error', status);
      }
      throw new Error(`report_failed:${status || 'no_status'}`);
    }
    return { ok: true, status: res.status };
  } catch {
    try {
      const record = { ts: Date.now(), kind, message: safeString(message, 500) };
      localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(record));
    } catch {}
    return { ok: false, status: 0, reason: remoteDisabledReason || 'local_fallback' };
  }
}

export function installGlobalErrorInbox() {
  if (typeof window === 'undefined') return;
  if (window.__ccErrorInboxInstalled) return;
  window.__ccErrorInboxInstalled = true;
  globalThis.__cccgBreadcrumb = addBreadcrumb;
  const SHOW_PANIC_OVERLAY = false;
  try {
    const raw = localStorage.getItem(AUTH_STATE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state?.reason === 'unauthorized') remoteDisabled = true;
    }
  } catch {}
  const SAFE_MODE_CLEAR_AFTER_MS = 15000;
  const startedInSafeMode = readLocalStorage(SAFE_MODE_KEY) === '1';
  let crashThisSession = false;

  function clearSafeMode() {
    try { localStorage.removeItem(SAFE_MODE_KEY); } catch {}
    try { localStorage.removeItem(CRASH_COUNT_KEY); } catch {}
    try { localStorage.removeItem(LAST_CRASH_KEY); } catch {}
  }

  try {
    if (startedInSafeMode) {
      const raw = readLocalStorage(CRASH_COUNT_KEY);
      const state = raw ? JSON.parse(raw) : null;
      const firstAt = Number(state?.firstAt);
      const lastAt = Number(state?.lastAt);
      const count = Number(state?.count);
      const now = Date.now();
      const invalid = !state || typeof state !== 'object';
      const stale = !Number.isFinite(lastAt) || (now - lastAt > CRASH_WINDOW_MS);
      const notLooping = !Number.isFinite(count) || count < 2;
      const expired = !Number.isFinite(firstAt) || (now - firstAt > CRASH_WINDOW_MS);
      if (invalid || stale || notLooping || expired) clearSafeMode();
    }
  } catch {}

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
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
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
    if (!SHOW_PANIC_OVERLAY) return;
    try {
      if (document.getElementById('cccg-panic-overlay')) return;
      const name = error?.name || 'Runtime error';
      const message = error?.message || '(no message provided)';
      const stack = safeString(error?.stack || '', MAX_STACK_CHARS);
      const el = document.createElement('div');
      el.id = 'cccg-panic-overlay';
      el.style.position = 'fixed';
      el.style.right = '16px';
      el.style.bottom = '16px';
      el.style.zIndex = '999999';
      el.style.maxWidth = '420px';
      el.style.width = 'min(92vw, 420px)';
      el.style.maxHeight = '70vh';
      el.style.background = '#0b0f1a';
      el.style.border = '1px solid rgba(255, 255, 255, 0.12)';
      el.style.borderRadius = '12px';
      el.style.boxShadow = '0 18px 40px rgba(0, 0, 0, 0.45)';
      el.style.color = '#e6e6e6';
      el.style.padding = '16px';
      el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      el.style.whiteSpace = 'normal';
      el.style.overflow = 'auto';
      el.style.pointerEvents = 'auto';
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
      const retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.textContent = 'Retry launch';
      retryButton.style.marginRight = '8px';
      retryButton.addEventListener('click', () => {
        try {
          location.reload();
        } catch {}
      });
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = 'Dismiss';
      closeButton.addEventListener('click', () => {
        try {
          el.remove();
        } catch {}
      });
      const note = document.createElement('div');
      note.style.marginTop = '12px';
      note.textContent = 'Report queued. You can keep using the app.';
      el.appendChild(title);
      el.appendChild(line);
      el.appendChild(details);
      el.appendChild(copyButton);
      el.appendChild(retryButton);
      el.appendChild(closeButton);
      el.appendChild(note);
      document.documentElement.appendChild(el);
    } catch {}
  }

  window.addEventListener('error', (event) => {
    const isResourceError = event?.target && (event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK');
    const message = isResourceError
      ? `Resource failed to load: ${event.target?.tagName} ${event.target?.src || event.target?.href || ''}`
      : (event?.message || event?.error?.message || 'Unknown error');
    if (!isResourceError && isIgnorableErrorMessage(message)) return;
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
      crashThisSession = true;
      try {
        const inLaunch = document?.body?.classList?.contains('launching');
        if (inLaunch) trackCrashCount();
      } catch {}
      appendErrorReport({ ts: Date.now(), message, stack, snapshot });
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const error = reason instanceof Error ? reason : new Error(String(reason || 'Unhandled rejection'));
    const message = safeString(error?.message || 'Unhandled rejection');
    if (isIgnorableErrorMessage(message)) return;
    const stack = error?.stack || '';
    const snapshot = collectCrashSnapshot({
      error,
      eventType: 'unhandledrejection',
      reason: reason instanceof Error ? reason.message : safeString(reason, 2000),
    });
    recordCrashSnapshot(snapshot);
    crashThisSession = true;
    try {
      const inLaunch = document?.body?.classList?.contains('launching');
      if (inLaunch) trackCrashCount();
    } catch {}
    appendErrorReport({ ts: Date.now(), message, stack, snapshot });
    sendReport('unhandledrejection', message, { stack, extra: { snapshot } });
  });

  window.addEventListener('cccg:report', (event) => {
    const kind = event?.detail?.kind || 'custom';
    const message = event?.detail?.message || 'custom report';
    const extra = event?.detail?.extra || {};
    sendReport(kind, message, { extra });
    try {
      if (kind === 'boot-watchdog') {
        appendErrorReport({
          ts: Date.now(),
          message: safeString(message, 500),
          stack: '',
          snapshot: { kind, extra, via: 'cccg:report' },
        });
        window.dispatchEvent(new CustomEvent('cccg:error-report'));
      }
    } catch {}
  });

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args) => {
    try { sendReport('console.error', safeString(args, 2000)); } catch {}
    return origError(...args);
  };

  console.warn = (...args) => origWarn(...args);

  window.__cccgLastErrorReport = () => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || 'null');
    } catch {
      return null;
    }
  };

  window.__cccgErrorInbox = {
    list: () => readErrorReports(),
    clear: () => writeErrorReports([]),
    sendAll: async () => {
      const reports = readErrorReports();
      if (!reports.length) return { ok: true, count: 0 };
      let sent = 0;
      const remaining = [];
      for (const report of reports) {
        const res = await sendReport('manual', report.message || 'Manual error report', {
          stack: report.stack || '',
          extra: { snapshot: report.snapshot, manual: true },
        });
        if (res && res.ok) sent += 1;
        else remaining.push(report);
      }
      writeErrorReports(remaining);
      return {
        ok: remaining.length === 0,
        count: sent,
        remaining: remaining.length,
        remoteDisabled,
        remoteDisabledReason,
      };
    },
    remote: () => ({ remoteDisabled, remoteDisabledReason }),
  };

  if (startedInSafeMode) {
    setTimeout(() => {
      if (!crashThisSession) {
        clearSafeMode();
        try { location.reload(); } catch {}
      }
    }, SAFE_MODE_CLEAR_AFTER_MS);
  }
}
