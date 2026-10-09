const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {window: {}};
vm.runInNewContext(fs.readFileSync(__dirname + '/barcode.js', 'utf8'), context);

test('Code 39 barcode SVG contains bars and human-readable generated SKU', () => {
  const svg = context.window.BarcodeTools.svg('NG-00100001');
  assert.match(svg, /^<svg/);
  assert.match(svg, /<rect x=/);
  assert.match(svg, /NG-00100001/);
});

test('barcode rejects unsupported characters', () => {
  assert.throws(() => context.window.BarcodeTools.svg('sku_1'), /supports/);
});
