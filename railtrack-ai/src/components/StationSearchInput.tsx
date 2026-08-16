'use client';
import { useState, useRef, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

interface StationResult {
  code: string;
  name: string;
}

export default function StationSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<StationResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = (text: string) => {
    setQuery(text);
    onChange(text.toUpperCase()); // real code still typeable directly, as before
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const token = getClientToken();
      try {
        const res = await fetch(`${API_BASE}/api/admin/station-search?q=${encodeURIComponent(text)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          setResults(await res.json());
          setIsOpen(true);
        }
      } catch {
        // Search is a convenience layer — silently do nothing on failure,
        // the admin can still type a real code directly either way.
      }
    }, 250);
  };

  const handleSelect = (r: StationResult) => {
    setQuery(r.code);
    onChange(r.code);
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '220px' }}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 20,
          background: 'var(--bg-surface)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-xs)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto',
        }}>
          {results.map(r => (
            <div
              key={r.code}
              onClick={() => handleSelect(r)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid var(--bg-border)' }}
              onMouseDown={e => e.preventDefault()}
            >
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{r.code}</span>
              {' — '}
              <span style={{ color: 'var(--text-secondary)' }}>{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
