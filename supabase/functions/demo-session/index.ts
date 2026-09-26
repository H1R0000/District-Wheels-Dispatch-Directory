import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { cors, json } from '../_shared/http.ts';

// Deploy with JWT verification disabled; this is the public demo entry point.
Deno.serve(async (request) => {
  const headers = cors(request);
  if (!headers) return new Response('Forbidden', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  const email = Deno.env.get('DEMO_EMAIL');
  const password = Deno.env.get('DEMO_PASSWORD');
  const demoId = Deno.env.get('DEMO_USER_ID');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const rateSalt = Deno.env.get('DEMO_RATE_SALT');
  if (!url || !key || !email || !password || !demoId || !serviceKey || !rateSalt) {
    return json({ error: 'Demo is not configured' }, 503, headers);
  }

  const ip = request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const bytes = new TextEncoder().encode(`${rateSalt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed, error: rateError } = await admin.rpc('claim_demo_login_slot', { client_fingerprint: fingerprint });
  if (rateError) return json({ error: 'Demo sign-in unavailable' }, 503, headers);
  if (!allowed) return json({ error: 'Too many attempts. Try again later.' }, 429, headers);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || data.user?.id !== demoId) {
    return json({ error: 'Demo sign-in unavailable' }, 503, headers);
  }
  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  }, 200, headers);
});
