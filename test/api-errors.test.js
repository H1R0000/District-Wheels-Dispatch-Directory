import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { ApiError } from '../server/errors.js';
async function withApi(context, run) {
  const app = createApp({ authenticate: async () => context, logger: { error() {} } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
const context = { role: 'demo', quota: { allowed: true, remaining: 119, retry_after: 60 } };
test('database failures return sanitized status codes and problem details', async () => {
  for (const [code, status] of [['23505', 409], ['PT404', 404], ['PT400', 400], ['42501', 403], ['PGRST000', 503], ['57014', 504], ['unknown', 500]]) {
    await withApi({ ...context, repository: { list() { throw { code, message: 'internal secret' }; } } }, async (base) => {
      const response = await fetch(`${base}/api/buyers`);
      const body = await response.json();
      assert.equal(response.status, status); assert.equal(body.status, status);
      assert.ok(body.correlationId); assert.doesNotMatch(JSON.stringify(body), /internal secret|stack/);
      assert.match(response.headers.get('content-type'), /application\/problem\+json/);
    });
  }
});
test('API quota returns 429 and retry headers before touching the repository', async () => {
  await withApi({ ...context, quota: { allowed: false, remaining: 0, retry_after: 35 } }, async (base) => {
    const response = await fetch(`${base}/api/buyers`);
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '35');
    assert.equal(response.headers.get('ratelimit-limit'), '120');
  });
});
test('backup routes enforce owner authorization before parsing large input', async () => {
  await withApi(context, async (base) => {
    for (const path of ['backup', 'backup/inspect', 'backup/restore']) {
      const response = await fetch(`${base}/api/owner/${path}`, { method: path === 'backup' ? 'GET' : 'POST', ...(path !== 'backup' ? { body: 'x'.repeat(2000001), headers: { 'Content-Type': 'application/json' } } : {}) });
      assert.equal(response.status, 403);
    }
  });
});
test('owner inspection and restore use separate dry-run flags; backup has its own size cap', async () => {
  const calls = [];
  await withApi({ ...context, role: 'owner', repository: { exportBackup: async () => ({ format: 'test' }), restoreBackup: async (body, dryRun) => { calls.push(dryRun); return { dryRun }; } } }, async (base) => {
    assert.equal((await fetch(`${base}/api/owner/backup`)).status, 200);
    for (const path of ['inspect', 'restore']) assert.equal((await fetch(`${base}/api/owner/backup/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'a'.repeat(110000) }) })).status, 200);
    assert.deepEqual(calls, [true, false]);
    assert.equal((await fetch(`${base}/api/owner/backup/inspect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'a'.repeat(2000001) }) })).status, 413);
  });
});
