import { consumeClaimToken } from '../scripts/claim-tokens.js';

function createDb(initial = {}) {
  const store = { ...initial };
  return {
    ref(path) {
      return {
        async set(value) {
          store[path] = value;
        },
        async transaction(updater) {
          const current = store[path];
          const next = updater(current);
          if (next === undefined) {
            return { committed: false, snapshot: { val: () => current } };
          }
          store[path] = next;
          return { committed: true, snapshot: { val: () => next } };
        },
      };
    },
  };
}

describe('claim tokens', () => {
  test('consumes valid token once', async () => {
    const now = Date.now();
    const token = 'token-1';
    const db = createDb({
      [`claimTokens/${token}`]: {
        characterId: 'char-1',
        sourceUid: 'source-1',
        createdAt: now,
        expiresAt: now + 10000,
        usedAt: 0,
        usedBy: '',
      },
    });
    const result = await consumeClaimToken(db, token, 'user-1');
    expect(result.usedBy).toBe('user-1');
    await expect(consumeClaimToken(db, token, 'user-2')).rejects.toThrow('Claim token invalid or expired');
  });
});
