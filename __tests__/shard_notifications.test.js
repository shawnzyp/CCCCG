import { jest } from '@jest/globals';

// Utility to wait for async tasks to complete
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Shard draws notify DM', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="ccShard-player">
        <input id="ccShard-player-count" value="1" />
        <button id="ccShard-player-draw"></button>
        <ol id="ccShard-player-results"></ol>
      </div>
      <div id="toast"></div>
    `;
    // enable shards
    localStorage.setItem('ccShardEnabled', '1');
    // stub shard draw
    window.CCShard = {
      draw: () => [{ name: 'Test Shard' }],
      open: jest.fn()
    };
    // auto-confirm prompts
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    localStorage.clear();
    delete window.CCShard;
  });

  test('DM receives notification on shard draw', async () => {
    const notifyHandler = jest.fn();
    window.addEventListener('dm:notify', notifyHandler);

    // import module after DOM setup
    await import('../scripts/shard-player.js');

    // click draw button
    document.getElementById('ccShard-player-draw').click();
    await flushPromises();

    expect(localStorage.getItem('dmNotifications')).toBeNull();
    expect(notifyHandler).toHaveBeenCalled();
    expect(notifyHandler.mock.calls[0][0].detail).toMatch('Player drew shard');
    expect(window.CCShard.open).toHaveBeenCalled();
  });
});
