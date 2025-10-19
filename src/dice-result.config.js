export const DICE_DIGIT_CHARACTERS = '0123456789';

export const DICE_DECRYPTED_TEXT_BASE_PROPS = Object.freeze({
  speed: 30,
  maxIterations: 18,
  characters: DICE_DIGIT_CHARACTERS,
  useOriginalCharsOnly: true,
  animateOn: 'view',
  parentClassName: 'dice-result-decrypted',
  className: 'dice-result-decrypted__char',
  encryptedClassName: 'dice-result-decrypted__char--scrambling',
  sequential: true,
  revealDirection: 'end'
});
