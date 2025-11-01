import { jest } from '@jest/globals';
import { TEST_DM_PIN } from '../tests/helpers/dm-pin.js';

const DM_PIN_4_DIGIT = TEST_DM_PIN.slice(0, 4);

const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
const DM_NOTIFICATION_FILTER_STORAGE_KEY = 'cc_dm_notification_filters';

function setupDom() {
  document.body.innerHTML = `
    <div id="dm-tools-menu"></div>
    <button id="dm-tools-notifications"></button>
    <button id="dm-login"></button>
    <div id="dm-login-modal" class="hidden" aria-hidden="true">
      <input id="dm-login-username" />
      <input id="dm-login-pin" />
      <button id="dm-login-submit"></button>
      <button id="dm-login-close"></button>
    </div>
    <div id="dm-notifications-modal" class="overlay hidden" aria-hidden="true">
      <section class="modal">
        <button id="dm-notifications-close" type="button"></button>
        <div class="dm-notifications__actions">
          <div class="dm-notifications__exportControls">
            <button id="dm-notifications-export" type="button"></button>
            <label for="dm-notifications-export-format">
              Export format
              <select id="dm-notifications-export-format" disabled>
                <option value="text" selected>Text</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </label>
          </div>
          <button id="dm-notifications-mark-read" type="button"></button>
          <button id="dm-notifications-clear" type="button"></button>
        </div>
        <form id="dm-notifications-filters">
          <label for="dm-notifications-filter-character">
            Character
            <select id="dm-notifications-filter-character">
              <option value="all">All characters</option>
            </select>
          </label>
          <label for="dm-notifications-filter-severity">
            Severity
            <select id="dm-notifications-filter-severity">
              <option value="all">All severities</option>
            </select>
          </label>
          <label for="dm-notifications-filter-search">
            Search
            <input id="dm-notifications-filter-search" type="search" />
          </label>
        </form>
        <ol id="dm-notifications-list"></ol>
      </section>
    </div>
  `;
}

async function initDmModule({ loggedIn = false, storedNotifications = null, notificationFilters = null } = {}) {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  delete window.__dmTestHooks;
  if (storedNotifications) {
    sessionStorage.setItem(DM_NOTIFICATIONS_KEY, JSON.stringify(storedNotifications));
  }
  if (notificationFilters) {
    localStorage.setItem(DM_NOTIFICATION_FILTER_STORAGE_KEY, JSON.stringify(notificationFilters));
  }
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
  }

  const listCharacters = jest.fn(async () => []);
  const currentCharacter = jest.fn(() => null);
  const setCurrentCharacter = jest.fn();
  const loadCharacter = jest.fn(async () => ({}));
  const show = jest.fn();
  const hide = jest.fn();
  jest.unstable_mockModule('../scripts/modal.js', () => ({
    show,
    hide,
  }));
  jest.unstable_mockModule('../scripts/characters.js', () => ({
    listCharacters,
    currentCharacter,
    setCurrentCharacter,
    loadCharacter,
  }));

  const verifyDmCredential = jest.fn(async (username, pin) => pin === DM_PIN_4_DIGIT);
  const upsertDmCredentialPin = jest.fn(async (username, pin) => ({
    username,
    hash: `hash-${pin}`,
    salt: 'salt-value',
    iterations: 120000,
    keyLength: 32,
    digest: 'SHA-256',
    updatedAt: Date.now(),
  }));

  jest.unstable_mockModule('../scripts/dm-pin.js', () => ({
    verifyDmCredential,
    upsertDmCredentialPin,
    getDmCredential: jest.fn(async () => null),
    loadDmCredentialRecords: jest.fn(async () => new Map()),
    resetDmCredentialCache: jest.fn(),
  }));

  setupDom();
  global.toast = jest.fn();
  global.dismissToast = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ entries: [] }),
    text: async () => '',
  });

  await import('../scripts/dm.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  if (loggedIn) {
    await completeLogin();
  }
}

async function completeLogin() {
  const loginPromise = window.dmRequireLogin();
  const usernameInput = document.getElementById('dm-login-username');
  usernameInput.value = 'TestDM';
  const pinInput = document.getElementById('dm-login-pin');
  pinInput.value = DM_PIN_4_DIGIT;
  const submit = document.getElementById('dm-login-submit');
  submit.dispatchEvent(new Event('click'));
  await loginPromise;
}

describe('dmNotify labels actions as DM when logged in', () => {
  beforeEach(async () => {
    await initDmModule({ loggedIn: true });
  });

  test('uses DM tag', () => {
    window.dmNotify('testing', { actionScope: 'major' });
    const list = document.getElementById('dm-notifications-list');
    expect(list.textContent).toContain('DM: testing');
  });
});

