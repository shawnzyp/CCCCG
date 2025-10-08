import { jest } from '@jest/globals';

describe('weapon range parsing', () => {
  test('catalog weapon cards extract range separately', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0)
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const realGet = document.getElementById.bind(document);
    const restoreGet = () => {
      document.getElementById = realGet;
    };

    document.body.innerHTML = `
      <div id="toast"></div>
      <div id="weapons"></div>
      <input id="credits" value="0" />
      <div id="credits-total-pill"></div>
    `;

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

    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
    }

    try {
      await jest.isolateModulesAsync(async () => {
        const { buildCardInfo, extractWeaponDetails } = await import('../scripts/main.js');

        const entry = {
          rawType: 'Weapon',
          type: 'Weapon',
          name: 'Frost Cannon',
          perk: 'Damage 2d6 cold; cone 15 ft.; Targets must succeed a DEX save',
          tier: 'T2'
        };

        const { extras, range } = extractWeaponDetails(entry.perk);
        expect(range).toBe('cone 15 ft');
        expect(extras).not.toContain('cone 15 ft');

        const info = buildCardInfo(entry);
        expect(info.kind).toBe('weapon');
        expect(info.data.range).toBe('cone 15 ft');
        expect(info.data.damage).not.toMatch(/cone 15 ft/i);
        expect(info.data.damage).toMatch(/Damage 2d6 cold/);
      });
    } finally {
      restoreGet();
      errorSpy.mockRestore();
      if (originalFetch) {
        global.fetch = originalFetch;
      } else {
        delete global.fetch;
      }
    }
  });
});
