export type PostalRow = { locality: string; province: string; postal_code: string; source_url?: string; source?: string };

export function zipLookupQuery(message: string): string | null {
  const text = String(message ?? '').trim();
  if (/\b(?:add|create|save|edit|update|delete|remove)\s+(?:a\s+)?buyer\b/i.test(text)) return null;
  const match = text.match(/\b(?:zip|postal)\s*code\s*(?:lookup|finder)?\s*(?:for|of|in|at|is)?\s*[:?\-]?\s*(.+)$/i)
    ?? text.match(/\b(?:find|look\s*up|search|what(?:'s|\s+is))\s+(?:the\s+)?(?:zip|postal)\s*code\s*(?:for|of|in|at)?\s+(.+)$/i);
  if (!match) return null;
  const query = match[1].replace(/[?.!]+$/g, '').trim();
  return query.length >= 3 && query.length <= 100 ? query : null;
}

export function postalMatches(rows: PostalRow[], query: string): PostalRow[] {
  const normalized = query.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = normalized.split(/\s+/).filter((word) => word.length > 2 && !['city', 'municipality', 'province'].includes(word));
  const matches = rows.filter((row) => /^\d{4}$/.test(normalized)
    ? row.postal_code === normalized
    : words.length > 0 && words.every((word) => `${row.locality} ${row.province}`.toLocaleLowerCase().includes(word)));
  return [...new Map(matches.map((row) => [`${row.locality}|${row.province}|${row.postal_code}`, row])).values()];
}

export function zipLookupReply(rows: PostalRow[], query: string): string {
  const matches = postalMatches(rows, query);
  if (!matches.length) return `I could not verify a ZIP code for ${query}. Please check the city or municipality and province.`;
  if (matches.length > 10) return `Several ZIP codes match ${query}. Please give the city or municipality and province more precisely.`;
  return matches.map((row) => `${row.locality}, ${row.province} — ${row.postal_code}`).join('\n');
}

export async function geographicZipLookup(query: string, fetcher: typeof fetch): Promise<PostalRow[]> {
  const base = 'https://psgc.cloud/api';
  const responses = await Promise.all(['cities', 'municipalities', 'provinces'].map((path) =>
    fetcher(`${base}/${path}`, { signal: AbortSignal.timeout(6000) })));
  if (responses.some((response) => !response.ok)) return [];
  const [cities, municipalities, provinces] = await Promise.all(responses.map((response) => response.json()));
  if (![cities, municipalities, provinces].every(Array.isArray)) return [];
  const provinceByPrefix = new Map(provinces.map((row: { code?: string; name?: string }) => [String(row.code ?? '').slice(0, 5), String(row.name ?? '')]));
  const rows = [...cities, ...municipalities].flatMap((row: { code?: string; name?: string; zip_code?: string }) => {
    const code = String(row.code ?? '');
    const zip = String(row.zip_code ?? '').trim();
    if (!/^\d{10}$/.test(code) || !/^\d{4}$/.test(zip)) return [];
    const province = code.startsWith('13') ? 'Metro Manila' : String(provinceByPrefix.get(code.slice(0, 5)) ?? '');
    if (!province) return [];
    const locality = String(row.name ?? '').trim().replace(/^City of\s+/i, '').replace(/\s+City$/i, '');
    if (!locality) return [];
    return [{ locality, province, postal_code: zip, source_url: 'https://psgc.cloud/api-docs' }];
  });
  return postalMatches(rows, query).slice(0, 11);
}
