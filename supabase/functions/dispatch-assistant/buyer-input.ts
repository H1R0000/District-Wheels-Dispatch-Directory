import { parsePartialDoorAddress } from './door-address.ts';
import { buyerMessageLines } from './buyer-message-lines.ts';

export function parseBuyerIdentity(message: string) {
  const lines = buyerMessageLines(message);
  if (lines.filter((line) => /^\+?[\d\s().-]+$/.test(line) && /^\d{10,13}$/.test(line.replace(/\D/g, ''))).length !== 1) return null;
  const numberIndex = lines.findIndex((line) => /^\+?[\d\s().-]+$/.test(line) && /^\d{10,13}$/.test(line.replace(/\D/g, '')));
  if (numberIndex < 1) return null;
  const name = lines[numberIndex - 1].replace(/^(?:buyer\s*)?name\s*:\s*/i, '').trim();
  if (!/^[\p{L}][\p{L}.' -]+$/u.test(name) || name.split(/\s+/).length < 2 || name.length > 120) return null;
  return { name, phone: lines[numberIndex] };
}

export function doorBuyerSource(messages: string[]) {
  const latest = messages.at(-1) ?? '';
  const previousBuyer = [...messages.slice(0, -1)].reverse().find((item) =>
    /\b(?:add|create|save)\s+(?:a\s+)?buyer\b/i.test(item) &&
    parseBuyerIdentity(item)
  );
  if (!previousBuyer) return latest;
  if (/^(?:lbc\s+)?door(?:\s*to\s*door)?[.!]?$/i.test(latest.trim()) &&
    (/\b(?:brgy\.?|barangay)\s+/i.test(previousBuyer) || parsePartialDoorAddress(previousBuyer))) return `${previousBuyer}\n${latest}`;
  if (!parseBuyerIdentity(latest) && /\b(?:brgy\.?|barangay)\s+/i.test(latest) && /\b\d{4}\s*$/.test(latest)) {
    return `${previousBuyer}\n${latest}`;
  }
  return latest;
}
