import assert from 'node:assert/strict';
import test from 'node:test';
import { phoneForCourier } from '../client/src/utils/phone.js';

test('phone copy format removes spaces and a leading zero', () => {
  assert.equal(phoneForCourier('0918 204 7316'), '9182047316');
});

test('phone copy format removes punctuation without dropping a nonzero prefix', () => {
  assert.equal(phoneForCourier('918-204-7316'), '9182047316');
});

test('phone copy format tolerates an empty value', () => {
  assert.equal(phoneForCourier(''), '');
});
