import { jest } from '@jest/globals';
import { TEST_DM_PIN } from '../tests/helpers/dm-pin.js';

const DM_PIN_4_DIGIT = TEST_DM_PIN.slice(0, 4);

function setupDom() {
  document.body.innerHTML = `
    <button id="dm-login"></button>
    <button id="dm-tools-toggle"></button>
    <div id="dm-tools-menu" hidden>
      <button id="dm-tools-tsomf"></button>
      <button id="dm-tools-notifications"></button>
      <button id="dm-tools-characters"></button>
      <button id="dm-tools-mini-games"></button>
      <button id="dm-tools-logout"></button>
    </div>
    <div id="dm-login-modal" class="hidden" aria-hidden="true">
      <input id="dm-login-username" />
      <input id="dm-login-pin" />
      <button id="dm-login-submit"></button>
      <button id="dm-login-close"></button>
    </div>
    <div id="dm-notifications-modal" class="hidden" aria-hidden="true">
      <ul id="dm-notifications-list"></ul>
      <button id="dm-notifications-close"></button>
    </div>
    <div id="dm-characters-modal" class="overlay hidden" aria-hidden="true">
      <ul id="dm-characters-list"></ul>
      <button id="dm-characters-close"></button>
    </div>
    <div id="dm-character-modal" class="overlay hidden" aria-hidden="true">
      <button id="dm-character-close"></button>
      <h3 id="dm-character-title"></h3>
      <div id="dm-character-sheet"></div>
    </div>
    <div id="dm-mini-games-modal" class="overlay hidden" aria-hidden="true">
      <section class="modal dm-mini-games" data-view-allow>
        <button id="dm-mini-games-close"></button>
        <p id="dm-mini-games-steps" class="dm-mini-games__intro"></p>
        <div class="dm-mini-games__layout">
          <aside class="dm-mini-games__sidebar">
            <h4 class="dm-mini-games__section-title">Mini-Game Library</h4>
            <form id="dm-mini-games-filters" class="dm-mini-games__filters">
              <label>
                <span>Status</span>
                <select id="dm-mini-games-filter-status">
                  <option value="all">All statuses</option>
                </select>
              </label>
              <label>
                <span>Recipient</span>
                <select id="dm-mini-games-filter-assignee">
                  <option value="all">All recipients</option>
                </select>
              </label>
              <label>
                <span>Search</span>
                <input id="dm-mini-games-filter-search" type="search" />
              </label>
            </form>
            <ul id="dm-mini-games-list" class="dm-mini-games__list"></ul>
          </aside>
          <div class="dm-mini-games__content">
            <header class="dm-mini-games__header">
              <div class="dm-mini-games__heading">
                <h4 id="dm-mini-games-title"></h4>
                <p id="dm-mini-games-tagline"></p>
              </div>
              <a id="dm-mini-games-launch" hidden></a>
            </header>
            <section class="dm-mini-games__section">
              <h5 class="dm-mini-games__section-heading">Step 2 · Tune the Mission (DM only)</h5>
              <p id="dm-mini-games-knobs-hint" class="dm-mini-games__hint"></p>
              <div id="dm-mini-games-knobs" class="dm-mini-games__knobs"></div>
            </section>
            <section class="dm-mini-games__section">
              <h5 class="dm-mini-games__section-heading">Step 3 · Send to a Player</h5>
              <p id="dm-mini-games-player-hint" class="dm-mini-games__hint"></p>
              <div class="dm-mini-games__deploy-form">
                <label class="dm-mini-games__field dm-mini-games__field--recipients">
                  <span>Recipients</span>
                  <div class="dm-mini-games__recipient-controls">
                    <div class="dm-mini-games__recipient-row">
                      <select id="dm-mini-games-player" multiple></select>
                      <button id="dm-mini-games-add-recipient" type="button" class="btn-sm">Queue Selected</button>
                    </div>
                    <div class="dm-mini-games__recipient-row">
                      <input id="dm-mini-games-player-custom" type="text" />
                      <button id="dm-mini-games-add-custom" type="button" class="btn-sm">Add Custom</button>
                    </div>
                    <div class="dm-mini-games__recipient-actions">
                      <button id="dm-mini-games-clear-recipients" type="button" class="btn-sm dm-mini-games__recipients-clear">Clear All</button>
                    </div>
                  </div>
                  <div id="dm-mini-games-recipients" class="dm-mini-games__recipients"></div>
                </label>
                <label class="dm-mini-games__field">
                  <span>Notes</span>
                  <textarea id="dm-mini-games-notes"></textarea>
                </label>
              </div>
              <div class="dm-mini-games__actions">
                <button id="dm-mini-games-refresh-players" type="button"></button>
                <button id="dm-mini-games-deploy" type="button"></button>
              </div>
            </section>
            <section class="dm-mini-games__section dm-mini-games__section--scroll">
              <h5 class="dm-mini-games__section-heading">Mission Briefing (Player View)</h5>
              <pre id="dm-mini-games-readme" class="dm-mini-games__readme"></pre>
            </section>
            <section class="dm-mini-games__section dm-mini-games__section--scroll">
              <div class="dm-mini-games__section-header">
                <h5 class="dm-mini-games__section-heading">Deployments</h5>
                <div class="dm-mini-games__section-actions">
                  <button id="dm-mini-games-refresh" type="button"></button>
                </div>
              </div>
              <ul id="dm-mini-games-deployments" class="dm-mini-games__deployments"></ul>
            </section>
          </div>
        </div>
      </section>
    </div>
  `;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

async function initDmModule() {
  jest.resetModules();
  setupDom();
  global.fetch = jest.fn();
  global.toast = jest.fn();
  global.dismissToast = jest.fn();

  const show = jest.fn();
  const hide = jest.fn();

  jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

  const listCharacters = jest.fn(async () => ['Hero One', 'Hero Two']);
  const loadCharacter = jest.fn(async () => ({}));
  const setCurrentCharacter = jest.fn();

  jest.unstable_mockModule('../scripts/characters.js', () => ({
    listCharacters,
    loadCharacter,
    setCurrentCharacter,
  }));

  const verifyDmCredential = jest.fn(async (username, pin) => pin === DM_PIN_4_DIGIT);
  const upsertDmCredentialPin = jest.fn(async (username, pin) => ({
    username,
    hash: `hash-${pin}`,
    salt: 'salt-value',
    iterations: 120000,
    keyLength: 32,
    digest: 'SHA-256',
    updatedAt: Date.now(),
  }));

  jest.unstable_mockModule('../scripts/dm-pin.js', () => ({
    verifyDmCredential,
    upsertDmCredentialPin,
    getDmCredential: jest.fn(async () => null),
    loadDmCredentialRecords: jest.fn(async () => new Map()),
    resetDmCredentialCache: jest.fn(),
  }));

  const sampleGame = {
    id: 'clue-tracker',
    name: 'Clue Tracker',
    tagline: 'Connect the dots',
    url: 'SuperheroMiniGames/play.html?game=clue-tracker',
    knobs: [
      { key: 'cluesToReveal', label: 'Clues to reveal', type: 'number', min: 1, max: 6, step: 1, default: 3 }
    ]
  };

  let deploymentsCallback = null;

  const deployMiniGame = jest.fn(async payload => ({
    ...payload,
    id: 'mg-123',
    status: 'pending',
    player: payload.player.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  jest.unstable_mockModule('../scripts/mini-games.js', () => ({
    listMiniGames: () => [sampleGame],
    getMiniGame: () => sampleGame,
    getDefaultConfig: () => ({ cluesToReveal: 3 }),
    loadMiniGameReadme: async () => 'Briefing text',
    subscribeToDeployments: callback => {
      deploymentsCallback = callback;
      callback([]);
      return jest.fn();
    },
    refreshDeployments: async () => [],
    deployMiniGame,
    updateDeployment: jest.fn(async () => {}),
    deleteDeployment: jest.fn(async () => {}),
    summarizeConfig: () => 'Clues to reveal: 3',
    MINI_GAME_STATUS_OPTIONS: [
      { value: 'pending', label: 'Pending' },
      { value: 'active', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    getStatusLabel: value => value,
    formatKnobValue: () => '3',
  }));

  window.dmNotify = jest.fn();

  await import('../scripts/dm.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  return {
    show,
    hide,
    listCharacters,
    deployMiniGame,
    getDeploymentsCallback: () => deploymentsCallback,
  };
}

async function completeLogin() {
  const loginPromise = window.dmRequireLogin();
  const usernameInput = document.getElementById('dm-login-username');
  usernameInput.value = 'TestDM';
  const pinInput = document.getElementById('dm-login-pin');
  pinInput.value = DM_PIN_4_DIGIT;
  document.getElementById('dm-login-submit').dispatchEvent(new Event('click'));
  await loginPromise;
}

describe('DM mini-game tooling', () => {
  test('deploys a mini-game to the selected character', async () => {
    const { show, listCharacters, deployMiniGame, getDeploymentsCallback } = await initDmModule();

    await completeLogin();

    const miniGamesBtn = document.getElementById('dm-tools-mini-games');
    miniGamesBtn.dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    expect(show).toHaveBeenCalledWith('dm-mini-games-modal');
    expect(listCharacters).toHaveBeenCalled();

    const playerSelect = document.getElementById('dm-mini-games-player');
    const heroOneOption = Array.from(playerSelect.options).find(option => option.value === 'Hero One');
    expect(heroOneOption).toBeDefined();
    heroOneOption.selected = true;
    playerSelect.dispatchEvent(new Event('change'));

    const recipientList = document.getElementById('dm-mini-games-recipients');
    expect(recipientList.textContent).toContain('Hero One');
    const notesField = document.getElementById('dm-mini-games-notes');
    notesField.value = 'Bring backup';

    const deployBtn = document.getElementById('dm-mini-games-deploy');
    deployBtn.dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    expect(deployMiniGame).toHaveBeenCalledTimes(1);
    expect(deployMiniGame.mock.calls[0][0]).toMatchObject({
      gameId: 'clue-tracker',
      player: 'Hero One',
      notes: 'Bring backup',
    });
    expect(global.toast).toHaveBeenCalledWith('Mini-game deployed to 1 recipient', 'success');

    const deploymentsCallback = getDeploymentsCallback();
    const miniGamesModal = document.getElementById('dm-mini-games-modal');
    miniGamesModal.classList.remove('hidden');
    miniGamesModal.setAttribute('aria-hidden', 'false');
    deploymentsCallback?.([
      {
        id: 'mg-123',
        player: 'Hero One',
        status: 'pending',
        gameName: 'Clue Tracker',
        config: { cluesToReveal: 3 },
        createdAt: Date.now(),
      }
    ]);

    const deploymentsList = document.getElementById('dm-mini-games-deployments');
    expect(deploymentsList.textContent).toContain('Hero One');
  });

  test('queues multiple recipients from the roster at once', async () => {
    await initDmModule();

    await completeLogin();

    document.getElementById('dm-tools-mini-games').dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    const playerSelect = document.getElementById('dm-mini-games-player');
    const options = Array.from(playerSelect.options).filter(option => option.value);
    expect(options.length).toBeGreaterThanOrEqual(2);

    options.forEach(option => {
      option.selected = true;
    });
    playerSelect.dispatchEvent(new Event('change'));

    const chips = document.querySelectorAll('#dm-mini-games-recipients .dm-mini-games__recipient-chip');
    expect(chips).toHaveLength(options.length);
    const deployBtn = document.getElementById('dm-mini-games-deploy');
    expect(deployBtn.disabled).toBe(false);
  });

  test('prevents duplicates when adding comma-separated custom recipients', async () => {
    await initDmModule();

    await completeLogin();

    document.getElementById('dm-tools-mini-games').dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    const playerSelect = document.getElementById('dm-mini-games-player');
    const heroOneOption = Array.from(playerSelect.options).find(option => option.value === 'Hero One');
    expect(heroOneOption).toBeDefined();
    heroOneOption.selected = true;
    playerSelect.dispatchEvent(new Event('change'));

    const customInput = document.getElementById('dm-mini-games-player-custom');
    customInput.value = 'Hero One, Hero Three , Hero Four';
    document.getElementById('dm-mini-games-add-custom').dispatchEvent(new Event('click'));

    const chips = Array.from(document.querySelectorAll('#dm-mini-games-recipients .dm-mini-games__recipient-chip'));
    const names = chips.map(chip => chip.querySelector('.dm-mini-games__recipient-name').textContent);
    expect(names).toEqual(expect.arrayContaining(['Hero One', 'Hero Three', 'Hero Four']));
    expect(names.filter(name => name === 'Hero One')).toHaveLength(1);
    expect(global.toast).toHaveBeenCalledWith('Hero One is already queued', 'info');
  });

  test('clearing recipients empties the queue and disables deployment', async () => {
    await initDmModule();

    await completeLogin();

    document.getElementById('dm-tools-mini-games').dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    const customInput = document.getElementById('dm-mini-games-player-custom');
    customInput.value = 'Hero Three, Hero Four';
    document.getElementById('dm-mini-games-add-custom').dispatchEvent(new Event('click'));

    const recipients = document.getElementById('dm-mini-games-recipients');
    expect(recipients.textContent).toContain('Hero Three');
    const deployBtn = document.getElementById('dm-mini-games-deploy');
    expect(deployBtn.disabled).toBe(false);

    document.getElementById('dm-mini-games-clear-recipients').dispatchEvent(new Event('click'));

    expect(recipients.textContent).toContain('No recipients added yet.');
    expect(deployBtn.disabled).toBe(true);
  });

  test('filters deployments by search query', async () => {
    const { getDeploymentsCallback } = await initDmModule();

    await completeLogin();

    document.getElementById('dm-tools-mini-games').dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    const deploymentsCallback = getDeploymentsCallback();
    const miniGamesModal = document.getElementById('dm-mini-games-modal');
    miniGamesModal.classList.remove('hidden');
    miniGamesModal.setAttribute('aria-hidden', 'false');

    deploymentsCallback?.([
      {
        id: 'mg-alpha',
        player: 'Alpha',
        status: 'pending',
        gameName: 'Signal Jammer',
        notes: 'Check the uplink',
        createdAt: Date.now(),
      },
      {
        id: 'mg-bravo',
        player: 'Bravo',
        status: 'pending',
        gameName: 'Cipher Run',
        notes: 'Decode the vault access codes',
        createdAt: Date.now(),
      },
      {
        id: 'mg-charlie',
        player: 'Charlie',
        status: 'pending',
        gameName: 'Shadow Chase',
        notes: 'Track the gamma signature',
        createdAt: Date.now(),
      }
    ]);

    const deploymentsList = document.getElementById('dm-mini-games-deployments');
    expect(deploymentsList.querySelectorAll('li').length).toBeGreaterThan(1);

    const searchInput = document.getElementById('dm-mini-games-filter-search');
    searchInput.value = 'CIPHER';
    searchInput.dispatchEvent(new Event('input'));

    expect(deploymentsList.querySelectorAll('li')).toHaveLength(1);
    expect(deploymentsList.textContent).toContain('Bravo');

    const storedFiltersRaw = localStorage.getItem('cc_dm_mini_game_filters');
    expect(storedFiltersRaw).toBeTruthy();
    const storedFilters = JSON.parse(storedFiltersRaw);
    expect(storedFilters.query).toBe('CIPHER');
  });
});
