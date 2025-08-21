import { jest } from '@jest/globals';
import {
  registerPlayer,
  getPlayers,
  loginDM,
  loginPlayer,
  logoutPlayer,
  currentPlayer,
  editPlayerCharacter,
  savePlayerCharacter,
  loadPlayerCharacter,
  recoverPlayerPassword,
} from '../scripts/users.js';

describe('user management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('registers players and lists them', () => {
    registerPlayer('Alice', 'a', 'pet?', 'cat');
    registerPlayer('Bob', 'b', 'pet?', 'dog');
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

  test('dm editing', async () => {
    registerPlayer('Alice', 'pw', 'pet?', 'cat');
    expect(loginDM('Dragons22!')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    await editPlayerCharacter('Alice', { hp: 20 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(20);
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

