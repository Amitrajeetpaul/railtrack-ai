'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import OfficialUtilityBar from '@/components/OfficialUtilityBar';

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <OfficialUtilityBar />
      <header style={{ height: '56px', background: '#FFFFFF', borderBottom: '1.5px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: '14px' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}>
          <ArrowLeft size={16} strokeWidth={2} /> Back
        </Link>
        <div style={{ width: '1px', height: '20px', background: 'var(--bg-border)' }} />
        <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, color: 'var(--accent-primary)' }}>RAILTRACK AI</span>
      </header>

      <main id="main-content" style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <section style={{ marginBottom: '48px' }}>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '32px', fontWeight: 800, marginBottom: '12px' }}>About RailTrack AI</h1>
          <p style={{ fontSize: '15px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            RailTrack AI is a prototype decision-support system built for Smart India Hackathon 2025,
            addressing Ministry of Railways Problem Statement 25022 — &ldquo;Maximizing Section Throughput
            Using AI-Powered Precise Train Traffic Control.&rdquo; It assists section controllers in deciding
            train precedence and crossings using a real constraint-optimization solver (Google OR-Tools
            CP-SAT), grounded with live train-tracking data. It is <strong>a student hackathon prototype,
            not an official Government of India or Ministry of Railways service</strong>, and is not
            connected to any live railway operational systems.
          </p>
        </section>

        <section id="terms" style={{ marginBottom: '48px' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>Terms of Use</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            This platform is provided for demonstration and evaluation purposes only. Recommendations
            shown here must never be used to make real train-scheduling or safety decisions. Demo
            accounts and sample data are reset periodically. By using this site you acknowledge it is a
            prototype and not production railway infrastructure.
          </p>
        </section>

        <section id="privacy" style={{ marginBottom: '48px' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>Privacy Policy</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            Account data (name, email, role, section) is stored to operate the demo login system and is
            not shared with third parties or used for advertising. Passwords are stored as one-way bcrypt
            hashes, never in plain text. Train search history may be logged for audit purposes as
            described in the platform&rsquo;s own audit trail feature. This is a prototype; do not submit
            real personal or sensitive data.
          </p>
        </section>

        <section id="accessibility" style={{ marginBottom: '48px' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>Accessibility Statement</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            RailTrack AI targets WCAG 2.1 Level AA. Every text/background color pairing in the interface
            has been checked against a minimum 4.5:1 contrast ratio. The header above includes a working
            text-size adjuster and a high-contrast mode toggle, both of which persist across visits. The
            interface is built to be fully operable by keyboard, with visible focus indicators. If you
            encounter an accessibility issue, please use the contact details below.
          </p>
        </section>

        <section id="contact">
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>Contact</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            This is a student-built hackathon prototype. For questions about the project, see the source
            repository linked in the footer of any page.
          </p>
        </section>
      </main>
    </div>
  );
}
