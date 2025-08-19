import {
  registerPlayer,
  getPlayers,
  loginDM,
  loginPlayer,
  editPlayerCharacter,
  savePlayerCharacter,
  loadPlayerCharacter,
} from '../scripts/users.js';

describe('user management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('registers players and lists them', () => {
    registerPlayer('Alice', 'a');
    registerPlayer('Bob', 'b');
    expect(getPlayers()).toEqual(['Alice', 'Bob']);
  });

  test('player login and save', async () => {
    registerPlayer('Alice', 'pass');
    expect(loginPlayer('Alice', 'pass')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(10);
  });

  test('dm editing', async () => {
    registerPlayer('Alice', 'pw');
    expect(loginDM('Dragons22!')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    await editPlayerCharacter('Alice', { hp: 20 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(20);
  });

  test('handles corrupted player storage gracefully', () => {
    localStorage.setItem('players', '{not valid json');
    expect(getPlayers()).toEqual([]);
  });

  test('save fails without login', async () => {
    registerPlayer('Bob', 'pw2');
    await expect(savePlayerCharacter('Bob', {})).rejects.toThrow('Not authorized');
  });
});

