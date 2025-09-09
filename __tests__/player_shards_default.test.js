import '../shard-of-many-fates.js';

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
