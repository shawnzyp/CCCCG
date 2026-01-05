import { shouldToastCloudUpdate } from '../scripts/characters.js';
import { buildUserCharacterPath } from '../scripts/storage.js';

describe('cloud update toast dedupe', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('toasts only when updatedAt increases', () => {
    localStorage.setItem('cc:cloud-update-toast:char-1', '1000');

    expect(shouldToastCloudUpdate('char-1', 900)).toBe(false);
    expect(shouldToastCloudUpdate('char-1', 1000)).toBe(false);
    expect(shouldToastCloudUpdate('char-1', 1100)).toBe(true);
  });
});

describe('cloud character paths', () => {
  test('builds uid + characterId paths', () => {
    const path = buildUserCharacterPath('user-123', 'char-456');
    expect(path).toContain('characters/user-123/char-456');
  });

  test('returns empty path with missing data', () => {
    expect(buildUserCharacterPath('', 'char-456')).toBe('');
    expect(buildUserCharacterPath('user-123', '')).toBe('');
  });
});
