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
      key = window.prompt('Enter OpenAI API Key:');
      if (!key) return;
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
