import { getProfileDocPath, resolveDmFromClaims } from '../scripts/auth.js';

describe('DM auth helpers', () => {
  test('profile doc path uses users/{uid}/profile/main', () => {
    expect(getProfileDocPath('abc123')).toBe('users/abc123/profile/main');
  });

  test('resolves DM privilege from token claims', () => {
    expect(resolveDmFromClaims({ claims: { admin: true } })).toBe(true);
    expect(resolveDmFromClaims({ claims: { isDm: true } })).toBe(true);
    expect(resolveDmFromClaims({ claims: { token: { admin: true } } })).toBe(true);
    expect(resolveDmFromClaims({ claims: { admin: false, isDm: false } })).toBe(false);
  });
});
