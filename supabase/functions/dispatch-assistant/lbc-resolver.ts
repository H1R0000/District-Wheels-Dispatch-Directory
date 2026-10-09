import { latestDeliveryMethod, statedDeliveryMethod } from './delivery-method.ts';

export type LbcBranch = {
  branch_name: string;
  branch_address: string;
  source_url: string;
  verified_at?: string;
};

export type LbcResolution =
  | { kind: 'match'; branch: LbcBranch }
  | { kind: 'ambiguous'; branches: LbcBranch[] }
  | { kind: 'not_found' | 'unavailable' };

type Clues = { name?: string; address?: string; location?: string };

export type PickupMessage = {
  name: string;
  phone: string;
  branchName: string;
  locationHint: string;
  branchAddress?: string;
};

const pickupMethodLine = /^(?:lbc(?:\s+express)?\s+)?(?:branch\s*(?:pick\s*up|pickuo)|pick\s*up(?:\s+at\s+(?:the\s+)?branch)?|branch)[.!:]?$/i;
const branchMarker = /\b(?:lbc|branch|mall|imall|puregold|waltermart|robinsons|sm|ayala|gaisano)\b/i;

function locationHint(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/\b(City)\s+([\p{L}][\p{L} -]*)$/iu, '$1, $2');
}

