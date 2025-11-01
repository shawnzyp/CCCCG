import { jest } from '@jest/globals';

describe('dm credit history filters', () => {
  let restoreReadyState;
  let originalPostMessage;
  let originalClipboard;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    const descriptor = Object.getOwnPropertyDescriptor(document, 'readyState');
    restoreReadyState = () => {
      if (descriptor) {
        Object.defineProperty(document, 'readyState', descriptor);
      } else {
        delete document.readyState;
      }
    };

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    });

    sessionStorage.setItem('dmLoggedIn', '1');

    document.body.innerHTML = `
      <button id="dm-login"></button>
      <button id="dm-tools-toggle"></button>
      <div id="dm-tools-menu"></div>
      <button id="dm-tools-tsomf"></button>
      <button id="dm-tools-notifications"></button>
      <button id="dm-tools-characters"></button>
      <button id="dm-tools-mini-games"></button>
      <button id="dm-tools-logout"></button>
      <button id="dm-tools-rewards"></button>
      <div id="dm-login-modal" class="hidden" aria-hidden="true">
        <input id="dm-login-pin" />
        <button id="dm-login-submit"></button>
      </div>
      <div id="dm-notifications-modal"></div>
      <div id="dm-notifications-list"></div>
      <button id="dm-notifications-close"></button>
      <div id="dm-rewards-modal" class="hidden">
        <section class="modal dm-rewards">
          <button id="dm-rewards-close"></button>
          <header class="dm-rewards__header"></header>
          <nav id="dm-rewards-tabs">
            <button id="dm-rewards-tab-resource" data-tab="resource" class="is-active"></button>
          </nav>
          <div id="dm-rewards-panels">
            <section id="dm-rewards-panel-resource" data-panel="resource" class="is-active">
              <div class="dm-rewards__panelContent">
                <div id="dm-credit-card" data-player="" data-account="" data-amount="" data-memo="">
                  <select id="dm-credit-account"></select>
                  <select id="dm-credit-type">
                    <option value="Deposit">Deposit</option>
                    <option value="Debit">Debit</option>
                  </select>
                  <input id="dm-credit-amount" />
                  <select id="dm-credit-sender">
                    <option value="DM" selected>DM</option>
                  </select>
                  <button id="dm-credit-submit" type="button">Submit</button>
                  <span id="dm-credit-ref"></span>
                  <span id="dm-credit-txid"></span>
                  <span id="dm-credit-footerDate"></span>
                  <span id="dm-credit-footerTime"></span>
                  <span id="dm-credit-status" class="dm-credit__status">Completed</span>
                  <textarea id="dm-credit-memo"></textarea>
                  <div id="dm-credit-memo-preview" hidden>
                    <span id="dm-credit-memo-previewText"></span>
                  </div>
                  <select id="dm-credit-history-filter-character">
                    <option value="">All characters</option>
                  </select>
                  <select id="dm-credit-history-filter-type">
                    <option value="">All types</option>
                  </select>
                  <ul id="dm-credit-history"></ul>
                  <button id="dm-credit-history-export"></button>
                  <button id="dm-credit-history-clear"></button>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    `;

    global.toast = jest.fn();
    const notifyMock = jest.fn();
    global.dmNotify = notifyMock;
    window.dmNotify = notifyMock;
    global.dismissToast = jest.fn();

    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    class MockBroadcastChannel {
      constructor() {
        this.addEventListener = jest.fn();
        this.postMessage = jest.fn();
        this.close = jest.fn();
      }
    }
    global.BroadcastChannel = MockBroadcastChannel;
    window.BroadcastChannel = MockBroadcastChannel;

    originalPostMessage = window.postMessage;
    window.postMessage = jest.fn();

    originalClipboard = navigator.clipboard;

    jest.unstable_mockModule('../scripts/modal.js', () => ({
      show: jest.fn(),
      hide: jest.fn(),
    }));

    jest.unstable_mockModule('../scripts/characters.js', () => ({
      listCharacters: jest.fn(async () => []),
      loadCharacter: jest.fn(async () => ({})),
    }));

    jest.unstable_mockModule('../scripts/mini-games.js', () => ({
      listMiniGames: jest.fn(() => []),
      getMiniGame: jest.fn(),
      getDefaultConfig: jest.fn(() => ({})),
      loadMiniGameReadme: jest.fn(async () => ''),
      formatKnobValue: jest.fn(() => ''),
      subscribeToDeployments: jest.fn(() => () => {}),
      refreshDeployments: jest.fn(async () => {}),
      deployMiniGame: jest.fn(async () => {}),
      updateDeployment: jest.fn(async () => {}),
      deleteDeployment: jest.fn(async () => {}),
      MINI_GAME_STATUS_OPTIONS: [],
      summarizeConfig: jest.fn(() => ''),
      getStatusLabel: jest.fn(() => ''),
    }));

    jest.unstable_mockModule('../scripts/dm-catalog-sync.js', () => ({
      storeDmCatalogPayload: jest.fn(),
    }));

    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveCloud: jest.fn(async () => {}),
    }));

    jest.unstable_mockModule('../scripts/dm-pin.js', () => ({
      verifyDmCredential: jest.fn(async () => true),
      upsertDmCredentialPin: jest.fn(async (username, pin) => ({
        username,
        hash: `hash-${pin}`,
        salt: 'salt-value',
        iterations: 120000,
        keyLength: 32,
        digest: 'SHA-256',
        updatedAt: Date.now(),
      })),
      getDmCredential: jest.fn(async () => null),
      loadDmCredentialRecords: jest.fn(async () => new Map()),
      resetDmCredentialCache: jest.fn(),
    }));

    jest.unstable_mockModule('../scripts/faction.js', () => ({
      FACTIONS: [],
      FACTION_NAME_MAP: new Map(),
    }));

    await import('../scripts/dm.js');
  });

  afterEach(() => {
    restoreReadyState?.();
    window.postMessage = originalPostMessage;
    if (originalClipboard === undefined) {
      delete navigator.clipboard;
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
    }
    delete global.toast;
    delete global.dmNotify;
    delete window.dmNotify;
    delete global.dismissToast;
    delete global.BroadcastChannel;
    delete window.BroadcastChannel;
  });

  function dispatchCreditUpdate(payload) {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'CC_PLAYER_UPDATE', payload } }));
  }

  function createEntry(overrides = {}) {
    return {
      account: 'main',
      amount: 10,
      type: 'Deposit',
      sender: 'DM',
      ref: `ref-${Math.random()}`,
      txid: `tx-${Math.random()}`,
      timestamp: new Date().toISOString(),
      player: 'Player One',
      memo: 'Test entry',
      ...overrides,
    };
  }

  test('renders entries matching the selected character filter', async () => {
    const firstEntry = createEntry({ txid: 'tx-1', player: 'Player One', type: 'Deposit', amount: 25 });
    const secondEntry = createEntry({ txid: 'tx-2', player: 'Player Two', type: 'Debit', amount: 15, timestamp: '2024-01-01T01:00:00.000Z' });

    dispatchCreditUpdate(firstEntry);
    dispatchCreditUpdate(secondEntry);

    const historyList = document.getElementById('dm-credit-history');
    expect(historyList).toBeTruthy();
    expect(historyList.children.length).toBe(2);

    const characterSelect = document.getElementById('dm-credit-history-filter-character');
    expect(characterSelect).toBeTruthy();
    characterSelect.value = 'Player Two';
    characterSelect.dispatchEvent(new Event('change'));

    expect(historyList.children.length).toBe(1);
    expect(historyList.textContent).toContain('Player Two');
    expect(historyList.textContent).not.toContain('Player One');

    const exportBtn = document.getElementById('dm-credit-history-export');
    expect(exportBtn.disabled).toBe(false);

    const stored = JSON.parse(localStorage.getItem('cc_dm_card'));
    expect(stored).toBeTruthy();
    expect(stored.filters).toEqual(expect.objectContaining({ character: 'Player Two' }));
  });

  test('exports only entries that match the active filters', async () => {
    const firstEntry = createEntry({ txid: 'tx-3', player: 'Player One', type: 'Deposit', amount: 40, timestamp: '2024-02-01T00:00:00.000Z' });
    const secondEntry = createEntry({ txid: 'tx-4', player: 'Player Two', type: 'Debit', amount: 20, timestamp: '2024-02-01T02:00:00.000Z' });

    dispatchCreditUpdate(firstEntry);
    dispatchCreditUpdate(secondEntry);

    const typeSelect = document.getElementById('dm-credit-history-filter-type');
    expect(typeSelect).toBeTruthy();
    typeSelect.value = 'Debit';
    typeSelect.dispatchEvent(new Event('change'));

    const clipboardWrite = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWrite },
      configurable: true,
      writable: true,
    });

    const exportBtn = document.getElementById('dm-credit-history-export');
    exportBtn.click();

    await Promise.resolve();

    expect(clipboardWrite).toHaveBeenCalledTimes(1);
    const exported = clipboardWrite.mock.calls[0][0];
    expect(exported).toContain('Debited');
    expect(exported).toContain('Player Two');
    expect(exported).not.toContain('Player One');
  });
});

