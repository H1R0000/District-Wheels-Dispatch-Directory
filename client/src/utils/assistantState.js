export const buyerStateKey = (userId) => `dcw-dispatch-buyer-state:${userId}`;

export function validBuyerState(value) {
  const state = value?.buyerState;
  return state?.version === 1 && typeof state.id === 'string' && !!state.id &&
    Number.isInteger(state.revision) && state.revision >= 0 &&
    ['collecting', 'ready'].includes(state.status) && state.buyer &&
    typeof state.buyer === 'object' && !Array.isArray(state.buyer) &&
    Object.entries(state.buyer).every(([key, detail]) => key === 'address'
      ? detail && typeof detail === 'object' && !Array.isArray(detail) && Object.values(detail).every((field) => typeof field === 'string')
      : typeof detail === 'string') &&
    ((typeof value.buyerStateToken === 'string' && !!value.buyerStateToken) || value.statePersistence === 'stateless');
}

export function loadBuyerState(storage, userId) {
  try {
    const value = JSON.parse(storage.getItem(buyerStateKey(userId)));
    return validBuyerState(value) ? value : null;
  } catch { return null; }
}

export function persistBuyerState(storage, userId, value) {
  try {
    if (validBuyerState(value)) storage.setItem(buyerStateKey(userId), JSON.stringify(value));
    else storage.removeItem(buyerStateKey(userId));
  } catch { /* Keep the active draft in memory when storage is unavailable. */ }
}

export function startsNewBuyer(text) {
  return /^\s*(?:please\s+)?(?:add|create|new|start)\s+(?:(?:a|another|new|this)\s+)*buyer\b/i.test(text);
}

export function activeBuyerMessages(messages) {
  const start = messages.findLastIndex((message) => message.completedBuyer || (message.role === 'user' && startsNewBuyer(message.content ?? '')));
  return start < 0 ? messages : messages.slice(start + (messages[start].completedBuyer ? 1 : 0));
}

export function stateReviewMessage(messages, state) {
  if (!state) return undefined;
  const buyer = state.buyerState;
  return activeBuyerMessages(messages).findLast((message) =>
    (message.draft || message.editDraft) && message.buyerStateId === buyer.id && message.buyerStateRevision === buyer.revision);
}

export function applyBuyerState(current, response, request, activeRequest) {
  if (request !== activeRequest) return current;
  if (response?.deletedBuyer || response?.completedBuyer) return null;
  if (!validBuyerState(response)) return current;
  const next = { buyerState: response.buyerState, ...(response.buyerStateToken ? { buyerStateToken: response.buyerStateToken } : {}), ...(response.statePersistence === 'stateless' ? { statePersistence: 'stateless' } : {}) };
  if (current?.buyerState.id === next.buyerState.id && current.buyerState.revision > next.buyerState.revision) return current;
  return next;
}
