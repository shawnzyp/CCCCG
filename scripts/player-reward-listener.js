import { PLAYER_REWARD_EVENTS } from './player-reward-events.js';

const MESSAGE_TYPE = 'CC_REWARD_UPDATE';
const BROADCAST_CHANNEL_NAMES = ['cc:player-credit', 'cc:player-rewards'];
const STORAGE_KEY = 'player-reward:history';
const HISTORY_LIMIT = 20;

let rewardHistory = [];
let broadcastChannels = [];

const cloneHistory = () => rewardHistory.map(entry => ({
  ...entry,
  data: entry.data ? { ...entry.data } : {},
  historyEntry: entry.historyEntry ? { ...entry.historyEntry } : null,
}));

const buildEventDetail = (type, payload, meta = {}) => ({
  payload: payload ? { ...payload, data: payload.data ? { ...payload.data } : {}, historyEntry: payload.historyEntry ? { ...payload.historyEntry } : null } : null,
  history: cloneHistory(),
  meta: {
    event: type,
    ...meta,
  },
});

const dispatchPlayerRewardEvent = (type, payload, meta = {}) => {
  if (typeof CustomEvent !== 'function') return;
  const detail = buildEventDetail(type, payload, meta);
  if (typeof document?.dispatchEvent === 'function') {
    document.dispatchEvent(new CustomEvent(type, { detail }));
  }
  if (typeof window?.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }
};

const allowedOrigins = (() => {
  const configured = Array.isArray(window?.CC_PLAYER_ALLOWED_ORIGINS)
    ? window.CC_PLAYER_ALLOWED_ORIGINS
    : null;
  if (configured && configured.length) {
    return configured;
  }
  const origin = window?.location?.origin;
  return origin ? [origin] : ['*'];
})();

const allowedOriginsList = Array.isArray(allowedOrigins) ? allowedOrigins : ['*'];
const isAllowedOrigin = origin => allowedOriginsList.includes('*') || allowedOriginsList.includes(origin);

const safeParseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const coerceTimestamp = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now();
};

const sanitizeHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const text = typeof entry.text === 'string' ? entry.text.trim() : '';
  const timestampValue = coerceTimestamp(entry.t ?? entry.timestamp ?? entry.time);
  if (!id && !name && !text) {
    return null;
  }
  return {
    id: id || `${name || text || 'reward'}|${timestampValue}`,
    t: timestampValue,
    name,
    text,
  };
};

const sanitizePayload = (payload = {}) => {
  const kind = typeof payload.kind === 'string' ? payload.kind : '';
  const player = typeof payload.player === 'string' ? payload.player : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const timestampIso = (() => {
    const source = payload.timestamp ?? payload.time ?? payload.t;
    if (source instanceof Date && !Number.isNaN(source.getTime())) {
      return source.toISOString();
    }
    if (typeof source === 'string' && source) {
      const parsed = new Date(source);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    if (typeof source === 'number' && Number.isFinite(source)) {
      const parsed = new Date(source);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date().toISOString();
  })();
  const data = payload.data && typeof payload.data === 'object' ? { ...payload.data } : {};
  const historyEntry = sanitizeHistoryEntry(payload.historyEntry || data.historyEntry);
  if (historyEntry && data.historyEntry) {
    delete data.historyEntry;
  }
  const id = typeof payload.id === 'string' && payload.id
    ? payload.id
    : (historyEntry?.id || `${kind || 'reward'}|${timestampIso}`);
  return {
    id,
    kind,
    player,
    message,
    timestamp: timestampIso,
    data,
    historyEntry,
  };
};

const historyKeyFor = (entry = {}) => `${entry.id || ''}|${entry.timestamp || ''}`;

const sortHistory = (entries = []) => entries
  .slice()
  .sort((a, b) => {
    const timeA = a.historyEntry?.t ?? Date.parse(a.timestamp || 0) || 0;
    const timeB = b.historyEntry?.t ?? Date.parse(b.timestamp || 0) || 0;
    const safeA = Number.isFinite(timeA) ? timeA : 0;
    const safeB = Number.isFinite(timeB) ? timeB : 0;
    return safeB - safeA;
  });

const persistHistory = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!rewardHistory.length) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rewardHistory));
    }
  } catch {
    /* ignore persistence errors */
  }
};

const replaceHistoryEntries = (entries = []) => {
  const normalized = Array.isArray(entries)
    ? entries.map(item => sanitizePayload(item)).filter(Boolean)
    : [];
  const seen = new Set();
  const deduped = [];
  normalized.forEach(entry => {
    const key = historyKeyFor(entry);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(entry);
  });
  rewardHistory = sortHistory(deduped).slice(0, HISTORY_LIMIT);
  return rewardHistory[0] || null;
};

