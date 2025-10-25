import { jest } from '@jest/globals';

const createStubElement = () => ({
  innerHTML: '',
  textContent: '',
  value: '',
  checked: false,
  disabled: false,
  hidden: false,
  dataset: {},
  style: { setProperty: () => {}, getPropertyValue: () => '' },
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: function (name, value) { this.dataset ||= {}; if (name.startsWith('data-')) { this.dataset[name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value; } },
  removeAttribute: function (name) { if (name.startsWith('data-')) { const key = name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()); delete this.dataset?.[key]; } },
  appendChild: () => {},
  prepend: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  focus: () => {},
  blur: () => {},
  click: () => {},
  closest: () => null,
  add: () => {},
});

const drawerSubscribers = [];

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  drawerSubscribers.length = 0;

  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} });
  }

  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  window.cancelAnimationFrame = (handle) => clearTimeout(handle);

  global.BroadcastChannel = jest.fn(() => ({ addEventListener: () => {}, postMessage: () => {} }));
  global.fetch = jest.fn(async () => ({ text: async () => '', json: async () => ({}) }));

  document.body.innerHTML = `
    <div id="player-tools-tab" aria-label="Toggle player tools drawer"></div>
    <div id="player-tools-drawer"></div>
    <div id="toast"></div>
  `;

  const realGet = document.getElementById.bind(document);
  document.getElementById = (id) => realGet(id) || createStubElement();
  const realQuery = document.querySelector.bind(document);
  document.querySelector = (selector) => realQuery(selector) || createStubElement();
  document.querySelectorAll = (selector) => {
    const node = realQuery(selector);
    return node ? [node] : [];
  };
});

afterEach(() => {
  delete global.BroadcastChannel;
  delete global.fetch;
  document.body.innerHTML = '';
});

jest.unstable_mockModule('../scripts/helpers.js', () => ({
  $: (id) => document.getElementById(id),
  qs: (sel) => document.querySelector(sel),
  qsa: (sel) => Array.from(document.querySelectorAll(sel)),
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
  migratePublicOpinionSnapshot: (data) => data,
}));

jest.unstable_mockModule('../scripts/characters.js', () => ({
  currentCharacter: () => ({ name: 'Test Hero', id: 'hero-1' }),
  setCurrentCharacter: () => {},
  listCharacters: async () => ['Test Hero'],
  loadCharacter: async () => ({ campaignLog: [] }),
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
  activateTab: () => {},
  getActiveTab: () => 'overview',
  getNavigationType: () => 'hash',
  onTabChange: () => () => {},
  scrollToTopOfCombat: () => {},
  triggerTabIconAnimation: () => {},
}));

jest.unstable_mockModule('../scripts/player-tools-drawer.js', () => ({
  subscribe: (callback) => {
    if (typeof callback === 'function') drawerSubscribers.push(callback);
    return () => {};
  },
  onDrawerChange: () => () => {},
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
  appendCampaignLogEntry: async () => ({ id: 'log', t: Date.now(), name: '', text: '' }),
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
  toast: jest.fn(),
  dismissToast: jest.fn(),
}));

jest.unstable_mockModule('../scripts/offline-cache.js', () => ({
  ensureOfflineAssets: async () => {},
  getStoredOfflineManifestTimestamp: () => null,
  getStoredOfflineManifestVersion: () => null,
  setStoredOfflineManifestVersion: () => {},
  supportsOfflineCaching: () => false,
}));

jest.unstable_mockModule('../scripts/funTips.js', () => ({}));

test('reward updates persist history and badge until drawer opens', async () => {
  const { toast } = await import('../scripts/notifications.js');
  await import('../scripts/main.js');

  expect(drawerSubscribers.length).toBeGreaterThan(0);
  const drawerCallback = drawerSubscribers[0];

  const historyEntry = {
    id: 'reward-xp-test',
    name: 'DM XP Reward',
    text: 'Granted 500 XP (Total: 500)',
    timestamp: '2024-06-01T00:00:00.000Z',
  };

  const payload = {
    kind: 'xp',
    player: 'Hero',
    message: 'Granted 500 XP (Total: 500)',
    timestamp: '2024-06-01T00:00:00.000Z',
    historyEntry,
  };

  window.dispatchEvent(new MessageEvent('message', {
    data: {
      type: 'CC_REWARD_UPDATE',
      payload,
      historyEntry,
    },
  }));

  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast.mock.calls[0][0]).toBe('Granted 500 XP (Total: 500)');

  const stored = localStorage.getItem('cc:player-reward-history');
  expect(stored).toBeTruthy();
  const parsed = JSON.parse(stored || '[]');
  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed[0]).toEqual(expect.objectContaining({
    id: 'reward-xp-test',
    name: 'DM XP Reward',
    text: 'Granted 500 XP (Total: 500)',
    kind: 'xp',
    player: 'Hero',
  }));

  const tab = document.getElementById('player-tools-tab');
  expect(tab.getAttribute('data-player-reward')).toBe('pending');

  // Duplicate event should not trigger additional toast entries
  window.dispatchEvent(new MessageEvent('message', {
    data: {
      type: 'CC_REWARD_UPDATE',
      payload,
      historyEntry,
    },
  }));
  expect(toast).toHaveBeenCalledTimes(1);

  drawerCallback({ open: true });
  expect(tab.hasAttribute('data-player-reward')).toBe(false);
  expect(localStorage.getItem('player-reward:last-viewed')).toBe('reward-xp-test');
});
