import { jest } from '@jest/globals';
import fs from 'fs';

describe('character storage', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('backs up to cloud and restores after local wipe', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Hero: { hp: 10 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hp: 10 }),
      });

    const {
      setCurrentCharacter,
      saveCharacter,
      loadCharacter,
      listCharacters,
    } = await import('../scripts/characters.js');

    setCurrentCharacter('Hero');
    await saveCharacter({ hp: 10 });
    localStorage.clear();

    expect(await listCharacters()).toEqual(['Hero']);
    const data = await loadCharacter('Hero');
    expect(data).toEqual({ hp: 10 });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  test('lists backups and loads a selected one', async () => {
    const ts1 = 1, ts2 = 2, ts3 = 3;
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ [ts1]: {}, [ts2]: {}, [ts3]: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hp: 20 }),
      });

    const { listBackups, loadBackup } = await import('../scripts/characters.js');

    const list = await listBackups('Hero');
    expect(list).toEqual([{ ts: ts3 }, { ts: ts2 }, { ts: ts1 }]);

    const data = await loadBackup('Hero', ts2);
    expect(data).toEqual({ hp: 20 });
  });

  test('renames legacy Player :Shawn character to DM', async () => {
    localStorage.setItem('save:Player :Shawn', JSON.stringify({ hp: 5 }));
    localStorage.setItem('last-save', 'Player :Shawn');
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => null });
    window.dmRequireLogin = jest.fn().mockResolvedValue(true);

    const { listCharacters, loadCharacter } = await import('../scripts/characters.js');

    expect(localStorage.getItem('save:Player :Shawn')).toBeNull();
    expect(localStorage.getItem('save:DM')).toBe(JSON.stringify({ hp: 5 }));
    expect(localStorage.getItem('last-save')).toBe('DM');

    const chars = await listCharacters();
    expect(chars).toContain('DM');

    const data = await loadCharacter('DM');
    expect(data).toEqual({ hp: 5 });

    delete window.dmRequireLogin;
  });
});

const keyPath = 'serviceAccountKey.json';
const hasCredentials = fs.existsSync(keyPath);
const testOrSkip = hasCredentials ? test : test.skip;

beforeAll(async () => {
  if (!hasCredentials) return;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  if (typeof global.fetch !== 'function') {
    global.fetch = (await import('node-fetch')).default;
  }
});

testOrSkip('backs up to live Firebase and restores after local wipe', async () => {
  jest.resetModules();
  const {
    setCurrentCharacter,
    saveCharacter,
    loadCharacter,
    listCharacters,
    deleteCharacter,
  } = await import('../scripts/characters.js');

  const name = `HeroLive${Date.now()}`;
  const payload = { hp: 12 };

  try {
    setCurrentCharacter(name);
    await saveCharacter(payload);
    localStorage.clear();

    const chars = await listCharacters();
    expect(chars).toContain(name);

    const data = await loadCharacter(name);
    expect(data).toEqual(payload);

    await deleteCharacter(name);
  } catch (e) {
    if (e?.code === 'ENETUNREACH') {
      console.warn(
        'Skipping live character test due to network unavailability:',
        e.message,
      );
      return;
    }
    throw e;
  }
});


