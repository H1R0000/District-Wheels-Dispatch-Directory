import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import logoUrl from '../../../images/dcw_logo.png';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';

export default function AppHeader() {
  const profile = useAppAuth();
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem('dcw-theme', nextTheme);
    setTheme(nextTheme);
  }

  return (
    <header className="app-header">
      <Link className="brand" to="/" aria-label="District Wheels buyer directory">
        <span className="brand-logo-frame" aria-hidden="true"><img className="brand-logo" src={logoUrl} alt="" /></span>
      </Link>
      <div className="header-actions">
        <span className="app-name">Dispatch directory</span>
        {profile?.is_demo && <strong className="demo-badge">DEMO MODE</strong>}
        {supabase && <button className="header-text-button" type="button" onClick={() => supabase.auth.signOut()}><LogOut size={16} aria-hidden="true" />Sign out</button>}
        <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
