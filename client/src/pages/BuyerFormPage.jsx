import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { buildBuyerPayload } from '../utils/buyerPayload.js';
import { getBuyer, saveBuyer } from '../lib/buyers.js';
import { applyAssistantEdit, editedDeliveryMethod } from '../utils/assistantEdit.js';

const emptyAddress = () => ({ street: '', barangay: '', city: '', province: '', zipCode: '', isDefault: false });
const emptyPickup = () => ({ branchName: '', branchAddress: '', isDefault: false });
const emptyBuyer = () => ({ name: '', phone: '', preferredCourier: 'LBC', addresses: [{ ...emptyAddress(), isDefault: true }], pickups: [] });

function buyerFromAssistantDraft(draft) {
  if (!draft) return emptyBuyer();
  const courier = draft.preferredCourier === 'J&T Express' ? 'J&T Express' : 'LBC';
  const method = courier === 'J&T Express' ? 'door' : draft.deliveryMethod === 'door' ? 'door' : 'pickup';
  return {
    name: String(draft.name ?? ''),
    phone: String(draft.phone ?? ''),
    preferredCourier: courier,
    addresses: method === 'door' ? [{ ...emptyAddress(), ...Object.fromEntries(Object.keys(emptyAddress()).filter((field) => field !== 'isDefault').map((field) => [field, String(draft.address?.[field] ?? '')])), isDefault: true }] : [],
    pickups: method === 'pickup' ? [{ ...emptyPickup(), branchName: String(draft.branchName ?? ''), branchAddress: String(draft.branchAddress ?? ''), isDefault: true }] : [],
  };
}

function draftDeliveryMethod(draft) {
  return draft && draft.preferredCourier !== 'J&T Express' && draft.deliveryMethod !== 'door' ? 'pickup' : 'door';
}

const addressFields = [
  ['street', 'Street / building'], ['barangay', 'Barangay'], ['city', 'City / municipality'],
  ['province', 'Province'], ['zipCode', 'ZIP code'],
];
const pickupFields = [
  ['branchName', 'LBC branch name'], ['branchAddress', 'Complete branch address'],
];

const addressAutocomplete = { street: 'street-address', barangay: 'address-level3', city: 'address-level2', province: 'address-level1', zipCode: 'postal-code' };

function FieldError({ id, children }) {
  if (!children) return null;
  return <span className="field-error" id={id}>{children}</span>;
}

