import { parseBuyerIdentity } from './buyer-input.ts';
import { parsePickupMessage } from './lbc-resolver.ts';
import { parsePartialDoorAddress } from './door-address.ts';
import { statedDeliveryMethod } from './delivery-method.ts';

type Message = { role?: string; content?: string; completedBuyer?: boolean; branchChoices?: Array<{ branch_name: string; branch_address: string }> };
export type BuyerSummary = {
  name?: string; phone?: string; preferredCourier?: string; deliveryMethod?: string;
  address?: Record<string, string>; branchName?: string; branchAddress?: string;
};
const newBuyer = /\b(?:add|create|save)\s+(?:a\s+|this\s+)?(?:new\s+)?buyer\b/i;

export function buyerSessionMessages(messages: Message[]) {
  const start = messages.findLastIndex((item) => item.completedBuyer || (item.role === 'user' && newBuyer.test(item.content ?? '')));
  return start < 0 ? messages : messages.slice(start);
}

export function selectedBranch(messages: Message[]) {
  const reply = String(messages.at(-1)?.content ?? '').trim();
  const choice = reply.match(/^(?:(?:use|choose|select|pick)\s+)?(?:the\s+)?(?:option\s+)?(first|second|third|fourth|fifth|[1-9]\d?)(?:st|nd|rd|th)?(?:\s+(?:one|branch|option))?[.!]?$/i);
  const previous = messages.at(-2);
  if (!choice || previous?.role !== 'assistant' || !Array.isArray(previous.branchChoices)) return null;
  const ordinals: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  const index = (ordinals[choice[1].toLowerCase()] ?? Number(choice[1])) - 1;
  const branch = previous.branchChoices[index];
  return branch && typeof branch.branch_name === 'string' && typeof branch.branch_address === 'string' ? branch : null;
}

export function conversationBuyer(messages: Message[]): { summary: BuyerSummary | null; changed: boolean } {
  let summary: BuyerSummary | null = null;
  let changed = false;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    changed = false;
    const text = String(message.content ?? '').trim();
    const identity = parseBuyerIdentity(text);
    const pickup = parsePickupMessage(text);
    const starts = newBuyer.test(text) || Boolean(identity && /\b(?:lbc|jnt|j&t)\b/i.test(text)) || Boolean(pickup);
    if (/^(?:edit|update|delete|remove|find)\s+(?:a\s+)?buyer\b/i.test(text)) { summary = null; continue; }
    if (starts) { summary = {}; changed = true; }
    if (!summary) continue;
    if (identity || pickup) { Object.assign(summary, { name: (pickup ?? identity)!.name, phone: (pickup ?? identity)!.phone }); changed = true; }
    if (pickup) { Object.assign(summary, { branchName: [pickup.branchName, pickup.locationHint].filter(Boolean).join(', '), ...(pickup.branchAddress ? { branchAddress: pickup.branchAddress } : {}), deliveryMethod: 'pickup', preferredCourier: 'LBC' }); }
    const fields: Record<string, string> = { name: 'name', phone: 'phone', 'phone number': 'phone', street: 'street', barangay: 'barangay', city: 'city', province: 'province', 'zip code': 'zipCode', zip: 'zipCode', branch: 'branchName', 'branch name': 'branchName', 'branch address': 'branchAddress' };
    const correction = text.match(/^(?:(?:please\s+)?(?:change|set|update|correct)\s+(?:only\s+)?(?:the\s+)?)?(name|phone number|phone|street|barangay|city|province|zip code|zip|branch address|branch name|branch)\s*(?::|\s+to\s+)\s*(.+)$/i);
    if (correction) {
      const field = fields[correction[1].toLowerCase()];
      const value = correction[2].trim();
      if (['name', 'phone', 'branchName', 'branchAddress'].includes(field)) Object.assign(summary, { [field]: value });
      else summary.address = { ...summary.address, [field]: value };
      changed = true;
    }
    if (/^\+?[\d\s().-]+$/.test(text) && /^\d{10,13}$/.test(text.replace(/\D/g, ''))) { summary.phone = text; changed = true; }
    const previous = String(messages[index - 1]?.content ?? '');
    if (!summary.name && /(?:provide|send|what).*\bname\b/i.test(previous) && /^[\p{L}][\p{L}.' -]+$/u.test(text) && text.split(/\s+/).length >= 2 && !/\b(?:door|branch|lbc|pickup)\b/i.test(text)) { summary.name = text; changed = true; }
    const method = statedDeliveryMethod(text);
    const deliveryReply = /^(?:use\s+)?(?:lbc\s+)?(?:door(?:\s+to\s+door)?|branch\s*pickup|pickup)[.!]?$/i.test(text) || /^j\s*(?:&|n|and)\s*t(?:\s+express)?(?:\s+door\s+to\s+door)?[.!]?$/i.test(text);
    if (starts || deliveryReply) {
      if (/\bj\s*(?:&|n|and)\s*t\b/i.test(text)) { summary.preferredCourier = 'J&T Express'; summary.deliveryMethod = 'door'; changed = true; }
      else if (/\blbc\b/i.test(text)) summary.preferredCourier = 'LBC';
      if (method === 'door' || method === 'pickup') { summary.deliveryMethod = method; changed = true; }
      if (method === 'ambiguous') summary.deliveryMethod = undefined;
    }
    const address = parsePartialDoorAddress(`door to door\n${text}`);
    if (address) {
      summary.address = { ...summary.address, ...Object.fromEntries(Object.entries(address).map(([key, value]) => [key === 'zip_code' ? 'zipCode' : key, value])) };
      changed = true;
    }
    const branch = selectedBranch(messages.slice(0, index + 1));
    if (branch) { Object.assign(summary, { branchName: branch.branch_name, branchAddress: branch.branch_address, preferredCourier: 'LBC', deliveryMethod: 'pickup' }); changed = true; }
  }
  return { summary, changed };
}

export function buyerRequest(summary: BuyerSummary | null): string | null {
  if (!summary?.name || !summary.phone || !summary.preferredCourier || !summary.deliveryMethod) return null;
  const heading = ['add buyer', `${summary.preferredCourier} ${summary.deliveryMethod === 'pickup' ? 'branch pickup' : 'door to door'}`, summary.name, summary.phone];
  if (summary.deliveryMethod === 'pickup') return summary.branchName ? [...heading, `LBC Branch: ${summary.branchName}`, ...(summary.branchAddress ? [`LBC Branch Address: ${summary.branchAddress}`] : [])].join('\n') : null;
  const address = summary.address;
  if (!address?.street || !address.barangay || !address.city) return null;
  return [...heading, [address.street, `Brgy. ${address.barangay}`, address.city, address.province, address.zipCode].filter(Boolean).join(', ')].join('\n');
}

export function summaryFields(summary: BuyerSummary): Array<[string, string | undefined, string]> {
  const fields: Array<[string, string | undefined, string]> = [['Name', summary.name, 'name'], ['Phone', summary.phone, 'phone'], ['Courier', summary.preferredCourier, 'courier'], ['Delivery', summary.deliveryMethod === 'pickup' ? 'Branch pickup' : summary.deliveryMethod === 'door' ? 'Door to door' : undefined, 'delivery']];
  return fields.concat(summary.deliveryMethod === 'pickup'
    ? [['Branch', summary.branchName, 'branch name'], ['Branch address', summary.branchAddress, 'branch address']]
    : [['Street', summary.address?.street, 'street'], ['Barangay', summary.address?.barangay, 'barangay'], ['City', summary.address?.city, 'city'], ['Province', summary.address?.province, 'province'], ['ZIP code', summary.address?.zipCode, 'zip code']]);
}
