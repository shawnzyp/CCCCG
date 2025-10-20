import React, { useMemo } from 'react';

function NormalisedCharacter({ char, className }) {
  const displayChar = char === ' ' ? '\u00A0' : char;
  const dataChar = char === ' ' ? 'space' : undefined;

  return (
    <span className={className} data-char={dataChar}>
      {displayChar}
    </span>
  );
}

export default function DecryptedText({
  text = '',
  parentClassName = '',
  className = '',
  encryptedClassName, // kept for compatibility with previous API surface
  ...rest
}) {
  const characters = useMemo(() => String(text).split(''), [text]);

  return (
    <span className={parentClassName} {...rest}>
      {characters.map((char, index) => (
        <NormalisedCharacter
          // eslint-disable-next-line react/no-array-index-key
          key={`${char}-${index}`}
          char={char}
          className={className || encryptedClassName || ''}
        />
      ))}
    </span>
  );
}
