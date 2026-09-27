import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBuyer, buyerChoicesMessage } from '../supabase/functions/dispatch-assistant/buyer-selection.ts';
import { editEvidenceError } from '../supabase/functions/dispatch-assistant/edit-evidence.ts';
import { draftEvidenceError } from '../supabase/functions/dispatch-assistant/draft-evidence.ts';
import { statedDeliveryMethod } from '../supabase/functions/dispatch-assistant/delivery-method.ts';
import { applyAssistantEdit, editedDeliveryMethod } from '../client/src/utils/assistantEdit.js';
import { doorAddressZip, parseDoorAddress, parseDoorAddressWithPostalRows, parsePartialDoorAddress } from '../supabase/functions/dispatch-assistant/door-address.ts';
import { doorBuyerSource, parseBuyerIdentity } from '../supabase/functions/dispatch-assistant/buyer-input.ts';
import { parseBuyerAction } from '../supabase/functions/dispatch-assistant/buyer-action.ts';
import { parsePickupMessage } from '../supabase/functions/dispatch-assistant/lbc-resolver.ts';

const buyers = [
  { id: 'one', name: 'Ana Cruz', phone: '09171234567' },
  { id: 'two', name: 'Ana Santos', phone: '09179876543' },
];

test('three delivery types are recognized from ordinary buyer messages', () => {
  assert.equal(statedDeliveryMethod('LBC door to door - 11 Peony St, San Juan, Cainta'), 'door');
  assert.equal(statedDeliveryMethod('LBC branch pickup at Robinsons Otis'), 'pickup');
  assert.equal(statedDeliveryMethod('J&T Express door to door, 11 Peony St'), 'door');
});

