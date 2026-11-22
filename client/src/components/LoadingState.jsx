import { LoaderCircle } from 'lucide-react';

export function LoadingSpinner({ size = 17 }) {
  return <LoaderCircle className="loading-spinner" size={size} aria-hidden="true" />;
}

export default function LoadingState({ label, variant = 'detail' }) {
  return <div className={`loading-state loading-state-${variant}`} role="status">
    <span className="loading-label"><LoadingSpinner />{label}</span>
    <div aria-hidden="true">
      {variant === 'directory' ? <ul className="buyer-list">
        {Array.from({ length: 4 }, (_, index) => <li key={index}>
          <div className="buyer-card skeleton-card">
            <span className="skeleton-stack"><span className="skeleton skeleton-name" /><span className="skeleton skeleton-phone" /></span>
            <span className="record-detail"><span className="skeleton skeleton-short" /></span>
            <span className="record-detail"><span className="skeleton skeleton-line" /></span>
            <span className="open-label"><span className="skeleton skeleton-short" /></span>
            <span className="mobile-record-detail"><span className="skeleton skeleton-line" /></span>
          </div>
        </li>)}
      </ul> : <>
        <div className="skeleton-heading"><span className="skeleton skeleton-title" /><span className="skeleton skeleton-line" /></div>
        <div className="panel skeleton-panel">
          <span className="skeleton skeleton-name" />
          {Array.from({ length: variant === 'form' ? 4 : 6 }, (_, index) => <div className="skeleton-field" key={index}>
            <span className="skeleton skeleton-short" />
            <span className={`skeleton ${variant === 'form' ? 'skeleton-input' : 'skeleton-line'}`} />
          </div>)}
        </div>
      </>}
    </div>
  </div>;
}
