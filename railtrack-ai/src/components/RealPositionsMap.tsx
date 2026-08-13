'use client';
import { MapPin } from 'lucide-react';

export interface RealTrainPosition {
  trainNumber: string;
  trainName: string;
  lat: number | null;
  lng: number | null;
  delayMinutes: number | null;
  currentStationName?: string;
  nextStation?: string;
  status: 'ok' | 'not_running' | 'unavailable';
  terminated?: boolean;
}

// India's real geographic bounding box — used for a simple, honest
// equirectangular projection (no external map tiles/API needed). Not
// precise cartography, but geographically real, not invented positions.
const LAT_MIN = 6, LAT_MAX = 37;
const LNG_MIN = 68, LNG_MAX = 98;

// Real coordinates for a handful of major cities, shown only as faint
// reference points so the plotted trains have geographic context.
const REFERENCE_CITIES = [
  { code: 'NDLS', name: 'Delhi', lat: 28.6419, lng: 77.2217 },
  { code: 'MMCT', name: 'Mumbai', lat: 18.9699, lng: 72.8193 },
  { code: 'MAS', name: 'Chennai', lat: 13.0824, lng: 80.2760 },
  { code: 'HWH', name: 'Kolkata', lat: 22.5839, lng: 88.3428 },
  { code: 'SBC', name: 'Bengaluru', lat: 12.9782, lng: 77.5696 },
  { code: 'SC', name: 'Hyderabad', lat: 17.4339, lng: 78.5021 },
];

function project(lat: number, lng: number, width: number, height: number) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * width;
  const y = height - ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * height;
  return { x, y };
}

// RailRadar's own delayMinutes field is occasionally nonsensical for a
// terminated train (it can reference a stale record from years ago,
// producing a delay of millions of minutes) — treat those, plus any
// terminated train, as "no meaningful live delay" rather than displaying
// or color-coding a bogus number.
function hasMeaningfulDelay(p: RealTrainPosition): boolean {
  return !p.terminated && p.delayMinutes != null && Math.abs(p.delayMinutes) < 1440;
}

function delayColor(p: RealTrainPosition): string {
  if (!hasMeaningfulDelay(p)) return 'var(--text-muted)';
  const delay = p.delayMinutes!;
  if (delay === 0) return 'var(--accent-safe)';
  if (delay < 20) return '#F59E0B';
  return 'var(--accent-danger)';
}

function delayLabel(p: RealTrainPosition): string {
  if (p.terminated) return 'Journey completed';
  if (!hasMeaningfulDelay(p)) return '';
  const delay = p.delayMinutes!;
  return delay === 0 ? 'On time' : `+${delay}m`;
}

export default function RealPositionsMap({
  positions,
  conflictPairs = [],
}: {
  positions: RealTrainPosition[];
  conflictPairs?: [string, string][];
}) {
  const width = 640, height = 640;
  const plottable = positions.filter(p => p.lat != null && p.lng != null);
  const unplottable = positions.filter(p => p.lat == null || p.lng == null);

  const byNumber = Object.fromEntries(plottable.map(p => [p.trainNumber, p]));

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--bg-border)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-safe)' }} className="animate-pulse-live" />
        <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
          REAL LIVE POSITIONS
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          — real GPS-derived locations, fetched live per selected train (not the simulated track diagram)
        </span>
      </div>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', maxHeight: '520px', margin: '0 auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
          {/* Reference cities for geographic context */}
          {REFERENCE_CITIES.map(c => {
            const { x, y } = project(c.lat, c.lng, width, height);
            return (
              <g key={c.code}>
                <circle cx={x} cy={y} r={3} fill="var(--bg-border)" />
                <text x={x + 6} y={y + 3} fontSize={10} fill="var(--text-muted)" fontFamily="var(--font-jetbrains)">
                  {c.name}
                </text>
              </g>
            );
          })}

          {/* Conflict connectors — drawn first, under the markers */}
          {conflictPairs.map(([a, b], i) => {
            const pa = byNumber[a], pb = byNumber[b];
            if (!pa || !pb || pa.lat == null || pb.lat == null) return null;
            const p1 = project(pa.lat!, pa.lng!, width, height);
            const p2 = project(pb.lat!, pb.lng!, width, height);
            return (
              <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke="var(--accent-danger)" strokeWidth={2} strokeDasharray="6 4" opacity={0.7} />
            );
          })}

          {/* Train markers */}
          {plottable.map(p => {
            const { x, y } = project(p.lat!, p.lng!, width, height);
            const inConflict = conflictPairs.some(([a, b]) => a === p.trainNumber || b === p.trainNumber);
            return (
              <g key={p.trainNumber}>
                {inConflict && (
                  <circle cx={x} cy={y} r={11} fill="none" stroke="var(--accent-danger)" strokeWidth={1.5}>
                    <animate attributeName="r" values="9;14;9" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r={6} fill={delayColor(p)} stroke="#FFFFFF" strokeWidth={1.5} />
                <text x={x} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text-primary)" fontFamily="var(--font-jetbrains)">
                  {p.trainNumber}
                </text>
                <text x={x} y={y + 20} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
                  {delayLabel(p)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend / details */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {plottable.map(p => (
          <div key={p.trainNumber} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: delayColor(p), flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--text-primary)' }}>{p.trainNumber}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{p.trainName}</span>
            <span style={{ color: 'var(--text-muted)' }}>{delayLabel(p)}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={11} strokeWidth={2} /> {p.currentStationName || p.nextStation || '—'}
            </span>
          </div>
        ))}
        {unplottable.map(p => (
          <div key={p.trainNumber} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', opacity: 0.6 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700 }}>{p.trainNumber}</span>
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {p.status === 'not_running' ? 'Not currently running' : 'Live position unavailable'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
