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

  test('uses global key without prompting', async () => {
    jest.resetModules();
    // Minimal DOM for sending a prompt
    document.body.innerHTML = `
      <input id="ai-input" value="hi" />
      <div id="ai-output"></div>
      <button id="ai-send">Send</button>
    `;
    // Provide a global key and stub prompt/fetch
    window.openaiKey = 'test-key';
    window.prompt = jest.fn();
    global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));

    await import('../scripts/ai.js');
    document.getElementById('ai-send').click();

    expect(window.prompt).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    expect(localStorage.getItem('openai-key')).toBe('test-key');
  });

  test('shows API error messages', async () => {
    jest.resetModules();
    document.body.innerHTML = `
      <input id="ai-input" value="hi" />
      <div id="ai-output"></div>
      <button id="ai-send">Send</button>
    `;
    localStorage.setItem('openai-key', 'test-key');
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      }),
    );

    await import('../scripts/ai.js');
    document.getElementById('ai-send').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById('ai-output').textContent).toBe('Error: Invalid API key');
  });
});
