import { jest } from '@jest/globals';

function setupDom() {
  document.body.innerHTML = `
    <div id="abil-grid"></div>
    <div id="saves"></div>
    <div id="skills"></div>
    <div id="powers"></div>
    <div id="sigs"></div>
    <div id="weapons"></div>
    <div id="armors"></div>
    <div id="items"></div>
    <div id="campaign-log"></div>
    <div id="toast"></div>
    <div id="save-animation"></div>
    <select id="str"></select>
    <select id="dex"></select>
    <select id="con"></select>
    <select id="int"></select>
    <select id="wis"></select>
    <select id="cha"></select>
    <input id="tc" />
    <input id="pp" />
    <input id="hp" />
    <input id="initiative" />
    <input id="credits" value="0" />
  `;
  const realGet = document.getElementById.bind(document);
  document.getElementById = (id) => realGet(id) || {
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

describe('armor slot conflicts', () => {
  beforeEach(() => {
    jest.resetModules();
    setupDom();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null });
    window.confirm = jest.fn(() => false);
    console.error = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    delete window.confirm;
  });

  test('equipping a second body armor unequips the first', async () => {
    const { addEntryToSheet } = await import('../scripts/main.js');

    addEntryToSheet({}, {
      cardInfoOverride: {
        kind: 'armor',
        listId: 'armors',
        data: { name: 'Mark I Battlesuit', slot: 'Body', bonus: 2, equipped: true },
      },
    });

    addEntryToSheet({}, {
      cardInfoOverride: {
        kind: 'armor',
        listId: 'armors',
        data: { name: 'Mark II Battlesuit', slot: 'Body', bonus: 3, equipped: true },
      },
    });

    const cards = Array.from(document.querySelectorAll('#armors .card'));
    expect(cards).toHaveLength(2);

    const equippedStates = cards.map(card => card.querySelector("input[type='checkbox'][data-f='equipped']").checked);
    expect(equippedStates).toEqual([false, true]);
  });
});
