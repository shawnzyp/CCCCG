import { describe, expect, test } from '@jest/globals';

import {
  buildDmEntryFromPayload,
  buildDmPowerPresetFromPayload,
  normalizeDmCatalogPayload,
} from '../scripts/catalog-utils.js';

describe('DM catalog utilities', () => {
  test('normalizeDmCatalogPayload trims metadata and preserves lock', () => {
    const raw = {
      type: 'Gear',
      label: 'Gear',
      locked: 'yes',
      timestamp: '2024-01-01T00:00:00Z',
      metadata: {
        name: '  Quantum Relay  ',
        price: ' ₡120000 ',
        mechanics: 'Teleport allies.',
      },
    };

    const normalized = normalizeDmCatalogPayload(raw);
    expect(normalized).toMatchObject({
      type: 'gear',
      locked: true,
      metadata: {
        name: 'Quantum Relay',
        price: '₡120000',
        mechanics: 'Teleport allies.',
      },
    });
    expect(typeof normalized.id).toBe('string');
    expect(normalized.id.length).toBeGreaterThan(0);
  });

  test('buildDmEntryFromPayload marks entry as DM-owned and locked', () => {
    const payload = normalizeDmCatalogPayload({
      type: 'gear',
      label: 'Gear',
      locked: true,
      metadata: {
        name: 'Phase Beacon',
        price: '₡5000',
        mechanics: 'Grants advantage on stealth checks.',
        description: 'Compact support device.',
        tier: 'T2',
      },
    });

    const entry = buildDmEntryFromPayload(payload);
    expect(entry).toMatchObject({
      name: 'Phase Beacon',
      dmEntry: true,
      dmLock: true,
      section: 'DM Catalog',
      priceText: '₡5000',
      qty: 1,
    });
    expect(entry.search).toContain('phase beacon');
  });

  test('buildDmEntryFromPayload uses metadata quantity when provided', () => {
    const payload = normalizeDmCatalogPayload({
      type: 'items',
      label: 'Items',
      locked: false,
      metadata: {
        name: 'Stasis Capsule',
        quantity: '3',
      },
    });

    const entry = buildDmEntryFromPayload(payload);
    expect(entry).not.toBeNull();
    expect(entry.qty).toBe(3);
  });

  test('buildDmPowerPresetFromPayload creates power preset metadata', () => {
    const payload = normalizeDmCatalogPayload({
      type: 'powers',
      label: 'Powers',
      locked: false,
      metadata: {
        name: 'Solar Flare',
        tags: 'Energy, Control',
        effect: 'Blinding burst of solar energy.',
        duration: '1 Round',
        cost: '2 SP',
      },
    });

    const preset = buildDmPowerPresetFromPayload(payload);
    expect(preset).toMatchObject({
      dmEntry: true,
      locked: false,
    });
    expect(preset.data).toMatchObject({
      name: 'Solar Flare',
      style: 'Energy',
      duration: '1 Round',
      spCost: 2,
    });
  });
});
