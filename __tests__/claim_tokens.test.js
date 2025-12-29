import { createClaimToken, consumeClaimToken } from '../scripts/claim-tokens.js';

function createMockDb(initial = {}) {
  const store = JSON.parse(JSON.stringify(initial));
  const getAtPath = (path) => {
    const parts = path.split('/').filter(Boolean);
    return parts.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), store);
  };
  const setAtPath = (path, value) => {
    const parts = path.split('/').filter(Boolean);
    let node = store;
    while (parts.length > 1) {
      const key = parts.shift();
      if (!node[key] || typeof node[key] !== 'object') {
        node[key] = {};
      }
      node = node[key];
    }
    const leaf = parts[0];
    if (value === null || value === undefined) {
      delete node[leaf];
    } else {
      node[leaf] = value;
    }
  };
  return {
    ref(path) {
      return {
        async transaction(updater) {
          const current = getAtPath(path);
          const next = updater(current);
          if (next === undefined) {
            return { committed: false, snapshot: { val: () => current } };
          }
          setAtPath(path, next);
          return { committed: true, snapshot: { val: () => getAtPath(path) } };
        },
      };
    },
    _store: store,
  };
}

describe('claim tokens', () => {
  test('creates and consumes a claim token', async () => {
    const db = createMockDb();
    const expiresAt = Date.now() + 60_000;
    const token = await createClaimToken(db, {
      sourceUid: 'source-1',
      characterId: 'char-1',
      targetUid: 'target-1',
      expiresAt,
    });
    expect(token).toBeTruthy();

    const consumed = await consumeClaimToken(db, token, 'target-1');
    expect(consumed?.characterId).toBe('char-1');
    expect(consumed?.consumedAt).toBeGreaterThan(0);
  });

  test('rejects consumption for wrong target uid', async () => {
    const db = createMockDb({
      claimTokens: {
        'ABCD-1234-EFGH': {
          sourceUid: 'source-1',
          characterId: 'char-1',
          targetUid: 'target-1',
          expiresAt: Date.now() + 60_000,
          consumedAt: null,
        },
      },
    });
    await expect(consumeClaimToken(db, 'ABCD-1234-EFGH', 'target-2'))
      .rejects.toThrow('Claim token invalid or expired');
  });
});
