import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Archive, ArrowLeft, Download, LockKeyhole, Upload } from 'lucide-react';
import { useAppAuth } from '../lib/AuthContext.jsx';
import { createOwnerBackup, downloadOwnerBackup, inspectOwnerBackup, restoreOwnerBackup } from '../lib/ownerBackup.js';
import { canAccessOwnerBackup } from '../utils/navigation.js';

export default function OwnerBackupPage() {
  const profile = useAppAuth();
  const [backupBusy, setBackupBusy] = useState(null);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState(false);
  const backupInputRef = useRef(null);

  if (!canAccessOwnerBackup(profile)) return <Navigate to="/" replace />;

  async function exportBackup() {
    setBackupBusy('export');
    setBackupMessage('');
    setBackupError(false);
    try {
      const backup = await createOwnerBackup();
      downloadOwnerBackup(backup);
      setBackupMessage(`Downloaded ${backup.buyers.length} buyer records. Keep this file private.`);
    } catch (error) { setBackupError(true); setBackupMessage(error.message); }
    finally { setBackupBusy(null); }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBackupBusy('import');
    setBackupMessage('');
    setBackupError(false);
    try {
      const { backup, preview } = await inspectOwnerBackup(file);
      if (!preview.missing_buyers) {
        setBackupMessage(`Backup verified: ${preview.backup_buyers} buyers. All are already present; nothing changed.`);
        return;
      }
      if (!window.confirm(`Backup verified for ${preview.backup_buyers} buyers. Restore ${preview.missing_buyers} missing buyers? Existing buyers will not be changed.`)) {
        setBackupMessage('Restore cancelled; nothing changed.');
        return;
      }
      const result = await restoreOwnerBackup(backup);
      setBackupMessage(`Restored ${result.restored_buyers} missing buyers. Existing records were left as they were.`);
    } catch (error) { setBackupError(true); setBackupMessage(error.message); }
    finally { setBackupBusy(null); }
  }

  return <div className="page backup-page">
    <Link className="back-link" to="/"><ArrowLeft size={17} aria-hidden="true" />Buyer directory</Link>
    <section className="owner-backup" aria-labelledby="owner-backup-heading" aria-busy={Boolean(backupBusy)}>
      <div className="owner-backup-main">
        <span className="owner-backup-icon" aria-hidden="true"><Archive size={22} strokeWidth={1.8} /></span>
        <div className="owner-backup-copy">
          <h1 id="owner-backup-heading">Owner backup</h1>
          <p>Save a copy of your buyers. Check a backup later to restore any records that are missing.</p>
        </div>
      </div>
      <div className="owner-backup-actions">
        <button className="button button-primary" type="button" onClick={exportBackup} disabled={Boolean(backupBusy)}><Download size={17} aria-hidden="true" />{backupBusy === 'export' ? 'Preparing backup…' : 'Download backup'}</button>
        <button className="button button-secondary" type="button" onClick={() => backupInputRef.current?.click()} disabled={Boolean(backupBusy)}><Upload size={17} aria-hidden="true" />{backupBusy === 'import' ? 'Checking backup…' : 'Check a backup'}</button>
      </div>
      <input ref={backupInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={importBackup} aria-label="Choose owner backup file" />
      <div className="owner-backup-footer">
        <p className="owner-backup-privacy"><LockKeyhole size={15} aria-hidden="true" />Includes names, phone numbers, and addresses. Keep the file private.</p>
        {backupMessage && <p className={`owner-backup-status${backupError ? ' is-error' : ''}`} role="status">{backupMessage}</p>}
      </div>
    </section>
  </div>;
}
