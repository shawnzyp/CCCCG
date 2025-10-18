export async function writeTextToClipboard(text) {
  if (typeof text !== 'string') text = String(text ?? '');
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall back */
    }
  }
  if (typeof document === 'undefined') return false;
  const root = document.body || document.documentElement;
  if (!root) return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.top = '0';
  textarea.style.left = '0';
  root.appendChild(textarea);
  let success = false;
  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    success = document.execCommand('copy');
  } catch {
    success = false;
  }
  root.removeChild(textarea);
  return success;
}

export function buildExportFilename(base, { extension = 'txt' } = {}) {
  const prefix = typeof base === 'string' && base ? base : 'export';
  const ext = typeof extension === 'string' && extension ? extension.replace(/^\.+/, '') : 'txt';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${ext}`;
}

export function downloadTextFile(filename, text, { type = 'text/plain' } = {}) {
  if (typeof document === 'undefined') return false;
  const root = document.body || document.documentElement;
  if (!root) return false;
  try {
    const blob = new Blob([text], { type });
    const url = (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function')
      ? URL.createObjectURL(blob)
      : null;
    if (!url) return false;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'export.txt';
    link.style.display = 'none';
    root.appendChild(link);
    link.click();
    root.removeChild(link);
    if (typeof URL?.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    return true;
  } catch {
    return false;
  }
}
