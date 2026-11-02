import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { json, readJsonObject, validateAssistantBody } from '../_shared/http.ts';

export async function authorizeAssistant(request: Request, headers: Record<string,string>) {
    const authorization = request.headers.get('authorization') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (!auth.user) return json({ message: 'Sign in again.' }, 401, headers);
    const { data: profile } = await db.from('profiles').select('role,is_demo').eq('id', auth.user.id).maybeSingle();
    if (!profile) return json({ message: 'This account is not approved.' }, 403, headers);
    const { data: quota, error: quotaError } = await db.rpc('claim_assistant_request_slot');
    if (quotaError) return json({ message: 'The assistant is temporarily unavailable.' }, 503, headers);
    if (!quota?.authorized) return json({ message: 'This session is not approved.' }, 403, headers);
    const quotaHeaders = { 'RateLimit-Limit': '20', 'RateLimit-Remaining': String(quota.remaining), 'RateLimit-Reset': String(quota.retry_after) };
    Object.assign(headers, quotaHeaders);
    if (!quota.allowed) return json({ message: 'Too many requests. Try again shortly.', code: 'rate_limited' }, 429, { ...headers, 'Retry-After': String(quota.retry_after) });
    const apiKey = Deno.env.get('GROQ_API_KEY');
    const body = await readJsonObject(request);
    validateAssistantBody(body);

    const stateSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const cacheDb = stateSecret ? createClient(Deno.env.get('SUPABASE_URL')!, stateSecret, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    return { db, auth, apiKey, body, headers, stateSecret, cacheDb };
}
