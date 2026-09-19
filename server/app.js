import express from 'express';
import { buyers } from './data.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/buyers', (request, response) => {
    const query = String(request.query.q ?? '').trim().toLocaleLowerCase('en-PH');
    const results = buyers
      .filter((buyer) => !query || buyer.name.toLocaleLowerCase('en-PH').includes(query) || buyer.phone.replace(/\s/g, '').includes(query.replace(/\s/g, '')))
      .map(({ addresses: _addresses, ...summary }) => summary);
    response.json(results);
  });

  app.get('/api/buyers/:buyerId', (request, response) => {
    const buyer = buyers.find((item) => item.id === request.params.buyerId);
    if (!buyer) return response.status(404).json({ message: 'Buyer not found' });
    return response.json(buyer);
  });

  return app;
}
