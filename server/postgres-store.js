import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const { Pool } = pg;

function normalizeDefaults(items = []) {
  if (items.length === 0) return items;
  const requestedIndex = items.findIndex((item) => item.isDefault);
  const defaultIndex = requestedIndex >= 0 ? requestedIndex : 0;
  return items.map((item, index) => ({ ...item, isDefault: index === defaultIndex }));
}

function mapAddress(row) {
  return { id: row.id, recipientName: row.recipient_name, recipientPhone: row.recipient_phone, street: row.street, barangay: row.barangay, city: row.city, province: row.province, zipCode: row.zip_code, isDefault: row.is_default };
}

function mapPickup(row) {
  return { id: row.id, recipientName: row.recipient_name, recipientPhone: row.recipient_phone, branchName: row.branch_name, branchAddress: row.branch_address, isDefault: row.is_default };
}

export class PostgresStore {
  constructor(connectionString, migrationUrl) {
    this.pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    this.migrationUrl = migrationUrl;
  }

  async initialize() {
    await this.pool.query(await readFile(this.migrationUrl, 'utf8'));
    return this;
  }

  async list(query = '') {
    const needle = `%${query.trim()}%`;
    const { rows } = await this.pool.query(`
      SELECT b.id, b.name, b.phone, b.preferred_courier,
        COUNT(DISTINCT a.id)::int AS address_count,
        COUNT(DISTINCT p.id)::int AS pickup_count
      FROM buyers b
      LEFT JOIN addresses a ON a.buyer_id = b.id
      LEFT JOIN pickup_locations p ON p.buyer_id = b.id
      WHERE $1 = '%%' OR b.name ILIKE $1 OR REPLACE(b.phone, ' ', '') ILIKE REPLACE($1, ' ', '')
      GROUP BY b.id ORDER BY b.name`, [needle]);
    return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, preferredCourier: row.preferred_courier, addressCount: row.address_count, pickupCount: row.pickup_count }));
  }

  async get(id, client = this.pool) {
    const buyerResult = await client.query('SELECT id, name, phone, preferred_courier FROM buyers WHERE id = $1', [id]);
    if (buyerResult.rowCount === 0) return null;
    const [addresses, pickups] = await Promise.all([
      client.query('SELECT * FROM addresses WHERE buyer_id = $1 ORDER BY is_default DESC, id', [id]),
      client.query('SELECT * FROM pickup_locations WHERE buyer_id = $1 ORDER BY is_default DESC, id', [id]),
    ]);
    const row = buyerResult.rows[0];
    return { id: row.id, name: row.name, phone: row.phone, preferredCourier: row.preferred_courier, addresses: addresses.rows.map(mapAddress), pickups: pickups.rows.map(mapPickup) };
  }

  async create(input) {
    const id = `buyer-${randomUUID()}`;
    return this.write(id, input, true);
  }

  async update(id, input) { return this.write(id, input, false); }

  async write(id, input, isNew) {
    const client = await this.pool.connect();
    const addresses = normalizeDefaults(input.addresses);
    const pickups = normalizeDefaults(input.pickups);
    try {
      await client.query('BEGIN');
      if (isNew) await client.query('INSERT INTO buyers (id, name, phone, preferred_courier) VALUES ($1, $2, $3, $4)', [id, input.name.trim(), input.phone.trim(), input.preferredCourier]);
      else {
        const result = await client.query('UPDATE buyers SET name = $2, phone = $3, preferred_courier = $4, updated_at = NOW() WHERE id = $1', [id, input.name.trim(), input.phone.trim(), input.preferredCourier]);
        if (result.rowCount === 0) { await client.query('ROLLBACK'); return null; }
        await client.query('DELETE FROM addresses WHERE buyer_id = $1', [id]);
        await client.query('DELETE FROM pickup_locations WHERE buyer_id = $1', [id]);
      }
      for (const item of addresses) await client.query('INSERT INTO addresses (id, buyer_id, recipient_name, recipient_phone, street, barangay, city, province, zip_code, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [item.id || `address-${randomUUID()}`, id, item.recipientName, item.recipientPhone, item.street, item.barangay, item.city, item.province, item.zipCode, item.isDefault]);
      for (const item of pickups) await client.query('INSERT INTO pickup_locations (id, buyer_id, recipient_name, recipient_phone, branch_name, branch_address, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id || `pickup-${randomUUID()}`, id, item.recipientName, item.recipientPhone, item.branchName, item.branchAddress, item.isDefault]);
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async delete(id) {
    const result = await this.pool.query('DELETE FROM buyers WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}
