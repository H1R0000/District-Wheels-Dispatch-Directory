import { Link } from 'react-router-dom';

export default function AppHeader() {
  return (
    <header className="app-header">
      <Link className="brand" to="/" aria-label="District Wheels buyer directory">
        <span className="brand-mark" aria-hidden="true">DW</span>
        <span className="brand-name">District Wheels</span>
      </Link>
      <span className="app-name">Dispatch directory</span>
    </header>
  );
}
