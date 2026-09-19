import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CopyField from '../components/CopyField.jsx';

export default function BuyerDetailsPage() {
  const { buyerId } = useParams();
  const [buyer, setBuyer] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const controller = new AbortController();
    async function loadBuyer() {
      try {
        const response = await fetch(`/api/buyers/${buyerId}`, { signal: controller.signal });
        if (response.status === 404) {
          setStatus('not-found');
          return;
        }
        if (!response.ok) throw new Error('Request failed');
        setBuyer(await response.json());
        setStatus('ready');
      } catch (error) {
        if (error.name !== 'AbortError') setStatus('error');
      }
    }
    loadBuyer();
    return () => controller.abort();
  }, [buyerId]);

  if (status === 'loading') return <div className="page"><p className="state-message">Loading buyer…</p></div>;
  if (status === 'not-found') return <div className="page"><h1>Buyer not found</h1><Link to="/">Return to directory</Link></div>;
  if (status === 'error') return <div className="page"><h1>Something went wrong</h1><p>The buyer record could not be loaded.</p><Link to="/">Return to directory</Link></div>;

  const address = buyer.addresses.find((item) => item.isDefault) ?? buyer.addresses[0];

  return (
    <div className="page">
      <Link className="back-link" to="/">← Buyer directory</Link>
      <section className="detail-hero">
        <div>
          <p className="eyebrow">Buyer details</p>
          <h1>{buyer.name}</h1>
          <p>Preferred courier: <strong>{buyer.preferredCourier}</strong></p>
        </div>
        <span className="record-badge">Development record</span>
      </section>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="contact-heading">
          <div className="section-heading"><div><h2 id="contact-heading">Contact</h2><p>Copy one value at a time.</p></div></div>
          <div className="field-stack">
            <CopyField label="Recipient name" value={buyer.name} />
            <CopyField label="Phone number" value={buyer.phone} />
          </div>
        </section>

        <section className="panel" aria-labelledby="address-heading">
          <div className="section-heading">
            <div><h2 id="address-heading">Default address</h2><p>Door-to-door delivery details.</p></div>
            <span className="default-tag">Default</span>
          </div>
          <div className="field-stack">
            <CopyField label="Street" value={address.street} />
            <CopyField label="Barangay" value={address.barangay} />
            <CopyField label="City" value={address.city} />
            <CopyField label="Province" value={address.province} />
            <CopyField label="ZIP code" value={address.zipCode} />
          </div>
        </section>
      </div>
    </div>
  );
}
