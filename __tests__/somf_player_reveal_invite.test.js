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
    <div class="overlay hidden" id="somf-reveal-invite" aria-hidden="true">
      <section class="modal somf-reveal-invite">
        <header class="somf-reveal-invite__header">
          <h3 id="somf-reveal-invite-title" class="somf-reveal-invite__title"></h3>
          <p id="somf-reveal-invite-message" class="somf-reveal-invite__message"></p>
        </header>
        <div class="somf-reveal-invite__summary">
          <p id="somf-reveal-invite-summary" class="somf-reveal-invite__summary-text"></p>
        </div>
        <footer class="somf-reveal-invite__actions">
          <button id="somf-reveal-decline" type="button" class="btn-sm somf-reveal-invite__decline"></button>
          <button id="somf-reveal-accept" type="button" class="somf-btn somf-primary somf-reveal-invite__accept"></button>
        </footer>
      </section>
    </div>
    <div id="somfDM-toasts"></div>
    <input id="somfDM-playerCard" type="checkbox">
    <span id="somfDM-playerCard-state"></span>
  `;

  window.toast = jest.fn();
  window.dismissToast = jest.fn();
  window.logAction = jest.fn();
  window.queueCampaignLogEntry = jest.fn();
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  window.requestAnimationFrame = fn => fn();

  await import('../shard-of-many-fates.js');

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));

  const toggle = document.getElementById('somfDM-playerCard');
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  await new Promise(resolve => setTimeout(resolve, 0));

  const invite = document.getElementById('somf-reveal-invite');
  expect(invite.classList.contains('hidden')).toBe(false);
  expect(invite.classList.contains('is-visible')).toBe(true);
  expect(invite.getAttribute('aria-hidden')).toBe('false');

  expect(invite.classList.contains('is-visible')).toBe(true);

  const accept = document.getElementById('somf-reveal-accept');
  accept.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(invite.classList.contains('hidden')).toBe(true);
  expect(invite.getAttribute('aria-hidden')).toBe('true');
  expect(document.body.classList.contains('somf-reveal-active')).toBe(false);
  consoleError.mockRestore();
});
