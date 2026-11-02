import { json } from '../_shared/http.ts';
import { confirmedBranchClues, confirmedBranchForBuyerReply, extractLbcClues, parsePickupAddressFollowUp, parsePickupConfirmation, parsePickupMessage, type LbcBranch } from './lbc-resolver.ts';

import { chooseDeliveryMethod, statedDeliveryMethod } from './delivery-method.ts';
import { googleBranchSearchUrl as branchSearchUrl } from './branch-search-link.ts';


import { doorAddressZip, doorLocationQuestion, parseDoorAddress, parseDoorAddressWithPostalRows, parsePartialDoorAddress } from './door-address.ts';
import { doorBuyerSource, parseBuyerIdentity } from './buyer-input.ts';
import { parseBuyerAction } from './buyer-action.ts';
import { zipLookupQuery, zipLookupReply } from './zip-lookup.ts';
import { buyerRequest, buyerSessionMessages, conversationBuyer, selectedBranch } from './buyer-conversation.ts';
import { buyerFollowUp } from './natural-buyer.ts';
import { cleanBuyer, mergeBuyer, newBuyerMessage, readBuyerState, sealBuyerState, type BuyerState } from './buyer-state.ts';
import { buyerMutationMessage, extractBuyerWithAI, privateBranchClue, validateBuyerChange } from './ai-extraction.ts';
import { isReviewRequest } from './review-handoff.ts';

import { tools, phone, filled, addressFields } from './tool-schema.ts';
import { createLookups } from './lookups.ts';
import { createToolRunner, type ToolState } from './tool-runner.ts';
import { runModelConversation } from './model-loop.ts';

