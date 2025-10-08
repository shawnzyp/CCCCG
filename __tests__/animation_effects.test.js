import { jest } from '@jest/globals';
import {
  configureAnimationEffects,
  playDamageAnimation,
  playHealAnimation,
  playDownAnimation,
  playDeathAnimation,
} from '../scripts/animation-effects.js';

describe('animation effect helpers', () => {
  let elements;
  let playEffect;

  const createElement = () => {
    const el = document.createElement('div');
    el.hidden = true;
    return el;
  };

  beforeEach(() => {
    playEffect = jest.fn();
    elements = {
      'damage-animation': createElement(),
      'heal-animation': createElement(),
      'down-animation': createElement(),
      'death-animation': createElement(),
    };
    configureAnimationEffects({
      isEnabled: () => true,
      getElement: id => elements[id],
      playEffect,
    });
  });

  test.each([
    ['playDamageAnimation', 'damage-animation', 'damage', () => playDamageAnimation(12)],
    ['playHealAnimation', 'heal-animation', 'heal', () => playHealAnimation(5)],
    ['playDownAnimation', 'down-animation', 'down', () => playDownAnimation()],
    ['playDeathAnimation', 'death-animation', 'death', () => playDeathAnimation()],
  ])('%s triggers playEffect', async (_name, elementId, expectedCue, invoke) => {
    const element = elements[elementId];
    const promise = invoke();
    expect(playEffect).toHaveBeenCalledWith(expectedCue);
    element.dispatchEvent(new Event('animationend'));
    await promise;
    expect(element.hidden).toBe(true);
  });
});
