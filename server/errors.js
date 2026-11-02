export class ApiError extends Error {
  constructor(status, message, errors, retryAfter) { super(message); Object.assign(this, { status, errors, retryAfter }); }
}

export function safeError(error) {
  if (!error || typeof error !== 'object') return new ApiError(500, 'The server could not complete the request.');
  if (error instanceof ApiError) return error;
  if (error.type === 'entity.too.large') return new ApiError(413, 'The request is too large.');
  if (error.type === 'entity.parse.failed') return new ApiError(400, 'Send valid JSON.');
  if (error instanceof URIError || error.type === 'request.size.invalid') return new ApiError(400, 'Invalid request encoding.');
  if (error.type === 'request.aborted') return new ApiError(408, 'The request was interrupted.');
  if (error.status === 415) return new ApiError(415, 'Send uncompressed application/json.');
  const codes = {
    '23505': [409, 'A record with these details already exists.'],
    '23514': [400, 'Check the buyer details.'], '23502': [400, 'Complete the required fields.'],
    '22P02': [400, 'Invalid field value.'], '22023': [400, 'Check the submitted details.'],
    '42501': [403, 'This account cannot perform that operation.'],
    'PT404': [404, 'Buyer not found.'], 'PT400': [400, 'Check the submitted details.'],
    'PT403': [403, 'This account cannot perform that operation.'],
    '57014': [504, 'The service took too long. Try again.'],
    'PGRST000': [503, 'The database is temporarily unavailable.'],
    'PGRST001': [503, 'The database is temporarily unavailable.'],
    'PGRST002': [503, 'The database is temporarily unavailable.'],
    'PGRST202': [503, 'The database configuration is not ready.'],
    'PGRST301': [401, 'Your session has expired. Sign in again.'],
    'PGRST302': [401, 'Sign in to continue.'], 'PGRST303': [401, 'Sign in to continue.'],
  };
  if (codes[error.code]) return new ApiError(...codes[error.code]);
  if (['TimeoutError', 'AbortError'].includes(error.name)) return new ApiError(504, 'The service took too long. Try again.');
  if (error instanceof TypeError && error.message === 'fetch failed') return new ApiError(503, 'The service is temporarily unavailable.');
  if (error.status >= 500 || /^(08|53)/.test(error.code ?? '')) return new ApiError(503, 'The database is temporarily unavailable.');
  return new ApiError(500, 'The server could not complete the request.');
}
