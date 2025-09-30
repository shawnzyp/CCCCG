import { extractPriceValue } from './catalog-utils.js';

function parseCsv(text) {
  if (!text) return [];
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(field);
      field = '';
    } else if (ch === '\r') {
      // ignore
    } else if (ch === '\n') {
      current.push(field);
      rows.push(current);
      current = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || current.length) {
    current.push(field);
  }
  if (current.length) rows.push(current);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  if (headers.length && headers[0] && headers[0].charCodeAt(0) === 0xfeff) {
    headers[0] = headers[0].slice(1);
  }
  return rows
    .filter(row => row.length && row.some(cell => (cell || '').trim() !== ''))
    .map(row => headers.reduce((acc, header, idx) => {
      acc[header] = (row[idx] || '').trim();
      return acc;
    }, {}));
}

function normalizePriceRow(row) {
  const name = (row.Name || '').trim();
  if (!name) return null;
  const priceSource = (row.PriceCr || row.Price || '').trim();
  const numeric = extractPriceValue(priceSource);
  return {
    name,
    price: Number.isFinite(numeric) && numeric > 0 ? numeric : null,
    priceText: priceSource,
  };
}

function buildPriceIndex(entries = []) {
  const index = new Map();
  entries.forEach(entry => {
    if (!entry || !entry.name) return;
    const key = entry.name.trim().toLowerCase();
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, entry);
    }
  });
  return index;
}

function normalizeCatalogToken(value) {
  if (value == null) return '';
  const text = String(value).toLowerCase();
  const cleaned = text.replace(/[^a-z0-9+]+/g, ' ').trim();
  return cleaned.replace(/\s+/g, ' ');
}

function splitValueOptions(text) {
  if (text == null) return [];
  const raw = String(text).trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?:\s+or\s+|\s*&\s*|\/|\||\s*,\s*)/i)
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [raw];
}

function parseCatalogList(value) {
  if (Array.isArray(value)) {
    return value.flatMap(parseCatalogList);
  }
  if (value == null) return [];
  const text = String(value).trim();
  if (!text) return [];
  return text
    .split(/\s*[;\n]+\s*/)
    .map(part => part.trim())
    .filter(Boolean);
}

function parseCatalogPrerequisites(value) {
  return parseCatalogList(value)
    .map(segment => {
      const match = segment.match(/^([^:=]+)[:=]\s*(.+)$/);
      if (match) {
        return {
          key: match[1].trim(),
          values: splitValueOptions(match[2]),
          raw: segment,
        };
      }
      return {
        key: '',
        values: splitValueOptions(segment),
        raw: segment,
      };
    })
    .filter(entry => Array.isArray(entry.values) && entry.values.length);
}

function getRowValue(row, ...keys) {
  for (const key of keys) {
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value != null) {
        const trimmed = String(value).trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return '';
}

function normalizeCatalogRow(row, priceLookup = null) {
  const rawType = (row.Type || '').trim();
  const section = (row.Section || '').trim() || 'Gear';
  const name = (row.Name || '').trim();
  if (!name) return null;
  const tier = (row.Tier || '').trim();
  const legacyPriceSource = (row.PriceCr || '').trim();
  let priceEntry = null;
  if (priceLookup && name) {
    const key = name.toLowerCase();
    if (priceLookup.has(key)) {
      priceEntry = priceLookup.get(key);
    }
  }
  let priceText = priceEntry ? (priceEntry.priceText || '') : '';
  let price = priceEntry && Number.isFinite(priceEntry.price) ? priceEntry.price : null;
  if (!priceText && legacyPriceSource) {
    priceText = legacyPriceSource;
  }
  if ((!Number.isFinite(price) || price <= 0) && priceText) {
    const parsedPrice = extractPriceValue(priceText);
    price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;
  }
  const perk = (row.Perk || '').trim();
  const description = (row.Description || '').trim();
  const use = (row.Use || '').trim();
  const attunement = (row.Attunement || '').trim();
  const source = (row['Where To Find'] || '').trim();
  const displayType = rawType || 'Item';
  const priceSearchText = priceText || legacyPriceSource;
  const classificationValue = getRowValue(
    row,
    'Classification',
    'Classifications',
    'Classification Requirement',
    'Classification Requirements',
  );
  const classifications = parseCatalogList(classificationValue)
    .flatMap(splitValueOptions)
    .map(normalizeCatalogToken)
    .filter(Boolean);
  const tierRestrictionValue = getRowValue(
    row,
    'Tier Requirement',
    'Tier Requirements',
    'Required Tier',
    'Required Tiers',
    'Tier Restriction',
    'Tier Restrictions',
    'Allowed Tier',
    'Allowed Tiers',
  );
  const tierRestrictions = parseCatalogList(tierRestrictionValue)
    .flatMap(splitValueOptions)
    .map(value => {
      const normalized = normalizeCatalogToken(value);
      return normalized ? { raw: value, normalized } : null;
    })
    .filter(Boolean);
  const prerequisitesValue = getRowValue(
    row,
    'Prerequisites',
    'Prerequisite',
    'Requirements',
    'Requirement',
    'Prereqs',
    'Prereq',
  );
  const prerequisites = parseCatalogPrerequisites(prerequisitesValue)
    .map(entry => {
      const normalizedKey = normalizeCatalogToken(entry.key || '');
      const values = entry.values
        .map(value => {
          const normalized = normalizeCatalogToken(value);
          return normalized ? { raw: value, normalized } : null;
        })
        .filter(Boolean);
      if (!values.length) return null;
      return {
        key: normalizedKey || null,
        values,
        raw: entry.raw,
      };
    })
    .filter(Boolean);
  const searchParts = [section, displayType, name, tier, priceSearchText || '', perk, description, use, attunement, source];
  if (classifications.length) searchParts.push(classifications.join(' '));
  if (tierRestrictions.length) {
    searchParts.push(tierRestrictions.map(r => r.raw || r.normalized).join(' '));
  }
  if (prerequisites.length) {
    searchParts.push(prerequisites.map(r => r.raw || '').join(' '));
  }
  const search = searchParts.map(part => (part || '').toLowerCase()).join(' ');
  return {
    section,
    type: displayType,
    rawType,
    name,
    tier,
    price,
    priceText,
    priceRaw: legacyPriceSource || priceText,
    perk,
    description,
    use,
    attunement,
    source,
    classifications,
    tierRestrictions,
    prerequisites,
    search,
  };
}

function tierRank(tier) {
  if (!tier) return Number.POSITIVE_INFINITY;
  const match = String(tier).match(/T(\d+)/i);
  if (match) {
    const rank = Number(match[1]);
    if (Number.isFinite(rank)) return rank;
  }
  return Number.POSITIVE_INFINITY;
}

function sortCatalogRows(rows) {
  return rows.slice().sort((a, b) => {
    const rankA = tierRank(a.tier);
    const rankB = tierRank(b.tier);
    const aHasTier = Number.isFinite(rankA);
    const bHasTier = Number.isFinite(rankB);
    if (aHasTier && bHasTier && rankA !== rankB) {
      return rankA - rankB;
    }
    if (aHasTier !== bHasTier) {
      return aHasTier ? -1 : 1;
    }
    const nameCompare = (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    return (a.type || '').localeCompare(b.type || '', 'en', { sensitivity: 'base' });
  });
}

export {
  parseCsv,
  normalizePriceRow,
  buildPriceIndex,
  normalizeCatalogToken,
  splitValueOptions,
  parseCatalogList,
  parseCatalogPrerequisites,
  getRowValue,
  normalizeCatalogRow,
  tierRank,
  sortCatalogRows,
};