export function parsePickupMessage(message: string): PickupMessage | null {
  const method = statedDeliveryMethod(message);
  if (method === 'door' || method === 'ambiguous') return null;
  const inputLines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const addressLabel = /^(?:LBC\s+)?Branch\s+Address\s*:\s*/i;
  const addresses = inputLines.filter((line) => addressLabel.test(line));
  if (addresses.length > 1) return null;
  const branchAddress = addresses[0]?.replace(addressLabel, '').trim();
  const lines = inputLines.filter((line) => !addressLabel.test(line)).map((line) => line
    .replace(/^(?:contact|phone|mobile)(?:\s*(?:number|no\.?|#))?\s*:\s*/i, '')
    .replace(/^(?:LBC\s+)?Branch(?:\s+Name)?\s*:\s*(?:LBC(?:\s+Express)?\s*)?/i, 'LBC '));
  if (/^(?:please\s+)?(?:add|create|save)\s+(?:a\s+|this\s+)?buyer[.!:]?$/i.test(lines[0] ?? '')) lines.shift();
  if (lines.length < 3 || lines.length > 6) return null;

  const phoneLines = lines.filter((line) => /^\+?[\d\s().-]+$/.test(line) && /^\d{10,13}$/.test(line.replace(/\D/g, '')));
  if (phoneLines.length !== 1) return null;
  const digits = phoneLines[0].replace(/\D/g, '');
  const phone = digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
  const details = lines.filter((line) => line !== phoneLines[0] && !pickupMethodLine.test(line));
  const branchLines = details.filter((line) => branchMarker.test(line));
  if (branchLines.length !== 1) return null;
  const rawBranch = branchLines[0];
  const branchLine = rawBranch
    .replace(/^LBC(?:\s*Express)?\s*[-–:]?\s*/i, '')
    .replace(/^(?:branch\s*pick\s*up|pick\s*up\s+at\s+(?:the\s+)?branch|pick\s*up|branch)\s*[-–:]?\s*/i, '')
    .trim();
  if (!branchLine) return null;
  if (/^\d|\b(?:st\.?|street|road|rd\.?|avenue|ave\.?|brgy\.?|barangay|subdivision|subd\.?|house|unit)\b/i.test(branchLine)) return null;
  const remainder = details.filter((line) => line !== rawBranch);
  const nameLines = remainder.filter((line) => {
    const candidate = line.replace(/^(?:buyer\s*)?name\s*:\s*/i, '').trim();
    return candidate.length <= 120 && /^[\p{L}][\p{L}.' -]+$/u.test(candidate) && candidate.split(/\s+/).length >= 2 &&
      !/\b(?:city|province|metro|region)\b/i.test(candidate);
  });
  if (nameLines.length !== 1) return null;
  const name = nameLines[0].replace(/^(?:buyer\s*)?name\s*:\s*/i, '').trim();
  const [branchName, ...inlineLocation] = branchLine.split(',').map((part) => part.trim());
  if (!branchName) return null;
  return {
    name,
    phone,
    branchName,
    locationHint: locationHint([...inlineLocation, ...remainder.filter((line) => line !== nameLines[0])].join(', ')),
    ...(branchAddress ? { branchAddress } : {}),
  };
}

export function parsePickupAddressFollowUp(messages: Array<{ role?: string; content?: string }>): PickupMessage | null {
  const latest = messages.at(-1);
  const answer = String(latest?.content ?? '').trim();
  if (latest?.role !== 'user' || !/^.{15,180}$/.test(answer) || !/\d/.test(answer) ||
    !/\b(?:st\.?|street|road|rd\.?|avenue|ave\.?|city|province|barangay|brgy|compound|mall)\b/i.test(answer)) return null;
  const prompt = messages.at(-2);
  if (prompt?.role !== 'assistant' || !/\b(?:branch|pickup)\b/i.test(String(prompt.content ?? '')) ||
    !/\baddress\b/i.test(String(prompt.content ?? ''))) return null;
  const previous = messages.at(-3);
  const original = previous?.role === 'user' ? parsePickupMessage(String(previous.content ?? '')) : null;
  return original ? { ...original, branchAddress: answer } : null;
}

export function parsePickupConfirmation(messages: Array<{ role?: string; content?: string }>): PickupMessage | null {
  const latest = messages.at(-1);
  if (latest?.role !== 'user' || !/^(?:yes|yep|yeah|confirm|go ahead|add it|save it)[.!]?$/i.test(String(latest.content ?? '').trim())) return null;
  if (latestDeliveryMethod(messages.slice(0, -2)) === 'door') return null;

  const offer = messages.at(-2);
  if (offer?.role !== 'assistant' || !/\b(?:can|ready to|will)\s+add\b/i.test(String(offer.content ?? '')) ||
    !/\bLBC\s+branch\s+pickup\b/i.test(String(offer.content ?? ''))) return null;

  const fields: Record<string, string> = {};
  let currentField = '';
  for (const line of String(offer.content).replaceAll('**', '').split(/\r?\n/)) {
    const labeled = line.match(/^\s*[-*]\s*(Name|Phone|Branch|Branch address):\s*(.*)$/i);
    if (labeled) {
      currentField = labeled[1].toLowerCase();
      fields[currentField] = labeled[2].trim();
    } else if (currentField && line.trim() && !/^\s*[-*]\s/.test(line)) {
      fields[currentField] += ` ${line.trim()}`;
    } else if (!line.trim()) {
      currentField = '';
    }
  }
  const name = fields.name?.trim();
  const branchName = fields.branch?.trim();
  const digits = fields.phone?.replace(/\D/g, '') ?? '';
  const phone = digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
  if (!name || !branchName || !/^\d{10,13}$/.test(phone)) return null;

  return { name, phone, branchName, locationHint: '' };
}

const plain = (value: string) => value.toLowerCase()
  .replace(/^lbc\s*(?:express)?\s*[-–:]?\s*/, '')
  .replace(/\bi\s+mall\b/g, 'imall')
  .replace(/\bground\s+floor\b/g, 'g f')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ').trim();

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function extractLbcClues(message: string): Clues {
  const name = message.match(/(?:^|\n)\s*(?:LBC\s+)?Branch(?:\s+Name)?\s*:\s*([^\n]+)/i)?.[1];
  const address = message.match(/(?:^|\n)\s*(?:LBC\s+)?(?:Branch\s+)?Address\s*:\s*([^\n]+)/i)?.[1];
  if (name || address) return { name: name && clean(name), address: address && clean(address) };
  const pickup = parsePickupMessage(message);
  if (pickup) return { name: pickup.branchName, location: pickup.locationHint };
  const inlineName = message.match(/\blbc(?:\s+express)?\s+(.+?)\s+branch\s+pickup\b/i)?.[1]
    ?? message.match(/\blbc\s+branch\s+pickup[ \t]+(?:at[ \t]+|in[ \t]+|from[ \t]+)?([^\n,]+)/i)?.[1];
  if (inlineName) return { name: clean(inlineName) };
  if (/\b(?:buyer|customer|recipient|door\s*to\s*door)\b/i.test(message)) return {};
  const standalone = message.match(/\blbc(?:\s+express)?\s+([^\n?]+)/i)?.[1]
    ?.replace(/^[\s:–-]+/, '')
    .replace(/^(?:(?:branch|named|name|address|at|for|of|in|near|the)\s+)+/i, '');
  return standalone && !pickupMethodLine.test(`LBC ${standalone}`) ? { name: clean(standalone) } : {};
}

export function confirmedBranchClues(messages: Array<{ role?: string; content?: string }>): Clues | null {
  const latest = messages.at(-1);
  if (latest?.role !== 'user' || !/^(?:correct|yes|yes correct|that's correct|that is correct|right|that's right)[.!]?$/i.test(String(latest.content ?? '').trim())) return null;
  const answer = messages.at(-2);
  const answerText = String(answer?.content ?? '');
  if (answer?.role !== 'assistant' || !/Source:\s*https:\/\/www\.lbcexpress\.com\/branches-philippines\//i.test(answerText)) return null;
  const branchLine = answerText.split(/\r?\n/)[0]?.trim();
  if (!/^LBC\s+Express\b/i.test(branchLine)) return null;
  const preceding = messages.at(-3);
  const clues = preceding?.role === 'user' ? extractLbcClues(String(preceding.content ?? '')) : {};
  return clues.name || clues.address ? clues : { name: branchLine };
}

export function confirmedBranchForBuyerReply(messages: Array<{ role?: string; content?: string }>): string | null {
  if (messages.at(-1)?.role !== 'user') return null;
  const answer = messages.at(-2);
  const text = String(answer?.content ?? '');
  if (answer?.role !== 'assistant' || !/Source:\s*https:\/\/www\.lbcexpress\.com\/branches-philippines\//i.test(text) ||
    !/Send the buyer's name and phone number to prepare the pickup form\./i.test(text)) return null;
  return text.match(/^Confirmed (LBC\s+Express\s*-\s*[^\r\n]+)\./i)?.[1]?.trim() ?? null;
}

export function searchTerms({ name, address, location }: Clues) {
  const terms: string[] = [];
  if (name) {
    const words = clean(name).replace(/^LBC\s*(?:Express)?\s*[-–:]?\s*/i, '').split(/\s+/);
    const commonStart = /^(?:sm|robinsons|ayala|puregold|gaisano)$/i.test(words[0]);
    const firstLength = commonStart ? Math.min(3, words.length) : 1;
    terms.push(words.slice(0, firstLength).join(' '), words.join(' '));
    for (let count = Math.min(3, words.length); count > 1; count--) terms.push(words.slice(0, count).join(' '));
    terms.push(...words.filter((word) => word.replace(/[^\p{L}\p{N}]/gu, '').length >= 5).slice(0, 3));
  }
  if (address) {
    const parts = address.split(',').map(clean).filter((part) => part.length >= 5 && part.length <= 70);
    terms.push(...parts.filter((part) => !/\b(?:unit|floor|barangay|brgy)\b/i.test(part) && !/^\d/.test(part) && !/^(?:cubao|quezon city|metro manila|paco|makati|pasig|pampanga)$/i.test(part)).slice(0, 3));
    for (const part of parts.slice(0, 3)) {
      const words = part.match(/[\p{L}]{5,}/gu)?.filter((word) => !/^(?:ground|floor|street|corner|barangay|metro|manila|quezon)$/i.test(word)) ?? [];
      terms.push(...words.slice(0, 2));
    }
  }
  if (location) terms.push(...clean(location).split(/[\s,]+/)
    .filter((word) => word.length >= 4 && !/^(?:city|metro|province|region)$/i.test(word)).slice(0, 2));
  return [...new Set(terms.map(clean).filter((term) => term.length >= 3))].slice(0, 8);
}

function parseEntries(html: string, source_url: string): LbcBranch[] {
  const decode = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return [...html.matchAll(/<span class="csc-branch-list-1">([\s\S]*?)<\/span>\s*<span class="csc-branch-list-2">([\s\S]*?)<\/span>/gi)]
    .map((match) => ({ branch_name: decode(match[1]), branch_address: decode(match[2]), source_url }));
}

function score(entry: LbcBranch, clues: Clues) {
  const branchName = plain(entry.branch_name);
  const branchAddress = plain(entry.branch_address);
  let points = 0;
  if (clues.name) {
    const name = plain(clues.name);
    if (name === branchName) points += 140;
    else if (name.startsWith(`${branchName} `)) points += 100;
    else if (name.includes(branchName)) points += 80;
    for (const token of new Set(name.split(' ').filter((word) => word.length > 2))) {
      if (branchName.split(' ').includes(token)) points += 9;
      else if (branchAddress.split(' ').includes(token)) points += 5;
    }
  }
  if (clues.address) {
    const address = plain(clues.address);
    if (address === branchAddress || address.includes(branchAddress)) points += 150;
    if (address.includes(branchName) && branchName.length >= 5) points += 80;
    const addressWords = new Set(branchAddress.split(' '));
    for (const token of new Set(address.split(' '))) {
      if (token.length > 2 && addressWords.has(token)) points += /^\d+$/.test(token) ? 8 : 4;
    }
  }
  if (clues.location) {
    const locationWords = plain(clues.location).split(' ')
      .filter((word) => word.length >= 4 && !['city', 'metro', 'province', 'region'].includes(word));
    const branchWords = new Set(branchAddress.split(' '));
    const matches = locationWords.filter((word) => branchWords.has(word));
    points += matches.length ? matches.length * 12 : -100;
  }
  return points;
}

export async function resolveLbcBranch(
  clues: Clues,
  fetchPage: typeof fetch = fetch,
  options: { cachedBranches?: LbcBranch[]; onVerified?: (branches: LbcBranch[]) => Promise<void> } = {},
): Promise<LbcResolution> {
  if (!clues.name && !clues.address) return { kind: 'not_found' };
  const found = new Map<string, LbcBranch>();
  let successfulPage = false;
  const deadline = Date.now() + 18000;
  for (const term of searchTerms(clues)) {
    if (Date.now() >= deadline) break;
    const url = `https://www.lbcexpress.com/branches-philippines/${encodeURIComponent(term)}`;
    try {
      const response = await fetchPage(url, { headers: { 'User-Agent': 'DistrictWheels/1.0' }, signal: AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))) });
      if (!response.ok) continue;
      successfulPage = true;
      const entries = parseEntries(await response.text(), url);
      for (const branch of entries) {
        found.set(`${plain(branch.branch_name)}|${plain(branch.branch_address)}`, branch);
      }
      if (entries.length && options.onVerified) {
        try { await options.onVerified(entries); } catch { /* live lookup still works if cache write fails */ }
      }
    } catch { /* try the next official search term */ }
    const ranked = [...found.values()].map((branch) => ({ branch, points: score(branch, clues) })).sort((a, b) => b.points - a.points);
    if (ranked[0]?.points >= 100 && (!ranked[1] || ranked[0].points - ranked[1].points >= 30) && !(clues.name && clues.address)) {
      return { kind: 'match', branch: ranked[0].branch };
    }
  }
  const ranked = [...found.values()].map((branch) => ({ branch, points: score(branch, clues) })).filter(({ points }) => points >= 25).sort((a, b) => b.points - a.points);
  if (!ranked.length) {
    const recent = (options.cachedBranches ?? []).filter((branch) => {
      const age = Date.now() - Date.parse(branch.verified_at ?? '');
      return Number.isFinite(age) && age >= 0 && age <= 180 * 24 * 60 * 60 * 1000;
    });
    const cached = recent.map((branch) => ({ branch, points: score(branch, clues) }))
      .filter(({ points }) => points >= 25).sort((a, b) => b.points - a.points);
    const cachedTop = cached[0];
    const cachedFitsBoth = !clues.name || !clues.address || Boolean(cachedTop &&
      score(cachedTop.branch, { name: clues.name }) >= 80 && score(cachedTop.branch, { address: clues.address }) >= 80
    );
    if (cachedTop?.points >= 80 && cachedFitsBoth && (!cached[1] || cachedTop.points - cached[1].points >= 25)) {
      return { kind: 'match', branch: cached[0].branch };
    }
    if (cached.length) return { kind: 'ambiguous', branches: cached.slice(0, 4).map(({ branch }) => branch) };
    return { kind: successfulPage ? 'not_found' : 'unavailable' };
  }
  if (clues.name && clues.address) {
    const byName = [...found.values()].map((branch) => ({ branch, points: score(branch, { name: clues.name }) })).sort((a, b) => b.points - a.points)[0];
    const byAddress = [...found.values()].map((branch) => ({ branch, points: score(branch, { address: clues.address }) })).sort((a, b) => b.points - a.points)[0];
    if (byName?.points >= 80 && byAddress?.points >= 80 && byName.branch !== byAddress.branch) {
      return { kind: 'ambiguous', branches: [byName.branch, byAddress.branch] };
    }
  }
  const fitsBoth = !clues.name || !clues.address || (
    score(ranked[0].branch, { name: clues.name }) >= 80 && score(ranked[0].branch, { address: clues.address }) >= 80
  );
  if (ranked[0].points >= 80 && fitsBoth && (!ranked[1] || ranked[0].points - ranked[1].points >= 25)) return { kind: 'match', branch: ranked[0].branch };
  return { kind: 'ambiguous', branches: ranked.slice(0, 4).map(({ branch }) => branch) };
}
