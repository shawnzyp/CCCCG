import { claimUsernameTransaction } from '../scripts/auth.js';

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

describe('claimUsernameTransaction', () => {
  test('claims username when unassigned', async () => {
    const db = createDb();
    await expect(claimUsernameTransaction(db, 'hero', 'uid-1')).resolves.toBe(true);
  });

  test('rejects when username is taken by another uid', async () => {
    const db = createDb({ 'usernames/hero': 'uid-2' });
    await expect(claimUsernameTransaction(db, 'hero', 'uid-1')).rejects.toThrow('Username already taken');
  });
});
