import {
  normalizeDmCatalogPayload,
  makeDmPayloadKey,
  buildDmEntryFromPayload,
  buildDmPowerPresetFromPayload,
} from './catalog-utils.js';

const STORAGE_KEY = 'cc:dm-catalog-payloads';
const BROADCAST_CHANNEL_NAME = 'cc:dm-catalog-sync';

function hasStorage() {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function normalizePayloadList(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(item => normalizeDmCatalogPayload(item))
    .filter(Boolean);
}

function loadLocalPayloads() {
  if (!hasStorage()) return [];
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizePayloadList(parsed);
  } catch {
    return [];
  }
}

function saveLocalPayloads(list = []) {
  if (!hasStorage()) return;
  try {
    if (!list.length) {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    /* ignore persistence failures */
  }
}

function mergePayloads(serverList = [], localList = []) {
  const map = new Map();
  const add = (list = []) => {
    list.forEach(payload => {
      if (!payload) return;
      const key = makeDmPayloadKey(payload);
      if (!key) return;
      map.set(key, payload);
    });
  };
  add(serverList);
  add(localList);
  return Array.from(map.values());
}

function computeState(server = [], local = []) {
  const payloads = mergePayloads(server, local);
  const catalogEntries = [];
  const powerPresets = [];
  payloads.forEach(payload => {
    const entry = buildDmEntryFromPayload(payload);
    if (entry) catalogEntries.push(entry);
    const preset = buildDmPowerPresetFromPayload(payload);
    if (preset) powerPresets.push(preset);
  });
  return { payloads, catalogEntries, powerPresets };
}

let serverPayloads = [];
let localPayloads = loadLocalPayloads();
let cachedState = computeState(serverPayloads, localPayloads);
const subscribers = new Set();
let broadcastChannel = null;

function refreshState() {
  cachedState = computeState(serverPayloads, localPayloads);
  return cachedState;
}

function getDmCatalogState() {
  if (!cachedState) {
    cachedState = computeState(serverPayloads, localPayloads);
  }
  return cachedState;
}

function notifySubscribers() {
  const state = getDmCatalogState();
  subscribers.forEach(listener => {
    try {
      listener(state);
    } catch (err) {
      console.error('DM catalog subscriber failed', err);
    }
  });
}

function broadcastUpdate() {
  if (!broadcastChannel) return;
  try {
    broadcastChannel.postMessage({ type: 'refresh' });
  } catch {
    /* ignore broadcast errors */
  }
}

function setServerDmCatalogPayloads(payloads = []) {
  serverPayloads = normalizePayloadList(payloads);
  refreshState();
  notifySubscribers();
  return cachedState;
}

function storeDmCatalogPayload(payload) {
  const normalized = normalizeDmCatalogPayload(payload);
  if (!normalized) return getDmCatalogState();
  const key = makeDmPayloadKey(normalized);
  if (!key) return getDmCatalogState();
  const index = localPayloads.findIndex(item => makeDmPayloadKey(item) === key);
  if (index >= 0) {
    localPayloads[index] = { ...localPayloads[index], ...normalized };
  } else {
    localPayloads.push(normalized);
  }
  saveLocalPayloads(localPayloads);
  refreshState();
  notifySubscribers();
  broadcastUpdate();
  return cachedState;
}

function clearLocalDmCatalog() {
  localPayloads = [];
  saveLocalPayloads(localPayloads);
  refreshState();
  notifySubscribers();
  broadcastUpdate();
  return cachedState;
}

function subscribeDmCatalog(listener) {
  if (typeof listener !== 'function') return () => {};
  subscribers.add(listener);
  try {
    listener(getDmCatalogState());
  } catch (err) {
    console.error('DM catalog subscriber failed', err);
  }
  return () => {
    subscribers.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  if (typeof window.BroadcastChannel === 'function') {
    try {
      broadcastChannel = new window.BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.addEventListener('message', event => {
        if (!event || !event.data) return;
        if (event.data.type === 'refresh') {
          localPayloads = loadLocalPayloads();
          refreshState();
          notifySubscribers();
        }
      });
    } catch {
      broadcastChannel = null;
    }
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', event => {
      if (event && event.key === STORAGE_KEY) {
        localPayloads = loadLocalPayloads();
        refreshState();
        notifySubscribers();
      }
    });
  }
}

export {
  clearLocalDmCatalog,
  getDmCatalogState,
  setServerDmCatalogPayloads,
  storeDmCatalogPayload,
  subscribeDmCatalog,
};
