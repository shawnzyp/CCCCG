import { jest } from '@jest/globals';

let notifications;
let toastMock;
let dismissToastMock;
let playToneMock;
let hasAudioCueMock;

function setupDom() {
  document.body.innerHTML = `
    <div class="overlay hidden" id="modal-somf-dm" aria-hidden="true">
      <section id="somf-dm" class="modal somf-dm">
        <button id="somfDM-close"></button>
        <header class="somf-dm__hdr">
          <h3>DM • Shards <span id="somfDM-cardCount"></span></h3>
          <div class="somf-dm__hdr-controls">
          <div class="somf-dm__toggles">
            <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
            <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text">
            <span id="somfDM-inviteSelected" class="somf-dm__inviteSelected">No players selected</span>
            <button id="somfDM-sendInvite" class="somf-btn somf-primary somf-dm__inviteSend">Send Invite</button>
            <button id="somfDM-concealAll" class="somf-btn somf-ghost somf-dm__concealAll">Conceal All</button>
            <span id="somfDM-hiddenStatus" class="somf-dm__hiddenStatus">Concealed</span>
            </div>
            <div class="somf-dm__actions">
              <button id="somfDM-reset" class="somf-btn">Reset</button>
            </div>
          </div>
        </header>
        <nav class="somf-dm__tabs">
          <button data-tab="cards" class="somf-dm-tabbtn active">Shards List</button>
          <button data-tab="resolve" class="somf-dm-tabbtn">Resolve</button>
          <button data-tab="npcs" class="somf-dm-tabbtn">NPCs</button>
          <button data-tab="items" class="somf-dm-tabbtn">Items</button>
        </nav>
        <section id="somfDM-tab-cards" class="somf-dm-tab somf-dm__tab active"></section>
        <section id="somfDM-tab-resolve" class="somf-dm-tab somf-dm__tab">
          <div class="somf-dm__resolve">
            <aside class="somf-dm__left">
              <h4>Incoming Draws</h4>
              <ol id="somfDM-incoming" class="somf-dm__list"></ol>
            </aside>
            <main class="somf-dm__main">
              <div id="somfDM-noticeView" class="somf-dm__card"></div>
              <div class="somf-dm__actions">
                <button id="somfDM-markResolved" class="somf-btn somf-primary" disabled>Mark Resolved</button>
                <button id="somfDM-spawnNPC" class="somf-btn" disabled>Spawn Related NPC</button>
              </div>
            </main>
          </div>
          <h4>Resolution Methods</h4>
          <ol id="somfDM-resolveOptions" class="somf-dm__list"></ol>
        </section>
        <section id="somfDM-tab-npcs" class="somf-dm-tab somf-dm__tab">
          <ul id="somfDM-npcList" class="somf-dm__list"></ul>
        </section>
        <section id="somfDM-tab-items" class="somf-dm-tab somf-dm__tab">
          <div
            id="somfDM-giftOverlay"
            class="somf-dm__gift hidden"
            aria-hidden="true"
            hidden
          >
            <div
              id="somfDM-giftDialog"
              class="somf-dm__giftDialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="somfDM-giftTitle"
              aria-describedby="somfDM-giftMessage"
              tabindex="-1"
            >
              <h4 id="somfDM-giftTitle" class="somf-dm__giftTitle"></h4>
              <p id="somfDM-giftMessage" class="somf-dm__giftSubtitle"></p>
              <form id="somfDM-giftForm" class="somf-dm__giftForm" novalidate>
                <div class="somf-dm__giftGroup">
                  <label for="somfDM-giftSelect">Choose a recipient</label>
                  <select id="somfDM-giftSelect" class="somf-dm__giftSelect" aria-describedby="somfDM-giftRosterStatus somfDM-giftError"></select>
                  <p id="somfDM-giftRosterStatus" class="somf-dm__giftStatus" aria-live="polite"></p>
                </div>
                <div class="somf-dm__giftDivider" role="separator" aria-hidden="true"><span>or</span></div>
                <div class="somf-dm__giftGroup">
                  <label for="somfDM-giftCustom">Enter a custom name</label>
                  <input
                    id="somfDM-giftCustom"
                    class="somf-dm__giftInput"
                    type="text"
                    autocomplete="off"
                    aria-describedby="somfDM-giftError"
                  >
                </div>
                <p id="somfDM-giftError" class="somf-dm__giftError" role="alert"></p>
                <div class="somf-dm__giftActions">
                  <button id="somfDM-giftSubmit" type="submit" class="somf-btn somf-primary">Gift Item</button>
                  <button type="button" class="somf-btn somf-ghost" data-somf-gift-cancel>Cancel</button>
                </div>
              </form>
            </div>
          </div>
          <ul id="somfDM-itemList" class="somf-dm__list somf-dm__list--actions"></ul>
        </section>
      </section>
    </div>
    <div id="somfDM-toasts" class="somf-dm__toasts"></div>
    <ul id="somfDM-notifications" class="somf-dm__queue"></ul>
    <div id="somfDM-npcModal" class="overlay hidden" aria-hidden="true">
      <section id="somfDM-npcModalCard" class="modal somf-dm"></section>
    </div>
    <audio id="somfDM-ping"></audio>
  `;
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
  }

  createOscillator() {
    return {
      type: 'sine',
      frequency: {
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
      },
      connect: jest.fn(target => target),
      start: jest.fn(),
      stop: jest.fn(),
    };
  }

  createGain() {
    return {
      connect: jest.fn(() => ({ connect: jest.fn() })),
      gain: {
        cancelScheduledValues: jest.fn(),
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
      },
    };
  }

  resume = jest.fn();
}

