import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCopy, Pencil, Trash2 } from 'lucide-react';
import CopyField from '../components/CopyField.jsx';
import { phoneForCourier } from '../utils/phone.js';

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

export default function BuyerDetailsPage() {
  const { buyerId } = useParams();
  const navigate = useNavigate();
  const [buyer, setBuyer] = useState(null);
  const [status, setStatus] = useState('loading');
  const [shippingMethod, setShippingMethod] = useState('door');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function loadBuyer() {
      try {
        const response = await fetch(`/api/buyers/${buyerId}`, { signal: controller.signal });
        if (response.status === 404) { setStatus('not-found'); return; }
        if (!response.ok) throw new Error('Request failed');
        const result = await response.json();
        setBuyer(result);
        setSelectedAddressId((result.addresses.find((item) => item.isDefault) ?? result.addresses[0])?.id ?? '');
        setSelectedPickupId((result.pickups.find((item) => item.isDefault) ?? result.pickups[0])?.id ?? '');
        setStatus('ready');
      } catch (error) { if (error.name !== 'AbortError') setStatus('error'); }
    }
    loadBuyer();
    return () => controller.abort();
  }, [buyerId]);

  const address = useMemo(() => buyer?.addresses.find((item) => item.id === selectedAddressId), [buyer, selectedAddressId]);
  const pickup = useMemo(() => buyer?.pickups.find((item) => item.id === selectedPickupId), [buyer, selectedPickupId]);

  async function copyGroup() {
    const lines = shippingMethod === 'door' && address
      ? [address.recipientName, phoneForCourier(address.recipientPhone), address.street, address.barangay, address.city, address.province, address.zipCode]
      : pickup ? [pickup.recipientName, phoneForCourier(pickup.recipientPhone), pickup.branchName, pickup.branchAddress] : [];
    try { await copyText(lines.join('\n')); setCopyStatus('All shipping details copied.'); }
    catch { setCopyStatus('Copy failed. Select the text manually.'); }
    window.setTimeout(() => setCopyStatus(''), 2200);
  }

  async function deleteBuyer() {
    if (!window.confirm(`Delete ${buyer.name}? This cannot be undone.`)) return;
    setStatus('deleting');
    const response = await fetch(`/api/buyers/${buyerId}`, { method: 'DELETE' });
    if (response.ok) navigate('/', { replace: true });
    else setStatus('error');
  }

  if (status === 'loading') return <div className="page"><p className="state-message">Loading buyer…</p></div>;
  if (status === 'not-found') return <div className="page"><h1>Buyer not found</h1><Link to="/">Return to directory</Link></div>;
  if (status === 'error') return <div className="page"><h1>Something went wrong</h1><p>The buyer record could not be loaded or changed.</p><Link to="/">Return to directory</Link></div>;

  const location = shippingMethod === 'door' ? address : pickup;

  return (
    <div className="page">
      <Link className="back-link" to="/"><ArrowLeft size={16} aria-hidden="true" />Buyer directory</Link>
      <section className="detail-hero">
        <div><h1>{buyer.name}</h1><p>Preferred courier: <strong>{buyer.preferredCourier}</strong></p></div>
        <div className="detail-actions"><Link className="button button-secondary" to={`/buyers/${buyer.id}/edit`}><Pencil size={17} aria-hidden="true" />Edit buyer</Link><button className="button button-danger" type="button" onClick={deleteBuyer} disabled={status === 'deleting'}><Trash2 size={17} aria-hidden="true" />{status === 'deleting' ? 'Deleting…' : 'Delete'}</button></div>
      </section>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="contact-heading">
          <div className="section-heading"><div><h2 id="contact-heading">Contact</h2><p>Copy one value at a time.</p></div></div>
          <div className="field-stack"><CopyField label="Recipient name" value={buyer.name} /><CopyField label="Phone number" value={buyer.phone} clipboardValue={phoneForCourier(buyer.phone)} /></div>
        </section>

        <section className="panel shipping-panel" aria-labelledby="shipping-heading">
          <div className="section-heading"><div><h2 id="shipping-heading">Shipping details</h2><p>Choose a saved location, then copy what the courier needs.</p></div></div>
          {buyer.preferredCourier === 'LBC' && buyer.pickups.length > 0 && (
            <div className="segmented-control" aria-label="Shipping method">
              <button type="button" className={shippingMethod === 'door' ? 'active' : ''} onClick={() => setShippingMethod('door')}>Door to door</button>
              <button type="button" className={shippingMethod === 'pickup' ? 'active' : ''} onClick={() => setShippingMethod('pickup')}>Branch pickup</button>
            </div>
          )}
          <label className="select-field"><span>Saved {shippingMethod === 'door' ? 'address' : 'pickup location'}</span><select value={shippingMethod === 'door' ? selectedAddressId : selectedPickupId} onChange={(event) => shippingMethod === 'door' ? setSelectedAddressId(event.target.value) : setSelectedPickupId(event.target.value)}>{(shippingMethod === 'door' ? buyer.addresses : buyer.pickups).map((item) => <option key={item.id} value={item.id}>{shippingMethod === 'door' ? `${item.street}, ${item.city}` : item.branchName}{item.isDefault ? ' — Default' : ''}</option>)}</select></label>

          {location ? (
            <div className="field-stack">
              <CopyField label="Recipient name" value={location.recipientName} />
              <CopyField label="Recipient phone" value={location.recipientPhone} clipboardValue={phoneForCourier(location.recipientPhone)} />
              {shippingMethod === 'door' ? <><CopyField label="Street" value={address.street} /><CopyField label="Barangay" value={address.barangay} /><CopyField label="City" value={address.city} /><CopyField label="Province" value={address.province} /><CopyField label="ZIP code" value={address.zipCode} /></> : <><CopyField label="LBC branch" value={pickup.branchName} /><CopyField label="Branch address" value={pickup.branchAddress} /></>}
              <div className="copy-all-row"><button className="button button-primary" type="button" onClick={copyGroup}><ClipboardCopy size={18} aria-hidden="true" />Copy all shipping details</button><span aria-live="polite">{copyStatus}</span></div>
            </div>
          ) : <p className="state-message">No saved location is available for this shipping method.</p>}
        </section>
      </div>
    </div>
  );
}
