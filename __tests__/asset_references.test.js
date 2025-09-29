import fs from 'fs';
import path from 'path';

describe('static asset references', () => {
  const repoRoot = process.cwd();

  function assertAssetsExist(assets, context) {
    const missing = [];
    for (const asset of assets) {
      const filesystemPath = path.join(repoRoot, asset);
      if (!fs.existsSync(filesystemPath)) {
        missing.push(asset);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Missing assets referenced in ${context}:\n${missing.join('\n')}`);
    }
  }

  test('all index.html image sources resolve to files', () => {
    const htmlPath = path.join(repoRoot, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const assets = new Set();
    const htmlAssetRegex = /\b(?:src|data-src|poster)=['"](images\/[^'"\s]+\.(?:png|svg|mp4|webp|jpg|jpeg|gif))['"]/gi;
    let match;
    while ((match = htmlAssetRegex.exec(html)) !== null) {
      assets.add(match[1]);
    }
    assertAssetsExist(assets, 'index.html');
  });

  test('all stylesheet url() image references resolve to files', () => {
    const cssPath = path.join(repoRoot, 'styles', 'main.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const assets = new Set();
    const cssAssetRegex = /url\((?:'|")?(\.\.?\/[^")']+)(?:'|")?\)/gi;
    let match;
    while ((match = cssAssetRegex.exec(css)) !== null) {
      const relativeReference = match[1];
      if (!relativeReference.includes('images/')) continue;
      const normalized = path
        .normalize(path.join('styles', relativeReference))
        .replace(/^[.\\/]+/, '');
      const withoutQuery = normalized.split('?')[0];
      assets.add(withoutQuery);
    }
    assertAssetsExist(assets, 'styles/main.css');
  });
});
