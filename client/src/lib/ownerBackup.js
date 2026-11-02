import { apiRequest } from './apiRequest.js';

export async function createOwnerBackup() {
  return apiRequest('/owner/backup');
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
  const preview = await apiRequest('/owner/backup/inspect', { method: 'POST', body: backup });
  return { backup, preview };
}

export async function restoreOwnerBackup(backup) {
  return apiRequest('/owner/backup/restore', { method: 'POST', body: backup });
}
