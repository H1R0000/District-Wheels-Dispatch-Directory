import { phone, filled, addressFields } from './tool-schema.ts';
import { selectBuyer, buyerChoicesMessage } from './buyer-selection.ts';
import { geographicZipLookup } from './zip-lookup.ts';
import { extractLbcClues, type LbcBranch } from './lbc-resolver.ts';
import { parseDoorAddress } from './door-address.ts';
import { draftEvidenceError } from './draft-evidence.ts';
import { editEvidenceError } from './edit-evidence.ts';
export type ToolState = { lastBranchGoogleUrl: string | null; selectedBuyerId: string | null; buyerSearchMessage: string | null; verifiedPublic: Record<string,string>; publicSourceUrl: string | null; resolvedPickup: LbcBranch | null };
export function createToolRunner(context: any, toolState: ToolState) {
  const { db, latest, userText, conversation, officialZipLookup, googleBranchSearchUrl, findLbcBranch, verifiedPickupPairs, pickupPair, branchContext, chosenDelivery, deliveryChoice } = context;
    return async function runTool(name: string, args: any) {
      if (name === 'search_buyers') {
        toolState.selectedBuyerId = null;
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
          latest.replace(/\D/g, '').includes(chosen.phone.replace(/\D/g, '')))) toolState.selectedBuyerId = chosen.id;
        else toolState.buyerSearchMessage = buyerChoicesMessage(selection.choices ?? candidates);
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
            toolState.verifiedPublic = { city: row.locality, province: row.province, zip_code: row.postal_code };
            toolState.publicSourceUrl = row.source_url ?? (/phlpost/i.test(row.source ?? '') ? 'https://phlpost.gov.ph/zip-code-locator/' : null);
          }
        }
        return rows;
      }
      if (name === 'search_lbc_branch') {
        const query = String(args.query ?? '').trim().slice(0, 180);
        const buyerRequest = Boolean(conversation.summary) || /\b(?:add|create|save)\s+(?:a\s+)?buyer\b/i.test(latest) || /(?:\+?63|0)9\d[\d ().-]{8,}/.test(latest);
        let lookup = buyerRequest ? extractLbcClues(latest) : extractLbcClues(query);
        if (buyerRequest && !lookup.name && !lookup.address) return { error: 'Please provide the LBC branch name or location separately from the buyer details.' };
        if (!lookup.name && !lookup.address) {
          if (/\b(?:buyer|phone|contact|number)\s*:/i.test(query)) return { error: 'Search using only the LBC branch name or address.' };
          lookup = /\b(?:unit|floor|street|st\.|cor\.|corner|barangay|brgy)\b|\d{2,}/i.test(query) ? { address: query } : { name: query };
        }
        toolState.lastBranchGoogleUrl = googleBranchSearchUrl(lookup.name, lookup.location);
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
        const pickup = method === 'pickup' && toolState.resolvedPickup
          ? { branch_name: toolState.resolvedPickup.branch_name, branch_address: toolState.resolvedPickup.branch_address }
          : args.pickup;
        if (row.preferred_courier === 'LBC' && !method) return { error: 'Please choose LBC Door to door or Branch pickup before I prepare the form.' };
        if (row.preferred_courier === 'J&T Express' && deliveryChoice === 'pickup') return { error: 'J&T Express requires door delivery. Choose Door to door.' };
        if ((method === 'door' || row.preferred_courier === 'J&T Express') && !addressFields.every((field) => filled(address?.[field]))) return { error: 'Please provide street, barangay, city, province, and ZIP code for door delivery.' };
        if (method === 'pickup' && (!filled(pickup?.branch_name) || !filled(pickup?.branch_address))) return { error: 'Please provide the LBC branch name and complete branch address for pickup.' };
        const verifiedPickup = method === 'pickup' && verifiedPickupPairs.has(pickupPair(pickup));
        const evidenceError = draftEvidenceError({ name: row.name, phone: row.phone, method, address, pickup }, userText, verifiedPickup, toolState.verifiedPublic);
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
        if (!toolState.selectedBuyerId || String(args.id ?? '') !== toolState.selectedBuyerId) return { error: toolState.buyerSearchMessage ?? 'Please provide the saved buyer name or phone number first.' };
        const { data: before } = await db.from('buyers').select('id,name,phone,preferred_courier').eq('id', toolState.selectedBuyerId).maybeSingle();
        if (!before) return { error: 'Buyer not found.' };
        const patch: Record<string, any> = {};
        if (filled(args.name) && args.name.trim() !== before.name) patch.name = args.name.trim();
        if (filled(args.phone) && phone(args.phone) !== before.phone) patch.phone = phone(args.phone);
        if (['LBC', 'J&T Express'].includes(args.preferred_courier) && args.preferred_courier !== before.preferred_courier) patch.preferred_courier = args.preferred_courier;
        const address = Object.fromEntries(addressFields.filter((field) => filled(args.address?.[field])).map((field) => [field, args.address[field].trim()]));
        if (Object.keys(address).length) patch.address = address;
        const pickup = toolState.resolvedPickup
          ? { branch_name: toolState.resolvedPickup.branch_name, branch_address: toolState.resolvedPickup.branch_address }
          : Object.fromEntries(['branch_name', 'branch_address'].filter((field) => filled(args.pickup?.[field])).map((field) => [field, args.pickup[field].trim()]));
        if (Object.keys(pickup).length) patch.pickup = pickup;
        const method = patch.preferred_courier === 'J&T Express' ? 'door' : chosenDelivery ?? (patch.pickup ? 'pickup' : patch.address ? 'door' : null);
        if (method) patch.deliveryMethod = method;
        if (!Object.keys(patch).some((key) => key !== 'deliveryMethod')) return { error: 'What detail should I change for this buyer?' };
        if (patch.pickup && method === 'door') return { error: 'The branch details conflict with door delivery. Which delivery type should I use?' };
        if (patch.address && method === 'pickup') return { error: 'The address conflicts with branch pickup. Which delivery type should I use?' };
        const evidenceError = editEvidenceError(patch, userText, Boolean(toolState.resolvedPickup), toolState.verifiedPublic);
        if (evidenceError) return { error: evidenceError };
        return { existingBuyerId: before.id, editDraft: patch, sourceUrl: toolState.resolvedPickup?.source_url ?? toolState.publicSourceUrl, message: `Review the changes to ${before.name} in the form, then save.` };
      }
      if (name === 'delete_buyer') {
        if (!toolState.selectedBuyerId || String(args.id ?? '') !== toolState.selectedBuyerId) return { error: toolState.buyerSearchMessage ?? 'Please provide the saved buyer name or phone number first.' };
        const { data, error } = await db.rpc('prepare_buyer_deletion', { target_buyer_id: toolState.selectedBuyerId });
        return error ? { error: error.message } : { pending: data };
      }
      return { error: 'Unknown tool.' };
    }
}
