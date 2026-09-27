const normalize = (value: unknown) => String(value ?? '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stated = (value: unknown, text: string) => {
  const needle = normalize(value);
  return Boolean(needle && ` ${normalize(text)} `.includes(` ${needle} `));
};
const phone = (value: unknown) => {
  const number = String(value ?? '').replace(/\D/g, '');
  return number.startsWith('63') && number.length === 12 ? `0${number.slice(2)}` : number;
};

export function editEvidenceError(patch: Record<string, any>, userText: string, verifiedPickup = false, verifiedPublic: Record<string, string> = {}) {
  if (patch.name && !stated(patch.name, userText)) return 'Please state the new buyer name.';
  if (patch.phone && !(userText.match(/(?:\+?\d[\d\s().-]{5,24}\d)/g) ?? []).some((value) => phone(value) === phone(patch.phone))) {
    return 'Please state the new phone number.';
  }
  if (patch.preferred_courier && !(/\blbc\b/i.test(userText) && patch.preferred_courier === 'LBC') &&
    !(/\bj\s*(?:&|and|n|\+)\s*t\b|\bjnt\b/i.test(userText) && patch.preferred_courier === 'J&T Express')) {
    return 'Please state the courier you want to use.';
  }
  for (const [field, value] of Object.entries(patch.address ?? {})) {
    if (value && !stated(value, userText) && normalize(value) !== normalize(verifiedPublic[field])) return `Please state the new ${field === 'zip_code' ? 'ZIP code' : field}.`;
  }
  if (!verifiedPickup) {
    for (const [field, value] of Object.entries(patch.pickup ?? {})) {
      if (value && !stated(value, userText)) return `Please state the new ${field === 'branch_name' ? 'branch name' : 'branch address'}.`;
    }
  }
  return null;
}
