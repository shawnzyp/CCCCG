import { jest } from '@jest/globals';

test('DM enabling shards pushes state to active browsers', async () => {
  const callbacks = [];
  let hiddenVal = true;
  const setMock = jest.fn(async (v) => {
    hiddenVal = v;
    callbacks.forEach(cb => cb({ val: () => hiddenVal }));
  });
  const hiddenRef = {
    get: async () => ({ exists: () => true, val: () => hiddenVal }),
    on: (event, cb) => { if (event === 'value') callbacks.push(cb); },
    set: setMock,
    child: () => hiddenRef,
    limitToLast: () => hiddenRef,
    push: async () => {},
    remove: async () => {}
  };
  const noopRef = {
    get: async () => ({ exists: () => false, val: () => null }),
    on: () => {},
    set: async () => {},
    child: () => noopRef,
    limitToLast: () => noopRef,
    push: async () => {},
    remove: async () => {}
  };
  window._somf_db = {
    ref: (path) => path.endsWith('/hidden') ? hiddenRef : noopRef,
    ServerValue: { TIMESTAMP: 0 }
  };

  await import('../shard-of-many-fates.js');

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
  `;

  sessionStorage.setItem('dmLoggedIn', '1');

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  const playerCard = document.getElementById('somf-min');
  expect(playerCard.hidden).toBe(true);

  const inviteInput = document.getElementById('somfDM-inviteTargets');
  inviteInput.value = 'all';
  document.getElementById('somfDM-sendInvite').click();
  await new Promise(r => setTimeout(r, 0));

  expect(setMock).toHaveBeenCalledWith(false);
  expect(playerCard.hidden).toBe(false);
});

test('DM toggle does not reveal shards without realtime database', async () => {
  delete window._somf_db;
  localStorage.clear();

  document.body.innerHTML = `
    <section id="somf-min" hidden></section>
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
  `;

  await import(`../shard-of-many-fates.js?offline=${Date.now()}`);

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  const playerCard = document.getElementById('somf-min');
  expect(playerCard.hidden).toBe(true);

  const inviteButton = document.getElementById('somfDM-sendInvite');
  const inviteInput = document.getElementById('somfDM-inviteTargets');
  expect(inviteButton.disabled).toBe(true);
  expect(inviteInput.disabled).toBe(true);

  inviteInput.value = 'all';
  inviteButton.click();
  await new Promise(r => setTimeout(r, 0));

  // Offline invites should not change visibility and controls stay disabled
  expect(playerCard.hidden).toBe(true);

  const toasts = document.getElementById('somfDM-toasts');
  expect(toasts.children.length).toBe(0);
});

