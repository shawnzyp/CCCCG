import { jest } from '@jest/globals';

describe('gear catalog sorting', () => {
  test('orders tiers from highest (T0) to lowest (T5)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });

    const realGet = document.getElementById.bind(document);
    document.getElementById = (id) => realGet(id) || {
      innerHTML: '',
      value: '',
      style: { setProperty: () => {}, getPropertyValue: () => '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      contains: () => false,
      add: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      click: () => {},
      textContent: '',
      disabled: false,
      checked: false,
      hidden: false
    };

    const { sortCatalogRows } = await import('../scripts/catalog-shared.js');

    const rows = [
      { name: 'Gamma', tier: 'T3', type: 'Item' },
      { name: 'Alpha', tier: 'T1', type: 'Item' },
      { name: 'Omega', tier: 'T5', type: 'Item' },
      { name: 'Sigma', tier: 'T0', type: 'Item' },
      { name: 'No Tier', tier: '', type: 'Item' }
    ];

    const sorted = sortCatalogRows(rows);

    expect(sorted.map(entry => entry.name)).toEqual([
      'Sigma',
      'Alpha',
      'Gamma',
      'Omega',
      'No Tier'
    ]);
  });
});
