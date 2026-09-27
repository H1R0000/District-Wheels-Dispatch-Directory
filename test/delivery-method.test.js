import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseDeliveryMethod, latestDeliveryMethod, statedDeliveryMethod } from '../supabase/functions/dispatch-assistant/delivery-method.ts';

test('recognizes common door and branch pickup wording', () => {
  for (const phrase of ['door to door', 'door-to-door', 'LBC door delivery', 'Delivery: door', 'home delivery']) {
    assert.equal(statedDeliveryMethod(phrase), 'door', phrase);
  }
  for (const phrase of ['branch pickup', 'branch pick-up', 'LBC pickup', 'pickup at the LBC branch', 'LBC Branch: Robinsons Otis']) {
    assert.equal(statedDeliveryMethod(phrase), 'pickup', phrase);
  }
});

test('the latest explicit correction wins in either direction', () => {
  assert.equal(latestDeliveryMethod([
    { role: 'user', content: 'LBC branch pickup' },
    { role: 'assistant', content: 'Which branch?' },
    { role: 'user', content: 'Actually, door to door.' },
  ]), 'door');
  assert.equal(latestDeliveryMethod([
    { role: 'user', content: 'LBC door to door' },
    { role: 'assistant', content: 'What is the address?' },
    { role: 'user', content: 'Switch to branch pickup.' },
  ]), 'pickup');
  assert.equal(statedDeliveryMethod('Change from branch pickup to door to door'), 'door');
  assert.equal(statedDeliveryMethod('Change from door to door to branch pickup'), 'pickup');
});

test('a comparison is ambiguous and a new buyer does not inherit an old method', () => {
  assert.equal(statedDeliveryMethod('Door to door or branch pickup?'), 'ambiguous');
  assert.equal(statedDeliveryMethod('Door to door, not branch pickup'), 'door');
  assert.equal(latestDeliveryMethod([
    { role: 'user', content: 'LBC branch pickup for Ana' },
    { role: 'assistant', content: 'Done.' },
    { role: 'user', content: 'Add a new buyer named Ben' },
  ]), null);
  assert.equal(latestDeliveryMethod([
    { role: 'user', content: 'LBC branch pickup for Ana' },
    { role: 'user', content: 'Add LBC buyer Ben' },
  ]), null);
});

test('a parsed pickup request cannot override an explicit door choice', () => {
  const history = [
    { role: 'user', content: 'LBC branch pickup' },
    { role: 'assistant', content: 'Which branch?' },
    { role: 'user', content: 'Name: Ana Reyes\nPhone: 09171234567' },
  ];
  assert.equal(chooseDeliveryMethod(history, true), 'pickup');
  assert.equal(chooseDeliveryMethod([...history, { role: 'user', content: 'Use LBC door to door' }], true), 'door');
});
