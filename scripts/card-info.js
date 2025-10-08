import { extractPriceValue } from './catalog-utils.js';

function getPriceDisplay(entry) {
  if (!entry) return '';
  if (typeof entry.priceDisplay === 'string' && entry.priceDisplay.trim()) {
    return entry.priceDisplay.trim();
  }
  const raw = (entry.priceText || entry.priceRaw || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) {
    const numeric = Number.parseInt(raw, 10);
    return Number.isFinite(numeric) && numeric > 0 ? `₡${numeric.toLocaleString('en-US')}` : '';
  }
  return raw;
}

function formatPriceNote(entry) {
  const display = getPriceDisplay(entry);
  if (!display) return '';
  return display.startsWith('₡') ? display : `Price: ${display}`;
}

function getEntryPriceValue(entry) {
  if (!entry) return null;
  if (Number.isFinite(entry.price) && entry.price > 0) return entry.price;
  const raw = (entry.priceText || entry.priceRaw || '').trim();
  if (!raw) return null;
  const numeric = extractPriceValue(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatDamageText(damage) {
  if (!damage) return '';
  return damage.replace(/(\dd\d)(\dd\d)/ig, '$1 / $2');
}

function extractArmorDetails(perk) {
  if (!perk) return { bonus: 0, details: [] };
  const segments = perk.split(/;|\./).map(p => p.trim()).filter(Boolean);
  let bonus = 0;
  const details = [];
  segments.forEach((seg, idx) => {
    const match = seg.match(/\+(\d+)\s*TC/i);
    if (match && bonus === 0) {
      bonus = Number(match[1]) || 0;
      const remainder = seg.replace(/\+(\d+)\s*TC/i, '').trim();
      if (remainder) details.push(remainder.replace(/^[-–—]/, '').trim());
    } else if (idx > 0 || !match) {
      details.push(seg);
    }
  });
  return { bonus, details };
}

function extractWeaponDetails(perk) {
  if (!perk) return { damage: '', extras: [] };
  const segments = perk.split(/;|\./).map(p => p.trim()).filter(Boolean);
  let damage = '';
  const extras = [];
  segments.forEach((seg, idx) => {
    const match = seg.match(/^(?:Damage\s*)?(.*)$/i);
    if (idx === 0 && /damage/i.test(seg)) {
      damage = match && match[1] ? match[1].trim() : seg.trim();
    } else if (idx === 0 && !/damage/i.test(seg)) {
      extras.push(seg);
    } else if (seg) {
      extras.push(seg);
    }
  });
  if (damage.toLowerCase().startsWith('damage')) {
    damage = damage.slice(6).trim();
  }
  return { damage: formatDamageText(damage), extras };
}

function buildItemNotes(entry) {
  const notes = [];
  if (entry.tier) notes.push(`Tier ${entry.tier}`);
  const priceText = formatPriceNote(entry);
  if (priceText) notes.push(priceText);
  if (entry.perk) notes.push(entry.perk);
  if (entry.description) notes.push(entry.description);
  if (entry.use) notes.push(`Use: ${entry.use}`);
  if (entry.attunement) notes.push(`Attunement: ${entry.attunement}`);
  if (entry.source) notes.push(entry.source);
  return notes.join(' — ');
}

function buildCardInfo(entry) {
  if (!entry) return null;
  const rawType = (entry.rawType || entry.type || '').trim();
  const typeKey = rawType.toLowerCase();
  const priceNote = formatPriceNote(entry);
  let name = entry.name || 'Item';
  let parsedQty = null;
  if (typeof name === 'string') {
    const qtyMatch = name.match(/\s*(?:[xX]\s*(\d+)|\((\d+)\))$/);
    if (qtyMatch && qtyMatch.index !== undefined) {
      const qtyValue = Number.parseInt(qtyMatch[1] || qtyMatch[2], 10);
      if (Number.isFinite(qtyValue) && qtyValue > 0) {
        parsedQty = qtyValue;
        name = name.slice(0, qtyMatch.index).trim();
      }
    }
  }
  if (typeKey === 'weapon') {
    const { damage, extras } = extractWeaponDetails(entry.perk);
    const damageParts = [];
    if (damage) damageParts.push(`Damage ${damage}`);
    extras.filter(Boolean).forEach(part => damageParts.push(part));
    if (entry.tier) damageParts.push(`Tier ${entry.tier}`);
    if (priceNote) damageParts.push(priceNote);
    if (entry.use) damageParts.push(`Use: ${entry.use}`);
    if (entry.attunement) damageParts.push(`Attunement: ${entry.attunement}`);
    if (entry.source) damageParts.push(entry.source);
    return {
      kind: 'weapon',
      listId: 'weapons',
      data: {
        name,
        damage: damageParts.join(' — ')
      }
    };
  }
  if (typeKey === 'armor' || typeKey === 'shield') {
    const { bonus: parsedBonus, details } = extractArmorDetails(entry.perk);
    const nameParts = [];
    if (details.length) nameParts.push(details.join(' — '));
    if (entry.tier) nameParts.push(`Tier ${entry.tier}`);
    if (priceNote) nameParts.push(priceNote);
    if (entry.use) nameParts.push(`Use: ${entry.use}`);
    if (entry.attunement) nameParts.push(`Attunement: ${entry.attunement}`);
    if (entry.source) nameParts.push(entry.source);
    const slotBase = typeKey === 'shield' ? 'Shield' : 'Body';
    const slot = (entry.slot || slotBase || '').trim() || slotBase;
    const bonusValue = Number.isFinite(entry.bonus) ? entry.bonus : parsedBonus;
    return {
      kind: 'armor',
      listId: 'armors',
      data: {
        name: nameParts.length ? `${name} — ${nameParts.join(' — ')}` : name,
        slot,
        bonus: Number.isFinite(bonusValue) ? bonusValue : 0,
        equipped: true
      }
    };
  }
  const notes = buildItemNotes(entry);
  const qty = Number.isFinite(entry.qty) && entry.qty > 0 ? entry.qty : (parsedQty ?? 1);
  return {
    kind: 'item',
    listId: 'items',
    data: {
      name,
      notes,
      qty
    }
  };
}

export {
  buildCardInfo,
  buildItemNotes,
  extractArmorDetails,
  extractWeaponDetails,
  formatDamageText,
  formatPriceNote,
  getEntryPriceValue,
  getPriceDisplay,
};
