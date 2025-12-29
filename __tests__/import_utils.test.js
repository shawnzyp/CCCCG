import { buildImportedCopyName } from '../scripts/import-utils.js';

describe('buildImportedCopyName', () => {
  test('returns base name when unique', () => {
    expect(buildImportedCopyName('Nova', ['Echo'])).toBe('Nova');
  });

  test('adds imported suffix when name exists', () => {
    expect(buildImportedCopyName('Nova', ['Nova'])).toBe('Nova (Imported 2)');
  });

  test('increments suffix until unique', () => {
    const existing = ['Nova', 'Nova (Imported 2)', 'Nova (Imported 3)'];
    expect(buildImportedCopyName('Nova', existing)).toBe('Nova (Imported 4)');
  });

  test('matches case-insensitively', () => {
    const existing = ['nova'];
    expect(buildImportedCopyName('Nova', existing)).toBe('Nova (Imported 2)');
  });
});