function LocationEditor({ title, description, type, items, setItems, fields, createItem, required, errors }) {
  const singular = type === 'addresses' ? 'address' : 'pickup location';
  const addLabel = type === 'addresses' ? 'Add address' : 'Add pickup location';
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
        <button type="button" className="button button-secondary" onClick={() => setItems([...items, { ...createItem(), isDefault: items.length === 0 }])}><Plus size={17} aria-hidden="true" />{addLabel}</button>
      </div>
      <FieldError id={`${type}-error`}>{errors[type] ?? errors.locations}</FieldError>
      {items.length === 0 && <p className="state-message">No {type === 'addresses' ? 'addresses' : 'pickup locations'} added.</p>}
      <div className="location-list">
        {items.map((item, index) => (
          <fieldset className="location-card" key={item.id ?? `${type}-${index}`}>
            <legend>{singular[0].toUpperCase() + singular.slice(1)} {index + 1}</legend>
            <div className="form-grid">
              {fields.map(([field, label]) => (
                <label className={field === 'branchAddress' || field === 'street' ? 'wide-field' : ''} key={field}>
                  <span>{label}</span>
                  <input required name={`${type}.${index}.${field}`} autoComplete={type === 'addresses' ? addressAutocomplete[field] : 'off'} maxLength={field === 'zipCode' ? 10 : 160} value={item[field]} onChange={(event) => update(index, field, event.target.value)} aria-invalid={Boolean(errors[`${type}.${index}.${field}`])} aria-describedby={errors[`${type}.${index}.${field}`] ? `${type}-${index}-${field}-error` : undefined} />
                  <FieldError id={`${type}-${index}-${field}-error`}>{errors[`${type}.${index}.${field}`]}</FieldError>
                </label>
              ))}
            </div>
            <div className="location-actions">
              {items.length > 1 ? <label className="radio-label"><input type="radio" name={`default-${type}`} checked={item.isDefault} onChange={() => makeDefault(index)} /> Default {singular}</label> : <span className="primary-location">Primary {singular}</span>}
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
  const location = useLocation();
  const navigate = useNavigate();
  const isEditing = Boolean(buyerId);
  const assistantDraft = !isEditing ? location.state?.buyerDraft : null;
  const [buyer, setBuyer] = useState(() => buyerFromAssistantDraft(assistantDraft));
  const [deliveryMethod, setDeliveryMethod] = useState(draftDeliveryMethod(assistantDraft));
  const [status, setStatus] = useState(isEditing ? 'loading' : 'ready');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);

  useEffect(() => {
    if (isEditing) return;
    setBuyer(buyerFromAssistantDraft(location.state?.buyerDraft));
    setDeliveryMethod(draftDeliveryMethod(location.state?.buyerDraft));
    setStatus('ready');
    setMessage('');
    setErrors({});
  }, [isEditing, location.key]);

  useEffect(() => {
    if (!isEditing) return undefined;
    const controller = new AbortController();
    getBuyer(buyerId)
      .then((data) => {
        if (!data) throw new Error('Buyer could not be loaded.');
        if (controller.signal.aborted) return;
        const editDraft = location.state?.editDraft;
        setBuyer(applyAssistantEdit(data, editDraft));
        setDeliveryMethod(editedDeliveryMethod(data, editDraft));
        setStatus('ready');
      })
      .catch((error) => { if (error.name !== 'AbortError') { setMessage(error.message); setStatus('error'); } });
    return () => controller.abort();
  }, [buyerId, isEditing, location.key]);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    const nextErrors = {};
    if (!buyer.name.trim()) nextErrors.name = 'Enter the buyer’s name.';
    if (!/^\d{7,15}$/.test(buyer.phone.replace(/\D/g, ''))) nextErrors.phone = 'Enter a valid phone number.';
    const locationType = deliveryMethod === 'pickup' ? 'pickups' : 'addresses';
    const fields = deliveryMethod === 'pickup' ? pickupFields : addressFields;
    if (!buyer[locationType].length) nextErrors.locations = 'Add a delivery location.';
    buyer[locationType].forEach((item, index) => {
      fields.forEach(([field, label]) => {
        if (!String(item[field] ?? '').trim()) nextErrors[`${locationType}.${index}.${field}`] = `Enter ${label.toLowerCase()}.`;
      });
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setMessage('Complete the highlighted details before saving.');
      window.requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    setStatus('saving');
    try {
      const payload = buildBuyerPayload(buyer, deliveryMethod);
      const result = await saveBuyer(payload, isEditing ? buyerId : undefined);
      if (!result) throw new Error('The save could not be verified. Please check the buyer directory before trying again.');
      navigate(`/buyers/${result.id}`, { replace: true, state: { saved: isEditing ? 'updated' : 'created' } });
    } catch (error) {
      setMessage(error.message);
      setStatus('error');
      window.requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
    }
  }

  function changeCourier(preferredCourier) {
    setErrors({});
    setBuyer({ ...buyer, preferredCourier, addresses: buyer.addresses.length ? buyer.addresses : [{ ...emptyAddress(), isDefault: true }] });
    if (preferredCourier === 'J&T Express') setDeliveryMethod('door');
  }

  if (status === 'loading') return <div className="page"><p className="state-message">Loading buyer form…</p></div>;

  return (
    <div className="page form-page">
      <Link className="back-link" to={isEditing ? `/buyers/${buyerId}` : '/'}><ArrowLeft size={16} aria-hidden="true" />{isEditing ? 'Buyer details' : 'Buyer directory'}</Link>
      <div className="form-title"><h1>{isEditing ? `Update ${buyer.name}` : 'Add a buyer'}</h1><p>Keep contact and delivery details accurate so every parcel is ready for dispatch.</p></div>
      {(assistantDraft || location.state?.editDraft) && <div className="draft-review" role="status">
        <p>{location.state?.draftNotice || 'Review the details extracted from the buyer’s message before saving.'}</p>
        <div className="draft-review-links">
          {location.state?.draftSourceUrl && <a href={location.state.draftSourceUrl} target="_blank" rel="noopener noreferrer">View source</a>}
          {location.state?.draftGoogleSearchUrl && <a href={location.state.draftGoogleSearchUrl} target="_blank" rel="noopener noreferrer">Check branch on Google</a>}
        </div>
        {location.state?.draftGoogleSearchUrl && <small>Google search includes branch details only, not the buyer’s name or phone.</small>}
      </div>}
      <form ref={formRef} onSubmit={submit} noValidate>
        <section className="panel form-section">
          <div className="section-heading"><div><h2>Buyer information</h2><p>Contact and courier preference.</p></div></div>
          <div className="form-grid">
            <label><span>Full name</span><input required name="name" autoComplete="name" maxLength="120" value={buyer.name} onChange={(event) => setBuyer({ ...buyer, name: event.target.value })} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} /><FieldError id="name-error">{errors.name}</FieldError></label>
            <label><span>Phone number</span><input required name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength="32" placeholder="Example: 0917 123 4567" value={buyer.phone} onChange={(event) => setBuyer({ ...buyer, phone: event.target.value })} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'phone-hint phone-error' : 'phone-hint'} /><small className="field-hint" id="phone-hint">Spaces and punctuation are removed when saved.</small><FieldError id="phone-error">{errors.phone}</FieldError></label>
            <label><span>Preferred courier</span><select name="preferredCourier" value={buyer.preferredCourier} onChange={(event) => changeCourier(event.target.value)} aria-invalid={Boolean(errors.preferredCourier)} aria-describedby={errors.preferredCourier ? 'courier-error' : undefined}><option value="LBC">LBC</option><option value="J&T Express">J&amp;T Express</option></select><FieldError id="courier-error">{errors.preferredCourier}</FieldError></label>
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
          <LocationEditor title={buyer.preferredCourier === 'J&T Express' ? 'J&T delivery address' : 'LBC door-to-door address'} description="Name and phone will be taken from the buyer information above." type="addresses" items={buyer.addresses} setItems={(addresses) => setBuyer({ ...buyer, addresses })} fields={addressFields} createItem={emptyAddress} required errors={errors} />
        ) : (
          <LocationEditor title="LBC branch pickup" description="Choose the branch where this buyer will collect the parcel. Name and phone come from above." type="pickups" items={buyer.pickups} setItems={(pickups) => setBuyer({ ...buyer, pickups })} fields={pickupFields} createItem={emptyPickup} required errors={errors} />
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
