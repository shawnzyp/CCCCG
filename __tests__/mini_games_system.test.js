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
    <div id="dm-mini-games-modal" class="overlay hidden" aria-hidden="true">
      <section class="modal dm-mini-games" data-view-allow>
        <button id="dm-mini-games-close"></button>
        <p id="dm-mini-games-steps" class="dm-mini-games__intro"></p>
        <div class="dm-mini-games__layout">
          <aside class="dm-mini-games__sidebar">
            <h4 class="dm-mini-games__section-title">Mini-Game Library</h4>
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

async function initDmModule() {
  jest.resetModules();
  const actualMiniGames = await import('../scripts/mini-games.js');
  jest.resetModules();
  setupDom();
  global.toast = jest.fn();
  global.dismissToast = jest.fn();
  window.dmNotify = jest.fn();

  const miniGamesModule = actualMiniGames;
  const readmeMock = jest.fn(async id => `Briefing for ${id}`);
  const subscribeMock = jest.fn(callback => {
    callback([]);
    return jest.fn();
  });
  const refreshMock = jest.fn(async () => []);
  const deployMock = jest.fn(async payload => ({
    ...payload,
    id: `mg-${payload.gameId}`,
    status: 'pending',
    player: payload.player,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  const updateMock = jest.fn(async () => {});
  const deleteMock = jest.fn(async () => {});

  jest.unstable_mockModule('../scripts/mini-games.js', () => ({
    ...miniGamesModule,
    loadMiniGameReadme: readmeMock,
    subscribeToDeployments: subscribeMock,
    refreshDeployments: refreshMock,
    deployMiniGame: deployMock,
    updateDeployment: updateMock,
    deleteDeployment: deleteMock,
  }));

  const listCharacters = jest.fn(async () => ['Alpha', 'Beta']);
  const loadCharacter = jest.fn(async () => ({}));
  const setCurrentCharacter = jest.fn();
  jest.unstable_mockModule('../scripts/characters.js', () => ({
    listCharacters,
    loadCharacter,
    setCurrentCharacter,
  }));

  const show = jest.fn();
  const hide = jest.fn();
  jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));

  await import('../scripts/dm.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  return {
    actualMiniGames: miniGamesModule,
    readmeMock,
    subscribeMock,
    refreshMock,
    deployMock,
    listCharacters,
    show,
    hide,
  };
}

async function completeLogin() {
  const loginPromise = window.dmRequireLogin();
  const pinInput = document.getElementById('dm-login-pin');
  pinInput.value = DM_PIN;
  document.getElementById('dm-login-submit').dispatchEvent(new Event('click'));
  await loginPromise;
}

describe('mini-game system modals', () => {
  test('every mini-game renders fully inside the DM modal', async () => {
    const {
      actualMiniGames,
      readmeMock,
      subscribeMock,
      refreshMock,
      listCharacters,
      show,
      hide,
    } = await initDmModule();

    await completeLogin();

    const miniGamesBtn = document.getElementById('dm-tools-mini-games');
    miniGamesBtn.dispatchEvent(new Event('click'));

    await Promise.resolve();
    await Promise.resolve();

    expect(show).toHaveBeenCalledWith('dm-mini-games-modal');
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(listCharacters).toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();

    const library = actualMiniGames.listMiniGames();
    const listButtons = Array.from(document.querySelectorAll('#dm-mini-games-list button[data-game-id]'));
    expect(listButtons).toHaveLength(library.length);

    const readmeEl = document.getElementById('dm-mini-games-readme');
    const introEl = document.getElementById('dm-mini-games-steps');
    const knobHintEl = document.getElementById('dm-mini-games-knobs-hint');
    const playerHintEl = document.getElementById('dm-mini-games-player-hint');

    for (const game of library) {
      const button = listButtons.find(btn => btn.dataset.gameId === game.id);
      expect(button).toBeTruthy();
      button.dispatchEvent(new Event('click', { bubbles: true }));

      await Promise.resolve();
      await Promise.resolve();

      expect(document.getElementById('dm-mini-games-title').textContent).toBe(game.name);
      expect(document.getElementById('dm-mini-games-tagline').textContent).toBe(game.tagline || '');
      const launchLink = document.getElementById('dm-mini-games-launch');
      if (game.url) {
        expect(launchLink.hidden).toBe(false);
        expect(launchLink.getAttribute('href')).toBe(game.url);
      } else {
        expect(launchLink.hidden).toBe(true);
      }

      expect(introEl.textContent).toContain(game.name);
      expect(playerHintEl.textContent).toContain('recipients');

      const knobContainer = document.getElementById('dm-mini-games-knobs');
      if (Array.isArray(game.knobs) && game.knobs.length) {
        expect(knobHintEl.textContent).toContain('Adjust');
        const wrappers = Array.from(knobContainer.querySelectorAll('.dm-mini-games__knob'));
        expect(wrappers).toHaveLength(game.knobs.length);
        for (const knob of game.knobs) {
          const wrapper = wrappers.find(node => node.dataset.knob === knob.key);
          expect(wrapper).toBeTruthy();
          if (knob.type === 'toggle') {
            expect(wrapper.querySelector('input[type="checkbox"]')).not.toBeNull();
          } else if (knob.type === 'select') {
            const select = wrapper.querySelector('select[data-knob]');
            expect(select).not.toBeNull();
            expect(select.value).toBe(String(knob.default ?? knob.options?.[0]?.value ?? ''));
            expect(select.querySelectorAll('option')).toHaveLength(knob.options?.length ?? 0);
          } else {
            const input = wrapper.querySelector('input[data-knob]');
            expect(input).not.toBeNull();
            expect(input.type === 'number' || input.type === 'text').toBe(true);
          }
        }
      } else {
        expect(knobHintEl.textContent).toContain('no optional tuning');
        expect(knobContainer.textContent).toContain('no DM tuning controls');
      }

      expect(readmeMock).toHaveBeenLastCalledWith(game.id);
      await Promise.resolve();
      await Promise.resolve();
      expect(readmeEl.textContent).toBe(`Briefing for ${game.id}`);
    }

    document.getElementById('dm-mini-games-close').dispatchEvent(new Event('click'));
    expect(hide).toHaveBeenCalledWith('dm-mini-games-modal');
  });
});
