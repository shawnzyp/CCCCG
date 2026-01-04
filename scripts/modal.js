import { $, qsa } from './helpers.js';
import { coverFloatingLauncher, releaseFloatingLauncher } from './floating-launcher.js';
import {
  dmHasPasswordSet,
  dmSetPassword,
  dmVerifyPassword,
  getDmUsername,
} from './dm-auth.js';

function getInertTargets() {
  const targets = new Set();
  qsa('body > :not(.overlay):not([data-launch-shell]):not(#launch-animation)').forEach(el => targets.add(el));
  const shell = document.querySelector('[data-launch-shell]');
  if (shell) {
    qsa(':scope > :not(.overlay):not(#somf-reveal-alert)', shell).forEach(el => targets.add(el));
  }
  return Array.from(targets);
}

let lastFocus = null;
let openModals = 0;

const MODAL_STYLE_PROPS = [
  ['modalAccentHue', '--modal-accent-hue'],
  ['modalGlowStrength', '--modal-glow-strength'],
];

function applyModalStyles(overlay) {
  if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  const sources = [];
  if (modal) sources.push(modal.dataset);
  sources.push(overlay.dataset);
  const style = overlay.style;
  const setStyleProperty = style && typeof style.setProperty === 'function'
    ? (prop, value) => {
        try {
          style.setProperty(prop, value);
        } catch {}
      }
    : (prop, value) => {
        try {
          if (style) {
            style[prop] = value;
          }
        } catch {}
      };
  const removeStyleProperty = style && typeof style.removeProperty === 'function'
    ? prop => {
        try {
          style.removeProperty(prop);
        } catch {}
      }
    : prop => {
        if (!style) return;
        try {
          if (Object.prototype.hasOwnProperty.call(style, prop)) {
            delete style[prop];
          } else {
            style[prop] = '';
          }
        } catch {}
      };
  MODAL_STYLE_PROPS.forEach(([dataKey, cssVar]) => {
    const value = sources
      .map(source => (source ? source[dataKey] : undefined))
      .find(v => v !== undefined && v !== '');
    if (value !== undefined && value !== '') {
      setStyleProperty(cssVar, value);
    } else {
      removeStyleProperty(cssVar);
    }
  });
}

function clearModalStyles(overlay) {
  if (!overlay) return;
  const { style } = overlay;
  MODAL_STYLE_PROPS.forEach(([, cssVar]) => {
    if (style && typeof style.removeProperty === 'function') {
      try {
        style.removeProperty(cssVar);
      } catch {}
    } else if (style) {
      try {
        if (Object.prototype.hasOwnProperty.call(style, cssVar)) {
          delete style[cssVar];
        } else {
          style[cssVar] = '';
        }
      } catch {}
    }
  });
}

function cancelModalStyleReset(overlay) {
  if (overlay && overlay._modalStyleTimer) {
    clearTimeout(overlay._modalStyleTimer);
    overlay._modalStyleTimer = null;
  }
}

// Helper to keep focus within an open modal
function trapFocus(el) {
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = el.querySelectorAll(
      'a[href],area[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,object,embed,[tabindex]:not([tabindex="-1"]),[contenteditable]'
    );
    if (!focusable.length) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener('keydown', handler);
  el._trapFocus = handler;
}

function removeTrapFocus(el) {
  if (el._trapFocus) {
    el.removeEventListener('keydown', el._trapFocus);
    delete el._trapFocus;
  }
}

// Ensure hidden overlays are not focusable on load
qsa('.overlay.hidden').forEach(ov => { ov.style.display = 'none'; });

function bindOverlayClickHandler(overlay) {
  if (!overlay || overlay._overlayClickHandler) return;
  const handler = (e) => {
    if (e.target === overlay && !overlay.hasAttribute('data-modal-static')) {
      hide(overlay.id);
    }
  };
  overlay.addEventListener('click', handler);
  overlay._overlayClickHandler = handler;
}

