import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = path.resolve('tools/inject-dm-pin-hash.mjs');
const metaTag = '<meta name="cc-dm-pin-sha256" content="__DM_PIN_SHA256__"/>';

async function withTempDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccccg-dm-pin-'));
  try {
    await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function runInject({ args, env }) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

await withTempDir(async dir => {
  const inputPath = path.join(dir, 'input.html');
  const outputPath = path.join(dir, 'output.html');

  await fs.writeFile(inputPath, `<!doctype html><head>${metaTag}</head>`);
  const result = runInject({
    args: ['--optional', inputPath, outputPath],
    env: { DM_PIN: '', DM_PIN_SHA256: '' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = await fs.readFile(outputPath, 'utf8');
  assert.ok(!output.includes('cc-dm-pin-sha256'), 'meta tag should be removed when optional and no env');
  assert.ok(!output.includes('__DM_PIN_SHA256__'), 'placeholder should be removed when optional and no env');
});

await withTempDir(async dir => {
  const inputPath = path.join(dir, 'input.html');
  const outputPath = path.join(dir, 'output.html');
  const pin = '1234';
  const expected = crypto.createHash('sha256').update(pin).digest('hex');

  await fs.writeFile(inputPath, `<!doctype html><head>${metaTag}</head>`);
  const result = runInject({
    args: [inputPath, outputPath],
    env: { DM_PIN: pin, DM_PIN_SHA256: '' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = await fs.readFile(outputPath, 'utf8');
  assert.ok(output.includes(expected), 'hash should be injected when DM_PIN is provided');
  assert.ok(!output.includes('__DM_PIN_SHA256__'), 'placeholder should be removed when DM_PIN is provided');
});

console.log('inject-dm-pin-hash tests passed');
