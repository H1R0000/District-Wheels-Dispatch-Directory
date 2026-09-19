import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

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
        <p className="eyebrow">Buyer directory</p>
        <h1>Find shipping details quickly.</h1>
        <p>Search repeat buyers by name or phone number, then copy the information needed for dispatch.</p>
      </section>

      <section className="panel" aria-labelledby="directory-heading">
        <div className="section-heading">
          <div>
            <h2 id="directory-heading">Buyers</h2>
            <p>Fictional records for development only.</p>
          </div>
          <span className="count-badge">{buyers.length} found</span>
        </div>

        <label className="search-field">
          <span>Search by name or phone</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try Maria or 0917"
          />
        </label>

        {status === 'loading' && <p className="state-message">Loading buyers…</p>}
        {status === 'error' && <p className="state-message error">The buyer directory could not be loaded.</p>}
        {status === 'ready' && buyers.length === 0 && <p className="state-message">No buyers match “{query}”.</p>}

        {status === 'ready' && buyers.length > 0 && (
          <ul className="buyer-list">
            {buyers.map((buyer) => (
              <li key={buyer.id}>
                <Link className="buyer-card" to={`/buyers/${buyer.id}`}>
                  <span className="avatar" aria-hidden="true">{buyer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                  <span className="buyer-summary">
                    <strong>{buyer.name}</strong>
                    <span>{buyer.phone}</span>
                  </span>
                  <span className="courier-tag">{buyer.preferredCourier}</span>
                  <span className="open-label">View <span aria-hidden="true">→</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
