import { jest } from '@jest/globals';

describe('AI Assistant button', () => {
  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <div class="dropdown">
        <div id="menu-actions" class="menu">
          <button id="btn-ai" class="btn-sm">AI Assistant</button>
        </div>
      </div>
      <div class="overlay hidden" id="modal-ai" aria-hidden="true"><div class="modal"></div></div>
    `;
    await import('../scripts/ai.js');
  });

  test('opens AI modal when clicked', () => {
    const modal = document.getElementById('modal-ai');
    expect(modal.classList.contains('hidden')).toBe(true);
    document.getElementById('btn-ai').click();
    expect(modal.classList.contains('hidden')).toBe(false);
  });
});
