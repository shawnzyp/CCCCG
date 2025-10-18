import { jest } from '@jest/globals';

describe('dm credit debit status', () => {
  let restoreReadyState;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    global.__DM_CONFIG__ = { pin: '123123', deviceFingerprint: '' };

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
      <div id="dm-rewards-modal" class="hidden"></div>
      <button id="dm-rewards-close"></button>
      <div id="dm-rewards-tabs">
        <button data-tab="resource" class="is-active"></button>
      </div>
      <div id="dm-rewards-panels">
        <div data-panel="resource" class="is-active"></div>
      </div>
      <div id="dm-credit-card" data-player="" data-account="" data-amount="" data-memo=""></div>
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
      <ul id="dm-credit-history"></ul>
      <button id="dm-credit-history-export"></button>
      <button id="dm-credit-history-clear"></button>
    `;

    global.toast = jest.fn();
    global.dmNotify = jest.fn();
    global.dismissToast = jest.fn();

    if (!window.matchMedia) {
      window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
    }

    class MockBroadcastChannel {
      constructor() {}
      addEventListener() {}
      postMessage() {}
      close() {}
    }

    global.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    restoreReadyState?.();
    delete global.toast;
    delete global.dmNotify;
    delete global.dismissToast;
    delete global.BroadcastChannel;
    delete global.__DM_CONFIG__;
  });

  test('debit submission leaves status completed', async () => {
    const show = jest.fn();
    const hide = jest.fn();
    jest.unstable_mockModule('../scripts/modal.js', () => ({
      show,
      hide,
    }));

    const listCharacters = jest.fn(async () => []);
    const loadCharacter = jest.fn(async () => ({ credits: '50', campaignLog: [] }));
    jest.unstable_mockModule('../scripts/characters.js', () => ({
      listCharacters,
      loadCharacter,
    }));

    const miniGameMocks = {
      listMiniGames: jest.fn(() => []),
      getMiniGame: jest.fn(),
      getDefaultConfig: jest.fn(() => ({})),
      loadMiniGameReadme: jest.fn(async () => ''),
      formatKnobValue: jest.fn(),
      subscribeToDeployments: jest.fn(() => () => {}),
      refreshDeployments: jest.fn(async () => {}),
      deployMiniGame: jest.fn(async () => {}),
      updateDeployment: jest.fn(async () => {}),
      deleteDeployment: jest.fn(async () => {}),
      MINI_GAME_STATUS_OPTIONS: [],
      summarizeConfig: jest.fn(() => ''),
      getStatusLabel: jest.fn(() => ''),
    };

    jest.unstable_mockModule('../scripts/mini-games.js', () => miniGameMocks);

    const storeDmCatalogPayload = jest.fn();
    jest.unstable_mockModule('../scripts/dm-catalog-sync.js', () => ({
      storeDmCatalogPayload,
    }));

    const saveCloud = jest.fn(async () => {});
    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveCloud,
    }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    const creditAccountSelect = document.getElementById('dm-credit-account');
    creditAccountSelect.innerHTML = '<option value="">Select…</option><option value="Test Hero">Test Hero</option>';
    creditAccountSelect.disabled = false;
    creditAccountSelect.value = 'Test Hero';
    creditAccountSelect.dispatchEvent(new Event('change'));

    const creditAmountInput = document.getElementById('dm-credit-amount');
    creditAmountInput.value = '25';
    creditAmountInput.dispatchEvent(new Event('input'));

    const creditTxnType = document.getElementById('dm-credit-type');
    creditTxnType.value = 'Debit';
    creditTxnType.dispatchEvent(new Event('change'));
    expect(creditTxnType.value).toBe('Debit');

    const creditSubmit = document.getElementById('dm-credit-submit');
    creditSubmit.disabled = false;
    creditSubmit.click();

    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 10));

    const creditStatus = document.getElementById('dm-credit-status');
    const creditCard = document.getElementById('dm-credit-card');
    expect(creditSubmit.disabled).toBe(true);
    expect(global.toast.mock.calls.some(call => call[0] === 'Failed to deliver rewards')).toBe(false);
    expect(creditCard.getAttribute('data-debit-state')).toBe('completed');
    expect(creditStatus.textContent).toBe('Debit Completed');
    expect(creditStatus.classList.contains('dm-credit__status--debit')).toBe(false);
  });
});
