export function canonicalCharacterKey(name) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) return '';
  return n === 'The DM' ? 'DM' : n;
}

export function friendlyCharacterName(name) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) return '';
  return n === 'DM' ? 'The DM' : n;
}
