import React, { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';

const styles = {
  wrapper: {
    whiteSpace: 'pre-wrap',
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'inherit',
    justifyContent: 'inherit',
    gap: 'inherit',
    letterSpacing: 'inherit',
    overflow: 'hidden',
    flex: '0 0 auto'
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0,0,0,0)',
    border: 0
  },
  measure: {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre',
    display: 'inline-flex',
    alignItems: 'inherit',
    justifyContent: 'inherit',
    gap: 'inherit',
    letterSpacing: 'inherit'
  }
};

export default function DecryptedText({
  text,
  speed = 50,
  maxIterations = 10,
  sequential = false,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+',
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'hover',
  ...props
}) {
  const [displayText, setDisplayText] = useState(text);
  const [measurementText, setMeasurementText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const [isScrambling, setIsScrambling] = useState(false);
  const [revealedIndices, setRevealedIndices] = useState(new Set());
  const [hasAnimated, setHasAnimated] = useState(false);
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const updateDimensions = useCallback(() => {
    const measureNode = measureRef.current;
    if (!measureNode) return;

    const rect = measureNode.getBoundingClientRect();
    const nextDimensions = {
      width: Math.ceil(rect.width * 1000) / 1000,
      height: Math.ceil(rect.height * 1000) / 1000
    };

    setDimensions(prev => {
      if (
        Math.abs(prev.width - nextDimensions.width) < 0.5 &&
        Math.abs(prev.height - nextDimensions.height) < 0.5
      ) {
        return prev;
      }
      return nextDimensions;
    });
  }, []);

  const updateMeasurementText = useCallback(() => {
    if (typeof document === 'undefined' || useOriginalCharsOnly) {
      setMeasurementText(text);
      return;
    }

    const containerNode = containerRef.current;
    if (!containerNode) {
      setMeasurementText(text);
      return;
    }

    const candidateChars = Array.from(
      new Set(
        characters
          .split('')
          .filter(char => char.trim() !== '')
      )
    );

    if (!candidateChars.length) {
      setMeasurementText(text);
      return;
    }

    const measurement = document.createElement('span');
    measurement.style.position = 'absolute';
    measurement.style.visibility = 'hidden';
    measurement.style.pointerEvents = 'none';
    measurement.style.whiteSpace = 'pre';
    measurement.style.display = 'inline-flex';
    measurement.style.alignItems = 'inherit';
    measurement.style.justifyContent = 'inherit';
    measurement.style.gap = 'inherit';
    measurement.style.letterSpacing = 'inherit';

    const computedStyle = window.getComputedStyle(containerNode);
    const styleProperties = [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'fontVariant',
      'fontStretch',
      'letterSpacing',
      'textTransform',
      'textRendering',
      'lineHeight'
    ];

    styleProperties.forEach(prop => {
      if (computedStyle[prop]) {
        measurement.style[prop] = computedStyle[prop];
      }
    });

    document.body.appendChild(measurement);

    let widestChar = candidateChars[0];
    let maxWidth = 0;

    candidateChars.forEach(char => {
      measurement.textContent = char;
      const width = measurement.getBoundingClientRect().width;
      if (width > maxWidth) {
        maxWidth = width;
        widestChar = char;
      }
    });

    document.body.removeChild(measurement);

    const fallbackChar = widestChar || 'W';
    const computedMeasurement = text
      .split('')
      .map(char => (char === ' ' ? ' ' : fallbackChar))
      .join('');

    setMeasurementText(computedMeasurement);
  }, [characters, text, useOriginalCharsOnly]);

  useEffect(() => {
    setDisplayText(text);
    setMeasurementText(text);
  }, [text]);

  useLayoutEffect(() => {
    updateMeasurementText();
    updateDimensions();

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const node = measureRef.current;
    if (!node) return undefined;

    const observer = new ResizeObserver(() => updateDimensions());
    observer.observe(node);

    return () => observer.disconnect();
  }, [text, updateDimensions, updateMeasurementText]);

  useEffect(() => {
    if (!document.fonts || typeof document.fonts.addEventListener !== 'function') return undefined;

    const handleFontEvent = () => {
      updateMeasurementText();
      updateDimensions();
    };
    document.fonts.addEventListener('loadingdone', handleFontEvent);
    document.fonts.addEventListener('loadingerror', handleFontEvent);

    return () => {
      document.fonts.removeEventListener('loadingdone', handleFontEvent);
      document.fonts.removeEventListener('loadingerror', handleFontEvent);
    };
  }, [updateDimensions, updateMeasurementText]);

  useEffect(() => {
    let interval;
    let currentIteration = 0;

    const getNextIndex = revealedSet => {
      const textLength = text.length;
      switch (revealDirection) {
        case 'start':
          return revealedSet.size;
        case 'end':
          return textLength - 1 - revealedSet.size;
        case 'center': {
          const middle = Math.floor(textLength / 2);
          const offset = Math.floor(revealedSet.size / 2);
          const nextIndex = revealedSet.size % 2 === 0 ? middle + offset : middle - offset - 1;

          if (nextIndex >= 0 && nextIndex < textLength && !revealedSet.has(nextIndex)) {
            return nextIndex;
          }

          for (let i = 0; i < textLength; i++) {
            if (!revealedSet.has(i)) return i;
          }
          return 0;
        }
        default:
          return revealedSet.size;
      }
    };

    const availableChars = useOriginalCharsOnly
      ? Array.from(new Set(text.split(''))).filter(char => char !== ' ')
      : characters.split('');

    const shuffleText = (originalText, currentRevealed) => {
      if (useOriginalCharsOnly) {
        const positions = originalText.split('').map((char, i) => ({
          char,
          isSpace: char === ' ',
          index: i,
          isRevealed: currentRevealed.has(i)
        }));

        const nonSpaceChars = positions.filter(p => !p.isSpace && !p.isRevealed).map(p => p.char);

        for (let i = nonSpaceChars.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [nonSpaceChars[i], nonSpaceChars[j]] = [nonSpaceChars[j], nonSpaceChars[i]];
        }

        let charIndex = 0;
        return positions
          .map(p => {
            if (p.isSpace) return ' ';
            if (p.isRevealed) return originalText[p.index];
            return nonSpaceChars[charIndex++];
          })
          .join('');
      }

      return originalText
        .split('')
        .map((char, i) => {
          if (char === ' ') return ' ';
          if (currentRevealed.has(i)) return originalText[i];
          return availableChars[Math.floor(Math.random() * availableChars.length)];
        })
        .join('');
    };

    if (isHovering) {
      setIsScrambling(true);
      interval = setInterval(() => {
        setRevealedIndices(prevRevealed => {
          if (sequential) {
            if (prevRevealed.size < text.length) {
              const nextIndex = getNextIndex(prevRevealed);
              const newRevealed = new Set(prevRevealed);
              newRevealed.add(nextIndex);
              setDisplayText(shuffleText(text, newRevealed));
              return newRevealed;
            }

            clearInterval(interval);
            setIsScrambling(false);
            return prevRevealed;
          }

          setDisplayText(shuffleText(text, prevRevealed));
          currentIteration++;
          if (currentIteration >= maxIterations) {
            clearInterval(interval);
            setIsScrambling(false);
            setDisplayText(text);
          }
          return prevRevealed;
        });
      }, speed);
    } else {
      setDisplayText(text);
      setRevealedIndices(new Set());
      setIsScrambling(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isHovering, text, speed, maxIterations, sequential, revealDirection, characters, useOriginalCharsOnly]);

  useEffect(() => {
    if (animateOn !== 'view' && animateOn !== 'both') return;

    const observerCallback = entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !hasAnimated) {
          setIsHovering(true);
          setHasAnimated(true);
        }
      });
    };

    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    const currentRef = containerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [animateOn, hasAnimated]);

  const hoverProps =
    animateOn === 'hover' || animateOn === 'both'
      ? {
          onMouseEnter: () => setIsHovering(true),
          onMouseLeave: () => setIsHovering(false),
          onFocus: () => setIsHovering(true),
          onBlur: () => setIsHovering(false)
        }
      : {};

  const wrapperStyle = {
    ...styles.wrapper,
    minWidth: dimensions.width ? `${dimensions.width}px` : undefined,
    minHeight: dimensions.height ? `${dimensions.height}px` : undefined,
    width: dimensions.width ? `${dimensions.width}px` : undefined,
    height: dimensions.height ? `${dimensions.height}px` : undefined,
    maxWidth: dimensions.width ? `${dimensions.width}px` : undefined,
    maxHeight: dimensions.height ? `${dimensions.height}px` : undefined
  };

  return (
    <motion.span
      className={parentClassName}
      ref={containerRef}
      style={wrapperStyle}
      {...hoverProps}
      {...props}
    >
      <span
        aria-hidden="true"
        ref={measureRef}
        className={parentClassName}
        style={styles.measure}
      >
        {measurementText.split('').map((char, index) => (
          <span key={`measure-${index}`} className={className}>
            {char}
          </span>
        ))}
      </span>
      <span style={styles.srOnly}>{text}</span>

      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'inherit',
          justifyContent: 'inherit',
          gap: 'inherit',
          letterSpacing: 'inherit'
        }}
      >
        {displayText.split('').map((char, index) => {
          const isRevealedOrDone = revealedIndices.has(index) || !isScrambling || !isHovering;

          return (
            <span key={index} className={isRevealedOrDone ? className : encryptedClassName}>
              {char}
            </span>
          );
        })}
      </span>
    </motion.span>
  );
}
