function safeFocus(node) {
  try {
    if (node && typeof node.focus === 'function') node.focus();
  } catch (_) {}
}

export class Router {
  constructor(hostOrOptions) {
    if (hostOrOptions && typeof hostOrOptions === 'object' && 'root' in hostOrOptions) {
      this.host = hostOrOptions.root || null;
      this.screenSelector = hostOrOptions.screenSelector || '[data-pt-app-screen]';
      this.legacy = true;
      this.screens = this.host ? Array.from(this.host.querySelectorAll(this.screenSelector)) : [];
    } else {
      this.host = hostOrOptions || null;
      this.screenSelector = null;
      this.legacy = false;
    }
    this.handlers = new Map();
    this.activeRoute = null;
  }

  on(eventName, handler) {
    if (!this.handlers.has(eventName)) this.handlers.set(eventName, new Set());
    this.handlers.get(eventName).add(handler);
    return () => this.handlers.get(eventName).delete(handler);
  }

  emit(eventName, detail) {
    const handlers = this.handlers.get(eventName);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler({ detail });
      } catch (_) {
        // ignore handler errors
      }
    }
  }

  getRouteNode(route) {
    if (!this.host) return null;
    return this.host.querySelector(`[data-pt-route="${route}"]`);
  }

  ensureRoute(route) {
    if (this.legacy) return this.getRouteNode(route);
    if (!this.host) return null;
    let node = this.getRouteNode(route);
    if (node) return node;

    node = document.createElement('section');
    node.className = 'pt-app-screen';
    node.dataset.ptRoute = route;
    node.setAttribute('tabindex', '-1');
    node.innerHTML = `
      <div class="pt-app-screen__header">
        <h2>${escapeHtml(route)}</h2>
      </div>
      <div class="pt-app-screen__content">
        <p>Placeholder screen for <strong>${escapeHtml(route)}</strong>.</p>
      </div>
    `;
    this.host.appendChild(node);
    return node;
  }

  navigate(route, options = {}) {
    if (this.legacy) {
      if (!this.host) return;
      if (!this.screens?.length) this.refresh();

      this.screens.forEach((screen) => {
        const isActive = screen.getAttribute('data-pt-app-screen') === route;
        screen.hidden = !isActive;
        screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        screen.style.pointerEvents = isActive ? 'auto' : 'none';
      });
      return;
    }
    if (!route) return;
    const next = this.ensureRoute(route);
    if (!next) return;

    const prev = this.activeRoute ? this.getRouteNode(this.activeRoute) : null;
    if (prev && prev !== next) {
      prev.setAttribute('hidden', '');
      prev.setAttribute('aria-hidden', 'true');
    }

    next.removeAttribute('hidden');
    next.setAttribute('aria-hidden', 'false');
    this.activeRoute = route;

    if (!options.noFocus) {
      safeFocus(next);
    }

    this.emit('navigate', { route });
  }

  refresh() {
    if (!this.legacy) return;
    if (!this.host) {
      this.screens = [];
      return;
    }
    this.screens = Array.from(this.host.querySelectorAll(this.screenSelector));
  }

  hideAll() {
    if (this.legacy) {
      if (!this.host) return;
      if (!this.screens?.length) this.refresh();
      this.screens.forEach((screen) => {
        screen.hidden = true;
        screen.setAttribute('aria-hidden', 'true');
        screen.style.pointerEvents = 'none';
      });
      return;
    }
    if (!this.host) return;
    const screens = this.host.querySelectorAll('[data-pt-route]');
    screens.forEach((screen) => {
      screen.setAttribute('hidden', '');
      screen.setAttribute('aria-hidden', 'true');
    });
  }
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
