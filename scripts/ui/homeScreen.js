const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function updateLockTime(dateEl, timeEl, now = new Date()) {
  if (timeEl) {
    const h = now.getHours();
    const m = now.getMinutes();
    const hh = String((h % 12) || 12);
    const mm = String(m).padStart(2, '0');
    timeEl.textContent = `${hh}:${mm}`;
  }

  if (dateEl) {
    const d = DAYS[now.getDay()];
    const month = MONTHS[now.getMonth()];
    const day = now.getDate();
    dateEl.textContent = `${d}, ${month} ${day}`;
  }
}

export function createHomeScreen(store) {
  const el = document.createElement('section');
  el.className = 'pt-home';
  el.dataset.ptView = 'home';
  el.setAttribute('hidden', '');
  el.setAttribute('aria-hidden', 'true');

  el.innerHTML = `
    <div class="pt-home-top">
      <div class="pt-home-time" data-pt-lock-time aria-hidden="true"></div>
      <div class="pt-home-date" data-pt-lock-date aria-hidden="true"></div>
    </div>

    <div class="pt-home-grid pt-home__grid" role="list" aria-label="Apps">
      ${appIcon('characters', 'Characters', '🧬')}
      ${appIcon('campaignLog', 'Campaign', '📓')}
      ${appIcon('messages', 'Messages', '📡')}
      ${appIcon('shards', 'Shards', '🃏')}
      ${appIcon('achievements', 'Achievements', '🏅')}
      ${appIcon('dmManual', 'DM Manual', '📘')}
      ${appIcon('settings', 'Settings', '⚙️')}
    </div>

    <div class="pt-home-dock pt-home__dock" role="list" aria-label="Dock">
      <button class="pt-dock-icon" data-pt-open-app="campaignLog" data-pt-app-label="Campaign Log" role="listitem">
        <span class="icon" aria-hidden="true">📓</span>
        <span class="label">Campaign</span>
      </button>
      <button class="pt-dock-icon" data-pt-open-app="messages" data-pt-app-label="Director’s Messages" role="listitem">
        <span class="icon" aria-hidden="true">📡</span>
        <span class="label">Messages</span>
      </button>
      <button class="pt-dock-icon" data-pt-open-app="shards" data-pt-app-label="Shards" role="listitem">
        <span class="icon" aria-hidden="true">🃏</span>
        <span class="label">Shards</span>
      </button>
    </div>
  `;

  const dateEl = el.querySelector('[data-pt-lock-date]');
  const timeEl = el.querySelector('[data-pt-lock-time]');
  updateLockTime(dateEl, timeEl);

  // Keep the clock alive while the tab is open.
  let interval = setInterval(() => updateLockTime(dateEl, timeEl), 10_000);
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(interval);
    } else {
      updateLockTime(dateEl, timeEl);
      interval = setInterval(() => updateLockTime(dateEl, timeEl), 10_000);
    }
  });

  // Minimal integration: allow the menu button to work even without a full app shell.
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
    }
  });

  return el;
}

function appIcon(id, label, icon) {
  const safeLabel = escapeHtml(label);
  const safeId = escapeHtml(id);
  return `
    <button class="pt-home-icon pt-app-icon" data-pt-open-app="${safeId}" data-pt-app-label="${safeLabel}" role="listitem">
      <span class="emoji" aria-hidden="true">${icon}</span>
      <span class="label">${safeLabel}</span>
    </button>
  `;
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
