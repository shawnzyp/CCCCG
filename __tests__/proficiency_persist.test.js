import { jest } from '@jest/globals';

describe('proficiency persistence', () => {
  test('skills and saves remain proficient after save/load', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.confirm = jest.fn().mockReturnValue(true);
    global.CC = {};

    document.body.innerHTML = '<div id="saves"></div><div id="skills"></div><button id="btn-save"></button>';
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
      hidden: false
    };

    const { setCurrentCharacter, loadCharacter } = await import('../scripts/characters.js');
    setCurrentCharacter('Hero');
    await import('../scripts/main.js');

    document.getElementById('save-str-prof').checked = true;
    document.getElementById('skill-0-prof').checked = true;

    document.getElementById('btn-save').click();
    await Promise.resolve();
    await Promise.resolve();

    const data = await loadCharacter('Hero');
    expect(data.saveProfs).toContain('str');
    expect(data.skillProfs).toContain(0);

    document.getElementById('save-str-prof').checked = false;
    document.getElementById('skill-0-prof').checked = false;
    data.saveProfs.forEach(a => {
      document.getElementById(`save-${a}-prof`).checked = true;
    });
    data.skillProfs.forEach(i => {
      document.getElementById(`skill-${i}-prof`).checked = true;
    });
    expect(document.getElementById('save-str-prof').checked).toBe(true);
    expect(document.getElementById('skill-0-prof').checked).toBe(true);
  });
});
