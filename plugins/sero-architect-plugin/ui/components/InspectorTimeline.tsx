import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronRight, Clock, Focus, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@sero-ai/ui';
import { updatesLabel, type TreeRow } from '../lib/activity-tree';
import { dur, usd } from '../lib/inspector-format';
import { barGeometry, isWhole, panRange, rowWindow, ticks, zoomRange, type TimeRange } from '../lib/timeline';
import type { ActivityNodeView, TraceRecord } from '../lib/trace';
import { StateIcon } from './InspectorStatus';

export const ROW_HEIGHT = 28;
/** Rows are windowed against a generous viewport, so the DOM stays bounded at any height. */
const VIEWPORT = 1000;

export type Highlight =
  | { kind: 'time'; from: number; to: number }
  | { kind: 'group'; value: string }
  | { kind: 'model'; value: string | null };

function hits(row: TreeRow, highlight: Highlight | null, parent: ActivityNodeView | undefined): boolean {
  if (!highlight) return false;
  const node = row.node;
  if (highlight.kind === 'time') {
    const from = Date.parse(node?.startAt ?? row.charge?.at ?? row.updates?.from ?? '');
    const to = Date.parse(node?.endAt ?? node?.startAt ?? row.charge?.at ?? row.updates?.to ?? '');
    return Number.isFinite(from) && Number.isFinite(to) && from <= highlight.to && to >= highlight.from;
  }
  if (highlight.kind === 'group') return (node ?? parent)?.group === highlight.value;
  return (node?.model ?? row.charge?.model ?? parent?.model ?? null) === highlight.value;
}

/** Where a row's bar sits: its interval, or a charge's single moment. */
function interval(row: TreeRow, full: TimeRange): { from: number; to: number } | null {
  if (row.updates) {
    const from = Date.parse(row.updates.from);
    const to = Date.parse(row.updates.to);
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  }
  if (row.charge) {
    const at = Date.parse(row.charge.at);
    return Number.isFinite(at) ? { from: at, to: at } : null;
  }
  const node = row.node;
  const from = Date.parse(node?.startAt ?? '');
  if (!node || !Number.isFinite(from)) return null;
  const end = Date.parse(node.endAt ?? '');
  // An operation still open runs to the last observation, not to a guessed end.
  return { from, to: Number.isFinite(end) ? end : full.to };
}

function Overview({ nodes, full, range, setRange }: {
  nodes: readonly ActivityNodeView[]; full: TimeRange; range: TimeRange; setRange(range: TimeRange | null): void;
}) {
  const strip = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; range: TimeRange; mode: 'move' | 'l' | 'r' } | null>(null);
  const span = full.to - full.from;
  const commit = (next: TimeRange) => setRange(isWhole(full, next) ? null : next);
  const toMs = (px: number) => (px / (strip.current?.clientWidth || 1)) * span;
  const onDown = (event: PointerEvent<HTMLElement>, mode: 'move' | 'l' | 'r') => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, range, mode };
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const delta = toMs(event.clientX - start.x);
    if (start.mode === 'move') commit(panRange(full, start.range, delta));
    else if (start.mode === 'l') commit({ from: Math.max(full.from, Math.min(start.range.from + delta, start.range.to - 1000)), to: start.range.to });
    else commit({ from: start.range.from, to: Math.min(full.to, Math.max(start.range.to + delta, start.range.from + 1000)) });
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const width = range.to - range.from;
    const centre = (range.from + range.to) / 2;
    if (event.key === 'Home') commit(full);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      commit(event.shiftKey ? zoomRange(full, range, direction < 0 ? 0.5 : 2, centre) : panRange(full, range, direction * width * 0.1));
    } else return;
    event.preventDefault();
  };
  const geometry = barGeometry(full, range.from, range.to) ?? { left: 0, width: 100 };
  const top = nodes.filter((node) => node.parentId === null || !nodes.some((other) => other.id === node.parentId));
  return (
    <div
      className="ar-ov-strip"
      ref={strip}
      role="slider"
      tabIndex={0}
      aria-label="Time range"
      aria-valuemin={0}
      aria-valuemax={Math.round(span / 1000)}
      aria-valuenow={Math.round((range.from - full.from) / 1000)}
      aria-valuetext={`Showing ${dur(range.from - full.from)} to ${dur(range.to - full.from)} of ${dur(span)}. Arrow keys pan, Shift and arrow keys zoom, Home shows the whole run.`}
      onKeyDown={onKey}
      onPointerDown={(event) => {
        // A press outside the window centres the window there.
        const box = event.currentTarget.getBoundingClientRect();
        const at = full.from + toMs(event.clientX - box.left);
        commit(panRange(full, range, at - (range.from + range.to) / 2));
      }}
      onPointerMove={onMove}
      onPointerUp={() => { drag.current = null; }}
    >
      {top.map((node) => {
        const from = Date.parse(node.startAt ?? '');
        const to = Date.parse(node.endAt ?? '') || full.to;
        const bar = Number.isFinite(from) ? barGeometry(full, from, to) : null;
        return bar ? <span key={node.id} className="ar-ov-bar" data-state={node.state} style={{ left: `${bar.left}%`, width: `${bar.width}%` }} /> : null;
      })}
      <span className="ar-ov-win" style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }} onPointerDown={(event) => onDown(event, 'move')}>
        <span className="h l" onPointerDown={(event) => onDown(event, 'l')} />
        <span className="h r" onPointerDown={(event) => onDown(event, 'r')} />
      </span>
    </div>
  );
}

