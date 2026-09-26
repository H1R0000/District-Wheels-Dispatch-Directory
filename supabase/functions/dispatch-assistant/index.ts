import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cors, json } from '../_shared/http.ts';
import { extractLbcClues, parsePickupAddressFollowUp, parsePickupConfirmation, parsePickupMessage, resolveLbcBranch, searchTerms, type LbcBranch } from './lbc-resolver.ts';

const tools = [
  { type: 'function', function: { name: 'search_buyers', description: 'Find buyers by name or phone before editing or deleting.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'add_buyer', description: 'Prepare a buyer draft for human review. LBC door delivery requires a complete address; LBC branch pickup requires branch name and address. J&T requires a complete address.', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, preferred_courier: { type: 'string', enum: ['LBC', 'J&T Express'] }, delivery_method: { type: 'string', enum: ['door', 'pickup'] }, address: { type: 'object', properties: { street: { type: 'string' }, barangay: { type: 'string' }, city: { type: 'string' }, province: { type: 'string' }, zip_code: { type: 'string' } } }, pickup: { type: 'object', properties: { branch_name: { type: 'string' }, branch_address: { type: 'string' } } } }, required: ['name', 'phone', 'preferred_courier'] } } },
  { type: 'function', function: { name: 'edit_buyer', description: 'Find one buyer by ID and open the edit form for human review; do not change database records.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'delete_buyer', description: 'Prepare deletion of exactly one buyer. This only creates a confirmation code; it never deletes immediately.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'lookup_zip', description: 'Look up a Philippine ZIP code by city or municipality.', parameters: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] } } },
  { type: 'function', function: { name: 'search_lbc_branch', description: 'Find verified LBC branch names and addresses.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
];
const phone = (value: unknown) => String(value ?? '').replace(/\D/g, '');
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
      return json({ message: error ? 'That deletion confirmation is invalid or expired. Ask me to delete the buyer again.' : `Deleted ${data.name} (${data.phone}).` }, 200, headers);
    }
    const userText = messages.filter((message: any) => message?.role === 'user').map((message: any) => String(message.content ?? '')).join('\n');
    const chosenDelivery = body.deliveryMethod === 'door' || body.deliveryMethod === 'pickup' ? body.deliveryMethod : null;
    const history: any[] = [{ role: 'system', content: `You are the District Wheels Dispatch Assistant. Use tools for every buyer action, ZIP code, or LBC lookup. Never invent records, lookup results, buyer names, or phone numbers. Never use placeholder buyer details; ask the user for missing values. Search before editing or deleting. If multiple buyers match, ask which one. The delete_buyer tool only prepares a deletion and returns instructions for a separate confirmation message. Never say the buyer was deleted until that separate confirmation succeeds. Use only the minimum data needed. The add_buyer tool prepares a draft; the user reviews and saves it in the form. The edit_buyer tool opens the existing record for review; it does not save changes. Never claim a draft or edit was saved. Read the courier and delivery method from the user's messages. Recognize JNT or J&T as J&T Express. For LBC, recognize "door to door" as door and "branch pickup" as pickup. The legacy selected delivery method is ${chosenDelivery ?? 'none'}; use it only when present. If an LBC delivery method is missing, ask whether it is door to door or branch pickup. For door delivery, collect street or house address, barangay, city, province, and ZIP code. For LBC branch pickup, a verified official directory match will supply both the canonical branch name and address. Never ask the user for the missing side of a verified branch pair. If several matches are possible, ask the user to choose. J&T uses door delivery. Ask only for missing details. When a tool reports an error, explain it and ask for the needed correction.` }, ...messages];

    async function officialZipLookup(query: string) {
      const response = await fetch('https://phlpost.gov.ph/zip-code-locator/', { headers: { 'User-Agent': 'DistrictWheels/1.0' } });
      if (!response.ok) return { error: `PHLPost lookup failed (${response.status}).` };
      const html = await response.text();
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) =>
        [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
          cell[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
        )
      ).filter((cells) => cells.length >= 4);
      const tokens = query.toLocaleLowerCase().split(/\s+/).filter((token) => token.length > 2 && !['city', 'municipality'].includes(token));
      const matches = rows.filter((cells) => tokens.every((token) => `${cells[1]} ${cells[2]}`.toLocaleLowerCase().includes(token))).slice(0, 10);
      return matches.map(([region, province, locality, postal_code]) => ({ region, province, locality, postal_code, source_url: 'https://phlpost.gov.ph/zip-code-locator/' }));
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

    const pastedPickup = parsePickupMessage(latest) ?? parsePickupAddressFollowUp(messages) ?? parsePickupConfirmation(messages);
    if (pastedPickup) {
      const { data: existing, error: duplicateError } = await db.from('buyers')
        .select('id,name').eq('phone', pastedPickup.phone).maybeSingle();
      if (duplicateError) return json({ message: 'I could not check for an existing buyer. Please try again.' }, 500, headers);
      if (existing) return json({
        message: `${existing.name} already uses this phone number. Open that buyer to review or add another pickup location.`,
        existingBuyerId: existing.id,
      }, 200, headers);

      const resolution = await findLbcBranch({ name: pastedPickup.branchName, location: pastedPickup.locationHint });
      const verified = resolution.kind === 'match' ? resolution.branch : null;
      const draft = {
        name: pastedPickup.name,
        phone: pastedPickup.phone,
        branchName: verified?.branch_name ?? pastedPickup.branchName,
        branchAddress: verified?.branch_address ?? '',
      };
      const notice = verified
        ? `Matched ${verified.branch_name} in LBC's directory. Review the details before saving.`
        : resolution.kind === 'ambiguous'
          ? `Several LBC branches may match. Choose the correct branch and enter its complete address before saving. Possible matches: ${resolution.branches.map((branch) => branch.branch_name).join(', ')}.`
          : `I filled in the buyer details, but could not verify the LBC branch. Enter its complete address before saving.`;
      const googleQuery = `LBC ${pastedPickup.branchName} ${pastedPickup.locationHint} Philippines branch address`.replace(/\s+/g, ' ').trim();
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;
      return json({ message: notice, draft, sourceUrl: verified?.source_url ?? null, googleSearchUrl }, 200, headers);
    }

    let resolvedPickup: LbcBranch | null = null;
    const userMessages = messages.filter((message: any) => message?.role === 'user').map((message: any) => String(message.content ?? ''));
    const branchContext = /\blbc\b/i.test(userText) && /\bbranch\s*pickup\b/i.test(userText);
    const clues = [...userMessages].reverse().map(extractLbcClues).find((item) => item.name || item.address);
    const shouldResolve = Boolean(clues && (branchContext || /\blbc\b/i.test(latest)) && /\b(?:lbc|branch|pickup|address|provide|that)\b/i.test(latest)) && !/\bdoor\s*to\s*door\b/i.test(latest);
    if (shouldResolve && clues) {
      const resolution = await findLbcBranch(clues);
      if (resolution.kind === 'match') {
        resolvedPickup = resolution.branch;
        history[0].content += ` The official LBC directory verifies this branch pair: name "${resolvedPickup.branch_name}", address "${resolvedPickup.branch_address}", source ${resolvedPickup.source_url}. Use both fields when adding an LBC pickup buyer. Never ask the user for the other field.`;
        if (!/\b(?:add|edit|update|buyer|customer)\b/i.test(userText)) {
          return json({ message: `${resolvedPickup.branch_name}\n${resolvedPickup.branch_address}\n${lbcSource(resolvedPickup)}` }, 200, headers);
        }
      } else if (resolution.kind === 'ambiguous') {
        return json({ message: `I found more than one LBC branch. Please reply with the exact branch name and city:\n\n${resolution.branches.map((branch, index) => `${index + 1}. ${branch.branch_name} — ${branch.branch_address}`).join('\n')}` }, 200, headers);
      } else if (resolution.kind === 'unavailable') {
        return json({ message: 'The official LBC directory is unavailable right now. Please try the branch lookup again.' }, 200, headers);
      } else {
        return json({ message: 'I could not verify that LBC branch in the official directory. Please give its exact name, a nearby landmark, or more of its address.' }, 200, headers);
      }
    }
    const suppliedPhoneNumbers = (userText.match(/(?:\+?\d[\d\s().-]{5,24}\d)/g) ?? []).map(phone).filter((value) => value.length >= 7 && value.length <= 15);
    if (/\badd\s+(?:a\s+)?buyer\b/i.test(latest) && !suppliedPhoneNumbers.length) {
      const branchNote = resolvedPickup ? `I found the LBC branch: ${resolvedPickup.branch_name} — ${resolvedPickup.branch_address}\nSource: ${resolvedPickup.source_url}\n\n` : '';
      return json({ message: `${branchNote}Please provide the buyer's phone number before I add the record.` }, 200, headers);
    }

    async function runTool(name: string, args: any) {
      if (name === 'search_buyers') {
        const query = String(args.query ?? '').trim();
        if (!query) return [];
        const quotedName = `"%${query.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}%"`;
        const filters = [`name.ilike.${quotedName}`];
        if (phone(query)) filters.push(`phone.ilike.%${phone(query)}%`);
        const { data, error } = await db.from('buyers')
          .select('id,name,phone,preferred_courier,addresses(street,barangay,city,province,zip_code),pickup_locations(branch_name,branch_address)')
          .or(filters.join(',')).limit(10);
        return error ? { error: error.message } : data ?? [];
      }
      if (name === 'lookup_zip') { const query = String(args.location ?? '').trim(); const rows = (await db.from('postal_codes').select('region,province,locality,postal_code').ilike('locality', `%${query}%`).limit(10)).data ?? []; return rows.length ? rows : officialZipLookup(query); }
      if (name === 'search_lbc_branch') {
        const query = String(args.query ?? '').trim().slice(0, 180);
        let lookup = extractLbcClues(query);
        if (!lookup.name && !lookup.address) {
          if (/\b(?:buyer|phone|contact|number)\s*:/i.test(query)) return { error: 'Search using only the LBC branch name or address.' };
          lookup = /\b(?:unit|floor|street|st\.|cor\.|corner|barangay|brgy)\b|\d{2,}/i.test(query) ? { address: query } : { name: query };
        }
        const result = await findLbcBranch(lookup);
        if (result.kind === 'match') return [result.branch];
        if (result.kind === 'ambiguous') return result.branches;
        return { error: result.kind === 'unavailable' ? 'The official LBC directory is unavailable.' : 'No verified LBC branch matched that name or address.' };
      }
      if (name === 'add_buyer') {
        const row = { name: String(args.name ?? '').trim(), phone: phone(args.phone), preferred_courier: args.preferred_courier ?? (branchContext ? 'LBC' : undefined) };
        if (!row.name || row.phone.length < 7 || row.phone.length > 15) return { error: 'A valid name and phone number are required.' };
        const normalizeText = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
        const suppliedPhones = userText.match(/(?:\+?\d[\d\s().-]{5,24}\d)/g) ?? [];
        if (!normalizeText(userText).includes(normalizeText(row.name))) return { error: 'Please provide the buyer name in your message.' };
        if (!suppliedPhones.some((value) => phone(value) === row.phone)) return { error: 'Please provide the buyer phone number. I cannot fill in a missing number.' };
        if (!['LBC', 'J&T Express'].includes(row.preferred_courier)) return { error: 'Choose LBC or J&T Express.' };
        const method = chosenDelivery ?? args.delivery_method ?? (branchContext ? 'pickup' : row.preferred_courier === 'J&T Express' ? 'door' : null);
        const pickup = method === 'pickup' && resolvedPickup
          ? { branch_name: resolvedPickup.branch_name, branch_address: resolvedPickup.branch_address }
          : args.pickup;
        if (row.preferred_courier === 'LBC' && !['door', 'pickup'].includes(method)) return { error: 'Choose Door to door or Branch pickup in the chat first.' };
        if (row.preferred_courier === 'J&T Express' && method === 'pickup') return { error: 'J&T Express requires door delivery. Select Door to door.' };
        if ((method === 'door' || row.preferred_courier === 'J&T Express') && !addressFields.every((field) => filled(args.address?.[field]))) return { error: 'Please provide street, barangay, city, province, and ZIP code for door delivery.' };
        if (method === 'pickup' && (!filled(pickup?.branch_name) || !filled(pickup?.branch_address))) return { error: 'Please provide the LBC branch name and complete branch address for pickup.' };
        return {
          draft: {
            name: row.name, phone: row.phone, preferredCourier: row.preferred_courier,
            deliveryMethod: method,
            ...(method === 'pickup'
              ? { branchName: pickup.branch_name.trim(), branchAddress: pickup.branch_address.trim() }
              : { address: {
                street: args.address.street.trim(), barangay: args.address.barangay.trim(),
                city: args.address.city.trim(), province: args.address.province.trim(),
                zipCode: args.address.zip_code.trim(),
              } }),
          },
        };
      }
      if (name === 'edit_buyer') {
        const { data: before } = await db.from('buyers').select('id,name,phone,preferred_courier').eq('id', args.id).maybeSingle(); if (!before) return { error: 'Buyer not found.' };
        return { existingBuyerId: before.id, message: `Open ${before.name} to review and edit the saved details.` };
      }
      if (name === 'delete_buyer') {
        const { data, error } = await db.rpc('prepare_buyer_deletion', { target_buyer_id: String(args.id ?? '') });
        return error ? { error: error.message } : { pending: data };
      }
      return { error: 'Unknown tool.' };
    }
    function addBuyerResponse(outcome: any) {
      if (outcome.error) return json({ message: outcome.error }, 200, headers);
      return json({
        message: `Review ${outcome.draft.name}'s details in the form before saving.`,
        draft: outcome.draft,
        sourceUrl: resolvedPickup?.source_url ?? null,
      }, 200, headers);
    }
    if (resolvedPickup && /\badd\s+(?:a\s+)?buyer\b/i.test(latest)) {
      const buyerName = latest.match(/(?:^|\n)\s*(?:Buyer\s*)?Name\s*:\s*([^\n]+)/i)?.[1]?.trim();
      const buyerPhone = latest.match(/(?:^|\n)\s*(?:Contact(?:\s*(?:No\.?|Number))?|Phone(?:\s*(?:No\.?|Number))?|Number|Mobile)\s*:\s*([^\n]+)/i)?.[1]?.trim();
      if (buyerName && buyerPhone) return addBuyerResponse(await runTool('add_buyer', { name: buyerName, phone: buyerPhone, preferred_courier: 'LBC', delivery_method: 'pickup' }));
    }
    if (!apiKey) return json({ message: 'The assistant has not been configured yet.' }, 503, headers);
    for (let step = 0; step < 4; step++) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen/qwen3.8-27b', messages: history, tools, tool_choice: 'auto', temperature: 0.1, max_completion_tokens: 700 }) });
      if (!response.ok) throw new Error(`Groq request failed (${response.status})`);
      const result = await response.json(); const message = result.choices?.[0]?.message;
      if (!message?.tool_calls?.length) return json({ message: message?.content || 'I could not complete that request.' }, 200, headers);
      history.push(message);
      for (const call of message.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments); } catch { /* validated by tool */ }
        const outcome = await runTool(call.function.name, args);
        if (call.function.name === 'add_buyer') {
          return addBuyerResponse(outcome);
        }
        if (call.function.name === 'edit_buyer') {
          return json({ message: outcome.error ?? outcome.message, existingBuyerId: outcome.existingBuyerId }, 200, headers);
        }
        if (call.function.name === 'delete_buyer') {
          if (outcome.error) return json({ message: outcome.error }, 200, headers);
          return json({ message: `Delete ${outcome.pending.name} (${outcome.pending.phone})? To confirm, send exactly DELETE ${outcome.pending.code} within 5 minutes. Any other message leaves the buyer in place.` }, 200, headers);
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) });
      }
    }
    return json({ message: 'Please make that request more specific.' }, 200, headers);
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error && /^Groq request failed \(\d{3}\)$/.test(error.message) ? error.message : 'Internal assistant error';
    if (detail === 'Groq request failed (429)') return json({ message: 'The AI service has reached its free-tier limit. Please try again later.' }, 200, headers);
    return json({ message: 'The assistant could not complete that request.', detail }, 500, headers);
  }
});
