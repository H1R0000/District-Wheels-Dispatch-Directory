import { randomUUID } from 'node:crypto';
import { formatBuyerName } from '../shared/buyerName.js';
import { buildBuyerSearchFilter } from '../shared/buyerSearch.js';
import { ApiError } from './errors.js';

export function mapBuyer(row) {
  const addresses = (row.addresses ?? []).map((a) => ({ id: a.id, recipientName: a.recipient_name, recipientPhone: a.recipient_phone, street: a.street, barangay: a.barangay, city: a.city, province: a.province, zipCode: a.zip_code, isDefault: a.is_default }));
  const pickups = (row.pickup_locations ?? []).map((p) => ({ id: p.id, recipientName: p.recipient_name, recipientPhone: p.recipient_phone, branchName: p.branch_name, branchAddress: p.branch_address, isDefault: p.is_default }));
  return { id: row.id, name: formatBuyerName(row.name), phone: row.phone, preferredCourier: row.preferred_courier, addresses, pickups, addressCount: addresses.length, pickupCount: pickups.length };
}

export class SupabaseRepository {
  constructor(db, userId) { this.db = db; this.userId = userId; }
  async list(query = '') {
    let request = this.db.from('buyers').select('id,name,phone,preferred_courier,addresses(id),pickup_locations(id)').eq('owner_id', this.userId).order('name');
    const filter = buildBuyerSearchFilter(query);
    if (filter) request = request.or(filter);
    const { data, error } = await request;
    if (error) throw error;
    return data.map((row) => { const { addresses, pickups, ...summary } = mapBuyer(row); return summary; })
      .sort((a, b) => a.name.localeCompare(b.name, 'en-PH', { sensitivity: 'base', numeric: true }));
  }
  async get(id) {
    const { data, error } = await this.db.from('buyers').select('*,addresses(*),pickup_locations(*)').eq('id', id).eq('owner_id', this.userId).maybeSingle();
    if (error) throw error;
    return data ? mapBuyer(data) : null;
  }
  async save(input, id) {
    const buyerId = id ?? `buyer-${randomUUID()}`;
    const { error } = await this.db.rpc('save_buyer', { payload: { ...input, id: buyerId }, create_new: !id });
    if (error) throw error;
    return this.get(buyerId);
  }
  async delete(id) {
    const { data, error } = await this.db.rpc('delete_buyer', { target_buyer_id: id });
    if (error) throw error;
    return data;
  }
  async exportBackup() {
    // Page explicitly: PostgREST's server-side row cap is normally 1,000.
    const buyers = [];
    for (let offset = 0; offset <= 1000; offset += 500) {
      const { data, error } = await this.db.from('buyers').select('*,addresses(*),pickup_locations(*)').eq('owner_id', this.userId).order('id').range(offset, offset + 499);
      if (error) throw error;
      buyers.push(...data);
      if (buyers.length > 1000) throw new ApiError(400, 'The backup exceeds the supported 1,000 buyer limit.');
      if (data.length < 500) break;
    }
    return { format: 'district-wheels-owner-backup-v1', owner_id: this.userId, exported_at: new Date().toISOString(), buyers };
  }
  async restoreBackup(payload, dryRun) {
    if (!payload || payload.format !== 'district-wheels-owner-backup-v1' || payload.owner_id !== this.userId || !Array.isArray(payload.buyers) || payload.buyers.length > 1000) throw new ApiError(400, 'Invalid backup file or owner.');
    const { data, error } = await this.db.rpc('restore_owner_backup', { payload, dry_run: dryRun });
    if (error) throw error;
    return data;
  }
}
