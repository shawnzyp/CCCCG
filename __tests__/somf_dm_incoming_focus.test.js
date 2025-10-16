import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

const setupDom = () => {
  document.body.innerHTML = `
    <section id="somf-min"></section>
    <div id="somf-min-modal" hidden></div>
    <div id="somfDM-toasts"></div>
  <div class="somf-dm__toggles">
    <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
    <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text">
    <span id="somfDM-inviteSelected" class="somf-dm__inviteSelected">No players selected</span>
    <button id="somfDM-sendInvite" class="somf-btn somf-primary somf-dm__inviteSend">Send Invite</button>
    <button id="somfDM-concealAll" class="somf-btn somf-ghost somf-dm__concealAll">Conceal All</button>
    <span id="somfDM-hiddenStatus" class="somf-dm__hiddenStatus">Concealed</span>
    </div>
    <div class="overlay hidden" id="modal-somf-dm" aria-hidden="true">
      <section>
        <button id="somfDM-close"></button>
        <div id="somfDM-cardCount"></div>
        <button id="somfDM-reset"></button>
        <nav>
          <button data-tab="cards" class="somf-dm-tabbtn"></button>
          <button data-tab="resolve" class="somf-dm-tabbtn"></button>
          <button data-tab="npcs" class="somf-dm-tabbtn"></button>
          <button data-tab="items" class="somf-dm-tabbtn"></button>
        </nav>
        <section id="somfDM-tab-cards" class="somf-dm__tab"></section>
        <section id="somfDM-tab-resolve" class="somf-dm__tab">
          <ol id="somfDM-incoming"></ol>
          <div id="somfDM-noticeView"></div>
          <div class="somf-dm__actions">
            <button id="somfDM-markResolved"></button>
            <button id="somfDM-spawnNPC"></button>
          </div>
          <ol id="somfDM-resolveOptions"></ol>
        </section>
        <section id="somfDM-tab-npcs" class="somf-dm__tab">
          <ul id="somfDM-npcList"></ul>
        </section>
        <section id="somfDM-tab-items" class="somf-dm__tab">
          <ul id="somfDM-itemList"></ul>
        </section>
      </section>
    </div>
    <div id="somfDM-npcModal" class="hidden" aria-hidden="true">
      <section id="somfDM-npcModalCard"></section>
    </div>
    <ol id="somfDM-notifications"></ol>
    <audio id="somfDM-ping"></audio>
  `;
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = jest.fn();
  }
};

test('clicking an incoming shard name focuses its card', async () => {
  const notice = [{
    key: 'focus-test',
    ids: ['ECHO'],
    names: ['The Echo'],
    ts: Date.now(),
  }];
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify(notice));

  setupDom();
  sessionStorage.setItem('dmLoggedIn', '1');

  await import('../shard-of-many-fates.js');

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));

  const incomingList = document.getElementById('somfDM-incoming');
  expect(incomingList).toBeTruthy();
  const nameButton = incomingList.querySelector('button.somf-dm__link');
  expect(nameButton).toBeTruthy();
  expect(nameButton.textContent).toBe('The Echo');

  nameButton.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  const cardsTabBtn = document.querySelector('[data-tab="cards"]');
  const cardsTab = document.getElementById('somfDM-tab-cards');
  expect(cardsTabBtn?.classList.contains('active')).toBe(true);
  expect(cardsTab?.classList.contains('active')).toBe(true);

  const card = document.getElementById('somfDM-card-ECHO');
  expect(card).toBeTruthy();
  expect(card.classList.contains('somf-dm__card--highlight')).toBe(true);
});

