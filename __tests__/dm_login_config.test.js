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
jest.unstable_mockModule('../scripts/discord-settings.js', () => ({
  getDiscordProxyKey: jest.fn(),
  isDiscordEnabled: jest.fn().mockReturnValue(false),
  reconcileDiscordSessionState: jest.fn().mockReturnValue({ cleared: false, enabled: false }),
  setDiscordEnabled: jest.fn(),
  setDiscordProxyKey: jest.fn(),
}));
jest.unstable_mockModule('../scripts/discord-events.js', () => ({
  sendEventToDiscordWorker: jest.fn(),
}));

describe('dm login configuration errors', () => {
  beforeEach(() => {
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
