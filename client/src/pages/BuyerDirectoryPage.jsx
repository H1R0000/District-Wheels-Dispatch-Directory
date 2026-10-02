import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import BuyerCard from '../components/BuyerCard.jsx';
import { listBuyers } from '../lib/buyers.js';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';

export default function BuyerDirectoryPage() {
  const profile = useAppAuth();
  const [query, setQuery] = useState('');
  const [buyers, setBuyers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const searchRef = useRef(null);

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

  return (
    <div className="page directory-page">
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
