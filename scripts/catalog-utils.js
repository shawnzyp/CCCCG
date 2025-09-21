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

export { extractPriceValue };
