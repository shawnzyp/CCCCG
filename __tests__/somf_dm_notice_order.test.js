import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="toast"></div>
    <section id="somf-min" hidden></section>
    <div id="somf-min-modal" hidden></div>
    <div id="somfDM-toasts"></div>
    <div id="modal-somf-dm" class="overlay hidden" aria-hidden="true">
      <button id="somfDM-close" type="button"></button>
      <div id="somfDM-cardCount"></div>
      <button id="somfDM-reset" type="button"></button>
      <nav>
        <button id="somfDM-tab-cards" data-tab="cards" class="somf-dm-tabbtn"></button>
        <button id="somfDM-tab-resolve" data-tab="resolve" class="somf-dm-tabbtn"></button>
        <button id="somfDM-tab-npcs" data-tab="npcs" class="somf-dm-tabbtn"></button>
        <button id="somfDM-tab-items" data-tab="items" class="somf-dm-tabbtn"></button>
      </nav>
      <section id="somfDM-tab-cards"></section>
      <section id="somfDM-tab-resolve"></section>
      <section id="somfDM-tab-npcs"></section>
      <section id="somfDM-tab-items"></section>
      <div id="somfDM-noticeView"></div>
      <button id="somfDM-markResolved" type="button"></button>
      <button id="somfDM-spawnNPC" type="button"></button>
      <ul id="somfDM-npcList"></ul>
      <ul id="somfDM-itemList"></ul>
      <div id="somfDM-ping"></div>
        <div class="somf-dm__toggles">
          <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
          <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text">
          <span id="somfDM-inviteSelected" class="somf-dm__inviteSelected">No players selected</span>
          <button id="somfDM-sendInvite" class="somf-btn somf-primary somf-dm__inviteSend">Send Invite</button>
          <button id="somfDM-concealAll" class="somf-btn somf-ghost somf-dm__concealAll">Conceal All</button>
          <span id="somfDM-hiddenStatus" class="somf-dm__hiddenStatus">Concealed</span>
      </div>
      <datalist id="somfDM-inviteOptions"></datalist>
      <div id="somfDM-inviteRoster" class="somf-dm__inviteRoster"></div>
      <ul id="somfDM-resolveOptions"></ul>
      <ol id="somfDM-incoming" class="somf-dm__list"></ol>
      <ol id="somfDM-notifications" class="somf-dm__list"></ol>
    </div>
    <div id="somfDM-npcModal" class="hidden" aria-hidden="true">
      <div id="somfDM-npcModalCard"></div>
    </div>
  `;
}

test('DM incoming and queue lists respect chronological order', async () => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();

  const now = Date.now();
  const notices = [
    { key: 'late', count: 1, ids: ['LATE'], names: ['Gamma'], ts: now + 2000 },
    { key: 'early', count: 1, ids: ['EARLY'], names: ['Alpha'], ts: now },
    { key: 'mid', count: 1, ids: ['MID'], names: ['Beta'], ts: now + 1000 },
  ];
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify(notices));
  localStorage.setItem('somf_hidden__ccampaign-001', 'false');

  setupDom();

  window.toast = jest.fn();
  window.logAction = jest.fn();
  window.queueCampaignLogEntry = jest.fn();
  window.dmNotify = jest.fn();
  window.requestAnimationFrame = fn => fn();
  sessionStorage.setItem('dmLoggedIn', '1');

  await import(`../shard-of-many-fates.js?dm-notice-order=${Date.now()}`);

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  const incomingNames = Array.from(document.querySelectorAll('#somfDM-incoming .somf-dm__noticeNames'))
    .map(el => el.textContent);
  expect(incomingNames).toEqual(['Alpha', 'Beta', 'Gamma']);

  const queueSummaries = Array.from(document.querySelectorAll('#somfDM-notifications li'))
    .map(el => el.textContent.trim());
  expect(queueSummaries[0]).toContain('Alpha');
  expect(queueSummaries[1]).toContain('Beta');
  expect(queueSummaries[2]).toContain('Gamma');
});
