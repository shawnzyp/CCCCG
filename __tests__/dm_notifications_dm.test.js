import { jest } from '@jest/globals';
import { DM_PIN } from '../scripts/dm-pin.js';

const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
const DM_NOTIFICATION_FILTER_STORAGE_KEY = 'cc_dm_notification_filters';

function setupDom() {
  document.body.innerHTML = `
    <div id="dm-tools-menu"></div>
    <button id="dm-tools-notifications"></button>
    <button id="dm-login"></button>
    <div id="dm-login-modal"></div>
    <input id="dm-login-pin" />
    <button id="dm-login-submit"></button>
    <button id="dm-login-close"></button>
    <div id="dm-notifications-modal" class="overlay hidden" aria-hidden="true">
      <section class="modal">
        <button id="dm-notifications-close" type="button"></button>
        <div class="dm-notifications__actions">
          <button id="dm-notifications-export" type="button"></button>
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

  setupDom();
  global.toast = jest.fn();
  global.dismissToast = jest.fn();

  await import('../scripts/dm.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  if (loggedIn) {
    await completeLogin();
  }
}

async function completeLogin() {
  const loginPromise = window.dmRequireLogin();
  const pinInput = document.getElementById('dm-login-pin');
  pinInput.value = DM_PIN;
  const submit = document.getElementById('dm-login-submit');
  submit.dispatchEvent(new Event('click'));
  await loginPromise;
}

describe('dmNotify labels actions as DM when logged in', () => {
  beforeEach(async () => {
    await initDmModule({ loggedIn: true });
  });

  test('uses DM tag', () => {
    window.dmNotify('testing');
    const list = document.getElementById('dm-notifications-list');
    expect(list.textContent).toContain('DM: testing');
  });
});

describe('DM notifications visibility', () => {
  test('does not render notifications when logged out', async () => {
    await initDmModule();
    const list = document.getElementById('dm-notifications-list');
    window.dmNotify('testing visibility');
    expect(list.textContent).toBe('');
    const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
    const pending = raw ? JSON.parse(raw) : [];
    expect(pending).toHaveLength(1);
  });

  test('renders stored and pending notifications after login', async () => {
    const stored = [{ ts: '2025-01-01 00:00', char: 'System', detail: 'Stored entry' }];
    await initDmModule({ storedNotifications: stored });
    const list = document.getElementById('dm-notifications-list');
    expect(list.textContent).toBe('');

    window.dmNotify('Queued while logged out');
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

    window.dmNotify('audio check');

    expect(window.playTone).toHaveBeenCalledTimes(1);
    expect(window.playTone).toHaveBeenCalledWith('info');
  });

  test('plays tone when processing queued notifications after login', async () => {
    await initDmModule();
    window.playTone = jest.fn();

    window.dmNotify('queued tone');
    expect(window.playTone).not.toHaveBeenCalled();

    await completeLogin();

    expect(window.playTone).toHaveBeenCalledTimes(1);
  });

  test('respects muted audio preference', async () => {
    await initDmModule({ loggedIn: true });
    window.playTone = jest.fn();
    window.audioPreference = 'muted';

    window.dmNotify('should stay quiet');

    expect(window.playTone).not.toHaveBeenCalled();
  });
});

describe('DM notifications filtering', () => {
  test('filters notifications and restores state from storage', async () => {
    const stored = [
      { ts: '2025-01-01T00:00:00', char: 'DM', detail: 'Alpha event', severity: 'info' },
      { ts: '2025-01-02T00:00:00', char: 'Hank', detail: 'Beta warning', severity: 'warning' },
      { ts: '2025-01-03T00:00:00', char: 'Hank', detail: 'Gamma update', severity: 'info' },
    ];

    await initDmModule({ loggedIn: true, storedNotifications: stored });

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
      storedNotifications: stored,
      notificationFilters: savedFilters,
    });

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
      { ts: '2025-01-01T00:00:00', char: 'DM', detail: 'Plain info', severity: 'info' },
      { ts: '2025-01-02T00:00:00', char: 'Alex', detail: 'Escalated detail', severity: 'warning', html: '<em>Escalated detail</em>' },
    ];

    await initDmModule({ loggedIn: true, storedNotifications: stored });

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

    window.dmNotify('First alert');
    window.dmNotify('Second alert');

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

