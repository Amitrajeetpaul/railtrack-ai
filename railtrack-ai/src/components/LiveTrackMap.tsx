'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TRACK_STATIONS, TRACK_SEGMENTS, TRACK_SIGNALS, TrainPriority } from '@/lib/mockData';
import { API_BASE, trainsQueryFor } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Helper to grab token on the client
function getClientToken() {
  const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/) : null;
  return match ? decodeURIComponent(match[1]) : null;
}

const PRIORITY_COLORS: Record<TrainPriority, string> = {
  EXPRESS:     '#00D4FF',
  FREIGHT:     '#F59E0B',
  LOCAL:       '#6366F1',
  MAINTENANCE: 'var(--text-muted)',
};

interface TrainPosition {
  trainId: string;
  priority: TrainPriority;
  progress: number; // 0-1 along track
  segFrom: string;
  segTo: string;
  speed: number;
}

const SVG_W = 920;
const SVG_H = 320;
const TRACK_Y = 180;
const BRANCH_Y = 90;

function getStationPos(id: string) {
  const s = TRACK_STATIONS.find(s => s.id === id);
  return s ? { x: (s.x / 960) * SVG_W, y: id === 'ST-8' ? BRANCH_Y : TRACK_Y } : { x: 0, y: TRACK_Y };
}

function interpolate(from: { x: number; y: number }, to: { x: number; y: number }, t: number) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

interface Props {
  conflictSegment?: string | null;
  onTrainClick?: (id: string) => void;
  liveTrainData?: Record<string, {
    status: 'ok' | 'not_running' | 'unavailable' | 'loading';
    delay?: number;
    lastUpdated?: string;
    isLive: boolean;
    loading: boolean;
  }>;
}

