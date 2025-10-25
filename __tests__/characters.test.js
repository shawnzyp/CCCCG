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
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null }) // syncPin during save
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null }) // saveCloud
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null }) // history save
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) }) // history list
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Hero: { hp: 10 } }),
      }) // listCloudSaves
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null }) // syncPin during load
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hp: 10 }),
      }); // loadCloud

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
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  test('loadCharacter migrates legacy power entries', async () => {
    const legacyData = {
      powers: [
        {
          name: 'Arc Burst',
          effect: 'Hurls a blazing bolt that deals 3d6 fire damage in a 60 ft line. Targets make a DEX save for half.',
          sp: '3',
          save: 'DEX half',
          range: '60 ft line',
        },
      ],
      powerSettings: {
        casterSaveAbility: 'DEX',
        dcFormula: 'Simple',
        proficiencyBonus: 0,
        abilityMods: { STR: 0, DEX: 3, CON: 0, INT: 0, WIS: 0, CHA: 0 },
      },
    };
    localStorage.setItem('save:Hero', JSON.stringify(legacyData));
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const { loadCharacter } = await import('../scripts/characters.js');
    const data = await loadCharacter('Hero', { bypassPin: true });

    expect(data.powers).toHaveLength(1);
    const power = data.powers[0];
    expect(power).toMatchObject({
      name: 'Arc Burst',
      shape: 'Line',
      range: '60 ft',
      effectTag: 'Damage',
      intensity: 'Core',
      requiresSave: true,
      saveAbilityTarget: 'DEX',
    });
    expect(power.damage).toEqual({ dice: '3d6', type: 'Fire', onSave: 'Half' });
    expect(power.rulesText).toContain('60 ft Line');
    expect(power.rulesText).toContain('Cost:');
    expect(power.rulesText).toContain('DEX Save DC');

    const stored = JSON.parse(localStorage.getItem('save:Hero'));
    expect(stored.powers).toHaveLength(1);
    expect(stored.powers[0]).toMatchObject({
      id: power.id,
      name: 'Arc Burst',
      shape: 'Line',
      range: '60 ft',
      spCost: 3,
      requiresSave: true,
      saveAbilityTarget: 'DEX',
    });
    expect(stored.powers[0].rulesText).toBe(power.rulesText);
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
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hp: 20 }),
      });

    const { listBackups, loadBackup } = await import('../scripts/characters.js');

    const list = await listBackups('Hero');
    expect(list).toEqual([
      { ts: ts3, type: 'manual' },
      { ts: ts2, type: 'manual' },
      { ts: ts1, type: 'manual' },
    ]);

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
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Specter: { 2: {} } }),
      });

    const { listRecoverableCharacters } = await import('../scripts/characters.js');

    const names = await listRecoverableCharacters();
    expect(names).toEqual(['Ghost', 'Hero', 'Specter']);
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

  test('auto backup saves without prompting for pin', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { subscribe } = await import('../scripts/event-bus.js');
    const { saveAutoBackup, setCurrentCharacter } = await import('../scripts/characters.js');

    setCurrentCharacter('Hero');
    const listener = jest.fn();
    const unsubscribe = subscribe('character-autosaved', listener);

    const ts = await saveAutoBackup({ hp: 12 });

    expect(typeof ts).toBe('number');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.name).toBe('Hero');

    unsubscribe();
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


