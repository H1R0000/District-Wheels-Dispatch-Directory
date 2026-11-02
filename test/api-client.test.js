import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRequest } from '../client/src/lib/apiTransport.js';
test('browser API attaches current bearer tokens and handles JSON, 204, and field errors', async () => {
  let token = 'first'; const calls = [];
  const request = createApiRequest({ getSession: async () => ({ data: { session: { access_token: token } } }), fetcher: async (path, options) => {
    calls.push({ path, options });
    return path.endsWith('delete') ? new Response(null, { status: 204 }) : path.endsWith('invalid') ? Response.json({ message: 'Check fields', errors: { phone: 'Invalid' }, correlationId: 'test' }, { status: 400 }) : Response.json({ ok: true });
  } });
  assert.deepEqual(await request('/buyers'), { ok: true });
  token = 'refreshed';
  assert.equal(await request('/delete', { method: 'DELETE' }), undefined);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer first'); assert.equal(calls[1].options.headers.Authorization, 'Bearer refreshed');
  assert.equal(calls[0].path, '/api/buyers');
  await assert.rejects(request('/invalid', { method: 'POST', body: {} }), (error) => error.errors.phone === 'Invalid' && error.status === 400);
});
