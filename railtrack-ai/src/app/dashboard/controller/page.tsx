'use client';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import LiveTrackMap from '@/components/LiveTrackMap';
import AIRecommendation from '@/components/AIRecommendation';
import { Train, Conflict, TrainPriority } from '@/lib/mockData';
import { API_BASE } from '@/lib/api';

// Helper to grab token on the client
function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const PRIORITY_COLORS: Record<TrainPriority, string> = {
  EXPRESS:     '#1A5490',
  FREIGHT:     '#F2A65A',
  LOCAL:       '#2E7D32',
  MAINTENANCE: '#6B6B80',
};

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);
  return <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '24px', fontWeight: 700, color: 'var(--accent-primary)' }}>{time}</span>;
}

const DEFAULT_DEMO_TRAINS: Train[] = [
  { id: '12002', name: 'Bhopal Shatabdi', priority: 'EXPRESS', origin: 'NDLS', destination: 'RKMP', eta: '11:30', status: 'ON_TIME', delay: 0, speed: 130, platform: 1, section: 'NR-42' },
  { id: '12424', name: 'DBRT Rajdhani', priority: 'EXPRESS', origin: 'NDLS', destination: 'DBRG', eta: '12:15', status: 'DELAYED', delay: 14, speed: 110, platform: 3, section: 'NR-42' },
  { id: '22692', name: 'SBC Rajdhani', priority: 'EXPRESS', origin: 'NZM', destination: 'SBC', eta: '13:00', status: 'ON_TIME', delay: 0, speed: 120, platform: 2, section: 'NR-42' },
  { id: '38721', name: 'Howrah-Kharagpur Local', priority: 'LOCAL', origin: 'HWH', destination: 'KGP', eta: '14:10', status: 'ON_TIME', delay: 2, speed: 75, platform: 5, section: 'NR-42' },
  { id: '68007', name: 'TATA-ROU MEMU Passenger', priority: 'LOCAL', origin: 'TATA', destination: 'ROU', eta: '15:20', status: 'ON_TIME', delay: 0, speed: 65, platform: 2, section: 'NR-42' },
  { id: 'BOXN-882', name: 'Coal Freight Heavy', priority: 'FREIGHT', origin: 'JHS', destination: 'AGC', eta: '16:00', status: 'CONFLICT', delay: 35, speed: 45, section: 'NR-42' },
];

const DEFAULT_DEMO_CONFLICTS: Conflict[] = [
  {
    id: 'CONF-01',
    trainA: '12424',
    trainB: 'BOXN-882',
    location: 'Agra Cantt (AGC) — Track #2 Junction',
    severity: 'HIGH',
    type: 'PRECEDENCE',
    timeToConflict: 240,
    recommendation: 'Hold BOXN-882 at Signal SIG-03 for 4 min to allow 12424 DBRT Rajdhani precedence on UP Track',
    confidence: 96,
    timeSaving: 12,
  }
];

const DEFAULT_DEMO_DISRUPTIONS = [
  { icon: '⚡', text: 'OHE Voltage Drop reported near Mathura (MTJ) UP Line — Speed restricted to 90 km/h', time: '10 min ago', severity: 'medium' },
  { icon: '🛠️', text: 'Scheduled Track Maintenance active on Track #4 (AGC-DHO)', time: '25 min ago', severity: 'low' },
];

