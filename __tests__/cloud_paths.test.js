import { buildUserCharacterPath, buildUserCharacterIndexPath, buildUserAutosaveIndexPath } from '../scripts/storage.js';

describe('cloud paths', () => {
  test('builds user character paths with uid and characterId', () => {
    expect(buildUserCharacterPath('user-1', 'char-1'))
      .toBe('characters/user-1/char-1');
    expect(buildUserCharacterIndexPath('user-1', 'char-1'))
      .toBe('users/user-1/charactersIndex/char-1');
    expect(buildUserAutosaveIndexPath('user-1', 'char-1'))
      .toBe('users/user-1/autosaves/char-1');
  });
});
