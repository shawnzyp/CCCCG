import { jest } from '@jest/globals';

const createStubElement = () => ({
  innerHTML: '',
  textContent: '',
  value: '',
  checked: false,
  disabled: false,
  hidden: false,
  dataset: {},
  style: {
    setProperty: () => {},
    removeProperty: () => {},
    getPropertyValue: () => '',
  },
  classList: {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  },
  setAttribute: () => {},
  removeAttribute: () => {},
  appendChild: () => {},
  prepend: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  focus: () => {},
  blur: () => {},
  click: () => {},
  getBoundingClientRect: () => ({ width: 0, height: 0 }),
  add: () => {},
  options: [],
  contains: () => false,
});

describe('navigation tab activation guards', () => {
  let activateTabMock;
  let triggerTabIconAnimationMock;
  let originalPointerEvent;
  let originalGetElementById;
  let originalQuerySelector;
  let originalQuerySelectorAll;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <header></header>
      <button class="tab" data-go="combat">
        <span class="tab__icon"></span>
      </button>
      <fieldset data-tab="combat"></fieldset>
    `;

    originalPointerEvent = global.PointerEvent;
    global.PointerEvent = global.PointerEvent
      || class extends Event {
        constructor(type, options = {}) {
          super(type, options);
          this.pointerType = options.pointerType || '';
        }
      };

    originalGetElementById = document.getElementById.bind(document);
    originalQuerySelector = document.querySelector.bind(document);
    originalQuerySelectorAll = document.querySelectorAll.bind(document);

    document.getElementById = (id) => originalGetElementById(id) || createStubElement();
    document.querySelector = (selector) => originalQuerySelector(selector) || createStubElement();
    document.querySelectorAll = (selector) => {
      const results = originalQuerySelectorAll(selector);
      if (!results || results.length === 0) {
        return [];
      }
      return results;
    };

    activateTabMock = jest.fn(() => true);
    triggerTabIconAnimationMock = jest.fn();

    if (!window.matchMedia) {
      window.matchMedia = () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      });
    }

    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
        saveData: false,
      }
    });

    jest.unstable_mockModule('../scripts/helpers.js', () => ({
      $: (selector) => document.querySelector(selector),
      qs: (selector) => document.querySelector(selector),
      qsa: (selector) => Array.from(document.querySelectorAll(selector)),
      num: Number,
      mod: (value) => value,
      calculateArmorBonus: () => 0,
      revertAbilityScore: () => 0,
    }));

    jest.unstable_mockModule('../scripts/dice-result.js', () => ({
      ensureDiceResultRenderer: () => () => {},
    }));

    jest.unstable_mockModule('../scripts/faction.js', () => ({
      setupFactionRepTracker: () => {},
      ACTION_HINTS: {},
      updateFactionRep: () => {},
      migratePublicOpinionSnapshot: (value) => value,
    }));

    jest.unstable_mockModule('../scripts/characters.js', () => ({
      currentCharacter: () => ({ name: 'Hero' }),
      setCurrentCharacter: () => {},
      listCharacters: async () => [],
      loadCharacter: async () => ({}),
      loadBackup: async () => null,
      listBackups: async () => [],
      deleteCharacter: async () => {},
      saveCharacter: async () => {},
      renameCharacter: async () => {},
      listRecoverableCharacters: async () => [],
      saveAutoBackup: async () => {},
    }));

    jest.unstable_mockModule('../scripts/modal.js', () => ({ show: () => {}, hide: () => {} }));

    jest.unstable_mockModule('../scripts/tabs.js', () => ({
      activateTab: (...args) => activateTabMock(...args),
      getActiveTab: () => 'combat',
      getNavigationType: () => 'navigate',
      onTabChange: () => () => {},
      scrollToTopOfCombat: () => {},
      triggerTabIconAnimation: (...args) => triggerTabIconAnimationMock(...args),
    }));

    jest.unstable_mockModule('../scripts/player-tools-drawer.js', () => ({
      subscribe: () => () => {},
      onDrawerChange: () => () => {},
    }));

    jest.unstable_mockModule('../scripts/player-credit-events.js', () => ({
      PLAYER_CREDIT_EVENTS: {},
    }));

    jest.unstable_mockModule('../scripts/mini-games.js', () => ({
      formatKnobValue: () => '',
      getMiniGame: () => ({}),
      subscribePlayerDeployments: () => () => {},
      updateDeployment: async () => {},
    }));

    jest.unstable_mockModule('../scripts/dm-catalog-sync.js', () => ({
      getDmCatalogState: () => ({}),
      setServerDmCatalogPayloads: () => {},
      subscribeDmCatalog: () => () => {},
    }));

    jest.unstable_mockModule('../scripts/storage.js', () => ({
      cacheCloudSaves: () => {},
      subscribeCloudSaves: () => () => {},
      appendCampaignLogEntry: async () => ({}),
      deleteCampaignLogEntry: async () => {},
      fetchCampaignLogEntries: async () => [],
      subscribeCampaignLog: () => () => {},
      subscribeSyncStatus: () => () => {},
      getLastSyncStatus: () => 'idle',
      beginQueuedSyncFlush: () => {},
      getQueuedCloudSaves: async () => [],
      clearQueuedCloudSaves: async () => {},
      subscribeSyncErrors: () => () => {},
      subscribeSyncActivity: () => () => {},
      subscribeSyncQueue: () => () => {},
      getLastSyncActivity: () => null,
    }));

    jest.unstable_mockModule('../scripts/pin.js', () => ({
      hasPin: () => false,
      setPin: async () => {},
      verifyPin: async () => true,
      clearPin: async () => {},
      syncPin: async () => {},
    }));

    jest.unstable_mockModule('../scripts/catalog-utils.js', () => ({
      buildPriceIndex: () => new Map(),
      decodeCatalogBuffer: async () => [],
      extractPriceValue: () => 0,
      normalizeCatalogRow: (row) => row,
      normalizeCatalogToken: (token) => token,
      normalizePriceRow: (row) => row,
      parseCsv: async () => [],
      sanitizeNormalizedCatalogEntry: (entry) => entry,
      sortCatalogRows: (rows) => rows,
      splitValueOptions: () => [],
      tierRank: () => 0,
    }));

    jest.unstable_mockModule('../scripts/levels.js', () => ({ LEVELS: [] }));

    jest.unstable_mockModule('../scripts/power-metadata.js', () => ({
      POWER_ACTION_TYPES: [],
      POWER_DAMAGE_DICE: [],
      POWER_DAMAGE_TYPES: [],
      POWER_DURATIONS: [],
      POWER_EFFECT_TAGS: [],
      POWER_INTENSITIES: [],
      POWER_ON_SAVE_OPTIONS: [],
      POWER_RANGE_QUICK_VALUES: [],
      POWER_RANGE_UNITS: [],
      POWER_SAVE_ABILITIES: [],
      POWER_SCALING_OPTIONS: [],
      POWER_SHAPE_RANGES: [],
      POWER_STYLES: [],
      POWER_STYLE_ATTACK_DEFAULTS: {},
      POWER_STYLE_CASTER_SAVE_DEFAULTS: {},
      POWER_SUGGESTION_STRENGTHS: [],
      POWER_TARGET_SHAPES: [],
      POWER_USES: [],
      EFFECT_ON_SAVE_SUGGESTIONS: [],
      EFFECT_SAVE_SUGGESTIONS: [],
      getRangeOptionsForShape: () => [],
    }));

    jest.unstable_mockModule('../scripts/notifications.js', () => ({
      toast: () => {},
      dismissToast: () => {},
    }));

    jest.unstable_mockModule('../scripts/offline-cache.js', () => ({
      ensureOfflineAssets: async () => {},
      getStoredOfflineManifestTimestamp: () => null,
      getStoredOfflineManifestVersion: () => null,
      setStoredOfflineManifestVersion: () => {},
      supportsOfflineCaching: () => false,
    }));

    jest.unstable_mockModule('../scripts/virtualized-list.js', () => ({
      createVirtualizedList: () => ({ update: () => {}, destroy: () => {} }),
    }));

    await import('../scripts/main.js');
    activateTabMock.mockClear();
    triggerTabIconAnimationMock.mockClear();
  });

  afterEach(() => {
    if (originalPointerEvent) {
      global.PointerEvent = originalPointerEvent;
    } else {
      delete global.PointerEvent;
    }
    document.getElementById = originalGetElementById;
    document.querySelector = originalQuerySelector;
    document.querySelectorAll = originalQuerySelectorAll;
    delete navigator.connection;
    document.body.innerHTML = '';
  });

  test('tab icon animation only plays when the tab activates', () => {
    const btn = document.querySelector('.tab');
    btn.dispatchEvent(new Event('click', { bubbles: true }));
    expect(activateTabMock).toHaveBeenCalledWith('combat');
    expect(triggerTabIconAnimationMock).toHaveBeenCalledTimes(1);
  });

  test('failed instant activations do not suppress follow-up clicks', () => {
    const btn = document.querySelector('.tab');

    activateTabMock.mockReturnValueOnce(false);
    const pointerEvent = new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true });
    btn.dispatchEvent(pointerEvent);
    expect(activateTabMock).toHaveBeenCalledTimes(1);
    expect(triggerTabIconAnimationMock).not.toHaveBeenCalled();

    activateTabMock.mockReturnValueOnce(true);
    btn.dispatchEvent(new Event('click', { bubbles: true }));

    expect(activateTabMock).toHaveBeenCalledTimes(2);
    expect(triggerTabIconAnimationMock).toHaveBeenCalledTimes(1);
  });
});
