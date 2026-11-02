import { cors, json, RequestError } from '../_shared/http.ts';
import { authorizeAssistant } from './request-auth.ts';
import { handleConversation } from './conversation-handler.ts';

Deno.serve(async (request) => {
  const headers = cors(request);
  if (!headers) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ message: 'Method not allowed' }, 405, headers);
  try {
    const context = await authorizeAssistant(request, headers);
    if (context instanceof Response) return context;
    return await handleConversation(context);
  } catch (error) {
    if (error instanceof RequestError) return json({ message: error.message, code: 'invalid_request' }, error.status, headers);
    console.error({ name: error instanceof Error ? error.name : 'unknown' });
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return json({ message: 'The lookup or AI service took too long. Please try again.', code: 'timeout' }, 504, headers);
    return json({ message: 'The assistant could not complete that request.', code: 'internal_error' }, 500, headers);
  }
});
