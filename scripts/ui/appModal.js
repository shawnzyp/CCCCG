function safeFocus(node) {
  try {
    if (node && typeof node.focus === 'function') node.focus();
  } catch (_) {}
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const APP_COPY = {
  characters: {
    title: 'Characters',
    body: 'Roster, stat sheets, conditions, and quick actions.',
  },
  campaignLog: {
    title: 'Campaign Log',
    body: 'Session notes, objectives, and breadcrumbs from the Director.',
  },
  messages: {
    title: 'Director’s Messages',
    body: 'Mission alerts, briefings, and secure comms.',
  },
  shards: {
    title: 'Shards',
    body: 'Draw pile access and resolved shard history.',
  },
  achievements: {
    title: 'Achievements',
    body: 'Unlocked milestones, medals, and story flags.',
  },
  dmManual: {
    title: 'DM Manual',
    body: 'Rules, references, and campaign tools.',
  },
  settings: {
    title: 'Settings',
    body: 'Account, preferences, and UI options.',
  },
};

export class AppModal {
  constructor(store) {
    this.store = store;
    this.el = document.createElement('div');
    this.el.id = 'pt-app-modal';
    this.el.className = 'pt-app-modal';
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `
      <div class="pt-app-modal__sheet" role="dialog" aria-label="App modal">
        <header class="pt-app-modal__header">
          <div class="title" data-pt-app-modal-title>App</div>
          <button type="button" data-pt-app-modal-close aria-label="Close app">✕</button>
        </header>
        <div class="pt-app-modal__body" data-pt-app-modal-body></div>
      </div>
    `;

    this.titleEl = this.el.querySelector('[data-pt-app-modal-title]');
    this.bodyEl = this.el.querySelector('[data-pt-app-modal-body]');
  }

  mount() {
    this.el.addEventListener('click', (event) => {
      const target = event.target;
      if (!target) return;
      const clickedSheet = !!target.closest('.pt-app-modal__sheet');
      const clickedClose = !!target.closest('[data-pt-app-modal-close]');

      if (clickedClose || !clickedSheet) {
        this.store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
      }
    });

    this.el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
      }
    });
  }

  open(payload = {}) {
    const appId = String(payload.appId || '');
    const fallbackTitle = payload.label ? String(payload.label) : (appId ? appId : 'App');
    const copy = APP_COPY[appId] || { title: fallbackTitle, body: 'This app is not configured yet.' };

    if (this.titleEl) this.titleEl.textContent = copy.title;
    if (this.bodyEl) {
      this.bodyEl.innerHTML = `
        <div class="pt-card">
          <h2>${escapeHtml(copy.title)}</h2>
          <p>${escapeHtml(copy.body)}</p>
        </div>
      `;
    }

    this.el.hidden = false;
    this.el.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      const closeBtn = this.el.querySelector('[data-pt-app-modal-close]');
      safeFocus(closeBtn);
    });
  }

  close() {
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
  }
}
