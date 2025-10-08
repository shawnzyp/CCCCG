import { sanitizeNormalizedCatalogEntry } from './catalog-utils.js';
import {
  buildGearEntryFromMetadata,
  buildPowerPresetFromMetadata,
  buildSignaturePresetFromMetadata,
} from './dm-catalog-utils.js';

function isDmEntryLocked(entry) {
  return !!(entry && entry.dmLock);
}

function canPlayerUseDmEntry(entry, { dmSessionActive = false } = {}) {
  if (!isDmEntryLocked(entry)) return true;
  return !!dmSessionActive;
}

function derivePriceEntriesFromCatalog(entries = []) {
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

function processDmCatalogRecords(records = [], baseEntries = [], basePrices = []) {
  const gearEntries = [];
  const powerPresets = [];
  const signaturePresets = [];
  (Array.isArray(records) ? records : []).forEach(record => {
    if (!record || record.deleted) return;
    const kind = record.kind || record.type || '';
    if (kind === 'powers') {
      const preset = buildPowerPresetFromMetadata(record.metadata || {}, {
        entryId: record.id,
        dmLock: record.dmLock,
        label: record.powerLabel || record.label,
      });
      if (preset && preset.data) {
        const mergedData = record.powerEntry && typeof record.powerEntry === 'object'
          ? { ...preset.data, ...record.powerEntry }
          : preset.data;
        powerPresets.push({
          id: record.id,
          label: preset.label || record.metadata?.name || record.label || 'Power',
          data: mergedData,
          dmLock: !!record.dmLock,
        });
      }
      return;
    }
    if (kind === 'signature-moves') {
      const preset = buildSignaturePresetFromMetadata(record.metadata || {}, {
        entryId: record.id,
        dmLock: record.dmLock,
        label: record.signatureLabel || record.label,
      });
      if (preset && preset.data) {
        const mergedData = record.signatureEntry && typeof record.signatureEntry === 'object'
          ? { ...preset.data, ...record.signatureEntry }
          : preset.data;
        signaturePresets.push({
          id: record.id,
          label: preset.label || record.metadata?.name || record.label || 'Signature Move',
          data: mergedData,
          dmLock: !!record.dmLock,
        });
      }
      return;
    }
    let entry = null;
    if (record.gearEntry && typeof record.gearEntry === 'object') {
      entry = sanitizeNormalizedCatalogEntry({ ...record.gearEntry });
    }
    if (!entry) {
      entry = buildGearEntryFromMetadata(kind, record.metadata || {}, {
        entryId: record.id,
        dmLock: record.dmLock,
        label: record.label,
        updatedAt: record.updatedAt,
      });
    }
    if (entry) {
      entry.dmEntryId = entry.dmEntryId || record.id;
      entry.dmLock = entry.dmLock === undefined ? !!record.dmLock : entry.dmLock;
      entry.dmKind = entry.dmKind || kind;
      entry.dmTimestamp = entry.dmTimestamp || record.updatedAt || '';
      entry.dmSource = entry.dmSource || 'dm-catalog';
      if (!entry.source || entry.source === 'DM Catalog') {
        const label = record.label || 'DM Catalog';
        entry.source = `${label} · DM Catalog`;
      }
      gearEntries.push(entry);
    }
  });
  const combinedEntries = baseEntries.slice().concat(gearEntries);
  const combinedPrices = basePrices.slice().concat(derivePriceEntriesFromCatalog(gearEntries));
  return {
    gearEntries,
    powerPresets,
    signaturePresets,
    combinedEntries,
    combinedPrices,
  };
}

export {
  isDmEntryLocked,
  canPlayerUseDmEntry,
  derivePriceEntriesFromCatalog,
  processDmCatalogRecords,
};
