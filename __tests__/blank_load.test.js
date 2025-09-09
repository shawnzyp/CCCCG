import { jest } from '@jest/globals';

describe('initial load', () => {
  test('ignores previous autosave and starts blank', async () => {
    global.fetch = jest.fn().mockResolvedValue({ text: async () => '' });

    localStorage.setItem('autosave', JSON.stringify({ foo: 'bar' }));

    document.body.innerHTML = `<input id="foo" />`;

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

    console.error = jest.fn();

    await import('../scripts/main.js');

    expect(document.getElementById('foo').value).toBe('');
    expect(localStorage.getItem('autosave')).toContain('"foo":""');
  });
});
