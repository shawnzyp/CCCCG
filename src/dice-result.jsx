import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { useReducedMotion } from 'motion/react';
import DecryptedText from './DecryptedText.jsx';

const DIGIT_CHARACTERS = '0123456789';
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

function parseBooleanString(value) {
  if (value == null) return null;
  const normalised = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalised)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalised)) return true;
  return null;
}

function resolveCascadePreference(mountNode, ...optionSources) {
  for (const options of optionSources) {
    if (options && typeof options.cascade === 'boolean') {
      return options.cascade;
    }
  }

  if (mountNode && mountNode.dataset) {
    const parsedDataset = parseBooleanString(mountNode.dataset.diceCascade);
    if (parsedDataset != null) {
      return parsedDataset;
    }
  }

  if (typeof globalThis !== 'undefined') {
    if (
      typeof globalThis.__CCCCG_ENABLE_DICE_CASCADE__ !== 'undefined' &&
      globalThis.__CCCCG_ENABLE_DICE_CASCADE__ != null
    ) {
      return Boolean(globalThis.__CCCCG_ENABLE_DICE_CASCADE__);
    }
    if (typeof globalThis.__CCCCG_DISABLE_DICE_CASCADE__ === 'boolean') {
      return !globalThis.__CCCCG_DISABLE_DICE_CASCADE__;
    }
  }

  return true;
}

function DiceResultContent({ value, playIndex, cascadeEnabled }) {
  const prefersReducedMotion = useReducedMotion();
  const text = useMemo(() => (value == null ? '' : String(value)), [value]);

  if (prefersReducedMotion) {
    return (
      <span className="dice-result-decrypted" data-play-index={playIndex}>
        <span className="dice-result-decrypted__char">{text}</span>
      </span>
    );
  }

  const shouldCascade = cascadeEnabled !== false;

  const decryptedTextProps = {
    key: playIndex,
    text,
    speed: shouldCascade ? 90 : 110,
    maxIterations: shouldCascade ? 22 : 18,
    characters: DIGIT_CHARACTERS,
    useOriginalCharsOnly: true,
    animateOn: 'view',
    parentClassName: 'dice-result-decrypted',
    className: 'dice-result-decrypted__char',
    encryptedClassName: 'dice-result-decrypted__char--scrambling',
  };

  if (shouldCascade) {
    decryptedTextProps.sequential = true;
    decryptedTextProps.revealDirection = 'end';
  }

  return <DecryptedText {...decryptedTextProps} />;
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
    render(value, playIndex, renderOptions = {}) {
      try {
        const cascadeEnabled = resolveCascadePreference(
          mountNode,
          renderOptions,
          mountNode.__diceResultOptions
        );
        root.render(
          <DiceResultContent
            value={value}
            playIndex={playIndex}
            cascadeEnabled={cascadeEnabled}
          />
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
