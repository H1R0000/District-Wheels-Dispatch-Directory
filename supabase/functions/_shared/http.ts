export function cors(request: Request) {
  const origins = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((item) => item.trim());
  const origin = request.headers.get('origin');
  if (!origin || !origins.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

export function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
}

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export async function readJsonObject(request: Request, maxBytes = 100 * 1024, timeoutMs = 15000): Promise<Record<string, any>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RequestError('Send application/json.', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RequestError('The request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError('Send a JSON object.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let complete = false;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new RequestError('The request timed out.', 408)), timeoutMs); });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestError('The request is too large.', 413);
      chunks.push(value);
    }
    complete = true;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new RequestError('Send valid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('Send a JSON object.');
    return body;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch((error) => console.warn('Request cancellation failed', error?.name));
    reader.releaseLock();
  }
}

export function validateAssistantBody(body: Record<string, any>) {
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 40) throw new RequestError('Send between 1 and 40 messages.');
  for (const message of body.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 8000) throw new RequestError('Invalid conversation message.');
    if (message.branchChoices !== undefined && (!Array.isArray(message.branchChoices) || message.branchChoices.length > 20 || message.branchChoices.some((branch: any) => !branch || ['branch_name', 'branch_address'].some((field) => typeof branch[field] !== 'string' || branch[field].length > 500)))) throw new RequestError('Invalid branch choices.');
  }
  if (body.messages.at(-1).role !== 'user') throw new RequestError('End the conversation with a user message.');
  if (body.buyerStateToken !== undefined && (typeof body.buyerStateToken !== 'string' || body.buyerStateToken.length > 12000)) throw new RequestError('Invalid buyer state token.');
}
