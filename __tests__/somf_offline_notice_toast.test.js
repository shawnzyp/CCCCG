import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <section id="somf-min"></section>
    <div id="somf-min-modal" hidden></div>
    <div id="somfDM-toasts"></div>
    <audio id="somfDM-ping"></audio>
    <div id="modal-somf-dm" class="hidden" aria-hidden="true">
      <button id="somfDM-close"></button>
      <nav>
        <button class="somf-dm-tabbtn" data-tab="cards"></button>
        <button class="somf-dm-tabbtn" data-tab="resolve"></button>
        <button class="somf-dm-tabbtn" data-tab="npcs"></button>
        <button class="somf-dm-tabbtn" data-tab="items"></button>
      </nav>
      <section id="somfDM-tab-cards"></section>
      <section id="somfDM-tab-resolve"></section>
      <section id="somfDM-tab-npcs"></section>
      <section id="somfDM-tab-items"></section>
    </div>
    <button id="somfDM-reset"></button>
    <span id="somfDM-cardCount"></span>
    <ol id="somfDM-incoming"></ol>
    <div id="somfDM-noticeView"></div>
    <button id="somfDM-markResolved"></button>
    <button id="somfDM-spawnNPC"></button>
    <ul id="somfDM-npcList"></ul>
    <ul id="somfDM-itemList"></ul>
    <div id="somfDM-npcModal" class="hidden"></div>
    <div id="somfDM-npcModalCard"></div>
    <div class="somf-dm__toggles">
      <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
      <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text">
      <span id="somfDM-inviteSelected" class="somf-dm__inviteSelected">No players selected</span>
      <button id="somfDM-sendInvite" class="somf-btn somf-primary somf-dm__inviteSend">Send Invite</button>
      <button id="somfDM-concealAll" class="somf-btn somf-ghost somf-dm__concealAll">Conceal All</button>
      <span id="somfDM-hiddenStatus" class="somf-dm__hiddenStatus">Concealed</span>
    </div>
    <ol id="somfDM-resolveOptions"></ol>
    <ol id="somfDM-notifications"></ol>
  `;
}

test('offline shard draw does not raise DM toast', async () => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  setupDom();
  sessionStorage.setItem('dmLoggedIn', '1');

  const module = await import(`../shard-of-many-fates.js?offline-toast=${Date.now()}`);
  expect(module).toBeDefined();

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  if (typeof window.initSomfDM === 'function') {
    window.initSomfDM();
  }

  const detail = {
    action: 'add',
    key: 'toast-test',
    notice: {
      key: 'toast-test',
      count: 1,
      ids: ['ECHO'],
      names: ['The Echo'],
    },
  };
  window.dispatchEvent(new CustomEvent('somf-local-notice', { detail }));
  await new Promise(r => setTimeout(r, 0));

  const toastHost = document.getElementById('somfDM-toasts');
  expect(toastHost.children.length).toBe(0);
});
