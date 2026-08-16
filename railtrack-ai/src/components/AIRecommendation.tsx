'use client';
import { Conflict } from '@/lib/mockData';
import { Bot, X, TriangleAlert, MapPin, Check, Link2 } from 'lucide-react';

interface Props {
  onAccept?: (conflict: Conflict) => void;
  onOverride?: (conflict: Conflict) => void;
  visible: boolean;
  conflict: Conflict | null;
  onDismiss: () => void;
}

export default function AIRecommendation({ visible, conflict, onDismiss, onAccept, onOverride }: Props) {
  if (!visible || !conflict) return null;

  const timeLabel = conflict.timeToConflict != null
    ? `T-${Math.floor(conflict.timeToConflict / 60)}:${String(conflict.timeToConflict % 60).padStart(2, '0')}`
    : 'Timing unknown';

  return (
    <div className="animate-slide-in card-elevated" style={{
      position: 'absolute',
      right: '16px',
      top: '16px',
      bottom: '16px',
      width: '380px',
      background: '#FFFFFF',
      border: '2px solid var(--accent-primary)',
      borderRadius: 'var(--radius-md)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      overflow: 'hidden',
      boxShadow: '0 20px 40px -8px rgba(26,84,144,0.25)',
    }}>
      {/* Header — solid navy, matching the design system's primary accent */}
      <div style={{
        padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px',
        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-primary-hover))',
      }}>
        <Bot size={20} strokeWidth={2} color="#FFFFFF" />
        <span style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', fontWeight: 700, color: '#FFFFFF', flex: 1 }}>
          AI Recommendation
        </span>
        <button onClick={onDismiss} aria-label="Dismiss" style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 'var(--radius-xs)',
          width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF', cursor: 'pointer',
        }}>
          <X size={14} strokeWidth={2.25} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '18px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Conflict detected — tinted alert box */}
        <div style={{
          background: 'rgba(198,40,40,0.06)', border: '1px solid rgba(198,40,40,0.25)',
          borderRadius: 'var(--radius-sm)', padding: '14px', display: 'flex', gap: '10px',
        }}>
          <TriangleAlert size={18} strokeWidth={2.25} color="var(--accent-danger)" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-headline)', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {conflict.trainA} ↔ {conflict.trainB} — Conflict Detected
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <MapPin size={12} strokeWidth={2} /> {conflict.location}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span className={`badge-${conflict.severity === 'HIGH' ? 'conflict' : conflict.severity === 'MEDIUM' ? 'warn' : 'rail'}`}>
                {conflict.severity}
              </span>
              <span className="badge-warn font-mono">{timeLabel}</span>
            </div>
          </div>
        </div>

        {conflict.chainId && (
          <div style={{ fontSize: '12px', color: 'var(--accent-warn-text)', background: 'rgba(245,158,11,0.1)', padding: '8px 12px', borderRadius: 'var(--radius-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link2 size={13} strokeWidth={2.25} style={{ flexShrink: 0 }} /> Part of a {conflict.chainId.replace('CHAIN-', '').split('-').length}-train pileup — resolving this pair alone may not clear the rest of the chain.
          </div>
        )}

        {/* XAI reasoning — shown directly, terminal-style, not hidden behind a toggle */}
        <div>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px' }}>
            XAI REASONING
          </div>
          <div style={{
            background: 'var(--bg-base)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-sm)',
            padding: '14px', fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.7,
          }}>
            <p style={{ margin: '0 0 6px' }}>Decision: {conflict.recommendation}</p>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{'>'} Priority rule: higher-tier train given precedence, safety headway maintained.</p>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{'>'} Estimated time saved if accepted: +{conflict.timeSaving} min.</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }} title="Reflects priority-rule strength for this scenario, not a live-computed model confidence score.">
              PRIORITY SCORE
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.confidence}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--bg-border)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${conflict.confidence}%`, background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-rail))', borderRadius: 'var(--radius-pill)', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '16px 18px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '10px', background: 'var(--bg-elevated)' }}>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: '13px', padding: '11px', borderRadius: 'var(--radius-xs)' }} onClick={() => onOverride?.(conflict)}>
          Manual Override
        </button>
        <button style={{
          flex: 1, justifyContent: 'center', fontSize: '13px', padding: '11px', borderRadius: 'var(--radius-xs)',
          background: 'var(--accent-primary)', color: '#FFFFFF', border: 'none', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-headline)', fontWeight: 600,
        }} onClick={() => onAccept?.(conflict)}>
          <Check size={15} strokeWidth={2.5} /> Accept
        </button>
      </div>
    </div>
  );
}
