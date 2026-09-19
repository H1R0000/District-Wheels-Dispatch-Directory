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
  const phoneResults = await (await fetch(`${baseUrl}/api/buyers?q=${encodeURIComponent('(0918) 204')}`)).json();
  assert.equal(phoneResults[0].name, 'Carlo Reyes');
});

test('buyer directory is alphabetical by name', async () => {
  const buyers = await (await fetch(`${baseUrl}/api/buyers`)).json();
  assert.deepEqual(buyers.map((buyer) => buyer.name), ['Angela Cruz', 'Carlo Reyes', 'Maria Santos']);
});

test('invalid buyer payload returns field errors', async () => {
  const response = await fetch(`${baseUrl}/api/buyers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(result.errors.name, 'This field is required.');
  assert.equal(result.errors.preferredCourier, 'Choose a supported courier.');
});

test('J&T requires a complete address', async () => {
  const response = await fetch(`${baseUrl}/api/buyers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'J&T Buyer', phone: '0918 000 0000', preferredCourier: 'J&T Express', addresses: [], pickups: [] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).errors.addresses, 'Add a complete J&T delivery address.');
});

test('LBC branch pickup reuses the buyer name and phone', async () => {
  const payload = { name: 'Pickup Buyer', phone: '(0917) 180 3828', preferredCourier: 'LBC', addresses: [], pickups: [{ branchName: 'LBC Test Branch', branchAddress: '1 Branch Road, Manila', isDefault: true }] };
  const createResponse = await fetch(`${baseUrl}/api/buyers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.addresses.length, 0);
  assert.equal(created.pickups[0].recipientName, 'Pickup Buyer');
  assert.equal(created.phone, '09171803828');
  assert.equal(created.pickups[0].recipientPhone, '09171803828');
  await fetch(`${baseUrl}/api/buyers/${created.id}`, { method: 'DELETE' });
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
  created.phone = '(0917) 180 3828';
  const updateResponse = await fetch(`${baseUrl}/api/buyers/${created.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(created) });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.name, 'Updated Buyer');
  assert.equal(updated.phone, '09171803828');
  assert.equal(updated.addresses[0].recipientPhone, '09171803828');

  assert.equal((await fetch(`${baseUrl}/api/buyers/${created.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${baseUrl}/api/buyers/${created.id}`)).status, 404);
});

test('unknown buyer returns 404 for read, update, and delete', async () => {
  assert.equal((await fetch(`${baseUrl}/api/buyers/missing`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/buyers/missing`, { method: 'DELETE' })).status, 404);
});