export function InspectorTimeline(props: {
  rows: readonly TreeRow[];
  nodes: readonly ActivityNodeView[];
  byId: ReadonlyMap<string, ActivityNodeView>;
  count: string;
  full: TimeRange | null;
  range: TimeRange | null;
  setRange(range: TimeRange | null): void;
  selected: string | null;
  onSelect(key: string): void;
  onToggle(id: string): void;
  highlight: Highlight | null;
  empty: string | null;
  onClearFilters(): void;
  more: { onLoad(): void; disabled: boolean } | null;
  onBack(): void;
}) {
  const { rows, full, selected } = props;
  const [scrollTop, setScrollTop] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const range = props.range ?? full;
  const window = rowWindow(rows.length, { scrollTop, rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT });
  const index = rows.findIndex((row) => row.key === selected);
  const marks = range && full ? ticks(range, full.from) : [];

  const moveTo = (next: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, next))];
    if (!row) return;
    props.onSelect(row.key);
    const target = Math.max(0, rows.indexOf(row) - 2) * ROW_HEIGHT;
    const box = scroller.current;
    if (box && (target < box.scrollTop || target + ROW_HEIGHT * 4 > box.scrollTop + box.clientHeight)) {
      box.scrollTop = target;
      setScrollTop(target);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = rows[index];
    const key = event.key;
    if (key === 'Escape') { props.onBack(); return; }
    if (key === 'ArrowDown') moveTo(index + 1);
    else if (key === 'ArrowUp') moveTo(index - 1);
    else if (key === 'Home') moveTo(0);
    else if (key === 'End') moveTo(rows.length - 1);
    else if (key === 'ArrowRight' && row?.hasChildren) { if (row.open) moveTo(index + 1); else props.onToggle(row.key); }
    else if (key === 'ArrowLeft' && row) {
      if (row.open) props.onToggle(row.key);
      else {
        const parent = row.node?.parentId ?? row.charge?.nodeId ?? row.updates?.nodeId;
        if (parent && rows.some((entry) => entry.key === parent)) props.onSelect(parent);
      }
    } else if ((key === 'Enter' || key === ' ') && row?.hasChildren) props.onToggle(row.key);
    else return;
    event.preventDefault();
  };

  return (
    <section className="ar-panel ar-insp-tl" aria-label="Timeline">
      <div className="ar-panel-head">Timeline<span className="n">{props.count}</span></div>
      {full && range && (
        <div className="ar-ov">
          <Overview nodes={props.nodes} full={full} range={range} setRange={props.setRange} />
          <div className="ar-ov-tools">
            <span className="whole"><Clock aria-hidden="true" width={12} height={12} />whole run {dur(full.to - full.from)}</span>
            <Button variant="outline" size="icon-sm" className="ar-btn ar-btn-icon" aria-label="Zoom in" title="Zoom in" onClick={() => props.setRange(zoomRange(full, range, 0.5, (range.from + range.to) / 2))}><ZoomIn className="ar-i" /></Button>
            <Button variant="outline" size="icon-sm" className="ar-btn ar-btn-icon" aria-label="Zoom out" title="Zoom out" onClick={() => { const next = zoomRange(full, range, 2, (range.from + range.to) / 2); props.setRange(isWhole(full, next) ? null : next); }}><ZoomOut className="ar-i" /></Button>
            <Button variant="outline" size="icon-sm" className="ar-btn ar-btn-icon" aria-label="Zoom to selection" title="Zoom to selection" disabled={index < 0}
              onClick={() => {
                const span = rows[index] ? interval(rows[index]!, full) : null;
                if (!span) return;
                const pad = Math.max(30_000, (span.to - span.from) * 0.1);
                props.setRange({ from: Math.max(full.from, span.from - pad), to: Math.min(full.to, span.to + pad) });
              }}><Focus className="ar-i" /></Button>
          </div>
        </div>
      )}
      <div className="ar-tl-head">
        <span>Activity</span><span>Cost</span>
        <div className="ar-ruler">{marks.map((mark) => <span key={mark.offset} style={{ left: `${mark.at}%` }}>{dur(mark.offset)}</span>)}</div>
      </div>
      <div className="ar-tl-body">
        <div className="ar-tl-grid" aria-hidden="true">
          <span /><span />
          <div className="ar-tl-ticks">{marks.map((mark) => <i key={mark.offset} style={{ left: `${mark.at}%` }} />)}</div>
        </div>
        {props.empty ? (
          <div className="ar-tl-empty" role="status">
            <span>{props.empty}</span>
            <Button variant="outline" size="sm" className="ar-btn" onClick={props.onClearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div
            className="ar-tl-scroll"
            ref={scroller}
            role="tree"
            aria-label="Execution timeline"
            tabIndex={0}
            aria-activedescendant={index >= 0 ? `ar-row-${rows[index]!.key}` : undefined}
            onKeyDown={onKeyDown}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <div style={{ position: 'relative', height: rows.length * ROW_HEIGHT + (props.more ? 36 : 0) }}>
              {rows.slice(window.start, window.end).map((row, offset) => (
                <Row key={row.key} row={row} top={(window.start + offset) * ROW_HEIGHT} range={range} full={full}
                  selected={row.key === selected} hit={hits(row, props.highlight, props.byId.get(row.charge?.nodeId ?? row.updates?.nodeId ?? ''))}
                  onSelect={props.onSelect} onToggle={props.onToggle} />
              ))}
              {props.more && (
                <div className="ar-tl-more" style={{ top: rows.length * ROW_HEIGHT }}>
                  <Button variant="outline" size="sm" className="ar-btn" disabled={props.more.disabled} onClick={props.more.onLoad}>Load more activity</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** The kind in the grey detail, unless the label already says it or it is a group. */
function kindWord(node: ActivityNodeView): string | null {
  if (node.synthetic) return null;
  const word = node.kind.replace(/-/g, ' ');
  return node.label.toLowerCase().startsWith(word) ? null : word;
}

function Row({ row, top, range, full, selected, hit, onSelect, onToggle }: {
  row: TreeRow; top: number; range: TimeRange | null; full: TimeRange | null; selected: boolean; hit: boolean;
  onSelect(key: string): void; onToggle(id: string): void;
}) {
  const node = row.node;
  const charge: TraceRecord | undefined = row.charge;
  const updates = row.updates;
  const label = node?.label ?? (updates ? updatesLabel(updates) : 'Usage');
  const meta = node
    ? [kindWord(node), node.model?.split('/').pop(), node.thinking].filter(Boolean).join(' · ')
    : updates ? `${updates.records.length} updates`
    : [charge?.model?.split('/').pop(), charge?.thinking].filter(Boolean).join(' · ');
  const cost = node ? (node.costUsd === null ? '—' : usd(node.costUsd))
    : updates ? usd(updates.costUsd)
    : charge?.costUsd === undefined ? '—' : usd(charge.costUsd);
  const span = range && full ? interval(row, full) : null;
  const bar = span && range ? barGeometry(range, span.from, span.to) : null;
  const state = node?.state ?? 'done';
  return (
    <div
      id={`ar-row-${row.key}`}
      className="ar-tl-row"
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.hasChildren ? row.open : undefined}
      data-hit={hit ? 'true' : undefined}
      data-dim={row.dim ? 'true' : undefined}
      style={{ top }}
      onClick={() => onSelect(row.key)}
    >
      <div className="ar-tl-label" style={{ paddingLeft: row.depth * 12 }}>
        <button type="button" className="ar-tl-tw" tabIndex={-1} data-leaf={row.hasChildren ? undefined : 'true'}
          aria-expanded={row.hasChildren ? row.open : undefined} aria-label={row.hasChildren ? `${row.open ? 'Collapse' : 'Expand'} ${label}` : undefined}
          aria-hidden={row.hasChildren ? undefined : true}
          onClick={(event) => { event.stopPropagation(); onToggle(row.key); }}>
          <ChevronRight aria-hidden="true" />
        </button>
        <span className="ar-tl-st" data-state={state} title={state}><StateIcon state={state} /></span>
        <span className="ar-tl-lbl" title={label}><b>{label}</b>{meta && <em>{meta}</em>}{node && node.retries > 0 && <em>{node.retries} {node.retries === 1 ? 'retry' : 'retries'}</em>}</span>
      </div>
      <span className="ar-tl-cost">{cost}</span>
      <div className="ar-insp-track">
        {bar && <span className="ar-bar" data-state={state} data-charge={charge ? 'true' : undefined} style={{ left: `${bar.left}%`, width: charge ? undefined : `${bar.width}%` }} />}
      </div>
    </div>
  );
}

