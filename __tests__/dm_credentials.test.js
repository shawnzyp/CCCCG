import { jest } from '@jest/globals';

describe('dm credential storage', () => {
  const DM_USERNAME = 'TestDM';
  const INITIAL_PIN = '2468';
  const UPDATED_PIN = '1357';

  let fetchMock;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(async () => {
    try {
      const mod = await import('../scripts/dm-pin.js');
      mod.resetDmCredentialCache();
    } catch {
      /* ignore */
    }
    delete global.fetch;
  });

  test('creates and verifies DM credentials with cached hash', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const {
      upsertDmCredentialPin,
      verifyDmCredential,
      getDmCredential,
    } = await import('../scripts/dm-pin.js');

    const record = await upsertDmCredentialPin(DM_USERNAME, INITIAL_PIN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/dmCredentials\/TestDM\.json$/);
    expect(options?.method).toBe('PUT');
    expect(typeof JSON.parse(options?.body || '{}').hash).toBe('string');
    expect(JSON.parse(options?.body || '{}').hash).not.toBe(INITIAL_PIN);

    const cached = await getDmCredential(DM_USERNAME);
    expect(cached).toEqual(expect.objectContaining({ username: DM_USERNAME, hash: record.hash }));
    expect(await verifyDmCredential(DM_USERNAME, INITIAL_PIN)).toBe(true);
    expect(await verifyDmCredential(DM_USERNAME, UPDATED_PIN)).toBe(false);
  });

  test('force refresh loads cloud state for cross-device sync', async () => {
    const {
      upsertDmCredentialPin,
      deriveDmPinHash,
      loadDmCredentialRecords,
      getDmCredential,
      verifyDmCredential,
      resetDmCredentialCache,
    } = await import('../scripts/dm-pin.js');

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await upsertDmCredentialPin(DM_USERNAME, INITIAL_PIN);

    const newSalt = 'c2FsdC1yZXNl';
    const newRecord = {
      hash: await deriveDmPinHash(UPDATED_PIN, {
        salt: newSalt,
        iterations: 120000,
        keyLength: 32,
        digest: 'SHA-256',
      }),
      salt: newSalt,
      iterations: 120000,
      keyLength: 32,
      digest: 'SHA-256',
      updatedAt: Date.now() + 1000,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        [DM_USERNAME]: newRecord,
      }),
    });

    resetDmCredentialCache();
    localStorage.clear();

    const records = await loadDmCredentialRecords({ forceRefresh: true });
    expect(records.get(DM_USERNAME)).toEqual(expect.objectContaining({ hash: newRecord.hash }));

    const refreshed = await getDmCredential(DM_USERNAME);
    expect(refreshed?.salt).toBe(newSalt);
    expect(await verifyDmCredential(DM_USERNAME, UPDATED_PIN)).toBe(true);
    expect(await verifyDmCredential(DM_USERNAME, INITIAL_PIN)).toBe(false);
  });

  test('updates credential writes through to cache and cloud', async () => {
    const {
      upsertDmCredentialPin,
      verifyDmCredential,
      getDmCredential,
    } = await import('../scripts/dm-pin.js');

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await upsertDmCredentialPin(DM_USERNAME, INITIAL_PIN);

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await upsertDmCredentialPin(DM_USERNAME, UPDATED_PIN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const cached = await getDmCredential(DM_USERNAME);
    expect(cached?.hash).toBeDefined();
    expect(await verifyDmCredential(DM_USERNAME, UPDATED_PIN)).toBe(true);
  });
});
