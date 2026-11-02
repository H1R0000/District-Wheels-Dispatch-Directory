import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const cliPath = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
export function cli(args) {
  return execFileSync(process.execPath, [cliPath, ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
export function requireLocal(url) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:') throw new Error('This tool only accepts loopback HTTP Supabase instances.');
}
