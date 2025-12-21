function makeAnchorBefore(node) {
  if (!node || !node.parentNode) return null;
  const anchor = document.createComment('cc:ticker-anchor');
  try {
    node.parentNode.insertBefore(anchor, node);
  } catch {}
  return anchor;
}

function findMainTickers() {
  const drawer = document.querySelector('[data-ticker-drawer]') || null;
  const root = drawer || document;
  const primary =
    (drawer && drawer.querySelector('.news-ticker:not(.news-ticker--m24n)')) ||
    root.querySelector('[data-ticker="primary"]') ||
    root.querySelector('#ticker-primary') ||
    root.querySelector('.ticker--primary') ||
    root.querySelector('.ticker[data-kind="primary"]') ||
    null;
  const secondary =
    (drawer && drawer.querySelector('.news-ticker--m24n')) ||
    root.querySelector('[data-ticker="secondary"]') ||
    root.querySelector('#ticker-secondary') ||
    root.querySelector('.ticker--secondary') ||
    root.querySelector('.ticker[data-kind="secondary"]') ||
    null;
  return { primary, secondary };
}

function getLauncherTickerRail(kind) {
  try {
    return document.querySelector('[data-pt-ticker-rail="' + kind + '"]');
  } catch {
    return null;
  }
}

export class MainMenu {
  constructor({ root, appHost } = {}) {
    this.root = root || null;
    this.appHost = appHost || null;
    this.tickerMountState = null;
  }

  bind(store) {
    if (!this.root) return;
    const closeBtn = this.root.querySelector('[data-pt-menu-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        store.dispatch({ type: 'CLOSE_OVERLAY' });
      });
    }
  }

  show() {
    if (!this.root) return;
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.mountTickers();
    this.hideAppScreens();
  }

  hide() {
    if (!this.root) return;
    this.root.setAttribute('aria-hidden', 'true');
    this.root.hidden = true;
    this.restoreTickers();
  }

  mountTickers() {
    const railPrimary = getLauncherTickerRail('primary');
    const railSecondary = getLauncherTickerRail('secondary');
    const { primary, secondary } = findMainTickers();

    if (!railPrimary && !railSecondary) return;
    if (!primary && !secondary) return;

    if (!this.tickerMountState) {
      this.tickerMountState = {
        primary: primary ? { node: primary, anchor: makeAnchorBefore(primary) } : null,
        secondary: secondary ? { node: secondary, anchor: makeAnchorBefore(secondary) } : null,
      };
    }

    try {
      if (primary && railPrimary && primary.parentNode !== railPrimary) {
        railPrimary.appendChild(primary);
      }
    } catch {}

    try {
      if (secondary && railSecondary && secondary.parentNode !== railSecondary) {
        railSecondary.appendChild(secondary);
      }
    } catch {}

    try {
      this.root.classList.add('pt-main-menu--has-tickers');
    } catch {}
  }

  restoreTickers() {
    const state = this.tickerMountState;
    if (!state) return;

    const restore = (entry) => {
      if (!entry || !entry.node) return;
      if (entry.anchor && entry.anchor.parentNode) {
        try {
          entry.anchor.parentNode.insertBefore(entry.node, entry.anchor);
        } catch {}
        try {
          entry.anchor.parentNode.removeChild(entry.anchor);
        } catch {}
      }
    };

    restore(state.primary);
    restore(state.secondary);

    this.tickerMountState = null;
    try {
      this.root.classList.remove('pt-main-menu--has-tickers');
    } catch {}
  }

  hideAppScreens() {
    if (!this.appHost) return;
    this.appHost.querySelectorAll('[data-pt-app-screen]').forEach((node) => {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
      node.style.pointerEvents = 'none';
    });
  }
}
