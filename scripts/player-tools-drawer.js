const DRAWER_CHANGE_EVENT = 'cc:player-tools-drawer';
let controllerInstance = null;
const changeListeners = new Set();

const getDocument = () => (typeof document !== 'undefined' ? document : null);

const dispatchChange = (detail) => {
  changeListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (_) {}
  });

  const doc = getDocument();
  if (!doc || typeof doc.dispatchEvent !== 'function') return;
  try {
    doc.dispatchEvent(new CustomEvent(DRAWER_CHANGE_EVENT, { detail }));
  } catch (_) {
    // ignore
  }
};

const clampPendingCount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
};

const ensureLevelRewardUI = () => {
  const doc = getDocument();
  if (!doc) return {};

  let trigger = doc.getElementById('level-reward-reminder-trigger');
  if (!trigger) {
    trigger = doc.createElement('button');
    trigger.id = 'level-reward-reminder-trigger';
    trigger.type = 'button';
    trigger.hidden = true;
    trigger.disabled = true;
    trigger.setAttribute('aria-hidden', 'true');
    trigger.setAttribute('aria-disabled', 'true');
    trigger.textContent = 'Rewards';
    trigger.dataset.playerToolsShim = 'true';
    doc.body?.appendChild(trigger);
  }

  let badge = doc.getElementById('level-reward-count');
  if (!badge) {
    badge = doc.createElement('span');
    badge.id = 'level-reward-count';
    badge.hidden = true;
    badge.dataset.playerToolsShim = 'true';
    trigger.appendChild(badge);
  }

  let infoTrigger = doc.getElementById('level-reward-info-trigger');
  if (!infoTrigger) {
    infoTrigger = doc.createElement('button');
    infoTrigger.id = 'level-reward-info-trigger';
    infoTrigger.type = 'button';
    infoTrigger.hidden = true;
    infoTrigger.setAttribute('aria-hidden', 'true');
    infoTrigger.textContent = 'Reward details';
    infoTrigger.dataset.playerToolsShim = 'true';
    doc.body?.appendChild(infoTrigger);
  }

  return { trigger, badge, infoTrigger };
};

const ensureMiniGameReminderUI = () => {
  const doc = getDocument();
  if (!doc) return {};

  let card = doc.getElementById('mini-game-reminder');
  if (!card) {
    card = doc.createElement('section');
    card.id = 'mini-game-reminder';
    card.hidden = true;
    card.setAttribute('data-mini-game-reminder', '');
    card.dataset.playerToolsShim = 'true';
    doc.body?.appendChild(card);
  }

  let summary = card.querySelector('[data-mini-game-reminder-summary]');
  if (!summary) {
    summary = doc.createElement('p');
    summary.setAttribute('data-mini-game-reminder-summary', '');
    card.appendChild(summary);
  }

  let game = card.querySelector('[data-mini-game-reminder-game]');
  if (!game) {
    game = doc.createElement('strong');
    game.setAttribute('data-mini-game-reminder-game', '');
    card.appendChild(game);
  }

  let status = card.querySelector('[data-mini-game-reminder-status]');
  if (!status) {
    status = doc.createElement('p');
    status.setAttribute('data-mini-game-reminder-status', '');
    card.appendChild(status);
  }

  let meta = card.querySelector('[data-mini-game-reminder-meta]');
  if (!meta) {
    meta = doc.createElement('p');
    meta.setAttribute('data-mini-game-reminder-meta', '');
    card.appendChild(meta);
  }

  let resumeBtn = card.querySelector('[data-mini-game-reminder-action]');
  if (!resumeBtn) {
    resumeBtn = doc.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.id = 'mini-game-resume';
    resumeBtn.textContent = 'Resume mini-game';
    resumeBtn.setAttribute('data-mini-game-reminder-action', '');
    card.appendChild(resumeBtn);
  }

  return { card, summary, game, status, meta, resumeBtn };
};

