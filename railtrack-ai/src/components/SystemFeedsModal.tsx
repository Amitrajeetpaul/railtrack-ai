'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/lib/api';

function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface SystemStatus {
  system_code: string;
  system_name: string;
  status: string;
  latency_ms: number;
  last_sync: string;
  data_protocol: string;
  active_records: number;
  sample_payload: Record<string, any>;
}

interface SystemsResponse {
  timestamp: string;
  section: string;
  overall_health: string;
  systems: SystemStatus[];
}

export default function SystemFeedsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedSystem, setSelectedSystem] = useState<string>('COA');

  const { data, isLoading, isError, refetch } = useQuery<SystemsResponse>({
    queryKey: ['system-feeds'],
    queryFn: async () => {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/systems/feeds`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch system feeds');
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: 10000,
  });

  if (!isOpen) return null;

  const currentSys = data?.systems?.find((s) => s.system_code === selectedSystem) || data?.systems?.[0];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10, 12, 16, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
    }}>
      <div style={{
        width: '100%', maxWidth: '840px', background: 'var(--bg-surface)',
        border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', background: 'var(--bg-base)', borderBottom: '1px solid var(--bg-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📡</span>
              <h3 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '16px', fontWeight: 700 }}>
                Indian Railways Enterprise Systems Inspector
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Live telemetry bridge & protocol gateway status (COA / FOIS / TMS / IRCTC)
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost" aria-label="Close" style={{ fontSize: '18px', padding: '4px 8px' }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', gap: '20px', minHeight: '380px' }}>
          {/* Left: Systems List */}
          <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '4px' }}>
              CONNECTED GATEWAYS
            </div>
            {isLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading feeds...</div>
            ) : isError ? (
              <div style={{ fontSize: '12px', color: 'var(--accent-danger)' }}>Error loading feeds</div>
            ) : (
              data?.systems.map((sys) => (
                <button
                  key={sys.system_code}
                  onClick={() => setSelectedSystem(sys.system_code)}
                  style={{
                    padding: '12px', borderRadius: 'var(--radius-xs)', border: '1px solid',
                    borderColor: selectedSystem === sys.system_code ? 'var(--accent-primary)' : 'var(--bg-border)',
                    background: selectedSystem === sys.system_code ? 'rgba(0,212,255,0.08)' : 'var(--bg-base)',
                    textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--font-space-mono)', fontWeight: 700, fontSize: '13px', color: selectedSystem === sys.system_code ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                      {sys.system_code}
                    </span>
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: 'var(--radius-xs)',
                      background: 'rgba(0,230,118,0.15)', color: '#00E676', fontFamily: 'var(--font-space-mono)'
                    }}>
                      ● {sys.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sys.system_name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>
                    <span>Latency: {sys.latency_ms}ms</span>
                    <span>Recs: {sys.active_records}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Right: Payload Inspector */}
          <div style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)', padding: '16px', display: 'flex', flexDirection: 'column' }}>
            {currentSys ? (
              <>
                <div style={{ borderBottom: '1px solid var(--bg-border)', paddingBottom: '12px', marginBottom: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {currentSys.system_name} ({currentSys.system_code})
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-space-mono)' }}>
                    Protocol: {currentSys.data_protocol} | Latency: {currentSys.latency_ms}ms
                  </div>
                </div>

                <div style={{ fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  LIVE TELEMETRY PACKET PAYLOAD:
                </div>
                <pre style={{
                  flex: 1, background: '#0A0C10', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)',
                  padding: '12px', overflowX: 'auto', fontFamily: 'var(--font-space-mono)', fontSize: '11px',
                  color: '#00E676', lineHeight: 1.5
                }}>
                  {JSON.stringify(currentSys.sample_payload, null, 2)}
                </pre>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Select a gateway to inspect packet payload.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px', background: 'var(--bg-base)', borderTop: '1px solid var(--bg-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)' }}>
            STATUS: OVERALL HEALTH 100% OPERATIONAL | CRIS (CENTRE FOR RAILWAY INFORMATION SYSTEMS) BRIDGE ACTIVE
          </div>
          <button onClick={() => refetch()} className="btn-ghost" style={{ fontSize: '11px', padding: '4px 10px', fontFamily: 'var(--font-space-mono)' }}>
            🔄 Refresh Feeds
          </button>
        </div>
      </div>
    </div>
  );
}
