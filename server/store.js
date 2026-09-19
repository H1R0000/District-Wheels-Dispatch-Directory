import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { seedBuyers } from './seed-data.js';

const clone = (value) => structuredClone(value);

function normalizeDefaults(items) {
  if (items.length === 0) return items;
  const selected = items.findIndex((item) => item.isDefault);
  const defaultIndex = selected >= 0 ? selected : 0;
  return items.map((item, index) => ({ ...item, isDefault: index === defaultIndex }));
}

function prepareBuyer(input, existingId) {
  return {
    id: existingId ?? `buyer-${randomUUID()}`,
    name: input.name.trim(),
    phone: input.phone.trim(),
    preferredCourier: input.preferredCourier,
    addresses: normalizeDefaults((input.addresses ?? []).map((item) => ({ ...item, recipientName: input.name.trim(), recipientPhone: input.phone.trim(), id: item.id || `address-${randomUUID()}` }))),
    pickups: normalizeDefaults((input.pickups ?? []).map((item) => ({ ...item, recipientName: input.name.trim(), recipientPhone: input.phone.trim(), id: item.id || `pickup-${randomUUID()}` }))),
  };
}

export class MemoryStore {
  constructor(initialBuyers = seedBuyers) { this.buyers = clone(initialBuyers); }

  async list(query = '') {
    const needle = query.trim().toLocaleLowerCase('en-PH');
    const compact = needle.replace(/\s/g, '');
    return clone(this.buyers
      .filter((buyer) => !needle || buyer.name.toLocaleLowerCase('en-PH').includes(needle) || buyer.phone.replace(/\s/g, '').includes(compact))
      .map(({ addresses, pickups, ...summary }) => ({ ...summary, addressCount: addresses.length, pickupCount: pickups.length })));
  }

  async get(id) { return clone(this.buyers.find((buyer) => buyer.id === id) ?? null); }

  async create(input) {
    const buyer = prepareBuyer(input);
    this.buyers.push(buyer);
    await this.persist();
    return clone(buyer);
  }

  async update(id, input) {
    const index = this.buyers.findIndex((buyer) => buyer.id === id);
    if (index < 0) return null;
    const buyer = prepareBuyer(input, id);
    this.buyers[index] = buyer;
    await this.persist();
    return clone(buyer);
  }

  async delete(id) {
    const index = this.buyers.findIndex((buyer) => buyer.id === id);
    if (index < 0) return false;
    this.buyers.splice(index, 1);
    await this.persist();
    return true;
  }

  async persist() {}
}

export class JsonStore extends MemoryStore {
  constructor(filePath) { super([]); this.filePath = filePath; }

  async initialize() {
    try { this.buyers = JSON.parse(await readFile(this.filePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.buyers = clone(seedBuyers);
      await this.persist();
    }
    return this;
  }

  async persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.buyers, null, 2)}\n`, 'utf8');
  }
}
