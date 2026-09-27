const normalizedPhone = (value: string) => {
  const number = value.replace(/\D/g, '');
  return number.startsWith('63') && number.length === 12 ? `0${number.slice(2)}` : number;
};

export function parseBuyerAction(message: string) {
  const text = String(message ?? '').trim();
  const command = text.match(/^(?:please\s+)?(edit|update|change|delete|remove)\s+(?:the\s+)?(?:buyer\s+)?(.+)$/i);
  if (!command) return null;
  const action = /^(?:delete|remove)$/i.test(command[1]) ? 'delete' : 'edit';
  const target = command[2].split(/\s*:\s*|\s+(?:change|set|update)\s+|\s+(?:street|barangay|city|province|zip(?:\s*code)?|phone|name|courier|branch)\s+(?:to|:)\s+/i)[0].trim();
  const number = target.match(/(?:\+?\d[\d\s().-]{7,22}\d)/)?.[0];
  const query = number ? normalizedPhone(number) : target;
  if (!query || query.length < 3) return null;
  if (action === 'delete') return { action, query };
  const change = text.match(/\b(?:change|set|update)\s+(?:the\s+)?(street|barangay|city|province|zip(?:\s*code)?|phone|name|courier|branch)\s+(?:to|:)\s+([^\n;]+)/i)
    ?? text.match(/:\s*(street|barangay|city|province|zip(?:\s*code)?|phone|name|courier|branch)\s+(?:to|:)\s+([^\n;]+)/i);
  if (!change) return { action, query, patch: null };
  const field = change[1].toLowerCase().replace(/\s+/g, '_');
  const value = change[2].trim().replace(/[.!]$/, '');
  if (!value) return { action, query, patch: null };
  const patch: Record<string, unknown> = {};
  if (['street', 'barangay', 'city', 'province', 'zip_code'].includes(field)) patch.address = { [field]: value };
  else if (field === 'branch') patch.pickup = { branch_name: value };
  else if (field === 'phone') patch.phone = normalizedPhone(value);
  else if (field === 'name') patch.name = value;
  else if (field === 'courier') patch.preferred_courier = /\bj\s*(?:&|and|n|\+)\s*t\b|\bjnt\b/i.test(value) ? 'J&T Express' : /\blbc\b/i.test(value) ? 'LBC' : null;
  return { action, query, patch };
}
