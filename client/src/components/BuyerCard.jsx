import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function BuyerCard({ buyer }) {
  return (
    <li>
      <Link className="buyer-card" to={`/buyers/${buyer.id}`}>
        <span className="buyer-summary">
          <strong>{buyer.name}</strong>
          <span>{buyer.phone}</span>
        </span>
        <span className="record-detail"><small>Courier</small>{buyer.preferredCourier}</span>
        <span className="record-detail"><small>Saved</small>{buyer.addressCount} address{buyer.addressCount === 1 ? '' : 'es'}{buyer.pickupCount ? `, ${buyer.pickupCount} pickup` : ''}</span>
        <span className="open-label">Open record <ChevronRight size={17} strokeWidth={2} aria-hidden="true" /></span>
      </Link>
    </li>
  );
}
