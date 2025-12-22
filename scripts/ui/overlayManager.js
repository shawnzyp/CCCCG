const focusableSelector =
  'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable]';

function focusFirst(root) {
  if (!root) return;
  const target = root.querySelector(focusableSelector);
  if (target && typeof target.focus === 'function') {
    target.focus();
  } else if (typeof root.focus === 'function') {
    root.focus();
  }
}

function trapFocus(root) {
  if (!root) return () => {};
  const handler = (event) => {
    if (event.key !== 'Tab') return;
    const focusables = Array.from(root.querySelectorAll(focusableSelector)).filter(
      (node) => !node.disabled && node.getAttribute('aria-hidden') !== 'true'
    );
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', handler);
  return () => root.removeEventListener('keydown', handler);
}

export class OverlayManager {
  constructor({ appRoot, overlayRoot, overlays, store } = {}) {
    this.appRoot = appRoot || null;
    this.overlayRoot = overlayRoot || null;
    this.overlays = overlays || {};
    this.store = store || null;
    this.active = [];
    this.activeSig = '';
    this.focusTrapCleanup = null;
    this.onKey = this.onKey.bind(this);
  }

  ensureBackdropPrepaint() {
    if (!this.overlayRoot) return;
    this.overlayRoot.classList.add('overlay-ready');
    requestAnimationFrame(() => {
      this.overlayRoot.classList.add('overlay-visible');
    });
  }

  signature(stack) {
    if (!Array.isArray(stack) || !stack.length) return '';
    // Stable, cheap change detection.
    return stack.map((s) => String(s?.type || '')).join('|');
  }

  render(stack, store) {
    const nextSig = this.signature(stack);
    const changed = nextSig !== this.activeSig;
    if (!changed) return;
    this.active = stack;
    this.activeSig = nextSig;

    if (this.focusTrapCleanup) {
      this.focusTrapCleanup();
      this.focusTrapCleanup = null;
    }

    Object.values(this.overlays).forEach((overlay) => {
      overlay.hide?.();
    });

    if (!stack.length) {
      this.appRoot?.removeAttribute('data-pt-overlay-active');
      if (this.overlayRoot) {
        this.overlayRoot.classList.remove('overlay-visible', 'overlay-ready');
      }
      document.removeEventListener('keydown', this.onKey);
      if (this.focusTrapCleanup) {
        this.focusTrapCleanup();
        this.focusTrapCleanup = null;
      }
      return;
    }

    this.appRoot?.setAttribute('data-pt-overlay-active', '1');
    document.addEventListener('keydown', this.onKey);

    const top = stack[stack.length - 1];
    const overlay = this.overlays[top.type];
    if (!overlay) return;

    overlay.show?.(store);
    const focusRoot = typeof overlay.focusRoot === 'function' ? overlay.focusRoot() : overlay.focusRoot;
    if (focusRoot) {
      focusFirst(focusRoot);
      this.focusTrapCleanup = trapFocus(focusRoot);
    }
  }

  onKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    const store = this.store || globalThis.__APP_STORE__;
    store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
  }
}
