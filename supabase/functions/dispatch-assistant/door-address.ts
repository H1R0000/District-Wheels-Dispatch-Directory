import { buyerMessageLines } from './buyer-message-lines.ts';
export type DoorAddress = { street: string; barangay: string; city: string; province: string; zip_code: string };

function splitDoorDetails(message: string) {
  const lines = buyerMessageLines(message);
  const index = lines.findIndex((line) => /\b(?:brgy\.?|barangay)\s+/i.test(line));
  const match = lines[index]?.match(/^(.+?)\s+(?:brgy\.?|barangay)\s+([^,]+)$/i);
  if (!match || match[1].includes(',')) return null;
  const tail = lines.slice(index + 1).filter((line) => !/^(?:Philippines|PH)$/i.test(line));
  const zip = tail.at(-1);
  if (!zip || !/^\d{4}$/.test(zip) || tail.length < 2 || tail.length > 3) return null;
  const locality = tail.slice(0, -1);
  // Commas or separate lines make the city/region boundary explicit.
  const places = locality.join(', ').split(',').map((part) => part.trim()).filter(Boolean);
  const address: Partial<DoorAddress> = { street: match[1].trim(), barangay: match[2].trim(), zip_code: zip };
  if (places.length === 2) Object.assign(address, { city: places[0], province: places[1] });
  return { address, locality: locality.join(' / ') };
}

export function doorLocationQuestion(message: string): string | null {
  const details = splitDoorDetails(message);
  if (!details || details.address.city) return null;
  return `I have the name, phone, street and ZIP code. Please confirm the barangay, city and province/region: you wrote “${details.address.barangay}” and “${details.locality}”.`;
}

// Recognize the common pasted checkout layout after the buyer's phone.
// Keep the full street line: repeated locality text may include a subdivision.
function multilineDoorAddress(lines: string[]): DoorAddress | null {
  const phoneIndex = lines.findIndex((line) => /^\+?[\d\s().-]+$/.test(line) && /^\d{10,13}$/.test(line.replace(/\D/g, '')));
  if (phoneIndex < 0) return null;
  const address = lines.slice(phoneIndex + 1);
  if (/^(?:Philippines|PH|Republic of the Philippines)$/i.test(address.at(-1) ?? '')) address.pop();
  if (address.length !== 5) return null;
  const [street, barangayLine, city, province, zip_code] = address;
  const barangay = barangayLine.replace(/^(?:brgy\.?|barangay)\s+/i, '');
  if (!/^\d{4}$/.test(zip_code) || ![street, barangay, city, province].every((value) => /\p{L}/u.test(value))) return null;
  if ([barangay, city, province].some((value) => /\b(?:lbc|pickup|door to door|Philippines)\b/i.test(value))) return null;
  return { street, barangay, city, province, zip_code };
}

export function doorAddressZip(message: string) {
  const lines = buyerMessageLines(message);
  if (!/\b(?:door\s*to\s*door|door\s*delivery|j\s*(?:&|and|n|\+)\s*t|jnt)\b/i.test(message)) return null;
  const line = [...lines].reverse().find((item) => /\b(?:brgy\.?|barangay)\s+/i.test(item) && /\b\d{4}\s*$/.test(item));
  return line?.match(/\b(\d{4})\s*$/)?.[1] ?? null;
}

export function parseDoorAddressWithPostalRows(message: string, rows: Array<{ locality: string; province: string; postal_code: string }>): DoorAddress | null {
  const zip = doorAddressZip(message);
  if (!zip) return null;
  const lines = String(message).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const line = [...lines].reverse().find((item) => /\b(?:brgy\.?|barangay)\s+/i.test(item) && new RegExp(`\\b${zip}\\s*$`).test(item));
  const address = line?.replace(/^\s*(?:lbc(?:\s*express)?|j\s*(?:&|and|n|\+)\s*t(?:\s*express)?|jnt(?:\s*express)?)\b\s*[-–:]?\s*/i, '')
    .replace(/^(?:door\s*to\s*door|door\s*delivery)\b\s*[-–:]?\s*/i, '')
    .replace(new RegExp(`\\s+${zip}\\s*$`), '').trim();
  const match = address?.match(/^(.+?)\s+(?:brgy\.?|barangay)\s+(.+)$/i);
  if (!match) return null;
  const [, street, rest] = match;
  const matches = rows.filter((row) => row.postal_code === zip).flatMap((row) => {
    const publicSuffix = `${row.locality} ${row.province}`.replace(/\s+/g, ' ').trim();
    const normalizedRest = rest.replace(/[,.]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalizedRest.toLocaleLowerCase().endsWith(` ${publicSuffix.toLocaleLowerCase()}`)) return [];
    const barangay = normalizedRest.slice(0, -publicSuffix.length).trim();
    if (!barangay || !street.trim()) return [];
    return [{ street: street.trim(), barangay, city: row.locality, province: row.province, zip_code: zip }];
  });
  return matches.length === 1 ? matches[0] : null;
}

export function parsePartialDoorAddress(message: string): Partial<DoorAddress> | null {
  const lines = buyerMessageLines(message);
  if (!/\b(?:door\s*to\s*door|door\s*delivery|j\s*(?:&|and|n|\+)\s*t|jnt)\b/i.test(message)) return null;
  const multiline = multilineDoorAddress(lines);
  if (multiline) return multiline;
  const split = splitDoorDetails(message);
  if (split) return split.address;
  const line = [...lines].reverse().find((item) => /\b(?:brgy\.?|barangay)\s+/i.test(item));
  if (!line) return null;
  const address = line
    .replace(/^\s*(?:lbc(?:\s*express)?|j\s*(?:&|and|n|\+)\s*t(?:\s*express)?|jnt(?:\s*express)?)\b\s*[-–:]?\s*/i, '')
    .replace(/^(?:door\s*to\s*door|door\s*delivery)\b\s*[-–:]?\s*/i, '')
    .trim();
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3 || parts.length > 5) return null;
  const zipPart = parts.at(-1)?.match(/^(.*?)(?:\s+|,\s*)(\d{4})$/);
  const separateZip = /^\d{4}$/.test(parts.at(-1));
  const zip_code = separateZip ? parts.at(-1) : zipPart?.[2];
  const namedParts = zip_code ? parts.slice(0, -1) : parts;
  const trailingProvince = zip_code && !separateZip ? zipPart?.[1]?.trim() : null;
  const barangayIndex = namedParts.findIndex((part) => /^(?:brgy\.?|barangay)\s+/i.test(part));
  if (barangayIndex < 1 || barangayIndex > 2 || namedParts.length - barangayIndex < 2) return null;
  const barangayPart = namedParts[barangayIndex];
  const barangay = barangayPart?.replace(/^(?:brgy\.?|barangay)\s*/i, '').trim();
  const street = namedParts.slice(0, barangayIndex).join(', ');
  const remaining = namedParts.slice(barangayIndex + 1);
  const city = remaining[0];
  const province = trailingProvince ?? remaining[1];
  if (!street || !barangay || !city || remaining.length > 2 || (zip_code && !/^\d{4}$/.test(zip_code))) return null;
  return { street, barangay, city, ...(province ? { province } : {}), ...(zip_code ? { zip_code } : {}) };
}

export function parseDoorAddress(message: string): DoorAddress | null {
  const partial = parsePartialDoorAddress(message);
  return partial?.street && partial.barangay && partial.city && partial.province && partial.zip_code
    ? partial as DoorAddress : null;
}
