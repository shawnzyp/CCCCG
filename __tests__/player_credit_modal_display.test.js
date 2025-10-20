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
    window.localStorage?.clear?.();
    delete window.setPlayerTransaction;
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

  test('dispatches update event with sanitized payload', async () => {
    await importWithModalMock();
    const { PLAYER_CREDIT_EVENTS } = await import('../scripts/player-credit-modal.js');

    const observed = [];
    const handler = (event) => observed.push(event.detail);
    window.addEventListener(PLAYER_CREDIT_EVENTS.UPDATE, handler);

    const payload = {
      account: ' 1234-5678 ',
      amount: '42.5',
      type: 'Deposit',
      sender: 'Payroll',
      memo: '  Commission bonus  ',
      timestamp: '2025-02-03T10:11:12Z',
      player: 'Test Hero',
    };

    try {
      window.setPlayerTransaction(payload, { reveal: false, persist: false });
    } finally {
      window.removeEventListener(PLAYER_CREDIT_EVENTS.UPDATE, handler);
    }

    expect(observed.length).toBeGreaterThan(0);
    const detail = observed[observed.length - 1];
    expect(detail).toBeTruthy();
    expect(detail.history).toHaveLength(1);
    expect(detail.payload.account.trim()).toBe('1234-5678');
    expect(detail.payload.amount).toBeCloseTo(42.5);
    expect(detail.payload.memo).toBe('Commission bonus');
    expect(detail.payload.ref).toMatch(/^TXN-/);
    expect(new Date(detail.payload.timestamp).toISOString()).toBe('2025-02-03T10:11:12.000Z');
  });

  test('emits sync event when history payload batches arrive', async () => {
    const { show } = await importWithModalMock();
    const { PLAYER_CREDIT_EVENTS } = await import('../scripts/player-credit-modal.js');

    const syncPayloads = [];
    const handler = (event) => syncPayloads.push(event.detail);
    window.addEventListener(PLAYER_CREDIT_EVENTS.SYNC, handler);

    const entries = [
      {
        ref: 'TXN-001',
        txid: 'A-1',
        timestamp: '2025-01-01T05:06:07Z',
        amount: 10,
        sender: 'Alpha',
        type: 'Deposit',
      },
      {
        ref: 'TXN-002',
        txid: 'B-1',
        timestamp: '2025-01-02T01:02:03Z',
        amount: -5,
        sender: 'Beta',
        type: 'Debit',
      },
    ];

    try {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'CC_PLAYER_UPDATE', payload: entries },
        origin: window.location.origin,
      }));
    } finally {
      window.removeEventListener(PLAYER_CREDIT_EVENTS.SYNC, handler);
    }

    expect(show).toHaveBeenCalledWith('player-credit-modal');
    expect(syncPayloads.length).toBeGreaterThan(0);
    const detail = syncPayloads[syncPayloads.length - 1];
    expect(detail.history).toHaveLength(2);
    expect(detail.history.map(item => item.txid)).toEqual(['B-1', 'A-1']);
    expect(detail.latest.ref).toBe('TXN-002');
    expect(detail.latest.txid).toBe('002');
    expect(detail.latest.amount).toBe(-5);
  });
});
