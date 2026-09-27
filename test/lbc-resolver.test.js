import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmedBranchClues, confirmedBranchForBuyerReply, extractLbcClues, parsePickupAddressFollowUp, parsePickupConfirmation, parsePickupMessage, resolveLbcBranch, searchTerms } from '../supabase/functions/dispatch-assistant/lbc-resolver.ts';
import { googleBranchSearchUrl } from '../supabase/functions/dispatch-assistant/branch-search-link.ts';

const arayat = ['LBC Express - ARAYAT', '39 ARAYAT COR. MALABITO ST., CUBAO, QUEZON CITY'];
const pampanga = ['LBC Express - ARAYAT PAMPANGA', 'CACUTUD, ARAYAT, PAMPANGA'];
const otis = ['LBC Express - ROBINSONS OTIS', 'UNIT 118-119 G/F, ROBINSONS OTIS, PACO, MANILA CITY'];

function page(entries) {
  return entries.map(([name, address]) => `<span class="csc-branch-list-1">${name}</span><span class="csc-branch-list-2">${address}</span>`).join('');
}

async function officialFixture(url) {
  const term = decodeURIComponent(url.split('/').at(-1)).toLowerCase();
  const entries = term === 'arayat' ? [arayat, pampanga, arayat, pampanga]
    : term === 'robinsons otis' ? [otis, otis]
      : term === 'metro manila' ? [arayat, otis]
        : term === 'pampanga' ? [pampanga] : [];
  return { ok: true, text: async () => page(entries) };
}

test('extracts only LBC branch details from a buyer message', () => {
  assert.deepEqual(extractLbcClues('Name: Gabriel Villamor\nContact No: 09690535099\nLBC Branch: LBC Express Arayat Cubao Quezon City\nlbc branch pickup'), {
    name: 'LBC Express Arayat Cubao Quezon City',
    address: undefined,
  });
});

test('extracts a standalone branch-name lookup', () => {
  assert.deepEqual(extractLbcClues('What is the LBC branch address of Arayat Cubao Quezon City?'), { name: 'Arayat Cubao Quezon City' });
});

test('extracts an inline branch name from an unstructured buyer request', () => {
  assert.deepEqual(extractLbcClues('Add buyer John with LBC Arayat Cubao Quezon City branch pickup'), { name: 'Arayat Cubao Quezon City' });
});

test('branch name plus city fills the official address and rejects the similarly named province branch', async () => {
  const result = await resolveLbcBranch({ name: 'LBC Express Arayat Cubao Quezon City' }, officialFixture);
  assert.equal(result.kind, 'match');
  assert.deepEqual([result.branch.branch_name, result.branch.branch_address], arayat);
});

test('branch address fills the official name', async () => {
  const result = await resolveLbcBranch({ address: '39 Arayat cor. Malabito St., Cubao, Quezon City' }, officialFixture);
  assert.equal(result.kind, 'match');
  assert.deepEqual([result.branch.branch_name, result.branch.branch_address], arayat);
});

test('mall address fills the official branch name', async () => {
  const result = await resolveLbcBranch({ address: 'UNIT 118-119 GROUND FLOOR, ROBINSONS OTIS, PACO MANILA' }, officialFixture);
  assert.equal(result.kind, 'match');
  assert.deepEqual([result.branch.branch_name, result.branch.branch_address], otis);
});

test('conflicting name and address require a choice', async () => {
  const result = await resolveLbcBranch({ name: 'LBC Express Arayat Cubao Quezon City', address: 'UNIT 118-119 G/F, ROBINSONS OTIS, PACO, MANILA CITY' }, officialFixture);
  assert.equal(result.kind, 'ambiguous');
});

test('uses a recently verified cache entry when the official page is unavailable', async () => {
  const cached = { branch_name: arayat[0], branch_address: arayat[1], source_url: 'https://www.lbcexpress.com/branches-philippines/ARAYAT', verified_at: new Date().toISOString() };
  const result = await resolveLbcBranch({ name: 'Arayat Cubao Quezon City' }, async () => { throw new Error('offline'); }, { cachedBranches: [cached] });
  assert.equal(result.kind, 'match');
  assert.deepEqual(result.branch, cached);
});

