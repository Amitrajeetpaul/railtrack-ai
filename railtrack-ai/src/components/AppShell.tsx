'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Home, SlidersHorizontal, Play, Settings, BarChart3, Map, type LucideIcon } from 'lucide-react';
import OfficialUtilityBar from '@/components/OfficialUtilityBar';

type ActivePage = 'dashboard' | 'simulate' | 'analytics' | 'admin' | 'live-map';

const NAV_ITEMS: { key: ActivePage; label: string; href: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard/controller', icon: SlidersHorizontal },
  { key: 'simulate',  label: 'Simulate',  href: '/simulate',             icon: Play },
  { key: 'analytics', label: 'Analytics', href: '/analytics',            icon: BarChart3 },
  { key: 'admin',     label: 'Admin',     href: '/admin',                icon: Settings },
  { key: 'live-map',  label: 'Live Map',  href: '/live-map',             icon: Map },
];

const ROLE_LABELS: Record<string, string> = {
  CONTROLLER: 'Section Controller',
  SUPERVISOR: 'Traffic Supervisor',
  LOGISTICS: 'Logistics Operator',
  ADMIN: 'System Administrator',
};

export default function AppShell({ active, children }: { active: ActivePage; children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="has-mobile-tab-bar" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <OfficialUtilityBar />
      <div className="app-shell">
        <aside className="app-nav-sidebar">
          <div style={{ padding: '20px 16px 16px' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '12px' }}>
              <span className="signal-lamp signal-lamp-green" style={{ width: '12px', height: '12px' }} />
              <span style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '-0.02em' }}>
                RAILTRACK AI
              </span>
            </Link>
            {user && (
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>
                {ROLE_LABELS[user.role] ?? user.role} · {user.section}
              </div>
            )}
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 12px' }}>
            <Link href="/" style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              textDecoration: 'none', fontFamily: 'var(--font-headline)', fontSize: '13px', fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>
              <Home size={18} strokeWidth={2} />
              Landing
            </Link>
            {NAV_ITEMS.map(item => {
              const isActive = item.key === active;
              return (
                <Link key={item.key} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  textDecoration: 'none', fontFamily: 'var(--font-headline)', fontSize: '13px', fontWeight: 600,
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  background: isActive ? 'var(--accent-primary)' : 'transparent',
                }}>
                  <item.icon size={18} strokeWidth={2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main id="main-content" className="app-shell-main">
          {children}
        </main>
      </div>

      <nav className="mobile-tab-bar">
        {NAV_ITEMS.map(item => (
          <Link key={item.key} href={item.href} className={item.key === active ? 'mobile-tab-active' : undefined}>
            <span className="mobile-tab-icon"><item.icon size={18} strokeWidth={2} /></span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
