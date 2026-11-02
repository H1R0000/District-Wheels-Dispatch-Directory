function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '');
}

function quoteFilterValue(value) {
  const escaped = String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');

  return `"${escaped}"`;
}

export function buildBuyerSearchFilter(query = '') {
  const needle = String(query ?? '').trim();
  if (!needle) return '';

  const filters = [`name.ilike.${quoteFilterValue(`%${needle}%`)}`];
  const phone = normalizePhone(needle);

  if (phone) filters.push(`phone.ilike.%${phone}%`);

  return filters.join(',');
}