const ensurePlayerToolsHost = () => {
  const globalTarget = typeof window !== 'undefined' ? window : globalThis;
  if (!globalTarget) return null;

  const existing = globalTarget.PlayerTools;
  if (existing && typeof existing === 'object') {
    return existing;
  }

  const host = {
    setLevelRewardReminder(count = 0, label = 'Rewards') {
      const pendingCount = clampPendingCount(count);
      const { trigger, badge, infoTrigger } = ensureLevelRewardUI();
      if (badge) {
        badge.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
        badge.hidden = pendingCount <= 0;
      }
      if (trigger) {
        const hasPending = pendingCount > 0;
        trigger.hidden = !hasPending;
        trigger.disabled = !hasPending;
        trigger.setAttribute('aria-hidden', hasPending ? 'false' : 'true');
        trigger.setAttribute('aria-disabled', hasPending ? 'false' : 'true');
        trigger.setAttribute('aria-label', label || 'Rewards');
      }
      if (infoTrigger) {
        const hasPending = pendingCount > 0;
        infoTrigger.hidden = !hasPending;
        infoTrigger.setAttribute('aria-hidden', hasPending ? 'false' : 'true');
      }
      return pendingCount;
    },
    clearLevelRewardReminder() {
      return this.setLevelRewardReminder(0, 'Rewards');
    },
    setMiniGameReminder(config = {}) {
      const {
        name = 'Mini-Game',
        status = 'Pending',
        meta = '',
        summary = 'Mini-game mission ready',
        onResume,
      } = config || {};

      const { card, summary: summaryEl, game, status: statusEl, meta: metaEl, resumeBtn } = ensureMiniGameReminderUI();
      if (summaryEl) summaryEl.textContent = summary || 'Mini-game mission ready';
      if (game) game.textContent = name;
      if (statusEl) statusEl.textContent = status;
      if (metaEl) metaEl.textContent = meta;
      if (resumeBtn) {
        resumeBtn.onclick = typeof onResume === 'function' ? () => onResume() : null;
      }
      if (card) {
        card.hidden = false;
        card.setAttribute('aria-hidden', 'false');
      }
    },
  };

  globalTarget.PlayerTools = host;
  return host;
};

