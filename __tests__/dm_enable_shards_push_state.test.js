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
    <input id="somfDM-playerCard" type="checkbox">
    <span id="somfDM-playerCard-state"></span>
  `;

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  const playerCard = document.getElementById('somf-min');
  expect(playerCard.hidden).toBe(true);

  const toggle = document.getElementById('somfDM-playerCard');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 0));

  expect(setMock).toHaveBeenCalledWith(false);
  expect(playerCard.hidden).toBe(false);
});

