import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { cors, json } from '../_shared/http.ts';

Deno.serve(async (request) => {
  const headers = cors(request);
  if (!headers) return new Response('Forbidden', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const demoId = Deno.env.get('DEMO_USER_ID');
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!url || !key || !demoId) return json({ error: 'Demo is not configured' }, 503, headers);
  if (!token) return json({ error: 'Unauthorized' }, 401, headers);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || auth.user?.id !== demoId) return json({ error: 'Forbidden' }, 403, headers);
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('role,is_demo').eq('id', demoId).maybeSingle();
  if (profileError || profile?.role !== 'demo' || profile.is_demo !== true) {
    return json({ error: 'Forbidden' }, 403, headers);
  }

  const { data: count, error } = await admin.rpc('reset_demo_data', { target_demo_id: demoId });
  if (error) return json({ error: 'Reset failed' }, 500, headers);
  return json({ count, seedVersion: 1 }, 200, headers);
});
