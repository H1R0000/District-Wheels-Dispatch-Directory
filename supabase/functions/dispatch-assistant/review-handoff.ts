export function isReviewRequest(text: string) {
  return /^(?:please\s+)?(?:save(?:\s+(?:it|this|buyer))?|review(?:\s+(?:buyer\s+)?form)?|open(?:\s+the)?\s+(?:buyer\s+)?form|correct|yes|confirm|looks good|where(?:\s+is)?\s+(?:the\s+)?save(?:\s+button)?)[.!?]*$/i.test(text.trim());
}

export function claimsReviewForm(text: string) {
  return /\b(?:click|press|tap)\s+(?:the\s+)?save\b|\bdraft\b[\s\S]{0,50}\b(?:ready|review)\b|\bready\b[\s\S]{0,50}\breview\b/i.test(text);
}

type ReviewMessage = { role?: string; content?: string; draft?: unknown; editDraft?: unknown; completedBuyer?: boolean };
export function availableReviewMessage<T extends ReviewMessage>(messages: T[]): T | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.completedBuyer) return undefined;
    if (message.role === 'user' && !isReviewRequest(message.content ?? '')) return undefined;
    if (message.draft || message.editDraft) return message;
  }
  return undefined;
}
