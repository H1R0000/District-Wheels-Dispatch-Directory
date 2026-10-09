// Normalize presentation only; never infer missing buyer or address values.
export function buyerMessageLines(message: string): string[] {
  return String(message ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const inline = line.match(/^((?:(?:buyer\s*)?name\s*:\s*)?[\p{L}][\p{L}.' -]+?)\s+(\+?\d[\d ().-]+\d)$/iu);
    if (inline && /^\d{10,13}$/.test(inline[2].replace(/\D/g, '')) &&
      !/\b(?:street|st|road|brgy|barangay|zip|contact|phone|mobile)\b/i.test(inline[1])) return [inline[1].trim(), inline[2]];
    return [line.replace(/^(?:contact|phone|mobile)(?:\s*(?:number|no\.?|#))?\s*:\s*/i, '')
      .replace(/^(?:zip|postal)\s*(?:code)?\s*[:.\-]?\s*(\d{4})\s*$/i, '$1')];
  });
}
