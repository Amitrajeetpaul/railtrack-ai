'use client';
import Link from 'next/link';
import { Type, Contrast } from 'lucide-react';
import { useAccessibility } from './AccessibilityProvider';

export default function OfficialUtilityBar() {
  const { fontScale, setFontScale, highContrast, setHighContrast } = useAccessibility();

  return (
    <div style={{
      background: 'var(--accent-primary)', color: '#FFFFFF', fontSize: '11px',
      fontFamily: 'var(--font-body)', padding: '5px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '8px',
    }}>
      <a href="#main-content" style={{
        position: 'absolute', left: '-9999px', color: '#FFFFFF', background: 'var(--accent-primary-hover)',
        padding: '8px 14px', borderRadius: 'var(--radius-xs)', zIndex: 200,
      }} onFocus={e => { e.currentTarget.style.left = '12px'; e.currentTarget.style.top = '4px'; e.currentTarget.style.position = 'fixed'; }}
         onBlur={e => { e.currentTarget.style.left = '-9999px'; }}>
        Skip to Main Content
      </a>

      <span style={{ opacity: 0.95 }}>
        Prototype for Smart India Hackathon 2025 — Ministry of Railways Problem Statement 25022
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} role="group" aria-label="Text size">
          <Type size={12} strokeWidth={2} style={{ marginRight: '2px' }} />
          {(['normal', 'large', 'larger'] as const).map(scale => (
            <button
              key={scale}
              onClick={() => setFontScale(scale)}
              aria-label={`Text size: ${scale}`}
              aria-pressed={fontScale === scale}
              style={{
                background: fontScale === scale ? 'rgba(255,255,255,0.25)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.4)', borderRadius: '4px',
                color: '#FFFFFF', cursor: 'pointer', padding: '2px 6px',
                fontSize: scale === 'normal' ? '10px' : scale === 'large' ? '12px' : '14px',
                minWidth: '22px', minHeight: '22px', lineHeight: 1,
              }}>
              A
            </button>
          ))}
        </div>

        <button
          onClick={() => setHighContrast(!highContrast)}
          aria-pressed={highContrast}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: highContrast ? 'rgba(255,255,255,0.25)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.4)', borderRadius: '4px',
            color: '#FFFFFF', cursor: 'pointer', padding: '3px 8px', fontSize: '11px',
            minHeight: '22px',
          }}>
          <Contrast size={12} strokeWidth={2} />
          High Contrast
        </button>

        <Link href="/about" style={{ color: '#FFFFFF', textDecoration: 'underline', opacity: 0.9 }}>
          About
        </Link>
      </div>
    </div>
  );
}
