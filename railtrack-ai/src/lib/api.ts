/**
 * Shared API base URL — reads from NEXT_PUBLIC_API_URL env var.
 * Set this in your .env.local for local dev or deployment config.
 * Defaults to http://localhost:8000 for local FastAPI dev server.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * ADMIN ("HQ") and SUPERVISOR ("All Zones") are cross-section roles — no
 * train is ever seeded with those literal section values, so filtering
 * GET /api/trains/ by `user.section` for these roles always returns an
 * empty result, even though the backend's own authorization logic
 * (require_section_access) already treats them as allowed to act on any
 * section. Build the trains-list query string accordingly: omit the
 * section filter entirely for cross-section roles so they see everything,
 * same as the backend's real access model.
 */
const CROSS_SECTION_VALUES = new Set(['HQ', 'All Zones']);

export function trainsQueryFor(section: string | undefined | null): string {
  const s = section || 'NR-42';
  return CROSS_SECTION_VALUES.has(s) ? '' : `?section=${encodeURIComponent(s)}`;
}
