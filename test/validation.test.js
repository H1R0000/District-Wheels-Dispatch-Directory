import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBuyer } from '../shared/buyerValidation.js';
const valid = { name: '  EXAMPLE BUYER  ', phone: '(0917) 000-0000', preferredCourier: 'LBC', pickups: [{ branchName: ' Sample ', branchAddress: ' Example address ' }], addresses: [] };
test('shared validation normalizes only known buyer fields and one default', () => {
  const { buyer, errors } = validateBuyer({ ...valid, owner_id: 'other-account', role: 'owner' });
  assert.deepEqual(errors, {});
  assert.equal(buyer.name, 'Example Buyer'); assert.equal(buyer.phone, '09170000000');
  assert.equal(buyer.owner_id, undefined); assert.equal(buyer.role, undefined);
  assert.equal(buyer.pickups[0].branchName, 'Sample'); assert.equal(buyer.pickups[0].isDefault, true);
});
test('shared validation bounds fields, phones, arrays, and location shapes', () => {
  for (const patch of [{ name: 'x'.repeat(121) }, { phone: '123' }, { phone: '1'.repeat(16) }, { pickups: Array(31).fill(valid.pickups[0]) }, { pickups: [null] }, { pickups: [{ ...valid.pickups[0], branchAddress: 'x'.repeat(501) }] }, { pickups: [{ ...valid.pickups[0], isDefault: 'yes' }] }]) assert.ok(Object.keys(validateBuyer({ ...valid, ...patch }).errors).length);
  assert.ok(validateBuyer({ ...valid, preferredCourier: 'J&T Express' }).errors.addresses);
});