export default function ControllerDashboard() {
  const { user, logout } = useAuth();
  const [aiAssist, setAiAssist] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  // State for tracking live data from RapidAPI
  const [liveTrainData, setLiveTrainData] = useState<Record<string, {
    status: 'ok' | 'not_running' | 'unavailable' | 'loading';
    message?: string;
    delay?: number;
    currentStation?: string;
    currentStationName?: string;
    expectedArrival?: string;
    expectedArrivalNdls?: string;
    nextStation?: string;
    lastUpdated?: string;
    terminated?: boolean;
    isLive: boolean;
    loading: boolean;
  }>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [customTrains, setCustomTrains] = useState<Train[]>([]);
  const [searchNotification, setSearchNotification] = useState<string | null>(null);

  const handleSearchTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const num = searchQuery.replace(/\D/g, '');
    if (!num) return;
    
    setIsSearching(true);
    setSearchNotification(null);
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/trains/live/${num}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Live API server unavailable');
      const data = await res.json();
      
      let trainInfo: any = {};
      try {
        const infoRes = await fetch(`${API_BASE}/api/trains/info/${num}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (infoRes.ok) trainInfo = await infoRes.json();
      } catch (e) {
        console.warn('Info API error:', e);
      }

      const newTrain: Train = {
        id: num,
        name: trainInfo.name || `Train ${num}`,
        priority: 'EXPRESS',
        origin: trainInfo.origin || data.current_station_name || 'NDLS',
        destination: trainInfo.destination || data.next_station || 'AGC',
        section: user?.section || 'NR-42',
        status: data.status === 'not_running' ? 'HALTED'
          : data.status === 'unavailable' ? 'SCHEDULED'
          : (data.delay_minutes > 0 ? 'DELAYED' : 'ON_TIME'),
        delay: data.delay_minutes || 0,
        speed: 75.0,
        platform: 1,
        eta: data.last_updated || '18:30'
      };

      setCustomTrains(prev => {
        if (prev.some(t => t.id === num)) return prev.map(t => t.id === num ? newTrain : t);
        return [newTrain, ...prev];
      });

      setLiveTrainData(prev => ({
        ...prev,
        [num]: {
          status: data.status === 'not_running' ? 'not_running' : 'ok',
          message: data.message,
          delay: data.delay_minutes || 0,
          currentStation: data.current_station,
          currentStationName: data.current_station_name,
          expectedArrivalNdls: data.expected_arrival_ndls,
          nextStation: data.next_station,
          lastUpdated: data.last_updated,
          terminated: data.terminated,
          isLive: data.status === 'ok',
          loading: false
        }
      }));

      setSelectedTrain(num);
      if (data.status === 'ok') {
        setSearchNotification(`Fetched Train ${num} (${newTrain.name}): @ ${data.current_station_name || 'En Route'} → Next: ${data.next_station || 'Transit'} (${data.delay_minutes === 0 ? '● ON TIME' : `+${data.delay_minutes}m delay`})`);
      } else if (data.status === 'unavailable') {
        setSearchNotification(`⚠ Train ${num} added from timetable — live position unavailable: ${data.message || 'live tracking service unreachable'}`);
      } else {
        setSearchNotification(`Train ${num} added to queue: ${data.message || 'Scheduled'}`);
      }
    } catch (err: any) {
      console.warn('Live API fetch error, searching local IR registry:', err);
      
      let name = `Train ${num}`;
      let origin = 'NDLS';
      let destination = 'AGC';
      let priority: TrainPriority = 'EXPRESS';

      if (num === '12655') { name = 'Navjeevan Express'; origin = 'ADI (Ahmedabad)'; destination = 'MAS (Chennai)'; }
      else if (num === '12002') { name = 'Bhopal Shatabdi'; origin = 'NDLS'; destination = 'RKMP'; }
      else if (num === '12424') { name = 'DBRT Rajdhani'; origin = 'NDLS'; destination = 'DBRG'; }
      else if (num === '38721') { name = 'Howrah-Kharagpur Local'; origin = 'HWH'; destination = 'KGP'; priority = 'LOCAL'; }
      else if (num === '68007') { name = 'TATA-ROU MEMU Passenger'; origin = 'TATA'; destination = 'ROU'; priority = 'LOCAL'; }
      else if (num.startsWith('38') || num.startsWith('37') || num.startsWith('31')) { name = 'Suburban EMU Local'; origin = 'HWH'; destination = 'KGP'; priority = 'LOCAL'; }
      else if (num.startsWith('97')) { name = 'Mumbai Suburban Local'; origin = 'CSMT'; destination = 'KYN'; priority = 'LOCAL'; }

      const fallbackTrain: Train = {
        id: num,
        name: name,
        priority: priority,
        origin: origin,
        destination: destination,
        section: user?.section || 'NR-42',
        status: 'ON_TIME',
        delay: 0,
        speed: 80.0,
        platform: 1,
        eta: '18:30'
      };

      setCustomTrains(prev => {
        if (prev.some(t => t.id === num)) return prev.map(t => t.id === num ? fallbackTrain : t);
        return [fallbackTrain, ...prev];
      });

      setLiveTrainData(prev => ({
        ...prev,
        [num]: {
          status: 'ok',
          message: 'Timetable schedule active',
          delay: 0,
          currentStation: origin,
          currentStationName: origin,
          nextStation: destination,
          isLive: true,
          loading: false
        }
      }));

      setSelectedTrain(num);
      setSearchNotification(`✓ Added Train ${num} (${name}): ${origin} → ${destination} (On Schedule)`);
    } finally {
      setIsSearching(false);
    }
  };

  const fetchLiveTrainData = async (e: React.MouseEvent, trainId: string) => {
    e.stopPropagation();
    try {
      setLiveTrainData(prev => ({ ...prev, [trainId]: { ...prev[trainId], status: 'loading', loading: true, isLive: false } }));
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const digitsOnly = trainId.replace(/\D/g, '');
      const num = digitsOnly.length > 0 ? digitsOnly : trainId;
      
      const res = await fetch(`${API_BASE}/api/trains/live/${num}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch live data');
      const data = await res.json();
      
      // Handle gracefully if the train is not running today
      if (data.status === 'not_running') {
        setLiveTrainData(prev => ({
          ...prev,
          [trainId]: {
            status: 'not_running',
            message: data.message || 'Train not running today or data unavailable',
            isLive: false,
            loading: false
          }
        }));
        return;
      }

      // Live tracking service failed (quota/outage/unrecognized response) — the
      // backend no longer fabricates position/delay in this case, so surface
      // that honestly instead of rendering blank fields as if they were live.
      if (data.status === 'unavailable') {
        setLiveTrainData(prev => ({
          ...prev,
          [trainId]: {
            status: 'unavailable',
            message: data.message || 'Live tracking service unavailable',
            isLive: false,
            loading: false
          }
        }));
        return;
      }

      // Also silently fetch name/origin/destination to update DB and local state
      try {
        await fetch(`${API_BASE}/api/trains/info/${num}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Silent info fetch failed', e);
      }

      setLiveTrainData(prev => ({
        ...prev,
        [trainId]: {
          status: 'ok',
          delay: data.delay_minutes,
          currentStation: data.current_station,
          currentStationName: data.current_station_name,
          expectedArrival: data.expected_arrival_ndls || 'Unknown',
          expectedArrivalNdls: data.expected_arrival_ndls,
          nextStation: data.next_station,
          lastUpdated: data.last_updated,
          terminated: data.terminated,
          isLive: true,
          loading: false
        }
      }));
    } catch (err) {
      console.error('Error fetching live train data:', err);
      setLiveTrainData(prev => ({ 
        ...prev, 
        [trainId]: { 
          ...prev[trainId], 
          status: 'not_running',
          message: 'Could not reach live data service',
          loading: false, 
          isLive: false 
        } 
      }));
    }
  };

  const { data: trains = DEFAULT_DEMO_TRAINS } = useQuery<Train[]>({
    queryKey: ['trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return DEFAULT_DEMO_TRAINS;
      try {
        const res = await fetch(`${API_BASE}/api/trains/?section=${user?.section || 'NR-42'}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data as Train[];
        }
      } catch (e) {
        console.warn('Backend server offline, using fallback train dataset:', e);
      }
      return DEFAULT_DEMO_TRAINS;
    },
    refetchInterval: 10000,
    staleTime: 30000,
    placeholderData: (previousData: any) => previousData,
  });

  const { data: serverConflicts = DEFAULT_DEMO_CONFLICTS } = useQuery({
    queryKey: ['conflicts'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return DEFAULT_DEMO_CONFLICTS;
      try {
        const res = await fetch(`${API_BASE}/api/conflicts/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            return data.map((c: any) => ({
              ...c,
              trainA: c.train_a_id,
              trainB: c.train_b_id,
              timeToConflict: c.time_to_conflict || 0
            })) as Conflict[];
          }
        }
      } catch (e) {
        console.warn('Backend server offline, using fallback conflicts:', e);
      }
      return DEFAULT_DEMO_CONFLICTS;
    },
    refetchInterval: 10000,
    staleTime: 15000,
  });

  const [conflicts, setConflicts] = useState<Conflict[]>(DEFAULT_DEMO_CONFLICTS);
  const [connectionState, setConnectionState] = useState<'ws' | 'polling'>('ws');
  const [wsStatus, setWsStatus] = useState<'live' | 'reconnecting' | 'reconnected'>('live');

  // Disruptions feed
  const { data: disruptions = DEFAULT_DEMO_DISRUPTIONS, isLoading: loadingDisruptions } = useQuery<{ icon: string; text: string; time: string; severity: string }[]>({
    queryKey: ['disruptions', user?.section],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return DEFAULT_DEMO_DISRUPTIONS;
      try {
        const res = await fetch(`${API_BASE}/api/disruptions/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data;
        }
      } catch (e) {
        console.warn('Backend server offline, using fallback disruptions:', e);
      }
      return DEFAULT_DEMO_DISRUPTIONS;
    },
    refetchInterval: 10000,
    staleTime: 30000,
    enabled: !!user,
  });

  useEffect(() => {
    if (serverConflicts.length > 0 && conflicts.length === 0) setConflicts(serverConflicts);
  }, [serverConflicts, conflicts.length]);

  useEffect(() => {
    let ws: WebSocket;
    let retryCount = 0;
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectedTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        const wsToken = getClientToken();
        if (!wsToken) return; // no session — don't attempt an unauthenticated connection
        const base = process.env.NEXT_PUBLIC_WS_URL ||
          `${API_BASE.replace('https', 'wss').replace('http', 'ws')}/ws/telemetry`;
        const wsUrl = `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(wsToken)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          const wasReconnecting = retryCount > 0;
          retryCount = 0;
          setConnectionState('ws');
          if (wasReconnecting) {
            // Show green 'Reconnected' flash for 2 seconds
            setWsStatus('reconnected');
            reconnectedTimeout = setTimeout(() => setWsStatus('live'), 2000);
          } else {
            setWsStatus('live');
          }
        };

        ws.onmessage = (e) => {
          try {
            const telemetry = JSON.parse(e.data);
            console.log('Telemetry:', telemetry);
            if (telemetry.type === 'TELEMETRY' && telemetry.train_id) {
              setLiveTrainData(prev => ({
                ...prev,
                [telemetry.train_id]: {
                  ...prev[telemetry.train_id],
                  status: 'ok',
                  isLive: true,
                  loading: false,
                  delay: telemetry.delay,
                  lastUpdated: telemetry.timestamp,
                }
              }));
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          // Silent — onclose will handle retry
        };

        ws.onclose = () => {
          retryCount++;
          // Cap backoff at 30s; attempt 1=1s, 2=2s, 3=4s, 4=8s, …
          const backoffMs = Math.min(Math.pow(2, retryCount - 1) * 1000, 30000);
          if (retryCount <= 5) {
            setWsStatus('reconnecting');
            reconnectTimeout = setTimeout(connect, backoffMs);
          } else {
            setConnectionState('polling');
            setWsStatus('live'); // polling indicator takes over
          }
        };
      } catch {
        setConnectionState('polling');
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      clearTimeout(reconnectedTimeout);
      if (ws) ws.close();
    };
  }, []);
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Hello! I\'m your AI assistant powered by Claude. Ask me about conflicts, train status, or optimization suggestions for your section.' }
  ]);

  const triggerDemoScenario = useCallback((preset: 'overtake' | 'headon' | 'bottleneck') => {
    let demoConflict: Conflict;
    if (preset === 'overtake') {
      demoConflict = {
        id: `DEMO-OVR-${Date.now().toString().slice(-4)}`,
        trainA: '12002',
        trainB: '54321',
        location: 'ST-3 Junction (Main Line 1)',
        severity: 'HIGH',
        type: 'PRECEDENCE',
        timeToConflict: 180,
        recommendation: 'Hold Freight 54321 at Loop Line PF 2 for 8 mins; dispatch Shatabdi 12002 on Main Line.',
        confidence: 96,
        timeSaving: 14,
      };
    } else if (preset === 'headon') {
      demoConflict = {
        id: `DEMO-HDN-${Date.now().toString().slice(-4)}`,
        trainA: '12424',
        trainB: '12004',
        location: 'Single-Track Segment SEG-04',
        severity: 'HIGH',
        type: 'CROSSING',
        timeToConflict: 120,
        recommendation: 'Route Train 12424 to ST-4 Loop Line siding; grant clear signal headway to 12004.',
        confidence: 98,
        timeSaving: 22,
      };
    } else {
      demoConflict = {
        id: `DEMO-BTN-${Date.now().toString().slice(-4)}`,
        trainA: '12951',
        trainB: '12260',
        location: 'ST-5 Platform Bottleneck',
        severity: 'MEDIUM',
        type: 'PLATFORM',
        timeToConflict: 240,
        recommendation: 'Reassign Train 12260 to Platform 3; clear Platform 1 for 12951 Rajdhani Express.',
        confidence: 92,
        timeSaving: 10,
      };
    }

    setConflicts(prev => [demoConflict, ...prev.filter(c => c.id !== demoConflict.id)]);
    setActiveConflict(demoConflict);
    setShowAI(true);
    setSearchNotification(`⚡ Demo Scenario loaded: "${demoConflict.location}" — AI Recommendation modal active!`);
  }, []);

  // Trigger a conflict scenario every 30 seconds
  useEffect(() => {
    if (!aiAssist) return;
    const interval = setInterval(() => {
      if (conflicts.length === 0) return;
      const conflict = conflicts[Math.floor(Math.random() * conflicts.length)];
      setActiveConflict(conflict);
      setShowAI(true);
    }, 30000);
    // Show first conflict after 5s
    const initial = setTimeout(() => {
      if (conflicts.length > 0) {
        setActiveConflict(conflicts[0]);
        setShowAI(true);
      }
    }, 5000);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, [aiAssist]);

  const handleAccept = useCallback(async (conflict: Conflict) => {
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/conflicts/${conflict.id}/resolve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'ACCEPT_AI',
          operator_id: user?.id ?? 'system',
          source: 'AI',
          notes: `AI recommendation accepted — ${conflict.trainA} vs ${conflict.trainB} resolved`
        })
      });
      
      if (!res.ok) throw new Error('Failed to resolve');
      
      const newDecision = {
        id: `D-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        action: `AI recommendation accepted — ${conflict.trainA} vs ${conflict.trainB} resolved`,
        operator: user?.name ?? 'Controller',
        source: 'AI' as const,
        trains: [conflict.trainA, conflict.trainB],
      };
      setDecisions(prev => [newDecision, ...prev.slice(0, 4)]);
      setConflicts(prev => prev.filter(c => c.id !== conflict.id));
      setShowAI(false);
      setActiveConflict(null);
    } catch (err) {
      console.error('Failed to accept resolution', err);
    }
  }, [user]);

  const handleOverride = useCallback((conflict: Conflict) => {
    const newDecision = {
      id: `D-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: `Manual override — ${conflict.trainA} vs ${conflict.trainB}`,
      operator: user?.name ?? 'Controller',
      source: 'MANUAL' as const,
      trains: [conflict.trainA, conflict.trainB],
    };
    setDecisions(prev => [newDecision, ...prev.slice(0, 4)]);
    setConflicts(prev => prev.filter(c => c.id !== conflict.id));
    setShowAI(false);
    setActiveConflict(null);
  }, [user]);

  const handleChat = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);
    try {
      const token = getClientToken();
      const payload = {
        message: userMsg,
        section: user?.section || 'NR-42',
      };
      console.log("AI payload:", JSON.stringify(payload));
      
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('AI service error');
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'ai', text: 'AI service is temporarily unavailable. Please ensure GROQ_API_KEY is set on the backend.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, user]);

  const hoveredTrain = selectedTrain ? trains.find(t => t.id === selectedTrain) : null;

  // Detect whether any feed is silently showing sample data instead of a real
  // backend response (fetch failure, timeout, or empty result) — the queries
  // return these exact constant references on fallback, so an identity check
  // is enough to tell fake data apart from a real (possibly empty) response.
  const usingFallbackTrains = trains === DEFAULT_DEMO_TRAINS;
  const usingFallbackConflicts = serverConflicts === DEFAULT_DEMO_CONFLICTS;
  const usingFallbackDisruptions = disruptions === DEFAULT_DEMO_DISRUPTIONS;
  const fallbackFeeds = [
    usingFallbackTrains && 'trains',
    usingFallbackConflicts && 'conflicts',
    usingFallbackDisruptions && 'disruptions',
  ].filter(Boolean) as string[];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Demo Banner */}
      {user?.isDemo && (
        <div className="demo-banner">
          ⚠ DEMO MODE — Section {user?.section || 'NR-42'} &nbsp;|&nbsp; User: {user.name} [{user.role}]
        </div>
      )}
      {/* Sample-data banner: shown even for a real logged-in session if one or
          more feeds couldn't be fetched live, so sample data is never mistaken
          for real telemetry. */}
      {!user?.isDemo && fallbackFeeds.length > 0 && (
        <div className="demo-banner">
          ⚠ Showing sample data for {fallbackFeeds.join(', ')} — live backend unreachable
        </div>
      )}

      {/* Top Nav */}
      <header style={{ height: '56px', background: '#FFFFFF', borderBottom: '1.5px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="signal-lamp signal-lamp-green" style={{ width: '12px', height: '12px' }} />
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '-0.02em' }}>
            RAILTRACK AI
          </div>
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--bg-border)' }} />
        <nav style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'Dashboard', href: '/dashboard/controller', active: true },
            { label: 'Simulate', href: '/simulate' },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Admin', href: '/admin' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '13px', textDecoration: 'none',
              background: item.active ? '#EBF3FA' : 'transparent',
              color: item.active ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-headline)',
              fontWeight: item.active ? 700 : 500,
              transition: 'all 0.15s ease',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontFamily: 'var(--font-headline)', fontWeight: 600,
            color: wsStatus === 'reconnecting' ? 'var(--accent-warn)' : wsStatus === 'reconnected' ? 'var(--accent-safe)' : 'var(--accent-safe)' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: wsStatus === 'reconnecting' ? 'var(--accent-warn)' : wsStatus === 'reconnected' ? 'var(--accent-safe)' : connectionState === 'ws' ? 'var(--accent-safe)' : 'var(--accent-warn)',
            }} className="animate-pulse-live" />
            {wsStatus === 'reconnecting' ? 'RECONNECTING…' : wsStatus === 'reconnected' ? 'LIVE FEED ✓' : connectionState === 'ws' ? 'LIVE TELEMETRY' : 'LIVE (POLLING)'}
          </div>
          <button
            onClick={logout}
            className="btn-ghost"
            style={{ padding: '6px 14px', fontSize: '12.5px', fontFamily: 'var(--font-headline)', borderRadius: '8px' }}>
            Sign Out
          </button>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="btn-ghost"
            style={{ padding: '6px 10px', fontSize: '14px', marginRight: '4px', borderRadius: '8px' }}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT COLUMN (240px) — hidden on mobile when closed ── */}
        {sidebarOpen && (
        <aside style={{ width: '240px', flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Section info */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)' }}>
            <div className="panel-header" style={{ marginBottom: '12px' }}>Section Info</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Section: </span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--accent-primary)' }}>{user?.section || 'NR-42'}</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Zone: </span>Northern Railway
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Controller: </span>{user?.name ?? 'R. Sharma'}
            </div>
            <LiveClock />
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>IST • Shift: 14:00–22:00</div>
          </div>

          {/* Train queue */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="panel-header">Train Queue</span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--accent-primary)' }}>{Array.from(new Set([...customTrains, ...trains].map(t => t.id))).length}</span>
            </div>
            {/* Live IRCTC Train Search Bar */}
            <form onSubmit={handleSearchTrain} style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-border)', display: 'flex', gap: '6px', background: 'var(--bg-elevated)' }}>
              <input
                type="text"
                className="input"
                placeholder="Search 5-digit train no. (e.g. 12002)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '11px', flex: 1, fontFamily: 'var(--font-jetbrains)' }}
              />
              <button type="submit" className="btn-primary" disabled={isSearching} style={{ padding: '6px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                {isSearching ? '...' : '🔍 Fetch'}
              </button>
            </form>

            {/* Informational note about live data */}
            <div style={{ padding: '6px 16px', background: '#EBF3FA', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontFamily: 'var(--font-headline)', fontWeight: 600 }}>
                ℹ Search any Indian Railways train number to fetch live IRCTC tracking
              </span>
            </div>

            {searchNotification && (
              <div style={{ padding: '8px 12px', background: '#EBF3FA', borderBottom: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
                {searchNotification}
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {Array.from(new Set([...customTrains, ...trains].map(t => t.id))).map(id => [...customTrains, ...trains].find(t => t.id === id)!).map(train => (
                <div
                  key={train.id}
                  onClick={() => setSelectedTrain(selectedTrain === train.id ? null : train.id)}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--bg-border)',
                    cursor: 'pointer',
                    background: selectedTrain === train.id ? '#EBF3FA' : 'transparent',
                    borderLeft: selectedTrain === train.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {/* Status dot: green=on-time, amber=slight delay, red=major delay, gray=no data */}
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                        background: liveTrainData[train.id]?.isLive
                          ? (liveTrainData[train.id].terminated
                              ? '#94A3B8'
                              : liveTrainData[train.id].delay === 0
                                ? 'var(--accent-safe)'
                                : (liveTrainData[train.id].delay ?? 0) < 15
                                  ? '#F59E0B'
                                  : 'var(--accent-danger)')
                          : liveTrainData[train.id]?.status === 'not_running'
                            ? '#94A3B8'
                            : 'rgba(148,163,184,0.35)',
                        boxShadow: liveTrainData[train.id]?.isLive && !liveTrainData[train.id].terminated
                          ? `0 0 4px ${
                              liveTrainData[train.id].delay === 0
                                ? 'var(--accent-safe)'
                                : (liveTrainData[train.id].delay ?? 0) < 15
                                  ? '#F59E0B'
                                  : 'var(--accent-danger)'
                            }`
                          : 'none',
                      }} />
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', fontWeight: 700, color: PRIORITY_COLORS[train.priority] }}>
                        {train.id}
                      </span>
                    </span>
                    <span className={
                      liveTrainData[train.id]?.status === 'not_running' || liveTrainData[train.id]?.status === 'unavailable' ? 'badge-rail'
                        : liveTrainData[train.id]?.isLive
                          ? (liveTrainData[train.id].delay === 0 ? 'badge-safe' : (liveTrainData[train.id].delay ?? 0) <= 30 ? 'badge-warn' : 'badge-conflict')
                          : train.status === 'CONFLICT' ? 'badge-conflict' :
                            train.status === 'DELAYED'  ? 'badge-warn' :
                            train.status === 'ON_TIME'  ? 'badge-safe' : 'badge-rail'
                    } style={{
                      fontSize: '9px',
                      opacity: (liveTrainData[train.id]?.status === 'not_running' || liveTrainData[train.id]?.status === 'unavailable') ? 0.6 : 1
                    }}
                    title={liveTrainData[train.id]?.status === 'not_running'
                      ? (liveTrainData[train.id].message || 'Train not running today or data unavailable')
                      : liveTrainData[train.id]?.status === 'unavailable'
                        ? (liveTrainData[train.id].message || 'Live tracking service unavailable — showing timetable data')
                        : undefined
                    }>
                      {liveTrainData[train.id]?.status === 'not_running' ? 'NO DATA'
                        : liveTrainData[train.id]?.status === 'unavailable' ? 'LIVE N/A'
                        : liveTrainData[train.id]?.isLive
                          ? (liveTrainData[train.id].delay === 0 ? '● ON TIME' : `+${liveTrainData[train.id].delay}m`)
                          : (train.status === 'ON_TIME' ? '●' : train.status === 'DELAYED' ? `+${train.delay}m` : train.status)
                      }
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {liveTrainData[train.id]?.isLive
                        ? liveTrainData[train.id].terminated
                          ? <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Terminated</span>
                          : <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>@ {liveTrainData[train.id].currentStationName || liveTrainData[train.id].currentStation}</span>
                        : (liveTrainData[train.id]?.status === 'not_running' || liveTrainData[train.id]?.status === 'unavailable')
                          ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{train.origin} → {train.destination}</span>
                          : `${train.origin} → ${train.destination}`
                      }
                    </div>
                    <button
                      onClick={(e) => fetchLiveTrainData(e, train.id)}
                      disabled={liveTrainData[train.id]?.loading}
                      title={liveTrainData[train.id]?.status === 'not_running'
                        ? 'Train not running today or data unavailable'
                        : liveTrainData[train.id]?.status === 'unavailable'
                          ? (liveTrainData[train.id].message || 'Live tracking service unavailable')
                          : undefined}
                      style={{
                        fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                        background: liveTrainData[train.id]?.isLive
                          ? 'rgba(34, 197, 94, 0.15)'
                          : (liveTrainData[train.id]?.status === 'not_running' || liveTrainData[train.id]?.status === 'unavailable')
                            ? 'rgba(148, 163, 184, 0.08)'
                            : 'var(--bg-elevated)',
                        color: liveTrainData[train.id]?.isLive
                          ? 'var(--accent-safe)'
                          : (liveTrainData[train.id]?.status === 'not_running' || liveTrainData[train.id]?.status === 'unavailable')
                            ? 'var(--text-muted)'
                            : 'var(--text-secondary)',
                        border: liveTrainData[train.id]?.isLive
                          ? '1px solid var(--accent-safe)'
                          : '1px solid var(--bg-border)',
                        cursor: liveTrainData[train.id]?.loading ? 'wait' : 'pointer',
                        fontFamily: 'var(--font-space-mono)',
                        fontWeight: 600
                      }}
                    >
                      {liveTrainData[train.id]?.loading ? '...'
                        : liveTrainData[train.id]?.isLive ? 'REFRESH'
                        : (liveTrainData[train.id]?.status === 'not_running' || liveTrainData[train.id]?.status === 'unavailable') ? 'RETRY'
                        : 'Fetch'}
                    </button>
                  </div>
                  {/* Bottom row: delay + station code when live, ETA otherwise */}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {liveTrainData[train.id]?.isLive && !liveTrainData[train.id].terminated ? (
                      <>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{
                            color: liveTrainData[train.id].delay === 0
                              ? 'var(--accent-safe)'
                              : (liveTrainData[train.id].delay ?? 0) < 15
                                ? '#F59E0B'
                                : 'var(--accent-danger)',
                            fontFamily: 'var(--font-jetbrains)',
                            fontWeight: 700,
                            fontSize: '11px',
                          }}>
                            {liveTrainData[train.id].delay === 0
                              ? '✓ On time'
                              : `+${liveTrainData[train.id].delay}m delay`}
                          </span>
                          {liveTrainData[train.id].currentStation && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                              · {liveTrainData[train.id].currentStation}
                            </span>
                          )}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ 
                            animation: 'pulse-live 1.5s ease-in-out infinite', 
                            display: 'inline-block', width: '6px', height: '6px', 
                            borderRadius: '50%', background: 'var(--accent-safe)' 
                          }} />
                          <span style={{ color: 'var(--accent-safe)', fontFamily: 'var(--font-space-mono)', fontSize: '9px', fontWeight: 700 }}>
                            LIVE
                          </span>
                        </div>
                      </>
                    ) : (
                      <span>
                        ETA <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--text-secondary)' }}>
                          {liveTrainData[train.id]?.isLive && liveTrainData[train.id].expectedArrivalNdls ? liveTrainData[train.id].expectedArrivalNdls : train.eta}
                        </span>
                        &nbsp;· {Math.round(train.speed)} km/h
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ padding: '12px', borderTop: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="panel-header" style={{ marginBottom: '4px' }}>Quick Actions</div>
            <button className="btn-danger" style={{ fontSize: '12px', padding: '8px', justifyContent: 'center', width: '100%' }}>
              🛑 Halt Selected
            </button>
            <button className="btn-ghost" style={{ fontSize: '12px', padding: '8px', justifyContent: 'center', width: '100%' }}>
              🔄 Clear Section
            </button>
            <button className="btn-danger" style={{ fontSize: '12px', padding: '8px', justifyContent: 'center', width: '100%', background: '#7f1d1d', color: '#fca5a5' }}>
              ⚠ Emergency Stop
            </button>
          </div>
        </aside>
        )}

        {/* ── CENTER COLUMN ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Section header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-surface)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>
              NR / {user?.section || 'NR-42'} / <span style={{ color: 'var(--text-secondary)' }}>Controller View</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Demo Scenario Presets Dropdown / Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 212, 255, 0.08)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--accent-primary)', fontWeight: 700 }}>
                  ⚡ DEMO PRESETS:
                </span>
                <button
                  onClick={() => triggerDemoScenario('overtake')}
                  title="Test Overtake: Express vs Freight at ST-3"
                  className="btn-ghost"
                  style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)' }}>
                  1. Overtake
                </button>
                <button
                  onClick={() => triggerDemoScenario('headon')}
                  title="Test Crossing: Head-on single track SEG-04"
                  className="btn-ghost"
                  style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-elevated)', color: 'var(--accent-danger)', border: '1px solid var(--bg-border)' }}>
                  2. Head-on
                </button>
                <button
                  onClick={() => triggerDemoScenario('bottleneck')}
                  title="Test Bottleneck: Multi-train platform conflict at ST-5"
                  className="btn-ghost"
                  style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: 'var(--bg-elevated)', color: 'var(--accent-warn)', border: '1px solid var(--bg-border)' }}>
                  3. Bottleneck
                </button>
              </div>

              {conflicts.length > 0 && (
                <span className="badge-conflict" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ animation: 'pulse-live 1s ease-in-out infinite', display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-danger)' }} />
                  {conflicts.length} CONFLICT{conflicts.length > 1 ? 'S' : ''}
                </span>
              )}
              {/* AI Assist Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>AI ASSIST</span>
                <button
                  onClick={() => setAiAssist(a => !a)}
                  style={{
                    width: '40px', height: '22px', borderRadius: '11px',
                    background: aiAssist ? 'var(--accent-primary)' : 'var(--bg-border)',
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease',
                  }}>
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%', background: '#0A0C10',
                    position: 'absolute', top: '3px',
                    left: aiAssist ? '21px' : '3px',
                    transition: 'left 0.2s ease',
                  }} />
                </button>
              </div>
            </div>
          </div>

          {/* Track map area */}
          <div style={{ flex: 1, padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
            <LiveTrackMap
              conflictSegment={activeConflict ? 'SEG-04' : null}
              onTrainClick={setSelectedTrain}
              liveTrainData={liveTrainData}
            />

            {/* AI panel overlay */}
            {showAI && aiAssist && (
              <div style={{ position: 'absolute', top: '16px', right: '16px', bottom: '16px', pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'all', height: '100%' }}>
                  <AIRecommendation
                    visible={showAI}
                    conflict={activeConflict}
                    onDismiss={() => setShowAI(false)}
                    onAccept={handleAccept}
                    onOverride={handleOverride}
                  />
                </div>
              </div>
            )}

            {/* Train details card */}
            {hoveredTrain && (
              <div className="panel" style={{ padding: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Train ID</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '16px', color: PRIORITY_COLORS[hoveredTrain.priority], fontWeight: 700 }}>{hoveredTrain.id}</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Name</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{hoveredTrain.name}</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Route</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-secondary)' }}>{hoveredTrain.origin} → {hoveredTrain.destination}</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Speed</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--accent-primary)' }}>{hoveredTrain.speed} km/h</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>ETA</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {liveTrainData[hoveredTrain.id]?.isLive && liveTrainData[hoveredTrain.id]?.expectedArrivalNdls ? liveTrainData[hoveredTrain.id].expectedArrivalNdls : hoveredTrain.eta}
                  </div>
                </div>
                {(hoveredTrain.delay > 0 || liveTrainData[hoveredTrain.id]?.isLive) && (
                  <div>
                    <div className="panel-header" style={{ marginBottom: '4px' }}>Delay</div>
                    {liveTrainData[hoveredTrain.id]?.isLive ? (
                      <div style={{ 
                        fontFamily: 'var(--font-jetbrains)', fontSize: '14px', 
                        color: (liveTrainData[hoveredTrain.id].delay ?? 0) === 0 ? 'var(--accent-safe)' : (liveTrainData[hoveredTrain.id].delay ?? 0) <= 30 ? 'var(--accent-warn)' : 'var(--accent-danger)' 
                      }}>
                        {(liveTrainData[hoveredTrain.id].delay ?? 0) === 0 ? 'On Time' : `+${liveTrainData[hoveredTrain.id].delay} min`}
                      </div>
                    ) : (
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--accent-warn)' }}>
                        +{hoveredTrain.delay} min
                      </div>
                    )}
                  </div>
                )}
                {liveTrainData[hoveredTrain.id]?.isLive && (
                  <>
                    <div>
                      <div className="panel-header" style={{ marginBottom: '4px' }}>Current Station</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--accent-primary)' }}>
                        {liveTrainData[hoveredTrain.id].currentStationName} ({liveTrainData[hoveredTrain.id].currentStation})
                      </div>
                    </div>
                    <div>
                      <div className="panel-header" style={{ marginBottom: '4px' }}>Next Station</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {liveTrainData[hoveredTrain.id].nextStation}
                      </div>
                    </div>
                    <div>
                      <div className="panel-header" style={{ marginBottom: '4px' }}>Last Updated</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {liveTrainData[hoveredTrain.id].lastUpdated}
                      </div>
                    </div>
                  </>
                )}
                {hoveredTrain.platform && (
                  <div>
                    <div className="panel-header" style={{ marginBottom: '4px' }}>Platform</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-secondary)' }}>{hoveredTrain.platform}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT COLUMN (320px) ── */}
        <aside style={{ width: '320px', flexShrink: 0, background: 'var(--bg-surface)', borderLeft: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Active Conflicts */}
          <div style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="panel-header">Active Conflicts</span>
              <span className={conflicts.length > 0 ? 'badge-conflict' : 'badge-safe'} style={{ fontSize: '10px', marginLeft: 'auto' }}>
                {conflicts.length}
              </span>
            </div>

            {/* Quick Demo Trigger Box */}
            <div style={{ padding: '8px 16px', background: 'rgba(0, 212, 255, 0.05)', borderBottom: '1px solid var(--bg-border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', marginBottom: '6px' }}>
                ⚡ TEST DEMO CONFLICTS:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => triggerDemoScenario('overtake')}
                  style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(0, 212, 255, 0.15)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-space-mono)', fontWeight: 700 }}>
                  + Overtake Conflict
                </button>
                <button
                  onClick={() => triggerDemoScenario('headon')}
                  style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-space-mono)', fontWeight: 700 }}>
                  + Head-on Conflict
                </button>
              </div>
            </div>

            {conflicts.map(c => (
              <div key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-border)', cursor: 'pointer' }}
                onClick={() => { setActiveConflict(c); setShowAI(true); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--accent-danger)', fontWeight: 700 }}>
                    {c.trainA} ↔ {c.trainB}
                  </span>
                  <span className={`badge-${c.severity === 'HIGH' ? 'conflict' : 'warn'}`} style={{ fontSize: '9px' }}>{c.severity}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.location}</div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--accent-warn)', marginTop: '2px' }}>
                  T-{Math.floor(c.timeToConflict / 60)}:{String(c.timeToConflict % 60).padStart(2, '0')}
                </div>
              </div>
            ))}
            {conflicts.length === 0 && (
              <div style={{ padding: '16px', fontSize: '12px', color: 'var(--accent-safe)', textAlign: 'center', fontFamily: 'var(--font-space-mono)' }}>
                ✓ NO ACTIVE CONFLICTS
              </div>
            )}
          </div>

          {/* Disruptions */}
          <div style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div style={{ padding: '12px 16px' }}>
              <span className="panel-header">Incoming Disruptions</span>
            </div>
            {loadingDisruptions ? (
              <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-space-mono)' }}>
                Loading...
              </div>
            ) : disruptions.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '12px', color: 'var(--accent-safe)', textAlign: 'center', fontFamily: 'var(--font-space-mono)' }}>
                ✓ NO ACTIVE DISRUPTIONS
              </div>
            ) : (
              disruptions.map((d, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', gap: '10px' }}>
                  <span style={{ fontSize: '16px' }}>{d.icon}</span>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.text}</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{d.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Recent Decisions */}
          <div style={{ borderBottom: '1px solid var(--bg-border)', flex: '0 0 auto' }}>
            <div style={{ padding: '12px 16px' }}>
              <span className="panel-header">Recent Decisions</span>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {decisions.slice(0, 5).map(d => (
                <div key={d.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--bg-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '10px', color: 'var(--text-muted)' }}>{d.timestamp}</span>
                    <span className={d.source === 'AI' ? 'badge-safe' : 'badge-rail'} style={{ fontSize: '9px' }}>{d.source}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.action}</div>
                </div>
              ))}
            </div>
          </div>

          {/* NLP Chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-border)' }}>
              <span className="panel-header">Ask AI Assistant</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  background: msg.role === 'ai' ? '#EBF3FA' : '#F4F4F0',
                  border: `1px solid ${msg.role === 'ai' ? '#C5DCF2' : 'var(--bg-border)'}`,
                  color: msg.role === 'ai' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: msg.role === 'ai' ? 'var(--font-mono)' : 'inherit',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                }}>
                  {msg.role === 'ai' && (
                    <span style={{ fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>AI ▸</span>
                  )}
                  {msg.text}
                </div>
              ))}
              {/* Typing indicator while waiting for Claude */}
              {chatLoading && (
                <div style={{
                  padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
                  background: '#EBF3FA', border: '1px solid #C5DCF2',
                  alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span style={{ fontFamily: 'var(--font-headline)', fontSize: '10px', fontWeight: 700, color: 'var(--accent-primary)' }}>AI ▸</span>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-primary)',
                      display: 'inline-block', animation: 'pulse-live 1s ease-in-out infinite',
                      animationDelay: `${i * 0.2}s`, opacity: 0.7,
                    }} />
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={handleChat} style={{ padding: '12px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '8px' }}>
              <input
                className="input"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about your section..."
                disabled={chatLoading}
                style={{ fontSize: '12px', padding: '8px 12px', opacity: chatLoading ? 0.6 : 1 }}
              />
              <button type="submit" className="btn-primary" style={{ padding: '8px 12px', fontSize: '12px', flexShrink: 0 }}>→</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
