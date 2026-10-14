import test from 'node:test';
import assert from 'node:assert/strict';
import { buyerMutationMessage, extractBuyerWithAI, privateBranchClue, validateBuyerChange, validateExtraction } from '../supabase/functions/dispatch-assistant/ai-extraction.ts';
import { mergeBuyer } from '../supabase/functions/dispatch-assistant/buyer-state.ts';
import { buyerRequest, conversationBuyer } from '../supabase/functions/dispatch-assistant/buyer-conversation.ts';
import { buyerFollowUp } from '../supabase/functions/dispatch-assistant/natural-buyer.ts';
import { googleBranchSearchUrl } from '../supabase/functions/dispatch-assistant/branch-search-link.ts';

const current = { name: 'Ana Example', phone: '09170008881', preferredCourier: 'LBC', deliveryMethod: 'door', address: { street: '12 Palm St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zipCode: '1900' } };
const response = (patch) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(patch) } }] }), { status: 200 });

test('informal correction is extracted with supported strict schema and preserves other draft fields', async () => {
  let sent;
  const patch = await extractBuyerWithAI('palitan phone niya sa +63 917 000 8882', current, 'test-key', async (_url, options) => {
    sent = JSON.parse(options.body);
    return response({ phone: '+639170008882', street: 'Invented house', name: 'Another Person' });
  });
  assert.equal(sent.model, 'qwen/qwen3.8-27b');
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.equal(sent.response_format.json_schema.schema.additionalProperties, false);
  assert.deepEqual(patch, { phone: '09170008882' });
  const buyer = mergeBuyer(current, patch);
  assert.deepEqual(buyer.address, current.address);
  assert.equal(buyer.name, current.name);
  assert.match(buyerRequest(buyer), /09170008882/);
});

test('unfamiliar first buyer request can extract supplied fields and ask one missing detail', async () => {
  const text = 'Can you add a buyer? Kay Ana Example ito, JNT, phone 09170008881, 12 Palm St, barangay San Juan, Cainta, Rizal';
  assert.equal(buyerMutationMessage(text), true);
  const patch = await extractBuyerWithAI(text, {}, 'test-key', async () => response({ name: 'Ana Example', phone: '09170008881', preferredCourier: 'J&T Express', street: '12 Palm St', barangay: 'San Juan', city: 'Cainta', province: 'Rizal', zipCode: '1900' }));
  assert.equal(patch.name, 'Ana Example');
  assert.equal(patch.deliveryMethod, 'door');
  assert.equal(patch.address.zipCode, undefined);
  assert.equal(buyerFollowUp(patch), 'What is the ZIP code for this delivery?');
});

test('a raw model identity cannot mask current identity in branch or address fields', () => {
  const text = 'Use LBC pickup for Alice Example at Robinsons Calamba';
  const patch = validateExtraction({ name: 'Calamba', branchName: 'Alice Example', address: { street: 'Alice Example' } }, text, { name: 'Alice Example' });
  assert.equal(patch.name, undefined);
  assert.equal(patch.branchName, undefined);
  assert.equal(patch.address, undefined);
  assert.equal(patch.deliveryMethod, 'pickup');
});

test('first-message model name and branch swap is rejected before any branch search', () => {
  const text = 'Can you add a buyer? Kay Alice Example ito, LBC pickup, Robinsons Calamba, 09170008881';
  const deterministic = validateBuyerChange(conversationBuyer([{ role: 'user', content: text }]).summary, text);
  assert.equal(deterministic.name, undefined);
  const patch = validateExtraction({ name: 'Robinsons Calamba', branchName: 'Alice Example', phone: '09170008881' }, text, deterministic);
  assert.equal(patch.name, undefined);
  assert.equal(patch.branchName, undefined);
  assert.equal(privateBranchClue({ name: 'Alice Example' }, ['Alice Example']), true);
  assert.equal(privateBranchClue({ name: 'Robinsons Calamba', location: '09170008881' }, []), true);
  assert.equal(privateBranchClue({ name: 'Robinsons Calamba' }, ['Alice Example']), false);
});

test('new identity and phone are excluded from public branch query while supplied branch survives', () => {
  const text = 'LBC pickup for Ana Example, 09170008881, Robinsons Calamba';
  const patch = validateExtraction({ name: 'Ana Example', phone: '09170008881', branchName: 'Robinsons Calamba', branchAddress: 'Unverified inferred address', preferredCourier: 'LBC' }, text);
  assert.equal(patch.branchName, 'Robinsons Calamba');
  assert.equal(patch.branchAddress, undefined);
  const query = new URL(googleBranchSearchUrl(patch.branchName)).searchParams.get('q');
  assert.match(query, /Robinsons Calamba/);
  assert.doesNotMatch(query, /Ana|Example|09170008881/);
});

test('deterministic invalid corrections cannot poison the sealed draft', () => {
  const parsed = { ...current, phone: 'banana', address: { ...current.address, zipCode: 'nope' } };
  assert.deepEqual(validateBuyerChange(parsed, 'Change phone to banana', current), {});
  assert.deepEqual(mergeBuyer(current, validateBuyerChange(parsed, 'Change phone to banana', current)), current);
  assert.deepEqual(validateExtraction({ phone: '09170008882' }, '09170008882 or 09170008883'), {});
});

test('reordered branch and location remain intact through the new validation and canonical pipeline', () => {
  const text = 'Riz Lawrence Quejada\niMall Canlubang, Calamba City, Laguna\n09568142493\npickup at LBC';
  const parsed = conversationBuyer([{ role: 'user', content: text }]).summary;
  const patch = validateBuyerChange(parsed, text);
  assert.equal(patch.branchName, 'iMall Canlubang, Calamba, Laguna');
  assert.equal(patch.name, 'Riz Lawrence Quejada');
  assert.equal(patch.phone, '09568142493');
  assert.match(buyerRequest(patch), /LBC Branch: iMall Canlubang, Calamba, Laguna/);
  assert.equal(validateExtraction({ branchName: 'iMall Quejada' }, text, patch).branchName, undefined);
});

test('informal name sentence is not sealed as a name and triggers validated AI extraction', async () => {
  const text = 'add buyer\nSi Ana Example po ang pangalan, tawagan sa 09170008898, JNT ang courier, 12 Palm St, Brgy. San Juan, Cainta, Rizal 1900';
  const parsed = conversationBuyer([{ role: 'user', content: text }]).summary;
  const deterministic = validateBuyerChange(parsed, text);
  assert.equal(deterministic.name, undefined);
  const extracted = await extractBuyerWithAI(text, deterministic, 'test-key', async () => response({ name: 'Ana Example' }));
  assert.equal(mergeBuyer(deterministic, extracted).name, 'Ana Example');
});

test('questions and model errors safely leave the draft unchanged', async () => {
  assert.deepEqual(validateExtraction({ name: 'Ana Example' }, 'Where is Ana Example?'), {});
  for (const fetcher of [async () => new Response('', { status: 429 }), async () => new Response('invalid', { status: 200 }), async () => { throw new Error('timeout'); }]) {
    assert.deepEqual(await extractBuyerWithAI('phone 09170008882', current, 'test-key', fetcher), {});
  }
  let called = false;
  assert.deepEqual(await extractBuyerWithAI('hello', current, 'test-key', async () => { called = true; }), {});
  assert.equal(called, false);
  assert.deepEqual(await extractBuyerWithAI('phone 09170008882', current, undefined), {});
});
