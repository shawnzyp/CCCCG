function safeFocus(node) {
  try {
    if (node && typeof node.focus === 'function') node.focus();
  } catch (_) {}
}

export class MainMenu {
  constructor(store) {
    this.store = store;
    this.el = document.createElement('div');
    this.el.className = 'pt-main-menu';
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `
      <div class="pt-main-menu__sheet" role="dialog" aria-label="Main menu">
        <header class="pt-main-menu__header">
          <div class="title">Player OS</div>
          <button type="button" data-pt-menu-close aria-label="Close menu">✕</button>
        </header>

        <div class="pt-main-menu__grid">
          ${menuItem('characters', 'Characters', 'Roster & stat sheets')}
          ${menuItem('campaignLog', 'Campaign Log', 'Journal notes & cues')}
          ${menuItem('messages', 'Director’s Messages', 'Mission alerts')}
          ${menuItem('shards', 'Shards', 'Mystic draw pile')}
          ${menuItem('achievements', 'Achievements', 'Milestones unlocked')}
          ${menuItem('dmManual', 'DM Manual', 'Guides & references')}
          ${menuItem('settings', 'Settings', 'Account & preferences')}
          ${menuItem('logout', 'Lock Shell', 'Secure session', true)}
        </div>
      </div>
    `;
  }

  mount() {
    this.el.addEventListener('click', (event) => {
      const target = event.target;
      if (!target) return;
      if (target.closest('[data-pt-menu-close]') || !target.closest('.pt-main-menu__sheet')) {
        this.store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
        return;
      }
    });

    this.el.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.store?.dispatch?.({ type: 'CLOSE_OVERLAY' });
      }
    });
  }

  open() {
    this.el.hidden = false;
    this.el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      const first = this.el.querySelector('.pt-main-menu__item');
      safeFocus(first);
    });
  }

  close() {
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
  }
}

function menuItem(id, label, kicker, danger = false) {
  const safeLabel = escapeHtml(label);
  const safeKicker = escapeHtml(kicker);
  const safeId = escapeHtml(id);
  const className = `pt-main-menu__item${danger ? ' danger' : ''}`;
  return `
    <button class="${className}" type="button" data-pt-open-app="${safeId}">
      <div class="kicker">${safeKicker}</div>
      <div class="label">${safeLabel}</div>
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
