import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Archive, LogOut, Menu, Moon, Sun, UsersRound, X } from 'lucide-react';
import logoUrl from '../../../images/dcw_logo.png';
import { supabase } from '../lib/supabase.js';
import { useAppAuth } from '../lib/AuthContext.jsx';
import { canAccessOwnerBackup, currentNavigationSection } from '../utils/navigation.js';

export default function AppHeader() {
  const profile = useAppAuth();
  const { pathname } = useLocation();
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const isOwner = canAccessOwnerBackup(profile);
  const currentSection = currentNavigationSection(pathname);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function onPointerDown(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem('dcw-theme', nextTheme);
    setTheme(nextTheme);
  }

  function navLink(to, label, section, Icon) {
    const active = currentSection === section;
    return <Link key={to} className={`app-nav-link${active ? ' is-active' : ''}${section === 'backup' ? ' app-nav-secondary' : ''}`} to={to}
      aria-current={active ? pathname === to ? 'page' : 'location' : undefined} onClick={() => setMenuOpen(false)}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </Link>;
  }

  const links = [
    navLink('/', 'Buyer Directory', 'directory', UsersRound),
    ...(isOwner ? [navLink('/owner/backup', 'Owner Backup', 'backup', Archive)] : []),
  ];

  return (
    <header className="app-header" ref={headerRef}
      onBlur={(event) => { if (menuOpen && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }}>
      <Link className="brand" to="/" aria-label="District Wheels buyer directory">
        <span className="brand-logo-frame" aria-hidden="true"><img className="brand-logo" src={logoUrl} alt="" /></span>
      </Link>
      <nav className="desktop-nav" aria-label="Primary navigation">{links}</nav>
      <div className="header-actions">
        {profile?.is_demo && <strong className="demo-badge">DEMO MODE</strong>}
        <button className="theme-toggle desktop-account-control" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        {supabase && <button className="header-text-button header-signout desktop-account-control" type="button" onClick={() => supabase.auth.signOut()}><LogOut size={16} aria-hidden="true" />Sign out</button>}
        <button ref={menuButtonRef} className="mobile-menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation">
          {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
      </div>
      <nav className="mobile-nav" id="mobile-navigation" aria-label="Primary navigation" hidden={!menuOpen}>
        {links}
        <div className="mobile-nav-account">
          {profile?.is_demo && <p className="mobile-demo-status"><strong>Demo mode</strong><span>Shared sample buyers</span></p>}
          <button type="button" className="mobile-nav-action" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          {supabase && <button type="button" className="mobile-nav-action" onClick={() => supabase.auth.signOut()}><LogOut size={18} aria-hidden="true" />Sign out</button>}
        </div>
      </nav>
    </header>
  );
}
