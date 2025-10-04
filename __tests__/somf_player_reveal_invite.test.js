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
