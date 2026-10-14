import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBuyer, mergeBuyer, newBuyerMessage, readBuyerState, sealBuyerState } from '../supabase/functions/dispatch-assistant/buyer-state.ts';
import { buyerSessionMessages, conversationBuyer } from '../supabase/functions/dispatch-assistant/buyer-conversation.ts';

const buyer = { name: 'Ana Example', phone: '09170008881', preferredCourier: 'LBC', deliveryMethod: 'door', address: { street: '12 Palm St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zipCode: '1900' } };
const state = { version: 1, id: 'test-draft', revision: 3, buyer, status: 'ready' };
const secret = 'test-only-state-secret';

test('signed draft survives a truncated conversation and is bound to the signed-in account', async () => {
  const token = await sealBuyerState(state, 'account-a', secret, 1000);
  const restored = await readBuyerState(token, 'account-a', secret, 2000);
  assert.deepEqual(restored, state);
  assert.deepEqual(conversationBuyer([{ role: 'user', content: 'Change phone to 09170008882' }], restored.buyer).summary.address, buyer.address);
  assert.equal(await readBuyerState(token, 'account-b', secret, 2000), null);
  assert.equal(await readBuyerState(token, 'account-a', 'wrong-secret', 2000), null);
});

test('tampered, expired, oversized, malformed and raw client states are rejected', async () => {
  const token = await sealBuyerState(state, 'account-a', secret, 1000);
  const [payload, signature] = token.split('.');
  const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString());
  tampered.buyer.name = 'Other Person';
  assert.equal(await readBuyerState(`${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${signature}`, 'account-a', secret, 2000), null);
  assert.equal(await readBuyerState(token, 'account-a', secret, 1000 + 86400000), null);
  for (const invalid of [state, '', 'a.b.c', 'x'.repeat(12001)]) assert.equal(await readBuyerState(invalid, 'account-a', secret, 2000), null);
});

test('missing signing configuration explicitly allows stateless fallback without accepting unsigned state', async () => {
  assert.equal(await sealBuyerState(state, 'account-a', undefined), undefined);
  assert.equal(await readBuyerState('anything', 'account-a', undefined), null);
});

test('delivery and branch corrections clear incompatible destination details', () => {
  const pickup = mergeBuyer(buyer, { deliveryMethod: 'pickup', branchName: 'Parian' });
  assert.equal(pickup.address, undefined);
  const changed = mergeBuyer({ ...pickup, branchAddress: 'Old verified address' }, { branchName: 'Canlubang' });
  assert.equal(changed.branchAddress, undefined);
  const door = mergeBuyer(changed, { preferredCourier: 'J&T Express' });
  assert.equal(door.deliveryMethod, 'door');
  assert.equal(door.branchName, undefined);
  assert.equal(door.branchAddress, undefined);
  assert.deepEqual(cleanBuyer({ phone: 'banana', address: { zipCode: 'invalid' }, verified: true, id: 'forged' }), {});
});

test('new buyer wording resets context while save and review keep the same draft', () => {
  for (const phrase of ['add buyer', 'create another buyer', 'start a new buyer', 'new buyer']) {
    assert.equal(newBuyerMessage(phrase), true);
    const messages = [{ role: 'user', content: 'add buyer Ana Example' }, { role: 'user', content: phrase }];
    assert.deepEqual(buyerSessionMessages(messages), [messages[1]]);
  }
  assert.equal(newBuyerMessage('save buyer'), false);
  assert.equal(newBuyerMessage('review buyer'), false);
  assert.equal(conversationBuyer([{ role: 'user', content: 'save buyer' }], buyer).summary.name, 'Ana Example');
});
