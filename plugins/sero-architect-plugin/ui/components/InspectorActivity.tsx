import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@sero-ai/ui';
import type { TraceRecord } from '../lib/trace';
import { inclusiveCost, inclusivePriced } from '../lib/charts';
import { activityOf, rowWindow } from '../lib/timeline';
import { clock, usd } from '../lib/inspector-format';

const ROW_HEIGHT = 34;
const VIEWPORT = 460;

export function InspectorActivity({ visible, expanded, toggleExpanded, onBack }: {
  visible: TraceRecord[]; expanded: string[]; toggleExpanded(id: string): void; onBack(): void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const timelineId = useId();
  const expandedIds = new Set(expanded);
  const window = rowWindow(visible.length, { scrollTop, rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT });
  const slice = visible.slice(window.start, window.end);
  const selectedIndex = visible.length === 0 ? -1 : (selectedSeq === null ? 0 : visible.findIndex((entry) => entry.seq === selectedSeq));
  const selectedRecord = selectedIndex === -1 ? null : visible[selectedIndex] ?? null;
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { onBack(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (selectedRecord?.operationId) toggleExpanded(selectedRecord.operationId);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!visible.length) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const base = selectedIndex === -1 ? 0 : selectedIndex;
    const next = Math.min(Math.max(base + delta, 0), visible.length - 1);
    setSelectedSeq(visible[next]!.seq);
    const top = Math.max(0, next - 2) * ROW_HEIGHT;
    if (scroller.current) scroller.current.scrollTop = top;
    setScrollTop(top);
  }
  return (
    <div className="ar-inspector-split">
      <div
        className="ar-inspector-timeline"
        ref={scroller}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Activity timeline"
        aria-activedescendant={selectedRecord ? `${timelineId}-${selectedRecord.seq}` : undefined}
        style={{ height: VIEWPORT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: window.total * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${window.leading * ROW_HEIGHT}px)` }}>
            {slice.map((entry, offset) => (
              <InspectorRow key={`${entry.seq}:${entry.operationId ?? entry.kind}`} id={`${timelineId}-${entry.seq}`}
                entry={entry} selected={window.start + offset === selectedIndex}
                open={entry.operationId !== undefined && expandedIds.has(entry.operationId)}
                onSelect={setSelectedSeq} onToggle={toggleExpanded} />
            ))}
          </div>
        </div>
      </div>
      <InspectorDetail selectedRecord={selectedRecord} visible={visible} expandedIds={expandedIds} toggleExpanded={toggleExpanded} />
    </div>
  );
}

function InspectorRow({ entry, id, selected, open, onSelect, onToggle }: {
  entry: TraceRecord; id: string; selected: boolean; open: boolean; onSelect(seq: number): void; onToggle(id: string): void;
}) {
  return (
    <div
      id={id}
      className="ar-span"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-selected={selected ? 'true' : undefined}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(entry.seq)}
      onDoubleClick={() => entry.operationId && onToggle(entry.operationId)}
    >
      <span className="ar-span-at">{clock(entry.at)}</span>
      <span className="ar-span-kind">{activityOf(entry)}</span>
      <span className="ar-span-op">{entry.operationId ?? entry.source ?? entry.kind}</span>
      <span className="ar-span-cost">{entry.costUsd === undefined ? '' : usd(entry.costUsd)}</span>
      {entry.outcome && entry.outcome !== 'ok' && <span className="ar-span-bad">{entry.outcome}</span>}
      {open && (
        <dl className="ar-span-detail">
          <dt>model</dt><dd>{entry.model ?? 'not recorded'}</dd>
          <dt>thinking</dt><dd>{entry.thinking ?? 'not recorded'}</dd>
          <dt>coverage</dt><dd>{entry.coverage ?? 'not recorded'}</dd>
          <dt>tokens</dt><dd>{entry.usage?.inputTokens ?? 'unavailable'} in / {entry.usage?.outputTokens ?? 'unavailable'} out</dd>
        </dl>
      )}
    </div>
  );
}

function InspectorDetail({ selectedRecord, visible, expandedIds, toggleExpanded }: {
  selectedRecord: TraceRecord | null; visible: TraceRecord[]; expandedIds: Set<string>; toggleExpanded(id: string): void;
}) {
  return (
    <aside className="ar-inspector-detail" aria-label="Selected activity">
      {selectedRecord ? (
        <>
          <p className="ar-mono">{selectedRecord.operationId ?? selectedRecord.source ?? selectedRecord.kind}</p>
          <dl>
            <dt>at</dt><dd>{selectedRecord.at}</dd>
            <dt>kind</dt><dd>{activityOf(selectedRecord)}</dd>
            <dt>model</dt><dd>{selectedRecord.model ?? 'not recorded'}</dd>
            <dt>own cost</dt><dd>{selectedRecord.costUsd === undefined ? 'not recorded' : usd(selectedRecord.costUsd)}</dd>
            {/* Inclusive covers this operation and everything under it, and
                is never added into a total that already counted those. */}
            <dt>inclusive</dt><dd>{inclusivePriced(selectedRecord, visible) ? usd(inclusiveCost(selectedRecord, visible)) : 'not measured'}</dd>
            <dt>coverage</dt><dd>{selectedRecord.coverage ?? 'not recorded'}</dd>
          </dl>
          {selectedRecord.operationId && (
            <Button variant="outline" size="sm" className="ar-btn" onClick={() => toggleExpanded(selectedRecord.operationId!)}>
              {expandedIds.has(selectedRecord.operationId) ? 'Collapse' : 'Expand'} this operation
            </Button>
          )}
        </>
      ) : (
        <p className="ar-why">Select a row to inspect it.</p>
      )}
    </aside>
  );
}
