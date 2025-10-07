import fs from 'fs';
import path from 'path';

describe('asset manifest runtime coverage', () => {
  const manifestPath = path.join(process.cwd(), 'asset-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const assetSet = new Set(manifest.assets);

  test('has a stable cache version and timestamp', () => {
    expect(manifest.version).toMatch(/^cccg-cache-[0-9a-f]{16}$/);
    expect(() => new Date(manifest.generatedAt).toISOString()).not.toThrow();
  });

  test('includes all critical runtime assets', () => {
    const requiredAssets = [
      './',
      './index.html',
      './sw.js',
      './styles/main.css',
      './scripts/main.js',
      './scripts/characters.js',
      './scripts/dm.js',
      './scripts/storage.js',
      './scripts/pin.js',
      './shard-of-many-fates.js',
      './data/gear-catalog.json',
      './CatalystCore_Master_Book.csv',
      './CatalystCore_Items_Prices.csv',
      './News.txt',
      './images/logo.png',
    ];

    for (const asset of requiredAssets) {
      expect(assetSet.has(asset)).toBe(true);
    }
  });

  test('does not cache development metadata files', () => {
    expect(assetSet.has('./package.json')).toBe(false);
    expect(assetSet.has('./package-lock.json')).toBe(false);
  });

  test('manifest asset list is duplicate-free', () => {
    expect(manifest.assets.length).toBe(assetSet.size);
  });
});
