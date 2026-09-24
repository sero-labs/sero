import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { updatesLabel, type TreeRow } from '../lib/activity-tree';
import { clock, count, dur, span, usd } from '../lib/inspector-format';
import type { TokenSet } from '../lib/trace';
import { StateChip } from './InspectorStatus';

export const TOKEN_COLOURS: Record<keyof TokenSet, string> = {
  input: 'var(--ar-info)',
  output: 'var(--ar-brand)',
  cacheRead: 'var(--ar-violet)',
  cacheWrite: 'var(--ar-warn)',
};
const TOKEN_WORD: Record<keyof TokenSet, string> = { input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write' };


function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className="ar-dfact"><span>{label}</span><b>{children}</b></div>;
}

function Tokens({ tokens }: { tokens: TokenSet }) {
  const keys = Object.keys(TOKEN_COLOURS) as (keyof TokenSet)[];
  const total = keys.reduce((sum, key) => sum + tokens[key], 0) || 1;
  return (
    <div className="ar-facts">
      <div className="ar-tokbar" role="img" aria-label="Token composition">
        {keys.map((key) => (tokens[key] ? <i key={key} style={{ width: `${(tokens[key] / total) * 100}%`, background: TOKEN_COLOURS[key] }} /> : null))}
      </div>
      {keys.map((key) => (
        <Fact key={key} label={<><i className="sq" style={{ background: TOKEN_COLOURS[key] }} />{TOKEN_WORD[key]}</>}>{count(tokens[key])}</Fact>
      ))}
    </div>
  );
}

export interface RoomMember { name: string; model: string; thinking: string }

const COVERAGE_WORD = { call: 'per call', aggregate: 'aggregate', partial: 'partial' } as const;

/**
 * The selected row's facts in one list. Nothing here is a heading: each fact
 * carries its own label. A fact the sources did not record is left out, not
 * shown as zero.
 */
export function InspectorDetail({ row, onOpenDispatch, membersOf }: {
  row: TreeRow | null;
  onOpenDispatch(nodeId: string): (() => void) | null;
  /** A research activity's Room members, as the project saved them. */
  membersOf(nodeId: string): RoomMember[] | null;
}) {
  if (!row) return null;
  if (row.updates) {
    const updates = row.updates;
    return (
      <aside className="ar-panel ar-detail" aria-label="Selected activity">
        <div className="ar-panel-head">{updatesLabel(updates)}</div>
        <div className="ar-detail-body">
          <div className="ar-facts">
            <Fact label="Time">{span(updates.from, updates.to)}</Fact>
            <Fact label="Cost">{usd(updates.costUsd)}</Fact>
            <Fact label="Updates">{count(updates.records.length)}</Fact>
            <Fact label="Coverage">{COVERAGE_WORD.aggregate}</Fact>
          </div>
          <div className="ar-facts">
            {updates.sources.length === 1
              ? <Fact label="Source">{updates.sources[0]}</Fact>
              : <Fact label="Sources">{updates.sources.length}</Fact>}
          </div>
        </div>
      </aside>
    );
  }
  if (row.charge) {
    const charge = row.charge;
    const usage = charge.usage;
    const tokens: TokenSet | null = usage && Object.values(usage).some((value) => typeof value === 'number')
      ? { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0, cacheRead: usage.cacheReadTokens ?? 0, cacheWrite: usage.cacheWriteTokens ?? 0 }
      : null;
    return (
      <aside className="ar-panel ar-detail" aria-label="Selected activity">
        <div className="ar-panel-head">Usage · {charge.label ?? 'charge'}</div>
        <div className="ar-detail-body">
          <div className="ar-facts">
            <Fact label="Time">{clock(charge.at)}</Fact>
            {charge.costUsd !== undefined && <Fact label="Cost">{usd(charge.costUsd)}</Fact>}
            {charge.coverage && <Fact label="Coverage">{COVERAGE_WORD[charge.coverage]}</Fact>}
          </div>
          {charge.model && (
            <div className="ar-facts">
              <Fact label="Model">{charge.model}</Fact>
              {charge.thinking && <Fact label="Thinking">{charge.thinking}</Fact>}
            </div>
          )}
          {tokens && <Tokens tokens={tokens} />}
          {charge.source && <div className="ar-facts"><Fact label="Source">{charge.source}</Fact></div>}
        </div>
      </aside>
    );
  }
  const node = row.node;
  if (!node) return null;
  const from = Date.parse(node.startAt ?? '');
  const to = Date.parse(node.endAt ?? '');
  const open = onOpenDispatch(node.id);
  const kind = node.kind.replace(/-/g, ' ');
  // A step nothing was charged against has no cost, coverage or tokens to
  // report, so one line says so.
  const charged = node.charges > 0 || node.costUsd !== null;
  const members = membersOf(node.id);
  const timed = Number.isFinite(from) && Number.isFinite(to);
  // Own and inclusive differ only when children were charged too.
  const split = node.ownCostUsd !== null && node.costUsd !== null && Math.abs(node.ownCostUsd - node.costUsd) >= 0.005;
  return (
    <aside className="ar-panel ar-detail" aria-label="Selected activity">
      <div className="ar-panel-head"><span className="ar-detail-title" title={node.label}>{node.label}</span><StateChip state={node.state} /></div>
      <div className="ar-detail-body">
        <div className="ar-facts">
          {!node.label.toLowerCase().startsWith(kind) && <Fact label="Kind">{kind}</Fact>}
          {node.startAt && <Fact label="Time">{span(node.startAt, node.endAt)}</Fact>}
          {timed && <Fact label="Duration">{dur(to - from)}</Fact>}
          {!charged ? <Fact label="Cost">no charges recorded</Fact>
            : split ? (
              <>
                <Fact label="Attributable">{usd(node.ownCostUsd!)}</Fact>
                <Fact label="Inclusive">{usd(node.costUsd!)}</Fact>
              </>
            ) : node.costUsd !== null && <Fact label="Cost">{usd(node.costUsd)}</Fact>}
          {charged && node.coverage && <Fact label="Coverage">{COVERAGE_WORD[node.coverage]}</Fact>}
          {node.charges > 0 && <Fact label="Charges">{count(node.charges)}</Fact>}
          {node.retries > 0 && <Fact label="Retries">{node.retries}</Fact>}
        </div>
        {members?.length ? (
          <div className="ar-facts">
            {members.map((member) => (
              <Fact key={member.name} label={member.name.split(' — ')[0]}>{`${member.model.split('/').pop()} · ${member.thinking}`}</Fact>
            ))}
          </div>
        ) : node.model ? (
          <div className="ar-facts">
            <Fact label="Model">{node.model}</Fact>
            {node.thinking && <Fact label="Thinking">{node.thinking}</Fact>}
          </div>
        ) : null}
        {charged && node.tokens && <Tokens tokens={node.tokens} />}
        {(node.error || node.rawId !== node.label || open) && (
          <div className="ar-facts">
            {node.error && <Fact label="Error">{node.error}</Fact>}
            {node.rawId !== node.label && <Fact label="ID">{node.rawId}</Fact>}
            {open && <button type="button" className="ar-ref" onClick={open}><ExternalLink aria-hidden="true" />Open in Orchestrator</button>}
          </div>
        )}
      </div>
    </aside>
  );
}
