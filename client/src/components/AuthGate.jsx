import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';
import { AuthContext } from '../lib/AuthContext.jsx';
import logoUrl from '../../../images/dcw_logo.png';

function withinTimeout(promise, message) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      window.setTimeout(() => reject(new Error(message)), 8000);
    }),
  ]);
}

function hasOAuthMethod(accessToken) {
  try {
    const encoded = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(window.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return claims.amr?.some((entry) => entry.method === 'oauth') === true;
  } catch {
    return false;
  }
}

function AuthStatus({ title, detail, loading = false }) {
  return <main className="auth-screen">
    <section className="auth-card auth-state-card" aria-labelledby="auth-status-heading" role={loading ? 'status' : undefined} aria-live={loading ? 'polite' : undefined}>
      <div className="auth-brand"><img src={logoUrl} alt="District Wheels" /></div>
      <h1 id="auth-status-heading">{title}</h1>
      <p>{detail}</p>
      {loading && <div className="auth-progress" aria-hidden="true"><span /></div>}
    </section>
  </main>;
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [signingIn, setSigningIn] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let cancelled = false;
    withinTimeout(supabase.auth.getSession(), 'Session check timed out. Check your connection and reload.')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setMessage('Could not restore your session. Please sign in again.');
        setSession(data?.session ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(error.message);
        setSession(null);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === undefined) return undefined;
    if (!supabase || !session) {
      setProfile(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    if (profile?.id !== session.user.id) setLoading(true);
    (async () => {
      try {
        const { data: auth, error: authError } = await withinTimeout(
          supabase.auth.getUser(), 'Account check timed out. Check your connection and reload.',
        );
        if (authError || !auth?.user) throw new Error('Your session could not be verified. Please sign in again.');
        const user = auth.user;
        const { data: row, error: profileError } = await withinTimeout(
          supabase.from('profiles').select('id,role,is_demo,github_provider_id').eq('id', user.id).maybeSingle(),
          'Access check timed out. Check your connection and reload.',
        );
        if (profileError) throw new Error('Access setup is incomplete. The Supabase profile migration may not be applied.');
        const valid = row?.id === user.id && (
          (row.role === 'owner' && row.is_demo === false && Boolean(row.github_provider_id) && hasOAuthMethod(session.access_token)) ||
          (row.role === 'demo' && row.is_demo === true && !row.github_provider_id)
        );
        if (!valid) throw new Error('This account is not approved for the directory.');
        if (!cancelled) setProfile(row);
      } catch (error) {
        if (cancelled) return;
        setProfile(null);
        setMessage(error.message);
        void supabase.auth.signOut({ scope: 'local' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  async function signInWithGitHub() {
    setSigningIn('github');
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(error.message);
      setSigningIn(null);
    }
  }

  async function enterDemo() {
    setSigningIn('demo');
    setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('demo-session', { body: {} });
      if (error || !data?.access_token || !data?.refresh_token) throw new Error('Demo sign-in is unavailable.');
      const result = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (result.error) throw result.error;
    } catch (error) {
      setMessage(error.message || 'Demo sign-in is unavailable.');
    } finally {
      setSigningIn(null);
    }
  }

  if (!isSupabaseConfigured) return <AuthStatus title="Sign-in unavailable" detail="Directory authentication is not configured." />;
  if (loading) return <AuthStatus title="Checking your access" detail="This should only take a moment." loading />;
  if (session && profile?.id === session.user.id) return <AuthContext.Provider value={profile}>{children}</AuthContext.Provider>;

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="sign-in-heading">
        <div className="auth-brand"><img src={logoUrl} alt="District Wheels" /></div>
        <h1 id="sign-in-heading">Sign in securely</h1>
        <p className="auth-intro">Continue with the approved H1R0000 GitHub account. No authentication email is required.</p>
        <button className="button button-primary auth-provider-button" type="button" onClick={signInWithGitHub} disabled={Boolean(signingIn)}>{signingIn === 'github' ? 'Opening GitHub…' : 'Continue with GitHub'}</button>
        <div className="auth-divider"><span>or</span></div>
        <button className="button button-secondary auth-provider-button" type="button" onClick={enterDemo} disabled={Boolean(signingIn)}>{signingIn === 'demo' ? 'Opening demo…' : 'Enter Demo'}</button>
        <p className="auth-demo-note">Explore editable sample records. Changes are shared with other demo visitors and may be reset.</p>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
