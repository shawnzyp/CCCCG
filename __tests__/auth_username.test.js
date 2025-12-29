import { usernameToEmail } from '../scripts/auth.js';

describe('usernameToEmail', () => {
  test('converts username to synthetic email', () => {
    expect(usernameToEmail('HeroOne')).toBe('heroone@ccccg.local');
    expect(usernameToEmail('  Player_2 ')).toBe('player_2@ccccg.local');
    expect(usernameToEmail('')).toBe('');
  });
});
