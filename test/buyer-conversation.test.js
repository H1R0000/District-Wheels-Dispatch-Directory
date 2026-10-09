import test from 'node:test';
import assert from 'node:assert/strict';
import { buyerRequest, buyerSessionMessages, conversationBuyer, selectedBranch, summaryFields } from '../supabase/functions/dispatch-assistant/buyer-conversation.ts';
import { parseBuyerIdentity } from '../supabase/functions/dispatch-assistant/buyer-input.ts';
import { doorLocationQuestion, parseDoorAddress, parsePartialDoorAddress } from '../supabase/functions/dispatch-assistant/door-address.ts';
import { parsePickupMessage, extractLbcClues } from '../supabase/functions/dispatch-assistant/lbc-resolver.ts';
import { googleBranchSearchUrl } from '../supabase/functions/dispatch-assistant/branch-search-link.ts';
const user = (content) => ({ role: 'user', content });
const initial = user('add buyer\nLBC door to door\nAna Example\n09170008881\n12 Palm St, Brgy. San Juan, Cainta, Rizal 1900');

const inlineDoor = 'add a buyer\nlbc door to door\n\nELVIS EXAMPLE  09170008889  \n\nJADE ST. 112 GREENHEIGHTS SUBDIVISION BRGY. SAN BARTOLOME NOVALICHES\n\nMANILA QUEZON CITY NOVALICHES PROPER\n\nZip code. 1123';
test('inline name and phone retain multiline street, barangay and labelled ZIP without guessing conflicting localities', () => {
  assert.deepEqual(parseBuyerIdentity(inlineDoor), { name: 'ELVIS EXAMPLE', phone: '09170008889' });
  assert.deepEqual(parsePartialDoorAddress(inlineDoor), {
    street: 'JADE ST. 112 GREENHEIGHTS SUBDIVISION', barangay: 'SAN BARTOLOME NOVALICHES', zip_code: '1123',
  });
  const summary = conversationBuyer([user(inlineDoor)]).summary;
  assert.equal(summary.deliveryMethod, 'door');
  assert.equal(summary.address.zipCode, '1123');
  assert.equal(summary.address.city, undefined);
  assert.equal(buyerRequest(summary), null);
  assert.match(doorLocationQuestion(inlineDoor), /SAN BARTOLOME NOVALICHES/);
  assert.match(doorLocationQuestion(inlineDoor), /MANILA QUEZON CITY NOVALICHES PROPER/);
  assert.equal(parseBuyerIdentity(inlineDoor + '\n09170008890'), null);
});

test('location clarification completes the same buyer without asking for name, phone or street again', () => {
  const messages = [user(inlineDoor), { role: 'assistant', content: doorLocationQuestion(inlineDoor) }];
  const summary = conversationBuyer([...messages, user('San Bartolome, Quezon City, Metro Manila')]).summary;
  const request = buyerRequest(summary);
  assert.deepEqual(parseBuyerIdentity(request), { name: 'ELVIS EXAMPLE', phone: '09170008889' });
  assert.deepEqual(parseDoorAddress(request), {
    street: 'JADE ST. 112 GREENHEIGHTS SUBDIVISION', barangay: 'San Bartolome', city: 'Quezon City', province: 'Metro Manila', zip_code: '1123',
  });
  assert.equal(conversationBuyer([...messages, user('not sure')]).summary.address.city, undefined);
});

test('inline identity and separate ZIP support clear multiline and comma-separated city/region layouts', () => {
  for (const courier of ['lbc door to door', 'jnt']) {
    for (const location of ['Quezon City, Metro Manila', 'Quezon City\nMetro Manila']) {
      const message = inlineDoor.replace('lbc door to door', courier).replace('MANILA QUEZON CITY NOVALICHES PROPER', location);
      assert.equal(parseDoorAddress(message).city, 'Quezon City');
      assert.equal(parseDoorAddress(message).zip_code, '1123');
      assert.equal(doorLocationQuestion(message), null);
    }
  }
  assert.equal(parsePartialDoorAddress(inlineDoor.replace('lbc door to door', 'lbc branch pickup')), null);
  const checkout = pastedJnt.replace('Ammiel C Example\n+639170008885', 'Ammiel C Example  +639170008885').replace('3002', 'ZIP: 3002');
  assert.equal(parseDoorAddress(checkout).zip_code, '3002');
});

