import type { BuyerSummary } from './buyer-conversation.ts';
import { cleanBuyer, newBuyerMessage } from './buyer-state.ts';
import { statedDeliveryMethod } from './delivery-method.ts';
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const supplied = (value: string, text: string) => (` ${norm(text)} `).includes(` ${norm(value)} `);
const digits = (s: string) => s.replace(/\D/g, '').replace(/^63/, '0');
export function privateBranchClue(lookup: { name?: string; address?: string; location?: string }, identities: Array<string | undefined>): boolean {
  const clue = [lookup.name, lookup.address, lookup.location].filter(Boolean).join(' ');
  if (/(?:\+?63|0)9\d{9}/.test(clue.replace(/[ ().-]/g, ''))) return true;
  const tokens = new Set(norm(clue).split(' '));
  return identities.some((identity) => identity && norm(identity).split(' ').some((word) => word.length > 2 && tokens.has(word)));
}
export function buyerMutationMessage(text: string): boolean {
  if (newBuyerMessage(text)) return true;
  return !/\?|^(?:what|why|how|where|when|can you|could you|thanks|thank you|hello|hi)\b/i.test(text.trim()) && !/^(?:find|delete|remove|edit)\s+(?:a\s+)?buyer\b/i.test(text.trim());
}
export function validateExtraction(raw: unknown, text: string, current: BuyerSummary = {}): BuyerSummary {
  if (!buyerMutationMessage(text)) return {};
  const patch = cleanBuyer(raw); const accepted: BuyerSummary = {};
  for (const field of ['name', 'branchName', 'branchAddress'] as const) {
    const value = patch[field];
    const hasEvidence = value && (supplied(value, text) || (field === 'branchName' && value.split(',').every((part) => part.trim() && supplied(part, text))));
    if (!value || !hasEvidence) continue;
    if (field === 'name') {
      if (!/^[\p{L}][\p{L}.' -]+$/u.test(value) || value.trim().split(/\s+/).length < 2 || /\b(?:branch|lbc|mall|imall|robinsons|waltermart|puregold|gaisano|sm|street|brgy|road|city|province|pangalan|courier|ito|palitan|numero|niya|phone|contact|mobile|change|update|correct|replace)\b|^(?:si|kay|can you|could you|would you|please add|name is)\b/i.test(value)) continue;
      // Existing identity only changes when the user identifies the name field.
      // A phone correction's introductory words must never become a replacement name.
      if (current.name && norm(value) !== norm(current.name) && !/\b(?:name|pangalan)\b/i.test(text)) continue;
    }
    if (field !== 'name') {
      if (/(?:\+?63|0)9\d{9}/.test(value.replace(/[ ().-]/g, ''))) continue;
      const identities = [current.name, accepted.name].filter(Boolean) as string[];
      if (identities.some((identity) => norm(identity).split(' ').some((word) => word.length > 2 && norm(value).split(' ').includes(word)))) continue;
      // Courier mentions inside a street name are not branch intent.
      const branchIntent = /\b(?:branch|pickup|pick up|cop|mall|imall|robinsons|sm)\b/i.test(text) || current.deliveryMethod === 'pickup';
      if (!branchIntent || statedDeliveryMethod(text) === 'door') continue;
      if (field === 'branchName') {
        const clue = norm(value.split(',')[0]);
        const contextual = ['branch ', 'branch name ', 'branch to ', 'branch name to ', 'lbc ', 'lbc express ', 'pickup at ', 'pickup from '].some((prefix) => (` ${norm(text)} `).includes(` ${prefix}${clue} `));
        const marker = /\b(?:lbc|mall|imall|robinsons|waltermart|puregold|gaisano|sm|ayala)\b/i.test(value.split(',')[0]);
        if (!marker && !contextual) continue;
      }
      if (field === 'branchName' && (/^\d/.test(value) || /\b(?:street|road|avenue|highway|brgy|subdivision)\b/i.test(value))) continue;
      if (/\b(?:street|house|home)\s+(?:is|to|:)/i.test(text) && !/\bbranch\s+address\b/i.test(text)) continue;
    }
    accepted[field] = value;
  }
  const suppliedPhones = [...new Set([...text.matchAll(/(?:\+?63|0)[ ().-]*9[ ().-]*\d(?:[ ().-]*\d){8}\b/g)].map((match) => digits(match[0])))];
  if (patch.phone && suppliedPhones.length === 1 && /^09\d{9}$/.test(digits(patch.phone)) && suppliedPhones[0] === digits(patch.phone)) accepted.phone = digits(patch.phone);
  if (patch.address) for (const [field, value] of Object.entries(patch.address)) {
    if (/(?:\+?63|0)9\d{9}/.test(value.replace(/[ ().-]/g, ''))) continue;
    if ([current.name, accepted.name].some((identity) => identity && supplied(identity, value))) continue;
    if (field === 'street' && !/\d|\b(?:street|st\.?|road|rd\.?|purok|sitio|unit|building|block|blk|lot|subdivision|subd|avenue|ave|house)\b/i.test(value) && !/\b(?:street|address|bahay|tirahan)\b/i.test(text)) continue;
    if (supplied(value, text) && (field !== 'zipCode' || /^\d{4}$/.test(value))) accepted.address = { ...accepted.address, [field]: value };
  }
  if (patch.preferredCourier === 'LBC' && /\blbc\b/i.test(text)) accepted.preferredCourier = 'LBC';
  if (patch.preferredCourier === 'J&T Express' && /\bj\s*(?:&|n|and|\+)\s*t\b/i.test(text)) { accepted.preferredCourier = 'J&T Express'; accepted.deliveryMethod = 'door'; }
  const method = statedDeliveryMethod(text);
  if (method === 'pickup' || method === 'door') accepted.deliveryMethod = method;
  return accepted;
}
// Deterministic parsing and model extraction share the same evidence boundary.
// Only the changed fields need evidence in a correction; unchanged sealed fields survive.
export function validateBuyerChange(candidate: BuyerSummary, text: string, current: BuyerSummary = {}): BuyerSummary {
  const patch: BuyerSummary = {};
  for (const field of ['name', 'phone', 'preferredCourier', 'deliveryMethod', 'branchName', 'branchAddress'] as const) {
    if (candidate[field] !== current[field]) patch[field] = candidate[field];
  }
  for (const [field, value] of Object.entries(candidate.address ?? {})) {
    if (value !== current.address?.[field]) patch.address = { ...patch.address, [field]: value };
  }
  return validateExtraction(patch, text, current);
}
export async function extractBuyerWithAI(text: string, current: BuyerSummary, apiKey: string | undefined, fetcher: typeof fetch = fetch): Promise<BuyerSummary> {
  if (!apiKey || text.length > 6000 || !buyerMutationMessage(text)) return {};
  const properties = Object.fromEntries(['name', 'phone', 'preferredCourier', 'deliveryMethod', 'branchName', 'branchAddress', 'street', 'barangay', 'city', 'province', 'zipCode'].map((field) => [field, { type: ['string', 'null'] }]));
  Object.assign(properties.preferredCourier, { enum: ['LBC', 'J&T Express', null] });
  Object.assign(properties.deliveryMethod, { enum: ['door', 'pickup', null] });
  try {
    const response = await fetcher('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), body: JSON.stringify({
      model: 'qwen/qwen3.8-27b', temperature: 0, max_completion_tokens: 650,
      response_format: { type: 'json_schema', json_schema: { name: 'buyer_patch', strict: true, schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } } },
      messages: [{ role: 'system', content: 'Extract only buyer fields explicitly supplied in the latest user message, including informal English or Tagalog corrections. Return JSON. Null means not supplied; never repeat unchanged fields. Copy name, branch and address text exactly; never infer public address components. Courier values: LBC or J&T Express; deliveryMethod: door or pickup. Keep buyer identity separate from branch clues. Questions and unrelated conversation have all null values. Current draft is context only, not evidence: ' + JSON.stringify(current) }, { role: 'user', content: text }],
    }) });
    if (!response.ok) return {};
    const result = await response.json(); const content = result.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 6000) return {};
    const raw = JSON.parse(content); const { street, barangay, city, province, zipCode, ...buyer } = raw;
    return validateExtraction({ ...buyer, address: { street, barangay, city, province, zipCode } }, text, current);
  } catch { return {}; }
}
