import assert from 'node:assert/strict';
import test from 'node:test';
import { draftEvidenceError } from '../supabase/functions/dispatch-assistant/draft-evidence.ts';

const userText = [
  'Name: Ana Reyes',
  'Phone: 09171234567',
  'Street: 12 Mabini St',
  'Barangay: San Isidro',
  'City: Quezon City',
  'Province: Metro Manila',
  'ZIP: 1100',
].join('\n');

const doorDraft = {
  name: 'Ana Reyes', phone: '09171234567', method: 'door',
  address: { street: '12 Mabini St', barangay: 'San Isidro', city: 'Quezon City', province: 'Metro Manila', zip_code: '1100' },
};

test('accepts a door draft whose details were supplied by the user', () => {
  assert.equal(draftEvidenceError(doorDraft, userText), null);
});

test('rejects a made-up ZIP code even when another ZIP was supplied', () => {
  assert.match(draftEvidenceError({ ...doorDraft, address: { ...doorDraft.address, zip_code: '1101' } }, userText), /ZIP code/);
});

test('rejects an inferred province and missing name or phone', () => {
  assert.match(draftEvidenceError({ ...doorDraft, address: { ...doorDraft.address, province: 'Laguna' } }, userText), /province/);
  assert.match(draftEvidenceError({ ...doorDraft, name: 'Maria Reyes' }, userText), /buyer name/);
  assert.match(draftEvidenceError({ ...doorDraft, phone: '09179999999' }, userText), /buyer phone/);
});

test('accepts the same Philippine mobile number in +63 and 09 formats', () => {
  assert.equal(draftEvidenceError(doorDraft, userText.replace('09171234567', '+63 917 123 4567')), null);
});

test('requires user evidence for an unverified pickup branch pair', () => {
  const pickup = { name: 'Ana Reyes', phone: '09171234567', method: 'pickup', pickup: { branch_name: 'LBC Arayat', branch_address: '39 Arayat St, Quezon City' } };
  const pickupText = `${userText}\nBranch: LBC Arayat`;
  assert.match(draftEvidenceError(pickup, pickupText), /branch address/);
  assert.equal(draftEvidenceError(pickup, pickupText, true), null);
});
