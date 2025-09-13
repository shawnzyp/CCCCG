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

  test('recovery list includes names from backups', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Hero: {} }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Ghost: { 1: {} } }),
      });

    const { listRecoverableCharacters } = await import('../scripts/characters.js');

    const names = await listRecoverableCharacters();
    expect(names).toEqual(['Ghost', 'Hero']);
  });

  for (const legacyName of ['Shawn', 'Player :Shawn', 'DM']) {
    test(`renames legacy ${legacyName} character to The DM`, async () => {
      localStorage.setItem(`save:${legacyName}`, JSON.stringify({ hp: 5 }));
      localStorage.setItem('last-save', legacyName);
      fetch.mockResolvedValue({ ok: true, status: 200, json: async () => null });

      const { listCharacters, loadCharacter } = await import('../scripts/characters.js');

      expect(localStorage.getItem(`save:${legacyName}`)).toBeNull();
      expect(localStorage.getItem('save:The DM')).toBe(JSON.stringify({ hp: 5 }));
      expect(localStorage.getItem('last-save')).toBe('The DM');

      const data = await loadCharacter('The DM');
      expect(data).toEqual({ hp: 5 });
    });
  }

  test('cannot delete The DM', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => null });
    const { setCurrentCharacter, saveCharacter, deleteCharacter } = await import('../scripts/characters.js');
    setCurrentCharacter('The DM');
    await saveCharacter({ hp: 5 }, 'The DM');
    await expect(deleteCharacter('The DM')).rejects.toThrow('Cannot delete The DM');
  });

  test('saving The DM does not require DM login', async () => {
    window.dmRequireLogin = jest.fn().mockResolvedValue(true);
    const { setCurrentCharacter, saveCharacter } = await import('../scripts/characters.js');
    setCurrentCharacter('The DM');
    await saveCharacter({ hp: 7 });
    expect(window.dmRequireLogin).not.toHaveBeenCalled();
    expect(localStorage.getItem('save:The DM')).toBe(JSON.stringify({ hp: 7 }));
    delete window.dmRequireLogin;
  });

  test('saving another character does not require DM login', async () => {
    window.dmRequireLogin = jest.fn().mockResolvedValue(true);
    const { setCurrentCharacter, saveCharacter } = await import('../scripts/characters.js');
    setCurrentCharacter('Hero');
    await saveCharacter({ hp: 3 });
    expect(window.dmRequireLogin).not.toHaveBeenCalled();
    expect(localStorage.getItem('save:Hero')).toBe(JSON.stringify({ hp: 3 }));
    delete window.dmRequireLogin;
  });

  test('loading a pinned character can bypass pin prompt', async () => {
    const { setPin } = await import('../scripts/pin.js');
    const { loadCharacter } = await import('../scripts/characters.js');
    localStorage.setItem('save:Hero', JSON.stringify({ hp: 10 }));
    await setPin('Hero', '1234');
    window.pinPrompt = jest.fn().mockResolvedValue('1234');
    const data = await loadCharacter('Hero', { bypassPin: true });
    expect(window.pinPrompt).not.toHaveBeenCalled();
    expect(data).toEqual({ hp: 10 });
    delete window.pinPrompt;
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


