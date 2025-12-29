import { claimCharacterLock } from '../scripts/claim-utils.js';

function createDb(initial = {}) {
  const store = { ...initial };
  return {
    ref(path) {
      return {
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

describe('claimCharacterLock', () => {
  test('claims when unclaimed', async () => {
    const db = createDb();
    await expect(claimCharacterLock(db, 'char-1', 'uid-1')).resolves.toBe(true);
  });

  test('rejects when claimed by another uid', async () => {
    const db = createDb({ 'characterClaims/char-1': 'uid-2' });
    await expect(claimCharacterLock(db, 'char-1', 'uid-1')).rejects.toThrow('Character already claimed');
  });
});
