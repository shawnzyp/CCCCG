import { normalizeUsername, usernameToEmail } from '../scripts/auth.js';

describe('usernameToEmail', () => {
  test('converts username to synthetic email', () => {
    expect(normalizeUsername('  Hero One  ')).toBe('hero_one');
    expect(normalizeUsername('Space Cadet!')).toBe('space_cadet');
    expect(normalizeUsername('User-Name')).toBe('username');
    expect(normalizeUsername('user@name')).toBe('username');
    expect(usernameToEmail('HeroOne')).toBe('heroone@ccccg.local');
    expect(usernameToEmail('  Player 2 ')).toBe('player_2@ccccg.local');
    expect(usernameToEmail('Space Cadet!')).toBe('space_cadet@ccccg.local');
    expect(usernameToEmail('')).toBe('');
    expect(usernameToEmail('ab')).toBe('');
    expect(usernameToEmail('ThisNameIsWayTooLongForPolicy')).toBe('');
  });

  test('normalizes consistently for email mapping', () => {
    const raw = '  Player Two ';
    const normalized = normalizeUsername(raw);
    expect(normalized).toBe('player_two');
    expect(usernameToEmail(raw)).toBe(usernameToEmail(normalized));
  });

  test('create and login normalize identically', () => {
    const raw = '  User.Name ';
    const normalized = normalizeUsername(raw);
    expect(usernameToEmail(raw)).toBe(usernameToEmail(normalized));
  });
});
