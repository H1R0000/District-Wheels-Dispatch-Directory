import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';

const emptyAddress = () => ({ street: '', barangay: '', city: '', province: '', zipCode: '', isDefault: false });
const emptyPickup = () => ({ branchName: '', branchAddress: '', isDefault: false });
const emptyBuyer = () => ({ name: '', phone: '', preferredCourier: 'LBC', addresses: [{ ...emptyAddress(), isDefault: true }], pickups: [] });

const addressFields = [
  ['street', 'Street / building'], ['barangay', 'Barangay'], ['city', 'City / municipality'],
  ['province', 'Province'], ['zipCode', 'ZIP code'],
];
const pickupFields = [
  ['branchName', 'LBC branch name'], ['branchAddress', 'Complete branch address'],
];

function LocationEditor({ title, description, type, items, setItems, fields, createItem, required }) {
  const singular = type === 'addresses' ? 'address' : 'pickup location';
  function update(index, field, value) {
    setItems(items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function makeDefault(index) {
    setItems(items.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === index })));
  }

  function remove(index) {
    const next = items.filter((_item, itemIndex) => itemIndex !== index);
    if (next.length > 0 && !next.some((item) => item.isDefault)) next[0] = { ...next[0], isDefault: true };
    setItems(next);
  }

  return (
    <section className="panel form-section">
      <div className="section-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
        <button type="button" className="button button-secondary" onClick={() => setItems([...items, { ...createItem(), isDefault: items.length === 0 }])}><Plus size={17} aria-hidden="true" />Add</button>
      </div>
      {items.length === 0 && <p className="state-message">No {type === 'addresses' ? 'addresses' : 'pickup locations'} added.</p>}
      <div className="location-list">
        {items.map((item, index) => (
          <fieldset className="location-card" key={item.id ?? `${type}-${index}`}>
            <legend>{singular[0].toUpperCase() + singular.slice(1)} {index + 1}</legend>
            <div className="form-grid">
              {fields.map(([field, label]) => (
                <label className={field === 'branchAddress' || field === 'street' ? 'wide-field' : ''} key={field}>
                  <span>{label}</span>
                  <input required value={item[field]} onChange={(event) => update(index, field, event.target.value)} />
                </label>
              ))}
            </div>
            <div className="location-actions">
              <label className="radio-label"><input type="radio" name={`default-${type}`} checked={item.isDefault} onChange={() => makeDefault(index)} /> Default {singular}</label>
              <button type="button" className="text-button danger-text" onClick={() => remove(index)} disabled={required && items.length === 1}><Trash2 size={15} aria-hidden="true" />Remove</button>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

export default function BuyerFormPage() {
  const { buyerId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(buyerId);
  const [buyer, setBuyer] = useState(emptyBuyer);
  const [deliveryMethod, setDeliveryMethod] = useState('door');
  const [status, setStatus] = useState(isEditing ? 'loading' : 'ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isEditing) return undefined;
    const controller = new AbortController();
    fetch(`/api/buyers/${buyerId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Buyer could not be loaded.');
        return response.json();
      })
      .then((data) => {
        setBuyer(data);
        setDeliveryMethod(data.preferredCourier === 'LBC' && data.addresses.length === 0 && data.pickups.length > 0 ? 'pickup' : 'door');
        setStatus('ready');
      })
      .catch((error) => { if (error.name !== 'AbortError') { setMessage(error.message); setStatus('error'); } });
    return () => controller.abort();
  }, [buyerId, isEditing]);

  async function submit(event) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const payload = {
        ...buyer,
        addresses: deliveryMethod === 'door' ? buyer.addresses : [],
        pickups: buyer.preferredCourier === 'LBC' && deliveryMethod === 'pickup' ? buyer.pickups : [],
      };
      const response = await fetch(isEditing ? `/api/buyers/${buyerId}` : '/api/buyers', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'The buyer could not be saved.');
      navigate(`/buyers/${result.id}`, { replace: true });
    } catch (error) {
      setMessage(error.message);
      setStatus('error');
    }
  }

  if (status === 'loading') return <div className="page"><p className="state-message">Loading buyer form…</p></div>;

  return (
    <div className="page form-page">
      <Link className="back-link" to={isEditing ? `/buyers/${buyerId}` : '/'}><ArrowLeft size={16} aria-hidden="true" />{isEditing ? 'Buyer details' : 'Buyer directory'}</Link>
      <div className="form-title"><h1>{isEditing ? `Update ${buyer.name}` : 'Add a buyer'}</h1><p>Use fictional information for development and demonstrations.</p></div>
      <form onSubmit={submit}>
        <section className="panel form-section">
          <div className="section-heading"><div><h2>Buyer information</h2><p>Contact and courier preference.</p></div></div>
          <div className="form-grid">
            <label><span>Full name</span><input required value={buyer.name} onChange={(event) => setBuyer({ ...buyer, name: event.target.value })} /></label>
            <label><span>Phone number</span><input required inputMode="tel" value={buyer.phone} onChange={(event) => setBuyer({ ...buyer, phone: event.target.value })} /></label>
            <label><span>Preferred courier</span><select value={buyer.preferredCourier} onChange={(event) => { const preferredCourier = event.target.value; setBuyer({ ...buyer, preferredCourier, addresses: buyer.addresses.length ? buyer.addresses : [{ ...emptyAddress(), isDefault: true }] }); if (preferredCourier === 'J&T Express') setDeliveryMethod('door'); }}><option value="LBC">LBC</option><option value="J&T Express">J&amp;T Express</option></select></label>
          </div>
        </section>

        {buyer.preferredCourier === 'LBC' && (
          <fieldset className="panel form-section delivery-choice">
            <legend>How will LBC deliver this buyer’s orders?</legend>
            <div className="choice-grid">
              <label className={deliveryMethod === 'door' ? 'selected' : ''}><input type="radio" name="deliveryMethod" value="door" checked={deliveryMethod === 'door'} onChange={() => { setDeliveryMethod('door'); if (buyer.addresses.length === 0) setBuyer({ ...buyer, addresses: [{ ...emptyAddress(), isDefault: true }] }); }} /><span><strong>Door to door</strong><small>Deliver to the buyer’s complete address.</small></span></label>
              <label className={deliveryMethod === 'pickup' ? 'selected' : ''}><input type="radio" name="deliveryMethod" value="pickup" checked={deliveryMethod === 'pickup'} onChange={() => { setDeliveryMethod('pickup'); if (buyer.pickups.length === 0) setBuyer({ ...buyer, pickups: [{ ...emptyPickup(), isDefault: true }] }); }} /><span><strong>Branch pickup</strong><small>Send the parcel to a selected LBC branch.</small></span></label>
            </div>
          </fieldset>
        )}

        {deliveryMethod === 'door' ? (
          <LocationEditor title={buyer.preferredCourier === 'J&T Express' ? 'J&T delivery address' : 'LBC door-to-door address'} description="Name and phone will be taken from the buyer information above." type="addresses" items={buyer.addresses} setItems={(addresses) => setBuyer({ ...buyer, addresses })} fields={addressFields} createItem={emptyAddress} required />
        ) : (
          <LocationEditor title="LBC branch pickup" description="Choose the branch where this buyer will collect the parcel. Name and phone come from above." type="pickups" items={buyer.pickups} setItems={(pickups) => setBuyer({ ...buyer, pickups })} fields={pickupFields} createItem={emptyPickup} required />
        )}

        {message && <p className="form-error" role="alert">{message}</p>}
        <div className="form-actions">
          <Link className="button button-secondary" to={isEditing ? `/buyers/${buyerId}` : '/'}>Cancel</Link>
          <button className="button button-primary" type="submit" disabled={status === 'saving'}><Save size={17} aria-hidden="true" />{status === 'saving' ? 'Saving…' : isEditing ? 'Save changes' : 'Create buyer'}</button>
        </div>
      </form>
    </div>
  );
}
