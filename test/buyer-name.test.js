import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBuyerName } from '../shared/buyerName.js';
import { buildBuyerPayload } from '../client/src/utils/buyerPayload.js';
import { applyAssistantEdit } from '../client/src/utils/assistantEdit.js';
import { MemoryStore } from '../server/store.js';

for (const [input, expected] of [
  ['EDRIAN ERECRE', 'Edrian Erecre'],
  ['edrian erecre', 'Edrian Erecre'],
  ['eDrIaN eReCrE', 'Edrian Erecre'],
  ['  eDrIaN   eReCrE  ', 'Edrian Erecre'],
]) {
  test(`formats buyer name: ${JSON.stringify(input)}`, () => {
    assert.equal(formatBuyerName(input), expected);
  });
}

test('manual form payload uses the formatted name', () => {
  const payload = buildBuyerPayload({
    name: '  EDRIAN   ERECRE  ', preferredCourier: 'LBC',
    addresses: [], pickups: [{ branchName: 'LBC Test', branchAddress: 'Test Road', isDefault: true }],
  }, 'pickup');
  assert.equal(payload.name, 'Edrian Erecre');
});

test('assistant edit draft formats a changed name before review', () => {
  const buyer = { name: 'Original Buyer', phone: '09171234567', preferredCourier: 'LBC', addresses: [], pickups: [] };
  assert.equal(applyAssistantEdit(buyer, { name: '  eDrIaN   eReCrE  ' }).name, 'Edrian Erecre');
});

test('create and edit save the formatted name in buyer and shipping records', async () => {
  const store = new MemoryStore([]);
  const details = {
    name: '  EDRIAN   ERECRE  ', phone: '09171234567', preferredCourier: 'LBC', addresses: [],
    pickups: [{ branchName: 'LBC Test', branchAddress: 'Test Road', isDefault: true }],
  };
  const created = await store.create(details);
  assert.equal(created.name, 'Edrian Erecre');
  assert.equal(created.pickups[0].recipientName, 'Edrian Erecre');
  assert.equal((await store.list())[0].name, 'Edrian Erecre');

  const edited = await store.update(created.id, { ...details, name: '  eDrIaN  eReCrE  ' });
  assert.equal(edited.name, 'Edrian Erecre');
  assert.equal(edited.pickups[0].recipientName, 'Edrian Erecre');
  assert.equal((await store.get(created.id)).name, 'Edrian Erecre');
});
