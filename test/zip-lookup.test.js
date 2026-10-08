import test from 'node:test';
import assert from 'node:assert/strict';
import { geographicZipLookup, postalMatches, zipLookupQuery, zipLookupReply } from '../supabase/functions/dispatch-assistant/zip-lookup.ts';

const rows = [
  { locality: 'Cainta', province: 'Rizal', postal_code: '1900' },
  { locality: 'San Juan', province: 'Metro Manila', postal_code: '1500' },
  { locality: 'San Juan', province: 'Batangas', postal_code: '4226' },
];

test('ordinary ZIP questions use the requested location without a model tool call', () => {
  assert.equal(zipLookupQuery('What is the ZIP code of Cainta Rizal?'), 'Cainta Rizal');
  assert.equal(zipLookupQuery('zip code for San Juan, Batangas'), 'San Juan, Batangas');
  assert.equal(zipLookupQuery('Find postal code for 1900'), '1900');
  assert.equal(zipLookupQuery('add buyer Ana Cruz ZIP code 1900'), null);
});

test('postal matches distinguish places with the same name and retain valid multiple results', () => {
  assert.deepEqual(postalMatches(rows, 'San Juan Batangas'), [rows[2]]);
  assert.deepEqual(postalMatches(rows, '1900'), [rows[0]]);
  assert.match(zipLookupReply(rows, 'San Juan'), /1500[\s\S]*4226/);
  assert.match(zipLookupReply(rows, 'Unknown City'), /could not verify/);
});

test('geographic fallback labels its source and matches the province without inventing a ZIP', async () => {
  const fixture = {
    cities: [{ name: 'City of Calamba', code: '0403405000', zip_code: '4027' }],
    municipalities: [{ name: 'Cainta', code: '0405805000', zip_code: '1900' }, { name: 'San Juan', code: '0401023000', zip_code: '4228' }, { name: 'No ZIP', code: '0405806000', zip_code: '' }],
    provinces: [{ name: 'Laguna', code: '0403400000' }, { name: 'Rizal', code: '0405800000' }, { name: 'Batangas', code: '0401000000' }],
  };
  const fetcher = async (url) => ({ ok: true, json: async () => fixture[url.split('/').at(-1)] });
  assert.deepEqual(await geographicZipLookup('Cainta Rizal', fetcher), [{ locality: 'Cainta', province: 'Rizal', postal_code: '1900', source_url: 'https://psgc.cloud/api-docs' }]);
  assert.deepEqual(await geographicZipLookup('Calamba City Laguna', fetcher), [{ locality: 'Calamba', province: 'Laguna', postal_code: '4027', source_url: 'https://psgc.cloud/api-docs' }]);
  assert.deepEqual(await geographicZipLookup('No ZIP', fetcher), []);
});
