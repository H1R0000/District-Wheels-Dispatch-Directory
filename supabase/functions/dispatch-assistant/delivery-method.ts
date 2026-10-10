export type DeliveryChoice = 'door' | 'pickup' | 'ambiguous' | null;

export function statedDeliveryMethod(message: string): DeliveryChoice {
  const text = String(message ?? '').toLowerCase().replace(/[-‐‑–—]/g, ' ').replace(/\bbranch\s+pickuo\b/g, 'branch pickup')
    .replace(/\b(?:d2d|door\s*2\s*door)\b/g, 'door to door')
    .replace(/\blbc\s+cop\b/g, 'lbc branch pickup')
    .replace(/\bpick\s*up\s+(?:at|from)\s+lbc\b/g, 'lbc branch pickup');
  const door = /\bdoor\s+to\s+door\b|\bdoor\s+delivery\b|\b(?:delivery|method)\s*:\s*door\b|\b(?:home|house)\s+delivery\b|\bdeliver\s+to\s+(?:my\s+|the\s+)?(?:home|house|address)\b|^\s*door[.!]?\s*$/g;
  const pickup = /\bbranch\s+pick\s*up\b|\bpick\s*up\s+(?:at|from)\s+(?:an?\s+|the\s+)?(?:lbc\s+)?branch\b|\blbc\s+pick\s*up\b|\b(?:delivery|method)\s*:\s*(?:branch\s+)?pick\s*up\b|\b(?:lbc\s+)?branch(?:\s+name)?\s*:|^\s*pick\s*up[.!]?\s*$/g;
  const doorMatches = [...text.matchAll(door)];
  const pickupMatches = [...text.matchAll(pickup)];
  if (!doorMatches.length) return pickupMatches.length ? 'pickup' : null;
  if (!pickupMatches.length) return 'door';

  if (/\b(?:not|no)\s+(?:for\s+)?(?:branch\s+)?pick\s*up\b/.test(text)) return 'door';
  if (/\b(?:not|no)\s+door(?:\s+to\s+door)?\b/.test(text)) return 'pickup';
  if (/\b(?:switch|change|move)\s+from\b/.test(text) && /\bto\b/.test(text)) {
    return (doorMatches.at(-1)?.index ?? -1) > (pickupMatches.at(-1)?.index ?? -1) ? 'door' : 'pickup';
  }
  return 'ambiguous';
}

export function latestDeliveryMethod(messages: Array<{ role?: string; content?: string }>): DeliveryChoice {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role !== 'user') continue;
    const content = String(messages[index].content ?? '');
    const choice = statedDeliveryMethod(content);
    if (choice) return choice;
    if (/\b(?:add|create|save)\s+(?:a\s+)?(?:new\s+)?(?:lbc\s+)?buyer\b/i.test(content)) return null;
  }
  return null;
}

export function chooseDeliveryMethod(
  messages: Array<{ role?: string; content?: string }>,
  parsedPickup = false,
): DeliveryChoice {
  const latestUser = [...messages].reverse().find((message) => message?.role === 'user');
  const explicit = statedDeliveryMethod(String(latestUser?.content ?? ''));
  return explicit ?? (parsedPickup ? 'pickup' : latestDeliveryMethod(messages));
}
