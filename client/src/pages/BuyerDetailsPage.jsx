import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCopy, MapPin, Pencil, Trash2 } from 'lucide-react';
import CopyField from '../components/CopyField.jsx';
import { phoneForCourier } from '../utils/phone.js';
import { deleteBuyer as removeBuyer, getBuyer } from '../lib/buyers.js';

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

function cleanLine(value) {
  return String(value ?? '').trim();
}

export default function BuyerDetailsPage() {
  const { buyerId } = useParams();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [buyer, setBuyer] = useState(null);
  const [status, setStatus] = useState('loading');
  const [shippingMethod, setShippingMethod] = useState('door');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [selectedPickupId, setSelectedPickupId] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState(routeLocation.state?.saved ? 'Buyer saved successfully.' : '');

  useEffect(() => {
    const controller = new AbortController();
    async function loadBuyer() {
      try {
        const result = await getBuyer(buyerId);
        if (controller.signal.aborted) return;
        if (!result) { setStatus('not-found'); return; }
        setBuyer(result);
        setShippingMethod(result.addresses.length === 0 && result.pickups.length > 0 ? 'pickup' : 'door');
        setSelectedAddressId((result.addresses.find((item) => item.isDefault) ?? result.addresses[0])?.id ?? '');
        setSelectedPickupId((result.pickups.find((item) => item.isDefault) ?? result.pickups[0])?.id ?? '');
        setStatus('ready');
      } catch (error) { if (error.name !== 'AbortError') setStatus('error'); }
    }
    loadBuyer();
    return () => controller.abort();
  }, [buyerId, reloadKey]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = window.setTimeout(() => setCopyStatus(''), 2200);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const address = useMemo(() => buyer?.addresses.find((item) => item.id === selectedAddressId), [buyer, selectedAddressId]);
  const pickup = useMemo(() => buyer?.pickups.find((item) => item.id === selectedPickupId), [buyer, selectedPickupId]);

  async function copyGroup() {
    const lines = shippingMethod === 'door' && address
      ? [address.recipientName, phoneForCourier(address.recipientPhone), address.street, address.barangay, address.city, address.province, address.zipCode]
      : pickup ? [pickup.recipientName, phoneForCourier(pickup.recipientPhone), pickup.branchName, pickup.branchAddress] : [];
    try { await copyText(lines.map(cleanLine).join('\n')); setCopyStatus('All shipping details copied.'); }
    catch { setCopyStatus('Copy failed. Select the text manually.'); }
  }

  async function deleteBuyer() {
    if (!window.confirm(`Delete ${buyer.name}? This cannot be undone.`)) return;
    setStatus('deleting');
    try {
      if (await removeBuyer(buyerId)) navigate('/', { replace: true });
      else setStatus('not-found');
    } catch { setStatus('error'); }
  }

  if (status === 'loading') return <div className="page"><p className="state-message">Loading buyer…</p></div>;
  if (status === 'not-found') return <div className="page"><h1>Buyer not found</h1><Link to="/">Return to directory</Link></div>;
  if (status === 'error') return <div className="page"><h1>Buyer unavailable</h1><p>The buyer record could not be loaded. Check your connection and try again.</p><div className="recovery-actions"><button className="button button-primary" type="button" onClick={() => { setStatus('loading'); setReloadKey((value) => value + 1); }}>Try again</button><Link className="button button-secondary" to="/">Return to directory</Link></div></div>;

  const location = shippingMethod === 'door' ? address : pickup;
  const locations = shippingMethod === 'door' ? buyer.addresses : buyer.pickups;
  const locationType = shippingMethod === 'door' ? 'address' : 'pickup location';

  return (
    <div className="page">
      {notice && <p className="save-notice" role="status">{notice}</p>}
      <Link className="back-link" to="/"><ArrowLeft size={16} aria-hidden="true" />Buyer directory</Link>
      <section className="detail-hero">
        <div>
          <h1>{buyer.name}</h1>
          <p>Preferred courier: <strong>{buyer.preferredCourier}</strong></p>
        </div>
        <div className="detail-actions"><Link className="button button-secondary" to={`/buyers/${buyer.id}/edit`}><Pencil size={17} aria-hidden="true" />Edit buyer</Link><button className="button button-danger" type="button" onClick={deleteBuyer} disabled={status === 'deleting'}><Trash2 size={17} aria-hidden="true" />{status === 'deleting' ? 'Deleting…' : 'Delete'}</button></div>
      </section>

      <div className="detail-grid">
        <section className="panel shipping-panel" aria-labelledby="shipping-heading">
          <div className="section-heading shipping-heading"><div><h2 id="shipping-heading">Shipping details</h2><p>Everything the courier needs, ready to copy.</p></div>{location && <div className="shipping-primary-action"><span aria-live="polite">{copyStatus}</span><button className="button button-accent" type="button" onClick={copyGroup}><ClipboardCopy size={18} aria-hidden="true" />Copy all shipping details</button></div>}</div>
          {buyer.preferredCourier === 'LBC' && buyer.addresses.length > 0 && buyer.pickups.length > 0 && (
            <div className="segmented-control" aria-label="Shipping method">
              <button type="button" aria-pressed={shippingMethod === 'door'} className={shippingMethod === 'door' ? 'active' : ''} onClick={() => setShippingMethod('door')}>Door to door</button>
              <button type="button" aria-pressed={shippingMethod === 'pickup'} className={shippingMethod === 'pickup' ? 'active' : ''} onClick={() => setShippingMethod('pickup')}>Branch pickup</button>
            </div>
          )}
          {locations.length > 1 ? <label className="select-field"><span>Saved {locationType}</span><select value={shippingMethod === 'door' ? selectedAddressId : selectedPickupId} onChange={(event) => shippingMethod === 'door' ? setSelectedAddressId(event.target.value) : setSelectedPickupId(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{shippingMethod === 'door' ? `${item.street}, ${item.city}` : item.branchName}{item.isDefault ? ' — Default' : ''}</option>)}</select></label> : location ? <p className="single-location-note"><MapPin size={16} aria-hidden="true" />Using the default {locationType}</p> : null}

          {location ? (
            <div className="shipping-groups">
              <section className="shipping-group" aria-labelledby="recipient-group-heading">
                <h3 id="recipient-group-heading">Recipient</h3>
                <div className="field-stack"><CopyField label="Name" value={buyer.name} /><CopyField label="Phone" value={buyer.phone} clipboardValue={phoneForCourier(buyer.phone)} /></div>
              </section>
              <section className="shipping-group" aria-labelledby="destination-group-heading">
                <h3 id="destination-group-heading">{shippingMethod === 'door' ? 'Delivery address' : 'Pickup branch'}</h3>
                <div className="field-stack">{shippingMethod === 'door' ? <><CopyField label="Street" value={address.street} /><CopyField label="Barangay" value={address.barangay} /><CopyField label="City" value={address.city} /><CopyField label="Province" value={address.province} /><CopyField label="ZIP code" value={address.zipCode} /></> : <><CopyField label="LBC branch" value={cleanLine(pickup.branchName)} /><CopyField label="Branch address" value={cleanLine(pickup.branchAddress)} /></>}</div>
              </section>
            </div>
          ) : <p className="state-message">No saved location is available for this shipping method.</p>}
        </section>
      </div>
    </div>
  );
}
