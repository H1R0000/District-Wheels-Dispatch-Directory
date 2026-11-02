import { randomUUID } from 'node:crypto';
import { seedBuyers } from './buyers.js';
import { formatBuyerName } from '../../shared/buyerName.js';
import { ApiError } from '../../server/errors.js';
const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '');

const clone = (value) => structuredClone(value);

function normalizeDefaults(items) {
  if (items.length === 0) return items;
  const selected = items.findIndex((item) => item.isDefault);
  const defaultIndex = selected >= 0 ? selected : 0;
  return items.map((item, index) => ({ ...item, isDefault: index === defaultIndex }));
}

function trimLocation(item) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
}

function prepareBuyer(input, existingId) {
  const phone = normalizePhone(input.phone);
  const name = formatBuyerName(input.name);
  return {
    id: existingId ?? `buyer-${randomUUID()}`,
    name,
    phone,
    preferredCourier: input.preferredCourier,
    addresses: normalizeDefaults((input.addresses ?? []).map((item) => ({ ...trimLocation(item), recipientName: name, recipientPhone: phone, id: item.id || `address-${randomUUID()}` }))),
    pickups: normalizeDefaults((input.pickups ?? []).map((item) => ({ ...trimLocation(item), recipientName: name, recipientPhone: phone, id: item.id || `pickup-${randomUUID()}` }))),
  };
}

export class MemoryStore {
  constructor(initialBuyers = seedBuyers) { this.buyers = clone(initialBuyers); }

  async list(query = '') {
    const needle = query.trim().toLocaleLowerCase('en-PH');
    const phoneNeedle = normalizePhone(query);
    return clone(this.buyers
      .filter((buyer) => !needle || buyer.name.toLocaleLowerCase('en-PH').includes(needle) || (phoneNeedle && normalizePhone(buyer.phone).includes(phoneNeedle)))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-PH', { sensitivity: 'base', numeric: true }))
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

  async save(input, id) {
    if (id && !await this.get(id)) throw new ApiError(404, 'Buyer not found.');
    if (this.buyers.some((buyer) => buyer.id !== id && buyer.phone === input.phone)) throw { code: '23505' };
    return id ? this.update(id, input) : this.create(input);
  }
  async persist() {}
}

