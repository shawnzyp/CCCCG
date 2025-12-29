export function parseRecoveryCode(raw = '') {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '');
  let separator = null;
  if (normalized.includes('/')) {
    separator = '/';
  } else if (normalized.includes(':')) {
    separator = ':';
  }
  if (!separator) return null;
  const parts = normalized.split(separator).filter(Boolean);
  if (parts.length !== 2) return null;
  const [deviceId, characterId] = parts;
  if (!deviceId || !characterId) return null;
  return { deviceId, characterId };
}

export function bindWelcomeModalHandlers({ onLogin, onContinue } = {}) {
  const loginBtn = typeof document !== 'undefined' ? document.getElementById('welcome-login') : null;
  const continueBtn = typeof document !== 'undefined' ? document.getElementById('welcome-continue') : null;
  const loginHandler = typeof onLogin === 'function' ? onLogin : null;
  const continueHandler = typeof onContinue === 'function' ? onContinue : null;

  if (loginBtn && loginHandler) {
    loginBtn.addEventListener('click', loginHandler);
  }
  if (continueBtn && continueHandler) {
    continueBtn.addEventListener('click', continueHandler);
  }

  return () => {
    if (loginBtn && loginHandler) {
      loginBtn.removeEventListener('click', loginHandler);
    }
    if (continueBtn && continueHandler) {
      continueBtn.removeEventListener('click', continueHandler);
    }
  };
}
