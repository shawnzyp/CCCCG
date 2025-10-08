import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import DecryptedText from './DecryptedText.jsx';

const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';

function AnimatedTitle({ text, playIndex }) {
  const characters = useMemo(() => CHARACTERS, []);

  return (
    <DecryptedText
      key={playIndex}
      text={text}
      speed={55}
      maxIterations={18}
      characters={characters}
      revealDirection="center"
      animateOn="both"
      parentClassName="animated-decrypted"
      className="animated-decrypted__char"
      encryptedClassName="animated-decrypted__char--scrambling"
    />
  );
}

const animatedTitles = new Map();
let currentActiveGroup = null;

function getGroupKey(element) {
  const fieldset = element.closest('fieldset[data-tab]');
  return fieldset?.dataset.tab ?? 'global';
}

function stripTextNodes(element) {
  const textNodes = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
  textNodes.forEach(node => element.removeChild(node));
}

function findDirectChild(element, selector) {
  return Array.from(element.children ?? []).find(child => child.matches(selector)) ?? null;
}

function ensureMountNode(element) {
  let mountNode = findDirectChild(element, '.animated-title-react-root');
  if (!mountNode) {
    mountNode = document.createElement('span');
    mountNode.className = 'animated-title-react-root';
    element.insertBefore(mountNode, element.firstChild);
  }
  return mountNode;
}

function resolveAnimationTarget(element) {
  const explicitSelector = element.getAttribute('data-animate-title-target');
  if (explicitSelector) {
    const explicitTarget = element.querySelector(explicitSelector);
    if (explicitTarget) {
      return explicitTarget;
    }
  }

  if (element.matches('.card-legend__title')) {
    return element;
  }

  const legendTitle =
    findDirectChild(element, '.card-legend__title') ??
    element.querySelector('.card-legend__content > .card-legend__title') ??
    element.querySelector('.card-legend__title');
  if (legendTitle) {
    return legendTitle;
  }

  return element;
}

function getAnimationText(hostElement, targetElement) {
  const hostOverride = hostElement.getAttribute('data-animate-title-text');
  if (hostOverride) {
    return hostOverride;
  }

  const targetOverride = targetElement.getAttribute?.('data-animate-title-text');
  if (targetOverride) {
    return targetOverride;
  }

  return targetElement.textContent?.trim() ?? '';
}

function renderInstance(instance) {
  instance.root.render(<AnimatedTitle text={instance.text} playIndex={instance.playIndex} />);
}

function mountTitle(hostElement) {
  const targetElement = resolveAnimationTarget(hostElement);
  if (!targetElement) return;

  if (animatedTitles.has(targetElement)) return;

  const text = getAnimationText(hostElement, targetElement);
  if (!text) return;

  stripTextNodes(targetElement);
  const mountNode = ensureMountNode(targetElement);
  const root = createRoot(mountNode);

  const instance = {
    host: hostElement,
    element: targetElement,
    root,
    text,
    playIndex: 0,
    group: getGroupKey(targetElement)
  };

  renderInstance(instance);
  animatedTitles.set(targetElement, instance);
}

function playGroup(group) {
  animatedTitles.forEach(instance => {
    if (instance.group === group || (group !== 'global' && instance.group === 'global')) {
      instance.playIndex += 1;
      renderInstance(instance);
    }
  });
}

function initializeTitles() {
  const elements = document.querySelectorAll('[data-animate-title]');
  elements.forEach(element => mountTitle(element));

  const activeCard = document.querySelector('fieldset[data-tab].card.active');
  const activeGroup = activeCard?.dataset.tab ?? null;
  currentActiveGroup = activeGroup;

  requestAnimationFrame(() => {
    playGroup('global');
    if (activeGroup) {
      playGroup(activeGroup);
    }
  });

  const main = document.querySelector('main');
  if (main) {
    const observer = new MutationObserver(mutations => {
      const previousActiveGroup = currentActiveGroup;
      let nextActiveGroup = currentActiveGroup;
      let shouldReplayGlobal = false;

      mutations.forEach(mutation => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          mutation.target instanceof HTMLElement &&
          mutation.target.matches('fieldset[data-tab].card')
        ) {
          const tabName = mutation.target.dataset.tab;
          if (!tabName) return;

          const isActive = mutation.target.classList.contains('active');

          if (isActive) {
            if (tabName !== nextActiveGroup) {
              if (tabName !== previousActiveGroup) {
                shouldReplayGlobal = true;
              }
              nextActiveGroup = tabName;
            }
          } else if (tabName === nextActiveGroup) {
            nextActiveGroup = null;
          }
        }
      });

      if (shouldReplayGlobal) {
        playGroup('global');
      }

      if (nextActiveGroup && nextActiveGroup !== previousActiveGroup) {
        playGroup(nextActiveGroup);
      }

      currentActiveGroup = nextActiveGroup;
    });

    observer.observe(main, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTitles, { once: true });
} else {
  initializeTitles();
}
