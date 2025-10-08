import { normalizeDmCatalogPayload } from './catalog-utils.js';

const STORAGE_PREFIX = 'cc:dm-catalog-grants:';
const BROADCAST_CHANNEL_NAME = 'cc:dm-catalog-grants';
const MAX_GRANTS_PER_PLAYER = 50;
const NAME_CACHE_TTL_MS = 5 * 60 * 1000;

function now() {
  return Date.now();
}

function sanitizePlayerName(name) {
  if (!name) return '';
  return String(name).trim().replace(/\s+/g, ' ');
}

function normalizePlayerKey(name) {
  const trimmed = sanitizePlayerName(name);
  if (!trimmed) return null;
  return { normalized: trimmed.toLowerCase(), display: trimmed };
}

function getStorageKey(normalizedPlayer) {
  if (!normalizedPlayer) return null;
  return `${STORAGE_PREFIX}${normalizedPlayer}`;
}

function hasStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function safeParse(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeStoredGrant(raw, normalizedPlayer, displayName) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = normalizeDmCatalogPayload(raw.payload || raw);
  if (!payload) return null;
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : `grant-${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const issuedBy = typeof raw.issuedBy === 'string' && raw.issuedBy.trim()
    ? raw.issuedBy.trim()
    : 'DM';
  let createdAt = raw.createdAt;
  if (typeof createdAt === 'string' && createdAt.trim()) {
    const parsed = Number(createdAt);
    createdAt = Number.isFinite(parsed) ? parsed : now();
  } else if (!Number.isFinite(createdAt)) {
    createdAt = now();
  }
  const metadata = raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {};
  const playerName = typeof raw.player === 'string' && raw.player.trim()
    ? sanitizePlayerName(raw.player)
    : displayName || normalizedPlayer;
  return {
    id,
    player: playerName,
    normalizedPlayer,
    payload,
    issuedBy,
    createdAt,
    metadata,
  };
}

function loadPlayerGrants(normalizedPlayer) {
  if (!hasStorage()) return [];
  const key = getStorageKey(normalizedPlayer);
  if (!key) return [];
  try {
    const raw = globalThis.localStorage.getItem(key);
    const parsed = safeParse(raw);
    return parsed
      .map(item => normalizeStoredGrant(item, normalizedPlayer))
      .filter(Boolean);
  } catch (err) {
    console.error('Failed to load catalog grants', err);
    return [];
  }
}

function persistPlayerGrants(normalizedPlayer, grants) {
  if (!hasStorage()) return;
  const key = getStorageKey(normalizedPlayer);
  if (!key) return;
  try {
    if (!Array.isArray(grants) || !grants.length) {
      globalThis.localStorage.removeItem(key);
      return;
    }
    const payload = grants.map(grant => ({
      id: grant.id,
      player: grant.player,
      payload: grant.payload,
      issuedBy: grant.issuedBy,
      createdAt: grant.createdAt,
      metadata: grant.metadata,
    }));
    globalThis.localStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to persist catalog grants', err);
  }
}

const localListeners = new Map();
let broadcastChannel = null;
let cachedNames = [];
let cachedNamesFetchedAt = 0;
let namePromise = null;

function ensureBroadcastChannel() {
  if (broadcastChannel || typeof window === 'undefined') return broadcastChannel;
  if (typeof window.BroadcastChannel !== 'function') return null;
  try {
    broadcastChannel = new window.BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.addEventListener('message', event => {
      const data = event?.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'grant' && data.player && data.grant) {
        const grant = normalizeStoredGrant(data.grant, data.player);
        if (grant) notifyLocalListeners(data.player, grant);
      } else if (data.type === 'names' && Array.isArray(data.names)) {
        updateNameCache(data.names);
      }
    });
  } catch (err) {
    console.error('Failed to initialize catalog grant channel', err);
    broadcastChannel = null;
  }
  return broadcastChannel;
}

function broadcastMessage(message) {
  const channel = ensureBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch {
    /* ignore broadcast errors */
  }
}

function notifyLocalListeners(normalizedPlayer, grant) {
  if (!normalizedPlayer || !grant) return;
  const listeners = localListeners.get(normalizedPlayer);
  if (!listeners || !listeners.size) return;
  listeners.forEach(listener => {
    if (!listener || typeof listener.emit !== 'function') return;
    try {
      listener.emit(grant);
    } catch (err) {
      console.error('Catalog grant listener failed', err);
    }
  });
}

function updateNameCache(names = []) {
  if (!Array.isArray(names)) names = [];
  cachedNames = names.slice();
  cachedNamesFetchedAt = now();
}

function getCachedNames() {
  const fresh = cachedNamesFetchedAt && (now() - cachedNamesFetchedAt) < NAME_CACHE_TTL_MS;
  return fresh ? cachedNames.slice() : [];
}

function listCachedNames() {
  return cachedNames.slice();
}

async function loadPlayerNames({ force = false } = {}) {
  if (!force) {
    const cached = getCachedNames();
    if (cached.length) return cached;
  }
  if (!namePromise) {
    namePromise = (async () => {
      try {
        const { listCharacters } = await import('./characters.js');
        const names = await listCharacters();
        updateNameCache(Array.isArray(names) ? names : []);
        broadcastMessage({ type: 'names', names: cachedNames });
        return cachedNames.slice();
      } catch (err) {
        console.error('Failed to load player names for catalog grants', err);
        updateNameCache([]);
        return [];
      } finally {
        namePromise = null;
      }
    })();
  }
  return namePromise.then(list => list.slice());
}

function createListenerEntry(normalizedPlayer, callback) {
  const delivered = new Set();
  return {
    delivered,
    emit(grant) {
      const normalized = normalizeStoredGrant(grant, normalizedPlayer);
      if (!normalized) return;
      if (delivered.has(normalized.id)) return;
      delivered.add(normalized.id);
      const enriched = { ...normalized };
      callback(enriched);
    }
  };
}

function subscribeCatalogGrants(player, callback, { includeExisting = true } = {}) {
  if (typeof callback !== 'function') return () => {};
  const playerInfo = normalizePlayerKey(player);
  if (!playerInfo) {
    callback(null);
    return () => {};
  }
  const { normalized, display } = playerInfo;
  ensureBroadcastChannel();
  const listenerEntry = createListenerEntry(normalized, grant => {
    if (!grant) return;
    const withDisplay = { ...grant, player: grant.player || display };
    callback(withDisplay);
  });
  let listeners = localListeners.get(normalized);
  if (!listeners) {
    listeners = new Set();
    localListeners.set(normalized, listeners);
  }
  listeners.add(listenerEntry);

  if (includeExisting) {
    const existing = loadPlayerGrants(normalized);
    existing.forEach(grant => listenerEntry.emit(grant));
  }

  const storageHandler = event => {
    if (!event || event.key !== getStorageKey(normalized)) return;
    const updated = safeParse(event.newValue);
    updated.forEach(item => listenerEntry.emit(item));
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', storageHandler);
  }

  return () => {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('storage', storageHandler);
    }
    const group = localListeners.get(normalized);
    if (group) {
      group.delete(listenerEntry);
      if (!group.size) localListeners.delete(normalized);
    }
  };
}

function addGrantToState(list, grant) {
  if (!Array.isArray(list)) return [grant];
  const next = list.slice();
  next.push(grant);
  if (next.length > MAX_GRANTS_PER_PLAYER) {
    next.splice(0, next.length - MAX_GRANTS_PER_PLAYER);
  }
  return next;
}

function grantCatalogEntryToPlayer({ player, payload, issuedBy = 'DM', metadata = {} } = {}) {
  const playerInfo = normalizePlayerKey(player);
  if (!playerInfo) throw new Error('Player name is required');
  const normalizedPayload = normalizeDmCatalogPayload(payload);
  if (!normalizedPayload) throw new Error('Invalid catalog payload');
  const { normalized, display } = playerInfo;
  const grant = {
    id: `grant-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    player: display,
    normalizedPlayer: normalized,
    payload: normalizedPayload,
    issuedBy: typeof issuedBy === 'string' && issuedBy.trim() ? issuedBy.trim() : 'DM',
    createdAt: now(),
    metadata: metadata && typeof metadata === 'object' ? { ...metadata } : {},
  };
  const current = loadPlayerGrants(normalized);
  const next = addGrantToState(current, grant);
  persistPlayerGrants(normalized, next);
  notifyLocalListeners(normalized, grant);
  broadcastMessage({ type: 'grant', player: normalized, grant });
  return grant;
}

function acknowledgeCatalogGrant(player, grantId) {
  const playerInfo = normalizePlayerKey(player);
  if (!playerInfo || !grantId) return false;
  const { normalized } = playerInfo;
  const list = loadPlayerGrants(normalized);
  if (!list.length) return false;
  const filtered = list.filter(item => item && item.id !== grantId);
  if (filtered.length === list.length) return false;
  persistPlayerGrants(normalized, filtered);
  broadcastMessage({ type: 'grant-ack', player: normalized, id: grantId });
  return true;
}

export {
  acknowledgeCatalogGrant,
  grantCatalogEntryToPlayer,
  listCachedNames,
  loadPlayerNames,
  subscribeCatalogGrants,
};
