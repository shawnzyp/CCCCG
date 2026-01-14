const TOAST_ONCE_PREFIX = 'cc:toast-once:';

export function dispatchUiNotify({ id = '', message = '', level = 'info' } = {}) {
  if (typeof document === 'undefined') return false;
  if (typeof message !== 'string' || !message.trim()) return false;
  try {
    document.dispatchEvent(new CustomEvent('cc:ui-notify', {
      detail: {
        id: typeof id === 'string' ? id : '',
        message: message.trim(),
        level: typeof level === 'string' && level.trim() ? level.trim() : 'info',
      },
    }));
    return true;
  } catch {
    return false;
  }
}

export function toastOnce(id, message, level = 'info') {
  const key = typeof id === 'string' && id.trim() ? `${TOAST_ONCE_PREFIX}${id.trim()}` : '';
  if (!key) return false;
  if (typeof localStorage === 'undefined') {
    return dispatchUiNotify({ id, message, level });
  }
  try {
    if (localStorage.getItem(key) === '1') return false;
    localStorage.setItem(key, '1');
    return dispatchUiNotify({ id, message, level });
  } catch {
    return dispatchUiNotify({ id, message, level });
  }
}
