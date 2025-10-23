import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(__filename);
const html = fs.readFileSync(path.resolve(TEST_DIR, '../index.html'), 'utf8');

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

async function initializeAppWithLevels(levels, { snapshot } = {}) {
  jest.resetModules();
  const actualLevelsModule = await import('../scripts/levels.js');
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
  jest.unstable_mockModule('../scripts/levels.js', () => ({
    LEVELS: levels,
  }));
  global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });
  window.fetch = global.fetch;
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => '');

  await import('../scripts/main.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  return () => {
    jest.resetModules();
    jest.unstable_mockModule('../scripts/levels.js', () => actualLevelsModule);
  };
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

    const abilityCard = document.getElementById('card-abilities');
    expect(abilityCard).toBeTruthy();
    expect(abilityCard.dataset.levelChoice).toBe('stat');

    const statReminderButton = document.getElementById('ability-stat-reminder');
    expect(statReminderButton).toBeTruthy();
    expect(statReminderButton.hidden).toBe(false);

    const storyReminderButton = document.getElementById('story-reward-reminder');
    expect(storyReminderButton).toBeTruthy();
    expect(storyReminderButton.hidden).toBe(false);

    const combatReminderButton = document.getElementById('combat-reward-reminder');
    expect(combatReminderButton).toBeTruthy();
    expect(combatReminderButton.hidden).toBe(false);

    const statBadge = statReminderButton.querySelector('[data-ability-reminder-count]');
    expect(statBadge).toBeTruthy();
    expect(statBadge.hidden).toBe(false);
    const statBadgeValue = Number.parseInt(statBadge.textContent, 10);
    expect(Number.isNaN(statBadgeValue) ? 0 : statBadgeValue).toBeGreaterThan(0);

    const toastEl = document.getElementById('toast');
    expect(toastEl).toBeTruthy();
    statReminderButton.click();
    await Promise.resolve();
    expect(toastEl.classList.contains('show')).toBe(true);
    expect(toastEl.innerHTML).toContain('Ability updates pending');
    expect(toastEl.innerHTML).toContain('Assign +1 Stat');
    window.dismissToast?.();

    storyReminderButton.click();
    await Promise.resolve();
    expect(toastEl.classList.contains('show')).toBe(true);
    expect(toastEl.innerHTML).toContain('Story rewards pending');
    window.dismissToast?.();

    combatReminderButton.click();
    await Promise.resolve();
    expect(toastEl.classList.contains('show')).toBe(true);
    expect(toastEl.innerHTML).toContain('Combat rewards pending');
    window.dismissToast?.();
  });

  test('story reminders include xp, credits, faction, medals, and honors', async () => {
    const customLevels = [
      {
        level: 1,
        tierNumber: 5,
        tierLabel: 'Tier 5 – Rookie',
        subTier: 'A',
        xp: 0,
        proficiencyBonus: 2,
        gains: 'Character creation',
        rewards: {},
      },
      {
        level: 2,
        tierNumber: 5,
        tierLabel: 'Tier 5 – Rookie',
        subTier: 'B',
        xp: 100,
        proficiencyBonus: 2,
        gains: 'Narrative unlocks',
        rewards: {
          credits: 7500,
          factionReputation: [{ faction: 'O.M.N.I.', delta: 15 }],
          medals: [{ name: 'Silver Star' }],
          honors: [{ name: 'Valor Commendation' }],
        },
      },
    ];

    const restoreLevels = await initializeAppWithLevels(customLevels);

    setXp(100);
    await Promise.resolve();

    const storyReminderButton = document.getElementById('story-reward-reminder');
    expect(storyReminderButton).toBeTruthy();
    expect(storyReminderButton.hidden).toBe(false);

    const storyBadge = storyReminderButton.querySelector('[data-story-reminder-count]');
    expect(storyBadge).toBeTruthy();
    expect(storyBadge.hidden).toBe(false);
    const pendingValue = Number.parseInt(storyBadge.textContent, 10);
    expect(Number.isNaN(pendingValue) ? 0 : pendingValue).toBeGreaterThanOrEqual(5);

    const toastEl = document.getElementById('toast');
    expect(toastEl).toBeTruthy();

    storyReminderButton.click();
    await Promise.resolve();

    expect(toastEl.classList.contains('show')).toBe(true);
    const toastHtml = toastEl.innerHTML;
    expect(toastHtml).toContain('Story rewards pending');
    expect(toastHtml).toContain('Log 100 XP (Level 2)');
    expect(toastHtml).toMatch(/Log [^<]*Credits \(Level 2\)/);
    expect(toastHtml).toContain('Update faction reputation for O.M.N.I.');
    expect(toastHtml).toContain('Record medal: Silver Star');
    expect(toastHtml).toContain('Record honor: Valor Commendation');

    window.dismissToast?.();
    restoreLevels();
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

    const abilityCard = document.getElementById('card-abilities');
    expect(abilityCard).toBeTruthy();
    expect(abilityCard.dataset.levelChoice).toBe('stat');

    const restoredState = JSON.parse(document.getElementById('level-progress-state').value);
    expect(restoredState.hpBonus).toBe(15);
    const ledgerLevels = restoredState.appliedRewardsByLevel.map(entry => entry.level);
    expect(ledgerLevels).toEqual(expect.arrayContaining([2, 4, 5, 7, 8, 10]));
  });

  test('level reward reminder surfaces pending tasks and acknowledgement clears them', async () => {
    await initializeApp();

    setXp(34000);
    await Promise.resolve();

    const reminderTrigger = document.getElementById('level-reward-reminder-trigger');
    expect(reminderTrigger).toBeTruthy();
    expect(reminderTrigger.hidden).toBe(false);

    const badge = reminderTrigger.querySelector('[data-level-reward-count]');
    expect(badge).toBeTruthy();
    expect(badge.hidden).toBe(false);
    const badgeValue = Number.parseInt(badge.textContent, 10);
    expect(Number.isNaN(badgeValue) ? 0 : badgeValue).toBeGreaterThan(0);

    const statReminderButton = document.getElementById('ability-stat-reminder');
    expect(statReminderButton).toBeTruthy();
    expect(statReminderButton.hidden).toBe(false);

    const storyReminderButton = document.getElementById('story-reward-reminder');
    expect(storyReminderButton).toBeTruthy();
    expect(storyReminderButton.hidden).toBe(false);

    const combatReminderButton = document.getElementById('combat-reward-reminder');
    expect(combatReminderButton).toBeTruthy();
    expect(combatReminderButton.hidden).toBe(false);

    const statBadge = statReminderButton.querySelector('[data-ability-reminder-count]');
    expect(statBadge).toBeTruthy();
    expect(statBadge.hidden).toBe(false);

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
    expect(statReminderButton.hidden).toBe(true);
    expect(statBadge.hidden).toBe(true);
    expect(storyReminderButton.hidden).toBe(true);
    expect(combatReminderButton.hidden).toBe(true);
  });
});
