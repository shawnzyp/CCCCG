import { jest } from '@jest/globals';

describe('dm rewards executeRewardTransaction', () => {
  let restoreReadyState;
  let originalPostMessage;
  let broadcastInstances;

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
                <section class="dm-quickRewards">
                  <div class="dm-quickRewards__header">
                    <label for="dm-reward-target"></label>
                    <select id="dm-reward-target"></select>
                  </div>
                  <div class="dm-quickRewards__grid">
                    <form id="dm-reward-xp-form">
                      <select id="dm-reward-xp-mode">
                        <option value="add" selected>Add</option>
                        <option value="remove">Remove</option>
                      </select>
                      <input id="dm-reward-xp-amount" />
                      <button type="submit">Apply XP</button>
                    </form>
                    <form id="dm-reward-hpsp-form">
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
                </section>
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

    broadcastInstances = [];
    global.BroadcastChannel = class {
      constructor(name) {
        this.name = name;
        this.postMessage = jest.fn();
        this.addEventListener = jest.fn();
        this.close = jest.fn();
        broadcastInstances.push(this);
      }
    };
    window.BroadcastChannel = global.BroadcastChannel;

    originalPostMessage = window.postMessage;
    window.postMessage = jest.fn();
  });

  afterEach(() => {
    restoreReadyState?.();
    window.postMessage = originalPostMessage;
    delete global.toast;
    delete global.dmNotify;
    delete global.dismissToast;
    delete window.dmNotify;
    delete global.BroadcastChannel;
    delete window.BroadcastChannel;
  });

  test('applies faction rewards and broadcasts results', async () => {
    const show = jest.fn();
    const hide = jest.fn();
    jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

    const loadCharacter = jest.fn(async () => ({
      'omni-rep': '200',
      'omni-rep-bar': '200',
      partials: {
        factions: {
          omni: { value: 200, name: 'O.M.N.I.' },
        },
      },
      campaignLog: [],
    }));
    const listCharacters = jest.fn(async () => ['Alpha']);
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

    jest.unstable_mockModule('../scripts/dm-pin.js', () => ({
      __esModule: true,
      DM_PIN: { storageKey: '__dm__' },
      ensureDmPinReady: jest.fn(async () => true),
      verifyDmPin: jest.fn(async () => true),
      setDmPin: jest.fn(async () => true),
      syncDmPin: jest.fn(async () => true),
      hasDmPin: jest.fn(() => true),
      getDmPinStorageKey: () => '__dm__',
    }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    const dmNotifyMock = jest.fn();
    window.dmNotify = dmNotifyMock;
    global.dmNotify = dmNotifyMock;

    const { executeRewardTransaction } = window.__dmTestHooks;
    expect(typeof executeRewardTransaction).toBe('function');

    const result = await executeRewardTransaction({
      player: 'Alpha',
      operations: [
        { type: 'faction', data: { factionId: 'omni', delta: 15 } },
      ],
    });

    expect(loadCharacter).toHaveBeenCalledWith('Alpha', { bypassPin: true });
    expect(saveCloud).toHaveBeenCalledTimes(1);

    const saved = saveCloud.mock.calls[0][1];
    expect(saved['omni-rep']).toBe('215');
    expect(saved['omni-rep-bar']).toBe('215');
    expect(saved.partials.factions.omni.value).toBe(215);
    expect(saved.partials.factions.omni.tier).toBe('Neutral');
    expect(saved.partials.factions.omni.name).toBe('O.M.N.I.');

    expect(saved.campaignLog).toHaveLength(1);
    expect(saved.campaignLog[0].id).toContain('dm-faction');
    expect(saved.campaignLog[0].text).toContain('O.M.N.I.');

    expect(result.notifications[0]).toContain('O.M.N.I.');
    expect(global.toast).toHaveBeenCalledWith(expect.stringContaining('O.M.N.I.'), 'success');
    expect(dmNotifyMock).toHaveBeenCalledWith(
      expect.stringContaining('O.M.N.I.'),
      expect.objectContaining({ char: 'Alpha', actionScope: 'major' }),
    );

    expect(result.results.faction).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'omni',
        name: 'O.M.N.I.',
        value: 215,
        delta: 15,
        previous: 200,
        tier: expect.objectContaining({ name: 'Neutral' }),
      }),
    ]));

    expect(window.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CC_REWARD_UPDATE',
      payload: expect.objectContaining({
        kind: 'faction',
        player: 'Alpha',
        data: expect.objectContaining({ id: 'omni', value: 215, delta: 15 }),
        historyEntry: expect.objectContaining({
          name: 'DM Faction Reputation',
          text: expect.stringContaining('O.M.N.I.'),
        }),
      }),
      historyEntry: expect.objectContaining({
        name: 'DM Faction Reputation',
        text: expect.stringContaining('O.M.N.I.'),
      }),
    }), window.location.origin);
  });

  test('receives reward broadcasts and updates history', async () => {
    const show = jest.fn();
    const hide = jest.fn();
    jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

    const listCharacters = jest.fn(async () => ['Alpha']);
    const loadCharacter = jest.fn(async () => ({ campaignLog: [] }));
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

    jest.unstable_mockModule('../scripts/dm-pin.js', () => ({
      __esModule: true,
      DM_PIN: { storageKey: '__dm__' },
      ensureDmPinReady: jest.fn(async () => true),
      verifyDmPin: jest.fn(async () => true),
      setDmPin: jest.fn(async () => true),
      syncDmPin: jest.fn(async () => true),
      hasDmPin: jest.fn(() => true),
      getDmPinStorageKey: () => '__dm__',
    }));

    await import('../scripts/modal.js');
    await import('../scripts/dm.js');

    await window.openRewards({ tab: 'resource' });
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const rewardChannels = broadcastInstances.filter(channel => channel.name === 'cc:player-rewards');
    expect(rewardChannels.length).toBeGreaterThan(0);
    const rewardChannel = rewardChannels[rewardChannels.length - 1];
    expect(rewardChannel.addEventListener).toHaveBeenCalled();
    const listenerEntry = rewardChannel.addEventListener.mock.calls.find(call => call[0] === 'message');
    expect(listenerEntry).toBeDefined();
    const broadcastHandler = listenerEntry?.[1];
    expect(typeof broadcastHandler).toBe('function');

    const { clearQuickRewardHistory, getQuickRewardHistory } = window.__dmTestHooks;
    clearQuickRewardHistory({ announce: false });
    expect(getQuickRewardHistory()).toHaveLength(0);

    const timestampIso = '2024-05-01T00:00:00.000Z';
    const xpHistoryEntry = {
      id: 'dm-xp-test',
      t: Date.parse(timestampIso),
      name: 'DM XP Reward',
      text: 'Granted 500 XP (Total: 500)',
    };
    broadcastHandler({
      data: {
        type: 'CC_REWARD_UPDATE',
        payload: {
          kind: 'xp',
          player: 'Bravo',
          message: 'Granted 500 XP (Total: 500)',
          timestamp: timestampIso,
          historyEntry: xpHistoryEntry,
        },
        historyEntry: xpHistoryEntry,
      },
    });

    await Promise.resolve();
    const storedRaw = localStorage.getItem('cc:dm-reward-history');
    expect(storedRaw).toBeTruthy();
    const storedHistory = JSON.parse(storedRaw ?? '[]');
    expect(storedHistory.length).toBeGreaterThan(0);
    expect(storedHistory.some(entry => entry.name === 'DM XP Reward' && entry.text.includes('500'))).toBe(true);

    const messageTimestamp = '2024-05-02T00:00:00.000Z';
    const itemHistoryEntry = {
      id: 'dm-item-test',
      t: Date.parse(messageTimestamp),
      name: 'DM Item Reward',
      text: 'Granted item: Jet Boots',
    };
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'CC_REWARD_UPDATE',
        payload: {
          kind: 'item',
          player: 'Charlie',
          message: 'Granted item: Jet Boots',
          timestamp: messageTimestamp,
          historyEntry: itemHistoryEntry,
        },
        historyEntry: itemHistoryEntry,
      },
    }));

    await Promise.resolve();
    const updatedRaw = localStorage.getItem('cc:dm-reward-history');
    expect(updatedRaw).toBeTruthy();
    const updatedHistory = JSON.parse(updatedRaw ?? '[]');
    expect(updatedHistory.some(entry => entry.name === 'DM Item Reward' && entry.text.includes('Jet Boots'))).toBe(true);
  });
});
