import { supabase } from './supabase.js';

const select = 'id,owner_id,name,phone,preferred_courier,addresses(id,recipient_name,recipient_phone,street,barangay,city,province,zip_code,is_default),pickup_locations(id,recipient_name,recipient_phone,branch_name,branch_address,is_default)';

export async function createOwnerBackup() {
  const { data: userResult, error: authError } = await supabase.auth.getUser();
  if (authError || !userResult.user) throw new Error('Sign in again before exporting.');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role,is_demo').eq('id', userResult.user.id).single();
  if (profileError || profile?.role !== 'owner' || profile.is_demo) throw new Error('Owner access required.');
  const { data: buyers, error } = await supabase.from('buyers').select(select).eq('owner_id', userResult.user.id).order('id').limit(1001);
  if (error) throw error;
  if (buyers.length > 1000) throw new Error('The backup exceeds the supported 1,000 buyer limit.');
  return { format: 'district-wheels-owner-backup-v1', owner_id: userResult.user.id, exported_at: new Date().toISOString(), buyers };
}

export function downloadOwnerBackup(backup) {
  const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `district-wheels-owner-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function inspectOwnerBackup(file) {
  if (file.size > 2_000_000) throw new Error('Backup file is too large.');
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { throw new Error('This is not a valid JSON backup file.'); }
  const { data, error } = await supabase.rpc('restore_owner_backup', { payload: backup, dry_run: true });
  if (error) throw new Error(error.message);
  return { backup, preview: data };
}

export async function restoreOwnerBackup(backup) {
  const { data, error } = await supabase.rpc('restore_owner_backup', { payload: backup, dry_run: false });
  if (error) throw new Error(error.message);
  return data;
}
