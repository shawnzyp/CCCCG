import { show, hide } from './modal.js';

(() => {
  const overlay = document.getElementById('player-credit-modal');
  if (!overlay) return;

  const closeBtn = document.getElementById('player-credit-close');
  const card = document.getElementById('player-credit-card');
  const refEl = document.getElementById('player-credit-ref');
  const txidEl = document.getElementById('player-credit-txid');
  const dateEl = document.getElementById('player-credit-date');
  const timeEl = document.getElementById('player-credit-time');
  const accountEl = document.getElementById('player-credit-account');
  const amountEl = document.getElementById('player-credit-amount');
  const typeEl = document.getElementById('player-credit-type');
  const senderEl = document.getElementById('player-credit-sender');

  const STORAGE_KEY = 'cc_dm_card';
  const BROADCAST_CHANNEL_NAME = 'cc:player-credit';
  const MESSAGE_TYPE = 'CC_PLAYER_UPDATE';

  const amountFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const allowedOrigins = (() => {
    if (Array.isArray(window.CC_PLAYER_ALLOWED_ORIGINS) && window.CC_PLAYER_ALLOWED_ORIGINS.length > 0) {
      return window.CC_PLAYER_ALLOWED_ORIGINS;
    }
    return [window.location.origin];
  })();

  const clampArray = (value) => (Array.isArray(value) ? value : []);
  const allowedOriginsList = clampArray(allowedOrigins);

  const pad = (n) => String(n).padStart(2, '0');
  const formatDate = (date) => `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()}`;
  const formatTime = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  const generateReferenceForSender = (senderId) => {
    const map = { OMNI: 'OMNI', PFV: 'PFV', GREY: 'GREY', ANON: 'ANON' };
    const prefix = map[senderId] || (senderId || 'OMNI');
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rnd = Math.floor(Math.random() * 900000) + 100000;
    return `TXN-${prefix}-${ymd}-${rnd}`;
  };

  const isDmSession = () => {
    try {
      return sessionStorage.getItem('dmLoggedIn') === '1';
    } catch {
      return false;
    }
  };

  const applyReference = (reference, senderId) => {
    const ref = reference || generateReferenceForSender(String(senderId || '').replace(/[^A-Z]/g, '').slice(0, 4));
    const tx = ref.replace(/^TXN-/, '');
    if (refEl) refEl.textContent = ref || '—';
    if (txidEl) txidEl.textContent = tx || '—';
    if (card) {
      card.dataset.ref = ref;
      card.dataset.txid = tx;
    }
  };

  const applyTimestamp = (timestamp) => {
    const date = (() => {
      if (!timestamp) return new Date();
      const parsed = new Date(timestamp);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    })();
    if (dateEl) dateEl.textContent = formatDate(date);
    if (timeEl) timeEl.textContent = formatTime(date);
    if (card) {
      card.dataset.timestamp = date.toISOString();
    }
    return date;
  };

  const formatAmount = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || Math.abs(numeric) < 1e-6) {
      return '₡0.00';
    }
    const sign = numeric < 0 ? '−' : '';
    const formatted = amountFormatter.format(Math.abs(numeric));
    return `${sign}₡${formatted}`;
  };

  const sanitizePayload = (payload = {}) => {
    const account = typeof payload.account === 'string' ? payload.account : '';
    const type = typeof payload.type === 'string' ? payload.type : '';
    const sender = typeof payload.sender === 'string' ? payload.sender : '';
    const ref = typeof payload.ref === 'string' ? payload.ref : (typeof payload.reference === 'string' ? payload.reference : '');
    const txid = typeof payload.txid === 'string' ? payload.txid : '';
    const amount = Number(payload.amount);
    const timestamp = typeof payload.timestamp === 'string' || payload.timestamp instanceof Date ? payload.timestamp : '';
    const player = typeof payload.player === 'string' ? payload.player : '';
    return {
      account,
      type,
      sender,
      ref,
      txid,
      amount: Number.isFinite(amount) ? amount : 0,
      timestamp,
      player,
    };
  };

  const setCardDatasets = (data) => {
    if (!card) return;
    card.dataset.account = data.account || '';
    card.dataset.amount = Number.isFinite(data.amount) ? data.amount.toFixed(2) : '0.00';
    card.dataset.type = data.type || '';
    card.dataset.sender = data.sender || '';
    card.dataset.player = data.player || '';
  };

  const applyDisplay = (data) => {
    if (accountEl) accountEl.textContent = data.account || '—';
    if (amountEl) amountEl.textContent = formatAmount(data.amount);
    if (typeEl) typeEl.textContent = data.type || '—';
    if (senderEl) senderEl.textContent = data.sender || '—';
  };

  const applyRevealAnimation = () => {
    if (!card) return;
    card.classList.remove('reveal-anim');
    void card.offsetWidth; // reflow to restart animation
    card.classList.add('reveal-anim');
  };

  let lastSignature = null;
  let lastRevealMode = null;

  const signatureFor = (data) => {
    return JSON.stringify({
      ref: data.ref,
      txid: data.txid,
      ts: typeof data.timestamp === 'string' ? data.timestamp : data.timestamp?.toISOString?.(),
      account: data.account,
      amount: Number.isFinite(data.amount) ? Number(data.amount) : 0,
      type: data.type,
    });
  };

  const renderPayload = (payload, { reveal = true } = {}) => {
    const sanitized = sanitizePayload(payload);
    setCardDatasets(sanitized);
    applyDisplay(sanitized);
    applyReference(sanitized.ref, sanitized.sender || sanitized.type);
    if (card) {
      sanitized.ref = card.dataset.ref || sanitized.ref;
      sanitized.txid = card.dataset.txid || sanitized.txid;
    }
    const ts = applyTimestamp(sanitized.timestamp);
    sanitized.timestamp = ts.toISOString();
    applyRevealAnimation();
    const previousSignature = lastSignature;
    const signature = signatureFor(sanitized);
    const isNew = signature !== previousSignature;
    const previousMode = lastRevealMode;
    lastSignature = signature;
    const shouldReveal = reveal
      && !isDmSession()
      && (isNew || previousMode === 'silent');
    if (shouldReveal) {
      show('player-credit-modal');
    }
    lastRevealMode = reveal ? 'reveal' : 'silent';
    return sanitized;
  };

  const safeParse = (value) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const handleUpdate = (payload, options = {}) => {
    const reveal = options.reveal !== false;
    const signatureBefore = lastSignature;
    const rendered = renderPayload(payload, { reveal });
    if (reveal && isDmSession()) {
      hide('player-credit-modal');
    }
    if (!reveal && signatureBefore === null) {
      lastSignature = signatureFor(rendered);
    }
  };

  const receiveMessage = (event) => {
    const origin = event?.origin || '';
    if (!allowedOriginsList.includes('*') && !allowedOriginsList.includes(origin)) {
      return;
    }
    const data = event?.data;
    if (!data || data.type !== MESSAGE_TYPE) return;
    handleUpdate(data.payload, { reveal: true });
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', () => hide('player-credit-modal'));
  }

  window.addEventListener('message', receiveMessage, false);

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const parsed = safeParse(event.newValue);
    if (!parsed) return;
    handleUpdate(parsed, { reveal: true });
  });

  if (typeof BroadcastChannel === 'function') {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.addEventListener('message', (event) => {
        if (!event?.data || event.data.type !== MESSAGE_TYPE) return;
        handleUpdate(event.data.payload, { reveal: true });
      });
      overlay._playerCreditChannel = channel;
    } catch {
      /* ignore broadcast errors */
    }
  }

  const hydrateFromStorage = () => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      const parsed = safeParse(existing);
      if (parsed) {
        handleUpdate(parsed, { reveal: false });
      }
    } catch {
      /* ignore hydration errors */
    }
  };

  hydrateFromStorage();

  if (typeof window.setPlayerTransaction !== 'function') {
    window.setPlayerTransaction = (payload, options) => {
      handleUpdate(payload, options);
    };
  } else {
    const previous = window.setPlayerTransaction;
    window.setPlayerTransaction = (payload, options) => {
      previous(payload, options);
      handleUpdate(payload, options);
    };
  }
})();
