import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'asset-manifest.json');

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.github',
  '__tests__',
  'tools',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.txt',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.csv',
  '.ttf',
  '.woff',
  '.woff2',
  '.otf',
  '.mp3',
  '.mp4',
  '.wav',
  '.webm',
]);

const ALWAYS_INCLUDE = new Set([
  'asset-manifest.json',
  'index.html',
]);

const EXCLUDED_FILES = new Set([
  'package.json',
  'package-lock.json',
]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function shouldSkipDir(relativeDir) {
  const topLevel = relativeDir.split('/')[0];
  return EXCLUDED_DIRECTORIES.has(topLevel);
}

function collectFiles(dir, base = '') {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const relativePath = normalizePath(path.join(base, entry.name));
    if (entry.isDirectory()) {
      if (shouldSkipDir(relativePath)) continue;
      files.push(...collectFiles(fullPath, relativePath));
    } else if (EXCLUDED_FILES.has(relativePath)) {
      continue;
    } else if (ALWAYS_INCLUDE.has(relativePath)) {
      files.push(relativePath);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) {
        files.push(relativePath);
      }
    }
  }
  return files;
}

const discoveredFiles = collectFiles(ROOT);
const uniqueFiles = Array.from(new Set(discoveredFiles)).sort();

const hash = crypto.createHash('sha256');
for (const relativePath of uniqueFiles) {
  if (relativePath === 'asset-manifest.json') continue;
  const fullPath = path.join(ROOT, relativePath);
  const data = fs.readFileSync(fullPath);
  hash.update(relativePath);
  hash.update('\0');
  hash.update(data);
}
const digest = hash.digest('hex').slice(0, 16);
const version = `cccg-cache-${digest}`;

const assets = ['./'];
for (const relativePath of uniqueFiles) {
  if (relativePath === 'asset-manifest.json') continue;
  assets.push(`./${relativePath}`);
}
if (!assets.includes('./asset-manifest.json')) {
  assets.push('./asset-manifest.json');
}

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  assets: assets.sort(),
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${assets.length} assets to ${path.relative(ROOT, OUTPUT)} (version ${version}).`);
