import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Download, LockKeyhole, Plus, Search, Upload } from 'lucide-react';
import BuyerCard from '../components/BuyerCard.jsx';
import { listBuyers } from '../lib/buyers.js';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';
import { createOwnerBackup, downloadOwnerBackup, inspectOwnerBackup, restoreOwnerBackup } from '../lib/ownerBackup.js';

export default function BuyerDirectoryPage() {
  const profile = useAppAuth();
  const [query, setQuery] = useState('');
  const [buyers, setBuyers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [backupBusy, setBackupBusy] = useState(null);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState(false);
  const searchRef = useRef(null);
  const backupInputRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setStatus('loading');
        const result = await listBuyers(query);
        if (controller.signal.aborted) return;
        setBuyers(result);
        setStatus('ready');
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('error');
      }
    }, query ? 200 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, retryKey]);

  useEffect(() => {
    function handleShortcut(event) {
      if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) setQuery('');
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  async function resetDemo() {
    if (!window.confirm('Reset all shared demo records to the sample set? This removes demo edits.')) return;
    setResetting(true);
    setResetMessage('');
    const { data, error } = await supabase.functions.invoke('reset-demo', { body: {} });
    setResetting(false);
    setResetMessage(error ? 'Demo reset failed. Try again.' : `Restored ${data.count} sample buyers.`);
    if (!error) setRetryKey((value) => value + 1);
  }

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
      setRetryKey((value) => value + 1);
    } catch (error) { setBackupError(true); setBackupMessage(error.message); }
    finally { setBackupBusy(null); }
  }

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Buyer dispatch records</h1>
          <p>Find a repeat buyer and move their saved shipping details into the courier form.</p>
        </div>
        <Link className="button button-primary hero-action" to="/buyers/new"><Plus size={18} aria-hidden="true" />Add buyer</Link>
      </section>
      {profile?.is_demo && <section className="demo-panel">
        <div><strong>DEMO MODE</strong><p>Sample buyers are shared with other visitors. You can edit them and restore the originals.</p></div>
        <button className="button button-secondary" type="button" onClick={resetDemo} disabled={resetting}>{resetting ? 'Resetting…' : 'Reset Demo Data'}</button>
        {resetMessage && <p role="status">{resetMessage}</p>}
      </section>}
      {profile?.role === 'owner' && !profile.is_demo && <section className="owner-backup" aria-labelledby="owner-backup-heading" aria-busy={Boolean(backupBusy)}>
        <div className="owner-backup-main">
          <span className="owner-backup-icon" aria-hidden="true"><Archive size={22} strokeWidth={1.8} /></span>
          <div className="owner-backup-copy">
            <h2 id="owner-backup-heading">Owner backup</h2>
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
      </section>}

      <section className="finder" aria-labelledby="directory-heading">
        <div className="section-heading">
          <div>
            <h2 id="directory-heading">Find a buyer</h2>
            <p>Name or phone number</p>
          </div>
          <strong className="result-count">{status === 'loading' ? 'Loading…' : `${buyers.length} record${buyers.length === 1 ? '' : 's'}`}</strong>
        </div>

        <label className="search-field">
          <span className="sr-only">Search by name or phone</span>
          <Search size={21} aria-hidden="true" />
          <input
            type="search"
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or phone"
            aria-describedby="search-hint"
          />
        </label>
        <span className="search-shortcut" id="search-hint">Press / to search · Esc to clear</span>
      </section>

      <span className="sr-only" role="status">{status === 'loading' ? 'Loading buyer records.' : status === 'ready' ? `${buyers.length} buyer records found.` : 'The buyer directory could not be loaded.'}</span>
      <section className="records" aria-label="Buyer records" aria-busy={status === 'loading'}>

        {status === 'loading' && <p className="state-message">Loading buyers…</p>}
        {status === 'error' && <div className="state-message error"><p>The buyer directory could not be loaded. Check your connection and try again.</p><button className="button button-secondary" type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button></div>}
        {status === 'ready' && buyers.length === 0 && <p className="state-message">No buyers match “{query}”.</p>}

        {status === 'ready' && buyers.length > 0 && (
          <ul className="buyer-list">
            {buyers.map((buyer) => <BuyerCard buyer={buyer} key={buyer.id} />)}
          </ul>
        )}
      </section>
    </div>
  );
}
