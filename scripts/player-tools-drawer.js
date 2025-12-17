import * as Characters from './characters.js';
import { emitDiceRollMessage, emitInitiativeRollMessage } from './discord-webhooks.js';

const DRAWER_CHANGE_EVENT = 'cc:player-tools-drawer';
let controllerInstance = null;
const changeListeners = new Set();
const getDocument = () => (typeof document !== 'undefined' ? document : null);
const getGlobal = () => {
  try {
    if (typeof window !== 'undefined') return window;
    if (typeof globalThis !== 'undefined') return globalThis;
  } catch (_) {}
  return null;
};

const formatBonus = (value = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '';
  return num > 0 ? `+${num}` : String(num);
};

const MAX_BREAKDOWN_ROLLS = 50;

const PHONE_OPEN_ATTR = 'data-pt-phone-open';
let lockedScrollY = 0;
let lastPhoneOpener = null;

const setPhoneGlobalLock = (on) => {
  const doc = getDocument();
  const root = doc?.documentElement;
  if (!root) return;
  if (on) root.setAttribute(PHONE_OPEN_ATTR, '1');
  else root.removeAttribute(PHONE_OPEN_ATTR);
};

const lockPageScroll = () => {
  const doc = getDocument();
  const body = doc?.body;
  if (!doc || !body) return;
  lockedScrollY = doc.defaultView?.scrollY || doc.documentElement?.scrollTop || body.scrollTop || 0;
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
};

const unlockPageScroll = () => {
  const doc = getDocument();
  const body = doc?.body;
  if (!doc || !body) return;
  body.style.position = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
  body.style.width = '';
  try {
    doc.defaultView?.scrollTo?.(0, lockedScrollY || 0);
  } catch (_) {}
};

const isPhoneOpen = () => {
  const doc = getDocument();
  return doc?.documentElement?.getAttribute(PHONE_OPEN_ATTR) === '1';
};

const applyGlobalPhoneLock = (on) => {
  setPhoneGlobalLock(on);
  if (on) lockPageScroll();
  else unlockPageScroll();
};

const getPhoneRoot = () => {
  const doc = getDocument();
  return doc?.getElementById('player-tools-drawer') || null;
};

const isInsidePhone = (target) => {
  const root = getPhoneRoot();
  return !!(root && target && typeof root.contains === 'function' && root.contains(target));
};

const blockIfOutsidePhone = (e) => {
  if (!isPhoneOpen()) return;
  if (isInsidePhone(e.target)) return;
  try { e.preventDefault(); } catch (_) {}
  try { e.stopPropagation(); } catch (_) {}
};

if (typeof window !== 'undefined') {
  try {
    window.addEventListener('wheel', blockIfOutsidePhone, { capture: true, passive: false });
    window.addEventListener('touchmove', blockIfOutsidePhone, { capture: true, passive: false });
    window.addEventListener('pointerdown', blockIfOutsidePhone, { capture: true });
    window.addEventListener(
      'keydown',
      (e) => {
        if (!isPhoneOpen()) return;
        if (isInsidePhone(e.target)) return;

        const keysToBlock = [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
          'Tab',
        ];
        if (keysToBlock.includes(e.key)) {
          try { e.preventDefault(); } catch (_) {}
          try { e.stopPropagation(); } catch (_) {}
        }
      },
      { capture: true }
    );
  } catch (_) {}
}

const formatDiceBreakdown = (rolls = [], bonus = 0) => {
  const list = Array.isArray(rolls) ? rolls : [];
  const shown = list.slice(0, MAX_BREAKDOWN_ROLLS);
  const hiddenCount = list.length - shown.length;
  const base = shown.length ? shown.join(' + ') : '0';
  const overflow = hiddenCount > 0 ? ` … (+${hiddenCount} more)` : '';
  const modifier = Number(bonus) ? ` ${formatBonus(bonus)}` : '';
  return `${base}${overflow}${modifier}`;
};

