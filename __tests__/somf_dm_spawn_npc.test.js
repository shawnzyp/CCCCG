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
  <input id="somfDM-playerCard" type="checkbox">
  <span id="somfDM-playerCard-state"></span>
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

test('DM spawn NPC button reveals shard-linked allies', async () => {
  delete window._somf_db;
  const notice = [{
    key: 'test',
    ids: ['LEGEND_KNIGHT_COMMANDER'],
    names: ['Legendary Shard — The Knight-Commander'],
    ts: Date.now()
  }];
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify(notice));

  document.body.innerHTML = overlayTemplate();

  await import('../shard-of-many-fates.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  const spawnBtn = document.getElementById('somfDM-spawnNPC');
  expect(spawnBtn.disabled).toBe(false);
  expect(spawnBtn.textContent).toContain('NPC');

  spawnBtn.click();

  const modal = document.getElementById('somfDM-npcModal');
  expect(modal.classList.contains('hidden')).toBe(false);
  expect(modal.getAttribute('aria-hidden')).toBe('false');

  const card = document.getElementById('somfDM-npcModalCard');
  expect(card.textContent).toContain('Knight-Commander Aerin Valis');
});
