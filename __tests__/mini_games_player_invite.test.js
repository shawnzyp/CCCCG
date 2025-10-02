import { jest } from '@jest/globals';

const nativeGetElementById = document.getElementById.bind(document);

function createStubElement() {
  return {
    innerHTML: '',
    value: '',
    style: { setProperty: () => {}, getPropertyValue: () => '' },
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {},
    },
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: () => {},
    click: () => {},
    add: () => {},
    textContent: '',
    disabled: false,
    hidden: true,
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  };
}

function setupDom() {
  document.body.innerHTML = `
    <div id="app-alert" class="overlay" aria-hidden="true">
      <div class="app-alert__card">
        <h2 class="app-alert__title"></h2>
        <p data-app-alert-message></p>
        <button data-app-alert-dismiss type="button"></button>
      </div>
    </div>
    <div id="toast"></div>
    <div id="abil-grid"></div>
    <div id="saves"></div>
    <div id="mini-game-invite" class="overlay hidden" aria-hidden="true">
      <section class="modal mini-game-invite">
        <header class="mini-game-invite__header">
          <h3 id="mini-game-invite-title" class="mini-game-invite__title"></h3>
          <p id="mini-game-invite-message" class="mini-game-invite__message"></p>
        </header>
        <div class="mini-game-invite__game">
          <div id="mini-game-invite-game" class="mini-game-invite__name"></div>
          <p id="mini-game-invite-tagline" class="mini-game-invite__tagline"></p>
        </div>
        <div id="mini-game-invite-summary" class="mini-game-invite__summary"></div>
        <div id="mini-game-invite-notes" class="mini-game-invite__notes" hidden>
          <h4 class="mini-game-invite__notes-title">Briefing</h4>
          <p id="mini-game-invite-notes-text" class="mini-game-invite__notes-text"></p>
        </div>
        <footer class="mini-game-invite__actions">
          <button id="mini-game-invite-decline" type="button"></button>
          <button id="mini-game-invite-accept" type="button"></button>
        </footer>
      </section>
    </div>
    <input id="superhero" value="Hero One" />
  `;

  document.getElementById = (id) => nativeGetElementById(id) || createStubElement();
}

async function initMainModule() {
  jest.resetModules();
  setupDom();
  global.fetch = jest.fn();
  global.toast = jest.fn();
  global.dismissToast = jest.fn();
  window.open = jest.fn(() => ({}));
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {} }));
  window.scrollTo = window.scrollTo || (() => {});

  const show = jest.fn();
  const hide = jest.fn();

  jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

  jest.unstable_mockModule('../scripts/helpers.js', () => ({
    $: (id) => document.getElementById(id),
    qs: (sel) => document.querySelector(sel),
    qsa: (sel) => Array.from(document.querySelectorAll(sel)),
    num: Number,
    mod: (a, b) => ((a % b) + b) % b,
    calculateArmorBonus: () => 0,
    revertAbilityScore: () => 0,
  }));

  jest.unstable_mockModule('../scripts/faction.js', () => ({
    setupFactionRepTracker: () => {},
    ACTION_HINTS: {},
    updateFactionRep: () => {},
    migratePublicOpinionSnapshot: (data) => data,
  }));

  const currentCharacter = jest.fn(() => 'Hero One');

  jest.unstable_mockModule('../scripts/characters.js', () => ({
    currentCharacter,
    setCurrentCharacter: () => {},
    listCharacters: async () => ['Hero One'],
    loadCharacter: async () => ({}),
    loadBackup: async () => ({}),
    listBackups: async () => [],
    deleteCharacter: async () => {},
    saveCharacter: async () => {},
    renameCharacter: async () => {},
    listRecoverableCharacters: async () => [],
    saveAutoBackup: async () => {},
  }));

  let subscribeCallback = null;
  const updateDeployment = jest.fn(async () => {});

  const gameDefinition = {
    id: 'clue-tracker',
    name: 'Clue Tracker',
    tagline: 'Connect the evidence',
    url: 'game.html',
    knobs: [
      { key: 'difficulty', label: 'Difficulty', type: 'number', default: 3 }
    ]
  };

  jest.unstable_mockModule('../scripts/mini-games.js', () => ({
    formatKnobValue: (knob, value) => String(value ?? ''),
    getMiniGame: () => gameDefinition,
    subscribePlayerDeployments: (player, callback) => {
      subscribeCallback = callback;
      callback([]);
      return jest.fn();
    },
    summarizeConfig: () => 'Difficulty: 3',
    updateDeployment,
  }));

  jest.unstable_mockModule('../scripts/storage.js', () => ({
    cacheCloudSaves: () => {},
    subscribeCloudSaves: () => () => {},
    appendCampaignLogEntry: async () => {},
    deleteCampaignLogEntry: async () => {},
    fetchCampaignLogEntries: async () => [],
    subscribeCampaignLog: () => () => {},
  }));

  jest.unstable_mockModule('../scripts/pin.js', () => ({
    hasPin: async () => false,
    setPin: async () => {},
    verifyPin: async () => true,
    clearPin: async () => {},
    syncPin: async () => {},
  }));

  jest.unstable_mockModule('../scripts/catalog-utils.js', () => ({
    buildPriceIndex: () => new Map(),
    decodeCatalogBuffer: () => [],
    extractPriceValue: () => 0,
    normalizeCatalogRow: (row) => row,
    normalizeCatalogToken: (token) => token,
    normalizePriceRow: (row) => row,
    parseCsv: () => [],
    sanitizeNormalizedCatalogEntry: (entry) => entry,
    sortCatalogRows: (rows) => rows,
    splitValueOptions: () => [],
    tierRank: () => 0,
  }));

  await import('../scripts/main.js');

  return {
    show,
    hide,
    getSubscribeCallback: () => subscribeCallback,
    updateDeployment,
  };
}

