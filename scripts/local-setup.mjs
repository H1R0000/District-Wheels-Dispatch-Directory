import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cli, requireLocal } from './local-config.mjs';

async function saveConfig(path, content) {
  try {
    const current = await readFile(path, 'utf8');
    if (current === content) return;
    await mkdir('backups/local-config', { recursive: true });
    const backup = `backups/local-config/${path.replaceAll('/', '_')}`;
    try { await writeFile(backup, current, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path, content, { mode: 0o600 });
}

try {
  console.log('Starting local Supabase containers and applying migrations (first run downloads Docker images)...');
  cli(['start', '--exclude', 'studio,postgres-meta,logflare,vector,supavisor,imgproxy']);
  const status = JSON.parse(cli(['status', '-o', 'json']));
  requireLocal(status.API_URL);
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let saved = {};
  try { saved = JSON.parse(await readFile('tmp/local-supabase.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const password = saved.demoPassword ?? randomBytes(24).toString('hex');
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) throw new Error('Could not list local Auth users.');
  let demo = users.users.find((user) => user.email === 'demo@district-wheels.test');
  if (!demo) {
    const { data, error } = await admin.auth.admin.createUser({ email: 'demo@district-wheels.test', password, email_confirm: true });
    if (error) throw new Error('Could not create local demo user.');
    demo = data.user;
  } else {
    const { error } = await admin.auth.admin.updateUserById(demo.id, { password });
    if (error) throw new Error('Could not configure local demo password.');
  }
  const { error: profileError } = await admin.from('profiles').upsert({ id: demo.id, role: 'demo', is_demo: true, github_provider_id: null });
  if (profileError) throw new Error('Could not provision the local demo profile.');
  const { count, error: countError } = await admin.from('buyers').select('id', { count: 'exact', head: true }).eq('owner_id', demo.id);
  if (countError) throw new Error('Could not inspect local demo data.');
  if (!count) {
    const { error } = await admin.rpc('reset_demo_data', { target_demo_id: demo.id });
    if (error) throw new Error('Could not seed fictional local records.');
  }
  await mkdir('tmp', { recursive: true });
  await writeFile('tmp/local-supabase.json', JSON.stringify({ ...status, demoPassword: password, demoId: demo.id }), { mode: 0o600 });
  await saveConfig('.env.local', `SUPABASE_URL=${status.API_URL}\nSUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\n`);
  await saveConfig('client/.env.local', `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.ANON_KEY}\n`);
  const salt = saved.rateSalt ?? randomBytes(32).toString('hex');
  await saveConfig('supabase/functions/.env.local', `APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\nDEMO_EMAIL=demo@district-wheels.test\nDEMO_PASSWORD=${password}\nDEMO_USER_ID=${demo.id}\nDEMO_RATE_SALT=${salt}\n`);
  console.log('Local Supabase is ready. Configuration files are ignored by Git; previous configurations are preserved in backups/local-config/.');
  console.log('Run npm run local:functions in one terminal, and npm run dev in another.');
} catch (error) {
  console.error('Local setup failed. Ensure Docker Desktop is running. Inspect Supabase start logs locally; credentials are deliberately not printed here.');
  console.error(error.status ? `CLI exit status: ${error.status}` : error.message);
  process.exitCode = 1;
}
