const SPACE_CLASS = 'animated-decrypted__char--space';
const TARGET_SELECTOR = '.animated-decrypted__char';

function markSpace(node) {
  if (!(node instanceof Element)) return;

  if (!node.matches(TARGET_SELECTOR)) return;

  const isSpace = node.textContent === ' ';
  if (isSpace) {
    node.classList.add(SPACE_CLASS);
  } else {
    node.classList.remove(SPACE_CLASS);
  }
}

function processNode(node) {
  if (node instanceof Element) {
    if (node.matches(TARGET_SELECTOR)) {
      markSpace(node);
    }
    node.querySelectorAll(TARGET_SELECTOR).forEach(markSpace);
  } else if (node instanceof Text && node.parentElement?.matches(TARGET_SELECTOR)) {
    markSpace(node.parentElement);
  }
}

function initializeSpaceSupport() {
  const root = document.body;
  if (!root) {
    if (document.readyState !== 'loading') {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(initializeSpaceSupport);
      } else if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(initializeSpaceSupport, 0);
      }
    }
    return;
  }

  processNode(root);

  if (typeof MutationObserver !== 'function') {
    return;
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        if (mutation.target.parentElement) {
          processNode(mutation.target.parentElement);
        }
      } else if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(processNode);
        if (mutation.target instanceof Element && mutation.addedNodes.length) {
          processNode(mutation.target);
        }
      }
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSpaceSupport, { once: true });
} else {
  initializeSpaceSupport();
}
