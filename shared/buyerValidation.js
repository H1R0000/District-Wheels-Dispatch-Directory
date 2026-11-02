import { formatBuyerName } from './buyerName.js';

export const addressFields = ['street', 'barangay', 'city', 'province', 'zipCode'];
export const pickupFields = ['branchName', 'branchAddress'];
const labels = { street: 'street or building', barangay: 'barangay', city: 'city or municipality', province: 'province', zipCode: 'ZIP code', branchName: 'LBC branch name', branchAddress: 'complete branch address' };
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';

export function validateBuyer(input) {
  const errors = {};
  if (!record(input)) return { errors: { body: 'Send a buyer object.' } };
  const name = text(input.name);
  const phone = text(input.phone).replace(/\D/g, '');
  if (!name) errors.name = 'Enter the buyer’s full name.';
  else if (name.length > 120) errors.name = 'Use at most 120 characters.';
  if (!/^[0-9]{7,15}$/.test(phone)) errors.phone = 'Enter a valid phone number.';
  if (!['LBC', 'J&T Express'].includes(input.preferredCourier)) errors.preferredCourier = 'Choose a supported courier.';
  const locations = {};
  for (const [kind, fields] of [['addresses', addressFields], ['pickups', pickupFields]]) {
    const items = input[kind] ?? [];
    locations[kind] = [];
    if (!Array.isArray(items) || items.length > 30) { errors[kind] = 'Send at most 30 location objects.'; continue; }
    const defaultIndex = Math.max(0, items.findIndex((item) => item?.isDefault === true));
    const ids = new Set();
    items.forEach((item, index) => {
      if (!record(item)) { errors[`${kind}.${index}`] = 'Send a location object.'; return; }
      const location = { isDefault: index === defaultIndex };
      if (item.id !== undefined) {
        if (!text(item.id) || item.id.length > 120 || ids.has(item.id)) errors[`${kind}.${index}.id`] = 'Use a unique location ID of at most 120 characters.';
        else { location.id = item.id; ids.add(item.id); }
      }
      if (item.isDefault !== undefined && typeof item.isDefault !== 'boolean') errors[`${kind}.${index}.isDefault`] = 'Choose a valid default.';
      for (const field of fields) {
        location[field] = text(item[field]);
        if (!location[field]) errors[`${kind}.${index}.${field}`] = `Enter the ${labels[field]}.`;
        else if (location[field].length > 500) errors[`${kind}.${index}.${field}`] = 'Use at most 500 characters.';
      }
      locations[kind].push(location);
    });
  }
  if (input.preferredCourier === 'J&T Express' && !locations.addresses.length) errors.addresses = 'Add a complete J&T delivery address.';
  if (input.preferredCourier === 'LBC' && !locations.addresses.length && !locations.pickups.length) errors.locations = 'Add a delivery address or LBC pickup location.';
  return { errors, buyer: { name: formatBuyerName(name), phone, preferredCourier: input.preferredCourier, ...locations } };
}
