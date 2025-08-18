const fs = require('fs');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const vm = require('vm');

const html = fs.readFileSync('Index.html', 'utf8');
const vc = new VirtualConsole();
vc.sendTo(console);
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost', virtualConsole: vc });

// Execute the module script in the DOM context so helper functions are attached to window
const script = dom.window.document.querySelector('script[type="module"]').textContent;
vm.runInContext(script, dom.getInternalVMContext());

const sample = {
  superhero: 'Nova',
  powers: [
    { name: 'Fire Blast', sp: '2', save: 'Dex', range: '30ft', effect: '2d6 fire' }
  ],
  weapons: [
    { name: 'Sword', damage: '1d8', range: '5ft' }
  ],
  armor: [
    { name: 'Leather', slot: 'Body', bonus: 2, equipped: true }
  ],
  items: [
    { name: 'Potion', qty: 1, notes: '' }
  ]
};

// Populate DOM with sample data, then serialize again and ensure it matches
if (typeof dom.window.deserialize !== 'function' || typeof dom.window.serialize !== 'function') {
  throw new Error('serialize/deserialize functions not found');
}

dom.window.deserialize(sample);
const serialized = dom.window.serialize();

const subset = JSON.parse(JSON.stringify({
  superhero: serialized.superhero,
  powers: serialized.powers,
  weapons: serialized.weapons,
  armor: serialized.armor,
  items: serialized.items
}));

assert.deepStrictEqual(subset, sample);

console.log('Round-trip serialization successful');
