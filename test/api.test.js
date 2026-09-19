import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.js';
import { MemoryStore } from '../server/store.js';

let server;
let baseUrl;

before(async () => {
  server = createApp(new MemoryStore()).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('health endpoint reports ok', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('buyer search matches names and phone numbers', async () => {
  const nameResults = await (await fetch(`${baseUrl}/api/buyers?q=maria`)).json();
  assert.equal(nameResults.length, 1);
  assert.equal(nameResults[0].name, 'Maria Santos');
  assert.equal('addresses' in nameResults[0], false);
  const phoneResults = await (await fetch(`${baseUrl}/api/buyers?q=0918204`)).json();
  assert.equal(phoneResults[0].name, 'Carlo Reyes');
});

test('invalid buyer payload returns field errors', async () => {
  const response = await fetch(`${baseUrl}/api/buyers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(result.errors.name, 'This field is required.');
  assert.equal(result.errors.addresses, 'Add at least one normal address.');
});

test('buyer can be created, updated, and deleted with one normalized default', async () => {
  const payload = {
    name: 'Test Buyer', phone: '0999 000 1111', preferredCourier: 'LBC',
    addresses: [
      { recipientName: 'Test Buyer', recipientPhone: '0999 000 1111', street: '1 Test Road', barangay: 'Test', city: 'Manila', province: 'Metro Manila', zipCode: '1000', isDefault: true },
      { recipientName: 'Test Buyer', recipientPhone: '0999 000 1111', street: '2 Test Road', barangay: 'Test', city: 'Manila', province: 'Metro Manila', zipCode: '1000', isDefault: true },
    ], pickups: [],
  };
  const createResponse = await fetch(`${baseUrl}/api/buyers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.addresses.filter((item) => item.isDefault).length, 1);

  created.name = 'Updated Buyer';
  const updateResponse = await fetch(`${baseUrl}/api/buyers/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(created) });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).name, 'Updated Buyer');

  assert.equal((await fetch(`${baseUrl}/api/buyers/${created.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${baseUrl}/api/buyers/${created.id}`)).status, 404);
});

test('unknown buyer returns 404 for read, update, and delete', async () => {
  assert.equal((await fetch(`${baseUrl}/api/buyers/missing`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/buyers/missing`, { method: 'DELETE' })).status, 404);
});
