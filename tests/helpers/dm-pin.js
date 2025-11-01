import { jest } from '@jest/globals';
import {
  configureDmCredentialEnvironment,
  clearDmCredentialCache,
  setDmCredentialPin,
  DM_CREDENTIAL_DEFAULT_USERNAME,
} from '../../scripts/dm-pin.js';

export const TEST_DM_PIN = '123123';

function createFetchResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(JSON.stringify(payload ?? null));
    },
    async text() {
      return JSON.stringify(payload ?? null);
    },
  };
}

export function createMockCredentialFetch(remoteStore = new Map()) {
  return jest.fn(async (url, options = {}) => {
    const method = typeof options.method === 'string' ? options.method.toUpperCase() : 'GET';
    if (method === 'GET') {
      const payload = {};
      remoteStore.forEach((record, username) => {
        payload[username] = { ...record };
      });
      return createFetchResponse(200, payload);
    }
    if (method === 'PUT' || method === 'PATCH') {
      const match = /dmCredentials\/(.+?)\.json(?:$|\?)/.exec(url);
      const username = match ? decodeURIComponent(match[1]) : null;
      const body = options.body ? JSON.parse(options.body) : {};
      if (!username) {
        throw new Error(`Unable to resolve credential username from URL: ${url}`);
      }
      remoteStore.set(username, { ...body });
      return createFetchResponse(200, body);
    }
    throw new Error(`Unhandled credential fetch request: ${method} ${url}`);
  });
}

export function createMockCredentialStorage(state = { value: null }) {
  return {
    async load() {
      if (!state.value) return null;
      const { updatedAt = Date.now(), credentials = {} } = state.value;
      const map = new Map();
      Object.keys(credentials).forEach(username => {
        const record = credentials[username];
        map.set(username, { ...record, username, source: 'cache' });
      });
      return { updatedAt, credentials: map };
    },
    async save(nextState) {
      const snapshot = {
        updatedAt: nextState?.updatedAt ?? Date.now(),
        credentials: {},
      };
      if (nextState?.credentials instanceof Map) {
        nextState.credentials.forEach((record, username) => {
          snapshot.credentials[username] = {
            hash: record.hash,
            salt: record.salt,
            iterations: record.iterations,
            keyLength: record.keyLength,
            digest: record.digest,
            updatedAt: record.updatedAt,
          };
        });
      }
      state.value = snapshot;
    },
    async clear() {
      state.value = null;
    },
    get snapshot() {
      return state.value;
    },
  };
}

export async function setupTestDmCredentials({
  pin = TEST_DM_PIN,
  username = DM_CREDENTIAL_DEFAULT_USERNAME,
} = {}) {
  const remoteStore = new Map();
  const storageState = { value: null };
  const fetchMock = createMockCredentialFetch(remoteStore);
  const storageAdapter = createMockCredentialStorage(storageState);
  configureDmCredentialEnvironment({ fetch: fetchMock, storage: storageAdapter, bootstrap: null });
  clearDmCredentialCache();
  if (typeof pin === 'string' && pin) {
    await setDmCredentialPin({ username, pin, allowOverwrite: true });
  }
  return { fetchMock, remoteStore, storageAdapter };
}

export async function ensureTestDmPin(pin = TEST_DM_PIN, {
  username = DM_CREDENTIAL_DEFAULT_USERNAME,
} = {}) {
  if (typeof pin !== 'string' || !pin) {
    throw new Error('A non-empty PIN is required');
  }
  await setDmCredentialPin({ username, pin, allowOverwrite: true });
}
