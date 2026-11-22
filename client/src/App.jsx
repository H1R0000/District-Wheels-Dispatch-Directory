import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import BuyerDirectoryPage from './pages/BuyerDirectoryPage.jsx';
import AppHeader from './components/AppHeader.jsx';
import LoadingState from './components/LoadingState.jsx';

const BuyerDetailsPage = lazy(() => import('./pages/BuyerDetailsPage.jsx'));
const BuyerFormPage = lazy(() => import('./pages/BuyerFormPage.jsx'));
const OwnerBackupPage = lazy(() => import('./pages/OwnerBackupPage.jsx'));
const DispatchAssistant = lazy(() => import('./components/DispatchAssistant.jsx'));

export default function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        <Suspense fallback={<div className="page"><LoadingState label="Loading page…" /></div>}>
          <Routes>
            <Route path="/" element={<BuyerDirectoryPage />} />
            <Route path="/buyers/new" element={<BuyerFormPage />} />
            <Route path="/buyers/:buyerId" element={<BuyerDetailsPage />} />
            <Route path="/buyers/:buyerId/edit" element={<BuyerFormPage />} />
            <Route path="/owner/backup" element={<OwnerBackupPage />} />
            <Route path="*" element={<div className="page"><h1>Page not found</h1><Link to="/">Return to directory</Link></div>} />
          </Routes>
        </Suspense>
      </main>
      <Suspense fallback={null}><DispatchAssistant /></Suspense>
    </div>
  );
}
