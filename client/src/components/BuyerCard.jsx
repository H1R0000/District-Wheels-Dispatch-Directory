import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function BuyerCard({ buyer }) {
  const deliveryLabel = buyer.pickupCount > 0 && buyer.addressCount === 0
    ? 'Branch pickup'
    : buyer.addressCount > 0 && buyer.pickupCount > 0 ? 'Door or pickup' : 'Door to door';

  return (
    <li>
      <Link className="buyer-card" to={`/buyers/${buyer.id}`}>
        <span className="buyer-summary">
          <strong>{buyer.name}</strong>
          <span>{buyer.phone}</span>
        </span>
        <span className="record-detail"><small>Courier</small>{buyer.preferredCourier}</span>
        <span className="record-detail"><small>Delivery</small>{deliveryLabel}</span>
        <span className="mobile-record-detail">{buyer.preferredCourier} · {deliveryLabel}</span>
        <span className="open-label">Open record <ChevronRight size={17} strokeWidth={2} aria-hidden="true" /></span>
      </Link>
    </li>
  );
}
