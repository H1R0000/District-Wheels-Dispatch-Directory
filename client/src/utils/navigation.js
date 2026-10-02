export function currentNavigationSection(pathname) {
  if (pathname === '/owner/backup') return 'backup';
  if (pathname === '/' || pathname.startsWith('/buyers/')) return 'directory';
  return null;
}

export function canAccessOwnerBackup(profile) {
  return profile?.role === 'owner' && !profile.is_demo;
}
