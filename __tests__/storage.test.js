import { saveLocal, loadLocal, deleteSave, listLocalSaves } from '../scripts/storage.js';

describe('saveLocal/loadLocal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('saves data and loads it back', async () => {
    const payload = { foo: 'bar', num: 42 };
    await saveLocal('test', payload);
    const loaded = await loadLocal('test');
    expect(loaded).toEqual(payload);
  });

  test('deletes saved data', async () => {
    const payload = { foo: 'baz' };
    await saveLocal('remove', payload);
    await deleteSave('remove');
    await expect(loadLocal('remove')).rejects.toThrow('No save found');
    expect(localStorage.getItem('save:remove')).toBeNull();
    expect(localStorage.getItem('last-save')).toBeNull();
  });

  test('lists local saves', async () => {
    await saveLocal('Player :Alpha', {});
    await saveLocal('Player :Beta', {});
    expect(listLocalSaves()).toEqual(['Player :Alpha', 'Player :Beta']);
  });
});

