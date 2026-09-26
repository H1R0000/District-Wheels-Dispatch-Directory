const addressFields = ['street', 'barangay', 'city', 'province', 'zipCode'];
const pickupFields = ['branchName', 'branchAddress'];

function isComplete(item, fields) {
  return fields.every((field) => String(item[field] ?? '').trim());
}

export function buildBuyerPayload(buyer, deliveryMethod) {
  const completeAddresses = buyer.addresses.filter((item) => isComplete(item, addressFields));
  const completePickups = buyer.pickups.filter((item) => isComplete(item, pickupFields));

  return {
    ...buyer,
    addresses: buyer.preferredCourier === 'J&T Express' || deliveryMethod === 'door'
      ? buyer.addresses
      : completeAddresses,
    pickups: buyer.preferredCourier === 'LBC' && deliveryMethod === 'pickup'
      ? buyer.pickups
      : completePickups,
  };
}
