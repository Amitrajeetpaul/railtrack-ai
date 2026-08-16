'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Globe, ExternalLink } from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';
import AppShell from '@/components/AppShell';

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
    <AppShell active="live-map">
      <div style={{ padding: '24px' }}>
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
      </div>
    </AppShell>
  );
}
