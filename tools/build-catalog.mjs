import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  buildPriceIndex,
  normalizeCatalogRow,
  normalizePriceRow,
  parseCsv,
  sanitizeNormalizedCatalogEntry,
} from '../scripts/catalog-utils.js';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'gear-catalog.json');
const MASTER_CSV = path.join(ROOT, 'CatalystCore_Master_Book.csv');
const PRICE_CSV = path.join(ROOT, 'CatalystCore_Items_Prices.csv');

async function readTextFile(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

function derivePriceEntries(entries = []) {
  return entries
    .map(entry => {
      if (!entry || !entry.name) return null;
      const priceText = (entry.priceText || entry.priceRaw || '').trim();
      const numericPrice = Number.isFinite(entry.price) && entry.price > 0 ? entry.price : null;
      if (!priceText && !Number.isFinite(numericPrice)) {
        return null;
      }
      return {
        name: entry.name,
        price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : null,
        priceText,
      };
    })
    .filter(Boolean);
}

async function buildCatalog() {
  const masterText = await readTextFile(MASTER_CSV);
  if (!masterText) {
    throw new Error(`Missing gear catalog source CSV at ${path.relative(ROOT, MASTER_CSV)}`);
  }
  const priceText = await readTextFile(PRICE_CSV);

  const masterRows = parseCsv(masterText);
  const priceRowsRaw = priceText ? parseCsv(priceText) : [];
  const priceRows = Array.isArray(priceRowsRaw) ? priceRowsRaw : [];
  const normalizedPrices = priceRows
    .map(row => normalizePriceRow(row))
    .filter(Boolean);
  const priceIndex = buildPriceIndex(normalizedPrices);
  const normalizedEntries = masterRows
    .map(row => normalizeCatalogRow(row, priceIndex))
    .filter(Boolean)
    .map(entry => sanitizeNormalizedCatalogEntry(entry));

  const resolvedPrices = normalizedPrices.length
    ? normalizedPrices
    : derivePriceEntries(normalizedEntries);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      master: path.basename(MASTER_CSV),
      prices: path.basename(PRICE_CSV),
      entryCount: normalizedEntries.length,
      priceCount: resolvedPrices.length,
    },
    entries: normalizedEntries,
    prices: resolvedPrices,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let existing = null;
  try {
    existing = await fs.readFile(OUTPUT_PATH, 'utf8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      throw err;
    }
  }

  if (existing === serialized) {
    console.log('Gear catalog is up to date.');
    return payload;
  }

  await fs.writeFile(OUTPUT_PATH, serialized);

  const hash = crypto.createHash('sha1').update(serialized).digest('hex').slice(0, 12);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${normalizedEntries.length} entries, hash ${hash}).`);
  return payload;
}

if (process.argv[1] && path.resolve(process.argv[1]) === CURRENT_FILE) {
  buildCatalog().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

export { buildCatalog };
