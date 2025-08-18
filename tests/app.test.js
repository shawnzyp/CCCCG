import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { updateHP } from '../scripts/app.js';

describe('updateHP', () => {
  it('increases HP text content by amount', () => {
    const dom = new JSDOM('<div id="hp">10</div>');
    const hp = dom.window.document.getElementById('hp');
    updateHP(hp, 5);
    assert.strictEqual(hp.textContent, '15');
  });
});
