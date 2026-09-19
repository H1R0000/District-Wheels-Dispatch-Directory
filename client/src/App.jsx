import { Link, Route, Routes } from 'react-router-dom';
import BuyerDetailsPage from './pages/BuyerDetailsPage.jsx';
import BuyerDirectoryPage from './pages/BuyerDirectoryPage.jsx';

function AppHeader() {
  return (
    <header className="app-header">
      <Link className="brand" to="/" aria-label="District Wheels buyer directory">
        <span className="brand-mark" aria-hidden="true">DW</span>
        <span>
          <strong>District Wheels</strong>
          <small>Dispatch Directory</small>
        </span>
      </Link>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        <Routes>
          <Route path="/" element={<BuyerDirectoryPage />} />
          <Route path="/buyers/:buyerId" element={<BuyerDetailsPage />} />
          <Route path="*" element={<div className="page"><h1>Page not found</h1><Link to="/">Return to directory</Link></div>} />
        </Routes>
      </main>
    </div>
  );
}