describe('DM notifications visibility', () => {
  test('does not render notifications when logged out', async () => {
    await initDmModule();
    const list = document.getElementById('dm-notifications-list');
    window.dmNotify('testing visibility', { actionScope: 'major' });
    expect(list.textContent).toBe('');
    const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
    const pending = raw ? JSON.parse(raw) : [];
    expect(pending).toHaveLength(1);
  });

  test('renders stored and pending notifications after login', async () => {
    const stored = [{ ts: '2025-01-01 00:00', char: 'System', detail: 'Stored entry', actionScope: 'major' }];
    await initDmModule();
    window.__dmTestHooks.setStoredNotifications(stored);
    const list = document.getElementById('dm-notifications-list');
    expect(list.textContent).toBe('');

    window.dmNotify('Queued while logged out', { actionScope: 'major' });
    let pending = JSON.parse(sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY));
    expect(pending).toHaveLength(1);

    await completeLogin();

    pending = JSON.parse(sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY) || '[]');
    expect(pending).toHaveLength(0);
    expect(list.textContent).toContain('System: Stored entry');
    expect(list.textContent).toContain('Queued while logged out');

    const dmBtn = document.getElementById('dm-login');
    expect(dmBtn.style.opacity).toBe('1');
  });
});

describe('DM notifications audio cues', () => {
  afterEach(() => {
    delete window.playTone;
    delete window.audioPreference;
  });

  test('plays tone when logged in', async () => {
    await initDmModule({ loggedIn: true });
    window.playTone = jest.fn();

    window.dmNotify('audio check', { actionScope: 'major' });

    expect(window.playTone).toHaveBeenCalledTimes(1);
    expect(window.playTone).toHaveBeenCalledWith('info');
  });

  test('plays tone when processing queued notifications after login', async () => {
    await initDmModule();
    window.playTone = jest.fn();

    window.dmNotify('queued tone', { actionScope: 'major' });
    expect(window.playTone).not.toHaveBeenCalled();

    await completeLogin();

    expect(window.playTone).toHaveBeenCalledTimes(1);
  });

  test('respects muted audio preference', async () => {
    await initDmModule({ loggedIn: true });
    window.playTone = jest.fn();
    window.audioPreference = 'muted';

    window.dmNotify('should stay quiet', { actionScope: 'major' });

    expect(window.playTone).not.toHaveBeenCalled();
  });
});

describe('DM notifications filtering', () => {
  test('filters notifications and restores state from storage', async () => {
    const stored = [
      { ts: '2025-01-01T00:00:00', char: 'DM', detail: 'Alpha event', severity: 'info', actionScope: 'major' },
      { ts: '2025-01-02T00:00:00', char: 'Hank', detail: 'Beta warning', severity: 'warning', actionScope: 'major' },
      { ts: '2025-01-03T00:00:00', char: 'Hank', detail: 'Gamma update', severity: 'info', actionScope: 'minor' },
    ];

    await initDmModule({ loggedIn: true });
    window.__dmTestHooks.setStoredNotifications(stored);

    const list = document.getElementById('dm-notifications-list');
    const characterSelect = document.getElementById('dm-notifications-filter-character');
    const severitySelect = document.getElementById('dm-notifications-filter-severity');
    const searchInput = document.getElementById('dm-notifications-filter-search');

    const readItems = () => Array.from(list.querySelectorAll('li')).map(li => li.textContent);

    expect(readItems()).toHaveLength(3);

    characterSelect.value = 'Hank';
    characterSelect.dispatchEvent(new Event('change'));

    let items = readItems();
    expect(items).toHaveLength(2);
    expect(items.every(text => text.includes('Hank'))).toBe(true);

    severitySelect.value = 'warning';
    severitySelect.dispatchEvent(new Event('change'));

    items = readItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('Beta warning');

    severitySelect.value = 'all';
    severitySelect.dispatchEvent(new Event('change'));
    searchInput.value = 'Gamma';
    searchInput.dispatchEvent(new Event('input'));

    items = readItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('Gamma update');

    const savedFiltersRaw = localStorage.getItem(DM_NOTIFICATION_FILTER_STORAGE_KEY);
    expect(savedFiltersRaw).toBeTruthy();
    const savedFilters = JSON.parse(savedFiltersRaw);
    expect(savedFilters).toMatchObject({ character: 'Hank', severity: 'all', search: 'Gamma' });

    await initDmModule({
      loggedIn: true,
      notificationFilters: savedFilters,
    });
    window.__dmTestHooks.setStoredNotifications(stored);
    window.__dmTestHooks.setNotificationFilters(savedFilters);

    const restoredList = document.getElementById('dm-notifications-list');
    const restoredItems = Array.from(restoredList.querySelectorAll('li')).map(li => li.textContent);

    expect(document.getElementById('dm-notifications-filter-character').value).toBe('Hank');
    expect(document.getElementById('dm-notifications-filter-search').value).toBe('Gamma');
    expect(restoredItems).toHaveLength(1);
    expect(restoredItems[0]).toContain('Gamma update');
  });
});

