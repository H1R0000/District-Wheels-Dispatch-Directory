import assert from 'node:assert/strict';
import test from 'node:test';
import { runModelConversation } from '../supabase/functions/dispatch-assistant/model-loop.ts';
import { createToolRunner } from '../supabase/functions/dispatch-assistant/tool-runner.ts';
import { handleConversation } from '../supabase/functions/dispatch-assistant/conversation-handler.ts';

const reply = (payload, status = 200) => ({ payload, status });
const base = () => ({ apiKey: 'test-key', history: [], tools: [], reply, reviewRequested: false, getBranchGoogleUrl: () => null, headers: {}, addBuyerResponse: (outcome) => reply(outcome) });
test('model quota and upstream failures expose safe actionable messages', async () => {
  const busy = await runModelConversation({ ...base(), fetcher: async () => new Response(null, { status: 429, headers: { 'retry-after': '12' } }) });
  assert.equal(busy.status, 429); assert.match(busy.payload.message, /12 seconds/);
  const unavailable = await runModelConversation({ ...base(), fetcher: async () => new Response('internal provider secret', { status: 503 }) });
  assert.equal(unavailable.status, 502); assert.doesNotMatch(unavailable.payload.message, /secret/);
});
test('model deletion tool prepares a separate confirmation without deleting', async () => {
  let name;
  const result = await runModelConversation({ ...base(), fetcher: async () => Response.json({ choices: [{ message: { tool_calls: [{ id: 'call', function: { name: 'delete_buyer', arguments: '{"id":"buyer-example"}' } }] } }] }), runTool: async (tool) => { name = tool; return { pending: { name: 'Example', phone: '09170000000', code: 'AABB1122' } }; } });
  assert.equal(name, 'delete_buyer'); assert.match(result.payload.message, /DELETE AABB1122/);
  assert.match(result.payload.message, /Any other message leaves the buyer in place/);
});
test('model cannot claim a review form exists without a structured draft tool result', async () => {
  let requests = 0;
  const result = await runModelConversation({ ...base(), reviewRequested: true, fetcher: async () => { requests++; return Response.json({ choices: [{ message: { content: 'Open the review form to save.' } }] }); } });
  assert.equal(requests, 1); assert.equal(result.payload.prepareReview, true);
  assert.equal(result.payload.draft, undefined);
});
test('extracted tool runner rejects unselected buyer mutations and unknown tools', async () => {
  const state = { lastBranchGoogleUrl: null, selectedBuyerId: null, buyerSearchMessage: null, verifiedPublic: {}, publicSourceUrl: null, resolvedPickup: null };
  const runner = createToolRunner({}, state);
  for (const name of ['edit_buyer', 'delete_buyer']) assert.match((await runner(name, { id: 'other-account' })).error, /saved buyer name or phone/);
  assert.deepEqual(await runner('invented_tool', {}), { error: 'Unknown tool.' });
});
test('conversation asks for buyer details before contacting any external service', async () => {
  const result = await handleConversation({ db: {}, auth: { user: { id: 'test-user' } }, body: { messages: [{ role: 'user', content: 'Add buyer' }] }, headers: {}, stateSecret: 'test-secret' });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.message, 'Which delivery should I use: LBC door-to-door, LBC branch pickup, or J&T door-to-door?');
  assert.ok(data.buyerStateToken);
});
