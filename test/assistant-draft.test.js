import assert from 'node:assert/strict';
import test from 'node:test';
import { draftMethodConflict } from '../client/src/utils/assistantDraft.js';

test('stops an old server pickup draft when the buyer requested LBC door to door', () => {
  const messages = [{ role: 'user', content: 'add buyer\nJeff Baluyot\n09762646254\nLBC door to door - 0911 Peony st. Greenland Subd. Brgy. San Juan Cainta Rizal 1900' }];
  const oldServerDraft = { name: 'Jeff Baluyot', phone: '09762646254', branchName: 'door to door - 0911 Peony st. Greenland Subd.', branchAddress: '' };
  assert.equal(draftMethodConflict(messages, oldServerDraft), true);
  assert.equal(draftMethodConflict(messages, { name: 'Jeff Baluyot', deliveryMethod: 'door', address: { street: '0911 Peony st.' } }), false);
});

test('allows a branch pickup draft when pickup was requested', () => {
  const messages = [{ role: 'user', content: 'add buyer Ana Reyes with LBC branch pickup' }];
  assert.equal(draftMethodConflict(messages, { deliveryMethod: 'pickup', branchName: 'LBC Arayat' }), false);
});
