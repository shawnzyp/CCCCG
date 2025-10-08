import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { useReducedMotion } from 'motion/react';
import DecryptedText from './DecryptedText.jsx';

const DIGIT_CHARACTERS = '0123456789';
const rendererCache = new WeakMap();

function DiceResultContent({ value, playIndex }) {
  const prefersReducedMotion = useReducedMotion();
  const text = useMemo(() => (value == null ? '' : String(value)), [value]);

  if (prefersReducedMotion) {
    return (
      <span className="dice-result-decrypted" data-play-index={playIndex}>
        <span className="dice-result-decrypted__char">{text}</span>
      </span>
    );
  }

  return (
    <DecryptedText
      key={playIndex}
      text={text}
      speed={40}
      maxIterations={12}
      characters={DIGIT_CHARACTERS}
      useOriginalCharsOnly
      animateOn="view"
      parentClassName="dice-result-decrypted"
      className="dice-result-decrypted__char"
      encryptedClassName="dice-result-decrypted__char--scrambling"
    />
  );
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

  const root = mountNode.__diceResultRoot || createRoot(mountNode);
  const renderer = {
    render(value, playIndex) {
      root.render(<DiceResultContent value={value} playIndex={playIndex} />);
    },
    unmount() {
      root.unmount();
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
