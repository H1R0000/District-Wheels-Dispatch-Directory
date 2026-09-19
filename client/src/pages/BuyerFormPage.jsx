import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const emptyAddress = () => ({ recipientName: '', recipientPhone: '', street: '', barangay: '', city: '', province: '', zipCode: '', isDefault: false });
const emptyPickup = () => ({ recipientName: '', recipientPhone: '', branchName: '', branchAddress: '', isDefault: false });
const emptyBuyer = () => ({ name: '', phone: '', preferredCourier: 'LBC', addresses: [{ ...emptyAddress(), isDefault: true }], pickups: [] });

const addressFields = [
  ['recipientName', 'Recipient name'], ['recipientPhone', 'Recipient phone'], ['street', 'Street / building'],
  ['barangay', 'Barangay'], ['city', 'City / municipality'], ['province', 'Province'], ['zipCode', 'ZIP code'],
];
const pickupFields = [
  ['recipientName', 'Recipient name'], ['recipientPhone', 'Recipient phone'], ['branchName', 'LBC branch name'], ['branchAddress', 'Branch address'],
];

function LocationEditor({ title, type, items, setItems, fields, createItem, required }) {
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
        <div><h2>{title}</h2><p>{required ? 'At least one is required.' : 'Optional; used for LBC branch pickup.'}</p></div>
        <button type="button" className="button button-secondary" onClick={() => setItems([...items, { ...createItem(), isDefault: items.length === 0 }])}>+ Add</button>
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
              <button type="button" className="text-button danger-text" onClick={() => remove(index)} disabled={required && items.length === 1}>Remove</button>
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
      .then((data) => { setBuyer(data); setStatus('ready'); })
      .catch((error) => { if (error.name !== 'AbortError') { setMessage(error.message); setStatus('error'); } });
    return () => controller.abort();
  }, [buyerId, isEditing]);

  async function submit(event) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch(isEditing ? `/api/buyers/${buyerId}` : '/api/buyers', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buyer),
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
      <Link className="back-link" to={isEditing ? `/buyers/${buyerId}` : '/'}>← {isEditing ? 'Buyer details' : 'Buyer directory'}</Link>
      <div className="form-title"><h1>{isEditing ? `Update ${buyer.name}` : 'Add a buyer'}</h1><p>Use fictional information for development and demonstrations.</p></div>
      <form onSubmit={submit}>
        <section className="panel form-section">
          <div className="section-heading"><div><h2>Buyer information</h2><p>Contact and courier preference.</p></div></div>
          <div className="form-grid">
            <label><span>Full name</span><input required value={buyer.name} onChange={(event) => setBuyer({ ...buyer, name: event.target.value })} /></label>
            <label><span>Phone number</span><input required inputMode="tel" value={buyer.phone} onChange={(event) => setBuyer({ ...buyer, phone: event.target.value })} /></label>
            <label><span>Preferred courier</span><select value={buyer.preferredCourier} onChange={(event) => setBuyer({ ...buyer, preferredCourier: event.target.value })}><option>LBC</option><option>J&amp;T Express</option></select></label>
          </div>
        </section>

        <LocationEditor title="Addresses" type="addresses" items={buyer.addresses} setItems={(addresses) => setBuyer({ ...buyer, addresses })} fields={addressFields} createItem={emptyAddress} required />
        <LocationEditor title="LBC pickup locations" type="pickups" items={buyer.pickups} setItems={(pickups) => setBuyer({ ...buyer, pickups })} fields={pickupFields} createItem={emptyPickup} />

        {message && <p className="form-error" role="alert">{message}</p>}
        <div className="form-actions">
          <Link className="button button-secondary" to={isEditing ? `/buyers/${buyerId}` : '/'}>Cancel</Link>
          <button className="button button-primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? 'Saving…' : isEditing ? 'Save changes' : 'Create buyer'}</button>
        </div>
      </form>
    </div>
  );
}
