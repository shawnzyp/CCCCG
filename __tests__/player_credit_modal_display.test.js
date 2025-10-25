import { jest } from '@jest/globals';
import { PLAYER_CREDIT_EVENTS } from '../scripts/player-credit-events.js';

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

    const updateEvents = [];
    const handleUpdate = (event) => {
      updateEvents.push(event?.detail);
    };
    const { subscribe } = await import('../scripts/event-bus.js');
    const unsubscribe = subscribe(PLAYER_CREDIT_EVENTS.UPDATE, handleUpdate);

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

    try {
      window.setPlayerTransaction(payload, { reveal: false });
      expect(show).not.toHaveBeenCalled();

      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'CC_PLAYER_UPDATE', payload },
        origin: window.location.origin,
      }));

      expect(show).toHaveBeenCalledWith('player-credit-modal');

      expect(updateEvents).toHaveLength(2);
      const [previewEvent, broadcastEvent] = updateEvents;
      expect(previewEvent?.meta?.reveal).toBe(false);
      expect(previewEvent?.meta?.source).toBe('update');
      expect(previewEvent?.payload?.ref).toBe(payload.ref);
      expect(previewEvent?.payload?.timestamp).toBe(payload.timestamp);

      expect(broadcastEvent?.meta?.event).toBe(PLAYER_CREDIT_EVENTS.UPDATE);
      expect(broadcastEvent?.meta?.source).toBe('message');
      expect(broadcastEvent?.meta?.reveal).toBe(true);
      expect(Array.isArray(broadcastEvent?.history)).toBe(true);
      expect(broadcastEvent?.history).toHaveLength(1);
      const sanitizedTxid = payload.ref.replace(/^TXN-/, '');
      expect(broadcastEvent?.payload?.txid).toBe(sanitizedTxid);
      expect(broadcastEvent?.history?.[0]?.txid).toBe(payload.txid);
      expect(broadcastEvent?.meta?.dmSession).toBe(false);
    } finally {
      unsubscribe();
    }
  });

  test('hydrates player modal from DM localStorage state', async () => {
    const { show } = await importWithModalMock();

    const payload = {
      account: '9876-5432-1098-7654',
      amount: 75.5,
      type: 'Transfer',
      sender: 'Grey Subnet',
      ref: 'TXN-GREY-20240321-654321',
      txid: 'ID-GREY-87654321',
      timestamp: new Date('2024-03-21T04:05:06Z').toISOString(),
      player: 'Hydration Tester',
      memo: 'DM hydrated entry',
    };

    const dmState = {
      entries: [payload],
      filters: { account: payload.account },
    };

    window.localStorage.setItem('cc_dm_card', JSON.stringify(dmState));

    const syncEvents = [];
    const handleSync = (event) => {
      syncEvents.push(event?.detail);
    };
    const { subscribe } = await import('../scripts/event-bus.js');
    const unsubscribe = subscribe(PLAYER_CREDIT_EVENTS.SYNC, handleSync);

    try {
      await import('../scripts/player-credit-modal.js');

      const card = document.getElementById('player-credit-card');
      expect(card?.dataset?.ref).toBe(payload.ref);
      expect(card?.dataset?.txid).toBe(payload.ref.replace(/^TXN-/, ''));

      const amount = document.getElementById('player-credit-amount');
      expect(amount?.textContent).toBe('₡75.50');

      const account = document.getElementById('player-credit-account');
      expect(account?.textContent).toBe(payload.account);

      const sender = document.getElementById('player-credit-sender');
      expect(sender?.textContent).toBe(payload.sender);

      expect(show).not.toHaveBeenCalled();

      expect(syncEvents).toHaveLength(1);
      const [hydrateEvent] = syncEvents;
      expect(hydrateEvent?.meta?.source).toBe('hydrate');
      expect(hydrateEvent?.meta?.reveal).toBe(false);
      expect(hydrateEvent?.payload?.memo).toBe(payload.memo);
      expect(Array.isArray(hydrateEvent?.history)).toBe(true);
      expect(hydrateEvent?.history).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });
});
