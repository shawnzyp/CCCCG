import { jest } from '@jest/globals';

jest.unstable_mockModule('../scripts/characters.js', () => ({
  currentCharacter: null,
  listCharacters: jest.fn(),
  loadCharacter: jest.fn(),
}));
jest.unstable_mockModule('../scripts/modal.js', () => ({
  show: id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  },
  hide: id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  },
}));
jest.unstable_mockModule('../scripts/mini-games.js', () => ({
  listMiniGames: jest.fn().mockResolvedValue([]),
  getMiniGame: jest.fn(),
  getDefaultConfig: jest.fn(),
  loadMiniGameReadme: jest.fn(),
  formatKnobValue: jest.fn(),
  subscribeToDeployments: jest.fn(),
  refreshDeployments: jest.fn(),
  deployMiniGame: jest.fn(),
  updateDeployment: jest.fn(),
  deleteDeployment: jest.fn(),
  MINI_GAME_STATUS_OPTIONS: [],
  summarizeConfig: jest.fn(),
  getStatusLabel: jest.fn(),
  areMiniGamesBlocked: jest.fn().mockReturnValue(false),
  onMiniGamesBlocked: jest.fn(),
}));
jest.unstable_mockModule('../scripts/auth.js', () => ({
  isSignedIn: jest.fn().mockReturnValue(false),
  onAuthStateChange: jest.fn(),
  getFirebaseDatabase: jest.fn(),
}));
jest.unstable_mockModule('../scripts/dm-catalog-sync.js', () => ({
  storeDmCatalogPayload: jest.fn(),
}));
jest.unstable_mockModule('../scripts/storage.js', () => ({
  saveCloud: jest.fn(),
  getActiveUserId: jest.fn(),
}));
jest.unstable_mockModule('../scripts/notifications.js', () => ({
  toast: jest.fn(),
  dismissToast: jest.fn(),
}));
jest.unstable_mockModule('../scripts/faction.js', () => ({
  FACTIONS: [],
  FACTION_NAME_MAP: {},
}));
jest.unstable_mockModule('../scripts/last-save.js', () => ({
  readLastSaveName: jest.fn(),
}));
jest.unstable_mockModule('../scripts/discord-events.js', () => ({
  sendEventToDiscordWorker: jest.fn(),
  testDiscordRelay: jest.fn().mockResolvedValue({ ok: true, status: 200 }),
}));

describe('dm login configuration errors', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.head.innerHTML = '';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'cc-dm-pin-sha256');
    meta.setAttribute('content', '__DM_PIN_SHA256__');
    document.head.appendChild(meta);

    document.body.innerHTML = `
      <button id="dm-login"></button>
      <div id="dm-login-modal" class="hidden">
        <button id="dm-login-close"></button>
        <input id="dm-login-pin" />
        <button id="dm-login-submit">Enter</button>
        <p data-login-error hidden></p>
        <p data-login-wait hidden></p>
      </div>
    `;
  });

  it('shows a config error and disables submit when the meta tag is invalid', async () => {
    await import('../scripts/dm.js');
    const dmBtn = document.getElementById('dm-login');
    dmBtn.click();
    const errorEl = document.querySelector('[data-login-error]');
    const submit = document.getElementById('dm-login-submit');
    expect(errorEl.textContent).toBe('DM PIN is not configured for this deployment.');
    expect(submit.disabled).toBe(true);
  });
});

function setupDiscordDom() {
  document.body.innerHTML = `
    <button id="dm-login"></button>
    <div id="dm-login-modal" class="hidden">
      <button id="dm-login-close"></button>
      <input id="dm-login-pin" />
      <button id="dm-login-submit">Enter</button>
      <p data-login-error hidden></p>
      <p data-login-wait hidden></p>
    </div>
    <div id="dm-discord-modal" class="hidden">
      <button id="dm-discord-close"></button>
      <input type="checkbox" id="dm-discord-enabled" />
      <input type="password" id="dm-discord-key" />
      <button type="button" id="dm-discord-test">Test</button>
      <p id="dm-discord-status"></p>
    </div>
  `;
}

describe('discord session reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears enabled when the proxy key is missing', async () => {
    localStorage.setItem('cc:discord:enabled', '1');
    const { reconcileDiscordSessionState, isDiscordEnabled } = await import('../scripts/discord-settings.js');
    const result = reconcileDiscordSessionState();
    expect(result.cleared).toBe(true);
    expect(isDiscordEnabled()).toBe(false);
  });
});

describe('discord ui status and warnings', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    document.head.innerHTML = '';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'cc-dm-pin-sha256');
    meta.setAttribute('content', '__DM_PIN_SHA256__');
    document.head.appendChild(meta);
    setupDiscordDom();
  });

  it('shows a missing-key warning once when enabled without a key', async () => {
    localStorage.setItem('cc:discord:enabled', '1');
    const { toast } = await import('../scripts/notifications.js');
    await import('../scripts/dm.js');
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      'Discord relay was enabled, but the relay key is missing. Re-enter your key to reconnect.',
      'warn',
    );
  });

  it('shows disconnected status when no key is present', async () => {
    localStorage.setItem('cc:discord:enabled', '1');
    await import('../scripts/dm.js');
    const status = document.getElementById('dm-discord-status');
    expect(status.textContent).toBe('Disconnected');
    expect(status.dataset.state).toBe('disconnected');
  });

  it('shows disabled status when key is present but disabled', async () => {
    sessionStorage.setItem('cc:discord:proxy-key', 'test-key');
    await import('../scripts/dm.js');
    const status = document.getElementById('dm-discord-status');
    expect(status.textContent).toBe('Disabled');
    expect(status.dataset.state).toBe('disabled');
  });

  it('shows connected status when enabled with a key', async () => {
    localStorage.setItem('cc:discord:enabled', '1');
    sessionStorage.setItem('cc:discord:proxy-key', 'test-key');
    await import('../scripts/dm.js');
    const status = document.getElementById('dm-discord-status');
    expect(status.textContent).toBe('Connected');
    expect(status.dataset.state).toBe('connected');
  });
});
