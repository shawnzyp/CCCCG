import { hasBootableLocalState } from '../scripts/welcome-utils.js';

describe('welcome continue gating', () => {
  test('requires a bootable local save when no auth session exists', () => {
    const storage = localStorage;
    storage.clear();
    storage.setItem('save:Hero', JSON.stringify({ meta: { name: 'Hero' } }));

    expect(hasBootableLocalState({ storage, lastSaveName: 'Hero', uid: '' })).toBe(true);
    expect(hasBootableLocalState({ storage, lastSaveName: '', uid: '' })).toBe(true);
  });

  test('detects uid-scoped saves', () => {
    const storage = localStorage;
    storage.clear();
    storage.setItem('save:user-1:CloudHero', JSON.stringify({ meta: { name: 'CloudHero' } }));

    expect(hasBootableLocalState({ storage, lastSaveName: 'CloudHero', uid: 'user-1' })).toBe(true);
  });
});
