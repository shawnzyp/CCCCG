import { canonicalCharacterKey } from './character-keys.js';

export function buildImportedCopyName(name, existingNames = []) {
  const baseName = typeof name === 'string' ? name.trim() : '';
  if (!baseName) return '';
  const existingSet = new Set(
    existingNames
      .filter(entry => typeof entry === 'string' && entry.trim())
      .map(entry => (canonicalCharacterKey(entry) || entry).toLowerCase())
  );
  const baseKey = (canonicalCharacterKey(baseName) || baseName).toLowerCase();
  if (!existingSet.has(baseKey)) return baseName;
  let counter = 2;
  while (counter < 1000) {
    const candidate = `${baseName} (Imported ${counter})`;
    const candidateKey = (canonicalCharacterKey(candidate) || candidate).toLowerCase();
    if (!existingSet.has(candidateKey)) return candidate;
    counter += 1;
  }
  return `${baseName} (Imported ${Date.now()})`;
}