const getCurrentCharacterFn = () => {
  try {
    if (typeof Characters?.currentCharacter === 'function') return Characters.currentCharacter;
  } catch (_) {}

  const global = getGlobal();
  if (global && typeof global.currentCharacter === 'function') return global.currentCharacter;
  return null;
};

const getActiveCharacterName = () => {
  try {
    const resolver = getCurrentCharacterFn();
    const name = resolver ? resolver() : null;
    if (name && String(name).trim().length) return String(name).trim();
  } catch (_) {}
  return 'Player';
};

// Global singleton key: prevents double-init if this module is loaded twice
const GLOBAL_CONTROLLER_KEY = '__ccPlayerToolsDrawerController__';

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

const ensurePlayerToolsHost = () => {
  const globalTarget = typeof window !== 'undefined' ? window : globalThis;
  if (!globalTarget) return null;

  const host =
    globalTarget.PlayerTools && typeof globalTarget.PlayerTools === 'object'
      ? globalTarget.PlayerTools
      : {};

  const safeAssign = (key, value) => {
    if (!(key in host)) host[key] = value;
  };

  // Best-effort: real DOM lookup only. If legacy DOM doesn't exist, do nothing.
  const setLevelRewardReminder = (count = 0, label = 'Rewards') => {
    const pendingCount = clampPendingCount(count);
    const doc = getDocument();
    if (!doc) return pendingCount;

    const trigger = doc.getElementById('level-reward-reminder-trigger');
    const badge = doc.getElementById('level-reward-count');
    const infoTrigger = doc.getElementById('level-reward-info-trigger');

    const hasPending = pendingCount > 0;

    if (badge && typeof badge === 'object') {
      badge.textContent = pendingCount > 99 ? '99+' : String(pendingCount);
      badge.hidden = !hasPending;
    }
    if (trigger && typeof trigger === 'object') {
      trigger.hidden = !hasPending;
      trigger.disabled = !hasPending;
      trigger.setAttribute('aria-hidden', hasPending ? 'false' : 'true');
      trigger.setAttribute('aria-disabled', hasPending ? 'false' : 'true');
      trigger.setAttribute('aria-label', label || 'Rewards');
    }
    if (infoTrigger && typeof infoTrigger === 'object') {
      infoTrigger.hidden = !hasPending;
      infoTrigger.setAttribute('aria-hidden', hasPending ? 'false' : 'true');
    }
    return pendingCount;
  };

  const clearLevelRewardReminder = () => setLevelRewardReminder(0, 'Rewards');

  const setMiniGameReminder = (config = {}) => {
    const {
      name = 'Mini-Game',
      status = 'Pending',
      meta = '',
      onResume,
    } = config || {};

    const doc = getDocument();
    if (!doc) return;

    // Legacy IDs (may not exist anymore) - best effort only
    const card = doc.getElementById('mini-game-reminder');
    const nameEl = doc.getElementById('mini-game-name');
    const statusEl = doc.getElementById('mini-game-status');
    const metaEl = doc.getElementById('mini-game-meta');
    const resumeBtn = doc.getElementById('mini-game-resume');

    // If none exist, no-op.
    if (!card && !nameEl && !statusEl && !metaEl && !resumeBtn) return;

    if (nameEl) nameEl.textContent = name;
    if (statusEl) statusEl.textContent = status ? `Status: ${status}` : 'Status: Pending';
    if (metaEl) {
      const trimmed = String(meta || '').trim();
      metaEl.textContent = trimmed;
      metaEl.hidden = !trimmed;
    }
    if (resumeBtn) {
      const hasResumeHandler = typeof onResume === 'function';
      resumeBtn.onclick = hasResumeHandler ? () => onResume() : null;
      resumeBtn.disabled = !hasResumeHandler;
      resumeBtn.setAttribute('aria-disabled', hasResumeHandler ? 'false' : 'true');

      const label = String(name || '').trim();
      const hasName = label.length > 0;
      const baseLabel = 'Resume mini-game mission';
      const ariaLabel = hasName ? `${baseLabel} — ${label}` : baseLabel;
      resumeBtn.setAttribute('aria-label', ariaLabel);
    }
    if (card) {
      card.hidden = false;
      card.setAttribute('aria-hidden', 'false');
    }
  };

  const clearMiniGameReminder = () => {
    const doc = getDocument();
    if (!doc) return;
    const card = doc.getElementById('mini-game-reminder');
    const nameEl = doc.getElementById('mini-game-name');
    const statusEl = doc.getElementById('mini-game-status');
    const metaEl = doc.getElementById('mini-game-meta');
    const resumeBtn = doc.getElementById('mini-game-resume');
    if (nameEl) nameEl.textContent = '';
    if (statusEl) statusEl.textContent = 'Status: Pending';
    if (metaEl) {
      metaEl.textContent = '';
      metaEl.hidden = true;
    }
    if (resumeBtn) {
      resumeBtn.onclick = null;
      resumeBtn.disabled = true;
      resumeBtn.setAttribute('aria-disabled', 'true');
      resumeBtn.setAttribute('aria-label', 'Resume mini-game mission');
    }
    if (card) {
      card.hidden = true;
      card.setAttribute('aria-hidden', 'true');
    }
  };

  const addHistoryEntry = (label, detail) => {
    try {
      const doc = getDocument();
      if (!doc) return;
      const list =
        doc.querySelector('#player-tools-drawer #toast-history-list') ||
        doc.querySelector('#toast-history-list');
      if (!list) return;
      const li = doc.createElement('li');
      const now = new Date();
      const pad2 = (n) => String(n).padStart(2, '0');
      const time = `${now.getHours()}:${pad2(now.getMinutes())}`;
      li.textContent = `${time}  ${String(label ?? '')}: ${String(detail ?? '')}`;
      if (typeof list.prepend === 'function') list.prepend(li);
      else list.appendChild(li);
    } catch (_) {
      // no-throw
    }
  };

  safeAssign('setLevelRewardReminder', setLevelRewardReminder);
  safeAssign('clearLevelRewardReminder', clearLevelRewardReminder);
  safeAssign('setMiniGameReminder', setMiniGameReminder);
  safeAssign('clearMiniGameReminder', clearMiniGameReminder);
  safeAssign('addHistoryEntry', addHistoryEntry);

  // These delegate to the drawer controller if present; otherwise no-op.
  // They must exist for legacy callers, and must never throw.
  safeAssign('openTray', () => {
    try {
      const controller = initializePlayerToolsDrawer();
      if (controller && typeof controller.open === 'function') controller.open();
    } catch (_) {}
  });
  safeAssign('closeTray', () => {
    try {
      const controller = initializePlayerToolsDrawer();
      if (controller && typeof controller.close === 'function') controller.close();
    } catch (_) {}
  });
  safeAssign('toggleTray', () => {
    try {
      const controller = initializePlayerToolsDrawer();
      if (controller && typeof controller.toggle === 'function') controller.toggle();
    } catch (_) {}
  });
  safeAssign('subscribe', (listener) => {
    try {
      const controller = initializePlayerToolsDrawer();
      if (controller && typeof controller.subscribe === 'function') {
        return controller.subscribe(listener);
      }
    } catch (_) {}
    return () => {};
  });
  safeAssign('setBatteryStatus', (detail = {}) => {
    try {
      const next = detail && typeof detail === 'object' ? { ...detail } : {};
      if (!('levelPercent' in next) && typeof next.level === 'number' && Number.isFinite(next.level)) {
        next.levelPercent = next.level;
      }
      const controller = initializePlayerToolsDrawer();
      if (controller && typeof controller.setBatteryStatus === 'function') {
        controller.setBatteryStatus(next);
      }
    } catch (_) {}
  });

  globalTarget.PlayerTools = host;
  return host;
};

