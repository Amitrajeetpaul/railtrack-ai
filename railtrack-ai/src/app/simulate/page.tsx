'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LiveTrackMap from '@/components/LiveTrackMap';
import SystemFeedsModal from '@/components/SystemFeedsModal';
import RealPositionsMap, { RealTrainPosition } from '@/components/RealPositionsMap';
import DependencyGraph from '@/components/DependencyGraph';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Train } from '@/lib/mockData';
import { API_BASE, trainsQueryFor } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Radio, TriangleAlert, Zap, Rocket, Lightbulb, Satellite } from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';
import AppShell from '@/components/AppShell';

function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

type SimState = 'IDLE' | 'RUNNING' | 'RESULTS';

export default function SimulatePage() {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [simState, setSimState] = useState<SimState>('IDLE');
  const [selectedTrains, setSelectedTrains] = useState<string[]>([]);
  const [objective, setObjective] = useState('DELAY');
  const [disruptionType, setDisruptionType] = useState('HEAVY_WEATHER');
  const [disruptionLocation, setDisruptionLocation] = useState('AGC');
  const [disruptionDuration, setDisruptionDuration] = useState(120);
  const [numPlatforms, setNumPlatforms] = useState(2);
  const [headwayMinutes, setHeadwayMinutes] = useState(3);
  const [simResults, setSimResults] = useState<any>(null);

  const [isSystemsModalOpen, setIsSystemsModalOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const REAL_POSITIONS_CAP = 10;
  const [realPositions, setRealPositions] = useState<RealTrainPosition[] | null>(null);
  const [isFetchingRealPositions, setIsFetchingRealPositions] = useState(false);
  const [realPositionsNote, setRealPositionsNote] = useState<string | null>(null);

  // Simulation history — every /run call is a real, persisted record.
  // Running a NEW simulation always becomes "current" (simResults, above);
  // viewingHistoryEntry, when set, means we're looking at an OLDER run in
  // read-only mode, without disturbing what "current" means.
  const [viewingHistoryEntry, setViewingHistoryEntry] = useState<{ id: number; createdAt: string } | null>(null);
  const [historyResults, setHistoryResults] = useState<any>(null);
  const [isLoadingHistoryEntry, setIsLoadingHistoryEntry] = useState(false);

  const { data: simHistory = [] } = useQuery({
    queryKey: ['simulate-history'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/simulate/history?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthReady,
    refetchInterval: 15000,
  });

  const handleViewHistoryEntry = async (id: number, createdAt: string) => {
    setIsLoadingHistoryEntry(true);
    setViewingHistoryEntry({ id, createdAt });
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/simulate/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setHistoryResults(await res.json());
    } finally {
      setIsLoadingHistoryEntry(false);
    }
  };

  const handleBackToCurrent = () => {
    setViewingHistoryEntry(null);
    setHistoryResults(null);
  };

  // Whichever the page is actually displaying right now: the read-only
  // previous run if one's selected, otherwise the real current simResults.
  const displayedResults = viewingHistoryEntry ? historyResults : simResults;

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const { data: trains = [], isLoading: trainsLoading, error: trainsError } = useQuery({
    queryKey: ['trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/trains/${trainsQueryFor(user?.section)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json() as Promise<Train[]>;
    },
    enabled: isAuthReady,
  });

  // Jump straight to one section instead of scanning the full mixed list —
  // matters once a user (SUPERVISOR/ADMIN) has multiple real sections
  // imported (corridors, CSV uploads) alongside their own.
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const availableSections = Array.from(new Set(trains.map(t => t.section))).sort();
  const visibleTrains = sectionFilter === 'ALL' ? trains : trains.filter(t => t.section === sectionFilter);

  // Real active conflicts (train_a_id/train_b_id from the app's own
  // conflict-detection logic) — reused here to highlight, on the real
  // position map, which of the currently-plotted trains are actually
  // flagged as conflicting, rather than inventing a separate signal.
  const { data: activeConflicts = [] } = useQuery({
    queryKey: ['conflicts'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/conflicts/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthReady,
  });

  const conflictPairs: [string, string][] = realPositions
    ? (activeConflicts as any[])
        .filter(c => !c.resolved)
        .map(c => [c.train_a_id, c.train_b_id] as [string, string])
        .filter(([a, b]) => realPositions.some(p => p.trainNumber === a) && realPositions.some(p => p.trainNumber === b))
    : [];

  useEffect(() => {
    if (trains.length > 0 && selectedTrains.length === 0 && simState === 'IDLE') {
      setSelectedTrains(trains.map(t => t.id));
    }
  }, [trains, simState]);

  const locationOptions: { value: string; label: string }[] = (() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    trains.forEach(t => {
      if (t.origin && !seen.has(t.origin)) {
        seen.add(t.origin);
        opts.push({ value: t.origin, label: t.origin });
      }
      if (t.destination && !seen.has(t.destination)) {
        seen.add(t.destination);
        opts.push({ value: t.destination, label: t.destination });
      }
    });
    if (opts.length === 0) {
      opts.push({ value: 'AGC', label: 'AGC — Agra Cantt' });
      opts.push({ value: 'GWL', label: 'GWL — Gwalior' });
    }
    return opts;
  })();

  // Stress test — inspired by Flatland's malfunction_generators.py:
  // randomized disruptions across many runs, to report solver robustness
  // rather than trusting one hand-picked scenario.
  const [stressTestRuns, setStressTestRuns] = useState(10);
  const stressTestMutation = useMutation({
    mutationFn: async () => {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/simulate/stress-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ train_ids: selectedTrains, runs: stressTestRuns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Stress test failed');
      return data;
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`${API_BASE}/api/simulate/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to run simulation');
      return res.json();
    },
    onSuccess: (data) => {
      setSimResults(data);
      setSimState('RESULTS');
      setApplyMessage(null);
      // A fresh run is always "current" — drop out of any previous-run view.
      setViewingHistoryEntry(null);
      setHistoryResults(null);
      queryClient.invalidateQueries({ queryKey: ['simulate-history'] });
    },
    onError: (err: any) => {
      setSimState('IDLE');
      console.error('Simulation error:', err);
    }
  });

  const handleRun = () => {
    setSimState('RUNNING');
    const payload = {
      train_ids: selectedTrains.length > 0 ? selectedTrains : undefined,
      disruption_type: disruptionType || 'FREIGHT_DELAY',
      disruption_location: disruptionLocation || 'AGC',
      disruption_duration_minutes: Number(disruptionDuration) || 20,
      num_platforms: Number(numPlatforms) || 2,
      headway_minutes: Number(headwayMinutes) || 3,
      objective: objective === 'DELAY' ? 'MINIMIZE_DELAY'
               : objective === 'EXPRESS' ? 'PRIORITIZE_EXPRESS'
               : objective === 'THROUGHPUT' ? 'MAXIMIZE_THROUGHPUT'
               : objective,
    };
    simulateMutation.mutate(payload);
  };

  const handleApplyStrategy = async () => {
    if (!simResults?.simulation_id) return;
    setIsApplying(true);
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/simulate/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ simulation_id: simResults.simulation_id })
      });
      if (!res.ok) throw new Error('Failed to apply strategy');
      const data = await res.json();
      setApplyMessage(data.message);
      queryClient.invalidateQueries({ queryKey: ['trains'] });
      queryClient.invalidateQueries({ queryKey: ['conflicts'] });
    } catch (err: any) {
      setApplyMessage(`Error: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleShowRealPositions = async () => {
    if (selectedTrains.length === 0) return;
    const targets = selectedTrains.slice(0, REAL_POSITIONS_CAP);
    setRealPositionsNote(
      selectedTrains.length > REAL_POSITIONS_CAP
        ? `Showing real positions for the first ${REAL_POSITIONS_CAP} of ${selectedTrains.length} selected trains (capped to limit live API calls).`
        : null
    );
    setIsFetchingRealPositions(true);
    setRealPositions(null);
    try {
      const token = getClientToken();
      const results = await Promise.all(
        targets.map(async (trainId): Promise<RealTrainPosition> => {
          const trainMeta = trains.find(t => t.id === trainId);
          try {
            const res = await fetch(`${API_BASE}/api/trains/live/${trainId}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error('unavailable');
            const data = await res.json();
            return {
              trainNumber: trainId,
              trainName: data.train_name || trainMeta?.name || `Train ${trainId}`,
              lat: data.current_lat ?? null,
              lng: data.current_lng ?? null,
              delayMinutes: data.status === 'ok' ? (data.delay_minutes ?? 0) : null,
              currentStationName: data.current_station_name,
              nextStation: data.next_station,
              status: data.status === 'ok' ? 'ok' : (data.status || 'unavailable'),
              terminated: data.terminated ?? false,
            };
          } catch {
            return {
              trainNumber: trainId,
              trainName: trainMeta?.name || `Train ${trainId}`,
              lat: null,
              lng: null,
              delayMinutes: null,
              status: 'unavailable',
            };
          }
        })
      );
      setRealPositions(results);
    } finally {
      setIsFetchingRealPositions(false);
    }
  };

  // Real per-train baseline delay and priority, cross-referenced from the
  // solver's own schedule/trains data — the table previously showed a
  // literal hardcoded string ("Calculated Base Delay") and a fixed "OP"
  // badge for every single row, regardless of which train it was.
  const scheduleByTrain: Record<string, any> = Object.fromEntries(
    (displayedResults?.schedule || []).map((s: any) => [s.train, s])
  );
  const outcomeRows = (displayedResults?.actions || []).map((act: any) => {
    const trainMeta = trains.find(t => t.id === act.train);
    const schedEntry = scheduleByTrain[act.train];
    const baselineDelay = schedEntry ? (schedEntry.delay_minutes ?? 0) - act.delta : null;
    return {
      ...act,
      priority: trainMeta?.priority || '—',
      baselineLabel: baselineDelay == null ? '—'
        : baselineDelay > 0 ? `Delayed ${baselineDelay}m`
        : 'On Time',
    };
  });

  const handleExportCsv = () => {
    if (outcomeRows.length === 0) return;
    const header = ['Train ID', 'Priority', 'Baseline Delay (min)', 'AI Proposed Action', 'Delay Delta (min)'];
    const rows = outcomeRows.map((r: any) => [r.train, r.priority, r.baselineLabel, r.action, r.delta]);
    const csv = [header, ...rows].map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_${displayedResults?.simulation_id ?? 'results'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          AUTHENTICATING...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <AppShell active="simulate">
      {/* Main Content */}
      <div className="main-3col-row" style={{ height: '100%', paddingBottom: 0 }}>

        {/* ── LEFT PANEL (Form) ── */}
        <aside className="sidebar-right" style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', fontWeight: 700 }}>Scenario Simulator</h2>
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => { setSimState('IDLE'); setSimResults(null); setApplyMessage(null); }}>Reset</button>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Target Trains */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>TARGET TRAINS</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-ghost" style={{ fontSize: '10px', padding: '2px 4px' }} onClick={() => setSelectedTrains(visibleTrains.map(t => t.id))}>All</button>
                  <button className="btn-ghost" style={{ fontSize: '10px', padding: '2px 4px' }} onClick={() => setSelectedTrains([])}>Clear</button>
                </div>
              </div>
              {availableSections.length > 1 && (
                <select className="input" value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}
                  style={{ marginBottom: '8px', fontSize: '12px' }}>
                  <option value="ALL">All sections ({trains.length} trains)</option>
                  {availableSections.map(s => (
                    <option key={s} value={s}>{s} ({trains.filter(t => t.section === s).length})</option>
                  ))}
                </select>
              )}
              {trainsError ? (
                <div style={{ padding: '8px', fontSize: '11px', color: 'var(--accent-danger)', fontFamily: 'var(--font-space-mono)' }}>
                  Failed to load trains. Please refresh.
                </div>
              ) : trainsLoading ? (
                <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', fontStyle: 'italic' }}>
                  Loading trains…
                </div>
              ) : (
                <select className="input" multiple style={{ height: '110px' }} value={selectedTrains} onChange={e => setSelectedTrains(Array.from(e.target.selectedOptions, option => option.value))}>
                  {visibleTrains.map(t => (
                    <option key={t.id} value={t.id} style={{ padding: '4px', background: selectedTrains.includes(t.id) ? 'var(--bg-active)' : 'transparent' }}>
                      {t.id} — {t.origin} → {t.destination}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn-ghost"
                onClick={handleShowRealPositions}
                disabled={selectedTrains.length === 0 || isFetchingRealPositions}
                style={{ width: '100%', justifyContent: 'center', padding: '8px', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Satellite size={13} strokeWidth={2.25} />
                {isFetchingRealPositions ? 'Fetching real positions...' : `Show Real Live Positions${selectedTrains.length > 0 ? ` (${Math.min(selectedTrains.length, REAL_POSITIONS_CAP)})` : ''}`}
              </button>
            </div>

            {/* Event Type */}
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>DISRUPTION EVENT</label>
              <select className="input" value={disruptionType} onChange={e => setDisruptionType(e.target.value)}>
                <option value="HEAVY_WEATHER">Heavy Weather (Speed restrictions)</option>
                <option value="ENGINE_BREAKDOWN">Engine Breakdown</option>
                <option value="SIGNAL_FAILURE">Signal Failure</option>
                <option value="MAINTENANCE">Emergency Track Maintenance</option>
              </select>
            </div>

            {/* Parameters */}
            <div className="grid-2col-responsive" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>LOCATION</label>
                <select className="input" value={disruptionLocation} onChange={e => setDisruptionLocation(e.target.value)}>
                  {locationOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  {!locationOptions.find(o => o.value === (user?.section || 'NR-42')) && (
                    <option value={user?.section || 'NR-42'}>Seg: {user?.section || 'NR-42'}</option>
                  )}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>DURATION</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="number" className="input" value={disruptionDuration} onChange={e => setDisruptionDuration(Number(e.target.value))} />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>min</span>
                </div>
              </div>
            </div>

            {/* Advanced Section Characteristics */}
            <div className="grid-2col-responsive" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid var(--bg-border)', paddingTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>PLATFORMS</label>
                <input type="number" min="1" max="6" className="input" value={numPlatforms} onChange={e => setNumPlatforms(Number(e.target.value))} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>HEADWAY GAP</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="number" min="1" max="15" className="input" value={headwayMinutes} onChange={e => setHeadwayMinutes(Number(e.target.value))} />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>min</span>
                </div>
              </div>
            </div>

            {/* Optimization Objective */}
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>AI OBJECTIVE</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="obj" checked={objective === 'DELAY'} onChange={() => setObjective('DELAY')} />
                  <span style={{ fontSize: '13px' }}>Minimize Total System Delay</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="obj" checked={objective === 'EXPRESS'} onChange={() => setObjective('EXPRESS')} />
                  <span style={{ fontSize: '13px' }}>Prioritize Express/Premium</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="obj" checked={objective === 'THROUGHPUT'} onChange={() => setObjective('THROUGHPUT')} />
                  <span style={{ fontSize: '13px' }}>Maximize Section Throughput</span>
                </label>
              </div>
            </div>

            {/* Run Button */}
            <div style={{ marginTop: '8px' }}>
              <button
                className="btn-primary"
                onClick={handleRun}
                disabled={simState === 'RUNNING'}
                style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                {simState === 'RUNNING' ? (
                  <>
                    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #0A0C10', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    Running Simulation...
                  </>
                ) : '▶ Run OR-Tools Solver'}
              </button>
            </div>

            {/* Stress Test */}
            <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '16px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
                STRESS TEST — RANDOMIZED DISRUPTIONS
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="number" min="1" max="25" className="input" value={stressTestRuns}
                  onChange={e => setStressTestRuns(Number(e.target.value))} style={{ width: '70px' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>runs</span>
                <button
                  className="btn-ghost"
                  onClick={() => { stressTestMutation.reset(); stressTestMutation.mutate(); }}
                  disabled={selectedTrains.length === 0 || stressTestMutation.isPending}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px', fontSize: '12px' }}>
                  {stressTestMutation.isPending ? 'Testing...' : 'Run Stress Test'}
                </button>
              </div>
            </div>
          </div>
        </aside>


        {/* ── CENTER AREA (Map & Results) ── */}
        <main className="main-content-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <Breadcrumb items={[{ label: 'Simulate' }]} />
            <button
              onClick={() => setIsSystemsModalOpen(true)}
              className="badge-safe"
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontFamily: 'var(--font-headline)', fontSize: '12px', border: 'none'
              }}>
              <Radio size={14} strokeWidth={2.25} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} /> Railway Systems Feeds (COA/FOIS)
            </button>
          </div>

          {simHistory.length > 0 && (
            <div className="panel" style={{ marginBottom: '24px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="panel-header">Simulation History — {simHistory.length} previous run{simHistory.length !== 1 ? 's' : ''}</span>
                {viewingHistoryEntry && (
                  <button className="btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={handleBackToCurrent}>← Back to Current</button>
                )}
              </div>
              <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                {simHistory.map((h: any) => (
                  <div key={h.id}
                    onClick={() => handleViewHistoryEntry(h.id, h.created_at)}
                    style={{
                      padding: '8px 16px', borderBottom: '1px solid var(--bg-border)', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px',
                      background: viewingHistoryEntry?.id === h.id ? 'var(--bg-active)' : 'transparent',
                    }}>
                    <span>
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>#{h.id}</span>
                      {' '}{h.event_type} @ {h.location} — {h.objective}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-jetbrains)' }}>
                      {h.optimized_delay != null ? `${h.optimized_delay}m optimized` : '—'} · {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewingHistoryEntry && (
            <div className="animate-slide-in" style={{
              padding: '12px 16px', background: 'rgba(148,163,184,0.12)', border: '1px solid var(--bg-border)',
              borderRadius: 'var(--radius-xs)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Viewing Previous Simulation #{viewingHistoryEntry.id} — run {new Date(viewingHistoryEntry.createdAt).toLocaleString()} (read-only)
              </span>
              <button className="btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={handleBackToCurrent}>← Back to Current</button>
            </div>
          )}

          {(stressTestMutation.isPending || stressTestMutation.isSuccess || stressTestMutation.isError) && (
            <div className="panel animate-slide-in" style={{ marginBottom: '24px', padding: '16px' }}>
              <div className="panel-header" style={{ marginBottom: '8px' }}>Stress Test — Robustness Report</div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Randomized disruption scenarios run against the selected trains — not a real scenario, not saved to
                Simulation History. Measures how robust this train set's schedule is, not one hand-picked outcome.
              </p>
              {stressTestMutation.isPending && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>Running {stressTestRuns} randomized scenarios...</div>
              )}
              {stressTestMutation.isError && (
                <div style={{ fontSize: '12px', color: 'var(--accent-danger)' }}>{(stressTestMutation.error as Error).message}</div>
              )}
              {stressTestMutation.isSuccess && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>FEASIBILITY</div>
                      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-jetbrains)', color: stressTestMutation.data.feasibility_pct >= 80 ? 'var(--accent-safe)' : 'var(--accent-danger)' }}>
                        {stressTestMutation.data.feasibility_pct}%
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{stressTestMutation.data.feasible_runs}/{stressTestMutation.data.total_runs} runs</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>AVG OPTIMIZED DELAY</div>
                      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-jetbrains)' }}>
                        {stressTestMutation.data.avg_optimized_delay ?? '—'}m
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        range {stressTestMutation.data.min_optimized_delay ?? '—'}–{stressTestMutation.data.max_optimized_delay ?? '—'}m
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>AVG CONFLICTS AVOIDED</div>
                      <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-jetbrains)' }}>
                        {stressTestMutation.data.avg_conflicts_avoided ?? '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ maxHeight: '140px', overflowY: 'auto', fontSize: '11px' }}>
                    {stressTestMutation.data.runs.map((r: any) => (
                      <div key={r.run} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--bg-border)' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          #{r.run} {r.disruption_type} @ {r.disruption_location} ({r.disruption_duration_minutes}min)
                        </span>
                        <span style={{ color: ['OPTIMAL', 'FEASIBLE'].includes(r.status) ? 'var(--accent-safe)' : 'var(--accent-danger)', fontFamily: 'var(--font-jetbrains)' }}>
                          {r.status}{r.optimized_delay != null ? ` · ${r.optimized_delay}m` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {(realPositions || isFetchingRealPositions) && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '16px', marginBottom: '16px' }}>Real Live Positions</h3>
              {realPositionsNote && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>{realPositionsNote}</div>
              )}
              {isFetchingRealPositions ? (
                <div className="skeleton" style={{ width: '100%', height: '300px', borderRadius: 'var(--radius-sm)' }} />
              ) : (
                <RealPositionsMap positions={realPositions!} conflictPairs={conflictPairs} />
              )}
            </div>
          )}

          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '16px', marginBottom: '16px' }}>Scenario Context: T-0</h3>
            <LiveTrackMap />
          </div>

          {simState === 'IDLE' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--bg-border)', borderRadius: 'var(--radius-xs)', color: 'var(--text-muted)' }}>
              Configure scenario parameters on the left and run simulation to see what-if outcomes.
            </div>
          )}

          {simState === 'RUNNING' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <div className="skeleton" style={{ width: '100%', maxWidth: '800px', height: '240px', borderRadius: 'var(--radius-xs)' }} />
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--accent-primary)', animation: 'pulse-live 1s infinite' }}>
                Evaluating combinatorial precedence constraints...
              </div>
            </div>
          )}

          {(simState === 'RESULTS' || viewingHistoryEntry) && displayedResults?.status && !['OPTIMAL', 'FEASIBLE'].includes(displayedResults.status) && (
            <div className="animate-slide-in" style={{
              padding: '20px', background: '#FFEBEE', border: '1px solid #FFCDD2',
              borderRadius: 'var(--radius-xs)', display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TriangleAlert size={15} strokeWidth={2.25} /> No Feasible Schedule Found ({displayedResults.status})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                The solver could not find any valid schedule that satisfies every safety constraint
                (headway gap, platform capacity) for this train set under these parameters. This is not
                a system error — it means the scenario is genuinely over-constrained. Try increasing
                platform count, reducing the number of target trains, or loosening the headway gap.
              </div>
            </div>
          )}

          {(simState === 'RESULTS' || viewingHistoryEntry) && displayedResults?.status && ['OPTIMAL', 'FEASIBLE'].includes(displayedResults.status) && (
            <div className="animate-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Apply Strategy Banner — only for the genuine current run; a
                  historical result is read-only, applying it would silently
                  re-target live trains from an old scenario as if it were now. */}
              {!viewingHistoryEntry ? (
                <div style={{
                  padding: '16px 20px', background: 'rgba(0, 212, 255, 0.08)',
                  border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: 'var(--radius-xs)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} strokeWidth={2.25} /> AI OPTIMIZATION PLAN READY (SIMULATION #{simResults?.simulation_id})
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {applyMessage ? applyMessage : 'Review recommendations below and apply directly to live section trains in PostgreSQL.'}
                    </div>
                  </div>
                  <button
                    onClick={handleApplyStrategy}
                    disabled={isApplying}
                    className="btn-primary"
                    style={{ padding: '10px 18px', fontSize: '13px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {isApplying ? 'Applying Strategy...' : <><Rocket size={14} strokeWidth={2.25} /> Apply Strategy to Live Corridor</>}
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '16px 20px', background: 'rgba(148,163,184,0.08)',
                  border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)',
                }}>
                  <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    PREVIOUS SIMULATION #{viewingHistoryEntry.id} (READ-ONLY)
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    This is a completed prior run — not applied to live trains from here. Go back to Current to run a new scenario.
                  </div>
                </div>
              )}

              {/* Metrics Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Optimized Delay</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--accent-safe)' }}>{displayedResults?.optimized_delay ?? '—'}m</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Baseline {displayedResults?.baseline_delay ?? '—'}m
                      {displayedResults?.delay_delta != null
                        ? ` (${displayedResults.delay_delta > 0 ? '+' : ''}${displayedResults.delay_delta}m)`
                        : ''}
                    </span>
                  </div>
                </div>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Throughput Retained</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {displayedResults?.throughput_change ?? '—'}%
                    </span>
                    <span className={displayedResults?.throughput_change >= 80 ? 'badge-safe' : 'badge-warn'} style={{ marginBottom: '6px' }}>
                      {displayedResults?.throughput_change >= 80 ? 'good' : 'reduced'}
                    </span>
                  </div>
                </div>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Conflicts Avoided</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)' }}>{displayedResults?.conflicts_avoided ?? '—'}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>HOLD/REROUTE actions</span>
                  </div>
                </div>
              </div>

              {/* AI Recommendations */}
              {(displayedResults?.schedule?.length ?? 0) > 0 && (
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '12px' }}>AI Recommendations & XAI Rationale</div>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(displayedResults.schedule as any[]).map((item: any, i: number) => (
                      <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{item.train_name || item.train}</span>
                        {' — '}
                        <span style={{
                          fontWeight: 600,
                          color: item.action === 'PROCEED' ? 'var(--accent-safe)'
                               : item.action === 'HOLD'    ? '#F59E0B'
                               : 'var(--accent-danger)'
                        }}>{item.action}</span>
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          (Platform {item.platform || 1})
                        </span>
                        {item.xai_explanation && (
                          <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <Lightbulb size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: '1px' }} /> Operational Reasoning: {item.xai_explanation}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Dependency Graph — who's actually waiting on whom */}
              {(displayedResults?.schedule?.length ?? 0) > 0 && (
                <DependencyGraph schedule={displayedResults.schedule} />
              )}

              {/* Table Comparison */}
              <div className="panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="panel-header">Train Outcomes (Baseline vs AI Optimized)</span>
                  <button className="btn-ghost" style={{ fontSize: '11px', padding: '4px 12px' }} onClick={handleExportCsv} disabled={outcomeRows.length === 0}>Export CSV</button>
                </div>
                <div className="table-scroll-wrap">
                <table className="data-table" style={{ minWidth: '600px' }}>
                  <thead>
                    <tr>
                      <th>Train ID</th>
                      <th>Priority</th>
                      <th>Baseline</th>
                      <th>AI Proposed Action</th>
                      <th>Delay Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomeRows.map((act: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{act.train}</td>
                        <td><span className="badge-rail">{act.priority}</span></td>
                        <td>{act.baselineLabel}</td>
                        <td>{act.action}</td>
                        <td style={{ fontFamily: 'var(--font-jetbrains)', color: act.delta < 0 ? 'var(--accent-safe)' : (act.delta > 0 ? 'var(--accent-danger)' : 'var(--text-secondary)') }}>
                          {act.delta > 0 ? '+' : ''}{act.delta} min
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Dynamic Gantt Timeline */}
              <div className="panel" style={{ padding: '16px', minHeight: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <span className="panel-header">Time-Space Gantt Projection</span>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '10px', fontFamily: 'var(--font-space-mono)' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-xs)', background: '#00E676' }} /> PROCEED
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-xs)', background: '#FFD600' }} /> HOLD
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-xs)', background: '#FF5252' }} /> REROUTE
                    </div>
                  </div>
                </div>
                
                <div style={{ position: 'relative', height: '200px', display: 'flex', gap: '12px' }}>
                  {/* Y-axis Labels (Trains) */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: '80px', borderRight: '1px solid var(--bg-border)' }}>
                    {Array.from(new Set((displayedResults?.schedule || []).map((s: any) => s.train_number))).map((tn: any) => (
                      <div key={tn} style={{ fontSize: '10px', fontFamily: 'var(--font-space-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {tn}
                      </div>
                    ))}
                  </div>

                  {/* SVG Layer */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                     {(() => {
                        const schedule = displayedResults?.schedule || [];
                        if (schedule.length === 0) return (
                          <text x="50%" y="50%" fill="var(--text-muted)" fontSize="12" textAnchor="middle">
                            No schedule data returned from solver
                          </text>
                        );

                        const uniqueTrains = Array.from(new Set(schedule.map((s: any) => s.train_number))) as string[];
                        const rowHeight = 100 / uniqueTrains.length;

                        const arrivals = schedule.map((s: any) => Number(s.scheduled_arrival) || 0);
                        const minT = Math.min(...arrivals);
                        const maxT = Math.max(...arrivals);
                        const hasRealTime = maxT - minT > 3600;

                        const range = hasRealTime ? (maxT - minT) : (schedule.length * 900);

                        const formatSecs = (s: number) => {
                          const h = Math.floor(s / 3600) % 24;
                          const m = Math.floor((s % 3600) / 60);
                          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        };

                        return (
                          <>
                            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                              <g key={i}>
                                <line
                                  x1={`${pct * 100}%`} y1="0" x2={`${pct * 100}%`} y2="100%"
                                  stroke="var(--bg-border)" strokeWidth="1" strokeDasharray="4 4"
                                />
                                <text
                                  x={`${pct * 100}%`} y="110%"
                                  fill="var(--text-muted)" fontSize="9" textAnchor="middle" fontFamily="var(--font-jetbrains)"
                                >
                                  {hasRealTime ? formatSecs(minT + pct * range) : `+${Math.round(pct * schedule.length * 15)}m`}
                                </text>
                              </g>
                            ))}

                            {schedule.map((entry: any, i: number) => {
                              const trainIdx = uniqueTrains.indexOf(entry.train_number);
                              const slotWidth = 100 / schedule.length;

                              const startPct = hasRealTime
                                ? ((arrivals[i] - minT) / range) * 100
                                : i * slotWidth;

                              const delayMins = Number(entry.delay_minutes) || 0;
                              const widthPct = hasRealTime
                                ? Math.max(((delayMins * 60) / range) * 100, 3)
                                : Math.max(slotWidth * 0.4, 3);

                              const color = entry.action === 'PROCEED' ? '#00E676'
                                : entry.action === 'HOLD' ? '#FFD600'
                                : '#FF5252';

                              return (
                                <g key={i}>
                                  <rect
                                    x={`${startPct}%`}
                                    y={`${trainIdx * rowHeight + 5}%`}
                                    width={`${widthPct}%`}
                                    height={`${rowHeight * 0.7}%`}
                                    fill={color}
                                    fillOpacity="0.5"
                                    stroke={color}
                                    strokeWidth="1"
                                    rx="2"
                                  />
                                  <text
                                    x={`${startPct + widthPct / 2}%`}
                                    y={`${trainIdx * rowHeight + rowHeight / 2 + 3}%`}
                                    fill="white" fontSize="8" textAnchor="middle" fontFamily="var(--font-space-mono)"
                                  >
                                    {delayMins > 0 ? `${delayMins}m` : entry.action?.slice(0, 4) || '—'}
                                  </text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
      <SystemFeedsModal isOpen={isSystemsModalOpen} onClose={() => setIsSystemsModalOpen(false)} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </AppShell>
  );
}

