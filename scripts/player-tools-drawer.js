const DRAWER_CHANGE_EVENT = 'cc:player-tools-drawer';
let controllerInstance = null;
const changeListeners = new Set();

const getDocument = () => (typeof document !== 'undefined' ? document : null);

const getCustomEventCtor = () => {
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    return window.CustomEvent;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.CustomEvent === 'function') {
    return globalThis.CustomEvent;
  }
  if (typeof CustomEvent === 'function') {
    return CustomEvent;
  }
  return null;
};

const createDrawerChangeEvent = (detail) => {
  const CustomEventCtor = getCustomEventCtor();
  if (!CustomEventCtor) {
    return { type: DRAWER_CHANGE_EVENT, detail };
  }
  try {
    return new CustomEventCtor(DRAWER_CHANGE_EVENT, { detail });
  } catch {
    return { type: DRAWER_CHANGE_EVENT, detail };
  }
};

const dispatchChange = (detail) => {
  // Notify JS subscribers
  changeListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch {
      // swallow listener errors
    }
  });

  // Fire DOM event for any existing listeners
  const doc = getDocument();
  if (!doc || typeof doc.dispatchEvent !== 'function') return;

  const event = createDrawerChangeEvent(detail);
  try {
    doc.dispatchEvent(event);
  } catch {
    const fallback = doc[`on${DRAWER_CHANGE_EVENT}`];
    if (typeof fallback === 'function') {
      try {
        fallback.call(doc, event);
      } catch {
        // ignore
      }
    }
  }
};

