import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="abil-grid"></div>
    <div id="saves"></div>
    <div id="skills"></div>
    <div id="powers"></div>
    <input id="power-dc-formula" value="Proficiency" />
    <label><input type="radio" name="power-dc-mode" id="power-dc-mode-simple" value="Simple" /></label>
    <label><input type="radio" name="power-dc-mode" id="power-dc-mode-proficiency" value="Proficiency" checked /></label>
    <select id="power-save-ability"><option value="wis">wis</option></select>
    <input id="power-save-dc" />
    <div id="sigs"></div>
    <div id="weapons"></div>
    <div id="armors"></div>
    <div id="items"></div>
    <div id="statuses"></div>
    <div id="ongoing-effects"></div>
    <select id="alignment"><option value="Guardian (Neutral Light)">Guardian (Neutral Light)</option></select>
    <ul id="alignment-perks"></ul>
    <button id="add-weapon"></button>
    <button id="add-armor"></button>
    <button id="add-item"></button>
    <button id="add-power"></button>
    <button id="add-sig"></button>
    <progress id="hp-bar" value="10" max="10"></progress>
    <span id="hp-pill"></span>
    <input id="hp-amt" value="0" />
    <input id="hp-temp" value="0" />
    <button id="hp-dmg"></button>
    <button id="hp-heal"></button>
    <progress id="sp-bar" value="5" max="5"></progress>
    <span id="sp-pill"></span>
    <input id="sp-temp" value="0" />
    <button data-sp="-1" id="sp-use"></button>
    <button id="sp-full"></button>
    <fieldset id="resonance-points">
      <output id="rp-value">0</output>
      <div class="rp-track">
        <button id="rp-dec"></button>
        <button class="rp-dot" data-rp="1"></button>
        <button class="rp-dot" data-rp="2"></button>
        <button class="rp-dot" data-rp="3"></button>
        <button class="rp-dot" data-rp="4"></button>
        <button class="rp-dot" data-rp="5"></button>
        <button id="rp-inc"></button>
        <div class="rp-bank">
          <span class="rp-dot rp-bank-dot" data-bank="1"></span>
          <span class="rp-dot rp-bank-dot" data-bank="2"></span>
        </div>
      </div>
      <input type="checkbox" id="rp-trigger" />
      <button id="rp-clear-aftermath"></button>
      <span id="rp-surge-state"></span>
      <span id="rp-tag-active"></span>
      <span id="rp-tag-aftermath"></span>
    </fieldset>
    <div id="campaign-log"></div>
    <textarea id="campaign-entry"></textarea>
    <button id="campaign-add"></button>
    <div id="log-action"></div>
    <div id="full-log-action"></div>
    <button id="btn-log"></button>
    <button id="log-full"></button>
    <button id="btn-campaign"></button>
    <input id="cap-check" type="checkbox" />
    <span id="cap-status">Available</span>
    <input id="xp" value="0" />
    <progress id="xp-bar"></progress>
    <span id="xp-pill"></span>
    <input id="tier" />
    <span id="omni-rep-tier"></span>
    <progress id="omni-rep-bar"></progress>
    <p id="omni-rep-perk"></p>
    <button id="omni-rep-gain"></button>
    <button id="omni-rep-lose"></button>
    <input type="hidden" id="omni-rep" value="200" />
    <div id="toast"></div>
    <div id="save-animation"></div>
    <button id="btn-save"></button>
    <input id="superhero" />
    <input id="secret" />
  `;
  const realGet = document.getElementById.bind(document);
  document.getElementById = (id) =>
    realGet(id) || {
      innerHTML: '',
      value: '',
      style: { setProperty: () => {}, getPropertyValue: () => '' },
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      setAttribute: () => {},
      getAttribute: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      contains: () => false,
      add: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      click: () => {},
      textContent: '',
      disabled: false,
      checked: false,
      hidden: false,
    };
}

describe('action log records key events', () => {
  beforeEach(async () => {
    jest.resetModules();
    localStorage.clear();
    setupDom();
    window.matchMedia = jest.fn().mockReturnValue({ matches: true, addListener: () => {}, removeListener: () => {} });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => null,
    });
    window.confirm = jest.fn(() => true);
    await import('../scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
  });

  test('logs level changes', () => {
    const xp = document.getElementById('xp');
    // initialize XP processing
    xp.dispatchEvent(new Event('input'));
    xp.value = '2000';
    xp.dispatchEvent(new Event('input'));
    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.includes('Level:'))).toBe(true);
  });

  test('logs faction reputation rank changes', () => {
    const rep = document.getElementById('omni-rep');
    rep.value = '295';
    document.getElementById('omni-rep-gain').click();
    const log = JSON.parse(localStorage.getItem('action-log'));
    const last = log[log.length - 1];
    expect(last.text).toBe('O.M.N.I. Reputation: Neutral -> Recognized');
  });

  test('logs Cinematic Action Point usage', () => {
    const cap = document.getElementById('cap-check');
    cap.checked = true;
    cap.dispatchEvent(new Event('change'));
    const log = JSON.parse(localStorage.getItem('action-log'));
    const last = log[log.length - 1];
    expect(last.text).toBe('Cinematic Action Point: Available -> Used');
  });

  test('logs perk usage', () => {
    const cb = document.querySelector('#alignment-perks input');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.includes('perk used'))).toBe(true);
  });

  test('logs RP point changes', () => {
    document.getElementById('rp-inc').click();
    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.startsWith('RP:'))).toBe(true);
  });

  test('logs HP and SP changes', () => {
    const hpAmt = document.getElementById('hp-amt');
    hpAmt.value = '2';
    document.getElementById('hp-dmg').click();
    document.getElementById('sp-use').click();
    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.includes('HP lost 2'))).toBe(true);
    expect(log.some((e) => e.text.includes('SP lost 1'))).toBe(true);
  });

  test('logs status effect changes', () => {
    const cb = document.querySelector('#statuses input');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.includes('Status effect gained'))).toBe(true);
  });

  test('logs gear and ability usage', () => {
    document.getElementById('add-weapon').click();
    const weaponCard = document.querySelector('#weapons .card');
    weaponCard.querySelector('[data-f="name"]').value = 'Sword';
    weaponCard.querySelector('button').click();

    document.getElementById('add-power').click();
    const presetMenu = document.querySelector('[data-role="power-preset-menu"] button');
    if (presetMenu) presetMenu.click();
    const powerCard = document.querySelector('#powers .power-card');
    const powerNameInput = powerCard.querySelector('input[placeholder="Power Name"]');
    powerNameInput.value = 'Blast';
    powerNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    const usePowerButton = Array.from(powerCard.querySelectorAll('button.btn-sm')).find((btn) => btn.textContent === 'Use Power');
    expect(usePowerButton).toBeTruthy();
    usePowerButton.click();

    document.getElementById('add-sig').click();
    const sigCard = document.querySelector('#sigs .card');
    sigCard.querySelector('[data-f="name"]').value = 'Finisher';
    sigCard.querySelector('button').click();

    document.getElementById('add-item').click();
    const itemCard = document.querySelector('#items .card');
    itemCard.querySelector('[data-f="name"]').value = 'Potion';
    itemCard.querySelector('button[data-act="del"]').click();

    document.getElementById('add-armor').click();
    const armorCard = document.querySelector('#armors .card');
    armorCard.querySelector('[data-f="name"]').value = 'Shield';
    const chk = armorCard.querySelector('input[type="checkbox"]');
    chk.checked = true;
    chk.dispatchEvent(new Event('change'));

    const log = JSON.parse(localStorage.getItem('action-log'));
    expect(log.some((e) => e.text.includes('Weapon used: Sword'))).toBe(true);
    expect(log.some((e) => e.text.includes('Power used: Blast'))).toBe(true);
    expect(log.some((e) => e.text.includes('Signature move used: Finisher'))).toBe(true);
    expect(log.some((e) => e.text.includes('Item removed: Potion'))).toBe(true);
    expect(log.some((e) => e.text.includes('Armor equipped: Shield'))).toBe(true);
  });
});

