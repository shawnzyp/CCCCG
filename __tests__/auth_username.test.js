import { normalizeUsername, usernameToEmail } from '../scripts/auth.js';

describe('usernameToEmail', () => {
  test('converts username to synthetic email', () => {
    expect(normalizeUsername('  Hero One  ')).toBe('hero_one');
    expect(normalizeUsername('Space Cadet!')).toBe('space_cadet');
    expect(usernameToEmail('HeroOne')).toBe('heroone@ccccg.local');
    expect(usernameToEmail('  Player 2 ')).toBe('player_2@ccccg.local');
    expect(usernameToEmail('Space Cadet!')).toBe('space_cadet@ccccg.local');
    expect(usernameToEmail('')).toBe('');
    expect(usernameToEmail('ab')).toBe('');
    expect(usernameToEmail('ThisNameIsWayTooLongForPolicy')).toBe('');
  });
});
