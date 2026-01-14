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
      <button id="dm-tools-discord" data-dm-tool="discord">Discord</button>
      <div id="dm-discord-modal" class="hidden">
        <button id="dm-discord-close"></button>
        <input id="dm-discord-enabled" type="checkbox" />
        <input id="dm-discord-key" />
        <button id="dm-discord-test">Test</button>
        <p id="dm-discord-status"></p>
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

describe('discord relay configuration', () => {
  it('reconcileDiscordSessionState clears enabled when key missing and fires a one-time toast', async () => {
    const { reconcileDiscordSessionState } = await import('../scripts/discord-settings.js');
    localStorage.setItem('cc:discord:enabled', '1');

    const notifications = [];
    const handler = event => {
      notifications.push(event.detail);
    };
    document.addEventListener('cc:ui-notify', handler);

    const first = reconcileDiscordSessionState();
    const second = reconcileDiscordSessionState();

    document.removeEventListener('cc:ui-notify', handler);

    expect(first.enabled).toBe(false);
    expect(first.hasKey).toBe(false);
    expect(localStorage.getItem('cc:discord:enabled')).toBe('0');
    expect(notifications).toHaveLength(1);
    expect(second.enabled).toBe(false);
  });

  it('shows disconnected, disabled, and connected status states', async () => {
    await import('../scripts/dm.js');
    const status = document.getElementById('dm-discord-status');
    expect(status.textContent).toBe('Disconnected');
    expect(status.classList.contains('dm-discord__status--disconnected')).toBe(true);

    sessionStorage.setItem('cc:discord:proxy-key', 'abc123');
    localStorage.setItem('cc:discord:proxyUrl', 'https://relay.example');
    document.getElementById('dm-tools-discord').click();
    expect(status.textContent).toBe('Disabled');
    expect(status.classList.contains('dm-discord__status--disabled')).toBe(true);

    const enabled = document.getElementById('dm-discord-enabled');
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    expect(status.textContent).toBe('Connected');
    expect(status.classList.contains('dm-discord__status--connected')).toBe(true);
  });

  it('resolves proxy URL using override, meta, then global and rejects placeholders', async () => {
    const { resolveDiscordProxyConfig, __test__ } = await import('../scripts/discord-events.js');
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'discord-proxy-url');
    meta.setAttribute('content', 'https://YOUR-WORKER.yourdomain.workers.dev');
    document.head.appendChild(meta);
    window.DISCORD_PROXY_URL = 'https://global.example/relay/';

    localStorage.setItem('cc:discord:proxyUrl', 'https://override.example/relay/');
    const overrideConfig = resolveDiscordProxyConfig();
    expect(overrideConfig.baseUrl).toBe('https://override.example/relay');

    localStorage.removeItem('cc:discord:proxyUrl');
    localStorage.setItem('cc.discord.proxyUrl', 'https://legacy.example/relay/');
    const fallbackConfig = resolveDiscordProxyConfig();
    expect(fallbackConfig.baseUrl).toBe('https://legacy.example/relay');
    expect(localStorage.getItem('cc:discord:proxyUrl')).toBe('https://legacy.example/relay');

    expect(__test__.isPlaceholderValue('REPLACE_ME')).toBe(true);
    delete window.DISCORD_PROXY_URL;
  });

  it('validates proxy URLs for https and localhost http only', async () => {
    const { __test__ } = await import('../scripts/discord-events.js');
    expect(__test__.normalizeProxyBaseUrl('https://relay.example')).toBe('https://relay.example');
    expect(__test__.normalizeProxyBaseUrl('http://localhost:8787/roll')).toBe('http://localhost:8787');
    expect(__test__.normalizeProxyBaseUrl('http://example.com')).toBe(null);
    expect(__test__.normalizeProxyBaseUrl('__DISCORD_PROXY_URL__')).toBe(null);
  });

  it('tests relay health via /health without posting to /roll', async () => {
    await import('../scripts/dm.js');
    localStorage.setItem('cc:discord:proxyUrl', 'https://relay.example');
    sessionStorage.setItem('cc:discord:proxy-key', 'abc123');

    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock;

    document.getElementById('dm-discord-test').click();
    await new Promise(resolve => setTimeout(resolve, 0));

    const calls = fetchMock.mock.calls.map(call => call[0]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toBe('https://relay.example/health');
    expect(calls.some(url => String(url).includes('/roll'))).toBe(false);
    const headers = fetchMock.mock.calls[0][1].headers;
    const authHeader = typeof headers?.get === 'function' ? headers.get('Authorization') : headers.Authorization;
    expect(authHeader).toBe('Bearer abc123');
  });

  it('toastOnce emits only once across multiple calls', async () => {
    const { toastOnce } = await import('../scripts/ui-notify.js');
    const notifications = [];
    const handler = event => notifications.push(event.detail);
    document.addEventListener('cc:ui-notify', handler);

    toastOnce('once-test', 'One and done', 'info');
    toastOnce('once-test', 'One and done', 'info');

    document.removeEventListener('cc:ui-notify', handler);
    expect(notifications).toHaveLength(1);
  });
});
