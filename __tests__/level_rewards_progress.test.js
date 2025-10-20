import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

function createStorageMock() {
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(String(key), String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => { store.clear(); },
    key: index => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function installBaseMocks() {
  if (typeof globalThis.btoa !== 'function') {
    globalThis.btoa = value => Buffer.from(String(value), 'binary').toString('base64');
  }
  if (typeof globalThis.atob !== 'function') {
    globalThis.atob = value => Buffer.from(String(value), 'base64').toString('binary');
  }

  Object.defineProperty(window, 'localStorage', {
    value: createStorageMock(),
    configurable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    value: createStorageMock(),
    configurable: true,
  });
  Object.defineProperty(global, 'localStorage', {
    value: window.localStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global, 'sessionStorage', {
    value: window.sessionStorage,
    configurable: true,
    writable: true,
  });

  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = id => clearTimeout(id);
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.cancelAnimationFrame = window.cancelAnimationFrame;

  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
  window.scrollTo = () => {};

  Object.defineProperty(window, 'ResizeObserver', {
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    configurable: true,
  });
}

async function initializeApp({ snapshot } = {}) {
  jest.resetModules();
  document.documentElement.innerHTML = html;
  installBaseMocks();
  if (snapshot) {
    const payload = {
      data: snapshot,
      ts: Date.now(),
      scrollY: 0,
    };
    window.sessionStorage.setItem('cc:forced-refresh-state', JSON.stringify(payload));
  }
  global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });
  window.fetch = global.fetch;
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => '');

  await import('../scripts/main.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

function setXp(value) {
  const xpInput = document.getElementById('xp');
  xpInput.value = String(value);
  xpInput.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('level reward progression', () => {
  afterEach(() => {
    delete global.fetch;
    delete window.fetch;
  });

  test('applies HP, SP, and stat bonuses from level rewards', async () => {
    await initializeApp();

    setXp(300);
    await Promise.resolve();

    let levelState = JSON.parse(document.getElementById('level-progress-state').value);
    expect(levelState.hpBonus).toBe(5);
    const levelTwo = levelState.appliedRewardsByLevel.find(entry => entry.level === 2);
    expect(levelTwo).toBeDefined();
    expect(levelTwo.hpBonus).toBe(5);
    expect(document.getElementById('hp-max').textContent).toBe('35');
    expect(document.getElementById('sp-max').textContent).toBe('5');

    setXp(64000);
    await Promise.resolve();

    levelState = JSON.parse(document.getElementById('level-progress-state').value);
    expect(levelState.hpBonus).toBe(15);
    expect(levelState.spBonus).toBe(2);
    expect(levelState.statIncreases).toBe(2);
    const levelTen = levelState.appliedRewardsByLevel.find(entry => entry.level === 10);
    expect(levelTen).toBeDefined();
    expect(levelTen.hpBonus).toBe(5);
    expect(document.getElementById('hp-max').textContent).toBe('45');
    expect(document.getElementById('sp-max').textContent).toBe('7');

    const statReminder = document.getElementById('stat-increase-reminder');
    expect(statReminder.hidden).toBe(false);
    expect(statReminder.textContent).toContain('2');
  });

  test('persists level reward ledger across reload', async () => {
    await initializeApp();

    setXp(64000);
    await Promise.resolve();

    const levelStateValue = document.getElementById('level-progress-state').value;
    const snapshot = {
      xp: Number(document.getElementById('xp').value),
      levelProgressState: JSON.parse(levelStateValue),
      augmentState: { selected: [], filters: [], search: '' },
    };

    await initializeApp({ snapshot });

    expect(document.getElementById('hp-max').textContent).toBe('45');
    expect(document.getElementById('sp-max').textContent).toBe('7');

    const reminder = document.getElementById('stat-increase-reminder');
    expect(reminder.hidden).toBe(false);
    expect(reminder.textContent).toContain('2');

    const restoredState = JSON.parse(document.getElementById('level-progress-state').value);
    expect(restoredState.hpBonus).toBe(15);
    const ledgerLevels = restoredState.appliedRewardsByLevel.map(entry => entry.level);
    expect(ledgerLevels).toEqual(expect.arrayContaining([2, 4, 5, 7, 8, 10]));
  });

  test('level reward reminder surfaces pending tasks and acknowledgement clears them', async () => {
    await initializeApp();

    setXp(300);
    await Promise.resolve();

    const reminderTrigger = document.getElementById('level-reward-reminder-trigger');
    expect(reminderTrigger).toBeTruthy();
    expect(reminderTrigger.hidden).toBe(false);

    const badge = reminderTrigger.querySelector('[data-level-reward-count]');
    expect(badge).toBeTruthy();
    expect(badge.hidden).toBe(false);
    const badgeValue = Number.parseInt(badge.textContent, 10);
    expect(Number.isNaN(badgeValue) ? 0 : badgeValue).toBeGreaterThan(0);

    const modalList = document.getElementById('level-reward-reminders');
    const checkboxes = Array.from(modalList.querySelectorAll('input[type="checkbox"]'));
    expect(checkboxes.length).toBeGreaterThan(0);
    const pendingIds = checkboxes.map(input => input.dataset.rewardId).filter(Boolean);

    const stateBefore = JSON.parse(document.getElementById('level-progress-state').value);
    pendingIds.forEach(id => {
      expect(stateBefore.completedRewardIds).not.toContain(id);
    });

    const acknowledgeButton = document.getElementById('level-reward-acknowledge');
    acknowledgeButton.click();
    await Promise.resolve();

    const stateAfter = JSON.parse(document.getElementById('level-progress-state').value);
    pendingIds.forEach(id => {
      expect(stateAfter.completedRewardIds).toContain(id);
    });

    expect(reminderTrigger.hidden).toBe(true);
  });
});
