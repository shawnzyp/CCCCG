import { jest } from '@jest/globals';
import {
  registerPlayer,
  getPlayers,
  loginDM,
  loginPlayer,
  logoutPlayer,
  currentPlayer,
  isDM,
  editPlayerCharacter,
  savePlayerCharacter,
  loadPlayerCharacter,
  recoverPlayerPassword,
  listCharacters,
  syncPlayersFromCloud,
} from '../scripts/users.js';
import { saveLocal } from '../scripts/storage.js';

describe('user management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete global.fetch;
  });

    test('registers players and lists them alphabetically', () => {
      // Register out of order to ensure getPlayers sorts names
      expect(registerPlayer('Bob', 'b', 'pet?', 'dog')).toBe(true);
      expect(registerPlayer('Alice', 'a', 'pet?', 'cat')).toBe(true);
      expect(registerPlayer('Alice', 'c', 'pet?', 'cat')).toBe(false);
      // Should return names sorted alphabetically despite insertion order
      expect(getPlayers()).toEqual(['Alice', 'Bob']);
    });

  test('registration requires name and password', () => {
    registerPlayer('', 'pw', 'q', 'a');
    registerPlayer('Charlie', '', 'q', 'a');
    registerPlayer('Dana', 'pw', '', 'a');
    registerPlayer('Eve', 'pw', 'q', '');
    expect(getPlayers()).toEqual([]);
  });

  test('player login is case-insensitive', async () => {
    registerPlayer('Alice', 'pw', 'pet?', 'cat');
    expect(await loginPlayer('alice', 'pw')).toBe(true);
    expect(currentPlayer()).toBe('Alice');
  });

  test('registration rejects duplicate names regardless of case', () => {
    expect(registerPlayer('Eve', 'pw', 'q', 'a')).toBe(true);
    expect(registerPlayer('eve', 'pw2', 'q', 'a')).toBe(false);
  });

  test('player login and save', async () => {
    registerPlayer('Alice', 'pass', 'pet?', 'cat');
    expect(await loginPlayer('Alice', 'pass')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(10);
  });

  test('player logout clears session', async () => {
    registerPlayer('Dana', 'pw', 'pet?', 'cat');
    expect(await loginPlayer('Dana', 'pw')).toBe(true);
    logoutPlayer();
    expect(currentPlayer()).toBeNull();
  });

  test('dm login logs out current player', async () => {
    registerPlayer('Alice', 'pw', 'pet?', 'cat');
    expect(await loginPlayer('Alice', 'pw')).toBe(true);
    expect(currentPlayer()).toBe('Alice');
    expect(loginDM('Dragons22!')).toBe(true);
    expect(currentPlayer()).toBeNull();
    expect(isDM()).toBe(true);
  });

  test('failed dm login keeps current player', async () => {
    registerPlayer('Gina', 'pw', 'pet?', 'dog');
    expect(await loginPlayer('Gina', 'pw')).toBe(true);
    expect(currentPlayer()).toBe('Gina');
    expect(loginDM('wrong')).toBe(false);
    expect(currentPlayer()).toBe('Gina');
    expect(isDM()).toBe(false);
  });

  test('player login logs out dm', async () => {
    registerPlayer('Bob', 'pw', 'pet?', 'dog');
    expect(loginDM('Dragons22!')).toBe(true);
    expect(isDM()).toBe(true);
    expect(await loginPlayer('Bob', 'pw')).toBe(true);
    expect(isDM()).toBe(false);
    expect(currentPlayer()).toBe('Bob');
  });

  test('player login loads from cloud when cache is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ password: 'pw', question: 'q', answer: 'a' }),
    });
    expect(await loginPlayer('Zara', 'pw')).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('user%3AZara.json')
    );
    delete global.fetch;
  });

  test('login verifies credentials against the cloud', async () => {
    localStorage.setItem('players', JSON.stringify({ Hank: { password: 'old', question: 'q', answer: 'a' } }));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ password: 'new', question: 'q', answer: 'a' }),
    });
    expect(await loginPlayer('Hank', 'new')).toBe(true);
    delete global.fetch;
  });

  test('syncs player credentials from cloud', async () => {
    await syncPlayersFromCloud(
      async () => ['user:Bob', 'user:Alice'],
      async () => ({ password: 'pw', question: 'q', answer: 'a' })
    );
    expect(getPlayers()).toEqual(['Alice', 'Bob']);
  });

  test('dm editing', async () => {
    registerPlayer('Alice', 'pw', 'pet?', 'cat');
    expect(loginDM('Dragons22!')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    await editPlayerCharacter('Alice', { hp: 20 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(20);
  });

  test('lists characters from cloud', async () => {
    const names = await listCharacters(async () => ['Player :Bob', 'Player :Alice', 'other']);
    expect(names).toEqual(['Alice', 'Bob']);
  });

  test('merges local saves when listing characters', async () => {
    await saveLocal('Player :Eve', {});
    const names = await listCharacters(async () => ['Player :Bob']);
    expect(names).toEqual(['Bob', 'Eve']);
  });

  test('lists characters from cloud regardless of key casing', async () => {
    const names = await listCharacters(async () => ['PLAYER :Charlie', 'player :alice']);
    expect(names).toEqual(['alice', 'Charlie']);
  });

  test('lists characters with encoded cloud keys', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ 'Player%20%3ABob': {}, 'Player%20%3AAlice': {} }),
    });
    const names = await listCharacters();
    expect(names).toEqual(['Alice', 'Bob']);
  });


  test('lists characters with encoded local keys', async () => {
    const names = await listCharacters(async () => [], async () => ['Player%20%3AEve']);
    expect(names).toEqual(['Eve']);
  });

  test('lists and loads characters with percent signs in the name', async () => {
    registerPlayer('A%20B', 'pw', 'pet?', 'cat');
    expect(await loginPlayer('A%20B', 'pw')).toBe(true);
    await savePlayerCharacter('A%20B', { hp: 7 });
    const names = await listCharacters();
    expect(names).toEqual(['A%20B']);
    const data = await loadPlayerCharacter('A%20B');
    expect(data.hp).toBe(7);
  });

  test('handles corrupted player storage gracefully', () => {
    localStorage.setItem('players', '{not valid json');
    expect(getPlayers()).toEqual([]);
    expect(localStorage.getItem('players')).toBeNull();
  });

  test('handles localStorage access errors gracefully', () => {
    const spy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(getPlayers()).toEqual([]);
    spy.mockRestore();
  });

  test('save fails without login', async () => {
    registerPlayer('Bob', 'pw2', 'pet?', 'cat');
    await expect(savePlayerCharacter('Bob', {})).rejects.toThrow('Not authorized');
  });

  test('password recovery', () => {
    registerPlayer('Frank', 'pw', 'color?', 'blue');
    expect(recoverPlayerPassword('Frank', 'blue')).toBe('pw');
    expect(recoverPlayerPassword('Frank', 'red')).toBeNull();
  });
});