test('unlabelled multiline buyer details prefill an LBC or J&T door address', () => {
  const lbc = 'Add buyer\nMira Testcase\n09170009998\nLBC door to door - 11 Peony St, Brgy. San Juan, Cainta, Rizal 1900';
  assert.deepEqual(parseBuyerIdentity(lbc), { name: 'Mira Testcase', phone: '09170009998' });
  assert.deepEqual(parseDoorAddress(lbc), { street: '11 Peony St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zip_code: '1900' });
  assert.deepEqual(parseDoorAddress('J&T Express door to door - 12 Palm St, Barangay Mabini, Manila, Metro Manila, 1000'), { street: '12 Palm St', barangay: 'Mabini', city: 'Manila', province: 'Metro Manila', zip_code: '1000' });
  assert.equal(parseDoorAddress('LBC door to door - 11 Peony St, Cainta, Rizal 1900'), null);
  assert.deepEqual(parsePartialDoorAddress('LBC door to door - 11 Peony St, Brgy. San Juan, Cainta'), { street: '11 Peony St', barangay: 'San Juan', city: 'Cainta' });
  const incompleteMethod = 'Add buyer\nNilo Sample\n09170009995\nLBC - 31 Palm St, Brgy. San Juan, Cainta, Rizal 1900';
  assert.equal(doorBuyerSource([incompleteMethod, 'Door to door']), `${incompleteMethod}\nDoor to door`);
});

test('comma-free door address uses a verified ZIP row and an address-only reply keeps the buyer identity', () => {
  const original = 'add buyer\nlbc door to door\nJeff Baluyot\n09762646254\n0911 Peony st. Greenland Subd. Brgy. San Juan Cainta Rizal 1900';
  const reply = '0911 Peony st. Greenland Subd. Brgy. San Juan Cainta Rizal 1900';
  const postalRows = [{ locality: 'Cainta', province: 'Rizal', postal_code: '1900' }];
  const expected = { street: '0911 Peony st. Greenland Subd.', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zip_code: '1900' };
  assert.equal(doorAddressZip(original), '1900');
  assert.deepEqual(parseDoorAddressWithPostalRows(original, postalRows), expected);
  assert.equal(draftEvidenceError({ name: 'Jeff Baluyot', phone: '09762646254', method: 'door', address: expected }, original), null);
  const followedUp = doorBuyerSource([original, reply]);
  assert.deepEqual(parseBuyerIdentity(followedUp), { name: 'Jeff Baluyot', phone: '09762646254' });
  assert.deepEqual(parseDoorAddressWithPostalRows(followedUp, postalRows), expected);
  assert.equal(parseDoorAddressWithPostalRows(original, [{ locality: 'Taytay', province: 'Rizal', postal_code: '1900' }]), null);
});

test('branch pickup wording is removed before the exact branch lookup', () => {
  const parsed = parsePickupMessage('Add buyer\nMarco Sample\n09170009996\nLBC branch pickup SM CITY CLARK');
  assert.equal(parsed?.branchName, 'SM CITY CLARK');
  assert.equal(parsePickupMessage('Add buyer\nNilo Sample\n09170009995\nLBC - 31 Palm St, Brgy. San Juan, Cainta, Rizal 1900'), null);
});

test('buyer selection requires one exact match and never guesses between similar names', () => {
  assert.equal(selectBuyer(buyers, 'Ana Cruz').buyer.id, 'one');
  assert.equal(selectBuyer(buyers, '+639171234567').buyer.id, 'one');
  assert.equal(selectBuyer(buyers, 'Ana').choices.length, 2);
  assert.match(buyerChoicesMessage(selectBuyer(buyers, 'Ana').choices), /exact phone number/);
  assert.match(buyerChoicesMessage(selectBuyer([], 'missing').choices), /could not find/);
});

test('natural edit and delete commands identify a buyer and only the requested change', () => {
  assert.deepEqual(parseBuyerAction('Edit Mira Testcase 09170009998: change street to 12 Peony St'), {
    action: 'edit', query: '09170009998', patch: { address: { street: '12 Peony St' } },
  });
  assert.deepEqual(parseBuyerAction('Delete buyer Mira Testcase 09170009998'), { action: 'delete', query: '09170009998' });
  assert.deepEqual(parseBuyerAction('Remove Ana Cruz'), { action: 'delete', query: 'Ana Cruz' });
});

test('door draft accepts verified public ZIP details but requires the buyer street and barangay', () => {
  const draft = { name: 'Ana Cruz', phone: '09171234567', method: 'door', address: { street: '11 Peony St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zip_code: '1900' } };
  const text = 'Add Ana Cruz 09171234567, LBC door to door, 11 Peony St, San Juan, Cainta';
  assert.equal(draftEvidenceError(draft, text, false, { city: 'Cainta', province: 'Rizal', zip_code: '1900' }), null);
  assert.match(draftEvidenceError(draft, 'Add Ana Cruz 09171234567, LBC door to door, Cainta', false, { city: 'Cainta', province: 'Rizal', zip_code: '1900' }), /street or house address.*barangay/);
});

test('edit patch changes only requested fields and keeps other saved delivery details', () => {
  const saved = { id: 'one', name: 'Ana Cruz', phone: '09171234567', preferredCourier: 'LBC', addresses: [{ id: 'address-one', street: 'Old St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zipCode: '1900', isDefault: true }], pickups: [] };
  const patch = { address: { street: 'New St' }, deliveryMethod: 'door' };
  const edited = applyAssistantEdit(saved, patch);
  assert.equal(edited.addresses[0].street, 'New St');
  assert.equal(edited.addresses[0].barangay, 'San Juan');
  assert.equal(edited.addresses[0].id, 'address-one');
  assert.equal(editedDeliveryMethod(saved, patch), 'door');
  assert.equal(saved.addresses[0].street, 'Old St');
  assert.equal(editEvidenceError(patch, 'Edit Ana Cruz: change the street to New St'), null);
  assert.match(editEvidenceError(patch, 'Edit Ana Cruz: change the street', false), /state the new street/);
});

test('branch pickup edit uses a verified branch pair and a J&T edit selects door delivery', () => {
  const saved = { name: 'Ana Cruz', phone: '09171234567', preferredCourier: 'LBC', addresses: [], pickups: [] };
  const pickup = { pickup: { branch_name: 'ROBINSONS OTIS', branch_address: 'Otis, Manila' }, deliveryMethod: 'pickup' };
  assert.equal(editEvidenceError(pickup, 'Move Ana Cruz to LBC branch pickup Robinsons Otis', true), null);
  assert.equal(applyAssistantEdit(saved, pickup).pickups[0].branchName, 'ROBINSONS OTIS');
  const jnt = { preferred_courier: 'J&T Express', deliveryMethod: 'door', address: { street: '11 Peony St' } };
  assert.equal(editedDeliveryMethod(saved, jnt), 'door');
  assert.equal(applyAssistantEdit(saved, jnt).addresses[0].street, '11 Peony St');
});
