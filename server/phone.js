export function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '');
}
