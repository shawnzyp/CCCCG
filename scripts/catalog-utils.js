function extractPriceValue(source) {
  if (source == null) return null;
  if (typeof source === 'number' && Number.isFinite(source) && source > 0) {
    return source;
  }
  const text = String(source).trim();
  if (!text) return null;
  const matches = text.match(/\d[\d,.]*(?:\.\d+)?/g);
  if (!matches) return null;
  let best = null;
  for (const rawMatch of matches) {
    const normalized = rawMatch.replace(/,/g, '');
    if (!normalized) continue;
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    if (best === null || numeric > best) {
      best = numeric;
    }
  }
  return best;
}

function decodeCatalogBuffer(buffer) {
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('windows-1252').decode(buffer);
    } catch (err) {
      try {
        return new TextDecoder().decode(buffer);
      } catch (fallbackErr) {
        console.error('Catalog decode fallback failed', fallbackErr);
      }
    }
  }
  let str = '';
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i++) {
    str += String.fromCharCode(view[i]);
  }
  return str;
}

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
      // ignore carriage returns
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
  if (!row || typeof row !== 'object') return null;
  const name = (row.Name || row.name || '').trim();
  if (!name) return null;
  const priceSource = (row.PriceCr || row.Price || row.priceText || '').trim();
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
    if (!key || index.has(key)) return;
    index.set(key, entry);
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
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/[\n;]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function parseCatalogPrerequisites(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/[\n;]+/)
    .map(part => part.trim())
    .filter(Boolean)
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
  if (!row || typeof row !== 'object') return '';
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

function buildCatalogSearchText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const searchParts = [
    entry.section,
    entry.type,
    entry.name,
    entry.tier,
    entry.priceText || entry.priceRaw,
    entry.perk,
    entry.description,
    entry.use,
    entry.attunement,
    entry.source,
  ];
  if (Array.isArray(entry.classifications) && entry.classifications.length) {
    searchParts.push(entry.classifications.join(' '));
  }
  if (Array.isArray(entry.tierRestrictions) && entry.tierRestrictions.length) {
    searchParts.push(entry.tierRestrictions.map(r => (r && (r.raw || r.normalized)) || '').join(' '));
  }
  if (Array.isArray(entry.prerequisites) && entry.prerequisites.length) {
    searchParts.push(entry.prerequisites.map(r => (r && r.raw) || '').join(' '));
  }
  return searchParts
    .map(part => (part || '').toLowerCase())
    .join(' ')
    .trim();
}

function normalizeCatalogRow(row, priceLookup = new Map()) {
  if (!row || typeof row !== 'object') return null;
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
  const entry = {
    section,
    type: displayType,
    rawType,
    name,
    tier,
    price,
    priceText,
    priceRaw: legacyPriceSource || priceSearchText || '',
    perk,
    description,
    use,
    attunement,
    source,
    classifications,
    tierRestrictions,
    prerequisites,
  };
  entry.search = buildCatalogSearchText(entry);
  return entry;
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

function sanitizeNormalizedCatalogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const sanitized = { ...entry };
  sanitized.section = typeof entry.section === 'string' && entry.section.trim() ? entry.section.trim() : 'Gear';
  sanitized.rawType = typeof entry.rawType === 'string' ? entry.rawType.trim() : '';
  const inferredType = sanitized.rawType || 'Item';
  sanitized.type = typeof entry.type === 'string' && entry.type.trim() ? entry.type.trim() : inferredType;
  sanitized.name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!sanitized.name) return null;
  sanitized.tier = typeof entry.tier === 'string' ? entry.tier.trim() : '';
  sanitized.price = Number.isFinite(entry.price) && entry.price > 0 ? entry.price : null;
  sanitized.priceText = typeof entry.priceText === 'string' ? entry.priceText.trim() : '';
  sanitized.priceRaw = typeof entry.priceRaw === 'string' ? entry.priceRaw.trim() : sanitized.priceText;
  sanitized.perk = typeof entry.perk === 'string' ? entry.perk.trim() : '';
  sanitized.description = typeof entry.description === 'string' ? entry.description.trim() : '';
  sanitized.use = typeof entry.use === 'string' ? entry.use.trim() : '';
  sanitized.attunement = typeof entry.attunement === 'string' ? entry.attunement.trim() : '';
  sanitized.source = typeof entry.source === 'string' ? entry.source.trim() : '';
  sanitized.classifications = Array.isArray(entry.classifications)
    ? entry.classifications
        .map(value => normalizeCatalogToken(value))
        .filter(Boolean)
    : [];
  sanitized.tierRestrictions = Array.isArray(entry.tierRestrictions)
    ? entry.tierRestrictions
        .map(value => {
          if (!value) return null;
          if (typeof value === 'string') {
            const normalized = normalizeCatalogToken(value);
            if (!normalized) return null;
            return { raw: value, normalized };
          }
          if (typeof value === 'object') {
            const raw = typeof value.raw === 'string' ? value.raw : '';
            const normalized = typeof value.normalized === 'string' && value.normalized
              ? value.normalized
              : normalizeCatalogToken(raw);
            if (!normalized) return null;
            return { raw, normalized };
          }
          return null;
        })
        .filter(Boolean)
    : [];
  sanitized.prerequisites = Array.isArray(entry.prerequisites)
    ? entry.prerequisites
        .map(value => {
          if (!value || typeof value !== 'object') return null;
          const raw = typeof value.raw === 'string' ? value.raw : '';
          const key = typeof value.key === 'string' ? value.key : '';
          const normalizedKey = normalizeCatalogToken(key);
          const values = Array.isArray(value.values)
            ? value.values
                .map(item => {
                  if (!item) return null;
                  if (typeof item === 'string') {
                    const normalized = normalizeCatalogToken(item);
                    if (!normalized) return null;
                    return { raw: item, normalized };
                  }
                  if (typeof item === 'object') {
                    const rawValue = typeof item.raw === 'string' ? item.raw : '';
                    const normalizedValue = typeof item.normalized === 'string' && item.normalized
                      ? item.normalized
                      : normalizeCatalogToken(rawValue);
                    if (!normalizedValue) return null;
                    return { raw: rawValue, normalized: normalizedValue };
                  }
                  return null;
                })
                .filter(Boolean)
            : [];
          if (!values.length) return null;
          return {
            key: normalizedKey || null,
            values,
            raw,
          };
        })
        .filter(Boolean)
    : [];
  sanitized.search = typeof entry.search === 'string' && entry.search.trim()
    ? entry.search
    : buildCatalogSearchText(sanitized);
  return sanitized;
}

export {
  buildCatalogSearchText,
  buildPriceIndex,
  decodeCatalogBuffer,
  extractPriceValue,
  getRowValue,
  normalizeCatalogRow,
  normalizeCatalogToken,
  normalizePriceRow,
  parseCatalogList,
  parseCatalogPrerequisites,
  parseCsv,
  sanitizeNormalizedCatalogEntry,
  sortCatalogRows,
  splitValueOptions,
  tierRank,
};
