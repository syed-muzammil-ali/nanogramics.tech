import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLineItems, stockDeltas} from '../api/pos.js';

test('duplicate cart lines are grouped before stock is changed', () => {
  assert.deepEqual(normalizeLineItems([
    {code: 'NG-100', qty: 2},
    {code: 'NG-100', qty: 3}
  ]).map(({code, qty}) => ({code, qty})), [{code: 'NG-100', qty: 5}]);
});

test('online order edits calculate only the inventory difference', () => {
  const deltas = stockDeltas(
    [{code: 'NG-100', qty: 3}, {code: 'NG-200', qty: 1}],
    [{code: 'NG-100', qty: 1}, {code: 'NG-300', qty: 2}],
    true,
    true
  );
  assert.deepEqual(Object.fromEntries(deltas), {'NG-100': 2, 'NG-200': 1, 'NG-300': -2});
});

test('return status restores all inventory applied to an online order', () => {
  const items = [{code: 'NG-100', qty: 2}];
  assert.deepEqual(Object.fromEntries(stockDeltas(items, items, true, false)), {'NG-100': -2});
});

test('invalid sale quantities are rejected', () => {
  assert.throws(() => normalizeLineItems([{code: 'NG-100', qty: 0}]), /Invalid quantity/);
  assert.throws(() => normalizeLineItems([{code: '', qty: 1}]), /product SKU/);
});
