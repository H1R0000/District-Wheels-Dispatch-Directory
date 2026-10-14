import assert from 'node:assert/strict';
import test from 'node:test';
import { activeBuyerMessages, applyBuyerState, buyerStateKey, loadBuyerState, persistBuyerState, startsNewBuyer, stateReviewMessage } from '../client/src/utils/assistantState.js';

const response = (revision = 1) => ({ buyerState: { version: 1, id: 'draft-one', revision, status: 'collecting', buyer: { name: 'Test Buyer', phone: '09170000000' } }, buyerStateToken: `sealed-${revision}` });
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test('buyer state and its token persist together only under the current account', () => {
  const store = storage();
  persistBuyerState(store, 'account-one', response());
  assert.deepEqual(loadBuyerState(store, 'account-one'), response());
  assert.equal(loadBuyerState(store, 'account-two'), null);
  persistBuyerState(store, 'account-one', null);
  assert.equal(loadBuyerState(store, 'account-one'), null);
});

test('blocked and malformed storage never breaks chat', () => {
  const store = storage();
  for (const invalid of ['{', '{}', JSON.stringify({ ...response(), buyerStateToken: '' }), JSON.stringify({ ...response(), buyerState: { ...response().buyerState, buyer: { name: {} } } })]) {
    store.setItem(buyerStateKey('user'), invalid);
    assert.equal(loadBuyerState(store, 'user'), null);
  }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(loadBuyerState(blocked, 'user'), null);
  assert.doesNotThrow(() => persistBuyerState(blocked, 'user', response()));
});

test('unrelated replies and network errors retain state; newer corrections replace it atomically', () => {
  const current = response();
  assert.equal(applyBuyerState(current, { message: 'ZIP lookup unavailable' }, 2, 2), current);
  const corrected = response(2);
  corrected.buyerState.buyer.phone = '09170000001';
  assert.deepEqual(applyBuyerState(current, corrected, 2, 2), corrected);
  assert.equal(applyBuyerState(corrected, response(1), 3, 3), corrected);
});

test('reset and account changes reject stale responses; successful delete clears state', () => {
  assert.equal(applyBuyerState(null, response(), 1, 2), null);
  assert.equal(applyBuyerState(response(), { deletedBuyer: { name: 'Test Buyer' } }, 2, 2), null);
  for (const content of ['Add a buyer', 'create another buyer', 'New buyer', 'Please start a new buyer']) assert.equal(startsNewBuyer(content), true);
  for (const content of ['Change name to New Buyer', 'What is the ZIP?', 'Review buyer form']) assert.equal(startsNewBuyer(content), false);
  assert.equal(startsNewBuyer('save buyer'), false);
});

test('explicit stateless server state can display without supplying a fabricated token', () => {
  const state = { buyerState: response().buyerState, statePersistence: 'stateless' };
  const next = applyBuyerState(null, state, 1, 1);
  assert.deepEqual(next.buyerState, state.buyerState);
  assert.equal(next.buyerStateToken, undefined);
  const store = storage();
  persistBuyerState(store, 'user', next);
  assert.deepEqual(loadBuyerState(store, 'user'), next);
  assert.equal(applyBuyerState(response(), state, 1, 1).buyerStateToken, undefined);
});

test('new buyer boundaries discard older contact details while save and lookup keep the conversation', () => {
  const messages = [
    { role: 'user', content: 'add a buyer\nOld Buyer\n09170000000' },
    { role: 'assistant', content: 'Which delivery?' },
    { role: 'user', content: 'create another buyer' },
    { role: 'user', content: 'save buyer' },
    { role: 'user', content: 'What is the ZIP?' },
  ];
  assert.deepEqual(activeBuyerMessages(messages), messages.slice(2));
  const complete = [...messages, { role: 'assistant', completedBuyer: true, content: 'Saved' }];
  assert.deepEqual(activeBuyerMessages(complete), []);
});

test('review remains available after unrelated replies but only for the active draft revision', () => {
  const draft = { role: 'assistant', draft: { name: 'Test Buyer' }, buyerStateId: 'draft-one', buyerStateRevision: 1 };
  const messages = [{ role: 'user', content: 'add a buyer' }, draft, { role: 'user', content: 'What is the ZIP?' }, { role: 'assistant', content: '3002' }];
  assert.equal(stateReviewMessage(messages, response()), draft);
  assert.equal(stateReviewMessage(messages, response(2)), undefined);
  assert.equal(stateReviewMessage([...messages, { role: 'user', content: 'start a new buyer' }], response()), undefined);
  assert.equal(stateReviewMessage([...messages, { role: 'assistant', completedBuyer: true }], response()), undefined);
});

test('confirmed completion resets state while an unsuccessful operation retains it', () => {
  const current = response();
  assert.equal(applyBuyerState(current, { completedBuyer: true }, 3, 3), null);
  assert.equal(applyBuyerState(current, { error: 'Could not delete' }, 3, 3), current);
  assert.equal(applyBuyerState(current, { deletedBuyer: {} }, 2, 3), current);
});
