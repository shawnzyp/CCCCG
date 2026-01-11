import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const PLACEHOLDER = '__DM_PIN_SHA256__';

function normalizeHash(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function computeHash(pin) {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    return '';
  }
  return crypto.createHash('sha256').update(pin).digest('hex');
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] ?? inputPath;
  if (!inputPath) {
    console.error('Usage: node tools/inject-dm-pin-hash.mjs <input> [output]');
    process.exit(1);
  }

  const providedHash = normalizeHash(process.env.DM_PIN_SHA256);
  const computedHash = providedHash || computeHash(process.env.DM_PIN);
  if (!computedHash) {
    console.error('Provide DM_PIN_SHA256 or DM_PIN (4 to 6 digits).');
    process.exit(1);
  }

  const content = await fs.readFile(inputPath, 'utf8');
  if (!content.includes(PLACEHOLDER)) {
    console.error(`Missing ${PLACEHOLDER} placeholder in ${inputPath}.`);
    process.exit(1);
  }
  const updated = content.replaceAll(PLACEHOLDER, computedHash);
  await fs.writeFile(outputPath, updated);
  console.log(`Injected DM PIN hash into ${outputPath}.`);
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
