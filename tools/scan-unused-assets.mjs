import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import readline from 'readline';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const positionalArgs = argv.filter((arg) => !arg.startsWith('--'));

const ROOT = path.resolve(positionalArgs[0] || process.cwd());
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

const deleteEnabled = flags.has('--delete');
const reportOnly = flags.has('--report-only');
const strictMatches = flags.has('--strict');
const deleteAll = flags.has('--yes');

if (reportOnly && deleteEnabled) {
  console.error('Choose either --report-only or --delete, not both.');
  process.exit(1);
}

if (deleteAll && !deleteEnabled) {
  console.error('--yes requires --delete.');
  process.exit(1);
}

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

function rgHasMatch(query, cache) {
  if (cache.has(query)) {
    return cache.get(query);
  }
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
    cache.set(query, true);
    return true;
  }
  if (result.status === 1) {
    cache.set(query, false);
    return false;
  }
  const error = result.error ? result.error.message : 'unknown error';
  throw new Error(`ripgrep failed while searching for "${query}": ${error}`);
}

function ensureRipgrepAvailable() {
  const result = spawnSync('rg', ['--version'], {
    stdio: 'ignore',
  });
  if (result.status !== 0) {
    console.error('ripgrep (rg) is required to run this script. Please install rg and try again.');
    process.exit(1);
  }
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
    `Match strategy: ${report.matchStrategy}`,
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
  if (report.collisions.length === 0) {
    lines.push('', 'No basename collisions detected.');
  } else {
    lines.push('', 'Basename collisions:');
    for (const collision of report.collisions) {
      lines.push(`- ${collision.basename}`);
      for (const filePath of collision.paths) {
        lines.push(`  - ${filePath}`);
      }
    }
  }
  fs.writeFileSync(TEXT_REPORT, `${lines.join('\n')}\n`);
}

async function confirmDeletes(zeroHitFiles) {
  if (!deleteEnabled || reportOnly) {
    return 0;
  }
  if (zeroHitFiles.length === 0) {
    return 0;
  }

  if (!process.stdin.isTTY) {
    if (deleteAll) {
      console.warn('Non-interactive terminal detected. Proceeding with --yes deletions.');
    } else {
      console.warn('Non-interactive terminal detected. Skipping deletions (use --delete --yes to override).');
      return 0;
    }
  }

  if (deleteAll) {
    let deletedCount = 0;
    for (const file of zeroHitFiles) {
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
    return deletedCount;
  }

  if (!process.stdin.isTTY) {
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
  ensureRipgrepAvailable();
  const files = collectFiles(ROOT);
  const zeroHitFiles = [];
  const queryCache = new Map();

  const assetFiles = files.filter((file) => file.type === 'asset');
  const collisions = new Map();
  for (const file of assetFiles) {
    const baseName = path.basename(file.relativePath);
    const existing = collisions.get(baseName) || [];
    existing.push(file.relativePath);
    collisions.set(baseName, existing);
  }
  const collisionBasenames = new Set(
    Array.from(collisions.entries())
      .filter(([, paths]) => paths.length > 1)
      .map(([basename]) => basename),
  );
  const collisionList = Array.from(collisions.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([basename, paths]) => ({
      basename,
      paths: paths.sort(),
    }))
    .sort((a, b) => a.basename.localeCompare(b.basename));

  for (const file of files) {
    const baseName = path.basename(file.relativePath);
    const relativePath = file.relativePath;
    const hasRelativeMatch = rgHasMatch(relativePath, queryCache);
    const shouldCheckBase = !strictMatches && !collisionBasenames.has(baseName);
    const hasBaseMatch = shouldCheckBase ? rgHasMatch(baseName, queryCache) : false;
    const hasMatch = strictMatches ? hasRelativeMatch : hasRelativeMatch || hasBaseMatch;
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
    matchStrategy: strictMatches ? 'strict' : 'default',
    collisions: collisionList,
  };

  writeReports(report);

  console.log(`Scan complete. Zero-hit files: ${zeroHitFiles.length}.`);
  console.log(`Reports written to ${path.relative(ROOT, JSON_REPORT)} and ${path.relative(ROOT, TEXT_REPORT)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