test('does not auto-fill a stale cache entry', async () => {
  const cached = { branch_name: arayat[0], branch_address: arayat[1], source_url: 'https://www.lbcexpress.com/branches-philippines/ARAYAT', verified_at: '2020-01-01T00:00:00Z' };
  const result = await resolveLbcBranch({ name: 'Arayat Cubao Quezon City' }, async () => { throw new Error('offline'); }, { cachedBranches: [cached] });
  assert.equal(result.kind, 'unavailable');
});

test('does not auto-fill a cached branch when its name and address clues conflict', async () => {
  const cached = { branch_name: arayat[0], branch_address: arayat[1], source_url: 'https://www.lbcexpress.com/branches-philippines/ARAYAT', verified_at: new Date().toISOString() };
  const result = await resolveLbcBranch({ name: 'Arayat Cubao Quezon City', address: otis[1] }, async () => { throw new Error('offline'); }, { cachedBranches: [cached] });
  assert.notEqual(result.kind, 'match');
});

test('plain LBC pickup messages become reviewable buyer drafts', () => {
  assert.deepEqual(parsePickupMessage('Sample Buyer One\nLBC Express - A. Tuazon\nMarikina, Metro Manila\n+639171234567'), {
    name: 'Sample Buyer One', phone: '09171234567', branchName: 'A. Tuazon', locationHint: 'Marikina, Metro Manila',
  });
  assert.deepEqual(parsePickupMessage('Sample Buyer Two\n09171234568\nImall Canlubang, Calamba City Laguna'), {
    name: 'Sample Buyer Two', phone: '09171234568', branchName: 'Imall Canlubang', locationHint: 'Calamba City, Laguna',
  });
  assert.deepEqual(parsePickupMessage('Sample Buyer Three\nLbc puregold hugo perez trece martires city\n09171234569'), {
    name: 'Sample Buyer Three', phone: '09171234569', branchName: 'puregold hugo perez trece martires city', locationHint: '',
  });
});

test('multiline LBC pickup keeps buyer identity out of branch search', () => {
  const message = 'add buyer\nlbc branch pickup\nRiz Lawrence Quejada\n09568142493\nImall Canlubang, Calamba City Laguna';
  const expected = { name: 'Riz Lawrence Quejada', phone: '09568142493', branchName: 'Imall Canlubang', locationHint: 'Calamba City, Laguna' };
  assert.deepEqual(parsePickupMessage(message), expected);
  assert.deepEqual(extractLbcClues(message), { name: expected.branchName, location: expected.locationHint });
  const query = new URL(googleBranchSearchUrl(expected.branchName, expected.locationHint)).searchParams.get('q');
  assert.match(query, /Imall Canlubang/);
  assert.match(query, /Calamba/);
  assert.doesNotMatch(query, /Riz|Lawrence|Quejada|09568142493/);
  assert.deepEqual(parsePickupMessage('Imall Canlubang, Calamba City Laguna\n09568142493\nlbc branch pickup\nRiz Lawrence Quejada'), expected);
  assert.deepEqual(extractLbcClues('lbc branch pickup\nRiz Lawrence Quejada\n09568142493'), {});
});

test('correct confirms only the immediately preceding sourced LBC branch', () => {
  const messages = [
    { role: 'user', content: 'Find LBC Arayat Cubao Quezon City' },
    { role: 'assistant', content: 'LBC Express - ARAYAT\n39 ARAYAT COR. MALABITO ST., CUBAO, QUEZON CITY\nSource: https://www.lbcexpress.com/branches-philippines/Arayat' },
    { role: 'user', content: 'correct' },
  ];
  assert.deepEqual(confirmedBranchClues(messages), { name: 'Arayat Cubao Quezon City' });
  assert.equal(confirmedBranchClues([...messages, { role: 'assistant', content: 'Anything else?' }, { role: 'user', content: 'correct' }]), null);
  assert.equal(confirmedBranchClues([messages[0], { role: 'assistant', content: 'LBC Express - ARAYAT\nNo official source' }, messages[2]]), null);
  const confirmed = { role: 'assistant', content: 'Confirmed LBC Express - ARAYAT.\n39 ARAYAT COR. MALABITO ST., CUBAO, QUEZON CITY\nSource: https://www.lbcexpress.com/branches-philippines/Arayat\nSend the buyer\'s name and phone number to prepare the pickup form.' };
  assert.equal(confirmedBranchForBuyerReply([confirmed, { role: 'user', content: 'Nilo Sample\n09170009993' }]), 'LBC Express - ARAYAT');
  assert.equal(confirmedBranchForBuyerReply([messages[1], { role: 'user', content: 'Nilo Sample\n09170009993' }]), null);
});

