import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import DecryptedText from './DecryptedText.jsx';
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
      if (mountNode.__diceResultOptions) {
        delete mountNode.__diceResultOptions;
      }
    },
  };
  return fallback;
}

function DiceResultContent({ value, playIndex }) {
  const text = useMemo(() => (value == null ? '' : String(value)), [value]);

  return (
    <span className="dice-result__shell">
      <span className="dice-result__value">
        <DecryptedText
          key={playIndex}
          text={text}
          parentClassName="dice-result-decrypted"
          className="dice-result-decrypted__char"
          data-play-index={playIndex}
        />
      </span>
    </span>
  );
}

export function ensureDiceResultRenderer(mountNode, baseOptions = {}) {
  if (!mountNode) return null;

  const existingRenderer = mountNode.__diceResultRenderer;
  if (existingRenderer) {
    rendererCache.set(mountNode, existingRenderer);
    mountNode.__diceResultOptions = baseOptions;
    return existingRenderer;
  }

  if (rendererCache.has(mountNode)) {
    const cached = rendererCache.get(mountNode);
    mountNode.__diceResultOptions = baseOptions;
    return cached;
  }

  let root;
  try {
    root = mountNode.__diceResultRoot || createRoot(mountNode);
  } catch (err) {
    reportRendererError('Failed to initialise dice result renderer', err);
    const fallback = createFallbackRenderer(mountNode);
    rendererCache.set(mountNode, fallback);
    mountNode.__diceResultRenderer = fallback;
    mountNode.__diceResultOptions = baseOptions;
    return fallback;
  }
  const renderer = {
    render(value, playIndex, _renderOptions = {}) {
      try {
        void _renderOptions;
        root.render(
          <DiceResultContent value={value} playIndex={playIndex} />
        );
      } catch (err) {
        reportRendererError('Failed to render dice result', err);
        const fallback = createFallbackRenderer(mountNode);
        fallback.render(value, playIndex);
        rendererCache.set(mountNode, fallback);
        mountNode.__diceResultRenderer = fallback;
        delete mountNode.__diceResultRoot;
        mountNode.__diceResultOptions = baseOptions;
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
      delete mountNode.__diceResultOptions;
    }
  };

  rendererCache.set(mountNode, renderer);
  mountNode.__diceResultRenderer = renderer;
  mountNode.__diceResultRoot = root;
  mountNode.__diceResultOptions = baseOptions;
  return renderer;
}
