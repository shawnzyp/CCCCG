function defaultGetElement(id){
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

let isAnimationEnabled = () => true;
let findAnimationElement = defaultGetElement;
let triggerEffect = () => {};

function configureAnimationEffects({ isEnabled = () => true, getElement = defaultGetElement, playEffect = () => {} } = {}){
  isAnimationEnabled = typeof isEnabled === 'function' ? isEnabled : () => Boolean(isEnabled);
  findAnimationElement = typeof getElement === 'function' ? getElement : defaultGetElement;
  triggerEffect = typeof playEffect === 'function' ? playEffect : () => {};
}

function runAnimation(element){
  element.classList.add('show');
  return new Promise((resolve) => {
    const done = () => {
      element.classList.remove('show');
      element.hidden = true;
      element.removeEventListener('animationend', done);
      resolve();
    };
    element.addEventListener('animationend', done);
  });
}

function startAnimation(id, { textContent, effectName } = {}){
  if (!isAnimationEnabled()) return Promise.resolve();
  const element = findAnimationElement(id);
  if (!element) return Promise.resolve();
  if (typeof textContent === 'string') {
    element.textContent = textContent;
  }
  element.hidden = false;
  if (effectName) {
    triggerEffect(effectName);
  }
  return runAnimation(element);
}

function playDamageAnimation(amount){
  return startAnimation('damage-animation', {
    textContent: String(amount),
    effectName: 'damage',
  });
}

function playHealAnimation(amount){
  const prefix = amount > 0 ? '+' : '';
  return startAnimation('heal-animation', {
    textContent: `${prefix}${amount}`,
    effectName: 'heal',
  });
}

function playDownAnimation(){
  return startAnimation('down-animation', { effectName: 'down' });
}

function playDeathAnimation(){
  return startAnimation('death-animation', { effectName: 'death' });
}

function playSaveAnimation(){
  return startAnimation('save-animation', { effectName: 'save' });
}

function playCoinAnimation(result){
  return startAnimation('coin-animation', {
    textContent: result,
    effectName: 'coin',
  });
}

function playSPAnimation(amount){
  const prefix = amount > 0 ? '+' : '';
  return startAnimation('sp-animation', {
    textContent: `${prefix}${amount}`,
    effectName: 'sp',
  });
}

function playLoadAnimation(){
  return startAnimation('load-animation', { effectName: 'load' });
}

export {
  configureAnimationEffects,
  playDamageAnimation,
  playHealAnimation,
  playDownAnimation,
  playDeathAnimation,
  playSaveAnimation,
  playCoinAnimation,
  playSPAnimation,
  playLoadAnimation,
};
