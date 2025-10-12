import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

const overlayTemplate = () => `
  <section id="somf-min"></section>
  <div id="somf-min-modal" hidden></div>
  <div id="somfDM-toasts"></div>
  <div class="somf-dm__toggles">
    <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
    <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text">
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
      <section id="somfDM-tab-cards"></section>
      <section id="somfDM-tab-resolve" class="somf-dm__tab">
        <ol id="somfDM-incoming"></ol>
        <div id="somfDM-noticeView"></div>
        <div class="somf-dm__actions">
          <button id="somfDM-markResolved"></button>
          <button id="somfDM-spawnNPC">Spawn Related NPC</button>
        </div>
        <ol id="somfDM-resolveOptions"></ol>
      </section>
      <section id="somfDM-tab-npcs">
        <ul id="somfDM-npcList"></ul>
      </section>
      <section id="somfDM-tab-items">
        <ul id="somfDM-itemList"></ul>
      </section>
    </section>
  </div>
  <div id="somfDM-npcModal" class="hidden" aria-hidden="true">
    <section id="somfDM-npcModalCard"></section>
  </div>
  <ul id="somfDM-notifications"></ul>
  <audio id="somfDM-ping"></audio>
`;

test('DM spawn NPC button stays disabled without realtime sync', async () => {
  delete window._somf_db;
  const notice = [{
    key: 'test',
    ids: ['LEGEND_KNIGHT_COMMANDER'],
    names: ['Legendary Shard — The Knight-Commander'],
    ts: Date.now()
  }];
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify(notice));

  document.body.innerHTML = overlayTemplate();
  sessionStorage.setItem('dmLoggedIn', '1');

  await import('../shard-of-many-fates.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  const spawnBtn = document.getElementById('somfDM-spawnNPC');
  expect(spawnBtn.disabled).toBe(true);
  expect(spawnBtn.textContent).toContain('NPC');

  spawnBtn.click();

  const modal = document.getElementById('somfDM-npcModal');
  expect(modal.classList.contains('hidden')).toBe(true);
  expect(modal.getAttribute('aria-hidden')).toBe('true');
});
