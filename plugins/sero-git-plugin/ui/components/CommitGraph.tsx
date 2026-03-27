/**
 * Interactive visual commit graph — the centerpiece of the Git app.
 *
 * Renders an SVG-based graph of commits with colored branch lanes,
 * merge lines, ref labels, and author info. Clicking a row selects it.
 */

import { useMemo, useRef, useCallback } from 'react';
import type { CommitNode } from '../../shared/types';
import { computeGraphLayout } from '../lib/graph-layout';
import type { GraphEdge } from '../lib/graph-layout';

const ROW_HEIGHT = 34;
const LANE_WIDTH = 20;
const NODE_RADIUS = 4;
const GRAPH_PAD_LEFT = 12;
const TEXT_PAD = 16;

interface CommitGraphProps {
  commits: CommitNode[];
  selectedHash?: string;
  onSelectCommit: (commit: CommitNode) => void;
}

export function CommitGraph({ commits, selectedHash, onSelectCommit }: CommitGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => computeGraphLayout(commits), [commits]);
  const graphWidth = (layout.maxLane + 1) * LANE_WIDTH + GRAPH_PAD_LEFT * 2;

  const handleRowClick = useCallback(
    (commit: CommitNode) => onSelectCommit(commit),
    [onSelectCommit],
  );

  if (commits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--g-dim)] text-sm">
        No commits to display
      </div>
    );
  }

  const svgHeight = commits.length * ROW_HEIGHT;

  return (
    <div ref={containerRef} className="flex-1 overflow-auto git-scrollbar">
      <div className="min-w-full" style={{ minHeight: svgHeight }}>
        {/* Rows */}
        {layout.nodes.map((node) => {
          const isSelected = node.commit.hash === selectedHash;
          return (
            <div
              key={node.commit.hash}
              onClick={() => handleRowClick(node.commit)}
              className={`graph-row flex items-center cursor-pointer border-b border-[var(--g-border)]
                ${isSelected ? 'graph-row-selected' : ''}`}
              style={{ height: ROW_HEIGHT }}
            >
              {/* SVG graph column */}
              <div className="shrink-0" style={{ width: graphWidth, height: ROW_HEIGHT, position: 'relative' }}>
                <svg width={graphWidth} height={ROW_HEIGHT} className="absolute inset-0">
                  {renderEdgesForRow(layout.edges, node.row, node.row, graphWidth)}
                  <CommitDot
                    cx={GRAPH_PAD_LEFT + node.lane * LANE_WIDTH}
                    cy={ROW_HEIGHT / 2}
                    color={node.color}
                    isHead={node.commit.refs.some((r) => r.type === 'head')}
                    isSelected={isSelected}
                  />
                </svg>
              </div>

              {/* Commit info */}
              <div className="flex items-center gap-2 flex-1 min-w-0 pr-4" style={{ paddingLeft: TEXT_PAD }}>
                {/* Ref labels */}
                {node.commit.refs.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {node.commit.refs.map((ref) => (
                      <RefBadge key={ref.name} name={ref.name} type={ref.type} color={node.color} />
                    ))}
                  </div>
                )}

                {/* Subject */}
                <span className="text-xs text-[var(--g-text)] truncate flex-1">
                  {node.commit.subject}
                </span>

                {/* Hash */}
                <span className="git-mono text-[10px] text-[var(--g-dim)] shrink-0 ml-2">
                  {node.commit.shortHash}
                </span>

                {/* Author */}
                <AuthorAvatar name={node.commit.authorName} email={node.commit.authorEmail} />

                {/* Date */}
                <span className="text-[10px] text-[var(--g-dim)] shrink-0 tabular-nums ml-1 w-16 text-right">
                  {formatRelativeDate(node.commit.authorDate)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Edge rendering for a specific row ───────────────────────

function renderEdgesForRow(edges: GraphEdge[], row: number, _currentRow: number, _width: number) {
  const relevantEdges = edges.filter((e) => {
    // Edge passes through this row (between fromRow and toRow)
    return e.fromRow <= row && e.toRow >= row;
  });

  return relevantEdges.map((edge, i) => {
    const fromX = GRAPH_PAD_LEFT + edge.fromLane * LANE_WIDTH;
    const toX = GRAPH_PAD_LEFT + edge.toLane * LANE_WIDTH;

    // Calculate Y positions relative to this row
    const relFromY = (edge.fromRow - row) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const relToY = (edge.toRow - row) * ROW_HEIGHT + ROW_HEIGHT / 2;

    // Only render the portion visible in this row
    const y1 = Math.max(relFromY, 0);
    const y2 = Math.min(relToY, ROW_HEIGHT);

    if (fromX === toX) {
      // Straight vertical line
      return (
        <line
          key={`e-${i}`}
          x1={fromX} y1={y1} x2={toX} y2={y2}
          stroke={edge.color} strokeWidth={2} strokeOpacity={0.7}
        />
      );
    }

    // Diagonal/curved connection for merge/branch
    if (edge.fromRow === row) {
      // Start of edge (commit row) — draw curve down to next row
      return (
        <path
          key={`e-${i}`}
          d={`M ${fromX} ${ROW_HEIGHT / 2} C ${fromX} ${ROW_HEIGHT}, ${toX} ${ROW_HEIGHT / 2}, ${toX} ${ROW_HEIGHT}`}
          fill="none" stroke={edge.color} strokeWidth={2} strokeOpacity={0.6}
        />
      );
    }

    if (edge.toRow === row) {
      // End of edge (parent row) — curve into parent
      return (
        <path
          key={`e-${i}`}
          d={`M ${fromX} 0 C ${fromX} ${ROW_HEIGHT / 2}, ${toX} 0, ${toX} ${ROW_HEIGHT / 2}`}
          fill="none" stroke={edge.color} strokeWidth={2} strokeOpacity={0.6}
        />
      );
    }

    // Middle rows — straight vertical in the target lane
    const x = row - edge.fromRow < edge.toRow - row ? fromX : toX;
    return (
      <line
        key={`e-${i}`}
        x1={x} y1={0} x2={x} y2={ROW_HEIGHT}
        stroke={edge.color} strokeWidth={2} strokeOpacity={0.5}
      />
    );
  });
}

// ── Commit node dot ─────────────────────────────────────────

function CommitDot({ cx, cy, color, isHead, isSelected }: {
  cx: number; cy: number; color: string; isHead: boolean; isSelected: boolean;
}) {
  const r = isHead ? NODE_RADIUS + 1.5 : NODE_RADIUS;
  return (
    <g>
      {(isHead || isSelected) && (
        <circle cx={cx} cy={cy} r={r + 3} fill={color} opacity={0.15} />
      )}
      <circle cx={cx} cy={cy} r={r} fill={isHead ? color : '#0c0e14'} stroke={color} strokeWidth={2} />
      {isHead && <circle cx={cx} cy={cy} r={r - 2.5} fill="#0c0e14" />}
    </g>
  );
}

// ── Ref badge ───────────────────────────────────────────────

function RefBadge({ name, type, color }: { name: string; type: string; color: string }) {
  const isTag = type === 'tag';
  const bgColor = isTag ? 'rgba(251, 191, 36, 0.12)' : `${color}18`;
  const textColor = isTag ? '#fbbf24' : color;
  const borderColor = isTag ? 'rgba(251, 191, 36, 0.25)' : `${color}30`;

  // Shorten remote refs
  const label = name.replace(/^origin\//, '');

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium git-mono whitespace-nowrap"
      style={{ background: bgColor, color: textColor, border: `1px solid ${borderColor}` }}
    >
      {isTag && <TagIcon />}
      {type === 'remote' && <RemoteIcon />}
      {label}
    </span>
  );
}

function TagIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M1 4.5V1h3.5L7 3.5 4.5 7z" />
    </svg>
  );
}

function RemoteIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="4" cy="4" r="2.5" />
      <path d="M4 1.5v5M1.5 4h5" />
    </svg>
  );
}

// ── Author avatar ───────────────────────────────────────────

function AuthorAvatar({ name, email }: { name: string; email: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Deterministic color from email
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) & 0x7fffffff;
  const hue = hash % 360;

  return (
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0 ml-2"
      style={{ background: `hsl(${hue}, 50%, 25%)`, color: `hsl(${hue}, 70%, 75%)` }}
      title={`${name} <${email}>`}
    >
      {initials}
    </div>
  );
}

// ── Date formatting ─────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();

  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}
