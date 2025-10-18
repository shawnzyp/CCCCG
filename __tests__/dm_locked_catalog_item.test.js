import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="abil-grid"></div>
    <div id="saves"></div>
    <div id="skills"></div>
    <div id="powers"></div>
    <input id="power-dc-formula" value="Proficiency" />
    <label><input type="radio" name="power-dc-mode" id="power-dc-mode-simple" value="Simple" /></label>
    <label><input type="radio" name="power-dc-mode" id="power-dc-mode-proficiency" value="Proficiency" checked /></label>
    <select id="power-save-ability"><option value="wis">wis</option></select>
    <input id="power-save-dc" />
    <div id="sigs"></div>
    <div id="weapons"></div>
    <div id="armors"></div>
    <div id="items"></div>
    <div id="statuses"></div>
    <div id="ongoing-effects"></div>
    <select id="alignment"><option value="Guardian (Neutral Light)">Guardian (Neutral Light)</option></select>
    <ul id="alignment-perks"></ul>
    <button id="add-weapon"></button>
    <button id="add-armor"></button>
    <button id="add-item"></button>
    <button id="add-sig"></button>
    <button id="roll-dice"></button>
    <div id="dice-out"></div>
    <select id="dice-sides"><option value="20">20</option></select>
    <input id="dice-count" value="1" />
    <select id="dice-mode"><option value="normal">normal</option></select>
    <input id="dice-mod" value="0" />
    <ul id="dice-breakdown"></ul>
    <progress id="hp-bar" value="10" max="10"></progress>
    <span id="hp-pill"></span>
    <input id="hp-amt" value="0" />
    <input id="hp-temp" value="0" />
    <button id="hp-dmg"></button>
    <button id="hp-heal"></button>
    <progress id="sp-bar" value="5" max="5"></progress>
    <span id="sp-pill"></span>
    <input id="sp-temp" value="0" />
    <button data-sp="-1" id="sp-use"></button>
    <button id="sp-full"></button>
    <fieldset id="resonance-points">
      <output id="rp-value">0</output>
      <div class="rp-track">
        <button id="rp-dec"></button>
        <button class="rp-dot" data-rp="1"></button>
        <button class="rp-dot" data-rp="2"></button>
        <button class="rp-dot" data-rp="3"></button>
        <button class="rp-dot" data-rp="4"></button>
        <button class="rp-dot" data-rp="5"></button>
        <button id="rp-inc"></button>
        <div class="rp-bank">
          <span class="rp-dot rp-bank-dot" data-bank="1"></span>
          <span class="rp-dot rp-bank-dot" data-bank="2"></span>
        </div>
      </div>
      <input type="checkbox" id="rp-trigger" />
      <button id="rp-clear-aftermath"></button>
      <span id="rp-surge-state"></span>
      <span id="rp-tag-active"></span>
      <span id="rp-tag-aftermath"></span>
    </fieldset>
    <div id="campaign-log"></div>
    <div id="campaign-backlog"></div>
    <button id="campaign-view-backlog"></button>
    <div id="modal-campaign-backlog"></div>
    <div id="modal-campaign-edit">
      <textarea id="campaign-edit-text"></textarea>
      <div id="campaign-edit-meta"></div>
      <button id="campaign-edit-save"></button>
      <button data-close="true"></button>
    </div>
    <div id="modal-log"></div>
    <div id="modal-log-full"></div>
    <textarea id="campaign-entry"></textarea>
    <button id="campaign-add"></button>
    <div id="log-action"></div>
    <div id="full-log-action"></div>
    <button id="btn-log"></button>
    <button id="log-full"></button>
    <button id="btn-campaign"></button>
    <input id="cap-check" type="checkbox" />
    <span id="cap-status">Available</span>
    <input id="xp" value="0" />
    <progress id="xp-bar"></progress>
    <span id="xp-pill"></span>
    <input id="tier" />
    <span id="omni-rep-tier"></span>
    <progress id="omni-rep-bar"></progress>
    <p id="omni-rep-perk"></p>
    <button id="omni-rep-gain"></button>
    <button id="omni-rep-lose"></button>
    <input type="hidden" id="omni-rep" value="200" />
    <div id="toast"></div>
    <div id="save-animation"></div>
    <button id="btn-save"></button>
    <button id="sync-status-trigger"></button>
    <input id="superhero" />
    <input id="secret" />
  `;
  const realGet = document.getElementById.bind(document);
  const createStub = () => ({
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
    hidden: false,
    removeAttribute: () => {},
    dataset: {},
  });
  document.getElementById = (id) => {
    const el = realGet(id);
    if (el) return el;
    if (id === 'add-power') return null;
    return createStub();
  };
}

describe('DM catalog lock enforcement', () => {
  const originalMedia = {
    load: window.HTMLMediaElement?.prototype?.load,
    play: window.HTMLMediaElement?.prototype?.play,
    pause: window.HTMLMediaElement?.prototype?.pause,
  };

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../scripts/storage.js', () => ({
      __esModule: true,
      saveLocal: jest.fn(async () => {}),
      loadLocal: jest.fn(async () => { throw new Error('no save'); }),
      deleteSave: jest.fn(async () => {}),
      listLocalSaves: jest.fn(() => []),
      getLastSyncActivity: jest.fn(() => null),
      subscribeSyncErrors: jest.fn(() => () => {}),
      subscribeSyncActivity: jest.fn(() => () => {}),
      subscribeSyncQueue: jest.fn(() => () => {}),
      subscribeSyncStatus: jest.fn(() => () => {}),
      getLastSyncStatus: jest.fn(() => null),
      beginQueuedSyncFlush: jest.fn(),
      getQueuedCloudSaves: jest.fn(async () => []),
      clearQueuedCloudSaves: jest.fn(async () => {}),
      appendCampaignLogEntry: jest.fn(async entry => entry),
      deleteCampaignLogEntry: jest.fn(async () => {}),
      fetchCampaignLogEntries: jest.fn(async () => []),
      subscribeCampaignLog: jest.fn(() => () => {}),
      cacheCloudSaves: jest.fn(async () => {}),
      subscribeCloudSaves: jest.fn(() => () => {}),
      saveCloud: jest.fn(async () => {}),
      loadCloud: jest.fn(async () => null),
      deleteCloud: jest.fn(async () => {}),
      listCloudSaves: jest.fn(async () => []),
      listCloudBackups: jest.fn(async () => []),
      listCloudBackupNames: jest.fn(async () => []),
      loadCloudBackup: jest.fn(async () => null),
      saveCloudAutosave: jest.fn(async () => {}),
      listCloudAutosaves: jest.fn(async () => []),
      listCloudAutosaveNames: jest.fn(async () => []),
      loadCloudAutosave: jest.fn(async () => null),
    }));
    localStorage.clear();
    sessionStorage.clear();
    setupDom();
    if (window.HTMLMediaElement) {
      Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
        configurable: true,
        value: jest.fn(),
      });
      Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: jest.fn().mockResolvedValue(),
      });
      Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
        configurable: true,
        value: jest.fn(),
      });
    }
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addListener: () => {}, removeListener: () => {} });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ entries: [], prices: [] }),
    });
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
    if (window.HTMLMediaElement) {
      const proto = window.HTMLMediaElement.prototype;
      if (originalMedia.load) {
        Object.defineProperty(proto, 'load', { configurable: true, value: originalMedia.load });
      } else {
        delete proto.load;
      }
      if (originalMedia.play) {
        Object.defineProperty(proto, 'play', { configurable: true, value: originalMedia.play });
      } else {
        delete proto.play;
      }
      if (originalMedia.pause) {
        Object.defineProperty(proto, 'pause', { configurable: true, value: originalMedia.pause });
      } else {
        delete proto.pause;
      }
    }
  });

  test('locked DM entry cannot be added without DM session', async () => {
    const module = await import('../scripts/main.js');
    const { addEntryToSheet } = module;
    const items = document.getElementById('items');
    const before = items.children.length;

    const entry = {
      name: 'DM Relay',
      section: 'DM Catalog',
      type: 'Item',
      tier: 'T3',
      dmEntry: true,
      dmLock: true,
      priceText: '₡1000',
    };

    const result = addEntryToSheet(entry);
    expect(result).toBeNull();
    expect(items.children.length).toBe(before);
    expect(document.getElementById('toast').textContent).toMatch(/locked/i);
  });

  test('locked DM entry can be added when DM session active', async () => {
    sessionStorage.setItem('dmLoggedIn', '1');
    const module = await import('../scripts/main.js');
    const { addEntryToSheet } = module;
    const items = document.getElementById('items');

    const entry = {
      name: 'DM Relay',
      section: 'DM Catalog',
      type: 'Item',
      tier: 'T3',
      dmEntry: true,
      dmLock: true,
      priceText: '₡1000',
    };

    const card = addEntryToSheet(entry);
    expect(card).not.toBeNull();
    expect(items.children.length).toBe(1);
    const editable = Array.from(card.querySelectorAll('input,select,textarea'))
      .filter(field => field.type !== 'hidden');
    expect(editable.every(field => field.disabled === false)).toBe(true);
    const delBtn = card.querySelector('[data-act="del"]');
    expect(delBtn).not.toBeNull();
    expect(delBtn.hidden).toBe(false);
    const badge = card.querySelector('[data-role="dm-lock-tag"]');
    expect(badge).not.toBeNull();
  });

  test('locked DM catalog item is read-only without DM session', async () => {
    const module = await import('../scripts/main.js');
    const { addEntryToSheet } = module;
    const entry = {
      name: 'Locked Gadget',
      section: 'DM Catalog',
      type: 'Item',
      tier: 'T1',
      dmEntry: true,
      dmLock: false,
    };
    const cardInfoOverride = {
      kind: 'item',
      listId: 'items',
      data: {
        name: 'Locked Gadget',
        qty: 1,
        notes: '',
        dmLock: true,
      },
    };
    const items = document.getElementById('items');
    const card = addEntryToSheet(entry, { cardInfoOverride, toastMessage: null });
    expect(card).not.toBeNull();
    expect(items.children.length).toBe(1);
    const editable = Array.from(card.querySelectorAll('input,select,textarea'))
      .filter(field => field.type !== 'hidden');
    expect(editable.length).toBeGreaterThan(0);
    editable.forEach(field => expect(field.disabled).toBe(true));
    const delBtn = card.querySelector('[data-act="del"]');
    expect(delBtn).not.toBeNull();
    expect(delBtn.hidden).toBe(true);
    const badge = card.querySelector('[data-role="dm-lock-tag"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toMatch(/locked/i);
  });

  test('armor slot select supports accessory, other, and legacy misc values', async () => {
    const module = await import('../scripts/main.js');
    const { addEntryToSheet } = module;
    const armors = document.getElementById('armors');
    armors.innerHTML = '';

    const baseEntry = {
      name: 'Neural Halo',
      section: 'DM Catalog',
      type: 'Armor',
      rawType: 'Armor',
      perk: '',
      dmEntry: true,
    };

    const accessoryCard = addEntryToSheet(
      { ...baseEntry, slot: 'Accessory', bonus: 2 },
      { toastMessage: null }
    );
    expect(accessoryCard).not.toBeNull();
    const accessorySelect = accessoryCard.querySelector('select[data-f="slot"]');
    expect(accessorySelect).toBeTruthy();
    expect(accessorySelect.value).toBe('Accessory');
    expect(Array.from(accessorySelect.options).map(opt => opt.value)).toEqual(
      expect.arrayContaining(['Accessory', 'Other'])
    );

    const otherCard = addEntryToSheet(
      { ...baseEntry, name: 'Utility Rig', slot: 'Other', bonus: 1 },
      { toastMessage: null }
    );
    expect(otherCard).not.toBeNull();
    const otherSelect = otherCard.querySelector('select[data-f="slot"]');
    expect(otherSelect).toBeTruthy();
    expect(otherSelect.value).toBe('Other');

    const legacyCard = addEntryToSheet(
      { ...baseEntry, name: 'Legacy Charm', slot: 'Misc', bonus: 0 },
      { toastMessage: null }
    );
    expect(legacyCard).not.toBeNull();
    const legacySelect = legacyCard.querySelector('select[data-f="slot"]');
    expect(legacySelect).toBeTruthy();
    expect(legacySelect.value).toBe('Misc');
    expect(Array.from(legacySelect.options).some(opt => opt.value === 'Misc')).toBe(true);
  });
});
