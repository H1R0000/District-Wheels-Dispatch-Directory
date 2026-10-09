import test from 'node:test';
import assert from 'node:assert/strict';
import { buyerRequest, buyerSessionMessages, conversationBuyer, selectedBranch, summaryFields } from '../supabase/functions/dispatch-assistant/buyer-conversation.ts';
import { parseBuyerIdentity } from '../supabase/functions/dispatch-assistant/buyer-input.ts';
import { parseDoorAddress } from '../supabase/functions/dispatch-assistant/door-address.ts';
const user = (content) => ({ role: 'user', content });
const initial = user('add buyer\nLBC door to door\nAna Example\n09170008881\n12 Palm St, Brgy. San Juan, Cainta, Rizal 1900');

test('phone correction preserves the address and generates a reviewable request', () => {
  const { summary, changed } = conversationBuyer([initial, user('change only the phone number to 09170008882')]);
  assert.equal(changed, true);
  const request = buyerRequest(summary);
  assert.deepEqual(parseBuyerIdentity(request), { name: 'Ana Example', phone: '09170008882' });
  assert.deepEqual(parseDoorAddress(request), { street: '12 Palm St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zip_code: '1900' });
  assert.ok(!request.includes('09170008881'));
});

test('an explicit delivery correction replaces the method and can be changed to J&T', () => {
  const pickup = conversationBuyer([initial, user('LBC branch pickup')]).summary;
  assert.equal(pickup.deliveryMethod, 'pickup');
  assert.equal(buyerRequest(pickup), null);
  const jnt = conversationBuyer([initial, user('J&T Express door to door')]).summary;
  assert.equal(jnt.preferredCourier, 'J&T Express');
  assert.match(buyerRequest(jnt), /J&T Express door to door/);
});

test('ambiguous LBC delivery retains public and private address fields until a choice is made', () => {
  const ambiguous = user(initial.content.replace('LBC door to door', 'LBC'));
  assert.equal(conversationBuyer([ambiguous]).summary.deliveryMethod, undefined);
  const resolved = conversationBuyer([ambiguous, user('LBC door to door')]).summary;
  assert.equal(parseDoorAddress(buyerRequest(resolved)).zip_code, '1900');
});

test('a new buyer, completed save, and empty chat cannot inherit the old buyer', () => {
  const next = user('add buyer\nLBC branch pickup');
  assert.deepEqual(buyerSessionMessages([initial, next]), [next]);
  assert.equal(conversationBuyer([initial, next]).summary.name, undefined);
  assert.equal(conversationBuyer([]).summary, null);
  const saved = { role: 'assistant', content: 'Saved Ana Example.', completedBuyer: true };
  assert.equal(conversationBuyer(buyerSessionMessages([initial, saved, user('change phone to 09170008882')])).summary, null);
});

test('numbered branch replies use only the immediately preceding choices and retain buyer identity', () => {
  const branches = [{ branch_name: 'LBC Express - FIRST', branch_address: 'First public address' }, { branch_name: 'LBC Express - SECOND', branch_address: 'Second public address' }];
  const start = user('add buyer\nLBC branch pickup\nAna Example\n09170008881\nLBC Arayat');
  const choices = { role: 'assistant', content: 'Choose a branch.', branchChoices: branches };
  for (const reply of ['use the second one', 'Use option 2', '2']) {
    assert.deepEqual(selectedBranch([start, choices, user(reply)]), branches[1]);
    const summary = conversationBuyer([start, choices, user(reply)]).summary;
    assert.equal(summary.name, 'Ana Example');
    assert.equal(summary.branchName, branches[1].branch_name);
  }
  assert.equal(selectedBranch([choices, user('3')]), null);
  assert.equal(selectedBranch([choices, { role: 'assistant', content: 'Anything else?' }, user('2')]), null);
});

test('unrelated lookup does not become a buyer correction and missing fields remain visible', () => {
  assert.equal(conversationBuyer([initial, user('What is the ZIP code of Calamba?')]).changed, false);
  const summary = conversationBuyer([user('add buyer\nLBC branch pickup')]).summary;
  assert.ok(summaryFields(summary).some(([label, value]) => label === 'Name' && !value));
  assert.equal(buyerRequest(summary), null);
});