// Close modal on overlay click
qsa('.overlay').forEach(bindOverlayClickHandler);

// Allow closing with Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openModals > 0) {
    const open = qsa('.overlay').find(o => !o.classList.contains('hidden') && !o.hasAttribute('data-modal-static'));
    if (open) hide(open.id);
  }
});

export function show(id) {
  try {
    const el = $(id);
    if (!el || !el.classList.contains('hidden')) return false;
    bindOverlayClickHandler(el);
    lastFocus = document.activeElement;
    if (openModals === 0) {
      coverFloatingLauncher();
      try {
        document.body.classList.add('modal-open');
      } catch (err) {
        console.error('Failed to update body class when showing modal', err);
      }
      getInertTargets().forEach(e => {
        try {
          e.setAttribute('inert', '');
        } catch (err) {
          console.error('Failed to set inert attribute', err);
        }
      });
    }
    openModals++;
    cancelModalStyleReset(el);
    applyModalStyles(el);
    el.style.display = 'flex';
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    trapFocus(el);
    const focusEl = el.querySelector('[autofocus],input,select,textarea,button');
    if (focusEl && typeof focusEl.focus === 'function') {
      try {
        focusEl.focus();
      } catch (err) {
        console.error('Failed to focus modal element', err);
      }
    }
    return true;
  } catch (err) {
    console.error(`Failed to show modal ${id}`, err);
    return false;
  }
}

export function hide(id) {
  try {
    const el = $(id);
    if (!el || el.classList.contains('hidden')) return false;
    cancelModalStyleReset(el);
    removeTrapFocus(el);
    const activeElement = document.activeElement;
    if (activeElement && el.contains(activeElement) && typeof activeElement.blur === 'function') {
      try {
        activeElement.blur();
      } catch (err) {
        console.error('Failed to blur active element before hiding modal', err);
      }
    }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try {
        lastFocus.focus();
      } catch (err) {
        console.error('Failed to restore focus after closing modal', err);
      }
    }
    const onEnd = (e) => {
      if (e.target === el && e.propertyName === 'opacity') {
        el.style.display = 'none';
        clearModalStyles(el);
        cancelModalStyleReset(el);
        el.removeEventListener('transitionend', onEnd);
      }
    };
    el.addEventListener('transitionend', onEnd);
    el._modalStyleTimer = setTimeout(() => {
      clearModalStyles(el);
      cancelModalStyleReset(el);
    }, 400);
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    openModals = Math.max(0, openModals - 1);
    if (openModals === 0) {
      releaseFloatingLauncher();
      try {
        document.body.classList.remove('modal-open');
      } catch (err) {
        console.error('Failed to update body class when hiding modal', err);
      }
      getInertTargets().forEach(e => {
        try {
          e.removeAttribute('inert');
        } catch (err) {
          console.error('Failed to remove inert attribute', err);
        }
      });
    }
    return true;
  } catch (err) {
    console.error(`Failed to hide modal ${id}`, err);
    return false;
  }
}

