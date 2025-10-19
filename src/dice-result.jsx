import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { useReducedMotion } from 'motion/react';
import DecryptedText from './DecryptedText.jsx';
import { DICE_DECRYPTED_TEXT_BASE_PROPS } from './dice-result.config.js';
const rendererCache = new WeakMap();

const suppressRendererErrors =
  typeof globalThis !== 'undefined' && typeof globalThis.jest !== 'undefined';

function reportRendererError(message, error) {
  if (suppressRendererErrors) return;
  // Suppress noisy logging when the renderer cannot initialise (e.g. in tests).
  // If this ever happens in production it will silently fall back to plain text.
}

function createFallbackRenderer(mountNode) {
  const fallback = {
    render(value) {
      // React failed to initialise; fall back to directly setting text content.
      // eslint-disable-next-line no-param-reassign
      mountNode.textContent = value == null ? '' : String(value);
    },
    unmount() {
      rendererCache.delete(mountNode);
      if (mountNode.__diceResultRenderer === fallback) {
        delete mountNode.__diceResultRenderer;
      }
      if (mountNode.__diceResultRoot) {
        delete mountNode.__diceResultRoot;
      }
    },
  };
  return fallback;
}

export function DiceResultContent({ value, playIndex }) {
  const prefersReducedMotion = useReducedMotion();
  const text = useMemo(() => (value == null ? '' : String(value)), [value]);

  if (prefersReducedMotion) {
    return React.createElement(
      'span',
      { className: 'dice-result-decrypted', 'data-play-index': playIndex },
      React.createElement('span', { className: 'dice-result-decrypted__char' }, text)
    );
  }

  return React.createElement(DecryptedText, {
    ...DICE_DECRYPTED_TEXT_BASE_PROPS,
    key: playIndex,
    text,
    'data-play-index': playIndex
  });
}

export function ensureDiceResultRenderer(mountNode) {
  if (!mountNode) return null;

  const existingRenderer = mountNode.__diceResultRenderer;
  if (existingRenderer) {
    rendererCache.set(mountNode, existingRenderer);
    return existingRenderer;
  }

  if (rendererCache.has(mountNode)) {
    return rendererCache.get(mountNode);
  }

  let root;
  try {
    root = mountNode.__diceResultRoot || createRoot(mountNode);
  } catch (err) {
    reportRendererError('Failed to initialise dice result renderer', err);
    const fallback = createFallbackRenderer(mountNode);
    rendererCache.set(mountNode, fallback);
    mountNode.__diceResultRenderer = fallback;
    return fallback;
  }
  const renderer = {
    render(value, playIndex) {
      try {
        root.render(
          React.createElement(DiceResultContent, { value, playIndex })
        );
      } catch (err) {
        reportRendererError('Failed to render dice result', err);
        const fallback = createFallbackRenderer(mountNode);
        fallback.render(value, playIndex);
        rendererCache.set(mountNode, fallback);
        mountNode.__diceResultRenderer = fallback;
        delete mountNode.__diceResultRoot;
      }
    },
    unmount() {
      try {
        root.unmount();
      } catch (err) {
        reportRendererError('Failed to unmount dice result renderer', err);
      }
      rendererCache.delete(mountNode);
      delete mountNode.__diceResultRenderer;
      delete mountNode.__diceResultRoot;
    }
  };

  rendererCache.set(mountNode, renderer);
  mountNode.__diceResultRenderer = renderer;
  mountNode.__diceResultRoot = root;
  return renderer;
}