function createPlayerToolsDrawer() {
  const doc = getDocument();
  if (!doc) return null;

  const drawer = doc.getElementById('player-tools-drawer');
  const rootEl = doc.documentElement || null;
  const tab = doc.getElementById('player-tools-tab');
  const scrim = drawer
    ? drawer.querySelector('[data-player-tools-scrim], [data-pt-scrim]')
    : null;
  const tray = drawer ? drawer.querySelector('.pt-tray') : null;
  const splash = drawer ? drawer.querySelector('[data-pt-splash]') : null;
  const app = drawer ? drawer.querySelector('[data-pt-app]') : null;
  const cracks = drawer ? drawer.querySelector('[data-pt-cracks]') : null;

  const clockEls = drawer ? Array.from(drawer.querySelectorAll('[data-pt-clock]')) : [];
  const batteryEls = drawer ? Array.from(drawer.querySelectorAll('[data-pt-battery]')) : [];

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

  const deathSaveCard = qs('#pt-death-saves');
  if (deathSaveCard) {
    deathSaveCard.dataset.ptTool = 'death-saves';
  }

  const toastHistoryList = qs('#toast-history-list');

  if (!drawer || !tab) return null;

  // Prevent double-binding, but ONLY if we actually have a controller already.
  // (Avoid stale ptInit="1" causing a null controller return.)
  if (drawer.dataset.ptInit === '1' && controllerInstance) return controllerInstance;
  drawer.dataset.ptInit = '1';

  let isOpen = false;
  let splashTimer = null;
  let splashCleanupTimer = null;
  let timeInterval = null;
  let hpInterval = null;
  let batteryObj = null;
  let batteryApply = null;
  let removeBatteryBridge = null;
  let splashSeq = 0; // fixes splash replay if open triggers more than once

  if (splash) {
    splash.style.display = 'none';
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  const getCurrentTimeString = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const h12 = hours % 12 || 12;
    return `${h12}:${pad2(minutes)}`;
  };

  const updateClock = () => {
    const value = getCurrentTimeString();
    for (const el of clockEls) {
      if (el) el.textContent = value;
    }
  };

  const setBatteryVisual = ({ levelPercent = 75, charging = false, estimated = false } = {}) => {
    const lvl = Math.max(0, Math.min(100, Number(levelPercent) || 75));
    if (doc.documentElement) {
      doc.documentElement.style.setProperty('--pt-battery-level', `${lvl}%`);
    }

    for (const el of batteryEls) {
      if (!el) continue;
      el.classList.toggle('is-charging', !!charging);
      el.classList.toggle('is-estimated', !!estimated);
      const label = estimated
        ? 'Battery level unavailable (estimated display)'
        : `Battery level ${lvl}%`;
      el.setAttribute('aria-label', label);
    }
  };

  const initBattery = async () => {
    setBatteryVisual({ levelPercent: 75, charging: false, estimated: true });

    if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
      const win = doc?.defaultView;
      const handleBatteryBridge = (event) => {
        if (!event?.detail) return;
        const detail = event.detail || {};
        const level = Number.isFinite(Number(detail.levelPercent))
          ? Number(detail.levelPercent)
          : Number.isFinite(Number(detail.level))
            ? Number(detail.level)
            : Number.isFinite(Number(detail.percentage))
              ? Number(detail.percentage)
              : 75;
        setBatteryVisual({
          levelPercent: level,
          charging: !!detail.charging,
          estimated: detail.estimated !== undefined ? !!detail.estimated : true,
        });
      };
      if (win && typeof win.addEventListener === 'function') {
        win.addEventListener('player-tools:battery', handleBatteryBridge);
        removeBatteryBridge = () => win.removeEventListener('player-tools:battery', handleBatteryBridge);
      }
      return;
    }

    try {
      batteryObj = await navigator.getBattery();
      batteryApply = () => {
        const lvl = Math.round((batteryObj.level || 0) * 100);
        setBatteryVisual({
          levelPercent: lvl,
          charging: !!batteryObj.charging,
          estimated: false
        });
      };

      batteryApply();
      batteryObj.addEventListener('levelchange', batteryApply);
      batteryObj.addEventListener('chargingchange', batteryApply);
    } catch (_) {
      setBatteryVisual({ levelPercent: 75, charging: false, estimated: true });
    }
  };

  const showSplashThenApp = () => {
    if (!splash || !app) return;

    const seq = ++splashSeq;

    clearTimeout(splashCleanupTimer);
    splashCleanupTimer = null;

    splash.style.display = 'block';
    // Force layout so the opacity transition plays after toggling visibility
    void splash.offsetWidth;

    splash.classList.add('is-visible');
    splash.setAttribute('aria-hidden', 'false');
    app.style.opacity = '0';
    app.style.transition = 'opacity 220ms ease-out';

    clearTimeout(splashTimer);
    splashTimer = setTimeout(() => {
      if (seq !== splashSeq) return;
      splash.classList.remove('is-visible');
      splash.setAttribute('aria-hidden', 'true');
      app.style.opacity = '1';
      clearTimeout(splashCleanupTimer);
      splashCleanupTimer = setTimeout(() => {
        if (seq !== splashSeq) return;
        splash.style.display = 'none';
      }, 280);
    }, 2000);
  };

  let removeOutsideCloseListeners = null;

  const addOutsideCloseListeners = () => {
    if (removeOutsideCloseListeners) return;

    const handlePointerDown = (event) => {
      if (!isOpen) return;
      if (tray && tray.contains(event.target)) return;
      setDrawerOpen(false);
    };

    const handleClick = (event) => {
      if (!isOpen) return;
      if (tray && tray.contains(event.target)) return;
      setDrawerOpen(false);
    };

    doc.addEventListener('pointerdown', handlePointerDown, true);
    doc.addEventListener('click', handleClick, true);

    removeOutsideCloseListeners = () => {
      doc.removeEventListener('pointerdown', handlePointerDown, true);
      doc.removeEventListener('click', handleClick, true);
      removeOutsideCloseListeners = null;
    };
  };

  const shiftFocusAwayFromDrawer = () => {
    const active = doc?.activeElement;
    if (!active || !drawer || !drawer.contains(active)) return;

    const candidates = [
      tab && tab.isConnected ? tab : null,
      doc?.querySelector?.('#character-name') || null,
      doc?.querySelector?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || null,
    ].filter(Boolean);

    const target = candidates.find(el => el && typeof el.focus === 'function' && !drawer.contains(el));
    if (target) {
      try {
        target.focus({ preventScroll: true });
      } catch (err) {
        try { target.focus(); } catch (_) {}
      }
    } else if (typeof active.blur === 'function') {
      try { active.blur(); } catch (_) {}
    }
  };

  const setDrawerOpen = (open, { force = false } = {}) => {
    const next = !!open;
    if (!force && next === isOpen) return;

    if (next && !isOpen) {
      const active = doc?.activeElement;
      if (active && (!drawer || !drawer.contains(active))) {
        lastPhoneOpener = active;
      }
    }

    isOpen = next;

    applyGlobalPhoneLock(isOpen);

    // Lock interaction behind the phone
    try {
      const hasOpenModal = !!doc.querySelector('[data-pt-modal-open="1"]');
      doc.documentElement.classList.toggle('pt-os-lock', isOpen || hasOpenModal);
    } catch (_) {}

    // Grab focus into the phone shell when opening
    if (isOpen) {
      try {
        const phone = drawer.querySelector('[data-pt-phone-shell]') || drawer.querySelector('.pt-tray') || drawer;
        if (phone && typeof phone.focus === 'function') phone.focus({ preventScroll: true });
      } catch (_) {}
    }

    if (!isOpen) {
      shiftFocusAwayFromDrawer();
    }

    drawer.classList.toggle('is-open', isOpen);
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    try {
      drawer.inert = !isOpen;
      if (isOpen) drawer.removeAttribute('inert');
      else drawer.setAttribute('inert', '');
    } catch (_) {}

    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (tray) tray.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (scrim) {
      if (isOpen) scrim.removeAttribute('hidden');
      else scrim.setAttribute('hidden', '');
    }

    if (isOpen) {
      updateClock();
      updateCracks();
      // Do not auto-launch the Player Tools tray anymore.
      // The phone should open to the Player OS lock screen only.
      try { window.dispatchEvent(new CustomEvent('cc:player-tools-drawer-open')); } catch (_) {}
      addOutsideCloseListeners();
    } else {
      if (removeOutsideCloseListeners) removeOutsideCloseListeners();
      splashSeq += 1; // cancel any in-flight splash finish
      if (splash) {
        splash.classList.remove('is-visible');
        splash.setAttribute('aria-hidden', 'true');
        splash.style.display = 'none';
      }
      if (app) app.style.opacity = '1';
      clearTimeout(splashTimer);
      splashTimer = null;
      clearTimeout(splashCleanupTimer);
      splashCleanupTimer = null;

      try { window.dispatchEvent(new CustomEvent('cc:player-tools-drawer-close')); } catch (_) {}
      if (lastPhoneOpener && typeof lastPhoneOpener.focus === 'function') {
        try {
          lastPhoneOpener.focus({ preventScroll: true });
        } catch (_) {
          try { lastPhoneOpener.focus(); } catch (_) {}
        }
      }
      lastPhoneOpener = null;
    }

    dispatchChange({ open: isOpen, progress: isOpen ? 1 : 0 });
  };

  const toggle = () => setDrawerOpen(!isOpen);

  const updateResult = (el, value) => {
    if (!el) return;
    el.textContent = String(value);
    el.removeAttribute('data-placeholder');
  };

  const addHistoryEntryInternal = ({ label, value } = {}) => {
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
      addHistoryEntryInternal({ label: 'Initiative', value: total });

      emitInitiativeRollMessage({
        who: getActiveCharacterName(),
        formula: `1d20${formatBonus(bonus)}`.trim(),
        total,
        breakdown: `d20 (${roll})${bonus ? ` ${formatBonus(bonus)} (bonus)` : ''}`,
      });
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
      const label = `${count}d${labelSides}${formatBonus(bonus)}`;
      addHistoryEntryInternal({ label, value: total });

      emitDiceRollMessage({
        who: getActiveCharacterName(),
        rollType: `${count}d${labelSides}`,
        formula: `${count}d${labelSides}${formatBonus(bonus)}`.trim(),
        total,
        breakdown: formatDiceBreakdown(rolls, bonus),
      });
    });
  };

  const setupCoinFlip = () => {
    if (!flipCoinBtn) return;
    flipCoinBtn.addEventListener('click', () => {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      updateResult(coinResultEl, result);
      addHistoryEntryInternal({ label: 'Coin', value: result });
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

  const getHpState = () => {
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
    const pct = Math.max(0, Math.min(1, cur / max));
    return { cur, max, pct };
  };

  // Crack stages map HP to discrete overlays
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const hpToStage = (hpPct) => {
    const p = clamp(Number(hpPct), 0, 100);
    if (p >= 85) return 0;
    if (p >= 70) return 1;
    if (p >= 50) return 2;
    if (p >= 30) return 3;
    if (p >= 15) return 4;
    return 5;
  };

  const setCrackStage = (stage) => {
    if (!cracks) return;
    cracks.setAttribute('data-pt-stage', String(clamp(stage, 0, 5)));
  };

  const updateCracks = (hpPctOverride = null) => {
    if (!cracks) return;
    let stage = 0;

    if (Number.isFinite(hpPctOverride)) {
      const pct100 = hpPctOverride <= 1 ? hpPctOverride * 100 : hpPctOverride;
      stage = hpToStage(pct100);
    } else {
      const hpState = getHpState();
      stage = hpState ? hpToStage(hpState.pct * 100) : 0;
    }

    setCrackStage(stage);
  };

  const bindHpCrackListeners = () => {
    const curEl = queryFirst([
      '#hpCurrent',
      '#hp-current',
      '#current-hp',
      '[data-hp-current]',
      '[name="hp-current"]',
    ]);

    const maxEl = queryFirst([
      '#hpMax',
      '#hp-max',
      '[data-hp-max]',
      '[name="hp-max"]',
    ]);

    [curEl, maxEl].filter(Boolean).forEach((el) => {
      el.addEventListener('input', () => updateCracks(), { passive: true });
      el.addEventListener('change', () => updateCracks(), { passive: true });
    });
  };

  window.addEventListener('cc:player-damage', (e) => {
    const hpPct = Number(e?.detail?.hpPct);
    if (!Number.isFinite(hpPct)) return;
    updateCracks(hpPct);
  });

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
  const setBatteryStatus = (detail = {}) => {
    const next = detail && typeof detail === 'object' ? { ...detail } : {};
    if (!('levelPercent' in next) && typeof next.level === 'number' && Number.isFinite(next.level)) {
      next.levelPercent = next.level;
    }
    return setBatteryVisual(next || {});
  };

  // init
  setDrawerOpen(false, { force: true });
  updateClock();
  initBattery();
  bindHpCrackListeners();

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
      if (batteryObj && batteryApply) {
        batteryObj.removeEventListener('levelchange', batteryApply);
        batteryObj.removeEventListener('chargingchange', batteryApply);
      }
    } catch (_) {}
    if (typeof removeBatteryBridge === 'function') {
      try { removeBatteryBridge(); } catch (_) {}
    }
    batteryApply = null;
    batteryObj = null;
    removeBatteryBridge = null;

    if (removeOutsideCloseListeners) removeOutsideCloseListeners();

    tab.removeEventListener('click', toggle);
    scrim && scrim.removeEventListener('click', handleScrimClick);
    gestureExit && gestureExit.removeEventListener('click', handleGestureExit);
    doc.removeEventListener('keydown', handleKeydown);

    // Allow safe re-init (module re-eval / hot reload / duplicate load)
    try { drawer.dataset.ptInit = '0'; } catch (_) {}
  };

  return { open, close, toggle, subscribe, setBatteryStatus, teardown };
}

