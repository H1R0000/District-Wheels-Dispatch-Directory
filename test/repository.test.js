import assert from 'node:assert/strict';
import test from 'node:test';
import { mapBuyer, SupabaseRepository } from '../server/supabase-repository.js';

test('repository preserves existing display-name formatting for buyer and recipients', () => {
  const buyer = mapBuyer({ id: 'buyer-test', name: 'ALICE EXAMPLE', phone: '09170000000', preferred_courier: 'LBC', addresses: [{ id: 'address-test', recipient_name: 'ALICE EXAMPLE' }], pickup_locations: [{ id: 'pickup-test', recipient_name: 'ALICE EXAMPLE' }] });
  assert.equal(buyer.name, 'Alice Example');
  assert.equal(buyer.addresses[0].recipientName, 'Alice Example');
  assert.equal(buyer.pickups[0].recipientName, 'Alice Example');
});
test('backup export pages past the server row cap and rejects more than 1000 buyers', async () => {
  for (const count of [1000, 1001]) {
    const ranges = [];
    const rows = Array.from({ length: count }, (_, index) => ({ id: `buyer-${index}` }));
    const db = { from(table) {
      assert.equal(table, 'buyers');
      const query = { select() { return query; }, eq(key, value) { assert.equal(key, 'owner_id'); assert.equal(value, 'owner-test'); return query; }, order() { return query; }, range(start, end) { ranges.push([start, end]); return Promise.resolve({ data: rows.slice(start, end+1), error: null }); } };
      return query;
    } };
    const repository = new SupabaseRepository(db, 'owner-test');
    if (count === 1000) assert.equal((await repository.exportBackup()).buyers.length, 1000);
    else await assert.rejects(repository.exportBackup(), (error) => error.status === 400);
    assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
  }
});
