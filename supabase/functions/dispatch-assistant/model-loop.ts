import { claimsReviewForm } from './review-handoff.ts';
export async function runModelConversation({ apiKey, history, tools, reply, runTool, reviewRequested, addBuyerResponse, getBranchGoogleUrl, headers, fetcher = fetch }: any) {
    let requireDraftTool = reviewRequested;
    for (let step = 0; step < 4; step++) {
      const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen/qwen3.8-27b', messages: history, tools, tool_choice: 'auto', temperature: 0.1, max_completion_tokens: 700 }), signal: AbortSignal.timeout(25000) });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 3600 ? ` Try again in ${Math.ceil(retryAfter)} seconds.` : ' Please try again shortly.';
        return reply({ message: `The AI service is busy.${wait}`, code: 'rate_limited' }, 429, headers);
      }
      if (!response.ok) {
        console.error('Groq request failed:', response.status);
        return reply({ message: 'The AI service could not process that request. Please try again.', code: 'ai_service_error' }, 502, headers);
      }
      const result = await response.json(); const message = result.choices?.[0]?.message;
      if (!message?.tool_calls?.length) {
        if (requireDraftTool || claimsReviewForm(String(message?.content ?? ''))) {
          if (!requireDraftTool) {
            requireDraftTool = true;
            history.push({ role: 'system', content: 'No review form exists yet. Call add_buyer or edit_buyer to prepare the structured form using supplied details. If information is missing, ask one specific question. Do not describe a draft as ready or direct the user to save without a successful tool result.' });
            continue;
          }
          return reply({ message: 'I have not prepared a review form yet. Please send the missing buyer or delivery details, or click Prepare review form to retry.', prepareReview: true }, 200, headers);
        }
        return reply({ message: message?.content || 'I could not complete that request.', googleSearchUrl: getBranchGoogleUrl() }, 200, headers);
      }
      history.push(message);
      for (const call of message.tool_calls) {
        let args = {}; try { args = JSON.parse(call.function.arguments); } catch { /* validated by tool */ }
        const outcome = await runTool(call.function.name, args);
        if (call.function.name === 'add_buyer') {
          return addBuyerResponse(outcome);
        }
        if (call.function.name === 'edit_buyer') {
          return reply({ message: outcome.error ?? outcome.message, existingBuyerId: outcome.existingBuyerId, editDraft: outcome.editDraft, sourceUrl: outcome.sourceUrl }, 200, headers);
        }
        if (call.function.name === 'delete_buyer') {
          if (outcome.error) return reply({ message: outcome.error }, 200, headers);
          return reply({ message: `Delete ${outcome.pending.name} (${outcome.pending.phone})? To confirm, send exactly DELETE ${outcome.pending.code} within 5 minutes. Any other message leaves the buyer in place.` }, 200, headers);
        }
        if (call.function.name === 'search_lbc_branch' && outcome.ambiguousBranches) {
          return reply({ message: 'I found more than one LBC branch. Choose the exact branch below.', branchChoices: outcome.ambiguousBranches, googleSearchUrl: getBranchGoogleUrl() }, 200, headers);
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(outcome) });
      }
    }
    return reply({ message: 'Please make that request more specific.' }, 200, headers);
}
