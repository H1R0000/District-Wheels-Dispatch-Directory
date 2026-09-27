export function googleBranchSearchUrl(branchName?: string, location?: string): string | null {
  const clean = (value: string | undefined, limit: number) => String(value ?? '')
    .split(/\r?\n/, 1)[0]
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '')
    .replace(/\b(?:buyer|customer|recipient|contact|phone|mobile|number)\b.*$/i, '')
    .replace(/[<>]/g, '')
    .trim().slice(0, limit);
  const name = clean(branchName, 100);
  const place = clean(location, 60);
  if (name.length < 3) return null;
  const query = `LBC ${name} ${place} Philippines branch address`.replace(/\s+/g, ' ').trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
