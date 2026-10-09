import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRiderPickup} from '../api/pos.js';

const row = {
  id: 'pickup-1',
  number: 'RDR-20260927-000001',
  rider_id: 'rider-1',
  rider_name: 'Test Rider',
  rider_phone: '03000000000',
  company: 'Test Logistics',
  pickup_at: '2026-09-27T10:00:00.000Z',
  settlement: 'deduct',
  status: 'Active',
  parcels_json: [{
    id: 'parcel-1',
    number: 'PKG-1',
    name: 'Customer',
    delivery_cents: 20000,
    total_cents: 220000,
    products: [{id: 'line-1', name: 'Suit', sku: 'NG-1', quantity: 2, price_cents: 100000}],
    returns: [{id: 'expected-1', name: 'Exchange piece', sku: 'NG-1', quantity: 1, price_cents: 100000}]
  }]
};

test('rider totals include parcels, payments and accepted return deductions', () => {
  const pickup = buildRiderPickup(
    row,
    [{id: 'payment-1', amount_cents: '120000', credit_cents: '0'}],
    [{id: 'return-1', expected_id: 'expected-1', received: 1, accepted: 1, damaged: 0, missing: 0, price_cents: '100000'}]
  );

  assert.equal(pickup.totals.parcels, 1);
  assert.equal(pickup.totals.pieces, 2);
  assert.equal(pickup.totals.total_cents, 220000);
  assert.equal(pickup.totals.return_value_cents, 100000);
  assert.equal(pickup.totals.net_cents, 120000);
  assert.equal(pickup.totals.outstanding_cents, 0);
  assert.equal(pickup.totals.payment_status, 'Paid');
  assert.equal(pickup.totals.return_status, 'Fully Returned');
  assert.equal(pickup.totals.fully_settled, true);
});

test('damaged observations remain pending and disputed', () => {
  const pickup = buildRiderPickup(
    row,
    [],
    [{id: 'return-2', expected_id: 'expected-1', received: 1, accepted: 0, damaged: 1, missing: 0, price_cents: '100000'}]
  );

  assert.equal(pickup.parcels[0].returns[0].pending, 1);
  assert.equal(pickup.totals.return_status, 'Return Disputed');
  assert.equal(pickup.totals.fully_settled, false);
});
