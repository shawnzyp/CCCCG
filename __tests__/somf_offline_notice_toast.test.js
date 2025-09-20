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
    <input id="somfDM-playerCard" type="checkbox">
    <span id="somfDM-playerCard-state"></span>
    <ol id="somfDM-resolveOptions"></ol>
    <ol id="somfDM-notifications"></ol>
  `;
}

test('offline shard draw raises DM toast that links to details', async () => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  setupDom();

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
  expect(toastHost.children.length).toBe(1);

  const toast = toastHost.firstElementChild;
  expect(toast.textContent).toContain('The Echo');

  toast.click();
  // openDM should make modal visible when structure exists
  const dmModal = document.getElementById('modal-somf-dm');
  expect(dmModal.classList.contains('hidden')).toBe(false);
});
