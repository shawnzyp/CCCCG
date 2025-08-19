import {
  registerPlayer,
  getPlayers,
  registerDM,
  loginDM,
  editPlayerCharacter,
  savePlayerCharacter,
  loadPlayerCharacter,
} from '../scripts/users.js';

describe('user management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('registers players and lists them', () => {
    registerPlayer('Alice');
    registerPlayer('Bob');
    expect(getPlayers()).toEqual(['Alice', 'Bob']);
  });

  test('dm registration and editing', async () => {
    registerPlayer('Alice');
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

