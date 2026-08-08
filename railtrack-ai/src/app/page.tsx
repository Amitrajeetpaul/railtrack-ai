'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { Zap, GitBranch, MessageSquareText, Users, ClipboardList, Satellite, type LucideIcon } from 'lucide-react';

function AnimatedCounter({ target, suffix = '', duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const startTime = useRef<number | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--accent-primary)' }}>{count}{suffix}</span>;
}

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Zap,
    title: 'Real-Time Conflict Detection',
    desc: 'The system checks every running train pair for shared-platform and crossing conflicts fresh on every request, so controllers always see current section state, not a stale snapshot.',
  },
  {
    icon: GitBranch,
    title: 'What-If Simulation',
    desc: 'Simulate disruptions before they happen. Run scenarios with delays, breakdowns, or weather events through the same real solver and compare optimized outcomes side-by-side before applying anything live.',
  },
  {
    icon: MessageSquareText,
    title: 'Explainable Recommendations',
    desc: 'Every solver decision comes with a plain-language reason grounded in the actual schedule — no black-box output. The controller always sees why, and can Accept or Override.',
  },
  {
    icon: Users,
    title: 'Multi-Role Access Control',
    desc: 'Purpose-built dashboards for Section Controllers, Traffic Supervisors, Logistics Operators, and Admins with role-scoped data.',
  },
  {
    icon: ClipboardList,
    title: 'Immutable Audit Trail',
    desc: 'Every AI recommendation, override, and manual decision is logged with operator ID, timestamp, and outcome for accountability and review.',
  },
  {
    icon: Satellite,
    title: 'Live Train Tracking',
    desc: 'Real-time position, delay, and station data for any Indian Railways train number, pulled from a live tracking API — not simulated placeholder data.',
  },
];

const TECH_STACK = [
  'Next.js', 'TypeScript', 'FastAPI', 'PostgreSQL', 'SQLAlchemy',
  'Google OR-Tools', 'Groq / Llama 3.1', 'Vercel', 'Railway',
];

const ARCH_NODES = [
  { label: 'Next.js Frontend', color: 'var(--accent-primary)', x: 50 },
  { label: 'FastAPI Backend', color: 'var(--accent-safe)', x: 50 },
  { label: 'OR-Tools CP-SAT Solver', color: 'var(--accent-rail)', x: 20 },
  { label: 'Groq LLM (Llama 3.1)', color: 'var(--accent-rail)', x: 80 },
  { label: 'PostgreSQL Database', color: 'var(--accent-warn)', x: 30 },
  { label: 'RailRadar Live Data API', color: 'var(--accent-warn)', x: 70 },
];

