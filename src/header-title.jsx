import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DecryptedText from './DecryptedText.jsx';

const TITLE_TEXT = 'Catalyst Core';
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';

function HeaderTitle() {
  const characters = useMemo(() => CHARACTERS, []);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    let timeoutId;

    const scheduleNext = () => {
      const minDelay = 12000;
      const maxDelay = 28000;
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

      timeoutId = window.setTimeout(() => {
        setPlayKey(prev => prev + 1);
        scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <DecryptedText
      key={playKey}
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

  let widthRequestId = null;

  const measureAndLockWidth = () => {
    if (!mountNode || !titleEl) return;

    const measurement = document.createElement('span');
    measurement.className = 'header-decrypted header-title-width-measure';
    measurement.setAttribute('aria-hidden', 'true');
    measurement.style.position = 'absolute';
    measurement.style.visibility = 'hidden';
    measurement.style.pointerEvents = 'none';
    measurement.style.whiteSpace = 'nowrap';
    measurement.style.left = '-9999px';

    TITLE_TEXT.split('').forEach(char => {
      const charSpan = document.createElement('span');
      charSpan.className = 'header-decrypted__char';
      charSpan.textContent = char === ' ' ? '\u00A0' : char;
      measurement.appendChild(charSpan);
    });

    titleEl.appendChild(measurement);
    const { width } = measurement.getBoundingClientRect();
    titleEl.removeChild(measurement);

    if (!width) return;

    const roundedWidth = Math.ceil(width);
    const widthPx = `${roundedWidth}px`;

    mountNode.style.width = widthPx;
    mountNode.style.minWidth = widthPx;
    mountNode.style.maxWidth = widthPx;
  };

  const scheduleWidthLock = () => {
    if (widthRequestId) return;

    widthRequestId = window.requestAnimationFrame(() => {
      widthRequestId = null;
      measureAndLockWidth();
    });
  };

  scheduleWidthLock();

  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleWidthLock).catch(() => {});
  }

  if (!mountNode.__headerTitleResizeHandler) {
    const handleResize = () => {
      scheduleWidthLock();
    };
    window.addEventListener('resize', handleResize);
    mountNode.__headerTitleResizeHandler = handleResize;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderHeaderTitle, { once: true });
} else {
  renderHeaderTitle();
}
