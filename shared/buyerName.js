export function formatBuyerName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-PH')
    .replace(/\p{L}+/gu, (part) => {
      const [first, ...rest] = Array.from(part);
      return first.toLocaleUpperCase('en-PH') + rest.join('');
    });
}
