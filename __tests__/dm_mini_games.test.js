import { jest } from '@jest/globals';
import { DM_PIN } from '../scripts/dm-pin.js';

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
      <input id="dm-login-pin" />
      <button id="dm-login-submit"></button>
      <button id="dm-login-close"></button>
    </div>
    <div id="dm-notifications-modal" class="hidden" aria-hidden="true">
      <ul id="dm-notifications-list"></ul>
      <button id="dm-notifications-close"></button>
    </div>
    <div id="dm-characters-modal" class="hidden" aria-hidden="true">
      <ul id="dm-characters-list"></ul>
      <button id="dm-characters-close"></button>
    </div>
    <div id="dm-character-modal" class="hidden" aria-hidden="true">
      <div id="dm-character-sheet"></div>
      <button id="dm-character-close"></button>
    </div>
    <div id="dm-mini-games-modal" class="overlay hidden" aria-hidden="true">
      <section class="modal dm-mini-games">
        <button id="dm-mini-games-close"></button>
        <div class="dm-mini-games__layout">
          <aside class="dm-mini-games__sidebar">
            <h4 class="dm-mini-games__section-title">Library</h4>
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
              <div id="dm-mini-games-knobs" class="dm-mini-games__knobs"></div>
            </section>
            <section class="dm-mini-games__section">
              <div class="dm-mini-games__deploy-form">
                <label class="dm-mini-games__field">
                  <span>Target</span>
                  <select id="dm-mini-games-player"></select>
                </label>
                <label class="dm-mini-games__field">
                  <span>Custom</span>
                  <input id="dm-mini-games-player-custom" type="text" />
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
              <pre id="dm-mini-games-readme" class="dm-mini-games__readme"></pre>
            </section>
            <section class="dm-mini-games__section dm-mini-games__section--scroll">
              <div class="dm-mini-games__section-header">
                <h5>Deployments</h5>
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

  const sampleGame = {
    id: 'clue-tracker',
    name: 'Clue Tracker',
    tagline: 'Connect the dots',
    url: 'SuperheroMiniGames/ClueTracker/ClueTracker.html',
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
  const pinInput = document.getElementById('dm-login-pin');
  pinInput.value = DM_PIN;
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
    playerSelect.value = 'Hero One';
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
    expect(global.toast).toHaveBeenCalledWith('Mini-game deployed', 'success');

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
});
