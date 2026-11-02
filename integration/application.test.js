import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { requireLocal } from '../scripts/local-config.mjs';
import { createApp } from '../server/app.js';
import { createAuthenticator } from '../server/auth.js';

const config = JSON.parse(await readFile('tmp/local-supabase.json', 'utf8'));
requireLocal(config.API_URL);
requireLocal(config.DB_URL.replace('postgresql:', 'http:').replace('postgres:', 'http:'));
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = new pg.Client({ connectionString: config.DB_URL });
const createdUsers = [];
const createdBuyers = [];
let server, base, owner, stranger, ownerPasswordToken, ownerToken, demoToken, ownerDb, demoDb;
const client = (token) => createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const details = (overrides = {}) => ({ name: 'Integration Example', phone: '09175550123', preferredCourier: 'LBC', addresses: [], pickups: [{ branchName: 'Fictional Test Branch', branchAddress: '1 Example Street', isDefault: true }], ...overrides });
const call = (path, { token = demoToken, body, ...options } = {}) => fetch(`${base}/api${path}`, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
function signLocalClaims(token, patch) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  const parts = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ ...claims, ...patch })).toString('base64url')];
  return `${parts.join('.')}.${createHmac('sha256', config.JWT_SECRET).update(parts.join('.')).digest('base64url')}`;
}
async function makeUser(label) {
  const email = `${label}-${randomUUID()}@district-wheels.test`;
  const password = randomBytes(24).toString('hex');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: 'owner', is_demo: false } });
  assert.ifError(error); createdUsers.push(data.user.id);
  const auth = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error: signError } = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(signError);
  return { id: data.user.id, token: signed.session.access_token };
}
before(async () => {
  await sql.connect();
  // Repair and remove only stale local test fixtures from an interrupted run.
  const stale = await sql.query("select id from auth.users where email like 'owner-%@district-wheels.test' or email like 'unapproved-%@district-wheels.test'");
  for (const user of stale.rows) {
    await sql.query('update auth.identities set created_at=coalesce(created_at,now()),updated_at=coalesce(updated_at,now()) where user_id=$1', [user.id]);
    const { error } = await admin.auth.admin.deleteUser(user.id); assert.ifError(error);
  }
  const demoAuth = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await demoAuth.auth.signInWithPassword({ email: 'demo@district-wheels.test', password: config.demoPassword });
  assert.ifError(error); demoToken = data.session.access_token;
  owner = await makeUser('owner'); stranger = await makeUser('unapproved'); ownerPasswordToken = owner.token;
  // Only local test fixtures sign synthetic OAuth claims; production never uses this helper.
  const provider = `test-${randomUUID()}`;
  await sql.query("insert into auth.identities(user_id,provider_id,identity_data,provider,created_at,updated_at) values ($1,$2,$3,'github',now(),now())", [owner.id, provider, JSON.stringify({ sub: provider })]);
  await sql.query("insert into public.profiles(id,role,is_demo,github_provider_id) values ($1,'owner',false,$2)", [owner.id, provider]);
  ownerToken = signLocalClaims(owner.token, { amr: [{ method: 'oauth', timestamp: Math.floor(Date.now() / 1000) }] });
  ownerDb = client(ownerToken); demoDb = client(demoToken);
  server = createApp({ authenticate: createAuthenticator({ url: config.API_URL, key: config.ANON_KEY }), logger: { error() {} } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  if (createdBuyers.length) await admin.from('buyers').delete().in('id', createdBuyers);
  for (const id of createdUsers) { const { error } = await admin.auth.admin.deleteUser(id); assert.ifError(error); }
  await sql.end();
});

test('real Auth rejects anonymous, expired, unapproved and owner password sessions', async () => {
  assert.equal((await call('/buyers', { token: '' })).status, 401);
  assert.equal((await call('/buyers', { token: signLocalClaims(ownerToken, { exp: 1 }) })).status, 401);
  assert.equal((await call('/buyers', { token: stranger.token })).status, 403);
  assert.equal((await call('/buyers', { token: ownerPasswordToken })).status, 403);
  assert.equal((await call('/buyers', { token: ownerToken })).status, 200);
  assert.equal((await call('/buyers')).status, 200);
});
test('real CRUD returns 201/200/204, normalizes fields, and maps duplicate phone to 409', async () => {
  const response = await call('/buyers', { method: 'POST', body: details() });
  assert.equal(response.status, 201);
  const buyer = await response.json(); createdBuyers.push(buyer.id);
  assert.equal(buyer.pickups[0].recipientName, 'Integration Example');
  assert.equal((await call(`/buyers/${buyer.id}`)).status, 200);
  assert.equal((await call('/buyers', { method: 'POST', body: details() })).status, 409);
  const edited = await call(`/buyers/${buyer.id}`, { method: 'PUT', body: details({ name: 'Updated Example' }) });
  assert.equal(edited.status, 200); assert.equal((await edited.json()).name, 'Updated Example');
  assert.equal((await call(`/buyers/${buyer.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await call(`/buyers/${buyer.id}`)).status, 404);
  assert.equal((await call(`/buyers/${buyer.id}`, { method: 'PUT', body: details() })).status, 404);
});
test('Express and direct Data API enforce demo/owner isolation for reads and mutations', async () => {
  const response = await call('/buyers', { token: ownerToken, method: 'POST', body: details() });
  assert.equal(response.status, 201); const own = await response.json(); createdBuyers.push(own.id);
  assert.equal((await call(`/buyers/${own.id}`)).status, 404);
  assert.equal((await call(`/buyers/${own.id}`, { method: 'PUT', body: details() })).status, 404);
  assert.equal((await call(`/buyers/${own.id}`, { method: 'DELETE' })).status, 404);
  const hidden = await demoDb.from('buyers').select('id').eq('id', own.id);
  assert.ifError(hidden.error); assert.deepEqual(hidden.data, []);
  const demoBuyer = (await demoDb.from('buyers').select('id').limit(1)).data[0];
  assert.equal((await call(`/buyers/${demoBuyer.id}`, { token: ownerToken })).status, 404);
  assert.equal((await call(`/buyers/${demoBuyer.id}`, { token: ownerToken, method: 'PUT', body: details() })).status, 404);
  assert.equal((await call(`/buyers/${demoBuyer.id}`, { token: ownerToken, method: 'DELETE' })).status, 404);
  assert.deepEqual((await ownerDb.from('buyers').select('id').eq('id', demoBuyer.id)).data, []);
  const crossSave = await demoDb.rpc('save_buyer', { payload: { ...details(), id: own.id }, create_new: false });
  assert.equal(crossSave.error.code, 'PT404');
  const directOwnerPassword = await client(ownerPasswordToken).from('buyers').select('id');
  assert.deepEqual(directOwnerPassword.data, []);
  const anonymous = await createClient(config.API_URL, config.ANON_KEY).from('buyers').select('id');
  assert.ok(anonymous.error);
});
test('invalid child SQL rolls back its parent and audit record atomically', async () => {
  const id = `buyer-${randomUUID()}`;
  const invalid = { ...details(), id, phone: '09175550999', pickups: [{ id: 'invalid-child', branchName: '', branchAddress: 'Test', isDefault: true }] };
  const result = await demoDb.rpc('save_buyer', { payload: invalid, create_new: true });
  assert.equal(result.error.code, 'PT400');
  assert.deepEqual((await demoDb.from('buyers').select('id').eq('id', id)).data, []);
  assert.deepEqual((await demoDb.from('audit_logs').select('id').eq('buyer_id', id)).data, []);
});
test('owner backup inspection and restore preserve format, ownership, and existing rows', async () => {
  assert.equal((await call('/owner/backup')).status, 403);
  const response = await call('/owner/backup', { token: ownerToken }); assert.equal(response.status, 200);
  const backup = await response.json(); assert.equal(backup.format, 'district-wheels-owner-backup-v1');
  assert.equal(backup.owner_id, owner.id); assert.ok(backup.buyers.length > 0);
  const original = backup.buyers[0];
  original.name = 'Must Never Overwrite';
  const missing = structuredClone(original); missing.id = `buyer-${randomUUID()}`; missing.phone = '09175550888';
  for (const pickup of missing.pickup_locations) pickup.id = `pickup-${randomUUID()}`;
  backup.buyers.push(missing); createdBuyers.push(missing.id);
  const inspect = await call('/owner/backup/inspect', { token: ownerToken, method: 'POST', body: backup });
  assert.equal(inspect.status, 200); assert.equal((await inspect.json()).missing_buyers, 1);
  assert.equal((await ownerDb.from('buyers').select('id').eq('id', missing.id)).data.length, 0);
  const restored = await call('/owner/backup/restore', { token: ownerToken, method: 'POST', body: backup });
  assert.equal(restored.status, 200); assert.equal((await restored.json()).restored_buyers, 1);
  assert.notEqual((await ownerDb.from('buyers').select('name').eq('id', original.id).single()).data.name, 'Must Never Overwrite');
  backup.owner_id = config.demoId;
  assert.equal((await call('/owner/backup/restore', { token: ownerToken, method: 'POST', body: backup })).status, 400);
  assert.equal((await ownerDb.rpc('restore_owner_backup', { payload: { format: backup.format, buyers: [] }, dry_run: true })).error.code, 'PT400');
});
test('database quota enforces 120 requests atomically, resets, and cannot be edited by callers', async () => {
  await sql.query('begin');
  try {
    await sql.query('delete from private.api_request_limits where user_id=$1', [config.demoId]);
    await sql.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: config.demoId, role: 'authenticated' })]);
    await sql.query('set local role authenticated');
    for (let i = 1; i <= 120; i++) {
      const { rows } = await sql.query('select public.claim_api_request_slot() as quota');
      assert.equal(rows[0].quota.allowed, true); assert.equal(rows[0].quota.remaining, 120-i);
    }
    assert.equal((await sql.query('select public.claim_api_request_slot() as quota')).rows[0].quota.allowed, false);
    assert.equal((await sql.query("select has_table_privilege('authenticated','private.api_request_limits','update') as allowed")).rows[0].allowed, false);
    await sql.query('reset role');
    await sql.query("update private.api_request_limits set window_start=now()-interval '61 seconds' where user_id=$1", [config.demoId]);
    assert.equal((await sql.query('select public.claim_api_request_slot() as quota')).rows[0].quota.remaining, 119);
  } finally { await sql.query('rollback'); }
});