describe('player mini-game invitations', () => {
  test('accepting an invite updates the deployment and launches the game', async () => {
    const { show, hide, getSubscribeCallback, updateDeployment } = await initMainModule();
    const callback = getSubscribeCallback();
    expect(typeof callback).toBe('function');

    const entry = {
      id: 'mg-7',
      player: 'Hero One',
      status: 'pending',
      gameId: 'clue-tracker',
      gameName: 'Clue Tracker',
      gameUrl: 'game.html',
      config: { difficulty: 3 },
      notes: 'Finish within 5 minutes',
      createdAt: Date.now(),
    };

    callback([entry]);
    await Promise.resolve();

    expect(show).toHaveBeenCalledWith('mini-game-invite');
    const toastEl = document.getElementById('toast');
    expect(toastEl.textContent).toBe('Incoming mini-game: Clue Tracker');

    const acceptBtn = document.getElementById('mini-game-invite-accept');
    acceptBtn.dispatchEvent(new Event('click'));

    await Promise.resolve();

    expect(updateDeployment).toHaveBeenCalledWith(
      'Hero One',
      'mg-7',
      expect.objectContaining({ status: 'active' })
    );
    expect(hide).toHaveBeenCalledWith('mini-game-invite');
    expect(window.open).toHaveBeenCalledWith('game.html', '_blank', 'noopener');
    expect(toastEl.textContent).toBe('Mini-game accepted');
  });

  test('declining an invite cancels the deployment and does not launch the game', async () => {
    const { hide, getSubscribeCallback, updateDeployment } = await initMainModule();
    const callback = getSubscribeCallback();

    const entry = {
      id: 'mg-8',
      player: 'Hero One',
      status: 'pending',
      gameId: 'clue-tracker',
      gameName: 'Clue Tracker',
      gameUrl: 'game.html',
      config: { difficulty: 2 },
      createdAt: Date.now(),
    };

    callback([entry]);
    await Promise.resolve();

    window.open.mockClear();
    const toastEl = document.getElementById('toast');
    toastEl.textContent = '';

    const declineBtn = document.getElementById('mini-game-invite-decline');
    declineBtn.dispatchEvent(new Event('click'));

    await Promise.resolve();

    expect(updateDeployment).toHaveBeenCalledWith(
      'Hero One',
      'mg-8',
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(hide).toHaveBeenCalledWith('mini-game-invite');
    expect(window.open).not.toHaveBeenCalled();
    expect(toastEl.textContent).toBe('Mini-game declined');
  });
});
