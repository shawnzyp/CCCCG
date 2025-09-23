import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import DecryptedText from './DecryptedText.jsx';

const TITLE_TEXT = 'Catalyst Core';
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';

function HeaderTitle() {
  const characters = useMemo(() => CHARACTERS, []);
  return (
    <DecryptedText
      text={TITLE_TEXT}
      speed={55}
      maxIterations={18}
      characters={characters}
      revealDirection="center"
      animateOn="both"
      parentClassName="header-decrypted"
      className="header-decrypted__char"
      encryptedClassName="header-decrypted__char--scrambling"
    />
  );
}

let rootInstance = null;

function renderHeaderTitle() {
  const titleEl = document.querySelector('.tabs-title');
  if (!titleEl) return;

  const textNodes = Array.from(titleEl.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
  textNodes.forEach(node => titleEl.removeChild(node));

  let mountNode = titleEl.querySelector('.header-title-react-root');
  if (!mountNode) {
    mountNode = document.createElement('span');
    mountNode.className = 'header-title-react-root';
    titleEl.appendChild(mountNode);
  }

  const logo = titleEl.querySelector('.logo');
  if (logo && logo.nextSibling !== mountNode) {
    titleEl.insertBefore(mountNode, logo.nextSibling);
  }

  if (!rootInstance) {
    rootInstance = createRoot(mountNode);
  }

  rootInstance.render(<HeaderTitle />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderHeaderTitle, { once: true });
} else {
  renderHeaderTitle();
}
