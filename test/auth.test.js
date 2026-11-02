import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticator } from '../server/auth.js';
import { safeError, ApiError } from '../server/errors.js';

test('authentication verifies every token and creates isolated request clients', async () => {
  const clients = [];
  const authenticate = createAuthenticator({ url: 'https://test.supabase.co', key: 'public', clientFactory: (_url, key, options) => {
    clients.push(options);
    assert.equal(key, 'public');
    return { auth: { getUser: async (token) => ({ data: { user: { id: token } }, error: null }) }, rpc: async (name) => ({ data: name === 'application_access' ? { allowed: true, role: 'demo' } : { authorized: true, allowed: true, remaining: 119, retry_after: 60 } }) };
  } });
  const [a, b] = await Promise.all(['first', 'second'].map((token) => authenticate({ headers: { authorization: `Bearer ${token}` } })));
  assert.equal(a.user.id, 'first'); assert.equal(b.user.id, 'second');
  assert.notEqual(a.repository.db, b.repository.db);
  assert.equal(clients[0].global.headers.Authorization, 'Bearer first');
  assert.equal(clients[1].global.headers.Authorization, 'Bearer second');
  assert.equal(clients[0].auth.persistSession, false);
});

test('missing, expired, unapproved sessions and unavailable services fail closed', async () => {
  await assert.rejects(createAuthenticator()({ headers: {} }), (e) => e.status === 401);
  for (const [authError, allowed, expected] of [[{ status: 401 }, true, 401], [{ status: 503 }, true, 503], [{ status: 504 }, true, 504], [null, false, 403]]) {
    const authenticate = createAuthenticator({ url: 'https://test.supabase.co', key: 'public', clientFactory: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test' } }, error: authError }) }, rpc: async () => ({ data: { allowed } }) }) });
    await assert.rejects(authenticate({ headers: { authorization: 'Bearer token' } }), (e) => e.status === expected);
  }
});

test('actual Supabase SDK preserves Auth timeouts through its retryable-error wrapper', async () => {
  const authenticate = createAuthenticator({ url: 'https://test.supabase.co', key: 'public', fetcher: async () => { throw new DOMException('internal timeout context', 'TimeoutError'); } });
  await assert.rejects(authenticate({ headers: { authorization: 'Bearer token' } }), (error) => error.status === 504 && !error.message.includes('internal'));
});

test('actual PostgREST SDK preserves typed database transport failures', async () => {
  for (const [transportError, expected] of [[new DOMException('deadline context', 'TimeoutError'), 504], [new TypeError('fetch failed'), 503]]) {
    const authenticate = createAuthenticator({ url: 'https://test.supabase.co', key: 'public', fetcher: async (url) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/user')) return Response.json({ id: 'test-user' });
      if (path.endsWith('/application_access')) return Response.json({ allowed: true, role: 'demo' });
      if (path.endsWith('/claim_api_request_slot')) return Response.json({ authorized: true, allowed: true, remaining: 119, retry_after: 60 });
      throw transportError;
    } });
    const context = await authenticate({ headers: { authorization: 'Bearer token' } });
    await assert.rejects(context.repository.list(), (error) => safeError(error).status === expected);
  }
});

test('known SQL errors map to safe, distinct HTTP statuses', () => {
  for (const [code, status] of [['23505', 409], ['23514', 400], ['23502', 400], ['PT400', 400], ['PT404', 404], ['42501', 403], ['PT403', 403], ['PGRST000', 503], ['PGRST202', 503], ['57014', 504]]) {
    const result = safeError({ code, message: 'SECRET internal database topology' });
    assert.equal(result.status, status);
    assert.doesNotMatch(result.message, /SECRET/);
  }
  assert.equal(safeError(new Error('secret')).status, 500);
  assert.equal(safeError(null).status, 500);
  assert.equal(safeError('internal secret').status, 500);
  assert.equal(safeError(new DOMException('deadline', 'TimeoutError')).status, 504);
  assert.equal(safeError(new ApiError(404, 'Buyer not found.')).status, 404);
});
