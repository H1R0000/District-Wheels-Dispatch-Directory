import { formatBuyerName } from '../../../shared/buyerName.js';

const emptyAddress = () => ({ street: '', barangay: '', city: '', province: '', zipCode: '', isDefault: true });
const emptyPickup = () => ({ branchName: '', branchAddress: '', isDefault: true });

export function applyAssistantEdit(buyer, patch) {
  if (!patch) return buyer;
  const next = {
    ...buyer,
    name: patch.name == null ? buyer.name : formatBuyerName(patch.name),
    phone: patch.phone ?? buyer.phone,
    preferredCourier: patch.preferred_courier ?? buyer.preferredCourier,
  };
  if (patch.address || patch.deliveryMethod === 'door' || next.preferredCourier === 'J&T Express') {
    const addresses = buyer.addresses.length ? [...buyer.addresses] : [emptyAddress()];
    const index = Math.max(0, addresses.findIndex((item) => item.isDefault));
    const address = patch.address ?? {};
    addresses[index] = {
      ...addresses[index],
      ...Object.fromEntries(Object.entries(address).map(([key, value]) => [key === 'zip_code' ? 'zipCode' : key, value])),
    };
    next.addresses = addresses;
  }
  if (patch.pickup || patch.deliveryMethod === 'pickup') {
    const pickups = buyer.pickups.length ? [...buyer.pickups] : [emptyPickup()];
    const index = Math.max(0, pickups.findIndex((item) => item.isDefault));
    pickups[index] = {
      ...pickups[index],
      ...(patch.pickup?.branch_name ? { branchName: patch.pickup.branch_name } : {}),
      ...(patch.pickup?.branch_address ? { branchAddress: patch.pickup.branch_address } : {}),
    };
    next.pickups = pickups;
  }
  return next;
}

export function editedDeliveryMethod(buyer, patch) {
  if (patch?.preferred_courier === 'J&T Express') return 'door';
  if (patch?.deliveryMethod) return patch.deliveryMethod;
  return buyer.preferredCourier === 'LBC' && buyer.addresses.length === 0 && buyer.pickups.length > 0 ? 'pickup' : 'door';
}