function createPlayerToolsDrawer() {
  const doc = getDocument();
  if (!doc) return null;

  const drawer = doc.getElementById('player-tools-drawer');
  const tab = doc.getElementById('player-tools-tab');
  const scrim = drawer
    ? drawer.querySelector('[data-player-tools-scrim], [data-pt-scrim]')
    : null;
  const tray = drawer ? drawer.querySelector('.pt-tray') : null;
  const splash = drawer ? drawer.querySelector('[data-pt-splash]') : null;
  const app = drawer ? drawer.querySelector('[data-pt-app]') : null;

  const clockEl = drawer ? drawer.querySelector('[data-pt-clock]') : null;
  const batteryEl = drawer ? drawer.querySelector('[data-pt-battery]') : null;

  const gestureExit = doc.getElementById('player-tools-gesture-exit');

  const qs = (sel) => (drawer ? drawer.querySelector(sel) : null);

  const initiativeBonusInput = qs('#initiative-bonus');
  const initiativeResultEl = qs('#initiative-roll-result');
  const rollInitiativeBtn = qs('#roll-initiative-btn');

  const diceCountInput = qs('#dice-count');
  const diceSidesInput = qs('#dice-sides');
  const diceBonusInput = qs('#dice-bonus');
  const rollDiceBtn = qs('#roll-dice-btn');
  const diceOutEl = qs('#dice-out');

  const flipCoinBtn = qs('#flip-coin-btn');
  const coinResultEl = qs('#coin-result');

  const toastHistoryList = qs('#toast-history-list');

  if (!drawer || !tab) return null;

  let isOpen = false;
  let splashTimer = null;
  let timeInterval = null;
  let hpInterval = null;
  let batteryObj = null;

  const pad2 = (n) => String(n).padStart(2, '0');

  const getCurrentTimeString = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const h12 = hours % 12 || 12;
    return `${h12}:${pad2(minutes)}`;
  };

  const updateClock = () => {
    if (!clockEl) return;
    clockEl.textContent = getCurrentTimeString();
  };

  const setBatteryVisual = ({ levelPercent = 75, charging = false, estimated = false } = {}) => {
    const lvl = Math.max(0, Math.min(100, Number(levelPercent) || 75));
    if (doc.documentElement) {
      doc.documentElement.style.setProperty('--pt-battery-level', `${lvl}%`);
    }

    if (batteryEl) {
      batteryEl.classList.toggle('is-charging', !!charging);
      batteryEl.classList.toggle('is-estimated', !!estimated);
      const label = estimated
        ? 'Battery level unavailable (estimated display)'
        : `Battery level ${lvl}%`;
      batteryEl.setAttribute('aria-label', label);
    }
  };

  const initBattery = async () => {
    setBatteryVisual({ levelPercent: 75, charging: false, estimated: true });

    if (!('getBattery' in navigator)) return;

    try {
      batteryObj = await navigator.getBattery();
      const apply = () => {
        const lvl = Math.round((batteryObj.level || 0) * 100);
        setBatteryVisual({
          levelPercent: lvl,
          charging: !!batteryObj.charging,
          estimated: false
        });
      };

      apply();
      batteryObj.addEventListener('levelchange', apply);
      batteryObj.addEventListener('chargingchange', apply);
    } catch (_) {
      setBatteryVisual({ levelPercent: 75, charging: false, estimated: true });
    }
  };

  const showSplashThenApp = () => {
    if (!splash || !app) return;

    splash.classList.add('is-visible');
    splash.setAttribute('aria-hidden', 'false');
    app.style.opacity = '0';
    app.style.transition = 'opacity 220ms ease-out';

    clearTimeout(splashTimer);
    splashTimer = setTimeout(() => {
      splash.classList.remove('is-visible');
      splash.setAttribute('aria-hidden', 'true');
      app.style.opacity = '1';
    }, 2000);
  };

  const setDrawerOpen = (open) => {
    const next = !!open;
    if (next === isOpen) return;
    isOpen = next;

    drawer.classList.toggle('is-open', isOpen);
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    tab.setAttribute('aria-hidden', isOpen ? 'true' : 'false');

    if (tray) tray.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    if (isOpen) {
      updateClock();
      showSplashThenApp();
    } else {
      if (splash) {
        splash.classList.remove('is-visible');
        splash.setAttribute('aria-hidden', 'true');
      }
      if (app) app.style.opacity = '1';
      clearTimeout(splashTimer);
      splashTimer = null;
    }

    dispatchChange({ open: isOpen, progress: isOpen ? 1 : 0 });
  };

  const toggle = () => setDrawerOpen(!isOpen);

  const updateResult = (el, value) => {
    if (!el) return;
    el.textContent = String(value);
    el.removeAttribute('data-placeholder');
  };

  const addHistoryEntry = ({ label, value } = {}) => {
    if (!toastHistoryList || !label) return;
    const li = doc.createElement('li');
    const now = new Date();
    const time = `${now.getHours()}:${pad2(now.getMinutes())}`;
    li.textContent = `${time}  ${label}: ${value}`;
    toastHistoryList.prepend(li);
  };

  const setupInitiative = () => {
    if (!rollInitiativeBtn) return;
    rollInitiativeBtn.addEventListener('click', () => {
      const bonus = parseInt(initiativeBonusInput?.value ?? '0', 10) || 0;
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + bonus;
      updateResult(initiativeResultEl, total);
      addHistoryEntry({ label: 'Initiative', value: total });
    });
  };

  const setupDiceRoller = () => {
    if (!rollDiceBtn) return;
    rollDiceBtn.addEventListener('click', () => {
      const count = Math.max(1, parseInt(diceCountInput?.value ?? '1', 10) || 1);
      const rawSides = diceSidesInput?.value ?? '20';
      const sides = rawSides === '10p' ? 10 : Math.max(2, parseInt(rawSides, 10) || 20);
      const bonus = parseInt(diceBonusInput?.value ?? '0', 10) || 0;

      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      const total = rolls.reduce((sum, n) => sum + n, 0) + bonus;

      updateResult(diceOutEl, total);

      const labelSides = rawSides === '10p' ? '10p' : String(sides);
      const label = `${count}d${labelSides}${bonus ? `+${bonus}` : ''}`;
      addHistoryEntry({ label, value: total });
    });
  };

  const setupCoinFlip = () => {
    if (!flipCoinBtn) return;
    flipCoinBtn.addEventListener('click', () => {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      updateResult(coinResultEl, result);
      addHistoryEntry({ label: 'Coin', value: result });
    });
  };

  // HP detection for crack overlay (read-only)
  const readNumberFromEl = (el) => {
    if (!el) return null;
    const v = el.value != null ? el.value : el.textContent;
    const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const queryFirst = (selectors) => {
    for (const sel of selectors) {
      const found = doc.querySelector(sel);
      if (found) return found;
    }
    return null;
  };

  const getHpPercent = () => {
    const curEl = queryFirst([
      '#hp-current',
      '#current-hp',
      '#hpCurrent',
      '[data-hp-current]',
      '.hp-current input',
      '.hp-current',
      '[name="hp-current"]'
    ]);

    const maxEl = queryFirst([
      '#hp-max',
      '#max-hp',
      '#hpMax',
      '[data-hp-max]',
      '.hp-max input',
      '.hp-max',
      '[name="hp-max"]'
    ]);

    const cur = readNumberFromEl(curEl);
    const max = readNumberFromEl(maxEl);

    if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return null;
    return Math.max(0, Math.min(1, cur / max));
  };

  const updateCracks = () => {
    const pct = getHpPercent();
    if (pct == null) {
      drawer.setAttribute('data-pt-crack', '0');
      return;
    }

    let stage = 0;
    if (pct < 0.15) stage = 3;
    else if (pct < 0.40) stage = 2;
    else if (pct < 0.70) stage = 1;

    drawer.setAttribute('data-pt-crack', String(stage));
  };

  const handleKeydown = (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setDrawerOpen(false);
    }
  };

  const handleScrimClick = () => setDrawerOpen(false);
  const handleGestureExit = () => setDrawerOpen(false);

  const setupDrawer = () => {
    tab.addEventListener('click', toggle);
    scrim && scrim.addEventListener('click', handleScrimClick);
    gestureExit && gestureExit.addEventListener('click', handleGestureExit);
    doc.addEventListener('keydown', handleKeydown);
  };

  const subscribe = (listener) => {
    if (typeof listener !== 'function') return () => {};
    if (!changeListeners.has(listener)) changeListeners.add(listener);
    listener({ open: isOpen, progress: isOpen ? 1 : 0 });
    return () => changeListeners.delete(listener);
  };

  const open = () => setDrawerOpen(true);
  const close = () => setDrawerOpen(false);

  // DO NOT overwrite globals. Only attach hooks if PlayerTools already exists.
  try {
    const host = ensurePlayerToolsHost();
    if (host && (typeof host === 'object' || typeof host === 'function')) {
      if (!('openTray' in host)) host.openTray = open;
      if (!('closeTray' in host)) host.closeTray = close;
    }
  } catch (_) {}

  // init
  setDrawerOpen(false);
  updateClock();
  initBattery();

  timeInterval = setInterval(updateClock, 15_000);
  updateCracks();
  hpInterval = setInterval(updateCracks, 1_000);

  setupDrawer();
  setupInitiative();
  setupDiceRoller();
  setupCoinFlip();

  const teardown = () => {
    clearInterval(timeInterval);
    clearInterval(hpInterval);
    clearTimeout(splashTimer);

    try {
      if (batteryObj) {
        batteryObj.onlevelchange = null;
        batteryObj.onchargingchange = null;
      }
    } catch (_) {}

    tab.removeEventListener('click', toggle);
    scrim && scrim.removeEventListener('click', handleScrimClick);
    gestureExit && gestureExit.removeEventListener('click', handleGestureExit);
    doc.removeEventListener('keydown', handleKeydown);
  };

  return { open, close, toggle, subscribe, teardown };
}

export function initializePlayerToolsDrawer() {
  if (!controllerInstance) controllerInstance = createPlayerToolsDrawer();
  return controllerInstance;
}

export const open = () => initializePlayerToolsDrawer()?.open();
export const close = () => initializePlayerToolsDrawer()?.close();
export const toggle = () => initializePlayerToolsDrawer()?.toggle();
export const subscribe = (listener) => initializePlayerToolsDrawer()?.subscribe(listener) ?? (() => {});

initializePlayerToolsDrawer();
