'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { SlidersHorizontal, Play, BarChart3, Settings, Globe, ExternalLink } from 'lucide-react';
import OfficialUtilityBar from '@/components/OfficialUtilityBar';
import Breadcrumb from '@/components/Breadcrumb';
import SiteFooter from '@/components/SiteFooter';

export default function LiveMapPage() {
  const { isAuthReady } = useAuth();

  if (!isAuthReady) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)', flexDirection: 'column', gap: '16px',
      }}>
        <div style={{
          width: '32px', height: '32px', border: '3px solid var(--bg-border)',
          borderTopColor: 'var(--accent-primary)', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="has-mobile-tab-bar" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <OfficialUtilityBar />
      <header className="app-header-row" style={{ height: '56px', background: '#FFFFFF', borderBottom: '1.5px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="signal-lamp signal-lamp-green" style={{ width: '12px', height: '12px' }} />
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '-0.02em' }}>
            RAILTRACK AI
          </div>
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--bg-border)' }} />
        <nav className="desktop-nav-links" style={{ display: 'flex', gap: '6px', flex: 1 }}>
          {[
            { label: 'Dashboard', href: '/dashboard/controller' },
            { label: 'Simulate', href: '/simulate' },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Admin', href: '/admin' },
            { label: 'Live Map', href: '/live-map', active: true },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: '7px 14px', borderRadius: 'var(--radius-xs)', fontSize: '13px', textDecoration: 'none',
              background: item.active ? '#EBF3FA' : 'transparent',
              color: item.active ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-headline)', fontWeight: item.active ? 700 : 500, transition: 'all 0.15s ease',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main-content" className="main-content-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
        <div style={{ marginBottom: '16px' }}>
          <Breadcrumb items={[{ label: 'Live Map' }]} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={18} strokeWidth={2.25} style={{ color: 'var(--accent-primary)' }} />
            Live National Reference Map
          </h3>
          <div style={{
            padding: '12px 16px', background: 'rgba(148,163,184,0.1)', border: '1px solid var(--bg-border)',
            borderRadius: 'var(--radius-xs)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5,
          }}>
            This is an <strong>external, third-party live map</strong> — not part of RailTrack AI. It's embedded here
            for national-scale visual context only: it shows every live train across India, but it isn't connected
            to our OR-Tools solver, conflict detection, or any of our own algorithm output (browser security prevents
            reading data out of an embedded page from a different site, by design). For real, algorithm-driven
            decisions — precedence, conflicts, throughput — use{' '}
            <Link href="/simulate" style={{ color: 'var(--accent-primary)' }}>Simulate</Link> or the{' '}
            <Link href="/dashboard/controller" style={{ color: 'var(--accent-primary)' }}>Controller Dashboard</Link>.
            <div style={{ marginTop: '8px' }}>
              <a href="https://railradar.in/railradar" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                Source: railradar.in <ExternalLink size={12} strokeWidth={2.25} />
              </a>
            </div>
          </div>
        </div>

        <div className="panel" style={{ flex: 1, minHeight: '600px', overflow: 'hidden', padding: 0 }}>
          <iframe
            src="https://railradar.in/railradar"
            title="RailRadar — Live National Train Map (external, third-party)"
            style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', display: 'block' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </main>

      <SiteFooter />

      <nav className="mobile-tab-bar">
        <Link href="/dashboard/controller"><span className="mobile-tab-icon"><SlidersHorizontal size={18} strokeWidth={2} /></span>Dashboard</Link>
        <Link href="/simulate"><span className="mobile-tab-icon"><Play size={18} strokeWidth={2} /></span>Simulate</Link>
        <Link href="/analytics"><span className="mobile-tab-icon"><BarChart3 size={18} strokeWidth={2} /></span>Analytics</Link>
        <Link href="/admin"><span className="mobile-tab-icon"><Settings size={18} strokeWidth={2} /></span>Admin</Link>
      </nav>
    </div>
  );
}
