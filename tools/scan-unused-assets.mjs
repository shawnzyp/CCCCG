import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import readline from 'readline';

const ROOT = path.resolve(process.argv[2] || process.cwd());
const REPORT_DIR = path.join(ROOT, 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'unused-assets.json');
const TEXT_REPORT = path.join(REPORT_DIR, 'unused-assets.txt');

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html']);
const ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.ttf',
  '.woff',
  '.woff2',
  '.otf',
  '.eot',
]);

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.parcel-cache',
  'reports',
]);

const EXCLUDED_FILES = new Set([
  'asset-manifest.json',
  'sw.js',
  'worker.js',
  'service-worker.js',
]);

const EXCLUDED_EXTENSIONS = new Set(['.map']);

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function shouldSkipDir(relativeDir) {
  const segments = relativeDir.split('/');
  return segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment));
}

function shouldSkipFile(relativePath) {
  const baseName = path.basename(relativePath);
  if (EXCLUDED_FILES.has(baseName)) {
    return true;
  }
  const ext = path.extname(baseName).toLowerCase();
  return EXCLUDED_EXTENSIONS.has(ext);
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
      if (shouldSkipDir(relativePath)) {
        continue;
      }
      files.push(...collectFiles(fullPath, relativePath));
      continue;
    }
    if (shouldSkipFile(relativePath)) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (SOURCE_EXTENSIONS.has(ext) || ASSET_EXTENSIONS.has(ext)) {
      files.push({
        relativePath,
        type: SOURCE_EXTENSIONS.has(ext) ? 'source' : 'asset',
      });
    }
  }
  return files;
}

function rgHasMatch(query) {
  const args = [
    '--fixed-strings',
    '--quiet',
    '--glob',
    '!.git/**',
    '--glob',
    '!node_modules/**',
    '--glob',
    '!dist/**',
    '--glob',
    '!build/**',
    '--glob',
    '!out/**',
    '--glob',
    '!coverage/**',
    '--glob',
    '!reports/**',
    '--glob',
    '!**/.cache/**',
    '--glob',
    '!**/*.map',
    '--glob',
    '!asset-manifest.json',
    '--glob',
    '!sw.js',
    '--glob',
    '!worker.js',
    '--glob',
    '!**/service-worker.js',
    '--',
    query,
    ROOT,
  ];
  const result = spawnSync('rg', args, {
    cwd: ROOT,
    stdio: 'ignore',
  });
  if (result.status === 0) {
    return true;
  }
  if (result.status === 1) {
    return false;
  }
  const error = result.error ? result.error.message : 'unknown error';
  throw new Error(`ripgrep failed while searching for "${query}": ${error}`);
}

function ensureReportsDir() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function writeReports(report) {
  ensureReportsDir();
  fs.writeFileSync(JSON_REPORT, `${JSON.stringify(report, null, 2)}\n`);

  const lines = [
    `Unused asset scan report`,
    `Root: ${report.root}`,
    `Scanned files: ${report.scannedFiles}`,
    `Zero-hit files: ${report.zeroHitFiles.length}`,
    `Deleted files: ${report.deletedFiles}`,
    '',
  ];
  if (report.zeroHitFiles.length === 0) {
    lines.push('No zero-hit files found.');
  } else {
    lines.push('Zero-hit files:');
    for (const file of report.zeroHitFiles) {
      lines.push(`- ${file.relativePath} (${file.type})${file.deleted ? ' [deleted]' : ''}`);
    }
  }
  fs.writeFileSync(TEXT_REPORT, `${lines.join('\n')}\n`);
}

async function confirmDeletes(zeroHitFiles) {
  if (zeroHitFiles.length === 0) {
    return 0;
  }
  if (!process.stdin.isTTY) {
    console.warn('Non-interactive terminal detected. Skipping deletions.');
    return 0;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  let deletedCount = 0;
  for (const file of zeroHitFiles) {
    const answer = await question(`No references found for ${file.relativePath}. Delete? [y/N] `);
    const normalized = answer.trim().toLowerCase();
    if (normalized === 'y' || normalized === 'yes') {
      const fullPath = path.join(ROOT, file.relativePath);
      try {
        fs.unlinkSync(fullPath);
        file.deleted = true;
        deletedCount += 1;
        console.log(`Deleted ${file.relativePath}`);
      } catch (error) {
        console.warn(`Failed to delete ${file.relativePath}: ${error.message}`);
      }
    }
  }

  rl.close();
  return deletedCount;
}

async function main() {
  const files = collectFiles(ROOT);
  const zeroHitFiles = [];

  for (const file of files) {
    const baseName = path.basename(file.relativePath);
    const hasMatch = rgHasMatch(baseName);
    if (!hasMatch) {
      zeroHitFiles.push({
        ...file,
        deleted: false,
      });
    }
  }

  const deletedFiles = await confirmDeletes(zeroHitFiles);

  const report = {
    root: ROOT,
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    zeroHitFiles,
    deletedFiles,
  };

  writeReports(report);

  console.log(`Scan complete. Zero-hit files: ${zeroHitFiles.length}.`);
  console.log(`Reports written to ${path.relative(ROOT, JSON_REPORT)} and ${path.relative(ROOT, TEXT_REPORT)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
