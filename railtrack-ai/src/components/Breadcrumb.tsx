'use client';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{
      display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
      fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', flexWrap: 'wrap',
    }}>
      <Link href="/dashboard/controller" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
        Home
      </Link>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ChevronRight size={12} strokeWidth={2} style={{ color: 'var(--text-muted)' }} />
          {item.href ? (
            <Link href={item.href} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
