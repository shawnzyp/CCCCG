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

  test('registration rejects whitespace-only fields', () => {
    registerPlayer('   ', 'pw', 'q', 'a');
    registerPlayer('Frank', '   ', 'q', 'a');
    registerPlayer('Grace', 'pw', '   ', 'a');
    registerPlayer('Heidi', 'pw', 'q', '   ');
    expect(getPlayers()).toEqual([]);
  });

  test('player login and save', async () => {
    registerPlayer('Alice', 'pass', 'pet?', 'cat');
    expect(loginPlayer('Alice', 'pass')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(10);
  });

  test('player logout clears session', () => {
    registerPlayer('Dana', 'pw', 'pet?', 'cat');
    expect(loginPlayer('Dana', 'pw')).toBe(true);
    logoutPlayer();
    expect(currentPlayer()).toBeNull();
  });

  test('dm login logs out current player', () => {
    registerPlayer('Alice', 'pw', 'pet?', 'cat');
    expect(loginPlayer('Alice', 'pw')).toBe(true);
    expect(currentPlayer()).toBe('Alice');
    expect(loginDM('Dragons22!')).toBe(true);
    expect(currentPlayer()).toBeNull();
    expect(isDM()).toBe(true);
  });

  test('failed dm login keeps current player', () => {
    registerPlayer('Gina', 'pw', 'pet?', 'dog');
    expect(loginPlayer('Gina', 'pw')).toBe(true);
    expect(currentPlayer()).toBe('Gina');
    expect(loginDM('wrong')).toBe(false);
    expect(currentPlayer()).toBe('Gina');
    expect(isDM()).toBe(false);
  });

  test('player login logs out dm', () => {
    registerPlayer('Bob', 'pw', 'pet?', 'dog');
    expect(loginDM('Dragons22!')).toBe(true);
    expect(isDM()).toBe(true);
    expect(loginPlayer('Bob', 'pw')).toBe(true);
    expect(isDM()).toBe(false);
    expect(currentPlayer()).toBe('Bob');
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
    const names = await listCharacters(async () => ['player:Bob', 'player:Alice', 'other']);
    expect(names).toEqual(['Alice', 'Bob']);
  });

  test('merges local saves when listing characters', async () => {
    await saveLocal('player:Eve', {});
    const names = await listCharacters(async () => ['player:Bob']);
    expect(names).toEqual(['Bob', 'Eve']);
  });

  test('lists characters from cloud regardless of key casing', async () => {
    const names = await listCharacters(async () => ['PLAYER:Charlie', 'player:alice']);
    expect(names).toEqual(['alice', 'Charlie']);
  });

  test('lists characters with encoded cloud keys', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ 'player%3ABob': {}, 'player%3AAlice': {} }),
    });
    const names = await listCharacters();
    expect(names).toEqual(['Alice', 'Bob']);
  });


  test('lists characters with encoded local keys', async () => {
    const names = await listCharacters(async () => [], async () => ['player%3AEve']);
    expect(names).toEqual(['Eve']);
  });

  test('lists and loads characters with percent signs in the name', async () => {
    registerPlayer('A%20B', 'pw', 'pet?', 'cat');
    expect(loginPlayer('A%20B', 'pw')).toBe(true);
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

