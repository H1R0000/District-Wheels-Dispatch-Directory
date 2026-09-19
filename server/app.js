import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryStore } from './store.js';
import { normalizePhone } from './phone.js';

const textFields = ['name', 'phone'];
const addressFields = ['street', 'barangay', 'city', 'province', 'zipCode'];
const pickupFields = ['branchName', 'branchAddress'];

function validateBuyer(body) {
  const errors = {};
  for (const field of textFields) if (!String(body[field] ?? '').trim()) errors[field] = 'This field is required.';
  if (String(body.phone ?? '').trim() && !normalizePhone(body.phone)) errors.phone = 'Enter a valid phone number.';
  if (!['LBC', 'J&T Express'].includes(body.preferredCourier)) errors.preferredCourier = 'Choose a supported courier.';
  const hasAddress = Array.isArray(body.addresses) && body.addresses.length > 0;
  const hasPickup = Array.isArray(body.pickups) && body.pickups.length > 0;
  if (body.preferredCourier === 'J&T Express' && !hasAddress) errors.addresses = 'Add a complete J&T delivery address.';
  if (body.preferredCourier === 'LBC' && !hasAddress && !hasPickup) errors.locations = 'Choose LBC door to door or branch pickup and add its details.';
  (body.addresses ?? []).forEach((address, index) => {
    for (const field of addressFields) if (!String(address[field] ?? '').trim()) errors[`addresses.${index}.${field}`] = 'Required';
  });
  (body.pickups ?? []).forEach((pickup, index) => {
    for (const field of pickupFields) if (!String(pickup[field] ?? '').trim()) errors[`pickups.${index}.${field}`] = 'Required';
  });
  return errors;
}

export function createApp(store = new MemoryStore(), options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

  app.get('/api/buyers', async (request, response, next) => {
    try { response.json(await store.list(String(request.query.q ?? ''))); } catch (error) { next(error); }
  });

  app.get('/api/buyers/:buyerId', async (request, response, next) => {
    try {
      const buyer = await store.get(request.params.buyerId);
      if (!buyer) return response.status(404).json({ message: 'Buyer not found' });
      return response.json(buyer);
    } catch (error) { return next(error); }
  });

  app.post('/api/buyers', async (request, response, next) => {
    try {
      const errors = validateBuyer(request.body);
      if (Object.keys(errors).length) return response.status(400).json({ message: 'Check the form fields.', errors });
      return response.status(201).json(await store.create(request.body));
    } catch (error) { return next(error); }
  });

  app.put('/api/buyers/:buyerId', async (request, response, next) => {
    try {
      const errors = validateBuyer(request.body);
      if (Object.keys(errors).length) return response.status(400).json({ message: 'Check the form fields.', errors });
      const buyer = await store.update(request.params.buyerId, request.body);
      if (!buyer) return response.status(404).json({ message: 'Buyer not found' });
      return response.json(buyer);
    } catch (error) { return next(error); }
  });

  app.delete('/api/buyers/:buyerId', async (request, response, next) => {
    try {
      if (!(await store.delete(request.params.buyerId))) return response.status(404).json({ message: 'Buyer not found' });
      return response.status(204).end();
    } catch (error) { return next(error); }
  });

  if (options.clientPath && existsSync(options.clientPath)) {
    app.use(express.static(options.clientPath));
    app.get('/{*splat}', (_request, response) => response.sendFile(resolve(options.clientPath, 'index.html')));
  }

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ message: 'The server could not complete the request.' });
  });
  return app;
}
