import { jest } from '@jest/globals';

test('processDmCatalogRecords merges DM gear entries with lock metadata', async () => {
  jest.resetModules();
  const { processDmCatalogRecords, isDmEntryLocked } = await import('../scripts/dm-entry-utils.js');

  const baseEntries = [{
    name: 'Standard Issue Vest',
    section: 'Gear',
    type: 'Armor',
    tier: 'T1',
    price: 100,
    priceText: '₡100',
    perk: '',
    description: '',
    attunement: '',
    use: '',
    source: 'Core',
  }];
  const basePrices = [{ name: 'Standard Issue Vest', price: 100, priceText: '₡100' }];

  const records = [{
    id: 'dm-gear-1',
    kind: 'gear',
    dmLock: true,
    label: 'Black Ops Armory',
    metadata: {
      name: 'Shadow Cloak',
      tier: 'T2',
      price: '₡250',
      description: 'Reactive camo cloak',
    },
    updatedAt: '2023-01-01T00:00:00.000Z',
  }];

  const result = processDmCatalogRecords(records, baseEntries, basePrices);
  expect(result.gearEntries).toHaveLength(1);
  const dmEntry = result.gearEntries[0];
  expect(isDmEntryLocked(dmEntry)).toBe(true);
  expect(dmEntry.source).toMatch(/DM Catalog/);
  expect(result.combinedEntries).toHaveLength(2);
  expect(result.combinedPrices.some(price => price.name === dmEntry.name)).toBe(true);
});

test('canPlayerUseDmEntry blocks locked entries for non-DM sessions', async () => {
  jest.resetModules();
  const { canPlayerUseDmEntry, isDmEntryLocked } = await import('../scripts/dm-entry-utils.js');

  const lockedEntry = { dmLock: true };
  expect(isDmEntryLocked(lockedEntry)).toBe(true);
  expect(canPlayerUseDmEntry(lockedEntry, { dmSessionActive: false })).toBe(false);
  expect(canPlayerUseDmEntry(lockedEntry, { dmSessionActive: true })).toBe(true);
  expect(canPlayerUseDmEntry({ dmLock: false }, { dmSessionActive: false })).toBe(true);
});
