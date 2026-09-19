import { Link, Route, Routes } from 'react-router-dom';
import BuyerDetailsPage from './pages/BuyerDetailsPage.jsx';
import BuyerDirectoryPage from './pages/BuyerDirectoryPage.jsx';
import BuyerFormPage from './pages/BuyerFormPage.jsx';
import AppHeader from './components/AppHeader.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        <Routes>
          <Route path="/" element={<BuyerDirectoryPage />} />
          <Route path="/buyers/new" element={<BuyerFormPage />} />
          <Route path="/buyers/:buyerId" element={<BuyerDetailsPage />} />
          <Route path="/buyers/:buyerId/edit" element={<BuyerFormPage />} />
          <Route path="*" element={<div className="page"><h1>Page not found</h1><Link to="/">Return to directory</Link></div>} />
        </Routes>
      </main>
    </div>
  );
}