test('pickup parser leaves door-delivery messages to the normal assistant', () => {
  assert.equal(parsePickupMessage('Sample Buyer\n09171234567\n123 Sample Street, Calamba'), null);
  assert.equal(parsePickupMessage('add buyer\nJeff Baluyot\n09762646254\nLBC door to door - 0911 Peony st. Greenland Subd. Brgy. San Juan Cainta Rizal 1900'), null);
});

test('pickup parser accepts an add-buyer command before the pasted details', () => {
  assert.deepEqual(parsePickupMessage('add a buyer\nSample Buyer Seven\nLBC Marilag Branch JP Rizal Project 4 QC\n09171234563'), {
    name: 'Sample Buyer Seven', phone: '09171234563', branchName: 'Marilag Branch JP Rizal Project 4 QC', locationHint: '',
  });
});

test('address-only reply reuses the immediately preceding pickup request', () => {
  const messages = [
    { role: 'user', content: 'add a buyer\nSample Buyer Seven\nLBC Marilag Branch JP Rizal Project 4 QC\n09171234563' },
    { role: 'assistant', content: 'Please provide the LBC branch address.' },
    { role: 'user', content: 'Medical Center Compound, 83 JP Rizal St, Project 4, Quezon City, 1100 Metro Manila' },
  ];
  assert.deepEqual(parsePickupAddressFollowUp(messages), {
    ...parsePickupMessage(messages[0].content),
    branchAddress: 'Medical Center Compound, 83 JP Rizal St, Project 4, Quezon City, 1100 Metro Manila',
  });
  assert.equal(parsePickupAddressFollowUp([...messages.slice(0, 2), { role: 'user', content: 'yes' }]), null);
});

test('command-style Marilag pickup resolves to an official branch', async () => {
  const parsed = parsePickupMessage('add a buyer\nSample Buyer Seven\nLBC Marilag Branch JP Rizal Project 4 QC\n09171234563');
  const branch = ['LBC Express - MARILAG', '83 J.P. RIZAL ST., PROJECT 4, MARILAG, QUEZON CITY'];
  const fetchPage = async () => ({ ok: true, text: async () => page([branch]) });
  const result = await resolveLbcBranch({ name: parsed.branchName, location: parsed.locationHint }, fetchPage);
  assert.equal(result.kind, 'match');
  assert.deepEqual([result.branch.branch_name, result.branch.branch_address], branch);
});

test('the three short branch clues can resolve to official directory entries', async () => {
  const entries = [
    ['LBC Express - A. TUAZON', 'DOOR 1 & 2, MARIETTA ARCADE, G. FERNANDO AVENUE, MARIKINA CITY'],
    ['LBC Express - I MALL CANLUBANG', 'I MALL CANLUBANG, JOSE YULO SR. AVE., CALAMBA CITY, LAGUNA'],
    ['LBC Express - Puregold Hugo Perez', 'NEWHALL COMMERCIAL CENTER, HUGO PEREZ, TRECE MARTIRES CITY, CAVITE'],
  ];
  const fetchPage = async (url) => {
    const term = decodeURIComponent(url.split('/').at(-1)).toLowerCase();
    const matches = entries.filter(([name, address]) => `${name} ${address}`.toLowerCase().includes(term));
    return { ok: true, text: async () => page(matches) };
  };
  const inputs = [
    'Sample Buyer One\nLBC Express - A. Tuazon\nMarikina, Metro Manila\n+639171234567',
    'Sample Buyer Two\n09171234568\nImall Canlubang, Calamba City Laguna',
    'Sample Buyer Three\nLbc puregold hugo perez trece martires city\n09171234569',
  ];
  for (const [index, input] of inputs.entries()) {
    const parsed = parsePickupMessage(input);
    const result = await resolveLbcBranch({ name: parsed.branchName, location: parsed.locationHint }, fetchPage);
    assert.equal(result.kind, 'match');
    assert.equal(result.branch.branch_name, entries[index][0]);
  }
});