class FakeBroadcastChannel {
  constructor() {}
  addEventListener() {}
  postMessage() {}
  close() {}
}

describe('DM item gifting flow', () => {
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    setupDom();
    sessionStorage.setItem('dmLoggedIn', '1');

    toastMock = jest.fn();
    dismissToastMock = jest.fn();
    playToneMock = jest.fn();
    hasAudioCueMock = jest.fn();
    jest.unstable_mockModule('../scripts/notifications.js', () => ({
      toast: toastMock,
      dismissToast: dismissToastMock,
      playTone: playToneMock,
      hasAudioCue: hasAudioCueMock,
    }));
    notifications = await import('../scripts/notifications.js');
    window.toast = toastMock;
    window.dismissToast = dismissToastMock;

    global.fetch = jest.fn();
    window.dmNotify = jest.fn();
    window.prompt = jest.fn(() => { throw new Error('prompt should not be called'); });

    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));

    global.AudioContext = FakeAudioContext;
    global.webkitAudioContext = FakeAudioContext;
    global.BroadcastChannel = FakeBroadcastChannel;

    window.requestAnimationFrame = cb => cb();
    window.cancelAnimationFrame = jest.fn();
    window._somf_db = null;
  });

  it('records gifted items and notifies the DM log', async () => {
    await import('../shard-of-many-fates.js');
    window.initSomfDM?.();

    const itemList = document.getElementById('somfDM-itemList');
    expect(itemList).toBeTruthy();
    expect(itemList.children.length).toBeGreaterThan(0);

    const firstItem = itemList.querySelector('li');
    const itemName = firstItem.querySelector('strong').textContent;
    const giftBtn = firstItem.querySelector('button');
    expect(giftBtn).toBeTruthy();

    giftBtn.click();
    await Promise.resolve();

    const giftOverlay = document.getElementById('somfDM-giftOverlay');
    expect(giftOverlay).toBeTruthy();
    expect(giftOverlay.hidden).toBe(false);

    const giftInput = document.getElementById('somfDM-giftCustom');
    expect(giftInput).toBeTruthy();
    giftInput.value = 'Nova';

    const giftForm = document.getElementById('somfDM-giftForm');
    giftForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    const notifyCall = window.dmNotify.mock.calls.find(([message]) => message.includes('Gifted'));
    expect(notifyCall).toBeDefined();
    expect(notifyCall[0]).toContain(itemName);
    expect(notifyCall[0]).toContain('Nova');
    expect(notifyCall[1]).toMatchObject({
      actionScope: 'major',
      item: expect.objectContaining({ recipient: 'Nova' }),
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining('<strong>Gifted</strong>'),
      expect.objectContaining({ type: 'success', duration: 4000, html: expect.any(String) })
    );

    expect(window.prompt).not.toHaveBeenCalled();

    const stored = JSON.parse(localStorage.getItem('somf_item_gifts__ccampaign-001'));
    expect(Array.isArray(stored)).toBe(true);
    expect(stored.length).toBeGreaterThan(0);
    const lastGift = stored[stored.length - 1];
    expect(lastGift.name).toBe(itemName);
    expect(lastGift.recipient).toBe('Nova');
  });
});
