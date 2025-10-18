import { jest } from '@jest/globals';
import { DM_PIN } from '../scripts/dm-pin.js';

const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
const DM_NOTIFICATIONS_ARCHIVE_KEY = 'cc:dm-notifications-archive';

function setupDom() {
  document.body.innerHTML = `
    <div id="dm-tools-menu"></div>
    <button id="dm-tools-notifications"></button>
    <button id="dm-login"></button>
    <div id="dm-login-modal"></div>
    <input id="dm-login-pin" />
    <button id="dm-login-submit"></button>
    <button id="dm-login-close"></button>
    <div id="dm-notifications-modal"></div>
    <div id="dm-notifications-list"></div>
    <button id="dm-notifications-close"></button>
  `;
}

async function initDmModule({ loggedIn = false, storedNotifications = null, envNotificationLimit } = {}) {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  const originalEnvLimit = process.env.DM_NOTIFICATION_LIMIT;
  if (envNotificationLimit !== undefined) {
    if (envNotificationLimit === null) {
      delete process.env.DM_NOTIFICATION_LIMIT;
    } else {
      process.env.DM_NOTIFICATION_LIMIT = String(envNotificationLimit);
    }
  }
  if (storedNotifications) {
    sessionStorage.setItem(DM_NOTIFICATIONS_KEY, JSON.stringify(storedNotifications));
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

  if (envNotificationLimit !== undefined) {
    if (originalEnvLimit === undefined) {
      delete process.env.DM_NOTIFICATION_LIMIT;
    } else {
      process.env.DM_NOTIFICATION_LIMIT = originalEnvLimit;
    }
  }

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

describe('DM notifications retention', () => {
  test('applies retention limit from environment variable', async () => {
    await initDmModule({ loggedIn: true, envNotificationLimit: 2 });

    window.dmNotify('first limit check');
    window.dmNotify('second limit check');
    window.dmNotify('third limit check');

    const storedRaw = sessionStorage.getItem(DM_NOTIFICATIONS_KEY) || '[]';
    const stored = JSON.parse(storedRaw);
    expect(stored).toHaveLength(2);
    expect(stored[0].detail).toBe('second limit check');
    expect(stored[1].detail).toBe('third limit check');
    expect(window.dmGetNotificationLimit()).toBe(2);
  });

  test('archives notifications before trimming when limit exceeded', async () => {
    await initDmModule({ loggedIn: true });

    window.dmSetNotificationLimit(2);

    window.dmNotify('alpha');
    window.dmNotify('beta');
    window.dmNotify('gamma');

    const storedRaw = sessionStorage.getItem(DM_NOTIFICATIONS_KEY) || '[]';
    const stored = JSON.parse(storedRaw);
    expect(stored).toHaveLength(2);
    expect(stored[0].detail).toBe('beta');
    expect(stored[1].detail).toBe('gamma');

    const archiveRaw = sessionStorage.getItem(DM_NOTIFICATIONS_ARCHIVE_KEY) || '[]';
    const archived = JSON.parse(archiveRaw);
    expect(archived).toHaveLength(1);
    expect(archived[0].detail).toBe('alpha');
    expect(window.dmGetNotificationArchive()).toHaveLength(1);
  });
});

