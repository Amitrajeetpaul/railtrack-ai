'use client';
import Link from 'next/link';
import { Mail, Github } from 'lucide-react';

const BUILD_DATE = 'August 2026';

export default function SiteFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--bg-border)', background: 'var(--bg-surface)',
      padding: '20px 24px', fontSize: '12px', color: 'var(--text-secondary)',
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
        <Link href="/about" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>About</Link>
        <Link href="/about#terms" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms of Use</Link>
        <Link href="/about#privacy" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Privacy Policy</Link>
        <Link href="/about#accessibility" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Accessibility Statement</Link>
        <Link href="/about#contact" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Contact</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--text-muted)' }}>
          Last Updated: {BUILD_DATE}
        </span>
        <a href="https://github.com/Amitrajeetpaul/railtrack-ai" target="_blank" rel="noopener noreferrer" aria-label="Project repository" style={{ color: 'var(--text-muted)', display: 'flex' }}>
          <Github size={14} strokeWidth={2} />
        </a>
        <a href="mailto:contact@railtrack-ai.example" aria-label="Contact email" style={{ color: 'var(--text-muted)', display: 'flex' }}>
          <Mail size={14} strokeWidth={2} />
        </a>
      </div>
    </footer>
  );
}
