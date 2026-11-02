import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';
import { SupabaseRepository } from './supabase-repository.js';

export function createAuthenticator({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY, clientFactory = createClient } = {}) {
  return async (request) => {
    const token = request.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) throw new ApiError(401, 'Sign in to continue.');
    if (!url || !key) throw new ApiError(503, 'Server authentication is not configured.');
    const db = clientFactory(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error) {
      if (error.status >= 500 || error.name === 'AuthRetryableFetchError') throw new ApiError(503, 'Sign-in verification is temporarily unavailable.');
      throw new ApiError(401, 'Your session has expired. Sign in again.');
    }
    if (!data.user) throw new ApiError(401, 'Sign in to continue.');
    const { data: access, error: accessError } = await db.rpc('application_access');
    if (accessError) throw accessError;
    if (!access?.allowed) throw new ApiError(403, 'This session is not approved.');
    const { data: quota, error: quotaError } = await db.rpc('claim_api_request_slot');
    if (quotaError) throw quotaError;
    if (!quota?.authorized) throw new ApiError(403, 'This session is not approved.');
    return { repository: new SupabaseRepository(db, data.user.id), user: data.user, role: access.role, quota };
  };
}