export default function LiveTrackMap({ conflictSegment, onTrainClick, liveTrainData }: Props) {
  const { user } = useAuth();
  const [trains, setTrains] = useState<TrainPosition[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [conflictFlash, setConflictFlash] = useState(false);
  const animRef = useRef<number>(0);
  const lastTime = useRef<number>(0);

  // Fetch real trains
  const { data: apiTrains = [] } = useQuery({
    queryKey: ['live-map-trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/trains/${trainsQueryFor(user?.section)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
    placeholderData: (previousData: any) => previousData,
  });

  // Sync API trains to internal animation state
  useEffect(() => {
    setTrains(prev => {
      return apiTrains.map((t: any, idx: number) => {
        const existing = prev.find(pt => pt.trainId === t.id);
        const segIdx = parseInt(t.id.replace(/\D/g, '') || idx.toString()) % TRACK_SEGMENTS.length;
        const seg = TRACK_SEGMENTS[segIdx];
        const liveData = liveTrainData?.[t.id];
        const speed = liveData?.isLive && t.speed
          ? t.speed * 0.0000005
          : (t.speed || 60) * 0.0000005;
        return {
          trainId: t.id,
          priority: t.priority as TrainPriority,
          progress: existing ? existing.progress : Math.random(),
          segFrom: seg.from,
          segTo: seg.to,
          speed,
        };
      });
    });
  }, [apiTrains, liveTrainData]);

  // Animate train positions
  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!lastTime.current) lastTime.current = timestamp;
      const dt = timestamp - lastTime.current;
      lastTime.current = timestamp;

      setTrains(prev => prev.map(t => ({
        ...t,
        progress: (t.progress + (t.speed || 0.000025) * dt) % 1
      })));

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Conflict flash
  useEffect(() => {
    if (!conflictSegment) return;
    const interval = setInterval(() => setConflictFlash(f => !f), 600);
    return () => clearInterval(interval);
  }, [conflictSegment]);

  // Station positions
  const stationMap = Object.fromEntries(TRACK_STATIONS.map(s => [s.id, getStationPos(s.id)]));

  // Build segment paths for coloring
  const segmentColors: Record<string, string> = {};
  for (const seg of TRACK_SEGMENTS) {
    if (seg.id === conflictSegment) {
      segmentColors[seg.id] = conflictFlash ? 'var(--accent-danger)' : '#CBD5E1';
    } else {
      const occupied = trains.some(t => t.segFrom === seg.from && t.segTo === seg.to);
      segmentColors[seg.id] = occupied ? 'var(--accent-primary)' : '#CBD5E1';
    }
  }

  return (
    <div className="card-elevated" style={{ borderRadius: 'var(--radius-sm)', background: '#FFFFFF', overflow: 'hidden', position: 'relative' }}>
      {/* Grid overlay */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.4 }} preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid-line)" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Main track SVG */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height="280"
        style={{ display: 'block', position: 'relative', zIndex: 1 }}
      >
        {/* Track segments */}
        {TRACK_SEGMENTS.map(seg => {
          const from = stationMap[seg.from];
          const to   = stationMap[seg.to];
          const color = segmentColors[seg.id];
          return (
            <g key={seg.id}>
              {/* Shadow track line */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={color === 'var(--accent-primary)' ? 6 : 1}
                strokeOpacity={color === 'var(--accent-primary)' ? 0.15 : 0}
              />
              {/* Main track line */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={2.5}
                style={seg.track === 'BRANCH' ? { strokeDasharray: '6 4' } : {}}
              />
            </g>
          );
        })}

        {/* Stations */}
        {TRACK_STATIONS.map(station => {
          const pos = stationMap[station.id];
          return (
            <g key={station.id}>
              {/* Station box */}
              <rect
                x={pos.x - 26} y={pos.y - 14}
                width={52} height={28}
                rx={6}
                fill="#FFFFFF"
                stroke="var(--bg-border)"
                strokeWidth={1.5}
              />
              {/* Station code */}
              <text
                x={pos.x} y={pos.y + 4}
                textAnchor="middle"
                fill="var(--accent-primary)"
                fontSize="11"
                fontFamily="var(--font-headline)"
                fontWeight="700"
              >
                {station.name}
              </text>
              {/* Station label below */}
              <text
                x={pos.x} y={pos.y + 32}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="10"
                fontFamily="var(--font-body)"
                fontWeight="500"
              >
                {station.label}
              </text>
            </g>
          );
        })}

        {/* Signature Circular Signal Lamps */}
        {TRACK_SIGNALS.map(sig => {
          const signalColor = sig.state === 'GREEN' ? 'var(--accent-safe)' : sig.state === 'RED' ? 'var(--accent-danger)' : 'var(--accent-warn)';
          return (
            <g key={sig.id}>
              {/* Glow ring */}
              <circle cx={sig.x} cy={sig.y} r={11} fill={signalColor} fillOpacity={0.2} />
              {/* Signal circle lamp */}
              <circle cx={sig.x} cy={sig.y} r={6} fill={signalColor} stroke="#FFFFFF" strokeWidth={1.5} />
              <text x={sig.x} y={sig.y - 15} textAnchor="middle" fill={signalColor} fontSize="9" fontFamily="var(--font-mono)" fontWeight="700">
                {sig.id.replace('SIG-0', 'S')}
              </text>
            </g>
          );
        })}

        {/* Train tokens */}
        {trains.map(train => {
          const from = stationMap[train.segFrom];
          const to   = stationMap[train.segTo];
          if (!from || !to) return null;

          const pos = interpolate(from, to, train.progress);
          const color = PRIORITY_COLORS[train.priority];
          const isHovered = hovered === train.trainId;

          return (
            <g
              key={train.trainId}
              transform={`translate(${pos.x - 16}, ${pos.y - 8})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(train.trainId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onTrainClick?.(train.trainId)}
            >
              {/* Token body */}
              <rect width={32} height={16} rx={4} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />
              {/* Train ID */}
              <text x={16} y={11} textAnchor="middle" fill="#FFFFFF"
                fontSize="8.5" fontFamily="var(--font-mono)" fontWeight="700">
                {train.trainId.replace('TN-', '')}
              </text>
              {/* Tooltip */}
              {isHovered && (
                <g transform="translate(0, -46)">
                  <rect x={-20} y={0} width={84} height={30} rx={6}
                    fill="#FFFFFF" stroke={color} strokeWidth="1.5" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.1))" />
                  <text x={22} y={14} textAnchor="middle" fill={color} fontSize="10"
                    fontFamily="var(--font-headline)" fontWeight="700">
                    {train.trainId}
                  </text>
                  <text x={22} y={24} textAnchor="middle" fill="var(--text-secondary)" fontSize="8.5"
                    fontFamily="var(--font-body)">
                    {train.priority}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '24px', flexWrap: 'wrap', background: '#FFFFFF', position: 'relative', zIndex: 1 }}>
        {Object.entries(PRIORITY_COLORS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '8px', borderRadius: 'var(--radius-xs)', background: v }} />
            <span style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>{k}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="signal-lamp signal-lamp-green" style={{ width: '10px', height: '10px' }} />
          <span style={{ fontFamily: 'var(--font-headline)', fontSize: '11px', fontWeight: 700, color: 'var(--accent-safe)' }} title="Illustrative section traffic view — train positions here are simulated for layout, not live GPS. Search a train number above for its real, live-tracked position.">SIMULATED TRAFFIC VIEW</span>
        </div>
      </div>
    </div>
  );
}
