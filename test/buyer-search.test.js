import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBuyerSearchFilter } from '../client/src/utils/buyerSearch.js';

test('name search does not add an empty phone filter', () => {
  assert.equal(buildBuyerSearchFilter('Hero'), 'name.ilike."%Hero%"');
});

test('formatted phone search also searches normalized digits', () => {
  assert.equal(
    buildBuyerSearchFilter('(0918) 204-7316'),
    'name.ilike."%(0918) 204-7316%",phone.ilike.%09182047316%',
  );
});

test('search safely quotes commas and double quotes', () => {
  assert.equal(
    buildBuyerSearchFilter('Santos, "Hero"'),
    'name.ilike."%Santos, \\"Hero\\"%"',
  );
});

test('blank search does not create a filter', () => {
  assert.equal(buildBuyerSearchFilter('   '), '');
});
