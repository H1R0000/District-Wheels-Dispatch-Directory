import assert from 'node:assert/strict';
import test from 'node:test';
import { buyerRequest } from '../supabase/functions/dispatch-assistant/buyer-conversation.ts';
import { conversationBuyer } from '../supabase/functions/dispatch-assistant/buyer-conversation.ts';
import { validateBuyerChange, validateExtraction } from '../supabase/functions/dispatch-assistant/ai-extraction.ts';
import { extractLbcClues, parsePickupMessage } from '../supabase/functions/dispatch-assistant/lbc-resolver.ts';
import { googleBranchSearchUrl } from '../supabase/functions/dispatch-assistant/branch-search-link.ts';
import { mergeBuyer } from '../supabase/functions/dispatch-assistant/buyer-state.ts';

const existing = {
  name: 'Mila Gomez',
  phone: '09170000000',
  preferredCourier: 'LBC',
  deliveryMethod: 'pickup',
  branchName: 'Glorietta 2',
  branchAddress: 'Glorietta 2, Makati City',
};

test('evidence-backed informal corrections merge into a canonical buyer request and branch-only search', () => {
  const text = 'Palitan branch to SM Megamall and phone to 09170000001';
  const patch = validateExtraction({
    branchName: 'SM Megamall',
    branchAddress: 'SM Megamall, Mandaluyong City',
    phone: '09170000001',
    name: 'Invented Person',
  }, text, existing);

  assert.deepEqual(patch, { branchName: 'SM Megamall', phone: '09170000001' });
  const merged = mergeBuyer(existing, patch);
  assert.equal(merged.name, existing.name);
  assert.equal(merged.phone, '09170000001');
  assert.equal(merged.branchName, 'SM Megamall');
  assert.equal(merged.branchAddress, undefined, 'a changed branch name must not keep an old branch address');

  merged.branchAddress = 'SM Megamall, Mandaluyong City';
  const canonical = buyerRequest(merged);
  assert.equal(canonical, 'add buyer\nLBC branch pickup\nMila Gomez\n09170000001\nLBC Branch: SM Megamall\nLBC Branch Address: SM Megamall, Mandaluyong City');
  assert.deepEqual(parsePickupMessage(canonical), {
    name: 'Mila Gomez', phone: '09170000001', branchName: 'SM Megamall', locationHint: '', branchAddress: 'SM Megamall, Mandaluyong City',
  });

  const clues = extractLbcClues(canonical);
  assert.deepEqual(clues, { name: 'SM Megamall', address: 'SM Megamall, Mandaluyong City' });
  const query = new URL(googleBranchSearchUrl(clues.name, clues.location)).searchParams.get('q');
  assert.equal(query, 'LBC SM Megamall Philippines branch address');
  assert.doesNotMatch(query, /Mila|Gomez|09170000001/);

  const naturalClues = extractLbcClues('Add buyer Mila Gomez 09170000001 LBC branch pickup at SM Megamall, Mandaluyong');
  assert.deepEqual(naturalClues, { name: 'SM Megamall', location: 'Mandaluyong' });
  const naturalQuery = new URL(googleBranchSearchUrl(naturalClues.name, naturalClues.location)).searchParams.get('q');
  assert.equal(naturalQuery, 'LBC SM Megamall Mandaluyong Philippines branch address');
  assert.doesNotMatch(naturalQuery, /Mila|Gomez|09170000001/);
});

test('AI supplied fields require matching user evidence and a single unambiguous phone', () => {
  const text = 'Actually the street is 12 LBC Road and use 09170000001 or 09170000002';
  const patch = validateExtraction({
    name: 'Mila Gomez',
    phone: '09170000001',
    preferredCourier: 'LBC',
    deliveryMethod: 'pickup',
    branchName: '12 LBC Road',
    branchAddress: '12 LBC Road',
    address: { street: '12 LBC Road', city: 'Mandaluyong' },
  }, text, existing);

  assert.equal(patch.name, undefined, 'unchanged name from model context is not a correction');
  assert.equal(patch.phone, undefined, 'one model choice cannot resolve two phone numbers in the utterance');
  assert.equal(patch.address?.street, '12 LBC Road');
  assert.equal(patch.address?.city, undefined, 'model must not add a city absent from the utterance');
  assert.equal(patch.branchName, undefined, 'a street correction containing “LBC” is not branch evidence');
  assert.equal(patch.branchAddress, undefined, 'street text must not be reclassified as a branch address');

  const merged = mergeBuyer(existing, patch);
  assert.equal(merged.name, existing.name);
  assert.equal(merged.phone, existing.phone);
});

test('uncertain first-turn name and branch roles cannot be swapped by the model', () => {
  const text = 'Can you add a buyer? Kay Alice Example ito, LBC pickup, sa Robinsons Calamba, 09170008881';
  const deterministic = conversationBuyer([{ role: 'user', content: text }]);
  const current = mergeBuyer({}, validateBuyerChange(deterministic.summary, text));

  const swapped = validateExtraction({ name: 'Robinsons Calamba', branchName: 'Alice Example', phone: '09170008881' }, text, current);
  assert.equal(swapped.name, undefined, 'a branch location must not become the buyer name');
  assert.equal(swapped.branchName, undefined, 'a personal name must not become the branch');

  const combined = validateExtraction({ name: 'Alice Example', branchName: 'Alice Example, Robinsons Calamba', phone: '09170008881' }, text, current);
  assert.equal(combined.branchName, undefined, 'a branch field cannot include the buyer identity span');

  const honest = validateExtraction({ name: 'Alice Example', branchName: 'Robinsons Calamba', phone: '09170008881' }, text, current);
  assert.deepEqual(honest, { name: 'Alice Example', phone: '09170008881', branchName: 'Robinsons Calamba', deliveryMethod: 'pickup' });
  const buyer = mergeBuyer(current, honest);
  const canonical = buyerRequest(buyer);
  assert.match(canonical, /\nAlice Example\n/);
  assert.match(canonical, /LBC Branch: Robinsons Calamba/);
  const clues = extractLbcClues(canonical);
  const query = new URL(googleBranchSearchUrl(clues.name, clues.location)).searchParams.get('q');
  assert.match(query, /Robinsons Calamba/);
  assert.doesNotMatch(query, /Alice|Example|09170008881/);
});

test('ambiguous delivery choices do not create a canonical request; switching delivery clears old branch fields', () => {
  const ambiguous = mergeBuyer(existing, validateExtraction({ deliveryMethod: 'pickup' }, 'LBC door to door or branch pickup?', existing));
  assert.equal(buyerRequest(ambiguous), buyerRequest(existing), 'a question cannot alter the active delivery choice');

  const switched = mergeBuyer(existing, validateExtraction({ deliveryMethod: 'door' }, 'Change delivery to door to door', existing));
  assert.equal(switched.deliveryMethod, 'door');
  assert.equal(switched.branchName, undefined);
  assert.equal(switched.branchAddress, undefined);
  assert.equal(buyerRequest(switched), null, 'a door request stays incomplete until its address is complete');
});
