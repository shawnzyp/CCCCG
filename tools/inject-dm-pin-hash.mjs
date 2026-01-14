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
  const args = process.argv.slice(2);
  const optionalIndex = args.indexOf('--optional');
  const optional = optionalIndex !== -1;
  if (optional) {
    args.splice(optionalIndex, 1);
  }
  const inputPath = args[0];
  const outputPath = args[1] ?? inputPath;
  if (!inputPath) {
    console.error('Usage: node tools/inject-dm-pin-hash.mjs [--optional] <input> [output]');
    process.exit(1);
  }

  const providedHash = normalizeHash(process.env.DM_PIN_SHA256);
  const computedHash = providedHash || computeHash(process.env.DM_PIN);
  const hasEnv = Boolean(process.env.DM_PIN_SHA256 || process.env.DM_PIN);
  if (!computedHash) {
    const message = 'Provide DM_PIN_SHA256 or DM_PIN (4 to 6 digits).';
    if (optional && !hasEnv) {
      console.warn(`${message} Skipping DM PIN injection.`);
      return;
    }
    console.error(message);
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
