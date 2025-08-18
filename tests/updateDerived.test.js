import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
test('updateDerived computes derived stats correctly', async () => {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <input id="wis" value="14">
    <input id="dex" value="16">
    <input id="con" value="15">
    <input id="hp-roll" value="8">
    <input id="hp-bonus" value="5">
    <input id="hp-temp" value="">
    <input id="origin-bonus" value="1">
    <input id="pp">
    <input id="armor-bonus">
    <input id="tc">
    <progress id="sp-bar"></progress>
    <span id="sp-pill"></span>
    <progress id="hp-bar"></progress>
    <span id="hp-pill"></span>
    <input id="initiative">
    <input id="prof-bonus" value="2">
    <select id="power-save-ability"><option value="wis" selected>WIS</option></select>
    <input id="power-save-dc">
    <div data-kind="armor">
      <input type="checkbox" data-f="equipped" checked>
      <input data-f="bonus" value="2">
      <select data-f="slot"><option value="Body" selected>Body</option></select>
    </div>
    <div data-kind="armor">
      <input type="checkbox" data-f="equipped" checked>
      <input data-f="bonus" value="1">
      <select data-f="slot"><option value="Head" selected>Head</option></select>
    </div>
    <div data-kind="armor">
      <input type="checkbox" data-f="equipped" checked>
      <input data-f="bonus" value="1">
      <select data-f="slot"><option value="Shield" selected>Shield</option></select>
    </div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;

  const { updateDerived } = await import('../updateDerived.js');
  updateDerived();

  const get = (id) => document.getElementById(id);
  assert.equal(Number(get('pp').value), 12);
  assert.equal(Number(get('tc').value), 18);
  assert.equal(get('sp-pill').textContent, '7/7');
  assert.equal(get('hp-pill').textContent, '45/45');
});
