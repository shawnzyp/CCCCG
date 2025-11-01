import { jest } from '@jest/globals';
import {
  configureDmCredentialEnvironment,
  clearDmCredentialCache,
  getDmCredentialRecord,
  verifyDmCredentialPin,
  setDmCredentialPin,
  refreshDmCredentialCache,
  DM_CREDENTIAL_DEFAULT_USERNAME,
} from '../scripts/dm-pin.js';
import {
  createMockCredentialFetch,
  createMockCredentialStorage,
} from '../tests/helpers/dm-pin.js';

describe('DM credential store', () => {
  afterEach(() => {
    clearDmCredentialCache();
  });

  test('creates hashed credentials and writes them to the remote store', async () => {
    const remoteStore = new Map();
    const storageAdapter = createMockCredentialStorage();
    const fetchMock = createMockCredentialFetch(remoteStore);
    configureDmCredentialEnvironment({ fetch: fetchMock, storage: storageAdapter, bootstrap: null });
    clearDmCredentialCache();

    const record = await setDmCredentialPin({ username: 'alpha', pin: '4321' });

    expect(record).toMatchObject({
      username: 'alpha',
      iterations: 120000,
      keyLength: 32,
      digest: 'SHA-256',
    });
    expect(typeof record.hash).toBe('string');
    expect(record.hash).not.toBe('4321');
    expect(typeof record.salt).toBe('string');

    const remoteRecord = remoteStore.get('alpha');
    expect(remoteRecord).toBeTruthy();
    expect(remoteRecord.hash).toBe(record.hash);
    expect(remoteRecord.salt).toBe(record.salt);

    const cached = await getDmCredentialRecord('alpha');
    expect(cached?.hash).toBe(record.hash);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('verifies hashed credentials and rejects incorrect pins', async () => {
    const remoteStore = new Map();
    const storageAdapter = createMockCredentialStorage();
    const fetchMock = createMockCredentialFetch(remoteStore);
    configureDmCredentialEnvironment({ fetch: fetchMock, storage: storageAdapter, bootstrap: null });
    clearDmCredentialCache();

    await setDmCredentialPin({ username: DM_CREDENTIAL_DEFAULT_USERNAME, pin: '2468' });

    await expect(
      verifyDmCredentialPin({ username: DM_CREDENTIAL_DEFAULT_USERNAME, pin: '2468' }),
    ).resolves.toBe(true);
    await expect(
      verifyDmCredentialPin({ username: DM_CREDENTIAL_DEFAULT_USERNAME, pin: '1357' }),
    ).resolves.toBe(false);

    // Subsequent verifications use the cached record without fetching again.
    fetchMock.mockClear();
    await expect(
      verifyDmCredentialPin({ username: DM_CREDENTIAL_DEFAULT_USERNAME, pin: '2468' }),
    ).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('refreshDmCredentialCache synchronizes remote updates', async () => {
    const remoteStore = new Map();
    const storageAdapter = createMockCredentialStorage();
    const fetchMock = createMockCredentialFetch(remoteStore);
    configureDmCredentialEnvironment({ fetch: fetchMock, storage: storageAdapter, bootstrap: null });
    clearDmCredentialCache();

    await setDmCredentialPin({ username: 'omega', pin: '1111' });
    await expect(
      verifyDmCredentialPin({ username: 'omega', pin: '1111' }),
    ).resolves.toBe(true);

    const staleRecord = await getDmCredentialRecord('omega');
    expect(staleRecord?.hash).toBeDefined();

    const cryptoModule = await import('crypto');
    const saltBytes = cryptoModule.randomBytes(16);
    const salt = saltBytes.toString('base64');
    const hash = cryptoModule.pbkdf2Sync('2222', saltBytes, 120000, 32, 'sha256').toString('base64');
    remoteStore.set('omega', {
      hash,
      salt,
      iterations: 120000,
      keyLength: 32,
      digest: 'SHA-256',
      updatedAt: Date.now(),
    });

    await expect(
      verifyDmCredentialPin({ username: 'omega', pin: '1111' }),
    ).resolves.toBe(true);
    await expect(
      verifyDmCredentialPin({ username: 'omega', pin: '2222' }),
    ).resolves.toBe(false);

    await refreshDmCredentialCache();

    await expect(
      verifyDmCredentialPin({ username: 'omega', pin: '2222' }),
    ).resolves.toBe(true);
    await expect(
      verifyDmCredentialPin({ username: 'omega', pin: '1111' }),
    ).resolves.toBe(false);

    const updated = await getDmCredentialRecord('omega');
    expect(updated?.hash).toBe(hash);
  });
});
