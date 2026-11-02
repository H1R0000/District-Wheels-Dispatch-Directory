import express from 'express';
import { randomUUID } from 'node:crypto';
import { validateBuyer } from '../shared/buyerValidation.js';
import { createAuthenticator } from './auth.js';
import { ApiError, safeError } from './errors.js';

export function createApp({ authenticate = createAuthenticator(), logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' });
    next();
  });
  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.use('/api', async (request, response, next) => {
    try {
      request.context = await authenticate(request);
      const quota = request.context.quota;
      response.set({ 'RateLimit-Limit': '120', 'RateLimit-Remaining': String(quota.remaining), 'RateLimit-Reset': String(quota.retry_after) });
      if (!quota.allowed) throw new ApiError(429, 'Too many requests. Try again shortly.', undefined, quota.retry_after);
      next();
    } catch (error) { next(error); }
  });
  app.use('/api/owner', (request, _response, next) => {
    if (request.context.role !== 'owner') return next(new ApiError(403, 'Owner access required.'));
    next();
  });
  const json = (limit) => [
    (request, _response, next) => {
      if (!request.is('application/json')) return next(new ApiError(415, 'Send application/json.'));
      next();
    },
    express.json({ limit, inflate: false }),
  ];
  const buyerBody = (request) => {
    const { buyer, errors } = validateBuyer(request.body);
    if (Object.keys(errors).length) throw new ApiError(400, 'Check the form fields.', errors);
    return buyer;
  };
  const buyerId = (request) => {
    const id = request.params.buyerId;
    if (!id || id.length > 120) throw new ApiError(400, 'Invalid buyer ID.');
    return id;
  };
  app.get('/api/buyers', async (request, response) => {
    if (request.query.q !== undefined && (typeof request.query.q !== 'string' || request.query.q.length > 120)) throw new ApiError(400, 'Search must be text of at most 120 characters.');
    response.json(await request.context.repository.list(request.query.q ?? ''));
  });
  app.get('/api/buyers/:buyerId', async (request, response) => {
    const buyer = await request.context.repository.get(buyerId(request));
    if (!buyer) throw new ApiError(404, 'Buyer not found.');
    response.json(buyer);
  });
  app.post('/api/buyers', ...json('100kb'), async (request, response) => {
    const buyer = await request.context.repository.save(buyerBody(request));
    response.location(`/api/buyers/${encodeURIComponent(buyer.id)}`).status(201).json(buyer);
  });
  app.put('/api/buyers/:buyerId', ...json('100kb'), async (request, response) => {
    response.json(await request.context.repository.save(buyerBody(request), buyerId(request)));
  });
  app.delete('/api/buyers/:buyerId', async (request, response) => {
    if (!await request.context.repository.delete(buyerId(request))) throw new ApiError(404, 'Buyer not found.');
    response.status(204).end();
  });
  app.get('/api/owner/backup', async (request, response) => response.json(await request.context.repository.exportBackup()));
  app.post('/api/owner/backup/inspect', ...json(2_000_000), async (request, response) => response.json(await request.context.repository.restoreBackup(request.body, true)));
  app.post('/api/owner/backup/restore', ...json(2_000_000), async (request, response) => response.json(await request.context.repository.restoreBackup(request.body, false)));
  app.use((_request, _response, next) => next(new ApiError(404, 'Not found.')));
  app.use((error, request, response, _next) => {
    const correlationId = randomUUID();
    const problem = safeError(error);
    if (problem.status >= 500) logger.error({ correlationId, status: problem.status, code: error?.code ?? error?.name ?? 'unknown' });
    if (problem.retryAfter) response.set('Retry-After', String(problem.retryAfter));
    response.status(problem.status).type('application/problem+json').json({ type: 'about:blank', title: problem.message, status: problem.status, detail: problem.message, instance: request.path, correlationId, message: problem.message, ...(problem.errors ? { errors: problem.errors } : {}) });
  });
  return app;
}