export function initializePlayerToolsDrawer() {
  const g = getGlobal();
  ensurePlayerToolsHost();
  const doc = getDocument();
  const drawer = doc?.getElementById('player-tools-drawer');
  const drawerInitialized = !!drawer && drawer.dataset.ptInit === '1';
  const existing = g && g[GLOBAL_CONTROLLER_KEY];

  // If a real controller exists and the drawer is already wired, reuse it.
  if (existing && drawerInitialized) {
    controllerInstance = existing;
    return controllerInstance;
  }

  // DOM reloaded or stale state: teardown old wiring so we can rebind.
  if (existing && !drawerInitialized) {
    try {
      existing.teardown?.();
    } catch (_) {}
  }

  // No usable controller: clear stale init flag so we can build one.
  if (drawer && drawer.dataset.ptInit === '1') {
    try { drawer.dataset.ptInit = '0'; } catch (_) {}
  }

  controllerInstance = null;
  controllerInstance = createPlayerToolsDrawer();
  if (g && controllerInstance) g[GLOBAL_CONTROLLER_KEY] = controllerInstance;
  return controllerInstance;
}

export const open = () => initializePlayerToolsDrawer()?.open();
export const close = () => initializePlayerToolsDrawer()?.close();
export const toggle = () => initializePlayerToolsDrawer()?.toggle();
export const subscribe = (listener) => initializePlayerToolsDrawer()?.subscribe(listener) ?? (() => {});
export const onDrawerChange = (listener) => subscribe(listener);
export const setBatteryStatus = (detail) => initializePlayerToolsDrawer()?.setBatteryStatus?.(detail);

// Ensure auto-init when module loads
initializePlayerToolsDrawer();
