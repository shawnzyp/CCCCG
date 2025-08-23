import { show, hide } from '../scripts/modal.js';

describe('modal show/hide behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="outside-btn"></button>
      <div id="content"></div>
      <div class="overlay hidden" id="modal-one" aria-hidden="true">
        <div class="modal">
          <button id="modal-one-btn">Ok</button>
          <button id="modal-one-btn2">Cancel</button>
        </div>
      </div>
      <div class="overlay hidden" id="modal-two" aria-hidden="true">
        <div class="modal"><button id="modal-two-btn">Ok</button></div>
      </div>
    `;
    document.getElementById('outside-btn').focus();
  });

  test('show and hide a single modal', () => {
    show('modal-one');
    const modal = document.getElementById('modal-one');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(document.getElementById('content').hasAttribute('inert')).toBe(true);
    expect(document.activeElement.id).toBe('modal-one-btn');

    hide('modal-one');
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.classList.contains('modal-open')).toBe(false);
    expect(document.getElementById('content').hasAttribute('inert')).toBe(false);
    expect(document.activeElement.id).toBe('outside-btn');
  });

  test('focus is trapped within modal', () => {
    show('modal-one');
    const btn1 = document.getElementById('modal-one-btn');
    const btn2 = document.getElementById('modal-one-btn2');
    // shift+Tab on the first element wraps to the last
    btn1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(btn2);
    // Tab on the last element wraps back to the first
    btn2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(btn1);
    hide('modal-one');
  });

  test('multiple modals keep body locked until all are closed', () => {
    show('modal-one');
    show('modal-two');
    hide('modal-one');
    expect(document.body.classList.contains('modal-open')).toBe(true);
    hide('modal-two');
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
