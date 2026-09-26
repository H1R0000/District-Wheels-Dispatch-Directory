import { supabase } from './supabase.js';
import { buildBuyerSearchFilter } from '../utils/buyerSearch.js';
function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '');
}

function mapAddress(row) {
  return { id: row.id, recipientName: row.recipient_name, recipientPhone: row.recipient_phone, street: row.street, barangay: row.barangay, city: row.city, province: row.province, zipCode: row.zip_code, isDefault: row.is_default };
}

function mapPickup(row) {
  return { id: row.id, recipientName: row.recipient_name, recipientPhone: row.recipient_phone, branchName: row.branch_name, branchAddress: row.branch_address, isDefault: row.is_default };
}

function mapBuyer(row) {
  const addresses = (row.addresses ?? []).map(mapAddress);
  const pickups = (row.pickup_locations ?? []).map(mapPickup);
  return { id: row.id, name: row.name, phone: row.phone, preferredCourier: row.preferred_courier, addresses, pickups, addressCount: addresses.length, pickupCount: pickups.length };
}

function clean(value) { return String(value ?? '').trim(); }
function makeId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

export async function listBuyers(query = '') {
  let request = supabase.from('buyers').select('id,name,phone,preferred_courier,addresses(id),pickup_locations(id)').order('name', { ascending: true });
  const searchFilter = buildBuyerSearchFilter(query);
  if (searchFilter) request = request.or(searchFilter);
  const { data, error } = await request;
  if (error) throw error;
  return data.map(mapBuyer);
}

export async function getBuyer(id) {
  const { data, error } = await supabase.from('buyers').select('*,addresses(*),pickup_locations(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapBuyer(data) : null;
}

export async function saveBuyer(input, id) {
  const buyerId = id || makeId('buyer');
  const phone = normalizePhone(input.phone);
  const makeLocations = (items, prefix, fields) => {
    const selected = items.findIndex((item) => item.isDefault);
    const defaultIndex = selected < 0 ? 0 : selected;
    return items.map((item, index) => ({
      id: item.id || makeId(prefix),
      ...Object.fromEntries(fields.map((field) => [field, clean(item[field])])),
      isDefault: index === defaultIndex,
    }));
  };
  const payload = {
    id: buyerId,
    name: clean(input.name),
    phone,
    preferredCourier: input.preferredCourier,
    addresses: makeLocations(input.addresses ?? [], 'address', ['street', 'barangay', 'city', 'province', 'zipCode']),
    pickups: makeLocations(input.pickups ?? [], 'pickup', ['branchName', 'branchAddress']),
  };
  const { error } = await supabase.rpc('save_buyer', { payload, create_new: !id });
  if (error) throw error;
  return getBuyer(buyerId);
}

export async function deleteBuyer(id) {
  const { data, error } = await supabase.rpc('delete_buyer', { target_buyer_id: id });
  if (error) throw error;
  return data;
}
