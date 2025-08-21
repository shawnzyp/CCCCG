import { jest } from '@jest/globals';

import { initChat } from '../scripts/chat.js';

describe('chat', () => {
  test('pressing Enter triggers send button click', async () => {
    document.body.innerHTML = `
      <button id="btn-chat"></button>
      <span id="chat-badge"></span>
      <div id="chat-global"></div>
      <div id="chat-dm"></div>
      <select id="dm-select"></select>
      <input id="chat-text" />
      <button id="chat-send"></button>
    `;

    await initChat();

    const input = document.getElementById('chat-text');
    const sendBtn = document.getElementById('chat-send');
    const clickSpy = jest.spyOn(sendBtn, 'click');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(clickSpy).toHaveBeenCalled();
  });
});

