'use client';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { SlidersHorizontal, Play, BarChart3, X, RefreshCw } from 'lucide-react';
import OfficialUtilityBar from '@/components/OfficialUtilityBar';
import Breadcrumb from '@/components/Breadcrumb';
import SiteFooter from '@/components/SiteFooter';
import StationSearchInput from '@/components/StationSearchInput';

// Helper to grab token on the client
function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Settings, Users, Key, Activity, Database, Shield, HardDrive, Cpu, Network, Download, Upload, FileText, Zap } from 'lucide-react';

const TABS = [
  { id: 'users', label: 'User Management', icon: <Users size={16} /> },
  { id: 'health', label: 'System Health', icon: <Activity size={16} /> },
  { id: 'keys', label: 'API Keys', icon: <Key size={16} /> },
  { id: 'config', label: 'Section Config', icon: <Settings size={16} /> },
];

function AlgorithmAnswerPanel({ autoRunMutation, autoRunDefaults }: { autoRunMutation: any; autoRunDefaults: any }) {
  if (!(autoRunMutation.isPending || autoRunMutation.isSuccess || autoRunMutation.isError)) return null;
  return (
    <div className="panel animate-slide-in" style={{ marginTop: '16px', padding: '16px' }}>
      <div className="panel-header" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Zap size={14} strokeWidth={2.25} style={{ color: 'var(--accent-primary)' }} />
        What The Algorithm Says — Right Now, For This Data
      </div>
      {autoRunMutation.isPending && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>Running OR-Tools solver on the imported trains...</div>
      )}
      {autoRunMutation.isError && (
        <div style={{ fontSize: '12px', color: 'var(--accent-danger)' }}>{(autoRunMutation.error as Error).message}</div>
      )}
      {autoRunMutation.isSuccess && (
        <>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Illustrative scenario ({autoRunDefaults.disruption_type.replace('_', ' ').toLowerCase()}, {autoRunDefaults.disruption_duration_minutes}min) run against the real trains imported above —
            the trains are real, the disruption is a stand-in to demonstrate the algorithm's reasoning. Full control (custom disruptions, objectives) on the <Link href="/simulate" style={{ color: 'var(--accent-primary)' }}>Simulate page</Link>.
          </p>
          {autoRunMutation.data.status && !['OPTIMAL', 'FEASIBLE'].includes(autoRunMutation.data.status) ? (
            <div style={{ fontSize: '12px', color: 'var(--accent-danger)' }}>No feasible schedule found ({autoRunMutation.data.status}) for this default scenario — try the Simulate page with adjusted parameters.</div>
          ) : (
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(autoRunMutation.data.schedule || []).map((item: any, i: number) => (
                <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{item.train_name || item.train}</span>
                  {' — '}
                  <span style={{
                    fontWeight: 600,
                    color: item.action === 'PROCEED' ? 'var(--accent-safe)' : item.action === 'HOLD' ? '#F59E0B' : 'var(--accent-danger)'
                  }}>{item.action}</span>
                  {item.xai_explanation && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>{item.xai_explanation}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

  const { data: usersData = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`${API_BASE}/api/auth/users/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) window.location.href = '/login';
      return res.json() as Promise<any[]>;
    },
    enabled: !!user && user.role === 'ADMIN'
  });

  const { data: healthData = [], isLoading: healthLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/admin/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) return [];
      return res.json() as Promise<any>;
    },
    enabled: !!user && user.role === 'ADMIN',
    refetchInterval: 30000,
  });

  // Stamp last-checked time when health data arrives; tick the counter every 5s
  useEffect(() => {
    if (healthData && (Array.isArray(healthData) ? healthData.length > 0 : Object.keys(healthData).length > 0)) {
      setHealthCheckedAt(new Date());
    }
  }, [healthData]);

  useEffect(() => {
    const id = setInterval(() => setSecondsAgo(s => s + 5), 5000);
    return () => clearInterval(id);
  }, []);


  const queryClient = useQueryClient();

  // ── Health: last-checked timer ─────────────────────────────────────────────
  const [healthCheckedAt, setHealthCheckedAt] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Normalise health response: backend may return a dict OR an array
  const normaliseHealth = (raw: any): { service: string; status: string; message: string; latency_ms: number; uptime: string }[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    // Dict shape: { database: true, rapidapi: true, websocket: true, ... }
    return Object.entries(raw).map(([key, val]) => ({
      service: key.toUpperCase().replace(/_/g, ' '),
      status: val === true || val === 'ok' || val === 'UP' ? 'UP' : 'DOWN',
      message: val === true ? 'Healthy' : val === false ? 'Unreachable' : String(val),
      latency_ms: 0,
      uptime: '—',
    }));
  };

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'CONTROLLER', section: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  
  const [editUser, setEditUser] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  
  const [toast, setToast] = useState('');

  const [corridorFrom, setCorridorFrom] = useState('');
  const [corridorTo, setCorridorTo] = useState('');

  // Real defaults for the auto-run demo scenario shown right after import —
  // deliberately labeled as illustrative in the UI: the TRAINS are real
  // (just imported), the disruption is a stand-in scenario to show the
  // algorithm reasoning, not a claim that this is happening right now.
  // num_platforms matches the backend's SYNTHETIC_PLATFORM_POOL (2) — a
  // smaller, more typical station platform count, so the solver's own
  // allocation and the stored synthetic platform tags tell the same story.
  const AUTO_RUN_DEFAULTS = { disruption_type: 'MAINTENANCE', disruption_duration_minutes: 20, objective: 'MINIMIZE_DELAY', num_platforms: 2, headway_minutes: 3 };

  const [autoRunSource, setAutoRunSource] = useState<'corridor' | 'csv' | null>(null);

  const autoRunMutation = useMutation({
    mutationFn: async ({ trainIds, location }: { trainIds: string[]; location: string }) => {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/simulate/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ train_ids: trainIds, disruption_location: location, ...AUTO_RUN_DEFAULTS }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Solver run failed');
      return data;
    },
  });

  const importCorridorMutation = useMutation({
    mutationFn: async () => {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/admin/import-corridor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ from_code: corridorFrom.trim(), to_code: corridorTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      return data;
    },
    onSuccess: (data) => {
      const trainIds = data.imported.map((t: any) => t.id);
      if (trainIds.length > 0) {
        setAutoRunSource('corridor');
        autoRunMutation.reset();
        autoRunMutation.mutate({ trainIds, location: corridorFrom.trim() });
      }
    },
  });

  const [csvFile, setCsvFile] = useState<File | null>(null);

  const importCsvMutation = useMutation({
    mutationFn: async () => {
      if (!csvFile) throw new Error('Choose a CSV file first.');
      const token = getClientToken();
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch(`${API_BASE}/api/admin/import-csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'CSV import failed');
      return data;
    },
    onSuccess: (data) => {
      const trainIds = data.results.filter((r: any) => r.status === 'imported').map((r: any) => r.train_id);
      if (trainIds.length > 0) {
        setAutoRunSource('csv');
        autoRunMutation.reset();
        autoRunMutation.mutate({ trainIds, location: 'UPLOADED CSV' });
      }
    },
  });

  const handleDownloadTemplate = async () => {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/api/admin/import-csv/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'railtrack_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    try {
      const token = getClientToken();
      // POST /api/admin/invite — creates the account in a pending/INVITED
      // state and emails a setup link where the user picks their own
      // password. This previously called /api/auth/register with a
      // hardcoded "demo1234" password for every single invited user —
      // an immediately-active account with a shared, guessable password,
      // and no actual invite ever sent despite the UI saying "Send Invite."
      const res = await fetch(`${API_BASE}/api/admin/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: inviteForm.name,
          email: inviteForm.email,
          role: inviteForm.role,
          section: inviteForm.section,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || `Error ${res.status}`);
      }
      setShowInviteModal(false);
      setToast(
        data.message
          ? `${inviteForm.email}: ${data.message}`
          : `Invite sent to ${inviteForm.email} — they'll set their own password via the emailed link.`
      );
      setTimeout(() => setToast(''), 6000);
      setInviteForm({ name: '', email: '', role: 'CONTROLLER', section: '' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editUser) return;
    setEditLoading(true);
    setEditError('');
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          role: editUser.role,
          section: editUser.section,
          is_active: editUser.is_active
        })
      });
      if (res.status === 404 || res.status === 405) {
        // Endpoint not yet deployed in this environment
        setEditUser(null);
        setToast('Edit saved locally — backend sync coming soon');
        setTimeout(() => setToast(''), 4000);
        queryClient.setQueryData(['users'], (old: any[]) =>
          old?.map(u => u.id === editUser.id ? { ...u, role: editUser.role, section: editUser.section, is_active: editUser.is_active } : u)
        );
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Edit failed');
      }
      setEditUser(null);
      setToast('User updated successfully');
      setTimeout(() => setToast(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleStatusToggle = async (u: any) => {
    const newActive = !u.is_active;
    // Optimistic update
    queryClient.setQueryData(['users'], (old: any[]) =>
      old?.map(usr => usr.id === u.id ? { ...usr, is_active: newActive } : usr)
    );
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/auth/users/${u.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: newActive }),
      });
      if (res.status === 404 || res.status === 405) {
        setToast('Status toggled locally — backend sync coming soon');
        setTimeout(() => setToast(''), 4000);
        return;
      }
      if (!res.ok) throw new Error('Toggle failed');
      setToast(`${u.name} marked ${newActive ? 'ACTIVE' : 'INACTIVE'}`);
      setTimeout(() => setToast(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch {
      // Revert optimistic update on failure
      queryClient.setQueryData(['users'], (old: any[]) =>
        old?.map(usr => usr.id === u.id ? { ...usr, is_active: u.is_active } : usr)
      );
      setToast('Status toggle failed');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!editUser) return;
    if (!confirm(`Are you sure you want to completely delete ${editUser.name} (${editUser.email})?`)) return;
    
    setEditLoading(true);
    setEditError('');
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/admin/users/${editUser.id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Delete failed');
      }
      setEditUser(null);
      setToast('User deleted permanently');
      setTimeout(() => setToast(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ minHeight: '100vh', background: '#0d0f14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center" style={{ textAlign: 'center' }}>
          <div className="text-6xl font-mono text-red-500 mb-4" style={{ fontSize: '60px', fontFamily: 'var(--font-space-mono)', color: '#ef4444', marginBottom: '16px' }}>403</div>
          <div className="text-white text-xl font-mono mb-2" style={{ color: '#e8eaf0', fontSize: '20px', fontFamily: 'var(--font-space-mono)', marginBottom: '8px' }}>Access Denied</div>
          <div className="text-gray-400 text-sm" style={{ color: '#6b7280', fontSize: '14px' }}>You don't have admin privileges.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="has-mobile-tab-bar" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <OfficialUtilityBar />
      {/* Top Nav */}
      <header className="app-header-row" style={{ height: '56px', background: '#FFFFFF', borderBottom: '1.5px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '20px', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="signal-lamp signal-lamp-green" style={{ width: '12px', height: '12px' }} />
          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '16px', fontWeight: 800, color: 'var(--accent-primary)', letterSpacing: '-0.02em' }}>
            RAILTRACK AI
          </div>
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--bg-border)' }} />
        <nav className="desktop-nav-links" style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'Dashboard', href: '/dashboard/controller' },
            { label: 'Simulate', href: '/simulate' },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Admin', href: '/admin', active: true },
            { label: 'Live Map', href: '/live-map' },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: '7px 14px', borderRadius: 'var(--radius-xs)', fontSize: '13px', textDecoration: 'none',
              background: item.active ? '#EBF3FA' : 'transparent',
              color: item.active ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-headline)', fontWeight: item.active ? 700 : 500,
              transition: 'all 0.15s ease',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="main-3col-row" style={{ flex: 1 }}>
        {/* Sidebar */}
        <aside className="sidebar-left" style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 16px', flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '16px', marginLeft: '12px' }}>ADMINISTRATION</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
                    background: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main id="main-content" style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '20px' }}>
              <Breadcrumb items={[{ label: 'Admin' }, { label: TABS.find(t => t.id === activeTab)?.label || 'User Management' }]} />
            </div>

            {activeTab === 'users' && (
              <div className="animate-slide-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>User Management</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Manage controller access and section assignments.</p>
                  </div>
                  <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => setShowInviteModal(true)}>+ Invite User</button>
                </div>

                <div className="panel table-scroll-wrap desktop-table-view">
                  <table className="data-table" style={{ minWidth: '640px' }}>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Section</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Loading users...</td></tr>
                      ) : usersData.map((u: any) => (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)' }}>
                                {u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{u.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-jetbrains)' }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={u.role === 'ADMIN' ? 'badge-conflict' : u.role === 'CONTROLLER' ? 'badge-safe' : 'badge-rail'}>
                              {u.role}
                            </span>
                          </td>
                          <td><span style={{ fontFamily: 'var(--font-jetbrains)' }}>{u.section}</span></td>
                          <td>
                            <div
                              onClick={() => handleStatusToggle(u)}
                              title="Click to toggle status"
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: u.is_active ? 'var(--accent-safe)' : 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: u.is_active ? 'var(--accent-safe)' : 'var(--text-muted)', boxShadow: u.is_active ? '0 0 4px var(--accent-safe)' : 'none' }} />
                              {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-jetbrains)' }}>
                            {new Date(u.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setEditUser(u)}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card-based list — replaces the dense table below 640px */}
                <div className="mobile-card-list">
                  {isLoading ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Loading users...</div>
                  ) : usersData.map((u: any) => (
                    <div key={u.id} className="mobile-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                          {u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U'}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{u.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-jetbrains)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                        </div>
                        <span className={u.role === 'ADMIN' ? 'badge-conflict' : u.role === 'CONTROLLER' ? 'badge-safe' : 'badge-rail'}>
                          {u.role}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        <span style={{ fontFamily: 'var(--font-jetbrains)' }}>{u.section}</span>
                        <div
                          onClick={() => handleStatusToggle(u)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: u.is_active ? 'var(--accent-safe)' : 'var(--text-muted)', cursor: 'pointer', minHeight: '44px', minWidth: '44px', justifyContent: 'flex-end' }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: u.is_active ? 'var(--accent-safe)' : 'var(--text-muted)' }} />
                          {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </div>
                      </div>
                      <button className="btn-ghost" style={{ width: '100%', fontSize: '12px', padding: '10px', minHeight: '44px' }} onClick={() => setEditUser(u)}>Edit</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'health' && (
              <div className="animate-slide-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>System Health</h2>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Real-time telemetry for all backend services and IoT integrations.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <button
                    className="btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--font-space-mono)' }}
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-health'] })}
                  >
                    <RefreshCw size={13} strokeWidth={2.25} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                    Refresh
                  </button>
                  {healthCheckedAt && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>
                      Last checked: {Math.floor((Date.now() - healthCheckedAt.getTime()) / 1000)}s ago
                    </span>
                  )}
                </div>
              </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {healthLoading ? (
                    <div style={{ padding: '48px', textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)' }}>
                      Loading system telemetry...
                    </div>
                  ) : normaliseHealth(healthData).length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', fontSize: '13px' }}>
                      No health data available — click Refresh to check.
                    </div>
                  ) : normaliseHealth(healthData).map((service: any) => (
                    <div key={service.service} className="panel" style={{ padding: '20px', borderLeft: `3px solid ${service.status === 'UP' ? 'var(--accent-safe)' : 'var(--accent-danger)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                            background: service.status === 'UP' ? 'var(--accent-safe)' : 'var(--accent-danger)',
                            boxShadow: service.status === 'UP' ? '0 0 6px var(--accent-safe)' : '0 0 6px var(--accent-danger)',
                          }} />
                          <div>
                            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '13px', fontWeight: 700 }}>{service.service}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{service.message}</div>
                          </div>
                        </div>
                        <span className={service.status === 'UP' ? 'badge-safe' : 'badge-danger'}>{service.status}</span>
                      </div>
                      {service.latency_ms > 0 && (
                        <div className="grid-2col-responsive" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', marginBottom: '4px' }}>LATENCY</div>
                            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '20px', color: service.latency_ms > 200 ? 'var(--accent-warn)' : 'var(--text-primary)' }}>
                              {service.latency_ms} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ms</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', marginBottom: '4px' }}>UPTIME</div>
                            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '20px', color: 'var(--text-primary)' }}>{service.uptime}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'keys' && (
              <div className="animate-slide-in" style={{ padding: '48px', textAlign: 'center', border: '1px dashed var(--bg-border)', borderRadius: 'var(--radius-xs)' }}>
                <Shield size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--text-primary)', marginBottom: '8px' }}>API Keys Locked</h3>
                <p style={{ color: 'var(--text-muted)' }}>This section is locked in the demo environment.</p>
              </div>
            )}

            {activeTab === 'config' && (
              <div className="animate-slide-in">
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>Import Real Corridor</h2>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Fetch the real trains running any real Indian Railways station-to-station corridor from RailRadar,
                    live, and add them as a new section — immediately schedulable by the OR-Tools solver and covered
                    by real-time conflict detection.
                  </p>
                </div>

                <div className="panel" style={{ padding: '20px', marginBottom: '24px' }}>
                  <form
                    onSubmit={(e) => { e.preventDefault(); importCorridorMutation.reset(); importCorridorMutation.mutate(); }}
                    style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}
                  >
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>FROM STATION (name or code)</label>
                      <StationSearchInput value={corridorFrom} onChange={setCorridorFrom} placeholder="e.g. Chennai or MAS" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>TO STATION (name or code)</label>
                      <StationSearchInput value={corridorTo} onChange={setCorridorTo} placeholder="e.g. Bengaluru or SBC" />
                    </div>
                    <button type="submit" className="btn-primary" disabled={importCorridorMutation.isPending}
                      style={{ padding: '10px 18px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Download size={14} strokeWidth={2.25} />
                      {importCorridorMutation.isPending ? 'Importing live...' : 'Import Corridor'}
                    </button>
                  </form>

                  {importCorridorMutation.isError && (
                    <div style={{ marginTop: '16px', padding: '12px', background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 'var(--radius-xs)', color: 'var(--accent-danger)', fontSize: '13px' }}>
                      {(importCorridorMutation.error as Error).message}
                    </div>
                  )}
                </div>

                {importCorridorMutation.isSuccess && (
                  <div className="panel table-scroll-wrap desktop-table-view animate-slide-in">
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)' }}>
                      <span className="panel-header">
                        Imported {importCorridorMutation.data.imported.length} real trains into section{' '}
                        <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--accent-primary)' }}>{importCorridorMutation.data.section}</span>
                      </span>
                      {importCorridorMutation.data.truncated && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          RailRadar found {importCorridorMutation.data.total_found} real trains on this corridor — capped to the first 15 to control API cost.
                        </p>
                      )}
                    </div>
                    <table className="data-table" style={{ minWidth: '640px' }}>
                      <thead>
                        <tr>
                          <th>Train</th>
                          <th>Name</th>
                          <th>Priority</th>
                          <th>Route</th>
                          <th>Distance</th>
                          <th>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importCorridorMutation.data.imported.map((t: any) => (
                          <tr key={t.id}>
                            <td style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{t.id}</td>
                            <td>{t.name}</td>
                            <td><span className="badge-rail">{t.priority}</span></td>
                            <td>{t.origin} → {t.destination}</td>
                            <td>{t.distance_km != null ? `${t.distance_km} km` : '—'}</td>
                            <td>{t.duration_minutes != null ? `${t.duration_minutes} min` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {autoRunSource === 'corridor' && (
                  <AlgorithmAnswerPanel autoRunMutation={autoRunMutation} autoRunDefaults={AUTO_RUN_DEFAULTS} />
                )}

                <div style={{ marginTop: '40px', marginBottom: '24px' }}>
                  <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>Import from CSV</h2>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Fallback for when live RailRadar data isn't available (or isn't the point) — upload a
                    locally-gathered dataset and it goes through the exact same pipeline as a live corridor
                    import: same solver, same real-time conflict detection, same live-position map.
                  </p>
                </div>

                <div className="panel" style={{ padding: '20px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn-ghost" onClick={handleDownloadTemplate}
                      style={{ padding: '10px 16px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} strokeWidth={2.25} /> Download CSV Template
                    </button>
                    <input type="file" accept=".csv,text/csv" aria-label="CSV file"
                      onChange={e => setCsvFile(e.target.files?.[0] || null)}
                      style={{ fontSize: '13px' }} />
                    <button type="button" className="btn-primary" disabled={!csvFile || importCsvMutation.isPending}
                      onClick={() => { importCsvMutation.reset(); importCsvMutation.mutate(); }}
                      style={{ padding: '10px 18px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Upload size={14} strokeWidth={2.25} />
                      {importCsvMutation.isPending ? 'Uploading...' : 'Import CSV'}
                    </button>
                  </div>

                  {importCsvMutation.isError && (
                    <div style={{ marginTop: '16px', padding: '12px', background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 'var(--radius-xs)', color: 'var(--accent-danger)', fontSize: '13px' }}>
                      {(importCsvMutation.error as Error).message}
                    </div>
                  )}
                </div>

                {importCsvMutation.isSuccess && (
                  <div className="panel table-scroll-wrap desktop-table-view animate-slide-in">
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)' }}>
                      <span className="panel-header">
                        Imported {importCsvMutation.data.imported_count} trains, skipped {importCsvMutation.data.skipped_count}
                      </span>
                    </div>
                    <table className="data-table" style={{ minWidth: '480px' }}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Train ID</th>
                          <th>Status</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importCsvMutation.data.results.map((r: any) => (
                          <tr key={r.row}>
                            <td style={{ fontFamily: 'var(--font-jetbrains)' }}>{r.row}</td>
                            <td style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: r.status === 'imported' ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                              {r.train_id || '—'}
                            </td>
                            <td>
                              <span className={r.status === 'imported' ? 'badge-safe' : 'badge-warn'}>{r.status}</span>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {autoRunSource === 'csv' && (
                  <AlgorithmAnswerPanel autoRunMutation={autoRunMutation} autoRunDefaults={AUTO_RUN_DEFAULTS} />
                )}
              </div>
            )}

          </div>
        </main>
      </div>
      <SiteFooter />
      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-[#13161e] border border-[#1e2330] rounded-lg p-8 w-full max-w-md relative" style={{ background: '#13161e', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '32px', width: '100%', maxWidth: '448px', position: 'relative' }}>
            <button onClick={() => setShowInviteModal(false)} aria-label="Close invite dialog" className="absolute top-4 right-4 text-gray-400 hover:text-white" style={{ position: 'absolute', top: '16px', right: '16px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}><X size={16} strokeWidth={2.25} /></button>
            <h2 className="text-white font-mono text-xl mb-1" style={{ color: '#e8eaf0', fontFamily: 'var(--font-space-mono)', fontSize: '20px', margin: '0 0 4px 0' }}>Invite User</h2>
            <p className="text-gray-400 text-sm mb-6" style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>Send an invite link to grant system access.</p>
            
            <form onSubmit={handleInviteSubmit} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input required aria-label="Full Name" placeholder="Full Name" value={inviteForm.name}
                onChange={e => setInviteForm({...inviteForm, name: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />

              <input required type="email" aria-label="Email Address" placeholder="Email Address" value={inviteForm.email}
                onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />

              <select aria-label="Role" value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }}>
                <option value="CONTROLLER">CONTROLLER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="LOGISTICS">LOGISTICS</option>
              </select>

              <input required aria-label="Section" placeholder="Section (e.g. NR-42)" value={inviteForm.section}
                onChange={e => setInviteForm({...inviteForm, section: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />
              
              {inviteError && <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{inviteError}</p>}
              
              <button type="submit" disabled={inviteLoading}
                style={{ width: '100%', background: '#00e5ff', color: '#0d0f14', fontWeight: 600, borderRadius: 'var(--radius-xs)', padding: '10px', border: 'none', cursor: inviteLoading ? 'not-allowed' : 'pointer', opacity: inviteLoading ? 0.5 : 1, transition: 'background 0.2s', marginTop: '8px', boxSizing: 'border-box' }}>
                {inviteLoading ? 'Sending...' : 'Send Invite'}
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-[#13161e] border border-[#1e2330] rounded-lg p-8 w-full max-w-md relative" style={{ background: '#13161e', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '32px', width: '100%', maxWidth: '448px', position: 'relative' }}>
            <button onClick={() => setEditUser(null)} aria-label="Close edit dialog" className="absolute top-4 right-4 text-gray-400 hover:text-white" style={{ position: 'absolute', top: '16px', right: '16px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}><X size={16} strokeWidth={2.25} /></button>
            <h2 className="text-white font-mono text-xl mb-1" style={{ color: '#e8eaf0', fontFamily: 'var(--font-space-mono)', fontSize: '20px', margin: '0 0 4px 0' }}>Edit User</h2>
            <p className="text-gray-400 text-sm mb-6" style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>{editUser.name} ({editUser.email})</p>
            
            <form onSubmit={handleEditSubmit} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Role</label>
                <select value={editUser.role} onChange={e => setEditUser({...editUser, role: e.target.value})}
                  style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="CONTROLLER">CONTROLLER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPERVISOR">SUPERVISOR</option>
                  <option value="LOGISTICS">LOGISTICS</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Section</label>
                <input required value={editUser.section}
                  onChange={e => setEditUser({...editUser, section: e.target.value})}
                  style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Account Status</label>
                <select value={editUser.is_active ? 'ACTIVE' : 'INACTIVE'} onChange={e => setEditUser({...editUser, is_active: e.target.value === 'ACTIVE'})}
                  style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: 'var(--radius-xs)', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive / Suspended</option>
                </select>
              </div>
              
              {editError && <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{editError}</p>}
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={handleDeleteSubmit} disabled={editLoading}
                  style={{ flex: 1, background: 'transparent', color: '#ef4444', fontWeight: 600, borderRadius: 'var(--radius-xs)', padding: '10px', border: '1px solid rgba(239, 68, 68, 0.5)', cursor: editLoading ? 'not-allowed' : 'pointer', opacity: editLoading ? 0.5 : 1, transition: 'background 0.2s', boxSizing: 'border-box' }}>
                  Delete
                </button>
                <button type="submit" disabled={editLoading}
                  style={{ flex: 2, background: '#00e5ff', color: '#0d0f14', fontWeight: 600, borderRadius: 'var(--radius-xs)', padding: '10px', border: 'none', cursor: editLoading ? 'not-allowed' : 'pointer', opacity: editLoading ? 0.5 : 1, transition: 'background 0.2s', boxSizing: 'border-box' }}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Toast UI */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#13161e] border border-cyan-400/30 text-cyan-400 px-5 py-3 rounded-lg font-mono text-sm shadow-lg z-50 animate-fade-in" style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#13161e', border: '1px solid rgba(0, 229, 255, 0.3)', color: '#00e5ff', padding: '12px 20px', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font-space-mono)', fontSize: '14px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', zIndex: 50 }}>
          {toast}
        </div>
      )}

      <nav className="mobile-tab-bar">
        <Link href="/dashboard/controller"><span className="mobile-tab-icon"><SlidersHorizontal size={18} strokeWidth={2} /></span>Dashboard</Link>
        <Link href="/simulate"><span className="mobile-tab-icon"><Play size={18} strokeWidth={2} /></span>Simulate</Link>
        <Link href="/analytics"><span className="mobile-tab-icon"><BarChart3 size={18} strokeWidth={2} /></span>Analytics</Link>
        <Link href="/admin" className="mobile-tab-active"><span className="mobile-tab-icon"><Settings size={18} strokeWidth={2} /></span>Admin</Link>
      </nav>
    </div>
  );
}
