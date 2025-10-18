import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

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
      recipient: null,
    });
    expect(typeof normalized.id).toBe('string');
    expect(normalized.id.length).toBeGreaterThan(0);
  });

  test('normalizeDmCatalogPayload carries recipient from metadata', () => {
    const raw = {
      type: 'Items',
      label: 'Items',
      metadata: {
        name: 'Signal Beacon',
        recipient: '  Echo  ',
      },
    };

    const normalized = normalizeDmCatalogPayload(raw);
    expect(normalized).toMatchObject({
      type: 'items',
      recipient: 'Echo',
      metadata: {
        name: 'Signal Beacon',
        recipient: 'Echo',
      },
    });
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
      dmRecipient: '',
    });
    expect(entry.search).toContain('phase beacon');
  });

  test('buildDmEntryFromPayload retains staged recipient', () => {
    const payload = normalizeDmCatalogPayload({
      type: 'items',
      label: 'Items',
      metadata: {
        name: 'Med Patch',
        recipient: 'Nova',
      },
    });

    const entry = buildDmEntryFromPayload(payload);
    expect(entry.dmRecipient).toBe('Nova');
    expect(entry.search).toContain('nova');
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
      dmRecipient: null,
    });
    expect(preset.data).toMatchObject({
      name: 'Solar Flare',
      style: 'Energy',
      duration: '1 Round',
      spCost: 2,
    });
  });
});