export async function handleConversation({ db, auth, apiKey, body, headers, stateSecret, cacheDb }: any) {
  const toolState: ToolState = { lastBranchGoogleUrl: null, selectedBuyerId: null, buyerSearchMessage: null, verifiedPublic: {}, publicSourceUrl: null, resolvedPickup: null };
    const incoming = buyerSessionMessages(Array.isArray(body.messages) ? body.messages.slice(-40) : []);
    const latestInput = String(incoming.at(-1)?.content ?? '').trim();
    const resetsBuyer = newBuyerMessage(latestInput);
    let state: BuyerState | null = resetsBuyer ? null : await readBuyerState(body.buyerStateToken, auth.user.id, stateSecret);
    const selection = selectedBranch(incoming);
    const conversation = conversationBuyer(state ? incoming.slice(-2) : incoming, state?.buyer ?? null);
    if (!conversation.summary && resetsBuyer) { conversation.summary = {}; conversation.changed = true; }
    if (conversation.summary) {
      const evidence = state ? latestInput : incoming.filter((item: any) => item.role === 'user').map((item: any) => String(item.content ?? '')).join('\n');
      const accepted = validateBuyerChange(conversation.summary, evidence, state?.buyer ?? {});
      conversation.summary = mergeBuyer(state?.buyer ?? {}, accepted);
      conversation.changed = Boolean(Object.keys(accepted).length) || resetsBuyer;
    }
    if (state && !buyerMutationMessage(latestInput)) { conversation.summary = state.buyer; conversation.changed = false; }
    if (conversation.summary && buyerMutationMessage(latestInput) && (!conversation.changed || buyerFollowUp(conversation.summary))) {
      const extracted = await extractBuyerWithAI(latestInput, conversation.summary, apiKey);
      if (Object.keys(extracted).length) { conversation.summary = mergeBuyer(conversation.summary, extracted); conversation.changed = true; }
    }
    if (conversation.summary && statedDeliveryMethod(latestInput) === 'ambiguous') {
      delete conversation.summary.deliveryMethod;
      conversation.changed = true;
    }
    if (conversation.summary) state = { version: 1, id: state?.id ?? crypto.randomUUID(), revision: (state?.revision ?? 0) + (conversation.changed ? 1 : 0), buyer: cleanBuyer(conversation.summary), status: !conversation.changed && state?.status === 'ready' ? 'ready' : 'collecting' };
    else state = null;
    async function reply(payload: any, status = 200, responseHeaders = headers) {
      if (!state) return json(payload, status, responseHeaders);
      if (payload.draft) { state.buyer = mergeBuyer(state.buyer, payload.draft); state.status = 'ready'; }
      return json({ ...payload, buyerState: state, buyerStateToken: await sealBuyerState(state, auth.user.id, stateSecret), ...(!stateSecret ? { statePersistence: 'stateless' } : {}) }, status, responseHeaders);
    }
    const branchIdentities = () => [state?.buyer.name, conversation.summary?.name, ...incoming.filter((item: any) => item.role === 'user').map((item: any) => parseBuyerIdentity(String(item.content ?? ''))?.name)];
    function googleBranchSearchUrl(name?: string, location?: string) {
      return privateBranchClue({ name, location }, branchIdentities()) ? null : branchSearchUrl(name, location);
    }
    const reviewRequested = isReviewRequest(String(incoming.at(-1)?.content ?? ''));
    if (reviewRequested && conversation.summary) conversation.changed = true;
    const followUp = conversation.changed ? buyerRequest(conversation.summary) : null;
    if (conversation.changed && conversation.summary && !selection && !followUp) {
      const question = doorLocationQuestion(String(incoming.at(-1)?.content ?? '')) ?? buyerFollowUp(conversation.summary);
      if (question) return reply({ message: question }, 200, headers);
    }
    const messages = incoming.map((message: any, index: number) => ({ role: message.role, content: index === incoming.length - 1 ? followUp ?? (selection ? `Find ${selection.branch_name}` : message.content) : message.content }));
    if (!messages.length) return reply({ message: 'Send a message first.' }, 400, headers);
    const latest = String(messages.at(-1)?.content ?? '').trim();
    const confirmation = latest.match(/^DELETE\s+([A-F0-9]{8})$/i);
    if (confirmation) {
      const { data, error } = await db.rpc('confirm_buyer_deletion', { confirmation_code: confirmation[1] });
      if (error || !data?.name) return reply({ message: 'That deletion confirmation is invalid or expired. Ask me to delete the buyer again.' }, 200, headers);
      const destination = data.destination;
      const details = destination?.branch_name
        ? `LBC branch pickup — ${destination.branch_name}, ${destination.branch_address}`
        : destination ? `${data.courier ?? 'Door delivery'} door to door — ${[destination.street, destination.barangay, destination.city, destination.province, destination.zip_code].filter(Boolean).join(', ')}` : '';
      return reply({ message: `Deleted ${data.name} (${data.phone}).${details ? `\n${details}` : ''}`, deletedBuyer: { name: data.name, phone: data.phone } }, 200, headers);
    }
    const userMessages = messages.filter((message: any) => message?.role === 'user').map((message: any) => String(message.content ?? ''));
    const userText = userMessages.join('\n');
    let parsedPickup = parsePickupMessage(latest) ?? parsePickupAddressFollowUp(messages) ?? parsePickupConfirmation(messages);
    if (selection && conversation.summary?.name && conversation.summary.phone) parsedPickup = { name: conversation.summary.name, phone: phone(conversation.summary.phone), branchName: selection.branch_name, branchAddress: selection.branch_address, locationHint: '' };
    const deliveryChoice = chooseDeliveryMethod(messages, Boolean(parsedPickup));
    const chosenDelivery = deliveryChoice === 'door' || deliveryChoice === 'pickup' ? deliveryChoice : null;
    const history: any[] = [{ role: 'system', content: `You are the District Wheels Dispatch Assistant. Use tools for every buyer action, ZIP code, or LBC lookup. Never invent records, lookup results, buyer names, phone numbers, addresses, or ZIP codes. Never use placeholder buyer details; ask the user for missing values. Search before editing or deleting. If multiple buyers match, ask for their exact phone number. The delete_buyer tool only prepares a deletion and returns instructions for a separate confirmation message. Never say the buyer was deleted until that separate confirmation succeeds. Use only the minimum data needed. The add_buyer tool prepares a draft; the user reviews and saves it in the form. The edit_buyer tool prepares only user-requested changes for the edit form; it does not save. Never claim a draft or edit was saved. Recognize JNT or J&T as J&T Express. The user's latest delivery choice is ${deliveryChoice ?? 'not stated'}; this choice overrides older messages and your own inference. If the LBC method is ambiguous or missing, ask whether it is Door to door or Branch pickup. For door delivery, collect street or house address, barangay, city, province, and ZIP code. Never invent a street, building, or barangay. For LBC branch pickup, a verified official directory match will supply both the canonical branch name and address. Never ask the user for the missing side of a verified branch pair. If several matches are possible, ask the user to choose. J&T uses door delivery. Ask only for missing details. When a tool reports an error, explain it and ask for the needed correction.` }, ...messages];

    const { officialZipLookup, findLbcBranch } = createLookups({ db, cacheDb, branchIdentities });
    const lbcSource = (branch: LbcBranch) => `Source: ${branch.source_url}${branch.verified_at ? `\nLast verified: ${branch.verified_at.slice(0, 10)}` : ''}`;

    let confirmedBranch: LbcBranch | null = null;
    const confirmationClues = confirmedBranchClues(messages);
    if (confirmationClues) {
      const resolution = await findLbcBranch(confirmationClues);
      if (resolution.kind === 'ambiguous') return reply({ message: 'Several LBC branches match. Choose the exact one below.', branchChoices: resolution.branches, googleSearchUrl: googleBranchSearchUrl(confirmationClues.name, confirmationClues.location) }, 200, headers);
      if (resolution.kind !== 'match') return reply({ message: 'I could not verify that LBC branch right now. Please check its name and address before using it for pickup.', googleSearchUrl: googleBranchSearchUrl(confirmationClues.name, confirmationClues.location) }, 200, headers);
      const shownBranchName = String(messages.at(-2)?.content ?? '').split(/\r?\n/)[0].trim();
      if (resolution.branch.branch_name !== shownBranchName) return reply({ message: 'The branch result changed. Please look it up again before confirming it.' }, 200, headers);
      confirmedBranch = resolution.branch;
      const priorRequest = messages.slice(-7, -1).reverse().find((message: any) => message?.role === 'user' && parsePickupMessage(String(message.content ?? '')));
      const priorPickup = priorRequest && parsePickupMessage(String(priorRequest.content ?? ''));
      if (priorPickup) {
        const priorResolution = await findLbcBranch({ name: priorPickup.branchName, location: priorPickup.locationHint });
        if (priorResolution.kind === 'match' && priorResolution.branch.branch_name === confirmedBranch.branch_name && priorResolution.branch.branch_address === confirmedBranch.branch_address) parsedPickup = priorPickup;
      }
      if (!parsedPickup) return reply({ message: `Confirmed ${confirmedBranch.branch_name}.\n${confirmedBranch.branch_address}\n${lbcSource(confirmedBranch)}\nSend the buyer's name and phone number to prepare the pickup form.`, sourceUrl: confirmedBranch.source_url, googleSearchUrl: googleBranchSearchUrl(confirmationClues.name, confirmationClues.location) }, 200, headers);
    }
    const confirmedNameForReply = confirmedBranchForBuyerReply(messages);
    const buyerReply = confirmedNameForReply && parseBuyerIdentity(latest);
    if (buyerReply) {
      const resolution = await findLbcBranch({ name: confirmedNameForReply });
      if (resolution.kind !== 'match' || resolution.branch.branch_name !== confirmedNameForReply) return reply({ message: 'I could not verify the confirmed branch again. Please look it up before preparing this buyer.' }, 200, headers);
      confirmedBranch = resolution.branch;
      parsedPickup = { ...buyerReply, branchName: confirmedBranch.branch_name, locationHint: '' };
    }

    const pastedPickup = confirmedBranch && parsedPickup ? parsedPickup : deliveryChoice === 'pickup' ? parsedPickup : null;
    if (deliveryChoice === 'ambiguous' && /\b(?:add|create|save)\b[\s\S]*\bbuyer\b/i.test(latest)) {
      return reply({ message: 'For this LBC buyer, choose Door to door or Branch pickup before I prepare the form.' }, 200, headers);
    }
    if (!deliveryChoice && /\b(?:add|create|save)\s+(?:a\s+)?(?:new\s+)?(?:lbc\s+)?buyer\b/i.test(latest) && /\blbc\b/i.test(latest)) {
      return reply({ message: 'For this LBC buyer, is delivery Door to door or Branch pickup?' }, 200, headers);
    }
    if (pastedPickup) {
      const { data: existing, error: duplicateError } = await db.from('buyers')
        .select('id,name').eq('phone', pastedPickup.phone).maybeSingle();
      if (duplicateError) return reply({ message: 'I could not check for an existing buyer. Please try again.' }, 500, headers);
      if (existing) return reply({
        message: `${existing.name} already uses this phone number. Open that buyer to review or add another pickup location.`,
        existingBuyerId: existing.id,
      }, 200, headers);

      const resolution = confirmedBranch ? { kind: 'match' as const, branch: confirmedBranch } : await findLbcBranch({ name: pastedPickup.branchName, address: pastedPickup.branchAddress, location: pastedPickup.locationHint });
      if (resolution.kind === 'ambiguous') return reply({
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
      return reply({ message: notice, draft, sourceUrl: verified?.source_url ?? null, googleSearchUrl }, 200, headers);
    }

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
        toolState.resolvedPickup = resolution.branch;
        verifiedPickupPairs.add(pickupPair(toolState.resolvedPickup));
        history[0].content += ` The official LBC directory verifies this branch pair: name "${toolState.resolvedPickup.branch_name}", address "${toolState.resolvedPickup.branch_address}", source ${toolState.resolvedPickup.source_url}. Use both fields when adding an LBC pickup buyer. Never ask the user for the other field.`;
        if (standaloneBranchLookup) {
          return reply({ message: `${toolState.resolvedPickup.branch_name}\n${toolState.resolvedPickup.branch_address}\n${lbcSource(toolState.resolvedPickup)}`, sourceUrl: toolState.resolvedPickup.source_url, googleSearchUrl: googleBranchSearchUrl(toolState.resolvedPickup.branch_name) }, 200, headers);
        }
      } else if (resolution.kind === 'ambiguous') {
        return reply({ message: 'I found more than one LBC branch. Choose the exact branch below.', branchChoices: resolution.branches, googleSearchUrl: googleBranchSearchUrl(clues.name, clues.location) }, 200, headers);
      } else if (resolution.kind === 'unavailable') {
        return reply({ message: 'The official LBC directory is unavailable right now. You can check Google and paste the branch name and address here for review.', googleSearchUrl: googleBranchSearchUrl(clues.name, clues.location) }, 200, headers);
      } else {
        return reply({ message: 'I could not verify that LBC branch in the official directory. You can check Google and paste the branch name and address here for review.', googleSearchUrl: googleBranchSearchUrl(clues.name, clues.location) }, 200, headers);
      }
    }
    const suppliedPhoneNumbers = (userText.match(/(?:\+?\d[\d \t().-]{5,24}\d)/g) ?? []).map(phone).filter((value) => value.length >= 7 && value.length <= 15);
    if (/\badd\s+(?:a\s+)?buyer\b/i.test(latest) && !suppliedPhoneNumbers.length) {
      const branchNote = toolState.resolvedPickup ? `I found the LBC branch: ${toolState.resolvedPickup.branch_name} — ${toolState.resolvedPickup.branch_address}\nSource: ${toolState.resolvedPickup.source_url}\n\n` : '';
      return reply({ message: `${branchNote}Please provide the buyer's phone number before I add the record.` }, 200, headers);
    }

    const runTool = createToolRunner({ db, latest, userText, conversation, officialZipLookup, googleBranchSearchUrl, findLbcBranch, verifiedPickupPairs, pickupPair, branchContext, chosenDelivery, deliveryChoice }, toolState);
    function addBuyerResponse(outcome: any) {
      if (outcome.error) return reply({ message: outcome.error, existingBuyerId: outcome.existingBuyerId }, 200, headers);
      return reply({
        message: `Click Open review form to check ${outcome.draft.name}'s details, then click Create buyer to save.${toolState.publicSourceUrl && outcome.draft.deliveryMethod === 'door' ? ` I checked the public city, province, and ZIP against ${toolState.publicSourceUrl.includes('phlpost.gov.ph') ? 'PHLPost' : 'the linked geographic source'}.` : ''}`,
        draft: outcome.draft,
        sourceUrl: toolState.resolvedPickup?.source_url ?? toolState.publicSourceUrl,
      }, 200, headers);
    }
    if (toolState.resolvedPickup && /\badd\s+(?:a\s+)?buyer\b/i.test(latest)) {
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
        const locationQuestion = doorLocationQuestion(doorSource);
        if (locationQuestion) return reply({ message: locationQuestion }, 200, headers);
        if (!partialDoorAddress.city) return reply({ message: 'Please provide the city and province/region for this address.' }, 200, headers);
        if (!partialDoorAddress.province || !partialDoorAddress.zip_code) await runTool('lookup_zip', { location: partialDoorAddress.city });
        if (toolState.verifiedPublic.city && toolState.verifiedPublic.city.toLocaleLowerCase() !== partialDoorAddress.city.toLocaleLowerCase()) {
          return reply({ message: `I could not verify ${partialDoorAddress.city} as that city or municipality. Please confirm the city name.` }, 200, headers);
        }
        if (toolState.verifiedPublic.province && partialDoorAddress.province && toolState.verifiedPublic.province.toLocaleLowerCase() !== partialDoorAddress.province.toLocaleLowerCase()) {
          return reply({ message: `The province you sent conflicts with the ZIP lookup for ${partialDoorAddress.city}. Please confirm the city and province.` }, 200, headers);
        }
        const address: Record<string, string> = { ...toolState.verifiedPublic, ...partialDoorAddress } as Record<string, string>;
        const missing = addressFields.filter((field) => !filled(address[field]));
        if (missing.length) return reply({ message: `Please provide the ${missing.map((field) => field === 'zip_code' ? 'ZIP code' : field).join(' and ')} for this door-to-door address. I could not verify it automatically.` }, 200, headers);
        return addBuyerResponse(await runTool('add_buyer', {
          ...directIdentity, preferred_courier: courier, address,
        }));
      }
    }
    if (!partialDoorAddress && addressZip && directIdentity && /\b(?:add|create|save)\s+(?:a\s+)?buyer\b/i.test(doorSource)) {
      return reply({ message: 'I could not safely separate the barangay, city, and province. Please send just the address with commas between street, barangay, city, and province.' }, 200, headers);
    }
    const directAction = parseBuyerAction(latest);
    if (directAction && (directAction.action === 'delete' || directAction.patch)) {
      const candidates = await runTool('search_buyers', { query: directAction.query });
      if (candidates.error) return reply({ message: 'I could not search the buyer directory. Please try again.' }, 200, headers);
      if (!toolState.selectedBuyerId) return reply({ message: toolState.buyerSearchMessage ?? 'Please provide the exact saved buyer name or phone number.' }, 200, headers);
      if (directAction.action === 'delete') {
        const outcome = await runTool('delete_buyer', { id: toolState.selectedBuyerId });
        if (outcome.error) return reply({ message: outcome.error }, 200, headers);
        return reply({ message: `Delete ${outcome.pending.name} (${outcome.pending.phone})? To confirm, send exactly DELETE ${outcome.pending.code} within 5 minutes. The buyer stays saved until then.` }, 200, headers);
      }
      if (directAction.patch.pickup?.branch_name) {
        const resolution = await findLbcBranch({ name: directAction.patch.pickup.branch_name });
        if (resolution.kind === 'ambiguous') return reply({ message: 'Several LBC branches match. Choose the exact branch below.', branchChoices: resolution.branches }, 200, headers);
        if (resolution.kind === 'match') toolState.resolvedPickup = resolution.branch;
      }
      const outcome = await runTool('edit_buyer', { id: toolState.selectedBuyerId, ...directAction.patch });
      return reply({ message: outcome.error ?? outcome.message, existingBuyerId: outcome.existingBuyerId, editDraft: outcome.editDraft, sourceUrl: outcome.sourceUrl }, 200, headers);
    }
    const zipQuery = zipLookupQuery(latest);
    if (zipQuery) {
      const result = await runTool('lookup_zip', { location: zipQuery });
      if (!Array.isArray(result)) return reply({ message: result.error ?? 'The ZIP lookup is unavailable right now.' }, 200, headers);
      return reply({ message: zipLookupReply(result, zipQuery), sourceUrl: result[0]?.source_url ?? toolState.publicSourceUrl ?? null }, 200, headers);
    }
    if (!apiKey) return reply({ message: 'The assistant has not been configured yet.' }, 503, headers);
    return runModelConversation({ apiKey, history, tools, reply, runTool, reviewRequested, addBuyerResponse, getBranchGoogleUrl: () => toolState.lastBranchGoogleUrl, headers });
}