test('branch search uses the supplied place without a fixed province list', () => {
  assert.ok(searchTerms({ name: 'SM Seaside', location: 'Cebu City' }).includes('Cebu'));
  assert.ok(searchTerms({ name: 'Gaisano Mall Davao', location: 'Davao City' }).includes('Davao'));
  assert.ok(!searchTerms({ name: 'A. Tuazon', location: 'Marikina, Metro Manila' }).includes('METRO MANILA'));
});

test('a matching branch in another city is not selected', async () => {
  const entries = [
    ['LBC Express - CENTRAL MALL', 'CENTRAL MALL, CEBU CITY'],
    ['LBC Express - CENTRAL MALL', 'CENTRAL MALL, DAVAO CITY'],
  ];
  const fetchPage = async () => ({ ok: true, text: async () => page(entries) });
  const result = await resolveLbcBranch({ name: 'Central Mall', location: 'Davao City' }, fetchPage);
  assert.equal(result.kind, 'match');
  assert.equal(result.branch.branch_address, entries[1][1]);
});

test('Cebu and Davao pickup messages resolve through the same nationwide search', async () => {
  const entries = [
    ['LBC Express - SM SEASIDE', 'SM SEASIDE, CEBU CITY'],
    ['LBC Express - GAISANO MALL DAVAO', 'GAISANO MALL, DAVAO CITY'],
  ];
  const fetchPage = async (url) => {
    const term = decodeURIComponent(url.split('/').at(-1)).toLowerCase();
    return { ok: true, text: async () => page(entries.filter(([name]) => name.toLowerCase().includes(term))) };
  };
  for (const [message, expected] of [
    ['Sample Buyer Four\nLBC Express - SM Seaside\nCebu City\n09171234560', entries[0][0]],
    ['Sample Buyer Five\nLBC Express - Gaisano Mall Davao\nDavao City\n09171234561', entries[1][0]],
  ]) {
    const parsed = parsePickupMessage(message);
    const result = await resolveLbcBranch({ name: parsed.branchName, location: parsed.locationHint }, fetchPage);
    assert.equal(result.kind, 'match');
    assert.equal(result.branch.branch_name, expected);
  }
});

test('yes after an LBC pickup offer reuses the buyer details for a review draft', () => {
  const messages = [
    { role: 'user', content: 'Sample Buyer Six\n09171234562\nLBC Express - Marilag\nQuezon City' },
    { role: 'assistant', content: 'I can add this as an **LBC branch pickup** buyer with:\n\n- **Name:** Sample Buyer Six\n- **Phone:** 09171234562\n- **Branch:** LBC Express - Marilag\n- **Branch address:** Unverified landmark, Quezon City' },
    { role: 'user', content: 'yes' },
  ];
  assert.deepEqual(parsePickupConfirmation(messages), {
    name: 'Sample Buyer Six', phone: '09171234562', branchName: 'LBC Express - Marilag', locationHint: '',
  });
});

test('a confirmation only accepts the immediately preceding pickup offer', () => {
  const messages = [
    { role: 'assistant', content: 'I can add this as an **LBC branch pickup** buyer with:\n- **Name:** Sample Buyer\n- **Phone:** 09171234562\n- **Branch:** LBC Express - Marilag' },
    { role: 'assistant', content: 'What else would you like to do?' },
    { role: 'user', content: 'yes' },
  ];
  assert.equal(parsePickupConfirmation(messages), null);
});