function createPlayerToolsDrawer() {
  const doc = getDocument();
  if (!doc) {
    return {
      open() {},
      close() {},
      toggle() {},
      subscribe(listener) {
        if (typeof listener === 'function') {
          listener({ open: false, progress: 0 });
        }
        return () => {};
      },
      setLevelRewardReminder() {},
      clearLevelRewardReminder() {},
      setMiniGameReminder() {},
      clearMiniGameReminder() {},
      addHistoryEntry() {}
    };
  }

  const drawer = doc.getElementById('player-tools-drawer');
  const tab = doc.getElementById('player-tools-tab');

  if (!drawer || !tab) {
    return {
      open() {},
      close() {},
      toggle() {},
      subscribe(listener) {
        if (typeof listener === 'function') {
          listener({ open: false, progress: 0 });
        }
        return () => {};
      },
      setLevelRewardReminder() {},
      clearLevelRewardReminder() {},
      setMiniGameReminder() {},
      clearMiniGameReminder() {},
      addHistoryEntry() {}
    };
  }

  const scrim = drawer.querySelector('[data-player-tools-scrim]');
  const gestureExit = doc.getElementById('player-tools-gesture-exit');
  const statusTime = doc.getElementById('player-tools-status-time');

  const initiativeBonusInput = doc.getElementById('initiative-bonus');
  const initiativeResultEl = doc.getElementById('initiative-roll-result');
  const rollInitiativeBtn = doc.getElementById('roll-initiative-btn');

  const diceCountInput = doc.getElementById('dice-count');
  const diceSidesInput = doc.getElementById('dice-sides');
  const diceBonusInput = doc.getElementById('dice-bonus');
  const rollDiceBtn = doc.getElementById('roll-dice-btn');
  const diceOutEl = doc.getElementById('dice-out');

  const flipCoinBtn = doc.getElementById('flip-coin-btn');
  const coinResultEl = doc.getElementById('coin-result');

  const levelRewardTrigger = doc.getElementById('level-reward-reminder-trigger');
  const levelRewardInfo = doc.getElementById('level-reward-info-trigger');
  const levelRewardText = doc.getElementById('level-reward-reminder-text');
  const levelRewardCount = doc.getElementById('level-reward-count');

  const miniGameReminder = doc.getElementById('mini-game-reminder');
  const miniGameName = doc.getElementById('mini-game-name');
  const miniGameStatus = doc.getElementById('mini-game-status');
  const miniGameMeta = doc.getElementById('mini-game-meta');
  const miniGameResume = doc.getElementById('mini-game-resume');

  const toastHistoryList = doc.getElementById('toast-history-list');

  let isOpen = false;
  let miniGameResumeHandler = null;

  // ---- NEW: force a consistent starting state ----
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');

  tab.classList.remove('is-open');
  tab.setAttribute('aria-expanded', 'false');
  tab.removeAttribute('aria-hidden');
  tab.disabled = false;
  // -----------------------------------------------

  const notifyState = () => {
    const detail = { open: isOpen, progress: isOpen ? 1 : 0 };
    dispatchChange(detail);
  };

  const setDrawerOpen = (open) => {
    const next = typeof open === 'boolean' ? open : !isOpen;
    if (next === isOpen) return;

    isOpen = next;
    drawer.classList.toggle('is-open', isOpen);
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    if (tab) {
      tab.classList.toggle('is-open', isOpen);
      tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      tab.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
      tab.disabled = isOpen;
    }

    if (!isOpen && tab) {
      tab.disabled = false;
      try {
        tab.focus();
      } catch {
        // ignore focus errors
      }
    }

    notifyState();
  };

  tab.addEventListener('click', () => setDrawerOpen(true));

  if (scrim) {
    scrim.addEventListener('click', () => setDrawerOpen(false));
  }

  if (gestureExit) {
    gestureExit.addEventListener('click', () => setDrawerOpen(false));
  }

  doc.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setDrawerOpen(false);
    }
  });

  const updateStatusTime = () => {
    if (!statusTime) return;
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const twelveHour = ((hours + 11) % 12) + 1;
    statusTime.textContent = `${twelveHour}:${minutes}`;
  };

  updateStatusTime();
  if (typeof setInterval === 'function') {
    setInterval(updateStatusTime, 60000);
  }

  const randomInt = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const addHistoryEntry = (label, detail) => {
    if (!toastHistoryList) return;
    const li = doc.createElement('li');

    const timeSpan = doc.createElement('span');
    timeSpan.className = 'toast-history-list__time';

    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    timeSpan.textContent = `[${h}:${m}]`;

    const textSpan = doc.createElement('span');
    textSpan.textContent = ` ${label}: ${detail}`;

    li.appendChild(timeSpan);
    li.appendChild(textSpan);

    const first = toastHistoryList.firstElementChild;
    toastHistoryList.insertBefore(li, first || null);
  };

  const rollInitiative = () => {
    if (!initiativeBonusInput || !initiativeResultEl) return;
    const bonus = parseInt(initiativeBonusInput.value || '0', 10) || 0;
    const die = randomInt(1, 20);
    const total = die + bonus;

    const bonusText = bonus === 0 ? '' : (bonus > 0 ? `+${bonus}` : `${bonus}`);
    initiativeResultEl.textContent = `${total} (${die}${bonusText ? ` ${bonusText}` : ''})`;

    addHistoryEntry('Initiative', `d20=${die}, bonus=${bonus}, total=${total}`);
  };

  if (rollInitiativeBtn) {
    rollInitiativeBtn.addEventListener('click', rollInitiative);
  }

  const rollDice = () => {
    if (!diceCountInput || !diceSidesInput || !diceOutEl) return;

    const count = Math.max(1, parseInt(diceCountInput.value || '1', 10) || 1);
    const sides = Math.max(2, parseInt(diceSidesInput.value || '20', 10) || 20);
    const bonus = diceBonusInput ? (parseInt(diceBonusInput.value || '0', 10) || 0) : 0;

    const rolls = [];
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const roll = randomInt(1, sides);
      rolls.push(roll);
      sum += roll;
    }

    const total = sum + bonus;
    const bonusText = bonus === 0 ? '' : (bonus > 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`);
    const detail = `${total} = [${rolls.join(', ')}]${bonusText}`;

    diceOutEl.textContent = detail;
    addHistoryEntry(`Roll ${count}d${sides}`, detail);
  };

  if (rollDiceBtn) {
    rollDiceBtn.addEventListener('click', rollDice);
  }

  const flipCoin = () => {
    if (!coinResultEl) return;
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    coinResultEl.textContent = result;
    addHistoryEntry('Coin', result);
  };

  if (flipCoinBtn) {
    flipCoinBtn.addEventListener('click', flipCoin);
  }

  const setLevelRewardReminder = (count, text) => {
    if (!levelRewardTrigger || !levelRewardText || !levelRewardCount) return;

    const numeric = parseInt(count || '0', 10) || 0;
    if (numeric <= 0) {
      levelRewardTrigger.disabled = true;
      levelRewardText.textContent = 'No pending rewards';
      levelRewardCount.hidden = true;
      levelRewardCount.textContent = '0';
      return;
    }

    levelRewardTrigger.disabled = false;
    levelRewardText.textContent = text || 'Rewards ready';
    levelRewardCount.hidden = false;
    levelRewardCount.textContent = String(numeric);
  };

  const clearLevelRewardReminder = () => {
    setLevelRewardReminder(0);
  };

  if (levelRewardTrigger) {
    levelRewardTrigger.addEventListener('click', () => {
      addHistoryEntry('Level rewards', 'Player opened level reward reminder');
    });
  }

  if (levelRewardInfo) {
    levelRewardInfo.addEventListener('click', () => {
      addHistoryEntry('Info', 'Level reward reminder info viewed');
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert('When your character hits a new level, this reminder lets you apply level-up rewards.');
      }
    });
  }

  const setMiniGameReminder = (options = {}) => {
    if (!miniGameReminder || !miniGameName || !miniGameStatus || !miniGameResume) return;

    const name = options.name || 'Mini game mission';
    const status = options.status || 'Pending';
    const meta = options.meta || '';

    miniGameName.textContent = name;
    miniGameStatus.textContent = `Status: ${status}`;

    if (miniGameMeta) {
      if (meta && meta.trim()) {
        miniGameMeta.hidden = false;
        miniGameMeta.textContent = meta;
      } else {
        miniGameMeta.hidden = true;
        miniGameMeta.textContent = '';
      }
    }

    miniGameResumeHandler = typeof options.onResume === 'function' ? options.onResume : null;
    miniGameReminder.hidden = false;
  };

  const clearMiniGameReminder = () => {
    if (!miniGameReminder || !miniGameName || !miniGameStatus) return;
    miniGameReminder.hidden = true;
    miniGameName.textContent = 'Mini game mission';
    miniGameStatus.textContent = 'Status: Pending';
    if (miniGameMeta) {
      miniGameMeta.hidden = true;
      miniGameMeta.textContent = '';
    }
    miniGameResumeHandler = null;
  };

  if (miniGameResume) {
    miniGameResume.addEventListener('click', () => {
      addHistoryEntry('Mini game', 'Resume pressed');
      if (typeof miniGameResumeHandler === 'function') {
        try {
          miniGameResumeHandler();
        } catch {
          // ignore
        }
      }
    });
  }

  const subscribe = (listener) => {
    if (typeof listener !== 'function') {
      return () => {};
    }
    // immediate snapshot
    listener({ open: isOpen, progress: isOpen ? 1 : 0 });
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  };

  // Global API for tests and app code
  const exposeApi = () => {
    const globalTarget = typeof window !== 'undefined' ? window : globalThis;
    if (!globalTarget) return;

    globalTarget.PlayerTools = {
      setLevelRewardReminder,
      clearLevelRewardReminder,
      setMiniGameReminder,
      clearMiniGameReminder,
      addHistoryEntry,
      openTray: () => setDrawerOpen(true),
      closeTray: () => setDrawerOpen(false)
    };
  };

  exposeApi();
  notifyState();

  return {
    open: () => setDrawerOpen(true),
    close: () => setDrawerOpen(false),
    toggle: () => setDrawerOpen(),
    subscribe,
    // left as a no-op so other code can safely call it
    setBatteryStatus() {},
    setLevelRewardReminder,
    clearLevelRewardReminder,
    setMiniGameReminder,
    clearMiniGameReminder,
    addHistoryEntry
  };
}

export function initializePlayerToolsDrawer() {
  if (!controllerInstance) {
    controllerInstance = createPlayerToolsDrawer();
  }
  return controllerInstance;
}

export const open = () => {
  const controller = initializePlayerToolsDrawer();
  controller && controller.open();
};

export const close = () => {
  const controller = initializePlayerToolsDrawer();
  controller && controller.close();
};

export const toggle = () => {
  const controller = initializePlayerToolsDrawer();
  controller && controller.toggle();
};

export const setBatteryStatus = (detail) => {
  const controller = initializePlayerToolsDrawer();
  if (controller && typeof controller.setBatteryStatus === 'function') {
    controller.setBatteryStatus(detail);
  }
};

export const subscribe = (listener) => {
  const controller = initializePlayerToolsDrawer();
  if (controller && typeof controller.subscribe === 'function') {
    return controller.subscribe(listener);
  }
  if (typeof listener === 'function') {
    listener({ open: false, progress: 0 });
  }
  return () => {};
};

export const onDrawerChange = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }

  initializePlayerToolsDrawer();

  const handler = (event) => {
    const detail = event && event.detail;
    if (detail && typeof detail.open === 'boolean') {
      const progress = typeof detail.progress === 'number' ? detail.progress : (detail.open ? 1 : 0);
      listener({ open: detail.open, progress });
    }
  };

  const doc = getDocument();
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener(DRAWER_CHANGE_EVENT, handler);
  }

  // fire a snapshot
  listener({ open: false, progress: 0 });

  return () => {
    if (doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener(DRAWER_CHANGE_EVENT, handler);
    }
  };
};

// Ensure auto-init when module loads
initializePlayerToolsDrawer();