export default function LandingPage() {
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<{
    trains_today: number | null;
    avg_delay_reduction: number | null;
    uptime_percentage: number | null;
  }>({
    trains_today: null,
    avg_delay_reduction: null,
    uptime_percentage: null
  });

  useEffect(() => { 
    setVisible(true); 
    // Fetch live summary stats
    fetch(`${API_BASE}/api/analytics/summary`)
      .then(res => res.json())
      .then(data => {
        if (data.trains_today) {
          setStats(data);
        }
      })
      .catch(err => console.error('Failed to fetch hero stats:', err));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* ── HERO ── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Animated Track Background */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15 }} preserveAspectRatio="xMidYMid slice">
          {/* Horizontal tracks */}
          {[80, 160, 240, 320, 400, 480].map((y, i) => (
            <line key={`h${i}`} x1="0" y1={y} x2="2000" y2={y} stroke="var(--accent-primary)" strokeWidth="1.5"
              strokeDasharray="40 20"
              style={{ animation: `dash-flow ${2 + i * 0.3}s linear infinite`, animationDelay: `${i * 0.2}s` }} />
          ))}
          {/* Vertical connectors */}
          {[200, 450, 700, 950].map((x, i) => (
            <line key={`v${i}`} x1={x} y1="0" x2={x} y2="600" stroke="var(--bg-border)" strokeWidth="1" />
          ))}
          {/* Station nodes */}
          {[
            { x: 200, y: 160 }, { x: 450, y: 240 }, { x: 700, y: 160 },
            { x: 950, y: 320 }, { x: 1200, y: 160 }, { x: 1450, y: 240 },
          ].map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r="6" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" />
          ))}
        </svg>

        {/* Hero Content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px', maxWidth: '900px' }}
          className={visible ? 'animate-slide-in' : ''}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 'var(--radius-pill)', padding: '4px 16px', marginBottom: '24px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} className="animate-pulse-live" />
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>
              LIVE DEMO • ENTERPRISE TRAFFIC SYSTEM
            </span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-space-mono)', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 700, lineHeight: 1.1, marginBottom: '24px' }}>
            AI-Powered Railway
            <br />
            <span style={{ color: 'var(--accent-primary)' }}>Traffic Intelligence</span>
          </h1>

          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 40px', lineHeight: 1.7 }}>
            Real-time conflict detection, precedence optimization, and what-if simulation
            for Indian Railways section controllers. Built with OR-Tools CP-SAT + deep learning.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" className="btn-primary" style={{ fontSize: '16px', padding: '14px 32px' }}>
              Live Demo →
            </Link>
            <a href="https://github.com/Amitrajeetpaul/railtrack-ai" target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ fontSize: '16px', padding: '14px 32px' }}>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--bg-border)', borderBottom: '1px solid var(--bg-border)', padding: '48px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '48px', textAlign: 'center' }}>
          {[
            { value: stats.trains_today, suffix: '+', label: 'Trains Managed Daily' },
            { value: stats.avg_delay_reduction, suffix: '%', label: 'Avg Delay Reduction' },
            { value: stats.uptime_percentage, suffix: '%', label: 'System Uptime' },
          ].map((stat, i) => (
            <div key={i}>
              <div style={{ fontSize: '48px', fontWeight: 700, lineHeight: 1 }}>
                {stat.value !== null ? (
                  <AnimatedCounter target={Math.floor(stat.value)} suffix={stat.suffix} duration={2200 + i * 300} />
                ) : (
                  <span style={{ opacity: 0.3, animation: 'pulse-live 1.5s infinite' }}>—</span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: '8px', textTransform: 'uppercase' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ padding: '96px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--accent-primary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>
            CAPABILITIES
          </div>
          <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '36px', fontWeight: 700 }}>
            Everything a Section Controller Needs
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '16px', maxWidth: '600px', margin: '16px auto 0' }}>
            From real-time monitoring to advanced AI optimization, RailTrack AI covers every aspect of railway traffic management.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="panel" style={{ padding: '32px', transition: 'border-color 0.2s ease', cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bg-border)')}>
              <div style={{ marginBottom: '16px', color: 'var(--accent-primary)' }}><f.icon size={28} strokeWidth={1.75} /></div>
              <h3 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ARCHITECTURE ── */}
      <section style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--bg-border)', borderBottom: '1px solid var(--bg-border)', padding: '96px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '64px' }}>
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--accent-primary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px' }}>
              SYSTEM ARCHITECTURE
            </div>
            <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '36px', fontWeight: 700 }}>
              Production-Grade Infrastructure
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            {ARCH_NODES.map((node, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', border: `1px solid ${node.color}30`, borderRadius: 'var(--radius-xs)', padding: '20px', textAlign: 'center' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: node.color, margin: '0 auto 12px' }} />
                <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                  {node.label}
                </div>
              </div>
            ))}
          </div>
          {/* Arrow flow */}
          <div style={{ textAlign: 'center', marginTop: '32px', fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
            Live Train Data → Conflict Detection → OR-Tools Solver → WebSocket → Frontend
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '32px' }}>
          BUILT WITH
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
          {TECH_STACK.map((tech, i) => (
            <span key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)', padding: '8px 16px', fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--bg-border)', padding: '32px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 700 }}>
          RAILTRACK AI
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <a href="https://github.com/Amitrajeetpaul/railtrack-ai" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontFamily: 'var(--font-space-mono)' }}>GitHub</a>
          <span style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 'var(--radius-xs)', padding: '2px 10px', fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--accent-primary)' }}>
            ENTERPRISE PLATFORM
          </span>
        </div>
      </footer>
    </div>
  );
}
