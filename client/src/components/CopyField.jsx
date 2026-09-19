import { useEffect, useState } from 'react';

export default function CopyField({ label, value }) {
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(''), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied');
    } catch {
      setStatus('Copy failed');
    }
  }

  return (
    <div className="copy-field">
      <div>
        <span className="field-label">{label}</span>
        <span className="field-value">{value}</span>
      </div>
      <div className="copy-action">
        <button type="button" className="button button-secondary" onClick={copyValue}>Copy</button>
        <span className="copy-status" aria-live="polite">{status}</span>
      </div>
    </div>
  );
}
