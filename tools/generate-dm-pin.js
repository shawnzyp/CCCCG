#!/usr/bin/env node

import crypto from 'node:crypto';

function usage() {
  console.error('Usage: node tools/generate-dm-pin.js <pin> [iterations]');
  process.exit(1);
}

const pin = process.argv[2];
if (!pin) {
  usage();
}

const iterationsArg = process.argv[3];
const iterations = iterationsArg ? Number.parseInt(iterationsArg, 10) : 120000;
if (!Number.isFinite(iterations) || iterations <= 0) {
  console.error('Iterations must be a positive integer.');
  process.exit(1);
}

const keyLength = 32;
const digest = 'sha256';

const salt = crypto.randomBytes(16);
const hash = crypto.pbkdf2Sync(pin, salt, iterations, keyLength, digest);

const config = {
  hash: hash.toString('base64'),
  salt: salt.toString('base64'),
  iterations,
  keyLength,
  digest: 'SHA-256',
};

console.log(JSON.stringify(config, null, 2));