test('labelled pickup with pickuo typo preserves supplied address through corrections', () => {
  const address = "DCC-1 G-16 DANIEL COMM'L CPLX1, NATIONAL HIGHWAY, BRGY, Calamba City";
  const lines = ['add a buyer', 'lbc branch pickuo', 'Name: Kyle Joseph I. Example', 'Contact #: 09170008886', 'LBC Branch: LBC Express Parian', `LBC Branch Address: ${address}`];
  const expected = { name: 'Kyle Joseph I. Example', phone: '09170008886', branchName: 'Parian', branchAddress: address, locationHint: '' };
  for (const message of [lines.join('\n\n'), [lines[0], ...lines.slice(1).reverse()].join('\n')]) {
    assert.deepEqual(parsePickupMessage(message), expected);
    const summary = conversationBuyer([user(message)]).summary;
    assert.equal(summary.deliveryMethod, 'pickup');
    assert.equal(summary.branchAddress, address);
    assert.deepEqual(parsePickupMessage(buyerRequest(summary)), expected);
    const corrected = conversationBuyer([user(message), user('Change phone to 09170008887')]).summary;
    assert.equal(parsePickupMessage(buyerRequest(corrected)).branchAddress, address);
    const clues = extractLbcClues(message);
    assert.equal(clues.address, address);
    const query = new URL(googleBranchSearchUrl(clues.name, clues.address)).searchParams.get('q');
    assert.match(query, /Parian/);
    assert.doesNotMatch(query, /Kyle|Joseph|09170008886|Contact/);
  }
  assert.equal(parsePickupMessage(lines.join('\n') + '\nLBC Branch Address: Another address'), null);
  assert.equal(parsePickupMessage(lines.join('\n').replace('lbc branch pickuo', 'lbc door to door')), null);
});

const pastedJnt = 'Add a buyer\n\njnt \nAmmiel C Example\n+639170008885\nPurok 4 san isidro matanda hagonoy bulacan\nSan isidro\nHagonoy\nBulacan\n3002\nPhilippines';
test('pasted JNT checkout details fill every summary and draft address field', () => {
  const expected = { street: 'Purok 4 san isidro matanda hagonoy bulacan', barangay: 'San isidro', city: 'Hagonoy', province: 'Bulacan', zip_code: '3002' };
  assert.deepEqual(parseDoorAddress(pastedJnt), expected);
  assert.deepEqual(parseBuyerIdentity(pastedJnt), { name: 'Ammiel C Example', phone: '+639170008885' });
  const { summary } = conversationBuyer([user(pastedJnt)]);
  assert.equal(summary.preferredCourier, 'J&T Express');
  assert.equal(summary.deliveryMethod, 'door');
  assert.ok(summaryFields(summary).every(([, value]) => Boolean(value)));
  assert.deepEqual(parseDoorAddress(buyerRequest(summary)), expected);
});

test('multiline delivery address tolerates blank lines and optional country without guessing missing fields', () => {
  const withoutCountry = pastedJnt.replace('\nPhilippines', '');
  assert.equal(parseDoorAddress(withoutCountry.replaceAll('\n', '\n\n')).zip_code, '3002');
  assert.equal(parseDoorAddress(withoutCountry.replace('jnt', 'LBC door to door')).barangay, 'San isidro');
  assert.equal(parseDoorAddress(withoutCountry.replace('\nSan isidro\n', '\n')), null);
  assert.equal(parseDoorAddress(withoutCountry.replace('\n3002', '')), null);
  assert.equal(parseDoorAddress(pastedJnt.replace('Philippines', 'Singapore')), null);
  assert.equal(parseDoorAddress(pastedJnt.replace('jnt', 'LBC branch pickup')), null);
});

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
