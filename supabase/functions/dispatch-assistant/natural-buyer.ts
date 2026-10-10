import { statedDeliveryMethod } from './delivery-method.ts';
import { parsePartialDoorAddress } from './door-address.ts';

export type NaturalBuyer = {
  name?: string; phone?: string; preferredCourier?: string; deliveryMethod?: string;
  branchName?: string; location?: string; branchAddress?: string;
  address?: Record<string, string>; ambiguous?: boolean;
};
const branchWords = /\b(?:lbc|branch|i\s?mall|mall|sm|robinsons|puregold|waltermart|ayala|gaisano)\b/i;
const addressWords = /\b(?:city|province|metro|region|street|st|road|rd|avenue|ave|brgy|barangay|subdivision|subd|purok|block|blk|lot|unit|zip|postal|Philippines)\b/i;
const phonePattern = /(?:\+?63|0)9\d(?:[ ().-]*\d){8}\b/g;
const clean = (value: string) => value.replace(/^[\s:–-]+|[\s.!]+$/g, '').trim();

// Only positively identified destination spans become public lookup clues.
// Unclassified words stay out of searches; they are not fallback branch names.
export function extractNaturalBuyer(message: string): NaturalBuyer {
  const result: NaturalBuyer = {};
  if ([...message.matchAll(/(?:^|\n)\s*(?:LBC\s+)?branch\s+address\s*:/gi)].length > 1) return { ambiguous: true };
  const method = statedDeliveryMethod(message);
  const lbc = /\blbc\b/i.test(message);
  const jnt = /\bj\s*(?:&|n|and|\+)\s*t(?:\s*express)?\b/i.test(message);
  if (lbc !== jnt) result.preferredCourier = lbc ? 'LBC' : 'J&T Express';
  if (method === 'ambiguous' || (lbc && jnt) || (jnt && method === 'pickup')) result.ambiguous = true;
  else if (method || jnt) result.deliveryMethod = method ?? 'door';
  const phones = [...message.matchAll(phonePattern)];
  if (phones.length === 1) result.phone = phones[0][0].replace(/\D/g, '').replace(/^63/, '0');
  const labelledName = message.match(/(?:^|[,;\n])\s*(?:buyer\s*)?name\s*:\s*([^,;\n]+)/i)?.[1];
  const labelledBranch = message.match(/(?:^|[;\n])\s*(?:LBC\s+)?branch(?:\s+name)?\s*:\s*([^\n;]+)/i)?.[1];
  const labelledAddress = message.match(/(?:^|[;\n])\s*(?:LBC\s+)?branch\s+address\s*:\s*([^\n;]+)/i)?.[1];
  const text = message.replace(/\b(?:phone|mobile|contact)(?:\s*(?:number|no\.?|#))?\s*(?::|is)?\s*(?=(?:\+?63|0)9)/gi, '\n').replace(phonePattern, '\n')
    .replace(/(?:^|\n)\s*(?:LBC\s+)?branch\s+address\s*:[^\n]*/gi, '')
    .replace(/\b(?:please\s+)?(?:add|create|save)\s+(?:(?:a|this|new)\s+)*buyer\b\s*(?:named\s+)?/gi, '\n')
    .replace(/\b(?:send|ship)\s+(?:to|for)\s+/gi, '\n')
    .replace(/\b(?:via\s+)?lbc\s+(?:branch\s*(?:pick\s*up|pickuo)|pick\s*up|cop|d2d|door\s*(?:to|2)\s*door|door\s*delivery)\b\s*(?:at\s+)?/gi, '\n')
    .replace(/\b(?:branch\s*)?pick\s*up\s+(?:at|from)\s+lbc\b\s*/gi, '\nLBC ')
    .replace(/\b(?:via\s+)?j\s*(?:&|n|and|\+)\s*t(?:\s*express)?\b/gi, '\n')
    .replace(/\b(?:door\s*(?:to|2)\s*door|door\s*delivery|home\s*delivery|d2d|branch\s*pick\s*up|cop)\b/gi, '\n');
  const chunks = text.split(/[,;\n]+/).map((part) => clean(part)
    .replace(/^(?:and\s+)?(?:deliver(?:\s+it)?\s+to|delivery\s+to|address\s*:|at|to)\s+/i, '')
    .replace(/^(?:contact|phone|mobile)(?:\s*(?:number|no\.?|#))?\s*:?\s*$/i, ''))
    .filter((part) => part && !/^(?:lbc|pickup|pickuo|door|via|for|Philippines)$/i.test(part));
  const nameCandidates = chunks.filter((part) => {
    const value = part.replace(/^(?:buyer\s*)?name\s*:\s*/i, '');
    return !branchWords.test(value) && !addressWords.test(value) && /^[\p{L}][\p{L}.' -]+$/u.test(value) && value.split(/\s+/).length >= 2;
  });
  if (labelledName) result.name = clean(labelledName.replace(phonePattern, ''));
  else if (nameCandidates.length === 1) result.name = nameCandidates[0];
  if (result.deliveryMethod === 'pickup' && !result.ambiguous) {
    const branches = chunks.filter((part) => /^(?:lbc|branch|i\s?mall|mall|sm|robinsons|puregold|waltermart|ayala|gaisano)\b/i.test(part) && !/\b(?:address|for|buyer|recipient|phone|contact)\b/i.test(part));
    if (labelledBranch || branches.length === 1) {
      const branch = labelledBranch ?? branches[0];
      const [name, ...places] = branch.split(',').map(clean);
      result.branchName = name.replace(/^(?:LBC\s+)?branch(?:\s+name)?\s*:\s*/i, '').replace(/^lbc(?:\s+express)?\s*[-:]?\s*/i, '');
      const branchIndex = chunks.indexOf(branches[0]);
      const location = labelledBranch ? places : chunks.slice(branchIndex + 1).filter((part) => part !== result.name && !nameCandidates.includes(part) && !branchWords.test(part) && !/^\d/.test(part) && !/^(?:buyer\s*)?name\s*:/i.test(part));
      if (location.length) result.location = location.join(', ').replace(/\bCity\b/gi, '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
      if (labelledAddress) result.branchAddress = clean(labelledAddress);
    }
  }
  if (result.deliveryMethod !== 'pickup') {
    const addressParts = chunks.filter((part) => part !== result.name && !/^(?:LBC|JNT)$/i.test(part));
    const parsed = parsePartialDoorAddress(`door to door\n${addressParts.join(', ')}`) ?? parsePartialDoorAddress(`door to door\n${message}`);
    if (parsed) result.address = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key === 'zip_code' ? 'zipCode' : key, value]));
    const labels: Record<string, string> = { street: 'street', 'house address': 'street', barangay: 'barangay', brgy: 'barangay', city: 'city', province: 'province', region: 'province', zip: 'zipCode', 'zip code': 'zipCode', 'postal code': 'zipCode' };
    for (const part of chunks) {
      const field = part.match(/^(street|house address|barangay|brgy|city|province|region|zip code|postal code|zip)\s*[:.]\s*(.+)$/i);
      if (field) result.address = { ...result.address, [labels[field[1].toLowerCase()]]: field[2] };
    }
  }
  return result;
}

export function buyerFollowUp(buyer: NaturalBuyer): string | null {
  if (!buyer.preferredCourier || !buyer.deliveryMethod || buyer.ambiguous) return 'Which delivery should I use: LBC door-to-door, LBC branch pickup, or J&T door-to-door?';
  if (!buyer.name) return "What is the buyer's full name?";
  if (!buyer.phone) return "What is the buyer's mobile number?";
  if (buyer.deliveryMethod === 'pickup') return buyer.branchName ? null : 'Which LBC branch and city should I use?';
  const labels: Record<string, string> = { street: 'street or house address', barangay: 'barangay', city: 'city or municipality', province: 'province or region', zipCode: 'ZIP code' };
  const missing = Object.keys(labels).find((field) => !buyer.address?.[field]);
  return missing ? `What is the ${labels[missing]} for this delivery?` : null;
}