describe('DM catalog equipment delivery', () => {
  let restoreReadyState;
  let restoreBtoa;
  let loadCharacterMock;
  let saveCloudMock;
  let testHooks;
  let weaponForm;
  let armorForm;
  let itemForm;
  let consoleErrorMock;
  let originalAddEventListener;
  const deferredEvents = new Map();

  function setupDmDom() {
    document.body.innerHTML = `
      <button id="dm-login" type="button"></button>
      <div class="dm-tools-portal">
        <div id="dm-tools-menu" hidden>
          <button id="dm-tools-rewards" type="button"></button>
        </div>
        <button id="dm-tools-toggle" type="button" hidden></button>
      </div>
      <div id="dm-rewards-modal" class="overlay hidden" aria-hidden="true">
        <section class="modal dm-rewards">
          <button id="dm-rewards-close" type="button"></button>
        </section>
      </div>
      <div id="dm-login-modal" class="overlay hidden" aria-hidden="true">
        <section class="modal">
          <button id="dm-login-close" type="button"></button>
          <input id="dm-login-pin" />
          <button id="dm-login-submit" type="button"></button>
        </section>
      </div>
      <div id="dm-notifications-modal" class="overlay hidden" aria-hidden="true">
        <section class="modal">
          <button id="dm-notifications-close" type="button"></button>
          <button id="dm-notifications-export" type="button"></button>
          <button id="dm-notifications-clear" type="button"></button>
          <ol id="dm-notifications-list"></ol>
        </section>
      </div>
    `;
  }

  function createCatalogForm(type, { fields = [] } = {}) {
    const form = document.createElement('form');
    form.dataset.catalogForm = type;
    form.setAttribute('data-catalog-form', type);
    form.noValidate = true;

    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    form.appendChild(nameInput);

    fields.forEach(key => {
      const input = document.createElement('input');
      input.name = key;
      if (key === 'bonusValue' || key === 'quantity') {
        input.type = 'number';
      } else {
        input.type = 'text';
      }
      form.appendChild(input);
    });

    const recipientSelect = document.createElement('select');
    recipientSelect.name = testHooks.CATALOG_RECIPIENT_FIELD_KEY;
    recipientSelect.dataset.catalogField = testHooks.CATALOG_RECIPIENT_FIELD_KEY;
    recipientSelect.dataset.placeholder = testHooks.CATALOG_RECIPIENT_PLACEHOLDER;
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = testHooks.CATALOG_RECIPIENT_PLACEHOLDER;
    recipientSelect.appendChild(placeholderOption);
    form.appendChild(recipientSelect);

    document.body.appendChild(form);
    testHooks.catalogForms.set(type, form);
    return form;
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(async () => {
    jest.resetModules();
    consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => {});

    const originalBtoa = global.btoa;
    global.btoa = jest.fn(() => 'test-device');
    restoreBtoa = () => {
      if (originalBtoa) {
        global.btoa = originalBtoa;
      } else {
        delete global.btoa;
      }
    };

    originalAddEventListener = document.addEventListener.bind(document);
    document.addEventListener = (type, listener, options) => {
      if (type === 'DOMContentLoaded') {
        deferredEvents.set(type, listener);
        return;
      }
      originalAddEventListener(type, listener, options);
    };

    sessionStorage.clear();
    localStorage.clear();
    setupDmDom();

    const readyDescriptor = Object.getOwnPropertyDescriptor(document, 'readyState');
    restoreReadyState = () => {
      if (readyDescriptor) {
        Object.defineProperty(document, 'readyState', readyDescriptor);
      } else {
        delete document.readyState;
      }
    };
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });

    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));

    global.toast = jest.fn();
    global.dismissToast = jest.fn();
    window.dmNotify = jest.fn();
    window.requestAnimationFrame = cb => cb();
    window.cancelAnimationFrame = jest.fn();
    global.BroadcastChannel = class {
      constructor() {}
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
      close() {}
    };

    const listCharactersMock = jest.fn(async () => ['Nova', 'Echo']);

    jest.unstable_mockModule('../scripts/characters.js', () => ({
      __esModule: true,
      listCharacters: listCharactersMock,
      loadCharacter: jest.fn(async () => ({
        items: [],
        weapons: [],
        armor: [],
        campaignLog: [],
        partials: {},
      })),
    }));
    jest.unstable_mockModule('../scripts/modal.js', () => ({
      __esModule: true,
      show: jest.fn(),
      hide: jest.fn(),
    }));
    jest.unstable_mockModule('../scripts/mini-games.js', () => ({
      __esModule: true,
      listMiniGames: jest.fn(() => []),
      getMiniGame: jest.fn(),
      getDefaultConfig: jest.fn(() => ({})),
      loadMiniGameReadme: jest.fn(async () => ''),
      formatKnobValue: jest.fn(value => value),
      subscribeToDeployments: jest.fn(() => () => {}),
      refreshDeployments: jest.fn(async () => []),
      deployMiniGame: jest.fn(async () => {}),
      updateDeployment: jest.fn(async () => {}),
      deleteDeployment: jest.fn(async () => {}),
      MINI_GAME_STATUS_OPTIONS: [],
      summarizeConfig: jest.fn(() => ''),
      getStatusLabel: jest.fn(() => ''),
    }));
    jest.unstable_mockModule('../scripts/dm-catalog-sync.js', () => ({
      __esModule: true,
      storeDmCatalogPayload: jest.fn(),
    }));
    jest.unstable_mockModule('../scripts/storage.js', () => ({
      __esModule: true,
      saveCloud: jest.fn(async () => {}),
    }));

    sessionStorage.setItem('dmLoggedIn', '1');

    global.__DM_CONFIG__ = { pin: '1234', deviceFingerprint: 'test-device' };

    await import('../scripts/dm.js');
    if (typeof window.dmRequireLogin !== 'function') {
      const listener = deferredEvents.get('DOMContentLoaded');
      if (listener) listener(new Event('DOMContentLoaded'));
      await flushPromises();
    }
    testHooks = window.__dmTestHooks;
    if (!testHooks) {
      await flushPromises();
      testHooks = window.__dmTestHooks;
    }
    expect(testHooks).toBeTruthy();

    const charactersModule = await import('../scripts/characters.js');
    loadCharacterMock = charactersModule.loadCharacter;
    loadCharacterMock.mockClear();
    loadCharacterMock.mockImplementation(async () => ({
      items: [],
      weapons: [],
      armor: [],
      campaignLog: [],
      partials: {},
    }));

    const storageModule = await import('../scripts/storage.js');
    saveCloudMock = storageModule.saveCloud;
    saveCloudMock.mockClear();
    saveCloudMock.mockImplementation(async () => {});

    testHooks.catalogForms.clear();
    weaponForm = createCatalogForm('weapons', { fields: ['damage'] });
    armorForm = createCatalogForm('armor', { fields: ['bonusValue', 'capacity'] });
    itemForm = createCatalogForm('items', { fields: ['uses', 'size', 'quantity'] });

    await testHooks.populateCatalogRecipients();
    await flushPromises();
  });

  afterEach(() => {
    consoleErrorMock?.mockRestore();
    document.addEventListener = originalAddEventListener;
    deferredEvents.clear();
    restoreBtoa?.();
    restoreReadyState?.();
    document.body.innerHTML = '';
    delete window.matchMedia;
    delete global.toast;
    delete global.dismissToast;
    delete window.dmNotify;
    delete window.requestAnimationFrame;
    delete window.cancelAnimationFrame;
    delete global.BroadcastChannel;
    delete global.__DM_CONFIG__;
  });

  test('populates roster recipients across catalog forms', async () => {
    const key = testHooks.CATALOG_RECIPIENT_FIELD_KEY;
    const weaponRecipient = weaponForm.querySelector(`select[data-catalog-field="${key}"]`);
    const armorRecipient = armorForm.querySelector(`select[data-catalog-field="${key}"]`);
    const itemRecipient = itemForm.querySelector(`select[data-catalog-field="${key}"]`);

    expect(weaponRecipient).toBeTruthy();
    expect(armorRecipient).toBeTruthy();
    expect(itemRecipient).toBeTruthy();

    const weaponValues = Array.from(weaponRecipient.options).map(option => option.value);
    const armorValues = Array.from(armorRecipient.options).map(option => option.value);
    const itemValues = Array.from(itemRecipient.options).map(option => option.value);

    expect(weaponValues).toEqual(expect.arrayContaining(['', 'Nova', 'Echo']));
    expect(armorValues).toEqual(expect.arrayContaining(['', 'Nova', 'Echo']));
    expect(itemValues).toEqual(expect.arrayContaining(['', 'Nova', 'Echo']));

    const retained = document.createElement('option');
    retained.value = 'Custom Hero';
    retained.textContent = 'Custom Hero';
    weaponRecipient.appendChild(retained);
    weaponRecipient.value = 'Custom Hero';
    armorRecipient.value = 'Echo';

    await testHooks.populateCatalogRecipients();
    await flushPromises();

    expect(weaponRecipient.value).toBe('Custom Hero');
    expect(Array.from(weaponRecipient.options).map(option => option.value)).toContain('Custom Hero');
    expect(armorRecipient.value).toBe('Echo');
  });

  test('compileCatalogNotes includes size and capacity sections', () => {
    const notes = testHooks.compileCatalogNotes({
      description: 'Compact field kit for infiltration teams.',
      size: 'Backpack',
      capacity: '2 slots',
    });
    expect(notes).toContain('Size: Backpack');
    expect(notes).toContain('Capacity: 2 slots');
  });

  test('convertCatalogPayloadToEquipment includes size and capacity in item notes', () => {
    const equipment = testHooks.convertCatalogPayloadToEquipment({
      type: 'items',
      metadata: {
        name: 'Field Kit',
        description: 'Compact field kit for infiltration teams.',
        size: 'Backpack',
        capacity: '2 slots',
        uses: '3 charges',
        quantity: '1',
      },
    });
    expect(equipment).toBeTruthy();
    expect(equipment?.data?.notes).toContain('Size: Backpack');
    expect(equipment?.data?.notes).toContain('Capacity: 2 slots');
  });

  test('weapon catalog submission with recipient delivers equipment', async () => {
    weaponForm.reportValidity = jest.fn(() => true);
    weaponForm.querySelector('input[name="name"]').value = 'Nova Blaster';
    weaponForm.querySelector('input[name="damage"]').value = '2d6';
    const key = testHooks.CATALOG_RECIPIENT_FIELD_KEY;
    const weaponRecipient = weaponForm.querySelector(`select[data-catalog-field="${key}"]`);
    weaponRecipient.value = 'Nova';

    await testHooks.handleCatalogSubmit({
      preventDefault: jest.fn(),
      currentTarget: weaponForm,
    });
    await flushPromises();

    const stagedCall = [...global.toast.mock.calls].reverse().find(([message]) => message.includes('entry staged'));
    expect(stagedCall?.[0]).toContain('→ Nova');
    expect(global.toast).toHaveBeenCalledWith(expect.stringContaining('Granted weapon'), 'success');
  });

  test('deliverCatalogEquipment returns item with notes including size and capacity', async () => {
    const result = await testHooks.deliverCatalogEquipment({
      type: 'items',
      label: 'Items',
      recipient: 'Nova',
      metadata: {
        name: 'Field Kit',
        description: 'Compact field kit for infiltration teams.',
        size: 'Backpack',
        capacity: '2 slots',
        uses: '3 charges',
        quantity: '1',
      },
    });

    expect(result?.results?.item?.notes).toContain('Size: Backpack');
    expect(result?.results?.item?.notes).toContain('Capacity: 2 slots');
  });

  test('deliverCatalogEquipment preserves accessory armor slot', async () => {
    const result = await testHooks.deliverCatalogEquipment({
      type: 'armor',
      label: 'Armor',
      recipient: 'Nova',
      metadata: {
        name: 'Neural Halo',
        slot: 'Accessory',
        bonusValue: '2',
        equipped: 'true',
      },
    });

    expect(result?.results?.armor?.slot).toBe('Accessory');
    expect(result?.save?.armor?.[0]?.slot).toBe('Accessory');
  });

  test('armor catalog submission with recipient delivers equipment', async () => {
    armorForm.reportValidity = jest.fn(() => true);
    armorForm.querySelector('input[name="name"]').value = 'Nova Shield';
    armorForm.querySelector('input[name="bonusValue"]').value = '2';
    armorForm.querySelector('input[name="capacity"]').value = '2 slots';
    const key = testHooks.CATALOG_RECIPIENT_FIELD_KEY;
    const armorRecipient = armorForm.querySelector(`select[data-catalog-field="${key}"]`);
    armorRecipient.value = 'Echo';

    await testHooks.handleCatalogSubmit({
      preventDefault: jest.fn(),
      currentTarget: armorForm,
    });
    await flushPromises();

    const stagedCall = [...global.toast.mock.calls].reverse().find(([message]) => message.includes('entry staged'));
    expect(stagedCall?.[0]).toContain('→ Echo');
    expect(global.toast).toHaveBeenCalledWith(expect.stringContaining('Granted armor'), 'success');
  });
});
