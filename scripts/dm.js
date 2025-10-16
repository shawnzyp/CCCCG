import { listCharacters, loadCharacter } from './characters.js';
import { DM_PIN, DM_DEVICE_FINGERPRINT } from './dm-pin.js';
import { show, hide } from './modal.js';
import {
  listMiniGames,
  getMiniGame,
  getDefaultConfig,
  loadMiniGameReadme,
  formatKnobValue,
  subscribeToDeployments as subscribeMiniGameDeployments,
  refreshDeployments as refreshMiniGameDeployments,
  deployMiniGame as deployMiniGameToCloud,
  updateDeployment as updateMiniGameDeployment,
  deleteDeployment as deleteMiniGameDeployment,
  MINI_GAME_STATUS_OPTIONS,
  summarizeConfig,
  getStatusLabel,
} from './mini-games.js';
import { storeDmCatalogPayload } from './dm-catalog-sync.js';
import { saveCloud } from './storage.js';
const DM_NOTIFICATIONS_KEY = 'dm-notifications-log';
const PENDING_DM_NOTIFICATIONS_KEY = 'cc:pending-dm-notifications';
const MAX_STORED_NOTIFICATIONS = 100;

function computeDeviceFingerprint() {
  if (typeof navigator === 'undefined') return '';
  const { userAgent = '', language = '', platform = '' } = navigator;
  let screenInfo = '';
  if (typeof screen !== 'undefined') {
    const { width = '', height = '', colorDepth = '' } = screen;
    screenInfo = `${width}x${height}x${colorDepth}`;
  }
  let timeZone = '';
  try {
    timeZone = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || '';
  } catch {
    timeZone = '';
  }
  const raw = [userAgent, language, platform, screenInfo, timeZone].join('||');
  try {
    return btoa(raw);
  } catch {
    return raw;
  }
}

function isAuthorizedDevice() {
  if (!DM_DEVICE_FINGERPRINT) return true;
  return computeDeviceFingerprint() === DM_DEVICE_FINGERPRINT;
}

if (typeof window !== 'undefined' && !window.computeDmDeviceFingerprint) {
  window.computeDmDeviceFingerprint = computeDeviceFingerprint;
}

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function normalizeTimestamp(value) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toLocaleString();
  return new Date().toLocaleString();
}

function loadStoredNotifications() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(DM_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map(entry => {
        if (!entry || typeof entry.detail !== 'string') return null;
        const ts = normalizeTimestamp(entry.ts);
        const char = typeof entry.char === 'string' ? entry.char : '';
        const html = typeof entry.html === 'string' ? entry.html : null;
        const record = { ts, char, detail: entry.detail };
        if (html) record.html = html;
        return record;
      })
      .filter(Boolean);
    if (normalized.length > MAX_STORED_NOTIFICATIONS) {
      return normalized.slice(normalized.length - MAX_STORED_NOTIFICATIONS);
    }
    return normalized;
  } catch {
    return [];
  }
}

const notifications = loadStoredNotifications();

const AUDIO_DISABLED_VALUES = new Set(['off', 'mute', 'muted', 'disabled', 'false', 'quiet', 'silent', 'none', '0']);
const AUDIO_ENABLED_VALUES = new Set(['on', 'enabled', 'true', 'sound', 'audible', '1', 'default']);
const AUDIO_PREFERENCE_STORAGE_KEYS = [
  'cc:audio-preference',
  'cc:audioPreference',
  'cc:audio',
  'ccccg:audio',
];
const DM_NOTIFICATION_TONE_DEBOUNCE_MS = 220;
let lastNotificationToneAt = Number.NEGATIVE_INFINITY;
let pendingNotificationTone = null;

function interpretAudioPreference(value) {
  if (value == null) return null;
  if (typeof value === 'function') {
    try {
      const scoped = value('notifications');
      const interpretedScoped = interpretAudioPreference(scoped);
      if (interpretedScoped !== null) return interpretedScoped;
    } catch {
      /* ignore */
    }
    try {
      return interpretAudioPreference(value());
    } catch {
      return null;
    }
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    if (AUDIO_DISABLED_VALUES.has(normalized)) return false;
    if (AUDIO_ENABLED_VALUES.has(normalized)) return true;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return interpretAudioPreference(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    if ('notifications' in value) return interpretAudioPreference(value.notifications);
    if ('enabled' in value) return interpretAudioPreference(value.enabled);
    if ('sound' in value) return interpretAudioPreference(value.sound);
    if ('audio' in value) return interpretAudioPreference(value.audio);
    if ('value' in value) return interpretAudioPreference(value.value);
  }
  return null;
}

function getStoredAudioPreference() {
  if (typeof localStorage === 'undefined') return null;
  for (const key of AUDIO_PREFERENCE_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (typeof raw !== 'string') continue;
      const interpreted = interpretAudioPreference(raw);
      if (interpreted !== null) return interpreted;
    } catch {
      /* ignore storage errors */
    }
  }
  return null;
}

function shouldPlayNotificationTone() {
  if (typeof window === 'undefined') return false;
  const stored = getStoredAudioPreference();
  if (stored === false) return false;
  let hasExplicitPreference = stored !== null;
  let allow = stored === true;
  const sources = [
    window.ccAudioPreference,
    window.audioPreference,
    window?.ccPreferences?.audio,
  ];
  for (const source of sources) {
    const result = interpretAudioPreference(source);
    if (result === null) continue;
    hasExplicitPreference = true;
    if (result === false) return false;
    if (result === true) allow = true;
  }
  return hasExplicitPreference ? allow : true;
}

function getNotificationAudioHelper() {
  if (typeof window === 'undefined') return null;
  const candidates = [
    window.ccPlayNotificationSound,
    window.playNotificationSound,
    window.dmPlayNotificationSound,
    window.playTone,
  ];
  return candidates.find(fn => typeof fn === 'function') || null;
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function playNotificationTone() {
  if (!shouldPlayNotificationTone()) return;
  const helper = getNotificationAudioHelper();
  if (!helper) return;
  const invoke = () => {
    pendingNotificationTone = null;
    lastNotificationToneAt = now();
    try {
      helper('info');
    } catch {
      try {
        helper();
      } catch {
        /* ignore helper errors */
      }
    }
  };
  const elapsed = now() - lastNotificationToneAt;
  if (elapsed >= DM_NOTIFICATION_TONE_DEBOUNCE_MS) {
    invoke();
    return;
  }
  if (pendingNotificationTone) {
    clearTimeout(pendingNotificationTone);
  }
  pendingNotificationTone = setTimeout(invoke, DM_NOTIFICATION_TONE_DEBOUNCE_MS - elapsed);
}

function persistNotifications() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const trimmed = notifications.slice(-MAX_STORED_NOTIFICATIONS);
    sessionStorage.setItem(DM_NOTIFICATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore persistence errors */
  }
}

function deriveNotificationChar() {
  try {
    return sessionStorage.getItem('dmLoggedIn') === '1'
      ? 'DM'
      : localStorage.getItem('last-save') || '';
  } catch {
    return '';
  }
}

function buildNotification(detail, meta = {}) {
  const text = typeof detail === 'string' ? detail : String(detail ?? '');
  if (!text) return null;
  const ts = normalizeTimestamp(meta.ts);
  const char = typeof meta.char === 'string' && meta.char ? meta.char : deriveNotificationChar();
  const entry = { ts, char, detail: text };
  if (typeof meta.html === 'string' && meta.html) {
    entry.html = meta.html;
  }
  return entry;
}

function formatNotification(entry, { html = false } = {}) {
  const prefix = entry.char ? `${entry.char}: ` : '';
  if (html && entry.html) {
    const safeTs = escapeHtml(entry.ts);
    const safePrefix = escapeHtml(prefix);
    return `[${safeTs}] ${safePrefix}${entry.html}`;
  }
  return `[${entry.ts}] ${prefix}${entry.detail}`;
}

