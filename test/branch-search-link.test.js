import assert from 'node:assert/strict';
import test from 'node:test';
import { googleBranchSearchUrl } from '../supabase/functions/dispatch-assistant/branch-search-link.ts';

test('Google branch link searches only the branch and location', () => {
  const url = new URL(googleBranchSearchUrl('Robinsons Otis', 'Paco Manila'));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), 'LBC Robinsons Otis Paco Manila Philippines branch address');
});

test('Google branch link removes phone numbers and buyer details', () => {
  const url = new URL(googleBranchSearchUrl('Arayat buyer Ana Reyes 09171234567', 'Quezon City\nPhone: 09171234567'));
  const query = url.searchParams.get('q');
  assert.match(query, /LBC Arayat Quezon City/);
  assert.doesNotMatch(query, /Ana|09171234567|Phone/);
  assert.equal(googleBranchSearchUrl(''), null);
});
