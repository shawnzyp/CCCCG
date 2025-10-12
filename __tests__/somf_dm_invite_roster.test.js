import { jest } from '@jest/globals';

function createNoopRef() {
  return {
    async get() { return { exists: () => false, val: () => null }; },
    on() {},
    off() {},
    child() { return createNoopRef(); },
    limitToLast() { return createNoopRef(); },
    push() { return { key: 'noop', set: async () => {} }; },
    async set() {},
    async remove() {},
    async transaction(updater) {
      if (typeof updater === 'function') updater(null);
      return { committed: true, snapshot: { val: () => null } };
    },
  };
}

test('DM invite roster loads cloud player names', async () => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();

  const fetchMock = jest.fn(async (url) => {
    expect(url).toBe('https://ccccg-7d6b6-default-rtdb.firebaseio.com/saves.json');
    return {
      ok: true,
      json: async () => ({ 'Hero%20Two': {}, 'Hero%20One': {} }),
    };
  });
  global.fetch = fetchMock;

  window._somf_db = {
    ServerValue: { TIMESTAMP: 0 },
    ref() { return createNoopRef(); },
  };

  window.toast = jest.fn();
  window.logAction = jest.fn();
  window.queueCampaignLogEntry = jest.fn();
  window.dmNotify = jest.fn();
  window.requestAnimationFrame = fn => fn();
  sessionStorage.setItem('dmLoggedIn', '1');

  document.body.innerHTML = `
    <div id="toast"></div>
    <section id="somf-min" hidden></section>
    <div id="somf-min-modal" hidden></div>
    <div id="somfDM-toasts"></div>
    <div class="somf-dm__toggles">
      <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
      <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text" list="somfDM-inviteOptions">
      <button id="somfDM-sendInvite" class="somf-btn somf-primary somf-dm__inviteSend">Send Invite</button>
      <button id="somfDM-concealAll" class="somf-btn somf-ghost somf-dm__concealAll">Conceal All</button>
      <span id="somfDM-hiddenStatus" class="somf-dm__hiddenStatus">Concealed</span>
    </div>
    <datalist id="somfDM-inviteOptions"></datalist>
    <div id="somfDM-inviteRoster" class="somf-dm__inviteRoster" aria-live="polite"></div>
    <div id="modal-somf-dm" class="overlay hidden" aria-hidden="true">
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
        <section id="somfDM-tab-resolve"></section>
        <section id="somfDM-tab-npcs"></section>
        <section id="somfDM-tab-items"></section>
      </section>
    </div>
    <div id="somfDM-npcModal" class="hidden" aria-hidden="true"></div>
  `;

  await import(`../shard-of-many-fates.js?invite-roster=${Date.now()}`);

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  const datalist = document.getElementById('somfDM-inviteOptions');
  const optionValues = Array.from(datalist.children).map(option => option.value);
  expect(optionValues).toEqual(['Hero One', 'Hero Two']);

  const rosterButtons = Array.from(document.querySelectorAll('.somf-dm__inviteChip')).map(btn => btn.textContent);
  expect(rosterButtons).toEqual(['Hero One', 'Hero Two']);

  const inviteInput = document.getElementById('somfDM-inviteTargets');
  document.querySelector('.somf-dm__inviteChip')?.click();
  expect(inviteInput.value).toBe('Hero One');

  expect(fetchMock).toHaveBeenCalledTimes(1);

  delete global.fetch;
});
