import { jest } from '@jest/globals';

describe('dm credit tool confirmation flow', () => {
  let restoreReadyState;
  let modalMocks;
  let miniGameMocks;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    jest.useFakeTimers();

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
        <option value="OMNI" selected>O.M.N.I Payroll Department.</option>
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
      <div id="dm-credit-confirmation" hidden aria-hidden="true">
        <h4 id="dm-credit-confirmation-title"></h4>
        <p id="dm-credit-confirmation-message"></p>
        <dl id="dm-credit-confirmation-summary"></dl>
        <div>
          <button id="dm-credit-confirmation-cancel" type="button">Cancel</button>
          <button id="dm-credit-confirmation-approve" type="button">Confirm</button>
        </div>
      </div>
      <div id="dm-credit-undo" hidden aria-hidden="true">
        <div id="dm-credit-undo-text"></div>
        <button id="dm-credit-undo-button" type="button">Undo</button>
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

    modalMocks = {
      show: jest.fn(),
      hide: jest.fn(),
    };

    miniGameMocks = {
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

    jest.unstable_mockModule('../scripts/modal.js', () => modalMocks);
    jest.unstable_mockModule('../scripts/mini-games.js', () => miniGameMocks);
    jest.unstable_mockModule('../scripts/dm-catalog-sync.js', () => ({
      storeDmCatalogPayload: jest.fn(),
    }));
    jest.unstable_mockModule('../scripts/storage.js', () => ({
      saveCloud: jest.fn(async () => {}),
    }));
    jest.unstable_mockModule('../scripts/characters.js', () => ({
      listCharacters: jest.fn(async () => ['Test Hero']),
      loadCharacter: jest.fn(async () => ({ credits: '0', campaignLog: [] })),
    }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    restoreReadyState?.();
    delete global.toast;
    delete global.dmNotify;
    delete global.dismissToast;
    delete global.BroadcastChannel;
  });

  function populateCreditForm() {
    const creditAccountSelect = document.getElementById('dm-credit-account');
    creditAccountSelect.innerHTML = '<option value="">Select…</option><option value="Test Hero">Test Hero</option>';
    creditAccountSelect.disabled = false;
    creditAccountSelect.value = 'Test Hero';
    creditAccountSelect.dispatchEvent(new Event('change'));

    const creditAmountInput = document.getElementById('dm-credit-amount');
    creditAmountInput.value = '25';
    creditAmountInput.dispatchEvent(new Event('input'));

    const creditSenderSelect = document.getElementById('dm-credit-sender');
    creditSenderSelect.value = 'OMNI';
    creditSenderSelect.dispatchEvent(new Event('change'));

    const creditMemo = document.getElementById('dm-credit-memo');
    creditMemo.value = 'Test memo';
    creditMemo.dispatchEvent(new Event('input'));
  }

  async function waitForExpectation(check, attempts = 25) {
    for (let i = 0; i < attempts; i += 1) {
      if (check()) return;
      await Promise.resolve();
    }
    throw new Error('Condition not met in waitForExpectation');
  }

  test('requires confirmation before executing credit transfer', async () => {
    const hooks = window.__dmTestHooks;
    const rewardExecutor = jest.fn().mockResolvedValue({ timestampIso: '2023-01-01T00:00:00.000Z' });
    hooks.setRewardExecutor(rewardExecutor);

    populateCreditForm();

    const creditSubmit = document.getElementById('dm-credit-submit');
    creditSubmit.disabled = false;
    creditSubmit.click();

    const confirm = document.getElementById('dm-credit-confirmation');
    expect(confirm.hidden).toBe(false);
    expect(rewardExecutor).not.toHaveBeenCalled();

    document.getElementById('dm-credit-confirmation-approve').click();
    await waitForExpectation(() => rewardExecutor.mock.calls.length === 1);

    expect(rewardExecutor).toHaveBeenCalledTimes(1);
    const payload = rewardExecutor.mock.calls[0][0];
    expect(payload).toMatchObject({ player: 'Test Hero' });
    expect(payload.operations[0]).toMatchObject({
      type: 'credits',
      transactionType: 'Deposit',
      sender: 'OMNI',
    });
    expect(document.getElementById('dm-credit-undo').hidden).toBe(false);
    expect(confirm.hidden).toBe(true);
    expect(sessionStorage.getItem('cc:dm-credit-last-transaction')).not.toBeNull();
  });

  test('canceling confirmation restores submit state without executing', async () => {
    const hooks = window.__dmTestHooks;
    const rewardExecutor = jest.fn().mockResolvedValue({ timestampIso: '2023-01-01T00:00:00.000Z' });
    hooks.setRewardExecutor(rewardExecutor);

    populateCreditForm();

    const creditSubmit = document.getElementById('dm-credit-submit');
    creditSubmit.disabled = false;
    creditSubmit.click();

    const confirm = document.getElementById('dm-credit-confirmation');
    expect(confirm.hidden).toBe(false);

    document.getElementById('dm-credit-confirmation-cancel').click();
    await Promise.resolve();

    expect(rewardExecutor).not.toHaveBeenCalled();
    expect(confirm.hidden).toBe(true);
    expect(creditSubmit.disabled).toBe(false);
  });

  test('undo reverses the most recent transfer', async () => {
    populateCreditForm();

    const creditSubmit = document.getElementById('dm-credit-submit');
    creditSubmit.disabled = false;
    creditSubmit.click();
    const confirm = document.getElementById('dm-credit-confirmation');
    expect(confirm.hidden).toBe(false);
    await Promise.resolve();
    document.getElementById('dm-credit-confirmation-approve').click();
    await waitForExpectation(() => global.toast.mock.calls.some(call => call[0].includes('Deposited')));
    await waitForExpectation(() => !document.getElementById('dm-credit-undo').hidden);

    const undoButton = document.getElementById('dm-credit-undo-button');
    undoButton.click();
    await waitForExpectation(() => global.toast.mock.calls.some(call => call[0].includes('Transfer reversed')));

    const depositToast = global.toast.mock.calls.find(call => call[0].includes('Deposited'));
    const debitToast = global.toast.mock.calls.find(call => call[0].includes('Debited'));
    const undoToast = global.toast.mock.calls.find(call => call[0].includes('Transfer reversed'));
    expect(depositToast).toBeDefined();
    expect(depositToast?.[0]).toContain('₡25.00');
    expect(debitToast).toBeDefined();
    expect(debitToast?.[0]).toContain('Undo:');
    expect(undoToast).toBeDefined();
    expect(document.getElementById('dm-credit-undo').hidden).toBe(true);
    expect(sessionStorage.getItem('cc:dm-credit-last-transaction')).toBeNull();
    expect(global.toast.mock.calls.some(call => call[0] === 'Failed to deliver rewards')).toBe(false);
  });
});
