import { jest } from '@jest/globals';

function createNoopRef() {
  const ref = {
    async get() { return { exists: () => false, val: () => null }; },
    on() {},
    off() {},
    child() { return ref; },
    limitToLast() { return ref; },
    push() { return { set: async () => {} }; },
    set: async () => {},
    remove: async () => {},
    transaction: async () => {},
  };
  return ref;
}

test('player receives a shard reveal invite and can accept it', async () => {
  jest.resetModules();
  localStorage.clear();
  sessionStorage.clear();

  const hiddenListeners = [];
  let hiddenValue = true;
  const hiddenRef = {
    async get() { return { exists: () => true, val: () => hiddenValue }; },
    on(event, cb) {
      if (event === 'value') {
        hiddenListeners.push(cb);
        cb({ val: () => hiddenValue, exists: () => true });
      }
    },
    off(event, cb) {
      if (event === 'value') {
        const idx = hiddenListeners.indexOf(cb);
        if (idx >= 0) hiddenListeners.splice(idx, 1);
      }
    },
    child() { return hiddenRef; },
    limitToLast() { return hiddenRef; },
    push() { return hiddenRef; },
    async set(value) {
      hiddenValue = !!value;
      hiddenListeners.slice().forEach(listener => listener({ val: () => hiddenValue, exists: () => true }));
    },
    async remove() {},
  };

  const hiddenSignalListeners = [];
  let hiddenSignalCount = 0;
  const hiddenSignalsRef = {
    push() {
      const key = `sig-${hiddenSignalCount++}`;
      return {
        key,
        set: async data => {
          const payload = {
            hidden: !!data.hidden,
            ts: Date.now(),
            signalId: data.signalId,
            source: data.source,
            scope: data.scope,
            targets: data.targets,
            inviteTs: data.inviteTs,
          };
          hiddenSignalListeners.slice().forEach(listener => listener({ key, val: () => payload }));
        },
      };
    },
    limitToLast() { return hiddenSignalsRef; },
    on(event, cb) {
      if (event === 'child_added') {
        hiddenSignalListeners.push(cb);
      }
    },
    off(event, cb) {
      if (event === 'child_added') {
        const idx = hiddenSignalListeners.indexOf(cb);
        if (idx >= 0) hiddenSignalListeners.splice(idx, 1);
      }
    },
    child() { return hiddenSignalsRef; },
    async get() { return { exists: () => false, val: () => null }; },
    async set() {},
    async remove() {},
  };

  window._somf_db = {
    ServerValue: { TIMESTAMP: 0 },
    ref(path) {
      if (path.endsWith('/hidden')) return hiddenRef;
      if (path.endsWith('/hidden_signals')) return hiddenSignalsRef;
      return createNoopRef();
    },
  };

  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));

  document.body.innerHTML = `
    <div id="toast"></div>
    <section id="somf-min">
      <button id="somf-min-draw" type="button"></button>
      <input id="somf-min-count" type="number">
    </section>
    <div id="somf-min-modal" hidden>
      <div data-somf-dismiss></div>
      <button id="somf-min-close" type="button"></button>
      <img id="somf-min-image" alt="">
    </div>
    <div id="somf-reveal-alert" class="somf-reveal-alert" hidden role="alertdialog" aria-modal="true" aria-labelledby="somf-reveal-title" aria-describedby="somf-reveal-text" aria-hidden="true">
      <div class="somf-reveal-alert__card" tabindex="-1">
        <h3 id="somf-reveal-title" class="somf-reveal-alert__title"></h3>
        <p id="somf-reveal-text" class="somf-reveal-alert__text"></p>
        <button type="button" class="somf-reveal-alert__btn" data-somf-reveal-dismiss></button>
      </div>
    </div>
    <div id="somfDM-toasts"></div>
    <div class="somf-dm__toggles">
      <label for="somfDM-inviteTargets" class="somf-dm__inviteLabel">Invite players to reveal</label>
      <input id="somfDM-inviteTargets" class="somf-dm__inviteInput" type="text">
      <span id="somfDM-inviteSelected" class="somf-dm__inviteSelected">No players selected</span>
      <button id="somfDM-sendInvite" class="somf-btn somf-primary somf-dm__inviteSend">Send Invite</button>
      <button id="somfDM-concealAll" class="somf-btn somf-ghost somf-dm__concealAll">Conceal All</button>
      <span id="somfDM-hiddenStatus" class="somf-dm__hiddenStatus">Concealed</span>
    </div>
    <div id="modal-somf-dm" class="overlay hidden" aria-hidden="true">
      <section>
        <button id="somfDM-close"></button>
        <div id="somfDM-cardCount"></div>
        <button id="somfDM-reset"></button>
        <nav>
          <button data-tab="cards" class="somf-dm-tabbtn"></button>
          <button data-tab="resolve" class="somf-dm-tabbtn"></button>
          <button data-tab="npcs" class="somf-dm-tabbtn"></button>
          <button data-tab="items" class="somf-dm-tabbtn"></button>
        </nav>
        <section id="somfDM-tab-cards"></section>
        <section id="somfDM-tab-resolve"></section>
        <section id="somfDM-tab-npcs"></section>
        <section id="somfDM-tab-items"></section>
      </section>
    </div>
    <div id="somfDM-npcModal" class="hidden" aria-hidden="true"></div>
  `;

  window.toast = jest.fn();
  window.dismissToast = jest.fn();
  window.logAction = jest.fn();
  window.queueCampaignLogEntry = jest.fn();
  sessionStorage.setItem('dmLoggedIn', '1');
  window.currentCharacter = () => 'Nova';
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  window.requestAnimationFrame = fn => fn();

  await import('../shard-of-many-fates.js');

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));

  const inviteInput = document.getElementById('somfDM-inviteTargets');
  inviteInput.value = 'Nova';
  const inviteButton = document.getElementById('somfDM-sendInvite');
  inviteButton.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  const invite = document.getElementById('somf-reveal-alert');
  expect(invite.hidden).toBe(false);
  expect(invite.classList.contains('is-visible')).toBe(true);
  expect(invite.getAttribute('aria-hidden')).toBe('false');
  expect(document.getElementById('somf-reveal-title').textContent).toBe('The Shards of Many Fates');
  expect(document.getElementById('somf-reveal-text').textContent).toBe('The Shards of Many Fates have revealed themselves to you, do you dare tempt Fate?');

  const accept = invite.querySelector('[data-somf-reveal-dismiss]');
  expect(accept.textContent).toBe('Eeehhhhh…');
  accept.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(invite.hidden).toBe(true);
  expect(invite.getAttribute('aria-hidden')).toBe('true');
  expect(document.body.classList.contains('somf-reveal-active')).toBe(false);
  consoleError.mockRestore();
});
