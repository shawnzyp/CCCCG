const CRASH_HANDLER_KEY = '__ccccgCrashHandlerInstalled__';

if (typeof window !== 'undefined' && !window[CRASH_HANDLER_KEY]) {
  window[CRASH_HANDLER_KEY] = true;

  const NON_FATAL_MESSAGES = new Set([
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
  ]);

  const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
  const CRASH_RELOAD_STATE_KEY = 'cc:crash-reload-state';
  const CRASH_RELOAD_WINDOW_MS = 5 * 60 * 1000;
  const CRASH_MAX_RELOADS = 2;
  const RELOAD_DELAY_MS = 1500;
  const PENDING_DM_MAX = 20;
  const MAX_STACK_LENGTH = 6000;
  const MAX_DETAIL_LENGTH = 4000;

  let crashHandled = false;
  let lastCrashSignature = null;
  let reloadScheduled = false;

  const nowIso = () => new Date().toISOString();

  function getSessionStorageSafe() {
    try {
      return window.sessionStorage;
    } catch (err) {
      return null;
    }
  }

  function pruneReloadState() {
    const storage = getSessionStorageSafe();
    if (!storage) return;
    try {
      const raw = storage.getItem(CRASH_RELOAD_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const windowStart = Number(parsed?.windowStart);
      if (!Number.isFinite(windowStart)) {
        storage.removeItem(CRASH_RELOAD_STATE_KEY);
        return;
      }
      const age = Date.now() - windowStart;
      if (!Number.isFinite(age) || age > CRASH_RELOAD_WINDOW_MS) {
        storage.removeItem(CRASH_RELOAD_STATE_KEY);
      }
    } catch (err) {
      try {
        storage.removeItem(CRASH_RELOAD_STATE_KEY);
      } catch (removeErr) {
        console.error('Failed to clear stale crash reload state', removeErr);
      }
    }
  }

  pruneReloadState();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(value, maxLength) {
    if (typeof value !== 'string') {
      return value == null ? '' : String(value);
    }
    if (!Number.isFinite(maxLength) || value.length <= maxLength) {
      return value;
    }
    if (maxLength <= 1) {
      return value.slice(0, maxLength);
    }
    return `${value.slice(0, maxLength - 1)}…`;
  }

  function formatStructured(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Error) {
      return value.message || value.name || 'Error';
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      try {
        return String(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
    }
  }

  function buildHtmlReport(info) {
    const parts = [];
    if (info.timestampIso) {
      parts.push(`<div><strong>Timestamp:</strong> ${escapeHtml(info.timestampIso)}</div>`);
    }
    if (info.type) {
      parts.push(`<div><strong>Type:</strong> ${escapeHtml(info.type)}</div>`);
    }
    if (info.message) {
      parts.push(`<div><strong>Message:</strong> ${escapeHtml(info.message)}</div>`);
    }
    if (info.context) {
      parts.push(`<div><strong>Source:</strong> ${escapeHtml(info.context)}</div>`);
    }
    if (info.reasonSummary) {
      parts.push(`<div><strong>Reason:</strong> ${escapeHtml(info.reasonSummary)}</div>`);
    }
    if (info.reasonDetail) {
      parts.push('<div><strong>Reason detail:</strong></div>');
      parts.push(`<pre>${escapeHtml(info.reasonDetail)}</pre>`);
    }
    if (info.stack) {
      parts.push('<div><strong>Stack trace:</strong></div>');
      parts.push(`<pre>${escapeHtml(info.stack)}</pre>`);
    }
    if (info.reloadNote) {
      parts.push(`<div><strong>Reload:</strong> ${escapeHtml(info.reloadNote)}</div>`);
    }
    if (info.url) {
      parts.push(`<div><strong>URL:</strong> ${escapeHtml(info.url)}</div>`);
    }
    if (info.userAgent) {
      parts.push(`<div><strong>User agent:</strong> ${escapeHtml(info.userAgent)}</div>`);
    }
    return parts.join('');
  }

  function storePendingNotification(detail, meta) {
    const storage = getSessionStorageSafe();
    if (!storage) return;
    try {
      const raw = storage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      let pending = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) pending = parsed;
      }
      pending.push({
        ts: meta.ts,
        char: meta.char,
        detail,
        severity: meta.severity,
        html: meta.html,
        createdAt: meta.createdAt,
        resolved: meta.resolved === true,
        actionScope: meta.actionScope,
      });
      if (pending.length > PENDING_DM_MAX) {
        pending = pending.slice(pending.length - PENDING_DM_MAX);
      }
      storage.setItem(PENDING_DM_NOTIFICATIONS_KEY, JSON.stringify(pending));
    } catch (err) {
      console.error('Failed to persist crash notification for DM queue', err);
    }
  }

  function sendDmNotification(detail, meta) {
    const notify = window.dmNotify;
    if (typeof notify === 'function') {
      try {
        notify(detail, meta);
        return;
      } catch (err) {
        console.error('Failed to notify DM directly about crash', err);
      }
    }
    storePendingNotification(detail, meta);
  }

  function trackReloadPermission() {
    const storage = getSessionStorageSafe();
    if (!storage) return { allowed: true, count: 1 };
    try {
      const now = Date.now();
      const raw = storage.getItem(CRASH_RELOAD_STATE_KEY);
      let state = null;
      if (raw) {
        try {
          state = JSON.parse(raw);
        } catch {
          state = null;
        }
      }
      if (!state || typeof state !== 'object') {
        state = { windowStart: now, count: 0 };
      }
      const windowStart = Number(state.windowStart);
      if (!Number.isFinite(windowStart) || now - windowStart > CRASH_RELOAD_WINDOW_MS) {
        state.windowStart = now;
        state.count = 0;
      }
      state.count = Number(state.count) || 0;
      state.count += 1;
      state.lastCrashAt = now;
      storage.setItem(CRASH_RELOAD_STATE_KEY, JSON.stringify(state));
      return { allowed: state.count <= CRASH_MAX_RELOADS, count: state.count };
    } catch (err) {
      console.error('Failed to track crash reload attempts', err);
      return { allowed: true, count: 1 };
    }
  }

  function scheduleReloadIfAllowed(allowed) {
    if (!allowed || reloadScheduled) {
      return allowed;
    }
    reloadScheduled = true;
    window.setTimeout(() => {
      try {
        window.location.reload();
      } catch (err) {
        console.error('Failed to reload after crash', err);
      }
    }, RELOAD_DELAY_MS);
    return allowed;
  }

  function normalizeMessage(value) {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
      return String(value);
    } catch (err) {
      return 'Unknown error';
    }
  }

  function getEnvironmentInfo() {
    const env = {};
    try {
      env.url = window.location?.href || '';
    } catch {
      env.url = '';
    }
    try {
      env.userAgent = navigator?.userAgent || '';
    } catch {
      env.userAgent = '';
    }
    return env;
  }

  function handleCrash(info) {
    if (!info || crashHandled) {
      return;
    }
    const message = normalizeMessage(info.message) || 'Unknown error';
    const stack = info.stack ? truncate(String(info.stack), MAX_STACK_LENGTH) : '';
    const context = info.context ? String(info.context) : '';
    const signature = `${message}|${stack}|${context}`;
    if (signature && signature === lastCrashSignature) {
      return;
    }
    lastCrashSignature = signature;
    crashHandled = true;

    const timestampIso = nowIso();
    const env = getEnvironmentInfo();
    const reloadState = trackReloadPermission();
    const reloadNote = reloadState.allowed
      ? `Page will reload in ${Math.round(RELOAD_DELAY_MS / 100) / 10}s (attempt ${reloadState.count})`
      : `Reload skipped after ${reloadState.count} crash attempts in ${Math.round(CRASH_RELOAD_WINDOW_MS / 1000)}s window`;

    const reasonSummary = info.reasonSummary ? truncate(info.reasonSummary, MAX_DETAIL_LENGTH) : '';
    const reasonDetail = info.reasonDetail ? truncate(info.reasonDetail, MAX_DETAIL_LENGTH) : '';
    const html = buildHtmlReport({
      type: info.type,
      message,
      context,
      stack,
      reasonSummary,
      reasonDetail,
      timestampIso,
      reloadNote,
      url: env.url,
      userAgent: env.userAgent,
    });

    const detail = `App crash detected — ${truncate(message, 140)}`;
    const meta = {
      severity: 'error',
      html,
      actionScope: 'major',
      char: 'System',
      ts: timestampIso,
      createdAt: Date.now(),
      resolved: false,
    };

    console.error('Captured application crash', info.originalEvent || info);
    sendDmNotification(detail, meta);
    scheduleReloadIfAllowed(reloadState.allowed);
  }

  window.addEventListener('error', event => {
    if (!event || crashHandled) {
      return;
    }
    if (event.message && NON_FATAL_MESSAGES.has(event.message)) {
      return;
    }
    const message = event.message || event.error?.message || 'Unhandled error';
    const stack = event.error?.stack || '';
    const locationParts = [];
    if (event.filename) locationParts.push(event.filename);
    if (Number.isFinite(event.lineno)) locationParts.push(`line ${event.lineno}`);
    if (Number.isFinite(event.colno)) locationParts.push(`column ${event.colno}`);
    const context = locationParts.join(': ');
    handleCrash({
      type: 'error',
      message,
      stack,
      context,
      originalEvent: event,
    });
  });

  window.addEventListener('unhandledrejection', event => {
    if (!event || crashHandled) {
      return;
    }
    const reason = event.reason;
    let message = '';
    let stack = '';
    let reasonSummary = '';
    let reasonDetail = '';
    if (reason instanceof Error) {
      message = reason.message || reason.name || 'Unhandled rejection';
      stack = reason.stack || '';
    } else if (typeof reason === 'string') {
      message = reason;
    } else if (reason && typeof reason === 'object') {
      message = typeof reason.message === 'string' && reason.message
        ? reason.message
        : 'Unhandled rejection';
      reasonDetail = formatStructured(reason);
      reasonSummary = reasonDetail.split('\n')[0] || '';
    } else if (reason != null) {
      message = String(reason);
    }
    if (!reasonSummary && reason != null && typeof reason !== 'object') {
      reasonSummary = String(reason);
    }
    handleCrash({
      type: 'unhandledrejection',
      message: message || 'Unhandled rejection',
      stack,
      reasonSummary,
      reasonDetail,
      originalEvent: event,
    });
  });
}
