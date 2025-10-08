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
import { buildGearEntryFromMetadata } from '../scripts/dm-catalog-utils.js';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'data');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'gear-catalog.json');
const MASTER_CSV = path.join(ROOT, 'CatalystCore_Master_Book.csv');
const PRICE_CSV = path.join(ROOT, 'CatalystCore_Items_Prices.csv');
const DM_CATALOG_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/dmCatalog.json';

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

function normalizeDmCatalogRecord(id, value) {
  if (!id || !value || typeof value !== 'object') return null;
  const kind = typeof value.kind === 'string' && value.kind.trim()
    ? value.kind.trim()
    : (typeof value.type === 'string' ? value.type.trim() : '');
  const dmLock = value.dmLock === true || value.locked === true;
  const metadata = value.metadata && typeof value.metadata === 'object' ? { ...value.metadata } : {};
  const gearEntry = value.gearEntry && typeof value.gearEntry === 'object' ? { ...value.gearEntry } : null;
  return {
    id,
    kind,
    label: typeof value.label === 'string' ? value.label : '',
    dmLock,
    metadata,
    gearEntry,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

function hydrateDmGearEntry(record) {
  if (!record) return null;
  const preferEntry = record.gearEntry ? sanitizeNormalizedCatalogEntry({ ...record.gearEntry }) : null;
  const base = preferEntry
    || buildGearEntryFromMetadata(record.kind, record.metadata, {
      entryId: record.id,
      dmLock: record.dmLock,
      label: record.label,
      updatedAt: record.updatedAt,
    });
  if (!base) return null;
  const entry = sanitizeNormalizedCatalogEntry({ ...base });
  if (!entry) return null;
  entry.dmEntryId = entry.dmEntryId || record.id;
  entry.dmLock = entry.dmLock === undefined ? !!record.dmLock : entry.dmLock;
  entry.dmKind = entry.dmKind || record.kind || 'gear';
  entry.dmSource = entry.dmSource || 'dm-catalog';
  entry.dmTimestamp = entry.dmTimestamp || record.updatedAt || '';
  if (!entry.source || entry.source === 'DM Catalog') {
    const label = record.label || 'DM Catalog';
    entry.source = `${label} · DM Catalog`;
  }
  return entry;
}

async function loadDmGearEntries() {
  if (typeof fetch !== 'function') {
    console.warn('Global fetch is not available; skipping DM catalog ingestion.');
    return [];
  }
  try {
    const res = await fetch(DM_CATALOG_URL, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data) return [];
    return Object.entries(data)
      .map(([id, value]) => normalizeDmCatalogRecord(id, value))
      .filter(Boolean)
      .map(record => hydrateDmGearEntry(record))
      .filter(Boolean);
  } catch (err) {
    console.warn('Failed to load DM catalog entries:', err.message || err);
    return [];
  }
}

async function buildCatalog(options = {}) {
  const { includeDm = false } = options;
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

  const basePrices = normalizedPrices.length
    ? normalizedPrices
    : derivePriceEntries(normalizedEntries);

  const dmEntries = includeDm ? await loadDmGearEntries() : [];
  const combinedEntries = normalizedEntries.concat(dmEntries);
  const dmPrices = dmEntries.length ? derivePriceEntries(dmEntries) : [];
  const resolvedPrices = basePrices.concat(dmPrices);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      master: path.basename(MASTER_CSV),
      prices: path.basename(PRICE_CSV),
      entryCount: combinedEntries.length,
      priceCount: resolvedPrices.length,
      dmEntries: dmEntries.length,
    },
    entries: combinedEntries,
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
  const dmSuffix = dmEntries.length ? ` + ${dmEntries.length} DM` : '';
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)} (${combinedEntries.length} entries${dmSuffix ? dmSuffix + ' entries' : ''}, hash ${hash}).`);
  return payload;
}

if (process.argv[1] && path.resolve(process.argv[1]) === CURRENT_FILE) {
  const args = new Set(process.argv.slice(2));
  const includeDm = args.has('--include-dm') || args.has('--dm');
  buildCatalog({ includeDm }).catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}

export { buildCatalog };
