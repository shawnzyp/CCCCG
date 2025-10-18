import { jest } from '@jest/globals';

describe('dm quick rewards forms', () => {
  let restoreReadyState;

  beforeEach(() => {
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
                  <ul id="dm-credit-history"></ul>
                  <button id="dm-credit-history-export"></button>
                  <button id="dm-credit-history-clear"></button>
                </div>
                <section class="dm-quickRewards">
                  <div class="dm-quickRewards__header">
                    <label for="dm-reward-target"></label>
                    <select id="dm-reward-target" multiple></select>
                    <p id="dm-reward-target-hint"></p>
                  </div>
                  <div class="dm-quickRewards__grid">
                    <form id="dm-reward-xp-form">
                      <div>
                        <select id="dm-reward-xp-preset"></select>
                        <button id="dm-reward-xp-preset-save" type="button">Save preset</button>
                        <button id="dm-reward-xp-preset-delete" type="button" disabled>Delete preset</button>
                      </div>
                      <select id="dm-reward-xp-mode">
                        <option value="add" selected>Add</option>
                        <option value="remove">Remove</option>
                      </select>
                      <input id="dm-reward-xp-amount" />
                      <button type="submit">Apply XP</button>
                    </form>
                    <form id="dm-reward-hpsp-form">
                      <div>
                        <select id="dm-reward-hpsp-preset"></select>
                        <button id="dm-reward-hpsp-preset-save" type="button">Save preset</button>
                        <button id="dm-reward-hpsp-preset-delete" type="button" disabled>Delete preset</button>
                      </div>
                      <select id="dm-reward-hp-mode">
                        <option value="delta" selected>Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-hp-value" />
                      <select id="dm-reward-hp-temp-mode">
                        <option value="" selected>Skip</option>
                        <option value="delta">Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-hp-temp" />
                      <select id="dm-reward-sp-mode">
                        <option value="delta" selected>Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-sp-value" />
                      <select id="dm-reward-sp-temp-mode">
                        <option value="" selected>Skip</option>
                        <option value="delta">Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-sp-temp" />
                      <button type="submit">Apply HP / SP</button>
                    </form>
                    <form id="dm-reward-resonance-form">
                      <div>
                        <select id="dm-reward-resonance-preset"></select>
                        <button id="dm-reward-resonance-preset-save" type="button">Save preset</button>
                        <button id="dm-reward-resonance-preset-delete" type="button" disabled>Delete preset</button>
                      </div>
                      <select id="dm-reward-resonance-points-mode">
                        <option value="delta" selected>Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-resonance-points" />
                      <select id="dm-reward-resonance-banked-mode">
                        <option value="delta" selected>Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-resonance-banked" />
                      <button type="submit">Apply Resonance</button>
                    </form>
                    <form id="dm-reward-faction-form">
                      <div>
                        <select id="dm-reward-faction-preset"></select>
                        <button id="dm-reward-faction-preset-save" type="button">Save preset</button>
                        <button id="dm-reward-faction-preset-delete" type="button" disabled>Delete preset</button>
                      </div>
                      <select id="dm-reward-faction-select">
                        <option value="">Select</option>
                      </select>
                      <select id="dm-reward-faction-mode">
                        <option value="delta" selected>Adjust</option>
                        <option value="set">Set</option>
                      </select>
                      <input id="dm-reward-faction-value" />
                      <button type="submit">Apply Reputation</button>
                    </form>
                  </div>
                  <section class="dm-quickRewards__history">
                    <div class="dm-quickRewards__historyHeader">
                      <h5 id="dm-reward-history-heading">Recent Activity</h5>
                      <div class="dm-quickRewards__historyActions">
                        <button id="dm-reward-history-export" type="button" disabled>Copy / Export</button>
                        <button id="dm-reward-history-clear" type="button" disabled>Clear log</button>
                      </div>
                    </div>
                    <ul id="dm-reward-history"></ul>
                  </section>
                </section>
              </div>
            </section>
          </div>
        </section>
      </div>
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
    delete global.prompt;
    delete global.confirm;
  });

  test('submits quick reward operations', async () => {
    const show = jest.fn();
    const hide = jest.fn();
    jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

    const listCharacters = jest.fn(async () => ['Alpha', 'Bravo']);
    const loadCharacter = jest.fn(async () => ({}));
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
    jest.unstable_mockModule('../scripts/storage.js', () => ({ saveCloud }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    await window.openRewards({ tab: 'resource' });
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const { setRewardExecutor } = window.__dmTestHooks;
    const rewardExecutor = jest.fn(async () => ({}));
    setRewardExecutor(rewardExecutor);

    const targetSelect = document.getElementById('dm-reward-target');
    targetSelect.innerHTML = '<option value="">Select</option><option value="Alpha">Alpha</option><option value="Bravo">Bravo</option>';
    targetSelect.disabled = false;
    targetSelect.querySelector('option[value="Alpha"]').selected = true;
    targetSelect.querySelector('option[value="Bravo"]').selected = true;
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const xpMode = document.getElementById('dm-reward-xp-mode');
    xpMode.value = 'remove';
    xpMode.dispatchEvent(new Event('change', { bubbles: true }));
    const xpAmount = document.getElementById('dm-reward-xp-amount');
    xpAmount.value = '5';
    const xpForm = document.getElementById('dm-reward-xp-form');
    xpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rewardExecutor).toHaveBeenCalledTimes(2);
    expect(rewardExecutor).toHaveBeenNthCalledWith(1, { player: 'Alpha', operations: [{ type: 'xp', amount: -5 }] });
    expect(rewardExecutor).toHaveBeenNthCalledWith(2, { player: 'Bravo', operations: [{ type: 'xp', amount: -5 }] });
    expect(global.toast.mock.calls.some(([message, type]) => message === 'XP reward applied to Alpha and Bravo' && type === 'success')).toBe(true);
    global.toast.mockClear();
    rewardExecutor.mockClear();

    document.getElementById('dm-reward-hp-mode').value = 'delta';
    document.getElementById('dm-reward-hp-value').value = '3';
    document.getElementById('dm-reward-hp-temp-mode').value = 'delta';
    document.getElementById('dm-reward-hp-temp').value = '5';
    document.getElementById('dm-reward-sp-mode').value = 'set';
    document.getElementById('dm-reward-sp-value').value = '10';
    document.getElementById('dm-reward-sp-temp-mode').value = 'set';
    document.getElementById('dm-reward-sp-temp').value = '2';
    const hpSpForm = document.getElementById('dm-reward-hpsp-form');
    hpSpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rewardExecutor).toHaveBeenCalledTimes(2);
    expect(rewardExecutor).toHaveBeenNthCalledWith(1, {
      player: 'Alpha',
      operations: [
        { type: 'hp', data: { delta: 3, tempDelta: 5 } },
        { type: 'sp', data: { value: 10, tempValue: 2 } },
      ],
    });
    expect(rewardExecutor).toHaveBeenNthCalledWith(2, {
      player: 'Bravo',
      operations: [
        { type: 'hp', data: { delta: 3, tempDelta: 5 } },
        { type: 'sp', data: { value: 10, tempValue: 2 } },
      ],
    });
    expect(global.toast.mock.calls.some(([message, type]) => message === 'HP/SP update applied to Alpha and Bravo' && type === 'success')).toBe(true);
    global.toast.mockClear();
    rewardExecutor.mockClear();

    Array.from(targetSelect.options).forEach(option => {
      option.selected = option.value === 'Alpha';
    });
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('dm-reward-resonance-points-mode').value = 'delta';
    document.getElementById('dm-reward-resonance-points').value = '1';
    document.getElementById('dm-reward-resonance-banked-mode').value = 'set';
    document.getElementById('dm-reward-resonance-banked').value = '4';
    const resonanceForm = document.getElementById('dm-reward-resonance-form');
    resonanceForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rewardExecutor).toHaveBeenCalledWith({
      player: 'Alpha',
      operations: [
        { type: 'resonance', data: { pointsDelta: 1, banked: 4 } },
      ],
    });
    rewardExecutor.mockClear();

    const factionSelect = document.getElementById('dm-reward-faction-select');
    factionSelect.innerHTML = '<option value="">Select</option><option value="omni">O.M.N.I.</option>';
    factionSelect.value = 'omni';
    document.getElementById('dm-reward-faction-mode').value = 'set';
    document.getElementById('dm-reward-faction-value').value = '250';
    const factionForm = document.getElementById('dm-reward-faction-form');
    factionForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(rewardExecutor).toHaveBeenCalledWith({
      player: 'Alpha',
      operations: [
        { type: 'faction', data: { factionId: 'omni', value: 250 } },
      ],
    });

    setRewardExecutor(null);
  });

  test('updates quick reward history after xp and hp rewards', async () => {
    const show = jest.fn();
    const hide = jest.fn();
    jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

    const listCharacters = jest.fn(async () => ['Alpha']);
    const loadCharacter = jest.fn(async () => ({
      xp: '10',
      'hp-bar': 8,
      'hp-temp': 0,
      'sp-bar': 6,
      'sp-temp': 1,
    }));
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
    jest.unstable_mockModule('../scripts/storage.js', () => ({ saveCloud }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    await window.openRewards({ tab: 'resource' });
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const targetSelect = document.getElementById('dm-reward-target');
    targetSelect.innerHTML = '<option value="">Select</option><option value="Alpha">Alpha</option>';
    targetSelect.disabled = false;
    targetSelect.querySelector('option[value="Alpha"]').selected = true;
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const xpAmount = document.getElementById('dm-reward-xp-amount');
    xpAmount.value = '5';
    document.getElementById('dm-reward-xp-mode').value = 'add';
    const xpForm = document.getElementById('dm-reward-xp-form');
    xpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const rewardHistory = document.getElementById('dm-reward-history');
    expect(rewardHistory.children.length).toBeGreaterThan(0);
    expect(rewardHistory.children[0].textContent).toContain('DM XP Reward');

    document.getElementById('dm-reward-hp-mode').value = 'delta';
    document.getElementById('dm-reward-hp-value').value = '4';
    document.getElementById('dm-reward-hp-temp-mode').value = 'delta';
    document.getElementById('dm-reward-hp-temp').value = '2';
    document.getElementById('dm-reward-sp-mode').value = 'delta';
    document.getElementById('dm-reward-sp-value').value = '3';
    document.getElementById('dm-reward-sp-temp-mode').value = 'set';
    document.getElementById('dm-reward-sp-temp').value = '5';
    const hpForm = document.getElementById('dm-reward-hpsp-form');
    hpForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(rewardHistory.children.length).toBeGreaterThanOrEqual(3);
    expect(rewardHistory.children[0].textContent).toContain('DM HP Update');
    expect(rewardHistory.children[1].textContent).toContain('DM SP Update');
    expect(Array.from(rewardHistory.children).some(node => node.textContent.includes('DM XP Reward'))).toBe(true);

    const rewardHistoryClear = document.getElementById('dm-reward-history-clear');
    const rewardHistoryExport = document.getElementById('dm-reward-history-export');
    expect(rewardHistoryClear.disabled).toBe(false);
    expect(rewardHistoryExport.disabled).toBe(false);

    const storedRaw = localStorage.getItem('cc:dm-reward-history');
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw);
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.length).toBeGreaterThanOrEqual(3);
  });

  test('quick reward presets persist and respect target availability', async () => {
    const show = jest.fn();
    const hide = jest.fn();
    jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

    const listCharacters = jest.fn(async () => ['Alpha', 'Bravo']);
    const loadCharacter = jest.fn(async () => ({}));
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
    jest.unstable_mockModule('../scripts/storage.js', () => ({ saveCloud }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    await window.openRewards({ tab: 'resource' });
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const targetSelect = document.getElementById('dm-reward-target');
    targetSelect.innerHTML = '<option value="">Select</option><option value="Alpha">Alpha</option><option value="Bravo">Bravo</option>';
    targetSelect.disabled = false;
    targetSelect.querySelector('option[value="Alpha"]').selected = true;
    targetSelect.querySelector('option[value="Bravo"]').selected = true;
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    document.getElementById('dm-reward-xp-mode').value = 'remove';
    document.getElementById('dm-reward-xp-amount').value = '5';

    global.prompt = jest.fn(() => 'Squad XP');
    const xpSave = document.getElementById('dm-reward-xp-preset-save');
    xpSave.click();

    const { QUICK_REWARD_PRESETS_STORAGE_KEY } = window.__dmTestHooks;
    const raw = localStorage.getItem(QUICK_REWARD_PRESETS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const storedPresets = JSON.parse(raw);
    expect(storedPresets).toMatchObject({ version: 1 });
    expect(storedPresets.cards?.xp?.[0]).toMatchObject({
      name: 'Squad XP',
      values: { mode: 'remove', amount: '5' },
      targets: ['Alpha', 'Bravo'],
    });

    const xpPresetSelect = document.getElementById('dm-reward-xp-preset');
    const savedId = xpPresetSelect.value;
    expect(savedId).toBeTruthy();

    document.getElementById('dm-reward-xp-mode').value = 'add';
    document.getElementById('dm-reward-xp-amount').value = '12';

    targetSelect.innerHTML = '<option value="Alpha">Alpha</option><option value="Charlie">Charlie</option>';
    targetSelect.disabled = false;
    Array.from(targetSelect.options).forEach(option => {
      option.selected = option.value === 'Charlie';
    });
    targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    global.toast.mockClear();

    xpPresetSelect.value = savedId;
    xpPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.getElementById('dm-reward-xp-mode').value).toBe('remove');
    expect(document.getElementById('dm-reward-xp-amount').value).toBe('5');
    const selectedTargets = Array.from(targetSelect.selectedOptions).map(option => option.value);
    expect(selectedTargets).toEqual(['Alpha']);
    expect(global.toast.mock.calls.some(([message, type]) => message === 'Loaded XP preset "Squad XP"' && type === 'info')).toBe(true);
    expect(global.toast.mock.calls.some(([message, type]) => message === 'Some preset recipients are unavailable' && type === 'info')).toBe(true);

    global.toast.mockClear();
    const xpDelete = document.getElementById('dm-reward-xp-preset-delete');
    expect(xpDelete.disabled).toBe(false);
    global.confirm = jest.fn(() => true);

    xpDelete.click();

    expect(global.confirm).toHaveBeenCalledWith('Delete XP preset "Squad XP"?');
    expect(localStorage.getItem(QUICK_REWARD_PRESETS_STORAGE_KEY)).toBeNull();
    expect(xpPresetSelect.value).toBe('');
    expect(xpDelete.disabled).toBe(true);
    expect(global.toast.mock.calls.some(([message, type]) => message === 'Deleted XP preset "Squad XP"' && type === 'info')).toBe(true);
  });
});
