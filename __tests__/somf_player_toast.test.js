import { jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = '';
  delete window.toast;
  delete window.dismissToast;
  delete window.logAction;
  delete window.queueCampaignLogEntry;
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

test('player receives shard toast and logs entries', async () => {
  setupDom();
  localStorage.setItem('somf_hidden__ccampaign-001', 'false');
  localStorage.setItem('somf_notices__ccampaign-001', JSON.stringify([]));

  window.toast = jest.fn((message, opts = {}) => {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
    }
    window.dispatchEvent(new CustomEvent('cc:toast-shown', { detail: { message, options: opts } }));
  });

  window.dismissToast = jest.fn(() => {
    const toastEl = document.getElementById('toast');
    if (toastEl) {
      toastEl.classList.remove('show');
    }
    window.dispatchEvent(new CustomEvent('cc:toast-dismissed'));
  });

  window.logAction = jest.fn();
  window.queueCampaignLogEntry = jest.fn();

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

  expect(window.toast).toHaveBeenCalled();
  const [message, options] = window.toast.mock.calls[0];
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

  expect(window.logAction).toHaveBeenCalledWith('The Shards: Revealed shard: The Echo');
  expect(window.queueCampaignLogEntry).toHaveBeenCalledWith('Revealed shard: The Echo', expect.objectContaining({ name: 'The Shards' }));

  const toastEl = document.getElementById('toast');
  expect(toastEl.dataset.somfShardId).toBe('ECHO');

  toastEl.click();
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(window.dismissToast).toHaveBeenCalled();
  const modal = document.getElementById('somf-min-modal');
  expect(modal.hidden).toBe(false);
});
