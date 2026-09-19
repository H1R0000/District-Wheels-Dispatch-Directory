import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import BuyerCard from '../components/BuyerCard.jsx';

export default function BuyerDirectoryPage() {
  const [query, setQuery] = useState('');
  const [buyers, setBuyers] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setStatus('loading');
        const response = await fetch(`/api/buyers?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Request failed');
        setBuyers(await response.json());
        setStatus('ready');
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('error');
      }
    }, query ? 200 : 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Buyer dispatch records</h1>
          <p>Find a repeat buyer and move their saved shipping details into the courier form.</p>
        </div>
        <Link className="button button-primary hero-action" to="/buyers/new"><Plus size={18} aria-hidden="true" />Add buyer</Link>
      </section>

      <section className="finder" aria-labelledby="directory-heading">
        <div className="section-heading">
          <div>
            <h2 id="directory-heading">Find a buyer</h2>
            <p>Name or phone number</p>
          </div>
          <strong className="result-count">{buyers.length} record{buyers.length === 1 ? '' : 's'}</strong>
        </div>

        <label className="search-field">
          <span className="sr-only">Search by name or phone</span>
          <Search size={21} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Maria or 0917"
          />
        </label>
      </section>

      <section className="records" aria-label="Buyer records">

        {status === 'loading' && <p className="state-message">Loading buyers…</p>}
        {status === 'error' && <p className="state-message error">The buyer directory could not be loaded.</p>}
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
