export class Router {
  constructor({ root, screenSelector = '[data-pt-app-screen]' } = {}) {
    this.root = root || null;
    this.screenSelector = screenSelector;
    this.screens = [];

    if (this.root) {
      this.screens = Array.from(this.root.querySelectorAll(this.screenSelector));
    }
  }

  refresh() {
    if (!this.root) {
      this.screens = [];
      return;
    }
    this.screens = Array.from(this.root.querySelectorAll(this.screenSelector));
  }

  navigate(route) {
    if (!this.root) return;
    if (!this.screens.length) this.refresh();

    this.screens.forEach((screen) => {
      const isActive = screen.getAttribute('data-pt-app-screen') === route;
      screen.hidden = !isActive;
      screen.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      screen.style.pointerEvents = isActive ? 'auto' : 'none';
    });
  }

  hideAll() {
    if (!this.root) return;
    if (!this.screens.length) this.refresh();

    this.screens.forEach((screen) => {
      screen.hidden = true;
      screen.setAttribute('aria-hidden', 'true');
      screen.style.pointerEvents = 'none';
    });
  }
}
