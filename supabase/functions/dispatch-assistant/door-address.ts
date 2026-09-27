export type DoorAddress = { street: string; barangay: string; city: string; province: string; zip_code: string };

export function doorAddressZip(message: string) {
  const lines = String(message ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
  const lines = String(message ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/\b(?:door\s*to\s*door|door\s*delivery|j\s*(?:&|and|n|\+)\s*t|jnt)\b/i.test(message)) return null;
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
