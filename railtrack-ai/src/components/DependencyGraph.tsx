'use client';

export interface ScheduleEntry {
  train: string;
  train_name?: string;
  start: number;
  end: number;
  platform: number;
  action: string;
}

interface Edge {
  from: string; // waits for `to`
  to: string;
}

// Derives "waits for" edges purely from the solver's own schedule output —
// no new solver logic needed. Two trains sharing a platform where one's
// start is at/after the other's end means the later one is sequenced behind
// the earlier one on that resource.
//
// Only the IMMEDIATE predecessor on each platform gets an edge — not every
// earlier train that happens to also finish before this one starts. With N
// trains queued on one platform, connecting every valid-but-transitive pair
// draws up to N*(N-1)/2 overlapping arcs for what is really just an N-1-link
// chain, which is unreadable. Precedence is transitive by nature (if C waits
// for B and B waits for A, C also indirectly waits for A) — the graph should
// show the direct chain, not its full transitive closure.
function deriveEdges(schedule: ScheduleEntry[]): Edge[] {
  const edges: Edge[] = [];
  const byPlatform: Record<number, ScheduleEntry[]> = {};
  schedule.forEach(s => {
    (byPlatform[s.platform] ||= []).push(s);
  });

  Object.values(byPlatform).forEach(group => {
    const sorted = [...group].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      edges.push({ from: sorted[i].train, to: sorted[i - 1].train });
    }
  });

  return edges;
}

function actionColor(action: string): string {
  if (action === 'PROCEED') return 'var(--accent-safe)';
  if (action === 'HOLD') return '#F59E0B';
  return 'var(--accent-danger)';
}

export default function DependencyGraph({ schedule }: { schedule: ScheduleEntry[] }) {
  if (!schedule || schedule.length === 0) return null;

  const sorted = [...schedule].sort((a, b) => a.start - b.start);
  const edges = deriveEdges(schedule);

  const width = Math.max(sorted.length * 130, 400);
  const height = 140;
  const nodeY = height / 2;
  const positions: Record<string, number> = {};
  sorted.forEach((s, i) => {
    positions[s.train] = 65 + i * 130;
  });

  if (edges.length === 0) {
    return (
      <div className="panel" style={{ padding: '16px' }}>
        <div className="panel-header" style={{ marginBottom: '8px' }}>Precedence Dependency Graph</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No train in this schedule is waiting on another — every train proceeds independently on its own platform.
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: '16px', overflow: 'hidden' }}>
      <div className="panel-header" style={{ marginBottom: '4px' }}>Precedence Dependency Graph</div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Who's actually waiting on whom, derived from the solver's own real start/end/platform assignments — an arrow
        from train X to train Y means X must wait for Y to clear the shared platform first.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          <defs>
            <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--text-muted)" />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const x1 = positions[e.from];
            const x2 = positions[e.to];
            if (x1 == null || x2 == null) return null;
            const curveY = nodeY - 45 - (i % 3) * 12;
            return (
              <path
                key={i}
                d={`M ${x1} ${nodeY - 14} Q ${(x1 + x2) / 2} ${curveY} ${x2} ${nodeY - 14}`}
                fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 3"
                markerEnd="url(#dep-arrow)" opacity={0.8}
              />
            );
          })}

          {sorted.map(s => (
            <g key={s.train}>
              <circle cx={positions[s.train]} cy={nodeY} r={16} fill={actionColor(s.action)} fillOpacity={0.15} stroke={actionColor(s.action)} strokeWidth={2} />
              <text x={positions[s.train]} y={nodeY + 4} textAnchor="middle" fontSize={10} fontWeight={700} fontFamily="var(--font-jetbrains)" fill="var(--text-primary)">
                {s.train}
              </text>
              <text x={positions[s.train]} y={nodeY + 32} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">
                {(s.train_name || '').slice(0, 14)}
              </text>
              <text x={positions[s.train]} y={nodeY + 44} textAnchor="middle" fontSize={8} fontWeight={700} fill={actionColor(s.action)}>
                {s.action}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