const upsertHistoryEntry = (entry) => {
  const sanitized = sanitizePayload(entry);
  const key = historyKeyFor(sanitized);
  const filtered = rewardHistory.filter(item => historyKeyFor(item) !== key);
  filtered.unshift(sanitized);
  rewardHistory = sortHistory(filtered).slice(0, HISTORY_LIMIT);
  return rewardHistory[0] || sanitized;
};

const handleUpdate = (payload, options = {}) => {
  const reveal = options.reveal !== false;
  const persist = options.persist !== false;
  const source = typeof options.source === 'string' ? options.source : 'update';
  const latest = upsertHistoryEntry(payload);
  if (persist) {
    persistHistory();
  }
  dispatchPlayerRewardEvent(
    PLAYER_REWARD_EVENTS.UPDATE,
    latest,
    {
      reveal,
      persist,
      source,
      dmSession: false,
    },
  );
};

const syncHistoryFromEntries = (entries, options = {}) => {
  const reveal = options.reveal === true;
  const persist = options.persist === true;
  const source = typeof options.source === 'string' ? options.source : 'sync';
  const latest = replaceHistoryEntries(entries);
  if (persist) {
    persistHistory();
  }
  dispatchPlayerRewardEvent(
    PLAYER_REWARD_EVENTS.SYNC,
    latest,
    {
      reveal,
      persist,
      source,
      dmSession: false,
    },
  );
};

const handleIncomingMessage = (message, { source = 'message', reveal = true } = {}) => {
  if (!message || typeof message !== 'object') return;
  if (message.type !== MESSAGE_TYPE) return;
  const payload = message.payload;
  if (Array.isArray(payload)) {
    syncHistoryFromEntries(payload, { reveal, persist: true, source });
    return;
  }
  const normalized = payload ? { ...payload } : {};
  if (message.historyEntry && !normalized.historyEntry) {
    normalized.historyEntry = message.historyEntry;
  }
  handleUpdate(normalized, { reveal, persist: true, source });
};

const hydrateFromStorage = () => {
  if (typeof localStorage === 'undefined') {
    rewardHistory = [];
    return;
  }
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) {
      rewardHistory = [];
      dispatchPlayerRewardEvent(
        PLAYER_REWARD_EVENTS.SYNC,
        null,
        {
          reveal: false,
          persist: false,
          source: 'hydrate',
          dmSession: false,
        },
      );
      return;
    }
    const parsed = safeParseJson(existing);
    if (Array.isArray(parsed)) {
      syncHistoryFromEntries(parsed, { reveal: false, persist: false, source: 'hydrate' });
    } else if (parsed && typeof parsed === 'object') {
      handleUpdate(parsed, { reveal: false, persist: false, source: 'hydrate' });
      persistHistory();
    }
  } catch {
    /* ignore hydration errors */
  }
};

const initializeBroadcastChannels = () => {
  if (typeof BroadcastChannel !== 'function') {
    return;
  }
  broadcastChannels.forEach(channel => {
    try {
      channel.close();
    } catch {
      /* noop */
    }
  });
  broadcastChannels = [];
  BROADCAST_CHANNEL_NAMES.forEach(name => {
    try {
      const channel = new BroadcastChannel(name);
      channel.addEventListener('message', (event) => {
        handleIncomingMessage(event?.data, { source: 'broadcast', reveal: true });
      });
      broadcastChannels.push(channel);
    } catch {
      /* ignore broadcast failures */
    }
  });
};

const handleWindowMessage = (event) => {
  const origin = event?.origin || '';
  if (!isAllowedOrigin(origin)) return;
  handleIncomingMessage(event?.data, { source: 'message', reveal: true });
};

const handleStorageEvent = (event) => {
  if (event.key !== STORAGE_KEY) return;
  if (!event.newValue) {
    rewardHistory = [];
    dispatchPlayerRewardEvent(
      PLAYER_REWARD_EVENTS.SYNC,
      null,
      {
        reveal: true,
        persist: false,
        source: 'storage',
        dmSession: false,
      },
    );
    return;
  }
  const parsed = safeParseJson(event.newValue);
  if (Array.isArray(parsed)) {
    syncHistoryFromEntries(parsed, { reveal: true, persist: false, source: 'storage' });
  } else if (parsed && typeof parsed === 'object') {
    handleUpdate(parsed, { reveal: true, persist: false, source: 'storage' });
  }
};

export const getPlayerRewardHistory = () => cloneHistory();

hydrateFromStorage();
initializeBroadcastChannels();

if (typeof window !== 'undefined') {
  window.addEventListener('message', handleWindowMessage, false);
  window.addEventListener('storage', handleStorageEvent);
}
