import { Link } from 'react-router-dom';

export default function BuyerCard({ buyer, index }) {
  return (
    <li>
      <Link className="buyer-card" to={`/buyers/${buyer.id}`}>
        <span className="record-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className="buyer-summary">
          <strong>{buyer.name}</strong>
          <span>{buyer.phone}</span>
        </span>
        <span className="record-detail"><small>Courier</small>{buyer.preferredCourier}</span>
        <span className="record-detail"><small>Saved</small>{buyer.addressCount} address{buyer.addressCount === 1 ? '' : 'es'}{buyer.pickupCount ? `, ${buyer.pickupCount} pickup` : ''}</span>
        <span className="open-label">Open record</span>
      </Link>
    </li>
  );
}
