import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo
} from 'react';
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
  const measurementCacheRef = useRef(new Map());
  const measurementStringCacheRef = useRef(new Map());

  const textCharacters = useMemo(() => text.split(''), [text]);
  const filteredCandidateChars = useMemo(
    () =>
      Array.from(
        new Set(
          characters
            .split('')
            .filter(char => char.trim() !== '')
        )
      ),
    [characters]
  );
  const randomCharPool = useMemo(() => characters.split(''), [characters]);
  const nonSpaceIndices = useMemo(
    () =>
      textCharacters.reduce((acc, char, index) => {
        if (char !== ' ') acc.push(index);
        return acc;
      }, []),
    [textCharacters]
  );

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
    if (typeof document === 'undefined' || typeof window === 'undefined' || useOriginalCharsOnly) {
      setMeasurementText(prev => (prev === text ? prev : text));
      return;
    }

    const containerNode = containerRef.current;
    if (!containerNode) {
      setMeasurementText(prev => (prev === text ? prev : text));
      return;
    }

    if (!filteredCandidateChars.length) {
      setMeasurementText(prev => (prev === text ? prev : text));
      return;
    }

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

    const styleKey = styleProperties
      .map(prop => `${prop}:${computedStyle[prop] || ''}`)
      .join(';');
    const cacheKey = `${styleKey}|${filteredCandidateChars.join('')}`;

    let fallbackChar = measurementCacheRef.current.get(cacheKey);

    if (!fallbackChar) {
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

      styleProperties.forEach(prop => {
        if (computedStyle[prop]) {
          measurement.style[prop] = computedStyle[prop];
        }
      });

      document.body.appendChild(measurement);

      let widestChar = filteredCandidateChars[0];
      let maxWidth = 0;

      filteredCandidateChars.forEach(char => {
        measurement.textContent = char;
        const width = measurement.getBoundingClientRect().width;
        if (width > maxWidth) {
          maxWidth = width;
          widestChar = char;
        }
      });

      document.body.removeChild(measurement);

      fallbackChar = widestChar || 'W';
      measurementCacheRef.current.set(cacheKey, fallbackChar);
    }

    const measurementKey = `${fallbackChar}|${text}`;
    let computedMeasurement = measurementStringCacheRef.current.get(measurementKey);

    if (!computedMeasurement) {
      computedMeasurement = textCharacters
        .map(char => (char === ' ' ? ' ' : fallbackChar))
        .join('');
      measurementStringCacheRef.current.set(measurementKey, computedMeasurement);
    }

    setMeasurementText(prev => (prev === computedMeasurement ? prev : computedMeasurement));
  }, [
    filteredCandidateChars,
    text,
    textCharacters,
    useOriginalCharsOnly
  ]);

  useEffect(() => {
    setDisplayText(text);
    setMeasurementText(prev => (prev === text ? prev : text));
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
      const textLength = textCharacters.length;
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

    const shuffleText = currentRevealed => {
      if (useOriginalCharsOnly) {
        if (!nonSpaceIndices.length) {
          return text;
        }

        const availableChars = [];
        nonSpaceIndices.forEach(index => {
          if (!currentRevealed.has(index)) {
            availableChars.push(textCharacters[index]);
          }
        });

        for (let i = availableChars.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [availableChars[i], availableChars[j]] = [availableChars[j], availableChars[i]];
        }

        let charIndex = 0;
        return textCharacters
          .map((char, idx) => {
            if (char === ' ') return ' ';
            if (currentRevealed.has(idx)) return char;
            return availableChars[charIndex++] ?? char;
          })
          .join('');
      }

      if (!randomCharPool.length) {
        return text;
      }

      return textCharacters
        .map((char, i) => {
          if (char === ' ') return ' ';
          if (currentRevealed.has(i)) return char;
          return randomCharPool[Math.floor(Math.random() * randomCharPool.length)];
        })
        .join('');
    };

    if (isHovering) {
      setIsScrambling(true);
      interval = setInterval(() => {
        setRevealedIndices(prevRevealed => {
          if (sequential) {
            if (prevRevealed.size < textCharacters.length) {
              const nextIndex = getNextIndex(prevRevealed);
              const newRevealed = new Set(prevRevealed);
              newRevealed.add(nextIndex);
              setDisplayText(shuffleText(newRevealed));
              return newRevealed;
            }

            clearInterval(interval);
            setIsScrambling(false);
            return prevRevealed;
          }

          setDisplayText(shuffleText(prevRevealed));
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
  }, [
    isHovering,
    maxIterations,
    nonSpaceIndices,
    randomCharPool,
    revealDirection,
    sequential,
    speed,
    text,
    textCharacters,
    useOriginalCharsOnly
  ]);

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
