
const stubRef = {
  get: async () => ({ exists: () => false, val: () => null }),
  on: () => {},
  set: async () => {},
  child: () => stubRef,
  limitToLast: () => stubRef,
  push: async () => {},
  remove: async () => {}
};

beforeAll(async () => {
  window._somf_db = { ref: () => stubRef, ServerValue: { TIMESTAMP: 0 } };
  await import('../shard-of-many-fates.js');
});

beforeEach(() => {
  window._somf_db = { ref: () => stubRef, ServerValue: { TIMESTAMP: 0 } };
});

describe('player shards tool default state', () => {
  test('player card is hidden by default on load', async () => {
    document.body.innerHTML = `
      <section id="somf-min"></section>
      <div id="somf-min-modal"></div>
    `;
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    const card = document.getElementById('somf-min');
    expect(card.hidden).toBe(true);
  });
});
