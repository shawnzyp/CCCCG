import { $ } from './helpers.js';
import { show } from './modal.js';

const btnAI = $('btn-ai');
if (btnAI) {
  btnAI.addEventListener('click', () => {
    show('modal-ai');
  });
}

const sendBtn = $('ai-send');
if (sendBtn) {
  sendBtn.addEventListener('click', async () => {
    const prompt = $('ai-input').value.trim();
    if (!prompt) return;
    let key = localStorage.getItem('openai-key');
    if (!key) {
      // Allow setting a global or environment-based API key so users aren't
      // repeatedly prompted every session. This checks, in order:
      //  1. a global `openaiKey` variable that can be injected by the page
      //  2. the Node-style `process.env.OPENAI_API_KEY` when running tests
      //  3. a manual prompt as a final fallback
      key = (typeof window !== 'undefined' && window.openaiKey) ||
            (typeof process !== 'undefined' && process.env && process.env.OPENAI_API_KEY) ||
            window.prompt('Enter OpenAI API Key:');
      if (!key) return;
      // Persist the key so the user isn't asked again on subsequent calls.
      localStorage.setItem('openai-key', key);
    }
    const output = $('ai-output');
    output.textContent = 'Thinking...';
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await res.json();
      output.textContent = data.choices?.[0]?.message?.content?.trim() || 'No response';
    } catch (err) {
      output.textContent = 'Error: ' + err.message;
    }
  });
}
