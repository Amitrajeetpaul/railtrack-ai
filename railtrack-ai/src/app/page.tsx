'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { Zap, MessageSquareText, Satellite, ArrowRight, Route, Check, UserCircle, type LucideIcon } from 'lucide-react';

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

  return <>{count}{suffix}</>;
}

type Feature = { icon: LucideIcon; title: string; desc: string };

const HIGHLIGHT_FEATURES: Feature[] = [
  {
    icon: Zap,
    title: 'Real-Time Conflict Detection',
    desc: 'Continuously monitors interlocking state, train positions, and schedule adherence to predict and identify routing conflicts before they manifest on the network.',
  },
  {
    icon: MessageSquareText,
    title: 'Explainable AI (XAI)',
    desc: 'Recommendations are not black boxes. Every routing decision is accompanied by a transparent logic trace detailing the operational constraints and precedence rules considered.',
  },
  {
    icon: Satellite,
    title: 'High-Fidelity Live Tracking',
    desc: 'Ingests telemetry data at sub-second latency. Visualized on a strictly structured, minimalist map interface designed for rapid situational awareness without visual fatigue.',
  },
];

const TECH_STACK = [
  { code: 'FRNT', name: 'Next.js', live: false },
  { code: 'API', name: 'FastAPI', live: false },
  { code: 'DB', name: 'PostgreSQL', live: false },
  { code: 'OPT', name: 'Google OR-Tools', live: true },
  { code: 'LLM', name: 'Groq/Llama 3.1', live: true },
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
      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', background: 'rgba(0,18,36,0.95)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(26,84,144,0.3)', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: 'var(--radius-xs)',
            background: 'linear-gradient(135deg, #A4C9FF, var(--accent-primary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Route size={17} strokeWidth={2.25} color="#FFFFFF" />
          </div>
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '15px', color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            RAILTRACK<span style={{ color: '#A4C9FF' }}>.AI</span>
          </span>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="landing-nav-links">
          {[
            { label: 'Landing', href: '/', active: true },
            { label: 'Dashboard', href: '/dashboard/controller' },
            { label: 'Simulate', href: '/simulate' },
            { label: 'Admin', href: '/admin' },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Live Map', href: '/live-map' },
          ].map(item => (
            <Link key={item.label} href={item.href} style={{
              fontFamily: 'var(--font-space-mono)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', textDecoration: 'none', padding: '8px 14px', borderRadius: 'var(--radius-xs)',
              color: item.active ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
              background: item.active ? 'rgba(26,84,144,0.35)' : 'transparent',
              border: item.active ? '1px solid rgba(164,201,255,0.4)' : '1px solid transparent',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="animate-pulse-live" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-safe)', display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10.5px', color: '#88D982', letterSpacing: '0.08em' }}>SYS_ONLINE</span>
          </div>
          <Link href="/login" aria-label="Sign in" style={{
            width: '32px', height: '32px', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)',
          }}>
            <UserCircle size={18} strokeWidth={2} />
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section style={{
        position: 'relative', background: '#001224', color: '#FFFFFF',
        padding: '72px 24px 0', overflow: 'hidden', borderBottom: '1px solid rgba(26,84,144,0.4)',
      }}>
        {/* Animated Track Background — recolored for the dark hero */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.2 }} preserveAspectRatio="xMidYMid slice">
          {[80, 160, 240, 320, 400, 480].map((y, i) => (
            <line key={`h${i}`} x1="0" y1={y} x2="2000" y2={y} stroke="#A4C9FF" strokeWidth="1.5"
              strokeDasharray="40 20"
              style={{ animation: `dash-flow ${2 + i * 0.3}s linear infinite`, animationDelay: `${i * 0.2}s` }} />
          ))}
          {[200, 450, 700, 950].map((x, i) => (
            <line key={`v${i}`} x1={x} y1="0" x2={x} y2="600" stroke="rgba(164,201,255,0.25)" strokeWidth="1" />
          ))}
          {[
            { x: 200, y: 160 }, { x: 450, y: 240 }, { x: 700, y: 160 },
            { x: 950, y: 320 }, { x: 1200, y: 160 }, { x: 1450, y: 240 },
          ].map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r="6" fill="none" stroke="#A4C9FF" strokeWidth="1.5" />
          ))}
        </svg>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}
          className={visible ? 'animate-slide-in' : ''}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0,18,36,0.8)',
            border: '1px solid rgba(164,201,255,0.3)', borderRadius: 'var(--radius-pill)', padding: '4px 16px', marginBottom: '24px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A4C9FF', display: 'inline-block' }} className="animate-pulse-live" />
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: '#A4C9FF', letterSpacing: '0.1em' }}>
              SYS.OPT.THROUGHPUT
            </span>
          </div>

          <h1 className="glitch-text" style={{ fontFamily: 'var(--font-headline)', fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '24px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            Orchestrate Railway Traffic with
            <br />
            <span style={{ background: 'linear-gradient(90deg, #A4C9FF, #FFFFFF, #A4C9FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Unprecedented Precision.
            </span>
          </h1>

          <p style={{
            fontSize: '16px', color: 'rgba(255,255,255,0.8)', maxWidth: '620px', margin: '0 auto 40px', lineHeight: 1.7,
            textAlign: 'left', background: 'rgba(0,18,36,0.5)', padding: '18px 22px', borderLeft: '2px solid rgba(164,201,255,0.5)',
            borderRadius: '0 var(--radius-xs) var(--radius-xs) 0', fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: '#A4C9FF', marginRight: '8px' }}>{'>'}</span>
            RailTrack AI leverages deterministic optimization and Explainable AI to maximize
            network throughput, resolve conflicts in real-time, and empower controllers with
            actionable, transparent recommendations.
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '56px' }}>
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', padding: '14px 32px',
              background: 'linear-gradient(90deg, #A4C9FF, #FFFFFF)', color: '#001224', fontFamily: 'var(--font-headline)',
              fontWeight: 800, borderRadius: 'var(--radius-xs)', textDecoration: 'none', letterSpacing: '0.03em', textTransform: 'uppercase',
            }}>
              Access System Login <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
            <a href="#features" style={{
              fontSize: '14px', padding: '14px 32px', border: '1.5px solid rgba(164,201,255,0.4)', color: '#A4C9FF',
              fontFamily: 'var(--font-headline)', fontWeight: 700, borderRadius: 'var(--radius-xs)', textDecoration: 'none',
              letterSpacing: '0.03em', textTransform: 'uppercase',
            }}>
              Explore Capabilities
            </a>
          </div>
        </div>

        {/* Schematic Dashboard Preview */}
        <div style={{
          position: 'relative', zIndex: 1, maxWidth: '1080px', margin: '0 auto', width: '100%',
          background: 'rgba(0,18,36,0.9)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          border: '1px solid rgba(26,84,144,0.5)', borderBottom: 'none', overflow: 'hidden',
        }}>
          <div style={{ height: '38px', borderBottom: '1px solid rgba(26,84,144,0.4)', background: '#000A14', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(198,40,40,0.7)' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(79,70,229,0.7)' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(163,246,156,0.7)' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>
              NETWORK_TOPOLOGY_VIEW_V2.1
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', minHeight: '260px' }}>
            {/* System Status — real fetched stats */}
            <div style={{ borderRight: '1px solid rgba(26,84,144,0.3)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
              <div className="corner-bracket-tl" />
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: '#A4C9FF', letterSpacing: '0.12em', borderBottom: '1px solid rgba(26,84,144,0.3)', paddingBottom: '10px' }}>
                SYSTEM STATUS
              </div>
              {[
                { label: 'GLOBAL_THROUGHPUT', value: stats.uptime_percentage, suffix: '%', color: '#A3F69C' },
                { label: 'AVG_DELAY_REDUCTION', value: stats.avg_delay_reduction, suffix: '%', color: '#A4C9FF' },
              ].map((stat, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                    <span>{stat.label}</span>
                    <span style={{ color: stat.color }}>
                      {stat.value !== null ? <AnimatedCounter target={Math.floor(stat.value)} suffix={stat.suffix} duration={2000 + i * 300} /> : '—'}
                    </span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(26,84,144,0.2)', borderRadius: 'var(--radius-pill)', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: stat.value !== null ? `${Math.min(stat.value, 100)}%` : '0%', background: stat.color }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ height: '24px', background: 'rgba(26,84,144,0.1)', border: '1px solid rgba(26,84,144,0.2)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                  OPT_ENGINE: RUNNING
                </div>
                <div style={{ height: '24px', background: 'rgba(26,84,144,0.1)', border: '1px solid rgba(26,84,144,0.2)', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                  SOLVER: OR-TOOLS CP-SAT
                </div>
              </div>
            </div>

            {/* Live Routing Topology — decorative diagram */}
            <div style={{ borderRight: '1px solid rgba(26,84,144,0.3)', padding: '18px', position: 'relative', overflow: 'hidden', minHeight: '220px' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(26,84,144,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(26,84,144,0.15) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              <div style={{ position: 'absolute', top: '14px', left: '18px', zIndex: 1, fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: '#A4C9FF', letterSpacing: '0.12em' }}>
                LIVE ROUTING TOPOLOGY
              </div>
              <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px', background: 'rgba(26,84,144,0.5)', transform: 'translateY(-16px)' }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px', background: 'rgba(26,84,144,0.5)', transform: 'translateY(16px)' }} />
              <div className="data-stream" style={{ position: 'absolute', left: '30%', top: 0, width: '1px', height: '100%', opacity: 0.5 }} />
              <div style={{ position: 'absolute', top: '50%', left: '25%', width: '32px', height: '8px', background: '#A3F69C', borderRadius: 'var(--radius-xs)', transform: 'translateY(-16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '8px', color: '#001224', fontWeight: 700 }}>T1</div>
              <div style={{ position: 'absolute', top: '50%', left: '62%', width: '32px', height: '8px', background: '#A4C9FF', borderRadius: 'var(--radius-xs)', transform: 'translateY(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '8px', color: '#001224', fontWeight: 700 }}>T2</div>
              <div className="animate-pulse-live" style={{ position: 'absolute', top: '50%', left: '48%', width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--accent-danger)', transform: 'translate(-50%, -50%)' }} />
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <path d="M 90 100 Q 150 100 180 70 T 260 100" fill="none" stroke="#A3F69C" strokeDasharray="4 4" strokeWidth="1.5"
                  style={{ animation: 'dash-flow 2s linear infinite' }} />
              </svg>
            </div>

            {/* Resolution Log — illustrative example trace, not a live session log */}
            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
              <div className="corner-bracket-br" />
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: '#A4C9FF', letterSpacing: '0.12em', borderBottom: '1px solid rgba(26,84,144,0.3)', paddingBottom: '10px', marginBottom: '4px' }}>
                RESOLUTION LOG (EXAMPLE)
              </div>
              {[
                { t: 'T+0.0s', msg: 'SEC_42 CONFLICT DETECTED', color: 'rgba(255,255,255,0.6)' },
                { t: 'T+0.0s', msg: 'OR-TOOLS SOLVER INIT', color: '#A3F69C' },
                { t: 'T+0.4s', msg: 'ALT_ROUTE_A EVALUATED', color: 'rgba(255,255,255,0.6)' },
                { t: 'T+0.6s', msg: 'PRECEDENCE RECALCULATED', color: '#A3F69C' },
                { t: 'T+0.9s', msg: 'DISPATCH COMMITTED', color: '#A4C9FF' },
              ].map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                  <span style={{ color: 'rgba(26,84,144,0.9)', flexShrink: 0 }}>[{line.t}]</span>
                  <span style={{ color: line.color }}>{line.msg}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '16px 24px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(26,84,144,0.3)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'rgba(255,255,255,0.4)' }}>
              Live Train Data → Conflict Detection → OR-Tools Solver → WebSocket → Frontend
            </span>
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section style={{ padding: '56px 24px', textAlign: 'center', background: 'var(--bg-elevated)', position: 'relative', overflow: 'hidden' }}>
        <div className="dot-grid-bg" style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '28px', fontWeight: 700 }}>
            System Architecture Core
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            {TECH_STACK.map((tech, i) => (
              <span key={i} style={{
                position: 'relative', overflow: 'hidden', background: 'var(--bg-surface)', border: '1px solid var(--bg-border)',
                borderRadius: 'var(--radius-xs)', padding: '10px 18px 10px 22px', fontFamily: 'var(--font-mono)',
                fontSize: '13px', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--accent-primary)' }} />
                {tech.live && <span className="animate-pulse-live" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-safe)', display: 'inline-block' }} />}
                <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>{tech.code}</span>
                <span style={{ fontWeight: 700 }}>{tech.name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: '88px 24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px', maxWidth: '640px', margin: '0 auto 56px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--accent-primary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 700 }}>
            Capabilities
          </div>
          <h2 style={{ fontSize: '34px', fontWeight: 800 }}>Operational Superiority</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '16px', lineHeight: 1.7 }}>
            Transforming complex, high-density traffic scenarios into resolved, executable plans in milliseconds.
            Precision precedence optimization without the noise.
          </p>
        </div>

        {/* Elaborate cards — with an illustrative mini-panel example under each */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {HIGHLIGHT_FEATURES.map((f, i) => (
            <div key={i} className="panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: 'var(--radius-xs)', background: 'var(--bg-elevated)',
                border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-primary)', marginBottom: '20px',
              }}>
                <f.icon size={24} strokeWidth={1.75} />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '10px' }}>{f.title}</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '20px', flex: 1 }}>{f.desc}</p>

              {i === 0 && (
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)', padding: '14px', position: 'relative', overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', background: 'var(--accent-danger)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '12px', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 700 }}>TRN-8492</span>
                    <span className="badge-conflict" style={{ fontSize: '10px', padding: '1px 8px' }}>Conflict</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-space-mono)' }}>
                    <span>Sec: 42A → 42B</span>
                    <span style={{ fontWeight: 700 }}>ETA: -12s</span>
                  </div>
                </div>
              )}

              {i === 1 && (
                <div style={{ background: '#001224', borderRadius: 'var(--radius-xs)', padding: '14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#A4C9FF' }}>
                  <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginBottom: '8px' }}>TRACE_LOG_PREVIEW</div>
                  <div style={{ opacity: 0.85 }}>{'>'} CONSTRAINTS_EVAL: PASS</div>
                  <div style={{ opacity: 0.85, marginBottom: '10px' }}>{'>'} HEURISTIC_SCORE: 0.94</div>
                  <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', color: '#FFFFFF', fontWeight: 700, fontSize: '10.5px', textDecoration: 'none', letterSpacing: '0.04em' }}>
                    VIEW FULL TRACE <ArrowRight size={12} strokeWidth={2.5} />
                  </a>
                </div>
              )}

              {i === 2 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: '14px', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {['Sub-second updates', 'Topology-aware mapping'].map((item, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontFamily: 'var(--font-space-mono)' }}>
                      <span style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-xs)', background: 'rgba(46,125,50,0.12)', border: '1px solid rgba(46,125,50,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={11} strokeWidth={3} color="var(--accent-safe)" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--bg-border)', padding: '32px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 700 }}>
          RAILTRACK AI
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href="https://github.com/Amitrajeetpaul/railtrack-ai" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontFamily: 'var(--font-space-mono)' }}>GitHub</a>
          <span style={{ background: 'rgba(26,84,144,0.08)', border: '1px solid rgba(26,84,144,0.2)', borderRadius: 'var(--radius-xs)', padding: '2px 10px', fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--accent-primary)' }}>
            ENTERPRISE PLATFORM
          </span>
        </div>
      </footer>
    </div>
  );
}
