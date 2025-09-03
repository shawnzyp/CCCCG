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