describe('DM notification severity rendering', () => {
  test('applies severity metadata and wraps HTML payloads', async () => {
    const stored = [
      { ts: '2025-01-01T00:00:00', char: 'DM', detail: 'Plain info', severity: 'info', actionScope: 'minor' },
      { ts: '2025-01-02T00:00:00', char: 'Alex', detail: 'Escalated detail', severity: 'warning', html: '<em>Escalated detail</em>', actionScope: 'major' },
    ];

    await initDmModule({ loggedIn: true });
    window.__dmTestHooks.setStoredNotifications(stored);

    const items = Array.from(document.querySelectorAll('#dm-notifications-list li'));
    expect(items).toHaveLength(2);

    const infoItem = items.find(node => node.textContent.includes('Plain info'));
    expect(infoItem).toBeTruthy();
    expect(infoItem?.getAttribute('data-severity')).toBe('info');
    expect(infoItem?.classList.contains('dm-notifications__item--hasSeverity')).toBe(true);
    expect(infoItem?.classList.contains('dm-notifications__item--severity-info')).toBe(true);
    expect(infoItem?.querySelector('.dm-notifications__severityBadge')?.textContent).toBe('Info');

    const warningItem = items.find(node => node.textContent.includes('Escalated detail'));
    expect(warningItem).toBeTruthy();
    expect(warningItem?.getAttribute('data-severity')).toBe('warning');
    expect(warningItem?.classList.contains('dm-notifications__item--severity-warning')).toBe(true);

    const htmlWrapper = warningItem?.querySelector('.dm-notifications__itemHtml');
    expect(htmlWrapper).toBeTruthy();
    expect(htmlWrapper?.innerHTML).toContain('<em>Escalated detail</em>');
  });
});

describe('DM notifications mark read control', () => {
  test('clears unread badge without removing log entries', async () => {
    await initDmModule({ loggedIn: true });

    const markReadBtn = document.getElementById('dm-notifications-mark-read');
    expect(markReadBtn.disabled).toBe(true);

    window.dmNotify('First alert', { actionScope: 'major' });
    window.dmNotify('Second alert', { actionScope: 'major' });

    expect(markReadBtn.disabled).toBe(false);

    const dmButton = document.getElementById('dm-tools-notifications');
    expect(dmButton.getAttribute('data-unread')).toBe('2');

    markReadBtn.dispatchEvent(new Event('click'));

    expect(dmButton.getAttribute('data-unread')).toBe('0');
    expect(markReadBtn.disabled).toBe(true);

    const items = document.querySelectorAll('#dm-notifications-list li');
    expect(items).toHaveLength(2);

    const stored = JSON.parse(sessionStorage.getItem(DM_NOTIFICATIONS_KEY));
    expect(stored).toHaveLength(2);
  });
});

describe('DM notifications export formats', () => {
  afterEach(() => {
    try {
      delete navigator.clipboard;
    } catch (err) {
      /* ignore */
    }
  });

  test('exports CSV payload with headers and newest-first order', async () => {
    await initDmModule({ loggedIn: true });

    window.dmNotify('Older detail', {
      ts: '2024-01-01T00:00:00',
      char: 'Gamma',
      severity: 'info',
      resolved: true,
      actionScope: 'minor',
    });
    window.dmNotify('Newer detail', {
      ts: '2024-01-02T00:00:00',
      char: 'Beta',
      severity: 'warning',
      actionScope: 'major',
    });

    const storedState = JSON.parse(sessionStorage.getItem(DM_NOTIFICATIONS_KEY));
    expect(storedState).toHaveLength(2);
    expect(storedState.map(entry => entry.detail)).toEqual(['Older detail', 'Newer detail']);

    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const result = await window.__dmTestHooks.exportNotifications('csv');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);

    const exported = writeText.mock.calls[0][0];
    const lines = exported.split('\n');
    expect(lines[0]).toBe('ts,char,severity,detail');
    expect(lines[1]).toBe('2024-01-02T00:00:00,Beta,warning,Newer detail');
    expect(lines[2]).toBe('2024-01-01T00:00:00,Gamma,info,[resolved] Older detail');
  });

  test('exports JSON payload with newest-first order', async () => {
    await initDmModule({ loggedIn: true });

    window.dmNotify('Older log', {
      ts: '2024-02-01T10:00:00',
      char: 'Vera',
      severity: 'info',
      actionScope: 'minor',
    });
    window.dmNotify('New log', {
      ts: '2024-02-02T11:00:00',
      char: 'Nox',
      severity: 'warning',
      actionScope: 'major',
    });

    const storedState = JSON.parse(sessionStorage.getItem(DM_NOTIFICATIONS_KEY));
    expect(storedState).toHaveLength(2);
    expect(storedState.map(entry => entry.detail)).toEqual(['Older log', 'New log']);

    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const result = await window.__dmTestHooks.exportNotifications('json');
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({ ts: '2024-02-02T11:00:00', char: 'Nox', severity: 'warning', detail: 'New log' });
    expect(payload[1]).toEqual({ ts: '2024-02-01T10:00:00', char: 'Vera', severity: 'info', detail: 'Older log' });
  });
});

