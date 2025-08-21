import { currentPlayer, isDM, getPlayers } from './users.js';

const firebaseConfig = {
  apiKey: "AIzaSyA3DZNONr73L62eERENpVOnujzyxhoiydY",
  authDomain: "ccccg-7d6b6.firebaseapp.com",
  databaseURL: "https://ccccg-7d6b6-default-rtdb.firebaseio.com",
  projectId: "ccccg-7d6b6",
  storageBucket: "ccccg-7d6b6.firebasestorage.app",
  messagingSenderId: "705656976850",
  appId: "1:705656976850:web:eeca63f9f325e33f2b440b",
  measurementId: "G-DY7J7CNBVR",
};

let dbPromise = null;
async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const appMod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js');
      const { initializeApp } = appMod;
      const app = initializeApp(firebaseConfig);
      try {
        const analyticsMod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js');
        const { getAnalytics } = analyticsMod;
        getAnalytics(app);
      } catch (e) {
        // Analytics optional
      }
      const dbMod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');
      const { getDatabase } = dbMod;
      return getDatabase(app);
    })();
  }
  return dbPromise;
}

function appendMessage(container, from, text) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.textContent = `${from}: ${text}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function switchTab(tab) {
  document.querySelectorAll('.chat-pane').forEach(p => {
    p.classList.toggle('active', p.id === `chat-${tab}`);
  });
  document.querySelectorAll('.chat-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const sel = document.getElementById('dm-select');
  if (sel) sel.style.display = (tab === 'dm' && isDM()) ? 'block' : 'none';
  currentTab = tab;
}

let currentTab = 'global';

async function initChat() {
  const btn = document.getElementById('btn-chat');
  const overlay = document.getElementById('chat-overlay');
  const closeBtn = overlay ? overlay.querySelector('[data-close]') : null;
  const badge = document.getElementById('chat-badge');
  const input = document.getElementById('chat-text');
  const sendBtn = document.getElementById('chat-send');
  const globalPane = document.getElementById('chat-global');
  const dmPane = document.getElementById('chat-dm');
  const dmSelect = document.getElementById('dm-select');
  if (!btn || !overlay || !badge || !input || !sendBtn) return;

  let unread = false;
  const markUnread = () => {
    if (overlay.classList.contains('hidden')) {
      unread = true;
      badge.hidden = false;
    }
  };
  const clearUnread = () => {
    unread = false;
    badge.hidden = true;
  };

  btn.addEventListener('click', () => {
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    clearUnread();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    });
  }

  document.querySelectorAll('.chat-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => switchTab(tabBtn.dataset.tab));
  });

  const db = await getDb().catch(() => null);
  if (!db) return;
  const { ref, push, onChildAdded } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');

  sendBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    const from = isDM() ? 'DM' : (currentPlayer() || 'Anon');
    try {
      if (currentTab === 'global') {
        await push(ref(db, 'chat/global'), { from, text, ts: Date.now() });
      } else {
        const target = isDM() ? dmSelect.value : currentPlayer();
        if (target) {
          await push(ref(db, 'chat/dm/' + target), { from, text, ts: Date.now() });
        }
      }
    } catch (e) {
      console.error('Chat send failed', e);
    }
    input.value = '';
  });

  onChildAdded(ref(db, 'chat/global'), snap => {
    const val = snap.val();
    appendMessage(globalPane, val.from, val.text);
    if (currentTab !== 'global') markUnread();
  });

  if (isDM()) {
    const players = getPlayers();
    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      dmSelect.appendChild(opt);
      onChildAdded(ref(db, 'chat/dm/' + p), snap => {
        const val = snap.val();
        if (dmSelect.value === p && currentTab === 'dm') {
          appendMessage(dmPane, val.from, val.text);
        } else {
          markUnread();
        }
      });
    });
  } else {
    const player = currentPlayer();
    if (player) {
      onChildAdded(ref(db, 'chat/dm/' + player), snap => {
        const val = snap.val();
        appendMessage(dmPane, val.from, val.text);
        if (currentTab !== 'dm') markUnread();
      });
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initChat);
}

