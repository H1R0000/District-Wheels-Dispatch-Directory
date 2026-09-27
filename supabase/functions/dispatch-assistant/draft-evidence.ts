const normalize = (value: unknown) => String(value ?? '').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

const supplied = (value: unknown, userText: string) => {
  const needle = normalize(value);
  return Boolean(needle && ` ${normalize(userText)} `.includes(` ${needle} `));
};

const phoneDigits = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('63') && digits.length === 12 ? `0${digits.slice(2)}` : digits;
};

export function draftEvidenceError(
  args: {
    name?: unknown;
    phone?: unknown;
    method?: unknown;
    address?: Record<string, unknown>;
    pickup?: Record<string, unknown>;
  },
  userText: string,
  verifiedPickup = false,
  verifiedPublic: Record<string, string> = {},
): string | null {
  if (!supplied(args.name, userText)) return 'Please provide the buyer name in your message.';
  const digits = phoneDigits(args.phone);
  const suppliedPhones = userText.match(/(?:\+?\d[\d \t().-]{5,24}\d)/g) ?? [];
  if (!digits || !suppliedPhones.some((value) => phoneDigits(value) === digits)) {
    return 'Please provide the buyer phone number. I cannot fill in a missing number.';
  }

  if (args.method === 'door') {
    const labels: Record<string, string> = {
      street: 'street or house address', barangay: 'barangay', city: 'city',
      province: 'province', zip_code: 'ZIP code',
    };
    const unsupported = Object.entries(labels).filter(([field]) =>
      !supplied(args.address?.[field], userText) &&
      !(field in verifiedPublic && normalize(args.address?.[field]) === normalize(verifiedPublic[field]))
    );
    if (unsupported.length) {
      return `I could not confirm the ${unsupported.map(([, label]) => label).join(', ')} from your messages. Please provide these details before I prepare the form.`;
    }
  }

  if (args.method === 'pickup' && !verifiedPickup) {
    const missing = [
      !supplied(args.pickup?.branch_name, userText) && 'branch name',
      !supplied(args.pickup?.branch_address, userText) && 'branch address',
    ].filter(Boolean);
    if (missing.length) return `I could not confirm the ${missing.join(' and ')} from your messages. Please provide the details or ask me to verify the LBC branch.`;
  }
  return null;
}
