import {
  registerPlayer,
  getPlayers,
  registerDM,
  loginDM,
  loginPlayer,
  currentPlayer,
  editPlayerCharacter,
  savePlayerCharacter,
  loadPlayerCharacter,
} from '../scripts/users.js';

describe('user management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('registers players with passwords and login', () => {
    registerPlayer('Alice', 'pw1');
    registerPlayer('Bob', 'pw2');
    expect(getPlayers()).toEqual([
      { name: 'Alice', password: 'pw1' },
      { name: 'Bob', password: 'pw2' },
    ]);
    expect(loginPlayer('Alice', 'pw1')).toBe(true);
    expect(currentPlayer()).toBe('Alice');
  });

  test('dm registration and editing', async () => {
    registerPlayer('Alice', 'pw');
    registerDM('secret');
    expect(loginDM('secret')).toBe(true);
    await savePlayerCharacter('Alice', { hp: 10 });
    await editPlayerCharacter('Alice', { hp: 20 });
    const data = await loadPlayerCharacter('Alice');
    expect(data.hp).toBe(20);
  });

  test('edit fails without dm', () => {
    expect(() => editPlayerCharacter('Bob', {})).toThrow('Not authorized');
  });
});

