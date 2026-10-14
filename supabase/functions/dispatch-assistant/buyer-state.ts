import type { BuyerSummary } from './buyer-conversation.ts';
export type BuyerState = { version: 1; id: string; revision: number; buyer: BuyerSummary; status: 'collecting' | 'ready' };
const fields = ['name', 'phone', 'preferredCourier', 'deliveryMethod', 'branchName', 'branchAddress'];
export function cleanBuyer(value: unknown): BuyerSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>; const buyer: Record<string, any> = {};
  for (const field of fields) if (typeof source[field] === 'string' && source[field].trim() && source[field].length <= 500) buyer[field] = source[field].trim();
  if (!['LBC', 'J&T Express'].includes(buyer.preferredCourier)) delete buyer.preferredCourier;
  if (!['door', 'pickup'].includes(buyer.deliveryMethod)) delete buyer.deliveryMethod;
  if (buyer.phone) {
    const phone = buyer.phone.replace(/\D/g, '').replace(/^63/, '0');
    if (/^09\d{9}$/.test(phone)) buyer.phone = phone;
    else delete buyer.phone;
  }
  if (buyer.name && !/^[\p{L}][\p{L}.' -]{1,119}$/u.test(buyer.name)) delete buyer.name;
  if (buyer.branchName && /(?:\+?63|0)9\d{9}/.test(buyer.branchName.replace(/[ ().-]/g, ''))) delete buyer.branchName;
  if (source.address && typeof source.address === 'object' && !Array.isArray(source.address)) {
    const address: Record<string, string> = {};
    for (const field of ['street', 'barangay', 'city', 'province', 'zipCode']) {
      const part = (source.address as any)[field];
      if (typeof part === 'string' && part.trim() && part.length <= 500 && (field !== 'zipCode' || /^\d{4}$/.test(part.trim()))) address[field] = part.trim();
    }
    if (Object.keys(address).length) buyer.address = address;
  }
  return buyer;
}
export function mergeBuyer(current: BuyerSummary, patch: BuyerSummary): BuyerSummary {
  const next = cleanBuyer(patch);
  const buyer = { ...cleanBuyer(current), ...next, ...(next.address ? { address: { ...current.address, ...next.address } } : {}) };
  if (next.branchName && next.branchName !== current.branchName && !next.branchAddress) delete buyer.branchAddress;
  if (next.deliveryMethod && next.deliveryMethod !== current.deliveryMethod) {
    if (next.deliveryMethod === 'door') { delete buyer.branchName; delete buyer.branchAddress; }
    else delete buyer.address;
  }
  if (buyer.preferredCourier === 'J&T Express') { buyer.deliveryMethod = 'door'; delete buyer.branchName; delete buyer.branchAddress; }
  return buyer;
}
export function newBuyerMessage(text: string): boolean {
  return /\b(?:add|create|start)\s+(?:(?:a|this|new|another)\s+)*buyer\b|^new\s+buyer\b/i.test(text);
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function key(secret: string) { return crypto.subtle.importKey('raw', new TextEncoder().encode(`dispatch-buyer-state:v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function sealBuyerState(state: BuyerState, userId: string, secret: string | undefined, now = Date.now()): Promise<string | undefined> {
  if (!secret) return undefined;
  const payload = encode(new TextEncoder().encode(JSON.stringify({ ...state, userId, expires: now + 24 * 60 * 60 * 1000 })));
  return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(payload))))}`;
}
export async function readBuyerState(token: unknown, userId: string, secret: string | undefined, now = Date.now()): Promise<BuyerState | null> {
  if (!secret || typeof token !== 'string' || token.length > 12000) return null;
  try {
    const parts = token.split('.'); if (parts.length !== 2) return null;
    if (!await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), new TextEncoder().encode(parts[0]))) return null;
    const value = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (value.userId !== userId || value.version !== 1 || !Number.isFinite(value.expires) || value.expires <= now || value.expires > now + 86400000 || typeof value.id !== 'string' || !value.id || value.id.length > 80 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !['collecting', 'ready'].includes(value.status)) return null;
    const buyer = cleanBuyer(value.buyer);
    if (JSON.stringify(buyer) !== JSON.stringify(value.buyer)) return null;
    return { version: 1, id: value.id, revision: value.revision, buyer, status: value.status };
  } catch { return null; }
}
