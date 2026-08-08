'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, UserRole } from '@/lib/auth';
import { SlidersHorizontal, TrendingUp, Truck, Settings, TriangleAlert, ArrowRight, type LucideIcon } from 'lucide-react';
import OfficialUtilityBar from '@/components/OfficialUtilityBar';
import SiteFooter from '@/components/SiteFooter';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function setCookie(name: string, value: string, maxAgeSeconds = 86400) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

const ROLES: { key: UserRole; icon: LucideIcon; label: string; desc: string }[] = [
  { key: 'CONTROLLER',  icon: SlidersHorizontal, label: 'Section Controller',    desc: 'Live track map, conflict resolution' },
  { key: 'SUPERVISOR',  icon: TrendingUp,        label: 'Traffic Supervisor',     desc: 'Aggregate KPIs, multi-section view' },
  { key: 'LOGISTICS',   icon: Truck,             label: 'Logistics Operator',     desc: 'Freight scheduling, cargo ETAs' },
  { key: 'ADMIN',       icon: Settings,          label: 'System Administrator',   desc: 'Users, config, system health' },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<UserRole>('CONTROLLER');
  const [email, setEmail] = useState('controller@demo.rail');
  const [password, setPassword] = useState('demo1234');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const { login, isLoading, error } = useAuth();
  const router = useRouter();

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setEmail(`${role.toLowerCase()}@demo.rail`);
    setPassword('demo1234');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login({ email: email || `${selectedRole.toLowerCase()}@demo.rail`, password: password || 'demo1234', role: selectedRole });
  };

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    setGoogleError(null);

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
    if (!clientId) {
      setGoogleError('Google Sign-In is not configured (missing NEXT_PUBLIC_GOOGLE_CLIENT_ID).');
      setGoogleLoading(false);
      return;
    }

    // Dynamically load the Google Identity Services script
    const loadGsi = () => new Promise<void>((resolve, reject) => {
      if (typeof (window as any).google !== 'undefined') { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });

    loadGsi()
      .then(() => {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            try {
              const res = await fetch(`${API_URL}/api/auth/google-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: response.credential }),
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Google sign-in failed' }));
                throw new Error(err.detail ?? 'Google sign-in failed');
              }

              const data = await res.json();
              const { access_token, user: apiUser } = data;

              // Same cookie logic as auth.tsx login()
              setCookie('railtrack_token', access_token, 86400);
              setCookie('rt_role', apiUser.role, 86400);

              // Same role-based routing as auth.tsx login()
              switch (apiUser.role as UserRole) {
                case 'CONTROLLER': router.push('/dashboard/controller'); break;
                case 'SUPERVISOR': router.push('/analytics');             break;
                case 'LOGISTICS':  router.push('/simulate');              break;
                case 'ADMIN':      router.push('/admin');                 break;
                default:           router.push('/dashboard/controller');
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Google sign-in failed';
              setGoogleError(message);
              setGoogleLoading(false);
            }
          },
        });
        (window as any).google.accounts.id.prompt();
      })
      .catch((err: Error) => {
        setGoogleError(err.message);
        setGoogleLoading(false);
      });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      <OfficialUtilityBar />
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
      }}>
      {/* Background grid lines */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.7 }} />

      <div id="main-content" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '520px' }}>
        {/* Formal Masthead */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Ministry of Railways &middot; Problem Statement 25022
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span className="signal-lamp signal-lamp-green" style={{ width: '16px', height: '16px' }} />
            <span style={{ fontFamily: 'var(--font-headline)', fontSize: '28px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '-0.03em' }}>
              RAILTRACK AI
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.04em' }}>
            Decision Support System for Section Traffic Control
          </div>
        </div>

        {/* Login Card */}
        <div className="card-elevated" style={{ padding: '36px', borderRadius: 'var(--radius-md)' }}>
          {/* Role selector */}
          <div style={{ marginBottom: '28px' }}>
            <div className="panel-header" style={{ marginBottom: '12px' }}>Select Controller Role</div>
            <div className="grid-2col-responsive" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {ROLES.map(role => (
                <button key={role.key}
                  type="button"
                  onClick={() => handleRoleSelect(role.key)}
                  style={{
                    background: selectedRole === role.key ? '#EBF3FA' : '#FFFFFF',
                    border: `1.5px solid ${selectedRole === role.key ? 'var(--accent-primary)' : 'var(--bg-border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: selectedRole === role.key ? '0 2px 8px rgba(26,84,144,0.12)' : 'none',
                  }}>
                  <div style={{ marginBottom: '6px', color: selectedRole === role.key ? 'var(--accent-primary)' : 'var(--text-secondary)' }}><role.icon size={20} strokeWidth={2} /></div>
                  <div style={{ fontFamily: 'var(--font-headline)', fontSize: '12.5px', fontWeight: 700, color: selectedRole === role.key ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {role.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.3' }}>
                    {role.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="login-email" style={{ display: 'block', fontFamily: 'var(--font-headline)', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                id="login-email"
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="login-password" style={{ display: 'block', fontFamily: 'var(--font-headline)', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Password
              </label>
              <input
                id="login-password"
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="badge-conflict" style={{ width: '100%', marginBottom: '16px', padding: '10px 14px', borderRadius: 'var(--radius-xs)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TriangleAlert size={14} strokeWidth={2.25} /> {error}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '15px', padding: '12px', borderRadius: 'var(--radius-sm)' }} disabled={isLoading}>
              {isLoading ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #FFFFFF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Authenticating...
                </>
              ) : <>Sign In to Dashboard <ArrowRight size={16} strokeWidth={2.25} /></>}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '22px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--bg-border)' }} />
            <span style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--bg-border)' }} />
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="btn-ghost"
            style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: '14px',
              padding: '11px',
              borderRadius: 'var(--radius-sm)',
              gap: '10px',
              opacity: googleLoading ? 0.7 : 1,
            }}
          >
            {googleLoading ? (
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Sign in with Google
          </button>

          {/* Google auth error */}
          {googleError && (
            <div className="badge-conflict" style={{ width: '100%', marginTop: '12px', padding: '10px 14px', borderRadius: 'var(--radius-xs)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TriangleAlert size={13} strokeWidth={2.25} /> {googleError}
            </div>
          )}

          {/* Demo hint */}
          <div style={{ marginTop: '20px', padding: '14px', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, color: '#B78103', letterSpacing: '0.05em', marginBottom: '4px' }}>
              DEMO ACCESS CREDENTIALS
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: 'var(--text-primary)' }}>
              Email: <strong>{selectedRole.toLowerCase()}@demo.rail</strong><br />
              Password: <strong>demo1234</strong>
            </div>
          </div>
        </div>
      </div>
      </div>
      <SiteFooter />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
