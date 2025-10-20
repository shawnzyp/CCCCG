import { show, hide } from './modal.js';
import { PLAYER_CREDIT_EVENTS } from './player-credit-events.js';

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
  const memoField = document.getElementById('player-credit-memo-field');
  const memoEl = document.getElementById('player-credit-memo');
  const historyList = document.getElementById('player-credit-history');
  const historySection = historyList ? historyList.closest('.player-credit__history') : null;

  const STORAGE_KEY = 'cc_dm_card';
  const BROADCAST_CHANNEL_NAME = 'cc:player-credit';
  const MESSAGE_TYPE = 'CC_PLAYER_UPDATE';
  const MAX_HISTORY = 10;

  let transactionHistory = [];

  const cloneHistory = () => transactionHistory.map(item => ({ ...item }));
  const buildEventDetail = (type, payload, meta = {}) => ({
    payload: payload ? { ...payload } : null,
    history: cloneHistory(),
    meta: {
      event: type,
      ...meta,
    },
  });

  const dispatchPlayerCreditEvent = (type, payload, meta = {}) => {
    if (typeof CustomEvent !== 'function') return;
    const detail = buildEventDetail(type, payload, meta);
    if (typeof document?.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent(type, { detail }));
    }
    if (typeof window?.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    }
  };

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
    const memo = typeof payload.memo === 'string' ? payload.memo.trim() : '';
    const player = typeof payload.player === 'string' ? payload.player : '';
    const timestampDate = (() => {
      if (payload.timestamp instanceof Date) {
        return Number.isNaN(payload.timestamp.getTime()) ? new Date() : payload.timestamp;
      }
      if (typeof payload.timestamp === 'string' && payload.timestamp) {
        const parsed = new Date(payload.timestamp);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      return new Date();
    })();
    return {
      account,
      type,
      sender,
      ref,
      txid,
      amount: Number.isFinite(amount) ? amount : 0,
      memo,
      timestamp: timestampDate.toISOString(),
      player,
    };
  };

  const historyKeyFor = (entry = {}) => `${entry.txid || entry.ref || ''}|${entry.timestamp || ''}`;

  const sortHistory = (entries = []) => {
    return entries
      .slice()
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        const safeA = Number.isFinite(timeA) ? timeA : 0;
        const safeB = Number.isFinite(timeB) ? timeB : 0;
        return safeB - safeA;
      });
  };

  const persistHistory = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactionHistory));
      }
    } catch {
      /* ignore persistence errors */
    }
  };

  const replaceHistoryEntries = (entries = []) => {
    const seen = new Set();
    const normalized = [];
    entries.forEach(entry => {
      const sanitized = sanitizePayload(entry);
      const key = historyKeyFor(sanitized);
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(sanitized);
    });
    transactionHistory = sortHistory(normalized).slice(0, MAX_HISTORY);
    return transactionHistory[0] || null;
  };

  const upsertHistoryEntry = (entry) => {
    const sanitized = sanitizePayload(entry);
    const key = historyKeyFor(sanitized);
    const filtered = transactionHistory.filter(item => historyKeyFor(item) !== key);
    filtered.unshift(sanitized);
    transactionHistory = sortHistory(filtered).slice(0, MAX_HISTORY);
    return transactionHistory[0] || null;
  };

  const renderHistory = (entries = []) => {
    if (!historyList) return;
    historyList.innerHTML = '';
    const shouldCollapse = !entries.length || entries.length <= 1;
    historyList.hidden = shouldCollapse;
    if (historySection) {
      historySection.hidden = shouldCollapse;
      historySection.toggleAttribute('data-collapsed', shouldCollapse);
    }
    if (shouldCollapse) {
      return;
    }
    entries.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'player-credit__history-item';
      item.tabIndex = 0;
      item.dataset.index = String(index);

      const timestamp = new Date(entry.timestamp || Date.now());
      const dateLabel = formatDate(timestamp);
      const timeLabel = formatTime(timestamp);
      const amountLabel = formatAmount(entry.amount);
      const typeLabel = entry.type || 'Transaction';
      const senderLabel = entry.sender || 'Unknown sender';
      const memoText = entry.memo || '';

      const ariaParts = [`${typeLabel} ${amountLabel}`.trim(), `from ${senderLabel}`.trim(), `on ${dateLabel} at ${timeLabel}`];
      if (memoText) {
        ariaParts.push(`Memo: ${memoText}`);
      }
      item.setAttribute('aria-label', ariaParts.join(', '));

      const header = document.createElement('div');
      header.className = 'player-credit__history-header';
      const amountSpan = document.createElement('span');
      amountSpan.className = 'player-credit__history-amount';
      amountSpan.textContent = amountLabel;
      header.appendChild(amountSpan);

      const typeSpan = document.createElement('span');
      typeSpan.className = 'player-credit__history-type';
      typeSpan.textContent = typeLabel;
      header.appendChild(typeSpan);
      item.appendChild(header);

      const senderLine = document.createElement('div');
      senderLine.className = 'player-credit__history-sender';
      senderLine.textContent = senderLabel ? `Sender: ${senderLabel}` : 'Sender: —';
      item.appendChild(senderLine);

      const meta = document.createElement('div');
      meta.className = 'player-credit__history-meta';
      meta.textContent = `${dateLabel} • ${timeLabel}`;
      item.appendChild(meta);

      if (memoText) {
        const memoDiv = document.createElement('div');
        memoDiv.className = 'player-credit__history-memo';
        memoDiv.textContent = memoText;
        item.appendChild(memoDiv);
      }

      historyList.appendChild(item);
    });
  };

  const syncHistoryFromEntries = (entries = [], { reveal = false, persist = false, source = 'sync' } = {}) => {
    const signatureBefore = lastSignature;
    const latest = replaceHistoryEntries(entries);
    let rendered = null;
    if (!transactionHistory.length) {
      renderHistory(transactionHistory);
      if (persist) {
        persistHistory();
      }
    } else {
      const target = latest || transactionHistory[0];
      rendered = renderPayload(target, { reveal });
      renderHistory(transactionHistory);
      if (persist) {
        persistHistory();
      }
      if (!reveal && signatureBefore === null) {
        lastSignature = signatureFor(rendered);
      }
    }
    dispatchPlayerCreditEvent(
      PLAYER_CREDIT_EVENTS.SYNC,
      rendered || latest || null,
      {
        reveal,
        persist,
        source,
        dmSession: isDmSession(),
      },
    );
  };

  const setCardDatasets = (data) => {
    if (!card) return;
    card.dataset.account = data.account || '';
    card.dataset.amount = Number.isFinite(data.amount) ? data.amount.toFixed(2) : '0.00';
    card.dataset.type = data.type || '';
    card.dataset.sender = data.sender || '';
    card.dataset.player = data.player || '';
    card.dataset.memo = data.memo || '';
  };

  const applyDisplay = (data) => {
    if (accountEl) accountEl.textContent = data.account || '—';
    if (amountEl) amountEl.textContent = formatAmount(data.amount);
    if (typeEl) typeEl.textContent = data.type || '—';
    if (senderEl) senderEl.textContent = data.sender || '—';
    if (memoField && memoEl) {
      const memoText = data.memo || '';
      if (memoText) {
        memoEl.textContent = memoText;
        memoField.hidden = false;
      } else {
        memoEl.textContent = '—';
        memoField.hidden = true;
      }
    }
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
      memo: data.memo,
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
    const persist = options.persist !== false;
    const source = typeof options.source === 'string' ? options.source : 'update';
    const signatureBefore = lastSignature;
    upsertHistoryEntry(payload);
    const latest = transactionHistory[0] || sanitizePayload(payload);
    const rendered = renderPayload(latest, { reveal });
    renderHistory(transactionHistory);
    if (persist) {
      persistHistory();
    }
    dispatchPlayerCreditEvent(
      PLAYER_CREDIT_EVENTS.UPDATE,
      rendered,
      {
        reveal,
        persist,
        source,
        dmSession: isDmSession(),
      },
    );
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
    if (Array.isArray(data.payload)) {
      syncHistoryFromEntries(data.payload, { reveal: true, persist: true, source: 'message' });
    } else {
      handleUpdate(data.payload, { reveal: true, source: 'message' });
    }
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', () => hide('player-credit-modal'));
  }

  window.addEventListener('message', receiveMessage, false);

  const extractHistoryEntries = (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object' && Array.isArray(value.entries)) {
      return value.entries;
    }
    return null;
  };

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const parsed = safeParse(event.newValue);
    if (!parsed) {
      transactionHistory = [];
      renderHistory(transactionHistory);
      dispatchPlayerCreditEvent(
        PLAYER_CREDIT_EVENTS.SYNC,
        null,
        {
          reveal: true,
          persist: false,
          source: 'storage',
          dmSession: isDmSession(),
        },
      );
      return;
    }
    const entries = extractHistoryEntries(parsed);
    if (entries) {
      syncHistoryFromEntries(entries, { reveal: true, persist: false, source: 'storage' });
    } else {
      handleUpdate(parsed, { reveal: true, persist: false, source: 'storage' });
    }
  });

  if (typeof BroadcastChannel === 'function') {
    try {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.addEventListener('message', (event) => {
        if (!event?.data || event.data.type !== MESSAGE_TYPE) return;
        handleUpdate(event.data.payload, { reveal: true, source: 'broadcast' });
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
      const entries = extractHistoryEntries(parsed);
      if (entries) {
        syncHistoryFromEntries(entries, { reveal: false, persist: false, source: 'hydrate' });
      } else if (parsed) {
        handleUpdate(parsed, { reveal: false, persist: false, source: 'hydrate' });
        persistHistory();
      } else {
        renderHistory(transactionHistory);
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
