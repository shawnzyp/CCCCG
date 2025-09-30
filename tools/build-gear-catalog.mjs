import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseCsv,
  normalizePriceRow,
  buildPriceIndex,
  normalizeCatalogRow,
  sortCatalogRows,
} from '../scripts/catalog-shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MASTER_SOURCE = path.join(ROOT, 'CatalystCore_Master_Book.csv');
const PRICE_SOURCE = path.join(ROOT, 'CatalystCore_Items_Prices.csv');
const OUTPUT_PATH = path.join(ROOT, 'CatalystCore_GearCatalog.json');

async function readCsv(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return parseCsv(text);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function buildCatalog(masterRows, priceRows) {
  const priceEntries = priceRows.map(normalizePriceRow).filter(Boolean);
  const priceIndex = buildPriceIndex(priceEntries);
  const normalizedEntries = masterRows
    .map(row => normalizeCatalogRow(row, priceIndex))
    .filter(Boolean);
  const sortedEntries = sortCatalogRows(normalizedEntries);
  return { entries: sortedEntries, priceEntries };
}

async function main() {
  const [masterRows, priceRows] = await Promise.all([
    readCsv(MASTER_SOURCE),
    readCsv(PRICE_SOURCE),
  ]);
  if (!masterRows.length) {
    throw new Error('No rows found in master catalog CSV.');
  }
  const { entries, priceEntries } = buildCatalog(masterRows, priceRows);
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      master: path.basename(MASTER_SOURCE),
      prices: path.basename(PRICE_SOURCE),
    },
    entryCount: entries.length,
    priceEntryCount: priceEntries.length,
    entries,
    priceEntries,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${entries.length} catalog entries to ${path.relative(ROOT, OUTPUT_PATH)}.`);
}

main().catch(err => {
  console.error('Catalog build failed:', err);
  process.exitCode = 1;
});
