import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DecryptedText from './DecryptedText.jsx';

const TITLE_TEXT = 'Catalyst Core';
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';

function HeaderTitle() {
  const characters = useMemo(() => CHARACTERS, []);
  const glowId = useMemo(() => `header-glow-${Math.random().toString(36).slice(2, 9)}`, []);
  const strokeId = `${glowId}-stroke`;
  const fillId = `${glowId}-fill`;
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
    <>
      <span className="tabs-title__glow" aria-hidden="true">
        <span className="tabs-title__glow-ambient"></span>
        <svg
          className="tabs-title__glow-svg"
          viewBox="0 0 320 120"
          preserveAspectRatio="none"
          role="presentation"
        >
          <defs>
            <linearGradient id={strokeId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
              <stop offset="50%" stopColor="var(--accent-2)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.85" />
            </linearGradient>
            <radialGradient id={fillId} cx="50%" cy="50%" r="0.82">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
              <stop offset="80%" stopColor="var(--accent)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect
            x="2"
            y="2"
            width="316"
            height="116"
            rx="46"
            ry="46"
            fill={`url(#${fillId})`}
            stroke={`url(#${strokeId})`}
            strokeWidth="2.5"
          />
        </svg>
      </span>
      <span className="tabs-title__content">
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
      </span>
    </>
  );
}

let rootInstance = null;

function renderHeaderTitle() {
  const titleEl = document.querySelector('.tabs-title');
  if (!titleEl) return;

  const headerRow = titleEl.closest('.top');
  let logoButton = null;
  let menuContainer = null;

  if (headerRow) {
    logoButton = headerRow.querySelector('.logo-button');
    menuContainer = headerRow.querySelector('.dropdown');
    if (logoButton && menuContainer) {
      if (logoButton.nextElementSibling !== titleEl) {
        headerRow.insertBefore(titleEl, menuContainer);
      } else if (titleEl.nextElementSibling !== menuContainer) {
        headerRow.insertBefore(menuContainer, titleEl.nextSibling);
      }
    }
  }

  const textNodes = Array.from(titleEl.childNodes).filter(node => node.nodeType === Node.TEXT_NODE);
  textNodes.forEach(node => titleEl.removeChild(node));

  const legacyLabels = titleEl.querySelectorAll('.tabs-title__label');
  legacyLabels.forEach(label => {
    if (label.parentNode === titleEl) {
      titleEl.removeChild(label);
    }
  });

  const duplicateRoots = titleEl.querySelectorAll('.header-title-react-root');
  duplicateRoots.forEach((node, index) => {
    if (index > 0 && node.parentNode === titleEl) {
      node.parentNode.removeChild(node);
    }
  });

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

  if (!logo) {
    const themeButton = headerRow?.querySelector('.logo-button');
    if (themeButton && themeButton.nextElementSibling === titleEl && titleEl.firstChild !== mountNode) {
      titleEl.appendChild(mountNode);
    }
  }

  mountNode.style.removeProperty('width');
  mountNode.style.removeProperty('minWidth');
  mountNode.style.removeProperty('maxWidth');

  if (!rootInstance) {
    rootInstance = createRoot(mountNode);
  }

  rootInstance.render(<HeaderTitle />);

  let widthRequestId = null;
  let availableRequestId = null;

  const setWidthVariable = width => {
    if (!width) return;

    const roundedWidth = Math.ceil(width);
    const widthPx = `${roundedWidth}px`;

    if (mountNode.style.getPropertyValue('--header-title-width') !== widthPx) {
      mountNode.style.setProperty('--header-title-width', widthPx);
    }
  };

  const measureAvailableWidth = () => {
    if (!headerRow || !mountNode) return;

    const rowRect = headerRow.getBoundingClientRect();
    if (!rowRect) return;

    const logoRect = logoButton?.getBoundingClientRect();
    const menuRect = menuContainer?.getBoundingClientRect();

    let availableWidth = rowRect.width;

    if (logoRect && menuRect) {
      availableWidth = menuRect.left - logoRect.right;
    } else if (logoRect) {
      availableWidth = rowRect.right - logoRect.right;
    } else if (menuRect) {
      availableWidth = menuRect.left - rowRect.left;
    }

    const buffer = 12;
    const normalized = Math.max(0, Math.floor(availableWidth) - buffer);
    const widthPx = `${normalized}px`;

    if (mountNode.style.getPropertyValue('--header-title-available') !== widthPx) {
      mountNode.style.setProperty('--header-title-available', widthPx);
    }
  };

  const scheduleAvailableWidthMeasure = () => {
    if (availableRequestId) return;

    availableRequestId = window.requestAnimationFrame(() => {
      availableRequestId = null;
      measureAvailableWidth();
    });
  };

  const measureAndLockWidth = () => {
    if (!mountNode || !titleEl) return;

    const renderedText = mountNode.querySelector('.header-decrypted');
    if (!renderedText) return;

    const { width } = renderedText.getBoundingClientRect();
    setWidthVariable(width);
    scheduleAvailableWidthMeasure();
  };

  const scheduleWidthLock = () => {
    if (widthRequestId) return;

    widthRequestId = window.requestAnimationFrame(() => {
      widthRequestId = null;
      measureAndLockWidth();
    });
  };

  scheduleWidthLock();
  scheduleAvailableWidthMeasure();

  if ('ResizeObserver' in window) {
    const ensureResizeObserver = () => {
      const renderedText = mountNode.querySelector('.header-decrypted');
      if (!renderedText) return;

      let observer = mountNode.__headerTitleResizeObserver;
      if (!observer) {
        observer = new ResizeObserver(entries => {
          entries.forEach(entry => {
            setWidthVariable(entry.contentRect?.width ?? 0);
            scheduleAvailableWidthMeasure();
          });
        });
        mountNode.__headerTitleResizeObserver = observer;
      }

      const prevObserved = mountNode.__headerTitleObservedEl;
      if (prevObserved && prevObserved !== renderedText) {
        try {
          observer.unobserve(prevObserved);
        } catch (error) {
          // ignore browsers that throw when unobserving a stale node
        }
      }

      if (prevObserved !== renderedText) {
        observer.observe(renderedText);
        mountNode.__headerTitleObservedEl = renderedText;
        scheduleAvailableWidthMeasure();
      }
    };

    ensureResizeObserver();

    if (!mountNode.__headerTitleMutationObserver) {
      const mutationObserver = new MutationObserver(() => {
        ensureResizeObserver();
        scheduleAvailableWidthMeasure();
      });
      mutationObserver.observe(mountNode, { childList: true, subtree: true });
      mountNode.__headerTitleMutationObserver = mutationObserver;
    }
  } else {
    if (document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          scheduleWidthLock();
          scheduleAvailableWidthMeasure();
        })
        .catch(() => {});
    }

    if (!mountNode.__headerTitleResizeHandler) {
      const handleResize = () => {
        scheduleWidthLock();
        scheduleAvailableWidthMeasure();
      };
      window.addEventListener('resize', handleResize);
      mountNode.__headerTitleResizeHandler = handleResize;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderHeaderTitle, { once: true });
} else {
  renderHeaderTitle();
}
