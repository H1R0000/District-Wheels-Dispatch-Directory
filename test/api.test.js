import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.js';

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('health endpoint reports ok', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('buyer search matches names case-insensitively', async () => {
  const response = await fetch(`${baseUrl}/api/buyers?q=maria`);
  const results = await response.json();
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Maria Santos');
  assert.equal('addresses' in results[0], false);
});

test('unknown buyer returns 404', async () => {
  const response = await fetch(`${baseUrl}/api/buyers/missing`);
  assert.equal(response.status, 404);
});
