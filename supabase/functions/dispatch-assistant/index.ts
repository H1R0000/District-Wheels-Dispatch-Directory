import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/http.ts';
import { confirmedBranchClues, confirmedBranchForBuyerReply, extractLbcClues, parsePickupAddressFollowUp, parsePickupConfirmation, parsePickupMessage, resolveLbcBranch, searchTerms, type LbcBranch } from './lbc-resolver.ts';
import { draftEvidenceError } from './draft-evidence.ts';
import { chooseDeliveryMethod } from './delivery-method.ts';
import { googleBranchSearchUrl } from './branch-search-link.ts';
import { buyerChoicesMessage, selectBuyer } from './buyer-selection.ts';
import { editEvidenceError } from './edit-evidence.ts';
import { doorAddressZip, parseDoorAddress, parseDoorAddressWithPostalRows, parsePartialDoorAddress } from './door-address.ts';
import { doorBuyerSource, parseBuyerIdentity } from './buyer-input.ts';
import { parseBuyerAction } from './buyer-action.ts';
import { geographicZipLookup, postalMatches, zipLookupQuery, zipLookupReply } from './zip-lookup.ts';

const tools = [
  { type: 'function', function: { name: 'search_buyers', description: 'Find buyers by name or phone before editing or deleting.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'add_buyer', description: 'Prepare a buyer draft for human review. The server determines LBC delivery method from the user choice. LBC door delivery requires a complete address; LBC branch pickup requires branch name and address. J&T requires a complete address.', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, preferred_courier: { type: 'string', enum: ['LBC', 'J&T Express'] }, address: { type: 'object', properties: { street: { type: 'string' }, barangay: { type: 'string' }, city: { type: 'string' }, province: { type: 'string' }, zip_code: { type: 'string' } } }, pickup: { type: 'object', properties: { branch_name: { type: 'string' }, branch_address: { type: 'string' } } } }, required: ['name', 'phone', 'preferred_courier'] } } },
  { type: 'function', function: { name: 'edit_buyer', description: 'After search_buyers finds one exact buyer, prepare only the changes the user requested for the edit form. Never invent a field or copy unchanged fields into this patch. This does not save.', parameters: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' }, preferred_courier: { type: 'string', enum: ['LBC', 'J&T Express'] }, address: { type: 'object', properties: { street: { type: 'string' }, barangay: { type: 'string' }, city: { type: 'string' }, province: { type: 'string' }, zip_code: { type: 'string' } } }, pickup: { type: 'object', properties: { branch_name: { type: 'string' }, branch_address: { type: 'string' } } } }, required: ['id'] } } },
  { type: 'function', function: { name: 'delete_buyer', description: 'Prepare deletion of exactly one buyer. This only creates a confirmation code; it never deletes immediately.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'lookup_zip', description: 'Look up a Philippine ZIP code by city or municipality.', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } } },
  { type: 'function', function: { name: 'search_lbc_branch', description: 'Find verified LBC branch names and addresses.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
];
const phone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
};
const filled = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const addressFields = ['street', 'barangay', 'city', 'province', 'zip_code'];

Deno.serve(async (request) => {
  const headers = cors(request);
  if (!headers) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ message: 'Method not allowed' }, 405, headers);
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (!auth.user) return json({ message: 'Sign in again.' }, 401, headers);
    const { data: profile } = await db.from('profiles').select('role,is_demo').eq('id', auth.user.id).maybeSingle();
    if (!profile) return json({ message: 'This account is not approved.' }, 403, headers);
    const apiKey = Deno.env.get('GROQ_API_KEY');
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!messages.length) return json({ message: 'Send a message first.' }, 400, headers);
    const latest = String(messages.at(-1)?.content ?? '').trim();
    const confirmation = latest.match(/^DELETE\s+([A-F0-9]{8})$/i);
    if (confirmation) {
      const { data, error } = await db.rpc('confirm_buyer_deletion', { confirmation_code: confirmation[1] });
      if (error || !data?.name) return json({ message: 'That deletion confirmation is invalid or expired. Ask me to delete the buyer again.' }, 200, headers);
      const destination = data.destination;
      const details = destination?.branch_name
        ? `LBC branch pickup — ${destination.branch_name}, ${destination.branch_address}`
        : destination ? `${data.courier ?? 'Door delivery'} door to door — ${[destination.street, destination.barangay, destination.city, destination.province, destination.zip_code].filter(Boolean).join(', ')}` : '';
      return json({ message: `Deleted ${data.name} (${data.phone}).${details ? `\n${details}` : ''}`, deletedBuyer: { name: data.name, phone: data.phone } }, 200, headers);
    }
    const userMessages = messages.filter((message: any) => message?.role === 'user').map((message: any) => String(message.content ?? ''));
    const userText = userMessages.join('\n');
    let parsedPickup = parsePickupMessage(latest) ?? parsePickupAddressFollowUp(messages) ?? parsePickupConfirmation(messages);
    const deliveryChoice = chooseDeliveryMethod(messages, Boolean(parsedPickup));
    const chosenDelivery = deliveryChoice === 'door' || deliveryChoice === 'pickup' ? deliveryChoice : null;
    const history: any[] = [{ role: 'system', content: `You are the District Wheels Dispatch Assistant. Use tools for every buyer action, ZIP code, or LBC lookup. Never invent records, lookup results, buyer names, phone numbers, addresses, or ZIP codes. Never use placeholder buyer details; ask the user for missing values. Search before editing or deleting. If multiple buyers match, ask for their exact phone number. The delete_buyer tool only prepares a deletion and returns instructions for a separate confirmation message. Never say the buyer was deleted until that separate confirmation succeeds. Use only the minimum data needed. The add_buyer tool prepares a draft; the user reviews and saves it in the form. The edit_buyer tool prepares only user-requested changes for the edit form; it does not save. Never claim a draft or edit was saved. Recognize JNT or J&T as J&T Express. The user's latest delivery choice is ${deliveryChoice ?? 'not stated'}; this choice overrides older messages and your own inference. If the LBC method is ambiguous or missing, ask whether it is Door to door or Branch pickup. For door delivery, collect street or house address, barangay, city, province, and ZIP code. Never invent a street, building, or barangay. For LBC branch pickup, a verified official directory match will supply both the canonical branch name and address. Never ask the user for the missing side of a verified branch pair. If several matches are possible, ask the user to choose. J&T uses door delivery. Ask only for missing details. When a tool reports an error, explain it and ask for the needed correction.` }, ...messages];

    async function officialZipLookup(query: string) {
      const response = await fetch('https://phlpost.gov.ph/zip-code-locator/', { headers: { 'User-Agent': 'DistrictWheels/1.0' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { error: `PHLPost lookup failed (${response.status}).` };
      const html = await response.text();
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
        [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
          cell[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
        )
      ).filter((cells) => cells.length >= 4);
      return postalMatches(rows.map(([region, province, locality, postal_code]) => ({ region, province, locality, postal_code, source_url: 'https://phlpost.gov.ph/zip-code-locator/' })), query).slice(0, 11);
    }

    async function findLbcBranch(lookup: { name?: string; address?: string; location?: string }) {
      const cached = new Map<string, LbcBranch>();
      const terms = searchTerms(lookup).map((term) => term.replace(/[%_,()]/g, '').trim()).filter(Boolean).slice(0, 2);
      for (const term of terms) {
        const [names, addresses] = await Promise.all([
          db.from('lbc_branches').select('branch_name,branch_address,source_url,verified_at').ilike('branch_name', `%${term}%`).limit(100),
          db.from('lbc_branches').select('branch_name,branch_address,source_url,verified_at').ilike('branch_address', `%${term}%`).limit(100),
        ]);
        for (const branch of [...(names.data ?? []), ...(addresses.data ?? [])]) {
          cached.set(`${branch.branch_name}|${branch.branch_address}`, branch);
        }
      }
      return resolveLbcBranch(lookup, fetch, {
        cachedBranches: [...cached.values()],
        onVerified: async (branches) => {
          const unique = [...new Map(branches.map((branch) => [`${branch.branch_name}|${branch.branch_address}`, branch])).values()];
          const cacheDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
          const { error } = await cacheDb.from('lbc_branches').upsert(unique.map((branch) => ({
            ...branch, verified_at: new Date().toISOString(),
          })), { onConflict: 'branch_name,branch_address' });
          if (error) console.error('LBC cache update failed:', error.message);
        },
      });
    }

    const lbcSource = (branch: LbcBranch) => `Source: ${branch.source_url}${branch.verified_at ? `\nLast verified: ${branch.verified_at.slice(0, 10)}` : ''}`;

    let confirmedBranch: LbcBranch | null = null;
    const confirmationClues = confirmedBranchClues(messages);
    if (confirmationClues) {
      const resolution = await findLbcBranch(confirmationClues);
      if (resolution.kind === 'ambiguous') return json({ message: 'Several LBC branches match. Choose the exact one below.', branchChoices: resolution.branches, googleSearchUrl: googleBranchSearchUrl(confirmationClues.name, confirmationClues.location) }, 200, headers);
      if (resolution.kind !== 'match') return json({ message: 'I could not verify that LBC branch right now. Please check its name and address before using it for pickup.', googleSearchUrl: googleBranchSearchUrl(confirmationClues.name, confirmationClues.location) }, 200, headers);
      const shownBranchName = String(messages.at(-2)?.content ?? '').split(/\r?\n/)[0].trim();
      if (resolution.branch.branch_name !== shownBranchName) return json({ message: 'The branch result changed. Please look it up again before confirming it.' }, 200, headers);
      confirmedBranch = resolution.branch;
      const priorRequest = messages.slice(-7, -1).reverse().find((message: any) => message?.role === 'user' && parsePickupMessage(String(message.content ?? '')));
      const priorPickup = priorRequest && parsePickupMessage(String(priorRequest.content ?? ''));
      if (priorPickup) {
        const priorResolution = await findLbcBranch({ name: priorPickup.branchName, location: priorPickup.locationHint });
        if (priorResolution.kind === 'match' && priorResolution.branch.branch_name === confirmedBranch.branch_name && priorResolution.branch.branch_address === confirmedBranch.branch_address) parsedPickup = priorPickup;
      }
      if (!parsedPickup) return json({ message: `Confirmed ${confirmedBranch.branch_name}.\n${confirmedBranch.branch_address}\n${lbcSource(confirmedBranch)}\nSend the buyer's name and phone number to prepare the pickup form.`, sourceUrl: confirmedBranch.source_url, googleSearchUrl: googleBranchSearchUrl(confirmationClues.name, confirmationClues.location) }, 200, headers);
    }
    const confirmedNameForReply = confirmedBranchForBuyerReply(messages);
    const buyerReply = confirmedNameForReply && parseBuyerIdentity(latest);
    if (buyerReply) {
      const resolution = await findLbcBranch({ name: confirmedNameForReply });
      if (resolution.kind !== 'match' || resolution.branch.branch_name !== confirmedNameForReply) return json({ message: 'I could not verify the confirmed branch again. Please look it up before preparing this buyer.' }, 200, headers);
      confirmedBranch = resolution.branch;
      parsedPickup = { ...buyerReply, branchName: confirmedBranch.branch_name, locationHint: '' };
    }

    const pastedPickup = confirmedBranch && parsedPickup ? parsedPickup : deliveryChoice === 'pickup' ? parsedPickup : null;
    if (deliveryChoice === 'ambiguous' && /\b(?:add|create|save)\b[\s\S]*\bbuyer\b/i.test(latest)) {
      return json({ message: 'For this LBC buyer, choose Door to door or Branch pickup before I prepare the form.' }, 200, headers);
    }
    if (!deliveryChoice && /\b(?:add|create|save)\s+(?:a\s+)?(?:new\s+)?(?:lbc\s+)?buyer\b/i.test(latest) && /\blbc\b/i.test(latest)) {
      return json({ message: 'For this LBC buyer, is delivery Door to door or Branch pickup?' }, 200, headers);
    }
    if (pastedPickup) {
      const { data: existing, error: duplicateError } = await db.from('buyers')
        .select('id,name').eq('phone', pastedPickup.phone).maybeSingle();
      if (duplicateError) return json({ message: 'I could not check for an existing buyer. Please try again.' }, 500, headers);
      if (existing) return json({
        message: `${existing.name} already uses this phone number. Open that buyer to review or add another pickup location.`,
        existingBuyerId: existing.id,
      }, 200, headers);

      const resolution = confirmedBranch ? { kind: 'match' as const, branch: confirmedBranch } : await findLbcBranch({ name: pastedPickup.branchName, address: pastedPickup.branchAddress, location: pastedPickup.locationHint });
      if (resolution.kind === 'ambiguous') return json({
        message: 'Several LBC branches match. Choose the exact branch below.',
        branchChoices: resolution.branches,
        googleSearchUrl: googleBranchSearchUrl(pastedPickup.branchName, pastedPickup.locationHint),
      }, 200, headers);
      const verified = resolution.kind === 'match' ? resolution.branch : null;
      const draft = {
        name: pastedPickup.name,
        phone: pastedPickup.phone,
        preferredCourier: 'LBC',
        deliveryMethod: 'pickup',
        branchName: verified?.branch_name ?? pastedPickup.branchName,
        branchAddress: verified?.branch_address ?? pastedPickup.branchAddress ?? '',
      };
      const notice = verified
        ? `Matched ${verified.branch_name} in LBC's directory. Review the details before saving.`
        : pastedPickup.branchAddress
            ? 'I filled in the address you provided, but could not verify the LBC branch. Review it before saving.'
            : 'I filled in the buyer details, but could not verify the LBC branch. Enter its complete address before saving.';
      const googleSearchUrl = googleBranchSearchUrl(pastedPickup.branchName, pastedPickup.locationHint);
      return json({ message: notice, draft, sourceUrl: verified?.source_url ?? null, googleSearchUrl }, 200, headers);
    }

    let resolvedPickup: LbcBranch | null = null;
    const verifiedPickupPairs = new Set<string>();
    const pickupPair = (branch: { branch_name: string; branch_address: string }) => `${branch.branch_name}|${branch.branch_address}`;
    const branchContext = chosenDelivery === 'pickup';
    const clues = extractLbcClues(latest);
    const standaloneBranchLookup = /\blbc\b/i.test(latest) && !/\b(?:add|edit|update|buyer|customer|door\s*to\s*door)\b/i.test(latest);
    const shouldResolve = (standaloneBranchLookup || (deliveryChoice !== 'door' && deliveryChoice !== 'ambiguous'))
      && Boolean(clues && (branchContext || /\blbc\b/i.test(latest)) && /\b(?:lbc|branch|pickup|address|provide|that)\b/i.test(latest));
    if (shouldResolve && clues) {
      const resolution = await findLbcBranch(clues);
      if (resolution.kind === 'match') {
        resolvedPickup = resolution.branch;
        verifiedPickupPairs.add(pickupPair(resolvedPickup));
        history[0].content += ` The official LBC directory verifies this branch pair: name "${resolvedPickup.branch_name}", address "${resolvedPickup.branch_address}", source ${resolvedPickup.source_url}. Use both fields when adding an LBC pickup buyer. Never ask the user for the other field.`;
        if (standaloneBranchLookup) {
          return json({ message: `${resolvedPickup.branch_name}\n${resolvedPickup.branch_address}\n${lbcSource(resolvedPickup)}`, sourceUrl: resolvedPickup.source_url, googleSearchUrl: googleBranchSearchUrl(resolvedPickup.branch_name) }, 200, headers);
        }
      } else if (resolution.kind === 'ambiguous') {
        return json({ message: 'I found more than one LBC branch. Choose the exact branch below.', branchChoices: resolution.branches, googleSearchUrl: googleBranchSearchUrl(clues.name, clues.location) }, 200, headers);
      } else if (resolution.kind === 'unavailable') {
        return json({ message: 'The official LBC directory is unavailable right now. You can check Google and paste the branch name and address here for review.', googleSearchUrl: googleBranchSearchUrl(clues.name, clues.location) }, 200, headers);
      } else {
        return json({ message: 'I could not verify that LBC branch in the official directory. You can check Google and paste the branch name and address here for review.', googleSearchUrl: googleBranchSearchUrl(clues.name, clues.location) }, 200, headers);
      }
    }
    const suppliedPhoneNumbers = (userText.match(/(?:\+?\d[\d \t().-]{5,24}\d)/g) ?? []).map(phone).filter((value) => value.length >= 7 && value.length <= 15);
    if (/\badd\s+(?:a\s+)?buyer\b/i.test(latest) && !suppliedPhoneNumbers.length) {
      const branchNote = resolvedPickup ? `I found the LBC branch: ${resolvedPickup.branch_name} — ${resolvedPickup.branch_address}\nSource: ${resolvedPickup.source_url}\n\n` : '';
      return json({ message: `${branchNote}Please provide the buyer's phone number before I add the record.` }, 200, headers);
    }

    let lastBranchGoogleUrl: string | null = null;
    let selectedBuyerId: string | null = null;
    let buyerSearchMessage: string | null = null;
    let verifiedPublic: Record<string, string> = {};
    let publicSourceUrl: string | null = null;
    async function runTool(name: string, args: any) {
      if (name === 'search_buyers') {
        selectedBuyerId = null;
        const query = String(args.query ?? '').trim();
        if (!query) return [];
        const quotedName = `"%${query.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}%"`;
        const filters = [`name.ilike.${quotedName}`];
        if (phone(query)) filters.push(`phone.ilike.%${phone(query)}%`);
        const { data, error } = await db.from('buyers')
          .select('id,name,phone,preferred_courier,addresses(street,barangay,city,province,zip_code),pickup_locations(branch_name,branch_address)')
          .or(filters.join(',')).limit(10);
        if (error) return { error: error.message };
        const candidates = data ?? [];
        const selection = selectBuyer(candidates, query);
        const normalizedUser = latest.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
        const chosen = selection.buyer;
        const normalizedQuery = query.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (chosen && (normalizedUser.includes(chosen.name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')) ||
          (normalizedQuery.length >= 3 && normalizedUser.includes(normalizedQuery)) ||
          latest.replace(/\D/g, '').includes(chosen.phone.replace(/\D/g, '')))) selectedBuyerId = chosen.id;
        else buyerSearchMessage = buyerChoicesMessage(selection.choices ?? candidates);
        return candidates;
      }
      if (name === 'lookup_zip') {
        const query = String(args.location ?? '').trim().slice(0, 100);
        if (query.length < 3) return { error: 'Please provide a city or municipality for the ZIP lookup.' };
        const groundedQuery = query.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const groundedText = userText.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
        if (!groundedText.includes(groundedQuery)) return { error: 'Please use a city or ZIP code supplied by the user.' };
        let lookup = db.from('postal_codes').select('province,locality,postal_code,source').limit(10);
        lookup = /^\d{4}$/.test(query) ? lookup.eq('postal_code', query) : lookup.ilike('locality', `%${query}%`);
        const { data, error } = await lookup;
        if (error) console.error('Postal code cache lookup failed:', error.message);
        let rows: any = data;
        if (!rows?.length) {
          try { rows = await officialZipLookup(query); }
          catch { rows = []; }
          if (!Array.isArray(rows) || !rows.length) {
            try { rows = await geographicZipLookup(query, fetch); }
            catch { rows = []; }
          }
        }
        if (Array.isArray(rows)) {
          const distinct = [...new Map(rows.map((row: any) => [`${row.locality}|${row.province}|${row.postal_code}`, row])).values()];
          if (distinct.length === 1) {
            const row: any = distinct[0];
            verifiedPublic = { city: row.locality, province: row.province, zip_code: row.postal_code };
            publicSourceUrl = row.source_url ?? (/phlpost/i.test(row.source ?? '') ? 'https://phlpost.gov.ph/zip-code-locator/' : null);
          }
        }
        return rows;
      }
      if (name === 'search_lbc_branch') {
        const query = String(args.query ?? '').trim().slice(0, 180);
        const buyerRequest = /\b(?:add|create|save)\s+(?:a\s+)?buyer\b/i.test(latest);
        let lookup = buyerRequest ? extractLbcClues(latest) : extractLbcClues(query);
        if (buyerRequest && !lookup.name && !lookup.address) return { error: 'Please provide the LBC branch name or location separately from the buyer details.' };
        if (!lookup.name && !lookup.address) {
          if (/\b(?:buyer|phone|contact|number)\s*:/i.test(query)) return { error: 'Search using only the LBC branch name or address.' };
          lookup = /\b(?:unit|floor|street|st\.|cor\.|corner|barangay|brgy)\b|\d{2,}/i.test(query) ? { address: query } : { name: query };
        }
        lastBranchGoogleUrl = googleBranchSearchUrl(lookup.name, lookup.location);
        const result = await findLbcBranch(lookup);
        if (result.kind === 'match') {
          verifiedPickupPairs.add(pickupPair(result.branch));
          return [result.branch];
        }
        if (result.kind === 'ambiguous') return { ambiguousBranches: result.branches };
        return { error: result.kind === 'unavailable' ? 'The official LBC directory is unavailable.' : 'No verified LBC branch matched that name or address.' };
      }
      if (name === 'add_buyer') {
        const explicitCourier = /\bj\s*(?:&|and|n|\+)\s*t\b|\bjnt\b/i.test(latest) ? 'J&T Express' : /\blbc\b/i.test(latest) ? 'LBC' : null;
        const row = { name: String(args.name ?? '').trim(), phone: phone(args.phone), preferred_courier: explicitCourier ?? args.preferred_courier ?? (branchContext ? 'LBC' : undefined) };
        if (!row.name || row.phone.length < 7 || row.phone.length > 15) return { error: 'A valid name and phone number are required.' };
        if (!['LBC', 'J&T Express'].includes(row.preferred_courier)) return { error: 'Choose LBC or J&T Express.' };
        const method = row.preferred_courier === 'J&T Express' ? 'door' : chosenDelivery;
        const address = method === 'door' ? parseDoorAddress(latest) ?? args.address : args.address;
        const pickup = method === 'pickup' && resolvedPickup
          ? { branch_name: resolvedPickup.branch_name, branch_address: resolvedPickup.branch_address }
          : args.pickup;
        if (row.preferred_courier === 'LBC' && !method) return { error: 'Please choose LBC Door to door or Branch pickup before I prepare the form.' };
        if (row.preferred_courier === 'J&T Express' && deliveryChoice === 'pickup') return { error: 'J&T Express requires door delivery. Choose Door to door.' };
        if ((method === 'door' || row.preferred_courier === 'J&T Express') && !addressFields.every((field) => filled(address?.[field]))) return { error: 'Please provide street, barangay, city, province, and ZIP code for door delivery.' };
        if (method === 'pickup' && (!filled(pickup?.branch_name) || !filled(pickup?.branch_address))) return { error: 'Please provide the LBC branch name and complete branch address for pickup.' };
        const verifiedPickup = method === 'pickup' && verifiedPickupPairs.has(pickupPair(pickup));
        const evidenceError = draftEvidenceError({ name: row.name, phone: row.phone, method, address, pickup }, userText, verifiedPickup, verifiedPublic);
        if (evidenceError) return { error: evidenceError };
        const { data: existing, error: duplicateError } = await db.from('buyers').select('id,name').eq('phone', row.phone).maybeSingle();
        if (duplicateError) return { error: 'I could not check for an existing buyer. Please try again.' };
        if (existing) return { error: `${existing.name} already uses this phone number. Open that buyer to review or add another location.`, existingBuyerId: existing.id };
        return {
          draft: {
            name: row.name, phone: row.phone, preferredCourier: row.preferred_courier,
            deliveryMethod: method,
            ...(method === 'pickup'
              ? { branchName: pickup.branch_name.trim(), branchAddress: pickup.branch_address.trim() }
              : { address: {
                street: address.street.trim(), barangay: address.barangay.trim(),
                city: address.city.trim(), province: address.province.trim(),
                zipCode: address.zip_code.trim(),
              } }),
          },
        };
      }
      if (name === 'edit_buyer') {
        if (!selectedBuyerId || String(args.id ?? '') !== selectedBuyerId) return { error: buyerSearchMessage ?? 'Please provide the saved buyer name or phone number first.' };
        const { data: before } = await db.from('buyers').select('id,name,phone,preferred_courier').eq('id', selectedBuyerId).maybeSingle();
        if (!before) return { error: 'Buyer not found.' };
        const patch: Record<string, any> = {};
        if (filled(args.name) && args.name.trim() !== before.name) patch.name = args.name.trim();
        if (filled(args.phone) && phone(args.phone) !== before.phone) patch.phone = phone(args.phone);
        if (['LBC', 'J&T Express'].includes(args.preferred_courier) && args.preferred_courier !== before.preferred_courier) patch.preferred_courier = args.preferred_courier;
        const address = Object.fromEntries(addressFields.filter((field) => filled(args.address?.[field])).map((field) => [field, args.address[field].trim()]));
        if (Object.keys(address).length) patch.address = address;
        const pickup = resolvedPickup
          ? { branch_name: resolvedPickup.branch_name, branch_address: resolvedPickup.branch_address }
          : Object.fromEntries(['branch_name', 'branch_address'].filter((field) => filled(args.pickup?.[field])).map((field) => [field, args.pickup[field].trim()]));
        if (Object.keys(pickup).length) patch.pickup = pickup;
        const method = patch.preferred_courier === 'J&T Express' ? 'door' : chosenDelivery ?? (patch.pickup ? 'pickup' : patch.address ? 'door' : null);
        if (method) patch.deliveryMethod = method;
        if (!Object.keys(patch).some((key) => key !== 'deliveryMethod')) return { error: 'What detail should I change for this buyer?' };
        if (patch.pickup && method === 'door') return { error: 'The branch details conflict with door delivery. Which delivery type should I use?' };
        if (patch.address && method === 'pickup') return { error: 'The address conflicts with branch pickup. Which delivery type should I use?' };
        const evidenceError = editEvidenceError(patch, userText, Boolean(resolvedPickup), verifiedPublic);
        if (evidenceError) return { error: evidenceError };
        return { existingBuyerId: before.id, editDraft: patch, sourceUrl: resolvedPickup?.source_url ?? publicSourceUrl, message: `Review the changes to ${before.name} in the form, then save.` };
      }
      if (name === 'delete_buyer') {
        if (!selectedBuyerId || String(args.id ?? '') !== selectedBuyerId) return { error: buyerSearchMessage ?? 'Please provide the saved buyer name or phone number first.' };
        const { data, error } = await db.rpc('prepare_buyer_deletion', { target_buyer_id: selectedBuyerId });
        return error ? { error: error.message } : { pending: data };
      }
      return { error: 'Unknown tool.' };
    }
    function addBuyerResponse(outcome: any) {
      if (outcome.error) return json({ message: outcome.error, existingBuyerId: outcome.existingBuyerId }, 200, headers);
      return json({
        message: `Review ${outcome.draft.name}'s details in the form before saving.${publicSourceUrl && outcome.draft.deliveryMethod === 'door' ? ` I checked the public city, province, and ZIP against ${publicSourceUrl.includes('phlpost.gov.ph') ? 'PHLPost' : 'the linked geographic source'}.` : ''}`,
        draft: outcome.draft,
        sourceUrl: resolvedPickup?.source_url ?? publicSourceUrl,
      }, 200, headers);
    }
    if (resolvedPickup && /\badd\s+(?:a\s+)?buyer\b/i.test(latest)) {
      const buyerName = latest.match(/(?:^|\n)\s*(?:Buyer\s*)?Name\s*:\s*([^\n]+)/i)?.[1]?.trim();
      const buyerPhone = latest.match(/(?:^|\n)\s*(?:Contact(?:\s*(?:No\.?|Number))?|Phone(?:\s*(?:No\.?|Number))?|Number|Mobile)\s*:\s*([^\n]+)/i)?.[1]?.trim();
      if (buyerName && buyerPhone) return addBuyerResponse(await runTool('add_buyer', { name: buyerName, phone: buyerPhone, preferred_courier: 'LBC', delivery_method: 'pickup' }));
    }
    const doorSource = doorBuyerSource(userMessages);
    const directDoorAddress = parseDoorAddress(doorSource);
    const directIdentity = parseBuyerIdentity(doorSource);
    let postalDoorAddress = null;
    const addressZip = doorAddressZip(doorSource);
    if (!directDoorAddress && addressZip && directIdentity) {
      const postalRows = await runTool('lookup_zip', { location: addressZip });
      if (Array.isArray(postalRows)) postalDoorAddress = parseDoorAddressWithPostalRows(doorSource, postalRows);
    }
    const partialDoorAddress = directDoorAddress ?? parsePartialDoorAddress(doorSource) ?? postalDoorAddress;
    if (partialDoorAddress && directIdentity && /\b(?:add|create|save)\s+(?:a\s+)?buyer\b/i.test(doorSource)) {
      const courier = /\bj\s*(?:&|and|n|\+)\s*t\b|\bjnt\b/i.test(doorSource) ? 'J&T Express' : /\blbc\b/i.test(doorSource) ? 'LBC' : null;
      if (courier && (courier === 'J&T Express' || chosenDelivery === 'door')) {
        if (!partialDoorAddress.province || !partialDoorAddress.zip_code) await runTool('lookup_zip', { location: partialDoorAddress.city });
        if (verifiedPublic.city && verifiedPublic.city.toLocaleLowerCase() !== partialDoorAddress.city.toLocaleLowerCase()) {
          return json({ message: `I could not verify ${partialDoorAddress.city} as that city or municipality. Please confirm the city name.` }, 200, headers);
        }
        if (verifiedPublic.province && partialDoorAddress.province && verifiedPublic.province.toLocaleLowerCase() !== partialDoorAddress.province.toLocaleLowerCase()) {
          return json({ message: `The province you sent conflicts with the ZIP lookup for ${partialDoorAddress.city}. Please confirm the city and province.` }, 200, headers);
        }
        const address: Record<string, string> = { ...verifiedPublic, ...partialDoorAddress } as Record<string, string>;
        const missing = addressFields.filter((field) => !filled(address[field]));
        if (missing.length) return json({ message: `Please provide the ${missing.map((field) => field === 'zip_code' ? 'ZIP code' : field).join(' and ')} for this door-to-door address. I could not verify it automatically.` }, 200, headers);
        return addBuyerResponse(await runTool('add_buyer', {
          ...directIdentity, preferred_courier: courier, address,
        }));
      }
    }
    if (!partialDoorAddress && addressZip && directIdentity && /\b(?:add|create|save)\s+(?:a\s+)?buyer\b/i.test(doorSource)) {
      return json({ message: 'I could not safely separate the barangay, city, and province. Please send just the address with commas between street, barangay, city, and province.' }, 200, headers);
    }
    const directAction = parseBuyerAction(latest);
    if (directAction && (directAction.action === 'delete' || directAction.patch)) {
      const candidates = await runTool('search_buyers', { query: directAction.query });
      if (candidates.error) return json({ message: 'I could not search the buyer directory. Please try again.' }, 200, headers);
      if (!selectedBuyerId) return json({ message: buyerSearchMessage ?? 'Please provide the exact saved buyer name or phone number.' }, 200, headers);
      if (directAction.action === 'delete') {
        const outcome = await runTool('delete_buyer', { id: selectedBuyerId });
        if (outcome.error) return json({ message: outcome.error }, 200, headers);
        return json({ message: `Delete ${outcome.pending.name} (${outcome.pending.phone})? To confirm, send exactly DELETE ${outcome.pending.code} within 5 minutes. The buyer stays saved until then.` }, 200, headers);
      }
      if (directAction.patch.pickup?.branch_name) {
        const resolution = await findLbcBranch({ name: directAction.patch.pickup.branch_name });
        if (resolution.kind === 'ambiguous') return json({ message: 'Several LBC branches match. Choose the exact branch below.', branchChoices: resolution.branches }, 200, headers);
        if (resolution.kind === 'match') resolvedPickup = resolution.branch;
      }
      const outcome = await runTool('edit_buyer', { id: selectedBuyerId, ...directAction.patch });
      return json({ message: outcome.error ?? outcome.message, existingBuyerId: outcome.existingBuyerId, editDraft: outcome.editDraft, sourceUrl: outcome.sourceUrl }, 200, headers);
    }
    const zipQuery = zipLookupQuery(latest);
    if (zipQuery) {
      const result = await runTool('lookup_zip', { location: zipQuery });
      if (!Array.isArray(result)) return json({ message: result.error ?? 'The ZIP lookup is unavailable right now.' }, 200, headers);
      return json({ message: zipLookupReply(result, zipQuery), sourceUrl: result[0]?.source_url ?? publicSourceUrl ?? null }, 200, headers);
    }
    if (!apiKey) return json({ message: 'The assistant has not been configured yet.' }, 503, headers);
    for (let step = 0; step < 4; step++) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen/qwen3.8-27b', messages: history, tools, tool_choice: 'auto', temperature: 0.1, max_completion_tokens: 700 }), signal: AbortSignal.timeout(25000) });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 3600 ? ` Try again in ${Math.ceil(retryAfter)} seconds.` : ' Please try again shortly.';
        return json({ message: `The AI service is busy.${wait}`, code: 'rate_limited' }, 429, headers);
      }
      if (!response.ok) {
        console.error('Groq request failed:', response.status);
        return json({ message: 'The AI service could not process that request. Please try again.', code: 'ai_service_error' }, 502, headers);
      }
      const result = await response.json(); const message = result.choices?.[0]?.message;
      if (!message?.tool_calls?.length) return json({ message: message?.content || 'I could not complete that request.', googleSearchUrl: lastBranchGoogleUrl }, 200, headers);
      history.push(message);
      for (const call of message.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments); } catch { /* validated by tool */ }
        const outcome = await runTool(call.function.name, args);
        if (call.function.name === 'add_buyer') {
          return addBuyerResponse(outcome);
        }
        if (call.function.name === 'edit_buyer') {
          return json({ message: outcome.error ?? outcome.message, existingBuyerId: outcome.existingBuyerId, editDraft: outcome.editDraft, sourceUrl: outcome.sourceUrl }, 200, headers);
        }
        if (call.function.name === 'delete_buyer') {
          if (outcome.error) return json({ message: outcome.error }, 200, headers);
          return json({ message: `Delete ${outcome.pending.name} (${outcome.pending.phone})? To confirm, send exactly DELETE ${outcome.pending.code} within 5 minutes. Any other message leaves the buyer in place.` }, 200, headers);
        }
        if (call.function.name === 'search_lbc_branch' && outcome.ambiguousBranches) {
          return json({ message: 'I found more than one LBC branch. Choose the exact branch below.', branchChoices: outcome.ambiguousBranches, googleSearchUrl: lastBranchGoogleUrl }, 200, headers);
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) });
      }
    }
    return json({ message: 'Please make that request more specific.' }, 200, headers);
  } catch (error) {
    console.error(error);
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return json({ message: 'The lookup or AI service took too long. Please try again.', code: 'timeout' }, 504, headers);
    }
    return json({ message: 'The assistant could not complete that request.', code: 'internal_error' }, 500, headers);
  }
});
