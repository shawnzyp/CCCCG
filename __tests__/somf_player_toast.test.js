import { jest } from '@jest/globals';

let notifications;
let toastMock;
let dismissToastMock;
let playToneMock;
let hasAudioCueMock;

beforeEach(async () => {
  jest.resetModules();
  jest.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  delete window.logAction;
  delete window.queueCampaignLogEntry;
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
});

function setupDom() {
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
  `;
}

function mockToastSystem() {
  window.toast = toastMock;
  window.dismissToast = dismissToastMock;
  toastMock.mockImplementation((message, opts = {}) => {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
    }
    window.dispatchEvent(new CustomEvent('cc:toast-shown', { detail: { message, options: opts } }));
  });

  dismissToastMock.mockImplementation(() => {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.classList.remove('show');
    }
    window.dispatchEvent(new CustomEvent('cc:toast-dismissed'));
  });

  window.logAction = jest.fn();
  window.queueCampaignLogEntry = jest.fn();
}

test('player receives shard toast and logs entries', async () => {
  setupDom();
  localStorage.setItem('somf_hidden__ccampaign-001', 'false');
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify([]));

  mockToastSystem();

  await import(`../shard-of-many-fates.js?player-toast=${Date.now()}`);

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));

  const notice = {
    key: 'toast-test',
    count: 1,
    ids: ['ECHO'],
    names: ['The Echo'],
    ts: Date.now(),
  };
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify([notice]));
  window.dispatchEvent(new CustomEvent('somf-local-notice', { detail: { action: 'add', notice } }));
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(toastMock).toHaveBeenCalled();
  const [message, options] = toastMock.mock.calls[0];
  expect(message).toBe('The Shards reveal The Echo.');
  expect(options).toMatchObject({
    type: 'info',
    somf: expect.objectContaining({
      context: 'player-shard',
      shardId: 'ECHO',
      noticeKey: 'toast-test',
      noticeIndex: 0,
    }),
  });

  expect(window.logAction).toHaveBeenCalled();
  const logged = window.logAction.mock.calls[0][0];
  expect(logged).toContain('The Shards: Revealed shard: The Echo');
  expect(logged.startsWith('[')).toBe(true);
  expect(window.queueCampaignLogEntry).toHaveBeenCalledWith(
    'Revealed shard: The Echo',
    expect.objectContaining({ name: 'The Shards', timestamp: expect.any(Number) })
  );

  const toastEl = document.getElementById('toast');
  expect(toastEl.dataset.somfShardId).toBe('ECHO');

  toastEl.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(dismissToastMock).toHaveBeenCalled();
  const modal = document.getElementById('somf-min-modal');
  expect(modal.hidden).toBe(false);
});

test('pending shard notices reveal in timestamp order once shown', async () => {
  setupDom();
  localStorage.setItem('somf_hidden__ccampaign-001', 'true');
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify([]));

  mockToastSystem();

  await import(`../shard-of-many-fates.js?player-toast-order=${Date.now()}`);

  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise(resolve => setTimeout(resolve, 0));

  const now = Date.now();
  const notices = [
    { key: 'third', count: 1, ids: ['THIRD'], names: ['Gamma'], ts: now + 2000 },
    { key: 'first', count: 1, ids: ['FIRST'], names: ['Alpha'], ts: now },
    { key: 'second', count: 1, ids: ['SECOND'], names: ['Beta'], ts: now + 1000 },
  ];

  notices.forEach(notice => {
    window.dispatchEvent(new CustomEvent('somf-local-notice', { detail: { action: 'add', notice } }));
  });

  expect(toastMock).not.toHaveBeenCalled();

  window.dispatchEvent(new CustomEvent('somf-local-hidden', { detail: false }));

  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));

  const messages = toastMock.mock.calls.map(call => call[0]);
  expect(messages.length).toBeGreaterThanOrEqual(3);
  expect(messages.slice(0, 3)).toEqual([
    'The Shards reveal Alpha.',
    'The Shards reveal Beta.',
    'The Shards reveal Gamma.',
  ]);
});
