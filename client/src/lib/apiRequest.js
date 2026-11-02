import { supabase } from './supabase.js';
import { createApiRequest } from './apiTransport.js';
export const apiRequest = createApiRequest({ getSession: () => supabase.auth.getSession() });