export function openDmAuthModal({ onAuthed, onClosed } = {}) {
  const modal = $('dm-login-modal');
  if (!modal) return false;
  const closeBtn = $('dm-login-close');
  const usernameSetup = $('dm-login-username');
  const usernameLogin = $('dm-login-username-login');
  const passwordSetup = $('dm-login-password');
  const confirmSetup = $('dm-login-confirm');
  const passwordLogin = $('dm-login-password-login');
  const setupSubmit = $('dm-login-submit');
  const loginSubmit = $('dm-login-submit-login');
  const errorEl = modal.querySelector('[data-login-error]');
  const viewSetup = modal.querySelector('[data-login-view="setup"]');
  const viewLogin = modal.querySelector('[data-login-view="login"]');

  const setError = (message) => {
    if (!errorEl) return;
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  };

  const dispatchLoginEvent = (name, detail = {}) => {
    if (typeof document === 'undefined' || typeof document.dispatchEvent !== 'function') return;
    document.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const switchView = () => {
    const hasPassword = dmHasPasswordSet();
    if (viewSetup) {
      viewSetup.hidden = hasPassword;
      viewSetup.setAttribute('aria-hidden', hasPassword ? 'true' : 'false');
    }
    if (viewLogin) {
      viewLogin.hidden = !hasPassword;
      viewLogin.setAttribute('aria-hidden', hasPassword ? 'false' : 'true');
    }
  };

  const username = getDmUsername();
  if (usernameSetup) usernameSetup.value = username;
  if (usernameLogin) usernameLogin.value = username;
  if (passwordSetup) passwordSetup.value = '';
  if (confirmSetup) confirmSetup.value = '';
  if (passwordLogin) passwordLogin.value = '';
  setError('');
  switchView();
  show('dm-login-modal');
  dispatchLoginEvent('dm-login:opened');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setupSubmit?.removeEventListener('click', onSetupSubmit);
    loginSubmit?.removeEventListener('click', onLoginSubmit);
    passwordSetup?.removeEventListener('keydown', onSetupKey);
    confirmSetup?.removeEventListener('keydown', onSetupKey);
    passwordLogin?.removeEventListener('keydown', onLoginKey);
    modal?.removeEventListener('click', onOverlayClick);
    closeBtn?.removeEventListener('click', onClose);
  };

  const finalizeSuccess = () => {
    if (typeof onAuthed === 'function') {
      try {
        onAuthed();
      } catch (err) {
        console.error('DM auth callback failed', err);
      }
    }
    hide('dm-login-modal');
    cleanup();
  };

  async function onSetupSubmit() {
    const password = passwordSetup?.value || '';
    const confirm = confirmSetup?.value || '';
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      passwordSetup?.focus();
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      confirmSetup?.focus();
      return;
    }
    setError('');
    try {
      await dmSetPassword(password);
      finalizeSuccess();
    } catch (err) {
      console.error('Failed to set DM password', err);
      setError('Unable to save password. Check storage access and try again.');
    }
  }

  async function onLoginSubmit() {
    const password = passwordLogin?.value || '';
    if (password.length < 8) {
      setError('Enter your DM password.');
      passwordLogin?.focus();
      return;
    }
    setError('');
    try {
      const valid = await dmVerifyPassword(password);
      if (!valid) {
        setError('Incorrect password.');
        dispatchLoginEvent('dm-login:failure', { reason: 'invalid' });
        passwordLogin?.focus();
        return;
      }
      dispatchLoginEvent('dm-login:success');
      finalizeSuccess();
    } catch (err) {
      console.error('Failed to verify DM password', err);
      setError('Unable to verify password. Check storage access and try again.');
      dispatchLoginEvent('dm-login:failure', { reason: 'error' });
    }
  }

  function onSetupKey(event) {
    if (event.key === 'Enter') {
      onSetupSubmit();
    }
  }

  function onLoginKey(event) {
    if (event.key === 'Enter') {
      onLoginSubmit();
    }
  }

  function onClose() {
    hide('dm-login-modal');
    dispatchLoginEvent('dm-login:closed');
    if (typeof onClosed === 'function') {
      try {
        onClosed();
      } catch (err) {
        console.error('DM auth close callback failed', err);
      }
    }
    cleanup();
  }

  function onOverlayClick(event) {
    if (event.target === modal) {
      onClose();
    }
  }

  setupSubmit?.addEventListener('click', onSetupSubmit);
  loginSubmit?.addEventListener('click', onLoginSubmit);
  passwordSetup?.addEventListener('keydown', onSetupKey);
  confirmSetup?.addEventListener('keydown', onSetupKey);
  passwordLogin?.addEventListener('keydown', onLoginKey);
  modal?.addEventListener('click', onOverlayClick);
  closeBtn?.addEventListener('click', onClose);
  return true;
}
