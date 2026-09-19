export function phoneForCourier(value = '') {
  const digits = String(value).replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}
