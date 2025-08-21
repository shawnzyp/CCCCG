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

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function appendMessage(container, msg) {
  const { from, text, ts } = msg;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.textContent = `[${formatTimestamp(ts)}] ${from}: ${text}`;
  if (isDM() && container.id === 'chat-dm' && from !== 'DM') {
    const btn = document.createElement('button');
    btn.className = 'btn-sm chat-reply-btn';
    btn.textContent = 'Reply';
    btn.addEventListener('click', () => {
      const sel = document.getElementById('dm-select');
      if (sel) {
        sel.value = from;
        switchTab('dm');
        sel.dispatchEvent(new Event('change'));
        const input = document.getElementById('chat-text');
        if (input) input.focus();
      }
    });
    div.append(' ');
    div.appendChild(btn);
  }
  container.appendChild(div);
  while (container.children.length > 10) {
    container.removeChild(container.firstChild);
  }
  container.scrollTop = container.scrollHeight;
}

function renderMessages(container, msgs) {
  container.innerHTML = '';
  msgs.slice(-10).forEach(m => appendMessage(container, m));
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
let globalMessages = [];
let dmMessages = {};
let dmListeners = [];
let db, dbFns;

async function initChat() {
  const btn = document.getElementById('btn-chat');
  const badge = document.getElementById('chat-badge');
  const input = document.getElementById('chat-text');
  const sendBtn = document.getElementById('chat-send');
  const globalPane = document.getElementById('chat-global');
  const dmPane = document.getElementById('chat-dm');
  const dmSelect = document.getElementById('dm-select');
  if (!btn || !badge || !input || !sendBtn || !globalPane || !dmPane || !dmSelect) return;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendBtn.click();
    }
  });

  let unread = false;
  const markUnread = () => {
    if (!btn.classList.contains('active')) {
      unread = true;
      badge.hidden = false;
    }
  };
  const clearUnread = () => {
    unread = false;
    badge.hidden = true;
  };

  btn.addEventListener('click', clearUnread);

  document.querySelectorAll('.chat-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => switchTab(tabBtn.dataset.tab));
  });

  dmSelect.addEventListener('change', () => {
    const msgs = dmMessages[dmSelect.value] || [];
    renderMessages(dmPane, msgs);
  });

  db = await getDb().catch(() => null);
  if (!db) return;
  dbFns = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js');
  const { ref, push, onChildAdded, query, limitToLast } = dbFns;

  sendBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    const msg = { from: isDM() ? 'DM' : (currentPlayer() || 'Anon'), text, ts: Date.now() };
    try {
      if (currentTab === 'global') {
        await push(ref(db, 'chat/global'), msg);
      } else {
        const target = isDM() ? dmSelect.value : currentPlayer();
        if (target) await push(ref(db, 'chat/dm/' + target), msg);
      }
    } catch (e) {
      console.error('Chat send failed', e);
    }
    input.value = '';
  });

  const globalQuery = query(ref(db, 'chat/global'), limitToLast(10));
  onChildAdded(globalQuery, snap => {
    const val = snap.val();
    globalMessages.push(val);
    if (globalMessages.length > 10) globalMessages.shift();
    renderMessages(globalPane, globalMessages);
    if (currentTab !== 'global') markUnread();
  });

  const setupDm = () => {
    const { ref, onChildAdded, query, limitToLast, off } = dbFns;
    dmListeners.forEach(({ q, cb }) => off(q, 'child_added', cb));
    dmListeners = [];
    dmMessages = {};
    dmPane.innerHTML = '';
    dmSelect.innerHTML = '';

    if (isDM()) {
      const players = getPlayers();
      players.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        dmSelect.appendChild(opt);
        const q = query(ref(db, 'chat/dm/' + p), limitToLast(10));
        const cb = snap => {
          const val = snap.val();
          const arr = dmMessages[p] ||= [];
          arr.push(val);
          if (arr.length > 10) arr.shift();
          if (dmSelect.value === p && currentTab === 'dm') {
            renderMessages(dmPane, arr);
          } else {
            markUnread();
          }
        };
        onChildAdded(q, cb);
        dmListeners.push({ q, cb });
      });
    } else {
      const player = currentPlayer();
      if (player) {
        const q = query(ref(db, 'chat/dm/' + player), limitToLast(10));
        const cb = snap => {
          const val = snap.val();
          const arr = dmMessages[player] ||= [];
          arr.push(val);
          if (arr.length > 10) arr.shift();
          renderMessages(dmPane, arr);
          if (currentTab !== 'dm') markUnread();
        };
        onChildAdded(q, cb);
        dmListeners.push({ q, cb });
      }
    }
  };

  setupDm();
  window.addEventListener('playerChanged', setupDm);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initChat);
}

export { initChat };

