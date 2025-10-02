import { jest } from '@jest/globals';

const CLOUD_URL = 'https://ccccg-7d6b6-default-rtdb.firebaseio.com/miniGames';

describe('mini-games cloud integration helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('deployMiniGame pushes sanitized payload and refreshes cache', async () => {
    const { deployMiniGame } = await import('../scripts/mini-games.js');

    const putResponse = { ok: true, json: async () => ({}), text: async () => '' };
    const getResponse = { ok: true, json: async () => ({}) };

    global.fetch
      .mockImplementationOnce(async (url, options) => {
        expect(url.startsWith(`${CLOUD_URL}/Hero%20Prime/`)).toBe(true);
        expect(options.method).toBe('PUT');
        const body = JSON.parse(options.body);
        expect(body.player).toBe('Hero Prime');
        expect(body.gameId).toBe('clue-tracker');
        expect(body.config).toEqual({ cluesToReveal: 5 });
        expect(body.status).toBe('pending');
        return putResponse;
      })
      .mockImplementationOnce(async (url) => {
        expect(url).toBe(`${CLOUD_URL}.json`);
        return getResponse;
      });

    const created = await deployMiniGame({
      gameId: 'clue-tracker',
      player: '  Hero   Prime  ',
      config: { cluesToReveal: 5 },
      notes: 'Good luck',
      issuedBy: 'DM'
    });

    expect(created.player).toBe('Hero Prime');
    expect(created.status).toBe('pending');
    expect(created.id).toMatch(/^mg-/);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('subscribePlayerDeployments polls the cloud for updates', async () => {
    const { subscribePlayerDeployments } = await import('../scripts/mini-games.js');

    const firstResponse = {
      ok: true,
      json: async () => ({
        'mg-one': {
          id: 'mg-one',
          gameId: 'clue-tracker',
          gameName: 'Clue Tracker',
          player: 'Hero Name',
          createdAt: 5,
          status: 'pending'
        }
      })
    };
    const secondResponse = { ok: true, json: async () => ({}) };

    let resolveFirst;
    let resolveSecond;
    global.fetch
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));

    let firstResolveEntries;
    let secondResolveEntries;
    const firstCall = new Promise(resolve => { firstResolveEntries = resolve; });
    const secondCall = new Promise(resolve => { secondResolveEntries = resolve; });
    const callback = jest.fn(entries => {
      if (callback.mock.calls.length === 1) {
        firstResolveEntries?.(entries);
      } else if (callback.mock.calls.length === 2) {
        secondResolveEntries?.(entries);
      }
    });

    const unsubscribe = subscribePlayerDeployments('  Hero   Name ', callback, { intervalMs: 1 });

    resolveFirst?.(firstResponse);
    await firstCall;

    expect(global.fetch).toHaveBeenCalledWith(`${CLOUD_URL}/Hero%20Name.json`);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0][0]).toMatchObject({ id: 'mg-one', player: 'Hero Name' });

    await jest.advanceTimersByTimeAsync(1000);
    resolveSecond?.(secondResponse);
    await secondCall;
    expect(callback).toHaveBeenCalledTimes(2);

    unsubscribe();
    await jest.runOnlyPendingTimersAsync();
  });
});
