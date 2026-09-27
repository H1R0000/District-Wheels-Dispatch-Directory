const digits = (value: unknown) => {
  const number = String(value ?? '').replace(/\D/g, '');
  return number.startsWith('63') && number.length === 12 ? `0${number.slice(2)}` : number;
};
const words = (value: unknown) => String(value ?? '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function selectBuyer(candidates: Array<{ id: string; name: string; phone: string }>, query: string) {
  const number = digits(query);
  const name = words(query);
  const exact = candidates.filter((buyer) =>
    (number.length >= 7 && digits(buyer.phone) === number) || (name && words(buyer.name) === name)
  );
  const matches = exact.length ? exact : candidates;
  return matches.length === 1 ? { buyer: matches[0] } : { choices: matches.slice(0, 5) };
}

export function buyerChoicesMessage(choices: Array<{ name: string; phone: string }>) {
  if (!choices.length) return 'I could not find that buyer. Please send the saved name or phone number.';
  return `I found several buyers. Please reply with the exact phone number for the one you mean:\n${choices.map((buyer) => `${buyer.name} — ${buyer.phone}`).join('\n')}`;
}
