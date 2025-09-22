const STAR_BORDER_FLAG = 'starBorder';
const CONTENT_SELECTOR = ':scope > .star-border__content';

function createGlow(className) {
  const glow = document.createElement('span');
  glow.className = className;
  glow.setAttribute('aria-hidden', 'true');
  return glow;
}

function wrapButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.querySelector(CONTENT_SELECTOR)) {
    button.dataset[STAR_BORDER_FLAG] = 'true';
    button.classList.add('star-border');
    return;
  }

  button.dataset[STAR_BORDER_FLAG] = 'true';
  button.classList.add('star-border');

  button
    .querySelectorAll(':scope > .star-border__glow, :scope > .star-border__content')
    .forEach(node => node.remove());

  const content = document.createElement('span');
  content.className = 'star-border__content';

  const fragment = document.createDocumentFragment();
  while (button.firstChild) {
    fragment.appendChild(button.firstChild);
  }
  content.appendChild(fragment);

  button.append(
    createGlow('star-border__glow star-border__glow--bottom'),
    createGlow('star-border__glow star-border__glow--top'),
    content,
  );
}

function upgradeButtons(root) {
  if (!root) return;
  if (root instanceof HTMLButtonElement) {
    wrapButton(root);
  }
  const scope = root.querySelectorAll ? root : null;
  if (scope) {
    scope.querySelectorAll('button').forEach(wrapButton);
  }
}

function observeNewButtons() {
  if (!document.body) return;
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.target instanceof HTMLButtonElement) {
        wrapButton(mutation.target);
      }
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        upgradeButtons(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function initStarBorders() {
  upgradeButtons(document);
  observeNewButtons();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initStarBorders, { once: true });
} else {
  initStarBorders();
}
