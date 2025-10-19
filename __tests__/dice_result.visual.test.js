import {
  DICE_DECRYPTED_TEXT_BASE_PROPS,
  DICE_DIGIT_CHARACTERS
} from '../src/dice-result.config.js';

describe('DiceResult cascade visual regression', () => {
  it('captures cascade styling for dice output', () => {
    const sampleValue = '987';
    const markup = `<span class="${DICE_DECRYPTED_TEXT_BASE_PROPS.parentClassName}" data-sequential="${DICE_DECRYPTED_TEXT_BASE_PROPS.sequential}" data-reveal-direction="${DICE_DECRYPTED_TEXT_BASE_PROPS.revealDirection}" data-speed="${DICE_DECRYPTED_TEXT_BASE_PROPS.speed}" data-max-iterations="${DICE_DECRYPTED_TEXT_BASE_PROPS.maxIterations}" data-animate-on="${DICE_DECRYPTED_TEXT_BASE_PROPS.animateOn}" data-play-index="2"><span class="${DICE_DECRYPTED_TEXT_BASE_PROPS.className}" data-encrypted-class="${DICE_DECRYPTED_TEXT_BASE_PROPS.encryptedClassName}" data-text="${sampleValue}">${sampleValue}</span></span>`;

    expect(markup).toBe(
      '<span class="dice-result-decrypted" data-sequential="true" data-reveal-direction="end" data-speed="30" data-max-iterations="18" data-animate-on="view" data-play-index="2"><span class="dice-result-decrypted__char" data-encrypted-class="dice-result-decrypted__char--scrambling" data-text="987">987</span></span>'
    );
    expect(DICE_DECRYPTED_TEXT_BASE_PROPS.characters).toBe(DICE_DIGIT_CHARACTERS);
  });
});
