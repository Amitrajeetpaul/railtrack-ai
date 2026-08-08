'use client';
import { Conflict } from '@/lib/mockData';
import { useState, useEffect } from 'react';
import { X, MapPin, Lightbulb, Check } from 'lucide-react';

interface Props {
  onAccept?: (conflict: Conflict) => void;
  onOverride?: (conflict: Conflict) => void;
  visible: boolean;
  conflict: Conflict | null;
  onDismiss: () => void;
}

export default function AIRecommendation({ visible, conflict, onDismiss, onAccept, onOverride }: Props) {
  const [showXai, setShowXai] = useState(false);

  if (!visible || !conflict) return null;

  return (
    <div className="animate-slide-in card-elevated" style={{
      position: 'absolute',
      right: '16px',
      top: '16px',
      bottom: '16px',
      width: '360px',
      background: '#FFFFFF',
      border: '1.5px solid var(--bg-border)',
      borderLeft: '4px solid var(--accent-primary)',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-elevated)' }}>
        <span className="signal-lamp signal-lamp-green" style={{ width: '10px', height: '10px' }} />
        <span style={{ fontFamily: 'var(--font-headline)', fontSize: '13px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '0.04em' }}>
          SECTION CONTROL RECOMMENDATION
        </span>
        <button onClick={onDismiss} aria-label="Dismiss" className="btn-icon" style={{ marginLeft: 'auto', width: '28px', height: '28px', border: 'none' }}>
          <X size={14} strokeWidth={2.25} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        {/* Conflict info */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', marginBottom: '8px' }}>
            CONFLICT DETECTED
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.trainA}</span>
            <span style={{ color: 'var(--text-secondary)' }}>↔</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.trainB}</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <MapPin size={13} strokeWidth={2} /> Location: {conflict.location}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className={`badge-${conflict.severity === 'HIGH' ? 'conflict' : conflict.severity === 'MEDIUM' ? 'warn' : 'rail'}`}>
              {conflict.severity} SEVERITY
            </span>
            <span className="badge-warn font-mono">
              T-{Math.floor(conflict.timeToConflict / 60)}:{String(conflict.timeToConflict % 60).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--bg-border)', margin: '16px 0' }} />

        {/* Recommendation text */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', marginBottom: '8px' }}>
            RECOMMENDED ACTION
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.6, fontWeight: 500 }}>
            {conflict.recommendation}
          </p>
        </div>

        {/* Explain Logic Toggle Button */}
        <div style={{ marginBottom: '18px' }}>
          <button
            onClick={() => setShowXai(!showXai)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-xs)',
              border: '1px solid #C5DCF2', background: showXai ? '#EBF3FA' : '#F8FAFC',
              color: 'var(--accent-primary)', fontFamily: 'var(--font-headline)', fontSize: '12px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer'
            }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Lightbulb size={14} strokeWidth={2} /> {showXai ? 'Hide Recommendation Logic' : 'Explain Recommendation Logic'}
            </span>
            <span>{showXai ? '▲' : '▼'}</span>
          </button>

          {showXai && (
            <div style={{
              marginTop: '10px', padding: '14px', background: 'var(--bg-base)',
              border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)', fontSize: '12px',
              color: 'var(--text-primary)', lineHeight: 1.6
            }}>
              <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '6px' }}>
                Standard Precedence Rules Applied:
              </div>
              <ul style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li><b>Priority Rule:</b> Express train {conflict.trainA} prioritized over lower-tier {conflict.trainB}.</li>
                <li><b>Safety Headway:</b> Maintains mandatory 3-min signal block buffer.</li>
                <li><b>Cascading Delay Prevention:</b> Holding {conflict.trainB} at Loop Line avoids a 24+ min delay ripple on trailing passenger trains.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Confidence bar */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em' }} title="Reflects priority-rule strength for this scenario, not a live-computed model confidence score.">PRIORITY SCORE</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.confidence}%</span>
          </div>
          <div style={{ height: '8px', background: 'var(--bg-border)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${conflict.confidence}%`, background: 'var(--accent-primary)', borderRadius: 'var(--radius-xs)', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Time saving */}
        <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 'var(--radius-sm)', padding: '14px', marginBottom: '18px' }}>
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, color: 'var(--accent-safe)', letterSpacing: '0.06em', marginBottom: '4px' }}>ESTIMATED TIME SAVED</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 700, color: 'var(--accent-safe)' }}>
            +{conflict.timeSaving} min
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '10px', background: '#FFFFFF' }}>
        <button className="btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '13.5px', padding: '11px', background: 'var(--accent-safe)', borderRadius: 'var(--radius-xs)', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => onAccept?.(conflict)}>
          <Check size={15} strokeWidth={2.5} /> Accept Recommendation
        </button>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: '13.5px', padding: '11px', borderRadius: 'var(--radius-xs)' }} onClick={() => onOverride?.(conflict)}>
          Override
        </button>
      </div>
    </div>
  );
}