function initDMLogin(){
  const dmBtn = document.getElementById('dm-login');
  const dmToggleBtn = document.getElementById('dm-tools-toggle');
  const menu = document.getElementById('dm-tools-menu');
  const dmPortal = document.querySelector('.dm-tools-portal');

  if (dmPortal && document.body && dmPortal.parentElement !== document.body) {
    try {
      document.body.appendChild(dmPortal);
    } catch (err) {
      console.warn('Unable to reparent DM tools portal', err);
    }
  }
  const tsomfBtn = document.getElementById('dm-tools-tsomf');
  const notifyBtn = document.getElementById('dm-tools-notifications');
  const charBtn = document.getElementById('dm-tools-characters');
  const miniGamesBtn = document.getElementById('dm-tools-mini-games');
  const catalogBtn = document.getElementById('dm-tools-catalog');
  const logoutBtn = document.getElementById('dm-tools-logout');
  const loginModal = document.getElementById('dm-login-modal');
  const loginPin = document.getElementById('dm-login-pin');
  const loginSubmit = document.getElementById('dm-login-submit');
  const loginClose = document.getElementById('dm-login-close');
  const notifyModal = document.getElementById('dm-notifications-modal');
  const notifyList = document.getElementById('dm-notifications-list');
  const notifyClose = document.getElementById('dm-notifications-close');
  const charModal = document.getElementById('dm-characters-modal');
  const charList = document.getElementById('dm-characters-list');
  const charClose = document.getElementById('dm-characters-close');
  const charViewModal = document.getElementById('dm-character-modal');
  const charViewClose = document.getElementById('dm-character-close');
  const charView = document.getElementById('dm-character-sheet');
  const miniGamesModal = document.getElementById('dm-mini-games-modal');
  const miniGamesClose = document.getElementById('dm-mini-games-close');
  const miniGamesList = document.getElementById('dm-mini-games-list');
  const miniGamesTitle = document.getElementById('dm-mini-games-title');
  const miniGamesTagline = document.getElementById('dm-mini-games-tagline');
  const miniGamesLaunch = document.getElementById('dm-mini-games-launch');
  const miniGamesIntro = document.getElementById('dm-mini-games-steps');
  const miniGamesKnobsHint = document.getElementById('dm-mini-games-knobs-hint');
  const miniGamesKnobs = document.getElementById('dm-mini-games-knobs');
  const miniGamesPlayerHint = document.getElementById('dm-mini-games-player-hint');
  const miniGamesPlayerSelect = document.getElementById('dm-mini-games-player');
  const miniGamesPlayerCustom = document.getElementById('dm-mini-games-player-custom');
  const miniGamesNotes = document.getElementById('dm-mini-games-notes');
  const miniGamesRefreshPlayers = document.getElementById('dm-mini-games-refresh-players');
  const miniGamesDeployBtn = document.getElementById('dm-mini-games-deploy');
  const miniGamesReadme = document.getElementById('dm-mini-games-readme');
  const miniGamesRefreshBtn = document.getElementById('dm-mini-games-refresh');
  const miniGamesDeployments = document.getElementById('dm-mini-games-deployments');
  const miniGamesFiltersForm = document.getElementById('dm-mini-games-filters');
  const miniGamesFilterStatus = document.getElementById('dm-mini-games-filter-status');
  const miniGamesFilterAssignee = document.getElementById('dm-mini-games-filter-assignee');
  const catalogModal = document.getElementById('dm-catalog-modal');
  const catalogClose = document.getElementById('dm-catalog-close');
  const catalogTabs = document.getElementById('dm-catalog-tabs');
  const catalogPanels = document.getElementById('dm-catalog-panels');
  const creditBtn = document.getElementById('dm-tools-credit');
  const creditModal = document.getElementById('dm-credit-modal');
  const creditClose = document.getElementById('dm-credit-close');
  const creditCard = document.getElementById('dm-credit-card');
  const creditAccountSelect = document.getElementById('dm-credit-account');
  const creditTxnType = document.getElementById('dm-credit-type');
  const creditAmountInput = document.getElementById('dm-credit-amount');
  const creditSenderSelect = document.getElementById('dm-credit-sender');
  const creditSubmit = document.getElementById('dm-credit-submit');
  const creditRef = document.getElementById('dm-credit-ref');
  const creditTxid = document.getElementById('dm-credit-txid');
  const creditFooterDate = document.getElementById('dm-credit-footerDate');
  const creditFooterTime = document.getElementById('dm-credit-footerTime');
  const creditStatus = document.getElementById('dm-credit-status');
  const creditMemoInput = document.getElementById('dm-credit-memo');
  const creditMemoPreview = document.getElementById('dm-credit-memo-preview');
  const creditMemoPreviewText = document.getElementById('dm-credit-memo-previewText');

  const CATALOG_RECIPIENT_FIELD_KEY = 'recipient';
  const CATALOG_RECIPIENT_PLACEHOLDER = 'Assign to hero (optional)';

  const CATALOG_TYPES = [
    { id: 'gear', label: 'Gear', blurb: 'Outfit your operatives with surveillance, support, and survival tech.' },
    { id: 'weapons', label: 'Weapons', blurb: 'Detail signature arsenals, from close-quarters tools to experimental ordnance.' },
    { id: 'armor', label: 'Armor', blurb: 'Describe layered defenses, hardlight plating, and reactive shielding.' },
    { id: 'items', label: 'Items', blurb: 'Track consumables, mission-critical widgets, and bespoke creations.' },
    { id: 'powers', label: 'Powers', blurb: 'Capture advanced techniques, psionics, or shard-channeling abilities.' },
    { id: 'signature-moves', label: 'Signature Moves', blurb: 'Script cinematic finishers and team-defining maneuvers.' },
  ];

  const CATALOG_BASE_SHORT_FIELDS = [
    { key: 'name', label: 'Name', kind: 'input', type: 'text', required: true, placeholder: 'Entry name', autocomplete: 'off' },
    { key: 'tier', label: 'Tier / Level', kind: 'input', type: 'text', placeholder: 'Tier or recommended level' },
    { key: 'price', label: 'Price / Cost', kind: 'input', type: 'text', placeholder: 'Credits, barter, or opportunity cost' },
    { key: 'rarity', label: 'Rarity', kind: 'input', type: 'text', placeholder: 'Common, rare, prototype…' },
    { key: 'tags', label: 'Tags', kind: 'input', type: 'text', placeholder: 'Comma-separated keywords' },
  ];

  const CATALOG_BASE_LONG_FIELDS = [
    { key: 'description', label: 'Overview', kind: 'textarea', rows: 4, placeholder: 'Describe the entry and how it appears in play.' },
    { key: 'mechanics', label: 'Mechanical Effects', kind: 'textarea', rows: 3, placeholder: 'Summarize bonuses, checks, and rules interactions.' },
    { key: 'dmNotes', label: 'DM Notes', kind: 'textarea', rows: 3, placeholder: 'Secret hooks, escalation paths, or reminders.', hint: 'Only visible to you when drafting entries.' },
  ];

  const CATALOG_TYPE_SHORT_FIELDS = {
    gear: [
      { key: 'function', label: 'Primary Function', kind: 'input', type: 'text', placeholder: 'Utility, infiltration, support, etc.' },
      { key: 'availability', label: 'Availability', kind: 'input', type: 'text', placeholder: 'Common, restricted, prototype…' },
    ],
    weapons: [
      { key: 'damage', label: 'Damage Profile', kind: 'input', type: 'text', placeholder: 'e.g. 2d6 kinetic + 1 burn' },
      { key: 'range', label: 'Range', kind: 'input', type: 'text', placeholder: 'Reach, 20m, etc.' },
    ],
    armor: [
      { key: 'defense', label: 'Defense Bonus', kind: 'input', type: 'text', placeholder: '+2 Guard, Resist Energy' },
      { key: 'capacity', label: 'Capacity / Slots', kind: 'input', type: 'text', placeholder: 'Light, 2 slots, etc.' },
    ],
    items: [
      { key: 'uses', label: 'Uses', kind: 'input', type: 'text', placeholder: 'Single-use, 3 charges, etc.' },
      { key: 'size', label: 'Size / Carry', kind: 'input', type: 'text', placeholder: 'Handheld, pack, etc.' },
      { key: CATALOG_RECIPIENT_FIELD_KEY, label: 'Recipient', kind: 'select', placeholder: CATALOG_RECIPIENT_PLACEHOLDER },
    ],
    powers: [
      { key: 'cost', label: 'Cost / Resource', kind: 'input', type: 'text', placeholder: 'SP cost, cooldown, etc.' },
      { key: 'duration', label: 'Duration', kind: 'input', type: 'text', placeholder: 'Instant, sustain, scene, etc.' },
    ],
    'signature-moves': [
      { key: 'trigger', label: 'Trigger', kind: 'input', type: 'text', placeholder: 'Describe when the move activates' },
      { key: 'reward', label: 'Reward / Impact', kind: 'input', type: 'text', placeholder: 'Damage, status, or story payoff' },
    ],
  };

  const CATALOG_TYPE_LONG_FIELDS = {
    gear: [
      { key: 'operation', label: 'Operating Notes', kind: 'textarea', rows: 3, placeholder: 'Setup, requirements, and failure modes.' },
    ],
    weapons: [
      { key: 'special', label: 'Special Rules', kind: 'textarea', rows: 3, placeholder: 'Alternate fire modes, reload steps, complications.' },
    ],
    armor: [
      { key: 'coverage', label: 'Coverage & Traits', kind: 'textarea', rows: 3, placeholder: 'Systems protected, energy channels, or resistances.' },
    ],
    items: [
      { key: 'usage', label: 'Usage Notes', kind: 'textarea', rows: 3, placeholder: 'How and when players can use this item.' },
    ],
    powers: [
      { key: 'effect', label: 'Power Effect', kind: 'textarea', rows: 3, placeholder: 'Describe outcomes, saves, and failure states.' },
    ],
    'signature-moves': [
      { key: 'narrative', label: 'Narrative Beats', kind: 'textarea', rows: 3, placeholder: 'Paint the cinematic moment for the move.' },
    ],
  };

  const creditAccountNumbers = new Map();
  const creditAmountFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PLAYER_CREDIT_STORAGE_KEY = 'cc_dm_card';
  const PLAYER_CREDIT_BROADCAST_CHANNEL = 'cc:player-credit';
  const PLAYER_CREDIT_HISTORY_LIMIT = 10;
  let playerCreditBroadcastChannel = null;

  function creditPad(n) {
    return String(n).padStart(2, '0');
  }

  function creditFormatDate(d) {
    return `${creditPad(d.getMonth() + 1)}-${creditPad(d.getDate())}-${d.getFullYear()}`;
  }

  function creditFormatTime(d) {
    return `${creditPad(d.getHours())}:${creditPad(d.getMinutes())}:${creditPad(d.getSeconds())}`;
  }

  function computeCreditAccountNumber(name = '') {
    if (creditAccountNumbers.has(name)) {
      return creditAccountNumbers.get(name);
    }
    const normalized = name.normalize?.('NFKD')?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PLAYER';
    let hash = 1469598103934665603n;
    const PRIME = 1099511628211n;
    for (let i = 0; i < normalized.length; i += 1) {
      hash ^= BigInt(normalized.charCodeAt(i));
      hash = (hash * PRIME) % 10000000000000000n;
    }
    if (hash === 0n) {
      hash = 982451653n;
    }
    const digits = hash.toString().padStart(16, '0');
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1-');
    creditAccountNumbers.set(name, formatted);
    return formatted;
  }

  function sanitizeCreditAmount(value) {
    const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value);
    const cleaned = stringValue.replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length <= 2) return cleaned;
    return `${parts.shift()}.${parts.join('')}`;
  }

  function getCreditAmountNumber() {
    if (!creditAmountInput) return 0;
    const sanitized = sanitizeCreditAmount(creditAmountInput.value);
    if (sanitized === '') return 0;
    const num = Number(sanitized);
    return Number.isFinite(num) ? num : 0;
  }

  function formatCreditAmountDisplay(value) {
    const numeric = Number.isFinite(value) ? value : 0;
    return creditAmountFormatter.format(numeric);
  }

  function updateCreditCardAmountDisplay(value) {
    if (!creditCard) return;
    const numeric = Number.isFinite(value) ? value : 0;
    creditCard.setAttribute('data-amount', numeric.toFixed(2));
  }

  function sanitizeCreditMemo(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function updateCreditMemoPreview(value) {
    const memo = sanitizeCreditMemo(value);
    if (creditCard) {
      creditCard.setAttribute('data-memo', memo);
    }
    if (creditMemoPreviewText) {
      creditMemoPreviewText.textContent = memo || '—';
    }
    if (creditMemoPreview) {
      creditMemoPreview.hidden = memo === '';
    }
  }

  function ensurePlayerCreditBroadcastChannel() {
    if (playerCreditBroadcastChannel || typeof BroadcastChannel !== 'function') {
      return playerCreditBroadcastChannel;
    }
    try {
      playerCreditBroadcastChannel = new BroadcastChannel(PLAYER_CREDIT_BROADCAST_CHANNEL);
    } catch {
      playerCreditBroadcastChannel = null;
    }
    return playerCreditBroadcastChannel;
  }

  function sanitizePlayerCreditPayload(payload = {}) {
    const amountValue = Number(payload.amount);
    const timestamp = (() => {
      if (payload.timestamp instanceof Date) return payload.timestamp.toISOString();
      if (typeof payload.timestamp === 'string' && payload.timestamp) {
        const parsed = new Date(payload.timestamp);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      }
      return new Date().toISOString();
    })();
    return {
      account: typeof payload.account === 'string' ? payload.account : '',
      amount: Number.isFinite(amountValue) ? amountValue : 0,
      type: typeof payload.type === 'string' ? payload.type : '',
      sender: typeof payload.sender === 'string' ? payload.sender : '',
      ref: typeof payload.ref === 'string' ? payload.ref : '',
      txid: typeof payload.txid === 'string' ? payload.txid : '',
      timestamp,
      player: typeof payload.player === 'string' ? payload.player : '',
      memo: sanitizeCreditMemo(payload.memo),
    };
  }

  function parseStoredPlayerCreditHistory(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      return [];
    }
    return [];
  }

  function playerCreditHistoryKey(entry = {}) {
    return `${entry.txid || entry.ref || ''}|${entry.timestamp || ''}`;
  }

  function appendPlayerCreditHistory(entry) {
    const base = [entry];
    if (typeof localStorage === 'undefined') return base;
    try {
      const existingRaw = localStorage.getItem(PLAYER_CREDIT_STORAGE_KEY);
      const existing = parseStoredPlayerCreditHistory(existingRaw);
      const key = playerCreditHistoryKey(entry);
      const filtered = existing.filter(item => playerCreditHistoryKey(item) !== key);
      filtered.unshift(entry);
      const limited = filtered.slice(0, PLAYER_CREDIT_HISTORY_LIMIT);
      localStorage.setItem(PLAYER_CREDIT_STORAGE_KEY, JSON.stringify(limited));
      return limited;
    } catch {
      /* ignore history persistence errors */
      return base;
    }
  }

  function broadcastPlayerCreditUpdate(payload) {
    if (typeof window === 'undefined') return;
    const sanitized = sanitizePlayerCreditPayload(payload);
    appendPlayerCreditHistory(sanitized);
    const channel = ensurePlayerCreditBroadcastChannel();
    if (channel) {
      try {
        channel.postMessage({ type: 'CC_PLAYER_UPDATE', payload: sanitized });
      } catch {
        /* ignore broadcast failures */
      }
    }
    try {
      const origin = window.location?.origin || '*';
      window.postMessage({ type: 'CC_PLAYER_UPDATE', payload: sanitized }, origin);
    } catch {
      try {
        window.postMessage({ type: 'CC_PLAYER_UPDATE', payload: sanitized }, '*');
      } catch {
        /* ignore postMessage failures */
      }
    }
    if (typeof window.setPlayerTransaction === 'function') {
      try {
        window.setPlayerTransaction(sanitized, { reveal: false });
      } catch {
        /* ignore preview failures */
      }
    }
  }

  function applyCreditAccountSelection() {
    if (!creditCard) return;
    const option = creditAccountSelect?.selectedOptions?.[0] || null;
    const player = option?.value?.trim() || '';
    const accountNumber = option?.dataset?.accountNumber || '';
    creditCard.setAttribute('data-player', player);
    creditCard.setAttribute('data-account', accountNumber);
  }

  function updateCreditSubmitState() {
    if (!creditSubmit) return;
    const playerSelected = !!(creditAccountSelect && creditAccountSelect.value);
    const amount = getCreditAmountNumber();
    const isValidAmount = Number.isFinite(amount) && amount > 0;
    creditSubmit.disabled = !(playerSelected && isValidAmount);
  }

  async function refreshCreditAccounts({ preserveSelection = true } = {}) {
    if (!creditAccountSelect) return;
    const previous = preserveSelection ? creditAccountSelect.value : '';
    creditAccountSelect.disabled = true;
    creditAccountSelect.innerHTML = '<option value="">Loading players…</option>';
    applyCreditAccountSelection();
    updateCreditSubmitState();
    try {
      const names = await listCharacters();
      const seen = new Set();
      const filtered = names
        .filter(name => {
          if (typeof name !== 'string') return false;
          const trimmed = name.trim();
          if (!trimmed || trimmed === 'The DM') return false;
          if (seen.has(trimmed)) return false;
          seen.add(trimmed);
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
      creditAccountSelect.innerHTML = '';
      if (!filtered.length) {
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'No players available';
        none.disabled = true;
        creditAccountSelect.appendChild(none);
        creditAccountSelect.value = '';
        creditAccountSelect.disabled = true;
        applyCreditAccountSelection();
        updateCreditSubmitState();
        return;
      }
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a player';
      creditAccountSelect.appendChild(placeholder);
      filtered.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        const accountNumber = computeCreditAccountNumber(name);
        option.dataset.accountNumber = accountNumber;
        option.textContent = `${name} — ${accountNumber}`;
        creditAccountSelect.appendChild(option);
      });
      creditAccountSelect.disabled = false;
      if (previous && filtered.includes(previous)) {
        creditAccountSelect.value = previous;
      } else {
        creditAccountSelect.value = '';
      }
      applyCreditAccountSelection();
      updateCreditSubmitState();
    } catch (err) {
      console.error('Failed to load characters for credit tool', err);
      creditAccountSelect.innerHTML = '<option value="">Unable to load players</option>';
      creditAccountSelect.value = '';
      creditAccountSelect.disabled = true;
      applyCreditAccountSelection();
      updateCreditSubmitState();
      if (typeof toast === 'function') {
        toast('Unable to load players', 'error');
      }
    }
  }

  function captureCreditTimestamp() {
    if (!creditCard) return;
    const now = new Date();
    if (creditFooterDate) creditFooterDate.textContent = creditFormatDate(now);
    if (creditFooterTime) creditFooterTime.textContent = creditFormatTime(now);
    creditCard.setAttribute('data-timestamp', now.toISOString());
  }

  function generateCreditReference(senderId) {
    const map = { OMNI: 'OMNI', PFV: 'PFV', GREY: 'GREY', ANON: 'ANON' };
    const prefix = map[senderId] || (senderId || 'DM').toUpperCase();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(Math.random() * 900000) + 100000;
    return `TXN-${prefix}-${datePart}-${randomPart}`;
  }

  function generateCreditTxid(senderId) {
    const map = { OMNI: 'OMNI', PFV: 'PFV', GREY: 'GREY', ANON: 'ANON' };
    const prefix = map[senderId] || (senderId || 'DM').toUpperCase();
    const randomPart = Math.floor(Math.random() * 90000000) + 10000000;
    return `ID-${prefix}-${randomPart}`;
  }

  function updateCreditSenderDataset() {
    if (!creditCard) return;
    creditCard.setAttribute('data-sender', creditSenderSelect?.value || '');
  }

  function randomizeCreditIdentifiers() {
    if (!creditCard) return;
    const senderId = creditSenderSelect?.value || '';
    const ref = generateCreditReference(senderId);
    const txId = generateCreditTxid(senderId);
    if (creditRef) creditRef.textContent = ref;
    if (creditTxid) creditTxid.textContent = txId;
    creditCard.setAttribute('data-ref', ref);
    creditCard.setAttribute('data-txid', txId);
  }

  function getCreditSenderLabel() {
    const option = creditSenderSelect?.selectedOptions?.[0];
    if (option && option.textContent) return option.textContent.trim();
    if (creditSenderSelect && creditSenderSelect.value) return creditSenderSelect.value;
    return 'DM';
  }

  function updateCreditTransactionType() {
    if (!creditCard) return;
    const type = creditTxnType?.value || 'Deposit';
    creditCard.setAttribute('data-transaction-type', type);
    if (creditStatus) {
      const isDebit = type === 'Debit';
      creditStatus.textContent = isDebit ? 'Debit Pending' : 'Completed';
      creditStatus.classList.toggle('dm-credit__status--debit', isDebit);
    }
  }

  function resetCreditForm({ preserveAccount = true } = {}) {
    if (!preserveAccount && creditAccountSelect) {
      creditAccountSelect.value = '';
    }
    applyCreditAccountSelection();
    if (creditAmountInput) {
      creditAmountInput.value = formatCreditAmountDisplay(0);
    }
    updateCreditCardAmountDisplay(0);
    if (creditSubmit) {
      creditSubmit.textContent = 'Submit';
      creditSubmit.disabled = true;
    }
    updateCreditSenderDataset();
    updateCreditTransactionType();
    captureCreditTimestamp();
    randomizeCreditIdentifiers();
    if (creditMemoInput) {
      creditMemoInput.value = '';
    }
    updateCreditMemoPreview('');
    if (creditCard) {
      creditCard.removeAttribute('data-submitted');
      creditCard.removeAttribute('data-submitted-at');
    }
    updateCreditSubmitState();
  }

  function parseStoredCredits(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '').replace(/[^0-9.-]/g, '');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : 0;
    }
    return 0;
  }

  async function handleCreditSubmit(event) {
    if (event) event.preventDefault();
    if (!creditSubmit || creditSubmit.disabled) return;
    const player = creditAccountSelect?.value?.trim();
    if (!player) {
      if (typeof toast === 'function') toast('Select a player to target', 'error');
      return;
    }
    const rawAmount = getCreditAmountNumber();
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      if (typeof toast === 'function') toast('Enter an amount greater than zero', 'error');
      return;
    }
    const transactionType = creditTxnType?.value === 'Debit' ? 'Debit' : 'Deposit';
    const delta = transactionType === 'Debit' ? -rawAmount : rawAmount;
    const accountNumber = computeCreditAccountNumber(player);
    const originalLabel = creditSubmit.textContent;
    creditSubmit.disabled = true;
    creditSubmit.textContent = 'Sending…';
    try {
      const save = await loadCharacter(player, { bypassPin: true });
      const currentCredits = parseStoredCredits(save?.credits);
      const nextTotal = Math.max(0, Math.round((currentCredits + delta) * 100) / 100);
      save.credits = Number.isInteger(nextTotal) ? String(nextTotal) : nextTotal.toFixed(2);
      const now = Date.now();
      const senderLabel = getCreditSenderLabel();
      const memo = sanitizeCreditMemo(creditMemoInput?.value || '');
      const summaryParts = [`${transactionType === 'Debit' ? 'Debited' : 'Deposited'} ₡${formatCreditAmountDisplay(Math.abs(delta))} via ${senderLabel}.`];
      const memoLine = memo ? memo.replace(/\s*\n\s*/g, ' ').trim() : '';
      if (memoLine) {
        summaryParts.push(`Memo: ${memoLine}`);
      }
      const summary = summaryParts.join(' ');
      if (!Array.isArray(save.campaignLog)) {
        save.campaignLog = [];
      }
      save.campaignLog.push({
        id: `dm-credit-${now}-${Math.floor(Math.random() * 1e6)}`,
        t: now,
        name: 'DM Credit Transfer',
        text: summary,
      });
      await saveCloud(player, save);
      if (typeof toast === 'function') {
        toast(`${transactionType === 'Debit' ? 'Debited' : 'Deposited'} ₡${formatCreditAmountDisplay(Math.abs(delta))} ${transactionType === 'Debit' ? 'from' : 'to'} ${player}`, 'success');
      }
      window.dmNotify?.(summary, { ts: new Date(now).toISOString(), char: player });
      const nowDate = new Date(now);
      const timestampIso = nowDate.toISOString();
      if (creditFooterDate) creditFooterDate.textContent = creditFormatDate(nowDate);
      if (creditFooterTime) creditFooterTime.textContent = creditFormatTime(nowDate);
      if (creditCard) {
        creditCard.setAttribute('data-timestamp', timestampIso);
        creditCard.setAttribute('data-submitted', 'true');
        creditCard.setAttribute('data-submitted-at', timestampIso);
        creditCard.setAttribute('data-player', player);
        creditCard.setAttribute('data-account', accountNumber);
        creditCard.setAttribute('data-memo', memo);
      }
      updateCreditMemoPreview(memo);
      const refValue = creditCard?.getAttribute('data-ref') || creditRef?.textContent || '';
      const txidValue = creditCard?.getAttribute('data-txid') || creditTxid?.textContent || '';
      broadcastPlayerCreditUpdate({
        account: accountNumber,
        amount: delta,
        type: transactionType,
        sender: senderLabel,
        ref: refValue,
        txid: txidValue,
        timestamp: timestampIso,
        player,
        memo,
      });
      randomizeCreditIdentifiers();
      updateCreditSenderDataset();
      updateCreditTransactionType();
      if (creditAmountInput) {
        creditAmountInput.value = formatCreditAmountDisplay(0);
      }
      updateCreditCardAmountDisplay(0);
      if (creditMemoInput) {
        creditMemoInput.value = '';
      }
      updateCreditMemoPreview('');
      creditSubmit.textContent = 'Submit';
      creditSubmit.disabled = true;
      updateCreditSubmitState();
    } catch (err) {
      console.error('Failed to send credits', err);
      if (typeof toast === 'function') {
        toast('Failed to send credits', 'error');
      } else if (typeof alert === 'function') {
        alert('Failed to send credits');
      }
      creditSubmit.textContent = originalLabel || 'Submit';
      creditSubmit.disabled = false;
    }
  }

  async function openCreditTool() {
    resetCreditForm({ preserveAccount: false });
    await refreshCreditAccounts({ preserveSelection: false });
    resetCreditForm({ preserveAccount: true });
    if (creditModal) {
      show('dm-credit-modal');
    }
    if (creditAmountInput) {
      setTimeout(() => {
        try {
          creditAmountInput.focus();
          creditAmountInput.select();
        } catch {}
      }, 0);
    }
  }

  const catalogTypeLookup = new Map(CATALOG_TYPES.map(type => [type.id, type]));
  let activeCatalogType = CATALOG_TYPES[0]?.id || null;
  const catalogTabButtons = new Map();
  const catalogPanelMap = new Map();
  const catalogForms = new Map();
  let catalogInitialized = false;

  if (!isAuthorizedDevice()) {
    dmBtn?.remove();
    dmToggleBtn?.remove();
    menu?.remove();
    loginModal?.remove();
    notifyModal?.remove();
    charModal?.remove();
    charViewModal?.remove();
    catalogBtn?.remove();
    catalogModal?.remove();
    return;
  }

  const MENU_OPEN_CLASS = 'is-open';
  let menuHideTimer = null;
  let menuTransitionHandler = null;

  if (menu) {
    const isOpen = menu.classList.contains(MENU_OPEN_CLASS);
    menu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }

  const miniGamesLibrary = listMiniGames();
  const knobStateByGame = new Map();
  const knobPresetsByGame = new Map();
  const KNOB_PRESETS_STORAGE_KEY = 'cc_dm_knob_presets';
  const KNOB_PRESET_LIMIT = 20;
  const MINI_GAME_FILTER_STORAGE_KEY = 'cc_dm_mini_game_filters';
  const MINI_GAME_STALE_THRESHOLD_MS = 30 * 60 * 1000;
  const MINI_GAME_STATUS_PRIORITY = new Map([
    ['pending', 0],
    ['active', 1],
    ['completed', 2],
    ['cancelled', 3],
  ]);
  let miniGameFilterState = { status: 'all', assignee: 'all' };
  miniGamesLibrary.forEach(game => {
    try {
      knobStateByGame.set(game.id, getDefaultConfig(game.id));
    } catch {
      knobStateByGame.set(game.id, {});
    }
  });
  const sanitizePresetValues = (values) => {
    if (!values || typeof values !== 'object') return {};
    return Object.keys(values).reduce((acc, key) => {
      acc[key] = values[key];
      return acc;
    }, {});
  };

  const loadKnobPresetsFromStorage = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(KNOB_PRESETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      Object.entries(parsed).forEach(([gameId, list]) => {
        if (!Array.isArray(list)) return;
        const sanitized = list
          .map(entry => {
            if (!entry || typeof entry !== 'object') return null;
            const id = typeof entry.id === 'string' ? entry.id : `preset-${Math.random().toString(36).slice(2)}`;
            const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Preset';
            const values = sanitizePresetValues(entry.values);
            return { id, name, values };
          })
          .filter(Boolean)
          .slice(0, KNOB_PRESET_LIMIT);
        if (sanitized.length) {
          knobPresetsByGame.set(gameId, sanitized);
        }
      });
    } catch {
      /* ignore preset load errors */
    }
  };

  const persistKnobPresets = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = {};
      knobPresetsByGame.forEach((list, gameId) => {
        if (!Array.isArray(list) || !list.length) return;
        payload[gameId] = list.slice(0, KNOB_PRESET_LIMIT).map(entry => ({
          id: entry.id,
          name: entry.name,
          values: sanitizePresetValues(entry.values),
        }));
      });
      localStorage.setItem(KNOB_PRESETS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore preset persistence errors */
    }
  };

  const getKnobPresets = (gameId) => {
    if (!gameId) return [];
    const list = knobPresetsByGame.get(gameId);
    if (!Array.isArray(list)) return [];
    return list.slice();
  };

  const setKnobPresets = (gameId, presets) => {
    if (!gameId) return;
    const list = Array.isArray(presets) ? presets.slice(0, KNOB_PRESET_LIMIT) : [];
    if (list.length) {
      knobPresetsByGame.set(gameId, list);
    } else {
      knobPresetsByGame.delete(gameId);
    }
    persistKnobPresets();
  };

  const createPresetId = () => `preset-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  loadKnobPresetsFromStorage();

  const persistMiniGameFilterState = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(MINI_GAME_FILTER_STORAGE_KEY, JSON.stringify(miniGameFilterState));
    } catch {
      /* ignore filter persistence errors */
    }
  };

  const loadMiniGameFilterState = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(MINI_GAME_FILTER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const status = typeof parsed.status === 'string' ? parsed.status : 'all';
      const assignee = typeof parsed.assignee === 'string' ? parsed.assignee : 'all';
      miniGameFilterState = {
        status: status || 'all',
        assignee: assignee || 'all',
      };
    } catch {
      miniGameFilterState = { status: 'all', assignee: 'all' };
    }
  };

  loadMiniGameFilterState();

  const applyFilterStateToControls = () => {
    if (miniGamesFilterStatus) {
      const allowedStatuses = new Set(['all', ...MINI_GAME_STATUS_OPTIONS.map(opt => opt.value)]);
      if (!allowedStatuses.has(miniGameFilterState.status)) {
        miniGameFilterState.status = 'all';
      }
      miniGamesFilterStatus.value = miniGameFilterState.status;
    }
    if (miniGamesFilterAssignee) {
      const optionValues = Array.from(miniGamesFilterAssignee.options || []).map(opt => opt.value);
      if (!optionValues.includes(miniGameFilterState.assignee)) {
        miniGameFilterState.assignee = 'all';
      }
      miniGamesFilterAssignee.value = miniGameFilterState.assignee;
    }
  };

  if (miniGamesFilterStatus) {
    const existingValues = new Set(Array.from(miniGamesFilterStatus.options || []).map(opt => opt.value));
    MINI_GAME_STATUS_OPTIONS.forEach(opt => {
      if (existingValues.has(opt.value)) return;
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      miniGamesFilterStatus.appendChild(option);
    });
  }

  applyFilterStateToControls();
  let selectedMiniGameId = miniGamesLibrary.length ? miniGamesLibrary[0].id : null;
  let miniGamesInitialized = false;
  let miniGamesUnsubscribe = null;
  let miniGameDeploymentsCache = [];

  function ensureKnobState(gameId) {
    if (!gameId) return {};
    if (!knobStateByGame.has(gameId)) {
      try {
        knobStateByGame.set(gameId, getDefaultConfig(gameId));
      } catch {
        knobStateByGame.set(gameId, {});
      }
    }
    const stored = knobStateByGame.get(gameId) || {};
    return { ...stored };
  }

  function writeKnobState(gameId, state) {
    knobStateByGame.set(gameId, { ...state });
  }

  function updateMiniGameGuidance(game) {
    const hasKnobs = Array.isArray(game?.knobs) && game.knobs.length > 0;
    if (miniGamesIntro) {
      miniGamesIntro.textContent = game
        ? `Step 1 complete: ${game.name} is loaded and ready to deploy.`
        : 'Step 1: Choose a mini-game from the library to get started.';
    }
    if (miniGamesKnobsHint) {
      miniGamesKnobsHint.textContent = game
        ? hasKnobs
          ? 'Adjust these DM-only controls with confidence—every knob shows safe ranges and defaults.'
          : 'This mission has no optional tuning—skip straight to sending it to a player.'
        : 'Choose a mini-game to unlock DM-only tuning controls.';
    }
    if (miniGamesPlayerHint) {
      miniGamesPlayerHint.textContent = game
        ? 'Choose the hero to receive this mission and add any quick instructions before deploying.'
        : 'Pick who should receive the mission once you have it tuned.';
    }
  }

  function displayKnobValue(knob, value) {
    const formatted = formatKnobValue(knob, value);
    if (typeof formatted === 'string' && formatted.trim() !== '') return formatted;
    if (knob.type === 'toggle') return value ? 'Enabled' : 'Disabled';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '(empty)';
  }

  function buildKnobStatusText(knob, current, recommended) {
    const currentLabel = displayKnobValue(knob, current);
    const defaultLabel = displayKnobValue(knob, recommended);
    if (knobValuesMatch(knob, current, recommended)) {
      return `Current: ${currentLabel} (default)`;
    }
    return `Current: ${currentLabel} · Default: ${defaultLabel}`;
  }

  function buildKnobMetaText(knob, recommended) {
    const parts = [];
    if (knob.type === 'number') {
      const hasMin = typeof knob.min === 'number' && Number.isFinite(knob.min);
      const hasMax = typeof knob.max === 'number' && Number.isFinite(knob.max);
      if (hasMin && hasMax) {
        parts.push(`Range: ${knob.min} – ${knob.max}`);
      } else if (hasMin) {
        parts.push(`Minimum: ${knob.min}`);
      } else if (hasMax) {
        parts.push(`Maximum: ${knob.max}`);
      }
      if (typeof knob.step === 'number' && Number.isFinite(knob.step) && knob.step > 0) {
        parts.push(`Step: ${knob.step}`);
      }
    }
    if (knob.type === 'select' && Array.isArray(knob.options) && knob.options.length > 0) {
      parts.push(`${knob.options.length} choices`);
    }
    if (typeof recommended !== 'undefined') {
      parts.push(`Default: ${displayKnobValue(knob, recommended)}`);
    }
    return parts.join(' · ');
  }

  function knobValuesMatch(knob, a, b) {
    if (typeof a === 'undefined' && typeof b === 'undefined') return true;
    switch (knob.type) {
      case 'number':
        return Number(a) === Number(b);
      case 'toggle':
        return Boolean(a) === Boolean(b);
      default:
        return String(a ?? '') === String(b ?? '');
    }
  }

  function sanitizeNumberValue(knob, raw, recommended) {
    let next;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      next = raw;
    } else {
      const parsed = Number(raw);
      next = Number.isFinite(parsed) ? parsed : undefined;
    }
    if (!Number.isFinite(next)) {
      if (typeof recommended === 'number' && Number.isFinite(recommended)) {
        next = recommended;
      } else if (typeof knob.min === 'number' && Number.isFinite(knob.min)) {
        next = knob.min;
      } else {
        next = 0;
      }
    }
    if (typeof knob.min === 'number' && Number.isFinite(knob.min)) {
      next = Math.max(next, knob.min);
    }
    if (typeof knob.max === 'number' && Number.isFinite(knob.max)) {
      next = Math.min(next, knob.max);
    }
    if (typeof knob.step === 'number' && Number.isFinite(knob.step) && knob.step > 0) {
      const base = typeof knob.min === 'number' && Number.isFinite(knob.min) ? knob.min : 0;
      const steps = Math.round((next - base) / knob.step);
      next = base + steps * knob.step;
      if (typeof knob.min === 'number' && Number.isFinite(knob.min)) {
        next = Math.max(next, knob.min);
      }
      if (typeof knob.max === 'number' && Number.isFinite(knob.max)) {
        next = Math.min(next, knob.max);
      }
      next = Number(Number(next).toFixed(5));
    }
    return next;
  }

  function sanitizeKnobValue(knob, raw, recommended) {
    switch (knob.type) {
      case 'toggle':
        return Boolean(raw);
      case 'number':
        return sanitizeNumberValue(knob, raw, recommended);
      case 'select': {
        const value = String(raw ?? '');
        const options = Array.isArray(knob.options) ? knob.options : [];
        const hasOption = options.some(opt => String(opt.value) === value);
        if (hasOption) return value;
        if (typeof recommended !== 'undefined') return String(recommended ?? '');
        return options.length ? String(options[0].value ?? '') : '';
      }
      default:
        return String(raw ?? '');
    }
  }

  function buildMiniGamesList() {
    if (!miniGamesList || miniGamesInitialized) return;
    miniGamesList.innerHTML = '';
    miniGamesLibrary.forEach(game => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.gameId = game.id;
      btn.setAttribute('aria-selected', game.id === selectedMiniGameId ? 'true' : 'false');
      const title = document.createElement('span');
      title.className = 'dm-mini-games__list-title';
      title.textContent = game.name;
      btn.appendChild(title);
      if (game.tagline) {
        const tagline = document.createElement('span');
        tagline.className = 'dm-mini-games__list-tagline';
        tagline.textContent = game.tagline;
        btn.appendChild(tagline);
      }
      li.appendChild(btn);
      miniGamesList.appendChild(li);
    });
    miniGamesInitialized = true;
  }

  function updateMiniGamesListSelection() {
    if (!miniGamesList) return;
    miniGamesList.querySelectorAll('button[data-game-id]').forEach(btn => {
      const selected = btn.dataset.gameId === selectedMiniGameId;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  }

  function resetMiniGameDetails() {
    if (miniGamesTitle) miniGamesTitle.textContent = 'Select a mini-game';
    if (miniGamesTagline) miniGamesTagline.textContent = '';
    if (miniGamesLaunch) miniGamesLaunch.hidden = true;
    if (miniGamesKnobs) {
      miniGamesKnobs.innerHTML = '<p class="dm-mini-games__empty">Pick a mini-game to unlock DM tools.</p>';
    }
    if (miniGamesReadme) {
      miniGamesReadme.textContent = 'Select a mini-game to review the player-facing briefing.';
    }
    updateMiniGameGuidance(null);
  }

  function renderMiniGameKnobs(game) {
    if (!miniGamesKnobs) return;
    const defaults = getDefaultConfig(game.id) || {};
    let state = ensureKnobState(game.id);
    let stateMutated = false;
    miniGamesKnobs.innerHTML = '';
    if (!Array.isArray(game.knobs) || game.knobs.length === 0) {
      miniGamesKnobs.innerHTML = '<p class="dm-mini-games__empty">This mission has no DM tuning controls.</p>';
      return;
    }

    const dirtyKnobs = new Set();
    let resetAllButton = null;
    const updateResetAllState = () => {
      if (!resetAllButton) return;
      const disabled = dirtyKnobs.size === 0;
      resetAllButton.disabled = disabled;
      resetAllButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    };

    const toolbar = document.createElement('div');
    toolbar.className = 'dm-mini-games__knobs-toolbar';
    const toolbarCopy = document.createElement('p');
    toolbarCopy.textContent = 'Every control shows its safe range and recommended defaults. Reset anything if you need to undo tweaks.';
    toolbar.appendChild(toolbarCopy);
    const presetControls = document.createElement('div');
    presetControls.className = 'dm-mini-games__preset-controls';
    const savePresetBtn = document.createElement('button');
    savePresetBtn.type = 'button';
    savePresetBtn.className = 'btn-sm dm-mini-games__preset-save';
    savePresetBtn.textContent = 'Save preset';
    const loadPresetBtn = document.createElement('button');
    loadPresetBtn.type = 'button';
    loadPresetBtn.className = 'btn-sm dm-mini-games__preset-load';
    loadPresetBtn.textContent = 'Load preset';
    loadPresetBtn.setAttribute('aria-haspopup', 'true');
    loadPresetBtn.setAttribute('aria-expanded', 'false');
    const presetMenuId = `dm-mini-games-presets-${game.id}`;
    loadPresetBtn.setAttribute('aria-controls', presetMenuId);
    presetControls.appendChild(savePresetBtn);
    presetControls.appendChild(loadPresetBtn);
    toolbar.appendChild(presetControls);
    const presetMenu = document.createElement('div');
    presetMenu.id = presetMenuId;
    presetMenu.className = 'dm-mini-games__preset-menu';
    presetMenu.hidden = true;
    presetMenu.tabIndex = -1;
    presetMenu.setAttribute('role', 'menu');
    presetMenu.setAttribute('aria-label', 'Saved presets');
    toolbar.appendChild(presetMenu);
    const closePresetMenu = () => {
      loadPresetBtn.setAttribute('aria-expanded', 'false');
      presetMenu.hidden = true;
    };
    const refreshPresetMenu = () => {
      const presets = getKnobPresets(game.id);
      loadPresetBtn.disabled = presets.length === 0;
      loadPresetBtn.setAttribute('aria-disabled', loadPresetBtn.disabled ? 'true' : 'false');
      presetMenu.innerHTML = '';
      if (!presets.length) {
        const empty = document.createElement('p');
        empty.className = 'dm-mini-games__preset-empty';
        empty.textContent = 'No presets saved yet.';
        presetMenu.appendChild(empty);
        return;
      }
      const list = document.createElement('ul');
      list.className = 'dm-mini-games__preset-list';
      presets.forEach(preset => {
        const item = document.createElement('li');
        item.className = 'dm-mini-games__preset-item';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'dm-mini-games__preset-apply';
        applyBtn.dataset.presetId = preset.id;
        applyBtn.dataset.presetAction = 'apply';
        applyBtn.setAttribute('role', 'menuitem');
        applyBtn.textContent = preset.name;
        item.appendChild(applyBtn);
        const actions = document.createElement('div');
        actions.className = 'dm-mini-games__preset-actions';
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'dm-mini-games__preset-rename';
        renameBtn.dataset.presetId = preset.id;
        renameBtn.dataset.presetAction = 'rename';
        renameBtn.textContent = 'Rename';
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'dm-mini-games__preset-delete';
        deleteBtn.dataset.presetId = preset.id;
        deleteBtn.dataset.presetAction = 'delete';
        deleteBtn.textContent = 'Delete';
        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(actions);
        list.appendChild(item);
      });
      presetMenu.appendChild(list);
    };
    refreshPresetMenu();
    savePresetBtn.addEventListener('click', () => {
      const stateSnapshot = ensureKnobState(game.id);
      const defaultsCount = getKnobPresets(game.id).length + 1;
      const defaultName = `${game.name} preset ${defaultsCount}`;
      const nameInput = typeof prompt === 'function' ? prompt('Name this preset', defaultName) : defaultName;
      if (nameInput == null) return;
      const trimmed = nameInput.trim();
      if (!trimmed) {
        if (typeof toast === 'function') toast('Preset name cannot be empty', 'error');
        return;
      }
      const newPreset = { id: createPresetId(), name: trimmed, values: sanitizePresetValues(stateSnapshot) };
      const existing = getKnobPresets(game.id).filter(preset => preset.id !== newPreset.id && preset.name.toLowerCase() !== trimmed.toLowerCase());
      const next = [newPreset, ...existing].slice(0, KNOB_PRESET_LIMIT);
      setKnobPresets(game.id, next);
      refreshPresetMenu();
      closePresetMenu();
      if (typeof toast === 'function') toast(`Saved preset "${trimmed}"`, 'success');
    });
    loadPresetBtn.addEventListener('click', () => {
      if (loadPresetBtn.disabled) return;
      const expanded = loadPresetBtn.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        closePresetMenu();
      } else {
        refreshPresetMenu();
        presetMenu.hidden = false;
        loadPresetBtn.setAttribute('aria-expanded', 'true');
        presetMenu.focus();
      }
    });
    presetMenu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePresetMenu();
        loadPresetBtn.focus();
      }
    });
    presetMenu.addEventListener('click', (event) => {
      const target = event.target.closest('button[data-preset-action]');
      if (!target) return;
      const action = target.dataset.presetAction;
      const presetId = target.dataset.presetId;
      const presets = getKnobPresets(game.id);
      const preset = presets.find(entry => entry.id === presetId);
      if (!preset) return;
      if (action === 'apply') {
        closePresetMenu();
        writeKnobState(game.id, sanitizePresetValues(preset.values));
        shouldFocusMiniGameKnobs = true;
        renderMiniGameKnobs(game);
        if (typeof toast === 'function') toast(`Loaded preset "${preset.name}"`, 'info');
      } else if (action === 'rename') {
        const nextName = typeof prompt === 'function' ? prompt('Rename preset', preset.name) : preset.name;
        if (nextName == null) return;
        const trimmed = nextName.trim();
        if (!trimmed) {
          if (typeof toast === 'function') toast('Preset name cannot be empty', 'error');
          return;
        }
        const updated = presets.map(entry => (entry.id === presetId ? { ...entry, name: trimmed } : entry));
        setKnobPresets(game.id, updated);
        refreshPresetMenu();
        if (typeof toast === 'function') toast(`Renamed preset to "${trimmed}"`, 'info');
      } else if (action === 'delete') {
        const confirmed = typeof confirm === 'function' ? confirm(`Delete preset "${preset.name}"?`) : true;
        if (!confirmed) return;
        const remaining = presets.filter(entry => entry.id !== presetId);
        setKnobPresets(game.id, remaining);
        refreshPresetMenu();
        if (!remaining.length) {
          closePresetMenu();
        }
        if (typeof toast === 'function') toast(`Deleted preset "${preset.name}"`, 'info');
      }
    });
    resetAllButton = document.createElement('button');
    resetAllButton.type = 'button';
    resetAllButton.className = 'dm-mini-games__knob-reset dm-mini-games__knob-reset--all';
    resetAllButton.textContent = 'Reset all to defaults';
    resetAllButton.setAttribute('aria-label', 'Reset all DM controls to their defaults');
    resetAllButton.addEventListener('click', () => {
      writeKnobState(game.id, { ...defaults });
      renderMiniGameKnobs(game);
      focusMiniGameKnobs();
    });
    toolbar.appendChild(resetAllButton);
    miniGamesKnobs.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'dm-mini-games__knob-grid';
    miniGamesKnobs.appendChild(grid);

    game.knobs.forEach(knob => {
      const recommended = defaults[knob.key];
      const storedValue = state[knob.key];
      const initialValue = sanitizeKnobValue(knob, storedValue, recommended);
      if (!knobValuesMatch(knob, storedValue, initialValue)) {
        state[knob.key] = initialValue;
        stateMutated = true;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'dm-mini-games__knob';
      wrapper.dataset.knob = knob.key;

      const controlId = `dm-mini-games-${game.id}-${knob.key}`;
      const labelId = `${controlId}-label`;

      const header = document.createElement('div');
      header.className = 'dm-mini-games__knob-header';

      const title = document.createElement('label');
      title.className = 'dm-mini-games__knob-title';
      title.id = labelId;
      title.setAttribute('for', controlId);
      title.textContent = knob.label;
      header.appendChild(title);

      const badge = document.createElement('span');
      badge.className = 'dm-mini-games__knob-badge';
      badge.textContent = 'Adjusted';
      badge.hidden = true;
      header.appendChild(badge);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'dm-mini-games__knob-reset';
      resetBtn.textContent = 'Reset';
      resetBtn.title = 'Reset to default';
      resetBtn.setAttribute('aria-label', `Reset ${knob.label} to its default value`);
      header.appendChild(resetBtn);

      wrapper.appendChild(header);

      const body = document.createElement('div');
      body.className = 'dm-mini-games__knob-body';
      wrapper.appendChild(body);

      let control;
      let toggleStatus = null;

      if (knob.type === 'toggle') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = controlId;
        input.dataset.knob = knob.key;
        input.checked = Boolean(initialValue);
        input.setAttribute('role', 'switch');
        control = input;
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'dm-mini-games__knob-toggle';
        toggleLabel.setAttribute('for', controlId);
        toggleStatus = document.createElement('span');
        toggleStatus.className = 'dm-mini-games__knob-toggle-status';
        toggleStatus.textContent = displayKnobValue(knob, initialValue);
        toggleLabel.append(input, toggleStatus);
        body.appendChild(toggleLabel);
      } else if (knob.type === 'select') {
        const select = document.createElement('select');
        select.id = controlId;
        select.dataset.knob = knob.key;
        (knob.options || []).forEach(opt => {
          const option = document.createElement('option');
          option.value = String(opt.value);
          option.textContent = opt.label;
          select.appendChild(option);
        });
        select.value = String(initialValue);
        body.appendChild(select);
        control = select;
      } else {
        const input = document.createElement('input');
        input.id = controlId;
        input.dataset.knob = knob.key;
        if (knob.type === 'number') {
          input.type = 'number';
          if (typeof knob.min === 'number') input.min = String(knob.min);
          if (typeof knob.max === 'number') input.max = String(knob.max);
          if (typeof knob.step === 'number') input.step = String(knob.step);
          input.inputMode = 'decimal';
          input.value = String(initialValue);
        } else {
          input.type = 'text';
          input.autocomplete = 'off';
          input.value = String(initialValue ?? '');
          if (typeof knob.placeholder === 'string') {
            input.placeholder = knob.placeholder;
          }
        }
        body.appendChild(input);
        control = input;
      }

      const describedBy = [];

      if (knob.description) {
        const hint = document.createElement('small');
        hint.className = 'dm-mini-games__knob-description';
        hint.id = `${controlId}-description`;
        hint.textContent = knob.description;
        body.appendChild(hint);
        describedBy.push(hint.id);
      }

      const metaText = buildKnobMetaText(knob, recommended);
      if (metaText) {
        const meta = document.createElement('small');
        meta.className = 'dm-mini-games__knob-meta';
        meta.id = `${controlId}-meta`;
        meta.textContent = metaText;
        body.appendChild(meta);
        describedBy.push(meta.id);
      }

      const status = document.createElement('small');
      status.className = 'dm-mini-games__knob-status';
      status.id = `${controlId}-status`;
      body.appendChild(status);
      describedBy.push(status.id);

      if (control) {
        if (!control.id) control.id = controlId;
        control.setAttribute('aria-labelledby', labelId);
        if (describedBy.length) {
          control.setAttribute('aria-describedby', describedBy.join(' '));
        }
      }

      let currentValue = initialValue;

      const updateVisualState = value => {
        const dirty = !knobValuesMatch(knob, value, recommended);
        if (dirty) {
          dirtyKnobs.add(knob.key);
        } else {
          dirtyKnobs.delete(knob.key);
        }
        wrapper.classList.toggle('dm-mini-games__knob--dirty', dirty);
        resetBtn.disabled = !dirty;
        resetBtn.setAttribute('aria-disabled', resetBtn.disabled ? 'true' : 'false');
        badge.hidden = !dirty;
        status.textContent = buildKnobStatusText(knob, value, recommended);
        if (toggleStatus) {
          toggleStatus.textContent = displayKnobValue(knob, value);
        }
        updateResetAllState();
      };

      const commitValue = raw => {
        const sanitized = sanitizeKnobValue(knob, raw, recommended);
        if (knob.type === 'toggle') {
          control.checked = Boolean(sanitized);
        } else if (knob.type === 'number') {
          control.value = String(sanitized);
        } else if (control) {
          control.value = String(sanitized ?? '');
        }
        if (!knobValuesMatch(knob, sanitized, currentValue)) {
          currentValue = sanitized;
          const next = ensureKnobState(game.id);
          next[knob.key] = sanitized;
          writeKnobState(game.id, next);
        }
        updateVisualState(sanitized);
        return sanitized;
      };

      if (knob.type === 'toggle') {
        control.addEventListener('change', () => {
          commitValue(control.checked);
        });
      } else if (knob.type === 'select') {
        control.addEventListener('change', () => {
          commitValue(control.value);
        });
      } else if (knob.type === 'number') {
        control.addEventListener('input', () => {
          const raw = Number(control.value);
          const sanitized = sanitizeNumberValue(knob, raw, recommended);
          const valid = Number.isFinite(raw) && sanitized === raw;
          wrapper.classList.toggle('dm-mini-games__knob--invalid', !valid);
        });
        control.addEventListener('change', () => {
          wrapper.classList.remove('dm-mini-games__knob--invalid');
          commitValue(control.value);
        });
        control.addEventListener('blur', () => {
          wrapper.classList.remove('dm-mini-games__knob--invalid');
          const sanitized = sanitizeNumberValue(knob, control.value, recommended);
          control.value = String(sanitized);
          if (!knobValuesMatch(knob, sanitized, currentValue)) {
            commitValue(sanitized);
          } else {
            updateVisualState(sanitized);
          }
        });
      } else {
        control.addEventListener('input', () => {
          commitValue(control.value);
        });
      }

      resetBtn.addEventListener('click', () => {
        commitValue(recommended);
        if (typeof control?.focus === 'function') {
          control.focus();
        }
      });

      updateVisualState(initialValue);
      grid.appendChild(wrapper);
    });

    if (stateMutated) {
      writeKnobState(game.id, state);
    }
    updateResetAllState();
  }

  function renderMiniGameDetails() {
    if (!selectedMiniGameId) {
      resetMiniGameDetails();
      return;
    }
    const game = getMiniGame(selectedMiniGameId);
    if (!game) {
      resetMiniGameDetails();
      return;
    }
    if (miniGamesTitle) miniGamesTitle.textContent = game.name;
    if (miniGamesTagline) miniGamesTagline.textContent = game.tagline || '';
    if (miniGamesLaunch) {
      if (game.url) {
        miniGamesLaunch.href = game.url;
        miniGamesLaunch.hidden = false;
      } else {
        miniGamesLaunch.hidden = true;
      }
    }
    renderMiniGameKnobs(game);
    if (shouldFocusMiniGameKnobs) {
      shouldFocusMiniGameKnobs = false;
      Promise.resolve().then(() => focusMiniGameKnobs());
    }
    updateMiniGameGuidance(game);
    if (miniGamesReadme) {
      miniGamesReadme.textContent = 'Loading briefing…';
      loadMiniGameReadme(game.id)
        .then(text => {
          if (selectedMiniGameId === game.id) {
            miniGamesReadme.textContent = text;
          }
        })
        .catch(() => {
          if (selectedMiniGameId === game.id) {
            miniGamesReadme.textContent = 'Failed to load briefing.';
          }
        });
    }
  }

  function formatTimestamp(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '';
    }
  }

  const getDeploymentTimestamp = (entry) => {
    const raw = entry?.updatedAt ?? entry?.updated ?? entry?.createdAt ?? entry?.created ?? null;
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'string' && raw) {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return Date.now();
  };

  const getDeploymentAssignee = (entry) => {
    const raw = typeof entry?.player === 'string' && entry.player.trim()
      ? entry.player
      : typeof entry?.assignee === 'string'
        ? entry.assignee
        : '';
    return raw.trim();
  };

  const filterDeployments = (entries = []) => {
    return entries.filter(entry => {
      const status = entry?.status || 'pending';
      if (miniGameFilterState.status !== 'all' && status !== miniGameFilterState.status) {
        return false;
      }
      if (miniGameFilterState.assignee !== 'all') {
        const assignee = getDeploymentAssignee(entry);
        if (assignee.toLowerCase() !== miniGameFilterState.assignee.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  };

  const sortDeploymentsByUrgency = (entries = []) => {
    return entries.slice().sort((a, b) => {
      const priorityA = MINI_GAME_STATUS_PRIORITY.get(a?.status) ?? 99;
      const priorityB = MINI_GAME_STATUS_PRIORITY.get(b?.status) ?? 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const timeA = getDeploymentTimestamp(a);
      const timeB = getDeploymentTimestamp(b);
      return timeA - timeB;
    });
  };

  const updateAssigneeFilterOptions = (entries = []) => {
    if (!miniGamesFilterAssignee) return;
    const selectedBefore = miniGameFilterState.assignee;
    const names = Array.from(new Set(entries.map(getDeploymentAssignee).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    miniGamesFilterAssignee.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All recipients';
    miniGamesFilterAssignee.appendChild(allOption);
    names.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      miniGamesFilterAssignee.appendChild(option);
    });
    if (selectedBefore !== 'all' && !names.includes(selectedBefore)) {
      miniGameFilterState.assignee = 'all';
      persistMiniGameFilterState();
    }
    applyFilterStateToControls();
  };

  const isDeploymentStale = (entry) => {
    const status = entry?.status;
    if (status !== 'pending' && status !== 'active') return false;
    const ts = getDeploymentTimestamp(entry);
    return Number.isFinite(ts) && (Date.now() - ts) > MINI_GAME_STALE_THRESHOLD_MS;
  };

  function renderMiniGameDeployments(entries = []) {
    if (!miniGamesDeployments) return;
    const arrayEntries = Array.isArray(entries) ? entries : [];
    updateAssigneeFilterOptions(arrayEntries);
    const filtered = filterDeployments(arrayEntries);
    const sorted = sortDeploymentsByUrgency(filtered);
    if (!sorted.length) {
      miniGamesDeployments.innerHTML = arrayEntries.length
        ? '<li class="dm-mini-games__empty">No deployments match the selected filters.</li>'
        : '<li class="dm-mini-games__empty">Launched missions will appear here for quick status updates.</li>';
      return;
    }
    miniGamesDeployments.innerHTML = '';
    sorted.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'dm-mini-games__deployment';
      li.dataset.player = entry.player || '';
      li.dataset.deploymentId = entry.id || '';
      li.dataset.status = entry.status || 'pending';
      const assignee = getDeploymentAssignee(entry);
      if (assignee) {
        li.dataset.assignee = assignee;
      } else {
        delete li.dataset.assignee;
      }

      const stale = isDeploymentStale(entry);
      li.classList.toggle('dm-mini-games__deployment--stale', stale);

      const header = document.createElement('div');
      header.className = 'dm-mini-games__deployment-header';
      const title = document.createElement('strong');
      const gameName = entry.gameName || getMiniGame(entry.gameId)?.name || entry.gameId || 'Mini-game';
      li.dataset.gameName = gameName;
      title.textContent = `${entry.player || 'Unknown'} • ${gameName}`;
      header.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'dm-mini-games__deployment-meta';
      const status = document.createElement('span');
      status.textContent = `Status: ${getStatusLabel(entry.status || 'pending')}`;
      meta.appendChild(status);
      const tsValue = getDeploymentTimestamp(entry);
      const tsLabel = formatTimestamp(tsValue);
      if (tsLabel) {
        const tsSpan = document.createElement('span');
        tsSpan.textContent = `Updated: ${tsLabel}`;
        tsSpan.className = 'dm-mini-games__deployment-time';
        if (stale) {
          tsSpan.classList.add('dm-mini-games__deployment-time--stale');
        }
        meta.appendChild(tsSpan);
      }
      if (entry.issuedBy) {
        const issuer = document.createElement('span');
        issuer.textContent = `Issued by: ${entry.issuedBy}`;
        meta.appendChild(issuer);
      }
      header.appendChild(meta);
      li.appendChild(header);

      const summary = document.createElement('div');
      summary.className = 'dm-mini-games__deployment-summary';
      const summaryText = summarizeConfig(entry.gameId, entry.config || {});
      summary.textContent = summaryText || 'No configuration specified.';
      li.appendChild(summary);

      if (entry.notes) {
        const notes = document.createElement('div');
        notes.className = 'dm-mini-games__deployment-notes';
        notes.textContent = `Notes: ${entry.notes}`;
        li.appendChild(notes);
      }

      const actions = document.createElement('div');
      actions.className = 'dm-mini-games__deployment-actions';

      const statusSelect = document.createElement('select');
      statusSelect.setAttribute('data-action', 'status');
      statusSelect.ariaLabel = 'Deployment status';
      MINI_GAME_STATUS_OPTIONS.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        statusSelect.appendChild(option);
      });
      statusSelect.value = entry.status || 'pending';
      actions.appendChild(statusSelect);

      const updateBtn = document.createElement('button');
      updateBtn.type = 'button';
      updateBtn.className = 'btn-sm';
      updateBtn.dataset.action = 'update';
      updateBtn.textContent = 'Update';
      actions.appendChild(updateBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-sm';
      removeBtn.dataset.action = 'delete';
      removeBtn.textContent = 'Remove';
      actions.appendChild(removeBtn);

      if (entry.gameUrl) {
        const openLink = document.createElement('a');
        openLink.href = entry.gameUrl;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        openLink.className = 'btn-sm';
        openLink.textContent = 'Open Player View';
        actions.appendChild(openLink);
      }

      if (typeof window.dmNotify === 'function' && assignee) {
        const nudgeBtn = document.createElement('button');
        nudgeBtn.type = 'button';
        nudgeBtn.className = 'btn-sm dm-mini-games__deployment-nudge';
        nudgeBtn.dataset.action = 'nudge';
        nudgeBtn.textContent = 'Nudge Player';
        nudgeBtn.setAttribute('aria-label', `Send a nudge to ${assignee}`);
        actions.appendChild(nudgeBtn);
      }

      li.appendChild(actions);
      miniGamesDeployments.appendChild(li);
    });
  }

  function ensureMiniGameSubscription() {
    if (miniGamesUnsubscribe) return;
    miniGamesUnsubscribe = subscribeMiniGameDeployments(entries => {
      miniGameDeploymentsCache = Array.isArray(entries) ? entries : [];
      if (miniGamesModal && !miniGamesModal.classList.contains('hidden')) {
        renderMiniGameDeployments(miniGameDeploymentsCache);
      }
    });
  }

  function teardownMiniGameSubscription() {
    if (typeof miniGamesUnsubscribe === 'function') {
      try { miniGamesUnsubscribe(); } catch {}
      miniGamesUnsubscribe = null;
    }
  }

  async function refreshMiniGameCharacters({ preserveSelection = true } = {}) {
    if (!miniGamesPlayerSelect) return;
    const previous = preserveSelection ? miniGamesPlayerSelect.value : '';
    miniGamesPlayerSelect.innerHTML = '<option value="">Loading…</option>';
    try {
      const names = await listCharacters();
      miniGamesPlayerSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a character';
      miniGamesPlayerSelect.appendChild(placeholder);
      names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        miniGamesPlayerSelect.appendChild(option);
      });
      if (previous && names.includes(previous)) {
        miniGamesPlayerSelect.value = previous;
      }
    } catch (err) {
      console.error('Failed to load characters for mini-games', err);
      miniGamesPlayerSelect.innerHTML = '<option value="">Unable to load characters</option>';
    }
  }

  async function forceRefreshMiniGameDeployments() {
    try {
      const entries = await refreshMiniGameDeployments();
      miniGameDeploymentsCache = Array.isArray(entries) ? entries : [];
      if (miniGamesModal && !miniGamesModal.classList.contains('hidden')) {
        renderMiniGameDeployments(miniGameDeploymentsCache);
      }
    } catch (err) {
      console.error('Failed to refresh mini-game deployments', err);
      if (typeof toast === 'function') toast('Failed to refresh mini-games', 'error');
    }
  }

  function getMiniGameTargetPlayer() {
    const custom = miniGamesPlayerCustom?.value?.trim();
    if (custom) return custom;
    const selected = miniGamesPlayerSelect?.value?.trim();
    return selected || '';
  }

  async function handleMiniGameDeploy() {
    if (!selectedMiniGameId) {
      if (typeof toast === 'function') toast('Choose a mini-game first', 'error');
      return false;
    }
    const playerName = getMiniGameTargetPlayer();
    if (!playerName) {
      if (typeof toast === 'function') toast('Select or enter a player target', 'error');
      return false;
    }
    const config = ensureKnobState(selectedMiniGameId);
    const notes = miniGamesNotes?.value?.trim() || '';
    try {
      if (miniGamesDeployBtn) miniGamesDeployBtn.disabled = true;
      await deployMiniGameToCloud({
        gameId: selectedMiniGameId,
        player: playerName,
        config,
        notes,
        issuedBy: 'DM'
      });
      if (miniGamesNotes) miniGamesNotes.value = '';
      if (typeof toast === 'function') toast('Mini-game deployed', 'success');
      window.dmNotify?.(`Deployed ${selectedMiniGameId} to ${playerName}`);
      return true;
    } catch (err) {
      console.error('Failed to deploy mini-game', err);
      if (typeof toast === 'function') toast('Failed to deploy mini-game', 'error');
      return false;
    } finally {
      if (miniGamesDeployBtn) miniGamesDeployBtn.disabled = false;
    }
  }

  function focusMiniGameKnobs() {
    if (!miniGamesModal || miniGamesModal.classList.contains('hidden')) return;
    const knobInput = miniGamesKnobs?.querySelector('.dm-mini-games__knob input:not([disabled]), .dm-mini-games__knob select:not([disabled]), .dm-mini-games__knob textarea:not([disabled])');
    const knobTarget = knobInput || miniGamesKnobs?.querySelector('.dm-mini-games__knob button:not([disabled])');
    const fallbackTarget = miniGamesPlayerSelect || miniGamesPlayerCustom || miniGamesNotes || miniGamesDeployBtn;
    const focusTarget = knobTarget || fallbackTarget;
    if (!focusTarget || typeof focusTarget.focus !== 'function') return;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      focusTarget.focus();
    }
  }

  let shouldFocusMiniGameKnobs = false;

  async function openMiniGames() {
    if (!miniGamesModal) return;
    ensureMiniGameSubscription();
    buildMiniGamesList();
    updateMiniGamesListSelection();
    shouldFocusMiniGameKnobs = true;
    renderMiniGameDetails();
    await refreshMiniGameCharacters();
    renderMiniGameDeployments(miniGameDeploymentsCache);
    show('dm-mini-games-modal');
    if (typeof miniGamesModal?.scrollTo === 'function') {
      miniGamesModal.scrollTo({ top: 0 });
    } else if (miniGamesModal) {
      miniGamesModal.scrollTop = 0;
    }
    const modalContent = miniGamesModal?.querySelector?.('.modal');
    if (modalContent) {
      if (typeof modalContent.scrollTo === 'function') {
        modalContent.scrollTo({ top: 0 });
      } else {
        modalContent.scrollTop = 0;
      }
    }
    if (shouldFocusMiniGameKnobs) {
      shouldFocusMiniGameKnobs = false;
      Promise.resolve().then(() => focusMiniGameKnobs());
    }
  }

  function closeMiniGames() {
    if (!miniGamesModal) return;
    hide('dm-mini-games-modal');
  }

  function getCatalogFieldSets(typeId) {
    const short = [...CATALOG_BASE_SHORT_FIELDS, ...(CATALOG_TYPE_SHORT_FIELDS[typeId] || [])];
    const long = [...CATALOG_BASE_LONG_FIELDS, ...(CATALOG_TYPE_LONG_FIELDS[typeId] || [])];
    return { short, long };
  }

  function sanitizeCatalogValue(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  function createCatalogField(definition) {
    const wrapper = document.createElement('label');
    wrapper.className = 'dm-catalog__field';
    wrapper.dataset.field = definition.key;

    const title = document.createElement('span');
    title.className = 'dm-catalog__field-label';
    title.textContent = definition.label;
    wrapper.appendChild(title);

    let control;
    if (definition.kind === 'textarea') {
      control = document.createElement('textarea');
      control.rows = definition.rows || 3;
    } else if (definition.kind === 'select') {
      control = document.createElement('select');
      const placeholderText = (definition.placeholder || '').trim() || 'Select an option';
      control.dataset.placeholder = placeholderText;
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = placeholderText;
      control.appendChild(placeholderOption);
      if (Array.isArray(definition.options)) {
        definition.options.forEach(option => {
          if (!option) return;
          const opt = document.createElement('option');
          if (typeof option === 'string') {
            opt.value = option;
            opt.textContent = option;
          } else {
            const value = typeof option.value === 'string' ? option.value : '';
            const label = typeof option.label === 'string' ? option.label : value;
            opt.value = value;
            opt.textContent = label;
          }
          control.appendChild(opt);
        });
      }
    } else {
      control = document.createElement('input');
      control.type = definition.type || 'text';
      if (definition.autocomplete) control.autocomplete = definition.autocomplete;
      if (definition.inputMode) control.inputMode = definition.inputMode;
      if (definition.pattern) control.pattern = definition.pattern;
    }
    control.name = definition.key;
    control.dataset.catalogField = definition.key;
    if (definition.placeholder) control.placeholder = definition.placeholder;
    if (definition.required) control.required = true;
    if (definition.maxlength) control.maxLength = definition.maxlength;
    if (definition.spellcheck === false) control.spellcheck = false;
    wrapper.appendChild(control);

    if (definition.hint) {
      const hint = document.createElement('span');
      hint.className = 'dm-catalog__hint';
      hint.textContent = definition.hint;
      wrapper.appendChild(hint);
    }

    return { wrapper, control };
  }

  function buildCatalogForm(typeId, form) {
    if (!form || form.dataset.catalogBuilt === 'true') return;
    const typeMeta = catalogTypeLookup.get(typeId);
    const { short, long } = getCatalogFieldSets(typeId);
    form.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'dm-catalog__card';

    const heading = document.createElement('h4');
    heading.className = 'dm-catalog__panel-title';
    heading.textContent = `${typeMeta?.label ?? 'Catalog'} Entry`;
    card.appendChild(heading);

    if (typeMeta?.blurb) {
      const intro = document.createElement('p');
      intro.className = 'dm-catalog__hint';
      intro.textContent = typeMeta.blurb;
      card.appendChild(intro);
    }

    if (short.length) {
      const grid = document.createElement('div');
      grid.className = 'dm-catalog__grid';
      short.forEach(field => {
        const { wrapper } = createCatalogField(field);
        grid.appendChild(wrapper);
      });
      card.appendChild(grid);
    }

    long.forEach(field => {
      const { wrapper } = createCatalogField(field);
      card.appendChild(wrapper);
    });

    const lock = document.createElement('label');
    lock.className = 'dm-catalog__lock';
    const lockInput = document.createElement('input');
    lockInput.type = 'checkbox';
    lockInput.name = 'dmLock';
    lockInput.value = 'locked';
    lock.appendChild(lockInput);
    const lockCopy = document.createElement('div');
    lockCopy.className = 'dm-catalog__lock-copy';
    const lockTitle = document.createElement('span');
    lockTitle.className = 'dm-catalog__field-label';
    lockTitle.textContent = 'DM lock this entry';
    lockCopy.appendChild(lockTitle);
    const lockHint = document.createElement('span');
    lockHint.className = 'dm-catalog__hint';
    lockHint.textContent = 'Prevent players from editing this entry after deployment.';
    lockCopy.appendChild(lockHint);
    lock.appendChild(lockCopy);
    card.appendChild(lock);

    const actions = document.createElement('div');
    actions.className = 'dm-catalog__actions';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'reset';
    resetBtn.className = 'btn-sm';
    resetBtn.textContent = 'Clear';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'somf-btn somf-primary';
    submitBtn.textContent = 'Create Entry';
    actions.appendChild(resetBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    form.appendChild(card);
    form.dataset.catalogBuilt = 'true';
    form.addEventListener('submit', handleCatalogSubmit);
    form.addEventListener('reset', handleCatalogReset);
  }

  async function populateCatalogRecipients() {
    const form = catalogForms.get('items');
    if (!form) return;
    const select = form.querySelector(`select[data-catalog-field="${CATALOG_RECIPIENT_FIELD_KEY}"]`);
    if (!select) return;
    const previousValue = typeof select.value === 'string' ? select.value : '';
    const placeholder = select.dataset.placeholder || CATALOG_RECIPIENT_PLACEHOLDER;
    let characters = [];
    try {
      const listed = await listCharacters();
      if (Array.isArray(listed)) {
        characters = listed;
      }
    } catch (err) {
      console.error('Failed to load character list for catalog recipients', err);
    }
    const uniqueNames = [];
    const seen = new Set();
    characters.forEach(name => {
      if (typeof name !== 'string') return;
      const trimmed = name.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      uniqueNames.push(trimmed);
    });
    const trimmedPrevious = previousValue.trim();
    select.innerHTML = '';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder || CATALOG_RECIPIENT_PLACEHOLDER;
    select.appendChild(placeholderOption);
    uniqueNames.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    if (trimmedPrevious && !seen.has(trimmedPrevious)) {
      const retained = document.createElement('option');
      retained.value = trimmedPrevious;
      retained.textContent = trimmedPrevious;
      select.appendChild(retained);
    }
    if (trimmedPrevious) {
      select.value = trimmedPrevious;
      if (select.value !== trimmedPrevious) {
        select.value = '';
      }
    }
  }

  function updateCatalogTabState() {
    CATALOG_TYPES.forEach(type => {
      const btn = catalogTabButtons.get(type.id);
      const panel = catalogPanelMap.get(type.id);
      const active = type.id === activeCatalogType;
      if (btn) {
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      }
      if (panel) {
        panel.classList.toggle('is-active', active);
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
        panel.hidden = !active;
      }
    });
  }

  function focusCatalogForm() {
    if (!catalogModal || catalogModal.classList.contains('hidden')) return;
    const form = catalogForms.get(activeCatalogType);
    if (!form) return;
    const focusTarget = form.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    if (!focusTarget || typeof focusTarget.focus !== 'function') return;
    try {
      focusTarget.focus({ preventScroll: true });
    } catch {
      focusTarget.focus();
    }
  }

  function getAdjacentCatalogType(currentId, offset) {
    if (!CATALOG_TYPES.length) return currentId;
    const index = CATALOG_TYPES.findIndex(type => type.id === currentId);
    if (index === -1) {
      return CATALOG_TYPES[0].id;
    }
    const nextIndex = (index + offset + CATALOG_TYPES.length) % CATALOG_TYPES.length;
    return CATALOG_TYPES[nextIndex].id;
  }

  function setActiveCatalogTab(typeId, { focusTab = false, suppressPanelFocus = false } = {}) {
    const hasType = typeId && catalogTypeLookup.has(typeId);
    if (!hasType) {
      typeId = CATALOG_TYPES[0]?.id || activeCatalogType;
    }
    if (!typeId) return;
    activeCatalogType = typeId;
    updateCatalogTabState();
    if (focusTab) {
      const btn = catalogTabButtons.get(typeId);
      if (btn && typeof btn.focus === 'function') {
        try {
          btn.focus({ preventScroll: true });
        } catch {
          btn.focus();
        }
      }
    }
    if (!suppressPanelFocus) {
      Promise.resolve().then(() => focusCatalogForm());
    }
  }

  function ensureCatalogUI() {
    if (!catalogTabs || !catalogPanels) return;
    if (!catalogInitialized) {
      const tabButtons = catalogTabs.querySelectorAll('button[data-tab]');
      tabButtons.forEach(btn => {
        const typeId = btn.dataset.tab;
        if (!typeId) return;
        catalogTabButtons.set(typeId, btn);
        if (!activeCatalogType) activeCatalogType = typeId;
      });
      const panels = catalogPanels.querySelectorAll('[data-panel]');
      panels.forEach(panel => {
        const typeId = panel.dataset.panel;
        if (!typeId) return;
        catalogPanelMap.set(typeId, panel);
        const form = panel.querySelector('form[data-catalog-form]');
        if (form) {
          catalogForms.set(typeId, form);
          buildCatalogForm(typeId, form);
        }
      });
      catalogTabs.addEventListener('click', handleCatalogTabClick);
      catalogTabs.addEventListener('keydown', handleCatalogTabKeydown);
      catalogInitialized = true;
    } else {
      catalogForms.forEach((form, typeId) => {
        if (form && form.dataset.catalogBuilt !== 'true') {
          buildCatalogForm(typeId, form);
        }
      });
    }
    if (!activeCatalogType || !catalogTypeLookup.has(activeCatalogType)) {
      activeCatalogType = CATALOG_TYPES[0]?.id || null;
    }
    updateCatalogTabState();
  }

  function handleCatalogTabClick(event) {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    event.preventDefault();
    const typeId = button.dataset.tab;
    if (!typeId) return;
    setActiveCatalogTab(typeId);
  }

  function handleCatalogTabKeydown(event) {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    const typeId = button.dataset.tab;
    if (!typeId) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = getAdjacentCatalogType(typeId, 1);
      setActiveCatalogTab(next, { focusTab: true, suppressPanelFocus: true });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = getAdjacentCatalogType(typeId, -1);
      setActiveCatalogTab(prev, { focusTab: true, suppressPanelFocus: true });
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = CATALOG_TYPES[0]?.id;
      if (first) {
        setActiveCatalogTab(first, { focusTab: true, suppressPanelFocus: true });
      }
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = CATALOG_TYPES[CATALOG_TYPES.length - 1]?.id;
      if (last) {
        setActiveCatalogTab(last, { focusTab: true, suppressPanelFocus: true });
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveCatalogTab(typeId);
    }
  }

  function buildCatalogPayload(typeId, form) {
    if (!form) return null;
    const { short, long } = getCatalogFieldSets(typeId);
    const fields = [...short, ...long];
    const data = new FormData(form);
    const metadata = {};
    fields.forEach(field => {
      const raw = data.get(field.key);
      metadata[field.key] = sanitizeCatalogValue(raw);
    });
    metadata.category = typeId;
    const typeMeta = catalogTypeLookup.get(typeId);
    if (typeMeta?.label) metadata.categoryLabel = typeMeta.label;
    const locked = data.get('dmLock') != null;
    const recipient = typeof metadata[CATALOG_RECIPIENT_FIELD_KEY] === 'string'
      ? metadata[CATALOG_RECIPIENT_FIELD_KEY]
      : '';
    const payload = {
      type: typeId,
      label: typeMeta?.label || typeId,
      metadata,
      locked,
      timestamp: new Date().toISOString(),
      recipient: recipient || null,
    };
    if (!metadata.name) return null;
    return payload;
  }

  function emitCatalogPayload(payload) {
    if (!payload) return;
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent('dm:catalog-submit', { detail: payload }));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('dm:catalog-submit', { detail: payload }));
    }
    const typeLabel = payload.label || payload.type;
    const entryName = payload.metadata?.name || 'Untitled';
    const recipientName = typeof payload.recipient === 'string' && payload.recipient.trim()
      ? payload.recipient.trim()
      : (typeof payload.metadata?.[CATALOG_RECIPIENT_FIELD_KEY] === 'string'
        ? payload.metadata[CATALOG_RECIPIENT_FIELD_KEY].trim()
        : '');
    const recipientSuffix = recipientName ? ` → ${recipientName}` : '';
    if (typeof toast === 'function') {
      toast(`${typeLabel} entry staged: ${entryName}${recipientSuffix}`, 'success');
    }
    window.dmNotify?.(`Catalog entry staged · ${typeLabel}: ${entryName}${recipientSuffix}`);
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('DM catalog payload prepared', payload);
    }
    try {
      storeDmCatalogPayload(payload);
    } catch (err) {
      console.error('Failed to persist DM catalog payload', err);
    }
  }

  function handleCatalogSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form) return;
    const typeId = form.dataset.catalogForm;
    if (!typeId) return;
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
      return;
    }
    const payload = buildCatalogPayload(typeId, form);
    if (!payload) return;
    emitCatalogPayload(payload);
    form.reset();
    Promise.resolve().then(() => focusCatalogForm());
  }

  function handleCatalogReset(event) {
    const form = event.currentTarget;
    if (!form) return;
    Promise.resolve().then(() => {
      if (form.dataset.catalogForm === activeCatalogType) {
        focusCatalogForm();
      }
    });
  }

  async function openCatalog() {
    if (!catalogModal) return;
    ensureCatalogUI();
    await populateCatalogRecipients();
    if (!activeCatalogType || !catalogTypeLookup.has(activeCatalogType)) {
      activeCatalogType = CATALOG_TYPES[0]?.id || null;
    }
    updateCatalogTabState();
    show('dm-catalog-modal');
    if (typeof catalogModal.scrollTo === 'function') {
      catalogModal.scrollTo({ top: 0 });
    } else {
      catalogModal.scrollTop = 0;
    }
    const modalContent = catalogModal.querySelector('.modal');
    if (modalContent) {
      if (typeof modalContent.scrollTo === 'function') {
        modalContent.scrollTo({ top: 0 });
      } else {
        modalContent.scrollTop = 0;
      }
    }
    Promise.resolve().then(() => focusCatalogForm());
  }

  function closeCatalog() {
    if (!catalogModal) return;
    hide('dm-catalog-modal');
  }

  if (loginPin) {
    loginPin.type = 'password';
    loginPin.autocomplete = 'one-time-code';
    loginPin.inputMode = 'numeric';
    loginPin.pattern = '[0-9]*';
  }

  function applyNotificationContent(node, entry) {
    if (!node) return;
    if (entry?.html) {
      node.innerHTML = formatNotification(entry, { html: true });
    } else {
      node.textContent = formatNotification(entry);
    }
  }

  function renderStoredNotifications() {
    if (!notifyList || !isLoggedIn()) return;
    notifyList.innerHTML = '';
    notifications.forEach(entry => {
      const li = document.createElement('li');
      applyNotificationContent(li, entry);
      notifyList.prepend(li);
    });
  }

  function storePendingNotification(entry) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      let pending = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) pending = parsed;
      }
      pending.push(entry);
      const MAX_PENDING = 20;
      if (pending.length > MAX_PENDING) {
        pending = pending.slice(pending.length - MAX_PENDING);
      }
      sessionStorage.setItem(PENDING_DM_NOTIFICATIONS_KEY, JSON.stringify(pending));
    } catch {
      /* ignore persistence errors */
    }
  }

  function pushNotification(entry) {
    if (!isLoggedIn()) {
      storePendingNotification(entry);
      return;
    }
    notifications.push(entry);
    if (notifications.length > MAX_STORED_NOTIFICATIONS) {
      notifications.splice(0, notifications.length - MAX_STORED_NOTIFICATIONS);
    }
    persistNotifications();
    if (notifyList) {
      const li = document.createElement('li');
      applyNotificationContent(li, entry);
      notifyList.prepend(li);
      playNotificationTone();
    }
  }

  persistNotifications();

  window.dmNotify = function(detail, meta = {}) {
    const entry = buildNotification(detail, meta);
    if (!entry) return;
    pushNotification(entry);
  };

  function drainPendingNotifications() {
    if (!isLoggedIn()) return;
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(PENDING_DM_NOTIFICATIONS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach(item => {
        if (!item || typeof item.detail !== 'string') return;
        window.dmNotify(item.detail, { ts: item.ts, char: item.char });
      });
      sessionStorage.removeItem(PENDING_DM_NOTIFICATIONS_KEY);
    } catch {
      /* ignore draining errors */
    }
  }

  drainPendingNotifications();

  function isLoggedIn(){
    try {
      return sessionStorage.getItem('dmLoggedIn') === '1';
    } catch {
      return false;
    }
  }

  function setLoggedIn(){
    try {
      sessionStorage.setItem('dmLoggedIn','1');
    } catch {
      /* ignore */
    }
  }

  function clearLoggedIn(){
    try {
      sessionStorage.removeItem('dmLoggedIn');
    } catch {
      /* ignore */
    }
  }

  function clearNotificationDisplay() {
    if (notifyList) notifyList.innerHTML = '';
    closeNotifications();
  }

  function updateButtons(){
    const loggedIn = isLoggedIn();
    if (!loggedIn) closeMenu();
    if (!loggedIn) {
      clearNotificationDisplay();
    } else {
      renderStoredNotifications();
    }
    if (dmBtn){
      dmBtn.hidden = loggedIn;
      if (loggedIn) {
        dmBtn.style.opacity = '1';
        dmBtn.setAttribute('aria-hidden', 'true');
      } else {
        dmBtn.style.opacity = '';
        dmBtn.removeAttribute('aria-hidden');
      }
    }
    if (dmToggleBtn) {
      dmToggleBtn.hidden = !loggedIn;
      const expanded = loggedIn && menu && menu.classList.contains(MENU_OPEN_CLASS);
      dmToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
  }

  function initTools(){
    try {
      if (window.initSomfDM) window.initSomfDM();
    } catch (e) {
      console.error('Failed to init DM tools', e);
    }
  }

  function openLogin(){
    if(!loginModal || !loginPin) return;
    show('dm-login-modal');
    loginPin.value='';
    loginPin.focus();
  }

  function closeLogin(){
    if(!loginModal) return;
    hide('dm-login-modal');
  }

  function requireLogin(){
    return new Promise((resolve, reject) => {
      if (isLoggedIn()) {
        updateButtons();
        resolve(true);
        return;
      }

      // If the modal elements are missing, fall back to a simple prompt so
      // the promise always resolves and loading doesn't hang.
      if (!loginModal || !loginPin || !loginSubmit) {
        (async () => {
          const entered = window.pinPrompt ? await window.pinPrompt('Enter DM PIN') : (typeof prompt === 'function' ? prompt('Enter DM PIN') : null);
          if (entered === DM_PIN) {
            onLoginSuccess();
            if (typeof dismissToast === 'function') dismissToast();
            if (typeof toast === 'function') toast('DM tools unlocked','success');
            resolve(true);
          } else {
            if (typeof toast === 'function') toast('Invalid PIN','error');
            reject(new Error('Invalid PIN'));
          }
        })();
        return;
      }

      openLogin();
      if (typeof toast === 'function') toast('Enter DM PIN','info');
      function cleanup(){
        loginSubmit?.removeEventListener('click', onSubmit);
        loginPin?.removeEventListener('keydown', onKey);
        loginModal?.removeEventListener('click', onOverlay);
        loginClose?.removeEventListener('click', onCancel);
      }
      function onSubmit(){
        if(loginPin.value === DM_PIN){
          onLoginSuccess();
          closeLogin();
          if (typeof dismissToast === 'function') dismissToast();
          if (typeof toast === 'function') toast('DM tools unlocked','success');
          cleanup();
          resolve(true);
        } else {
          loginPin.value='';
          loginPin.focus();
          if (typeof toast === 'function') toast('Invalid PIN','error');
        }
      }
      function onKey(e){ if(e.key==='Enter') onSubmit(); }
      function onCancel(){ closeLogin(); cleanup(); reject(new Error('cancel')); }
      function onOverlay(e){ if(e.target===loginModal) onCancel(); }
      loginSubmit?.addEventListener('click', onSubmit);
      loginPin?.addEventListener('keydown', onKey);
      loginModal?.addEventListener('click', onOverlay);
      loginClose?.addEventListener('click', onCancel);
    });
  }

  function logout(){
    clearLoggedIn();
    teardownMiniGameSubscription();
    closeMiniGames();
    closeCatalog();
    catalogForms.forEach(form => {
      try {
        form.reset();
      } catch {
        /* ignore reset errors */
      }
    });
    updateButtons();
    if (typeof toast === 'function') toast('Logged out','info');
  }

  function clearMenuHideJobs(){
    if (menuTransitionHandler && menu) {
      menu.removeEventListener('transitionend', menuTransitionHandler);
    }
    menuTransitionHandler = null;
    if (menuHideTimer !== null) {
      const clearTimer = typeof window !== 'undefined' && typeof window.clearTimeout === 'function'
        ? window.clearTimeout
        : clearTimeout;
      clearTimer(menuHideTimer);
      menuHideTimer = null;
    }
  }

  function finalizeMenuHide(){
    clearMenuHideJobs();
    if (menu) {
      menu.hidden = true;
    }
  }

  function scheduleMenuHide(){
    clearMenuHideJobs();
    if (!menu) return;
    menuTransitionHandler = event => {
      if (event?.target !== menu) return;
      finalizeMenuHide();
    };
    menu.addEventListener('transitionend', menuTransitionHandler);
    const setTimer = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? window.setTimeout
      : setTimeout;
    menuHideTimer = setTimer(finalizeMenuHide, 360);
  }

  function closeMenu(){
    if (!menu || !menu.classList.contains(MENU_OPEN_CLASS)) return;
    const restoreToggleFocus = menu.contains(document.activeElement);
    menu.classList.remove(MENU_OPEN_CLASS);
    menu.setAttribute('aria-hidden','true');
    scheduleMenuHide();
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', 'false');
      if (restoreToggleFocus && !dmToggleBtn.hidden && typeof dmToggleBtn.focus === 'function') {
        try {
          dmToggleBtn.focus({ preventScroll: true });
        } catch {
          dmToggleBtn.focus();
        }
      }
    }
  }

  function openMenu({ focusFirst = false } = {}){
    if (!menu || menu.classList.contains(MENU_OPEN_CLASS)) return;
    clearMenuHideJobs();
    menu.hidden = false;
    menu.setAttribute('aria-hidden','false');
    menu.classList.add(MENU_OPEN_CLASS);
    if (dmToggleBtn) {
      dmToggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (focusFirst) {
      const firstItem = menu.querySelector('button');
      if (firstItem) {
        try {
          firstItem.focus({ preventScroll: true });
        } catch {
          firstItem.focus();
        }
      }
    }
  }

  function toggleMenu({ focusMenu = false } = {}){
    if (!menu) return;
    if (menu.classList.contains(MENU_OPEN_CLASS)) {
      closeMenu();
    } else {
      openMenu({ focusFirst: focusMenu });
    }
  }

  function openNotifications(){
    if(!notifyModal) return;
    show('dm-notifications-modal');
  }

  function closeNotifications(){
    if(!notifyModal) return;
    hide('dm-notifications-modal');
  }

  function onLoginSuccess(){
    setLoggedIn();
    updateButtons();
    drainPendingNotifications();
    ensureMiniGameSubscription();
    initTools();
  }

    async function openCharacters(){
      if(!charModal || !charList) return;
      closeCharacterView();
      show('dm-characters-modal');
      charList.innerHTML = '<li class="dm-characters__placeholder">Loading characters…</li>';
      let names = [];
      try {
        names = await listCharacters();
      }
      catch(e){
        console.error('Failed to list characters', e);
        charList.innerHTML = '<li class="dm-characters__placeholder">Unable to load characters.</li>';
        return;
      }
      if (!Array.isArray(names) || names.length === 0) {
        charList.innerHTML = '<li class="dm-characters__placeholder">No characters available.</li>';
        return;
      }
      charList.innerHTML = '';
      const frag = document.createDocumentFragment();
      names.forEach(n => {
        if (!n) return;
        const li = document.createElement('li');
        li.className = 'dm-characters__item';
        const link = document.createElement('a');
        link.href = '#';
        link.setAttribute('role', 'button');
        link.className = 'dm-characters__link';
        link.dataset.characterName = n;
        link.textContent = n;
        li.appendChild(link);
        frag.appendChild(li);
      });
      charList.appendChild(frag);
      const firstLink = charList.querySelector('.dm-characters__link');
      if (firstLink && typeof firstLink.focus === 'function') {
        try {
          firstLink.focus({ preventScroll: true });
        } catch {
          firstLink.focus();
        }
      }
    }

  function closeCharacters(){
    if(!charModal) return;
    hide('dm-characters-modal');
  }

  function openCharacterView(){
    if(!charViewModal) return;
    show('dm-character-modal');
  }

  function closeCharacterView(){
    if(!charViewModal) return;
    hide('dm-character-modal');
  }

    function characterCard(data, name){
      const card=document.createElement('div');
      card.style.cssText='border:1px solid #1b2532;border-radius:8px;background:#0c1017;padding:8px';
      const labeled=(l,v)=>v?`<div><span style="opacity:.8;font-size:12px">${l}</span><div>${v}</div></div>`:'';
      const abilityGrid=['STR','DEX','CON','INT','WIS','CHA']
        .map(k=>labeled(k,data[k.toLowerCase()]||''))
        .join('');
      const perkGrid=[
        ['Alignment', data.alignment],
        ['Classification', data.classification],
        ['Power Style', data['power-style']],
        ['Origin', data.origin],
        ['Tier', data.tier]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      const statsGrid=[
        ['Init', data.initiative],
        ['Speed', data.speed],
        ['PP', data.pp]
      ]
        .filter(([,v])=>v)
        .map(([l,v])=>labeled(l,v))
        .join('');
      card.innerHTML=`
        <div><strong>${name}</strong></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
          ${labeled('HP', data['hp-bar']||'')}
          ${labeled('TC', data.tc||'')}
          ${labeled('SP', data['sp-bar']||'')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${abilityGrid}</div>
        ${perkGrid?`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px">${perkGrid}</div>`:''}
        ${statsGrid?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">${statsGrid}</div>`:''}
      `;
      const renderList=(title, items)=>`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">${title}</span><ul style=\"margin:4px 0 0 18px;padding:0\">${items.join('')}</ul></div>`;
      const renderPowerEntry = (entry, { fallback = 'Power' } = {}) => {
        if (entry && typeof entry === 'object') {
          const isModern = (
            entry.rulesText !== undefined
            || entry.effectTag !== undefined
            || entry.spCost !== undefined
            || entry.intensity !== undefined
            || entry.actionType !== undefined
            || entry.signature
          );
          if (isModern) {
            const costValue = Number(entry.spCost);
            const costLabel = Number.isFinite(costValue) && costValue > 0 ? `${costValue} SP` : '';
            return `<li>${
              labeled('Name', entry.name || fallback)
              + labeled('Style', entry.style)
              + labeled('Action', entry.actionType)
              + labeled('Intensity', entry.intensity)
              + labeled('Uses', entry.uses)
              + labeled('Cost', costLabel)
              + labeled('Save', entry.requiresSave ? entry.saveAbilityTarget : '')
              + labeled('Rules', entry.rulesText || '')
              + labeled('Description', entry.description)
              + labeled('Special', entry.special)
            }</li>`;
          }
          const legacyDesc = entry.description ?? entry.desc;
          return `<li>${labeled('Name', entry.name || fallback)}${labeled('SP', entry.sp)}${labeled('Save', entry.save)}${labeled('Special', entry.special)}${labeled('Description', legacyDesc)}</li>`;
        }
        return `<li>${labeled('Name', fallback)}</li>`;
      };
      if(data.powers?.length){
        const powers=data.powers.map(p=>renderPowerEntry(p,{fallback:'Power'}));
        card.innerHTML+=renderList('Powers',powers);
      }
      if(data.signatures?.length){
        const sigs=data.signatures.map(s=>renderPowerEntry(s,{fallback:'Signature'}));
        card.innerHTML+=renderList('Signatures',sigs);
      }
      if(data.weapons?.length){
        const weapons=data.weapons.map(w=>`<li>${labeled('Name',w.name)}${labeled('Damage',w.damage)}${labeled('Range',w.range)}</li>`);
        card.innerHTML+=renderList('Weapons',weapons);
      }
      if(data.armor?.length){
        const armor=data.armor.map(a=>`<li>${labeled('Name',a.name)}${labeled('Slot',a.slot)}${a.bonus?labeled('Bonus',`+${a.bonus}`):''}${a.equipped?labeled('Equipped','Yes'):''}</li>`);
        card.innerHTML+=renderList('Armor',armor);
      }
      if(data.items?.length){
        const items=data.items.map(i=>`<li>${labeled('Name',i.name)}${labeled('Qty',i.qty)}${labeled('Notes',i.notes)}</li>`);
        card.innerHTML+=renderList('Items',items);
      }
      if(data['story-notes']){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Backstory / Notes</span><div>${data['story-notes']}</div></div>`;
      }
      const qMap={
        'q-mask':'Who are you behind the mask?',
        'q-justice':'What does justice mean to you?',
        'q-fear':'What is your biggest fear or unresolved trauma?',
        'q-first-power':'What moment first defined your sense of power—was it thrilling, terrifying, or tragic?',
        'q-origin-meaning':'What does your Origin Story mean to you now?',
        'q-before-powers':'What was your life like before you had powers or before you remembered having them?',
        'q-power-scare':'What is one way your powers scare even you?',
        'q-signature-move':'What is your signature move or ability, and how does it reflect who you are?',
        'q-emotional':'What happens to your powers when you are emotionally compromised?',
        'q-no-line':'What line will you never cross even if the world burns around you?'
      };
      const qList=Object.entries(qMap)
        .filter(([k])=>data[k])
        .map(([k,q])=>`<li><strong>${q}</strong> ${data[k]}</li>`)
        .join('');
      if(qList){
        card.innerHTML+=`<div style="margin-top:6px"><span style=\"opacity:.8;font-size:12px\">Character Questions</span><ul style=\"margin:4px 0 0 18px;padding:0\">${qList}</ul></div>`;
      }
      return card;
    }

    charList?.addEventListener('click', async e => {
      const trigger = e.target.closest('[data-character-name], a');
      if (!trigger) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      const name = trigger.dataset?.characterName || trigger.textContent?.trim();
      if (!name || !charView) return;
      try {
        const data = await loadCharacter(name, { bypassPin: true });
        charView.innerHTML='';
        charView.appendChild(characterCard(data, name));
        openCharacterView();
      } catch (err) {
        console.error('Failed to load character', err);
      }
    });

  if (dmBtn) dmBtn.addEventListener('click', () => {
    if (!isLoggedIn()) {
      requireLogin().catch(() => {});
    }
  });

  if (dmToggleBtn) {
    let skipClick = false;
    const activateToggle = (opts = {}) => {
      if (!isLoggedIn()) {
        requireLogin().catch(() => {});
        return;
      }
      toggleMenu(opts);
    };

    dmToggleBtn.addEventListener('click', () => {
      if (skipClick) {
        skipClick = false;
        return;
      }
      activateToggle();
    });

    dmToggleBtn.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        e.preventDefault();
        skipClick = true;
        activateToggle();
      }
    });

    dmToggleBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateToggle({ focusMenu: true });
      }
    });
  }

  const closeMenuIfOutside = e => {
    if (!menu || !menu.classList.contains(MENU_OPEN_CLASS)) return;
    if (!menu.contains(e.target) && !dmBtn?.contains(e.target) && !dmToggleBtn?.contains(e.target)) {
      closeMenu();
    }
  };

  document.addEventListener('click', closeMenuIfOutside);
  document.addEventListener('pointerdown', closeMenuIfOutside);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  if (creditBtn) {
    creditBtn.addEventListener('click', async () => {
      closeMenu();
      try {
        await openCreditTool();
      } catch (err) {
        console.error('Failed to open credit tool', err);
        if (typeof toast === 'function') toast('Failed to open credit tool', 'error');
      }
    });
  }

  creditClose?.addEventListener('click', () => {
    hide('dm-credit-modal');
  });

  creditAccountSelect?.addEventListener('change', () => {
    applyCreditAccountSelection();
    updateCreditSubmitState();
  });

  creditAmountInput?.addEventListener('input', () => {
    const amount = getCreditAmountNumber();
    updateCreditCardAmountDisplay(amount);
    updateCreditSubmitState();
  });

  creditAmountInput?.addEventListener('blur', () => {
    const amount = getCreditAmountNumber();
    if (creditAmountInput) creditAmountInput.value = formatCreditAmountDisplay(amount);
    updateCreditCardAmountDisplay(amount);
  });

  creditAmountInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreditSubmit(e);
    }
  });

  creditSenderSelect?.addEventListener('change', () => {
    randomizeCreditIdentifiers();
    updateCreditSenderDataset();
    captureCreditTimestamp();
  });

  creditTxnType?.addEventListener('change', () => {
    updateCreditTransactionType();
    updateCreditSubmitState();
  });

  creditMemoInput?.addEventListener('input', () => {
    updateCreditMemoPreview(creditMemoInput.value);
  });

  creditSubmit?.addEventListener('click', handleCreditSubmit);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && creditModal && !creditModal.classList.contains('hidden')) {
      captureCreditTimestamp();
      randomizeCreditIdentifiers();
    }
  });

  window.addEventListener('focus', () => {
    if (creditModal && !creditModal.classList.contains('hidden')) {
      captureCreditTimestamp();
      randomizeCreditIdentifiers();
    }
  });

  if (tsomfBtn) {
    tsomfBtn.addEventListener('click', () => {
      closeMenu();
      if (window.openSomfDM) window.openSomfDM();
    });
  }

  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      closeMenu();
      openNotifications();
    });
  }

    if (charBtn) {
      charBtn.addEventListener('click', () => {
        closeMenu();
        openCharacters();
      });
    }

  if (miniGamesBtn) {
    miniGamesBtn.addEventListener('click', async () => {
      closeMenu();
      try {
        await openMiniGames();
      } catch (err) {
        console.error('Failed to open mini-games', err);
        if (typeof toast === 'function') toast('Failed to open mini-games', 'error');
      }
    });
  }

  if (catalogBtn) {
    catalogBtn.addEventListener('click', async () => {
      closeMenu();
      try {
        await openCatalog();
      } catch (err) {
        console.error('Failed to open catalog builder', err);
        if (typeof toast === 'function') toast('Failed to open catalog', 'error');
      }
    });
  }

  miniGamesClose?.addEventListener('click', closeMiniGames);
  catalogClose?.addEventListener('click', closeCatalog);

  miniGamesList?.addEventListener('click', e => {
    const button = e.target.closest('button[data-game-id]');
    if (!button) return;
    selectedMiniGameId = button.dataset.gameId || null;
    updateMiniGamesListSelection();
    shouldFocusMiniGameKnobs = true;
    renderMiniGameDetails();
  });

  miniGamesRefreshPlayers?.addEventListener('click', () => {
    refreshMiniGameCharacters({ preserveSelection: false });
  });

  miniGamesDeployBtn?.addEventListener('click', async () => {
    const deployed = await handleMiniGameDeploy();
    if (deployed) {
      await forceRefreshMiniGameDeployments();
    }
  });

  miniGamesRefreshBtn?.addEventListener('click', () => {
    forceRefreshMiniGameDeployments();
  });

  miniGamesDeployments?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const item = btn.closest('.dm-mini-games__deployment');
    if (!item) return;
    const player = item.dataset.player;
    const deploymentId = item.dataset.deploymentId;
    if (!player || !deploymentId) return;
    if (btn.dataset.action === 'update') {
      const select = item.querySelector('select[data-action="status"]');
      const status = select?.value || 'pending';
      btn.disabled = true;
      try {
        await updateMiniGameDeployment(player, deploymentId, { status });
        if (typeof toast === 'function') toast('Mini-game updated', 'success');
        window.dmNotify?.(`Updated mini-game ${deploymentId} to ${status}`);
      } catch (err) {
        console.error('Failed to update mini-game deployment', err);
        if (typeof toast === 'function') toast('Failed to update mini-game', 'error');
      } finally {
        btn.disabled = false;
        await forceRefreshMiniGameDeployments();
      }
    } else if (btn.dataset.action === 'delete') {
      btn.disabled = true;
      try {
        await deleteMiniGameDeployment(player, deploymentId);
        if (typeof toast === 'function') toast('Mini-game deployment removed', 'info');
        window.dmNotify?.(`Removed mini-game ${deploymentId}`);
      } catch (err) {
        console.error('Failed to remove mini-game deployment', err);
        if (typeof toast === 'function') toast('Failed to remove mini-game', 'error');
      } finally {
        btn.disabled = false;
        await forceRefreshMiniGameDeployments();
      }
    } else if (btn.dataset.action === 'nudge') {
      btn.disabled = true;
      try {
        const playerName = item.dataset.player || item.dataset.assignee || 'player';
        const missionName = item.dataset.gameName || 'mini-game';
        if (typeof toast === 'function') {
          toast(`Nudged ${playerName}`, 'info');
        }
        window.dmNotify?.(`Nudged ${playerName} about ${missionName}`);
      } finally {
        btn.disabled = false;
      }
    }
  });

  miniGamesFilterStatus?.addEventListener('change', () => {
    const value = miniGamesFilterStatus.value || 'all';
    miniGameFilterState.status = value;
    persistMiniGameFilterState();
    renderMiniGameDeployments(miniGameDeploymentsCache);
  });

  miniGamesFilterAssignee?.addEventListener('change', () => {
    const value = miniGamesFilterAssignee.value || 'all';
    miniGameFilterState.assignee = value;
    persistMiniGameFilterState();
    renderMiniGameDeployments(miniGameDeploymentsCache);
  });


  notifyModal?.addEventListener('click', e => { if(e.target===notifyModal) closeNotifications(); });
  notifyClose?.addEventListener('click', closeNotifications);
  charModal?.addEventListener('click', e => { if(e.target===charModal) closeCharacters(); });
  charClose?.addEventListener('click', closeCharacters);
  charViewModal?.addEventListener('click', e => { if(e.target===charViewModal) closeCharacterView(); });
  charViewClose?.addEventListener('click', closeCharacterView);
  catalogModal?.addEventListener('click', e => { if (e.target === catalogModal) closeCatalog(); });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      closeMenu();
      logout();
    });
  }

  updateButtons();
  if (isLoggedIn()) initTools();

  document.addEventListener('click', e => {
    const t = e.target.closest('button,a');
    if(!t) return;
    const id = t.id || t.textContent?.trim() || 'interaction';
    window.dmNotify?.(`Clicked ${id}`);
  });

  window.dmRequireLogin = requireLogin;
}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initDMLogin);
} else {
  initDMLogin();
}
