import { jest } from '@jest/globals';
import { DM_PIN } from '../scripts/dm-pin.js';

const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';

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

async function initDmModule({ loggedIn = false, storedNotifications = null } = {}) {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
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

