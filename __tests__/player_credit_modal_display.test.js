import { jest } from '@jest/globals';

describe('player credit modal display', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="player-credit-modal">
        <button id="player-credit-close" type="button"></button>
        <div id="player-credit-card" class="player-credit-card" data-account="" data-amount="" data-type="" data-sender="" data-ref="" data-txid="" data-timestamp="" data-player="">
          <header>
            <span id="player-credit-ref"></span>
            <span id="player-credit-txid"></span>
          </header>
          <div id="player-credit-account"></div>
          <div id="player-credit-amount"></div>
          <div id="player-credit-type"></div>
          <div id="player-credit-sender"></div>
          <footer>
            <span id="player-credit-date"></span>
            <span id="player-credit-time"></span>
          </footer>
        </div>
      </div>
    `;
    window.sessionStorage?.clear?.();
    jest.clearAllMocks();
  });

  async function importWithModalMock() {
    const show = jest.fn();
    const hide = jest.fn();
    await jest.unstable_mockModule('../scripts/modal.js', () => ({ show, hide }));
    await import('../scripts/modal.js');
    return { show, hide };
  }

  test('reveals player modal after DM broadcast preview', async () => {
    const { show } = await importWithModalMock();
    await import('../scripts/player-credit-modal.js');

    expect(typeof window.setPlayerTransaction).toBe('function');

    const payload = {
      account: '1234-5678-9012-3456',
      amount: 50,
      type: 'Deposit',
      sender: 'O.M.N.I Payroll Department.',
      ref: 'TXN-OMNI-20240101-123456',
      txid: 'ID-OMNI-12345678',
      timestamp: new Date('2024-01-02T03:04:05Z').toISOString(),
      player: 'Test Hero',
    };

    window.setPlayerTransaction(payload, { reveal: false });
    expect(show).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'CC_PLAYER_UPDATE', payload },
      origin: window.location.origin,
    }));

    expect(show).toHaveBeenCalledWith('player-credit-modal');
  });
});
