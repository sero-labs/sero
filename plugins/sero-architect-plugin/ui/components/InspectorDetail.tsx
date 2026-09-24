import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { updatesLabel, type ChargeUpdates, type TreeRow } from '../lib/activity-tree';
import { count } from '../lib/inspector-format';
import { chargeFacts, chargeTokens, nodeFacts, TOKEN_COLOURS, TOKEN_WORD, updatesFacts, type FactView, type RoomMember } from '../lib/inspector-view';
import type { ActivityNodeView, TokenSet, TraceRecord } from '../lib/trace';
import { StateChip } from './InspectorStatus';

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <div className="ar-dfact"><span>{label}</span><b>{children}</b></div>;
}

/** Groups of facts, each group its own block. An empty group draws nothing. */
function Facts({ groups }: { groups: FactView[][] }) {
  return groups.filter((group) => group.length > 0).map((group) => (
    <div key={group[0]![0]} className="ar-facts">
      {group.map(([label, value]) => <Fact key={label} label={label}>{value}</Fact>)}
    </div>
  ));
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

function Panel({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <aside className="ar-panel ar-detail" aria-label="Selected activity">
      <div className="ar-panel-head">{head}</div>
      <div className="ar-detail-body">{children}</div>
    </aside>
  );
}

function UpdatesDetail({ updates }: { updates: ChargeUpdates }) {
  return <Panel head={updatesLabel(updates)}><Facts groups={updatesFacts(updates)} /></Panel>;
}

function ChargeDetail({ charge }: { charge: TraceRecord }) {
  const facts = chargeFacts(charge);
  const tokens = chargeTokens(charge);
  return (
    <Panel head={`Usage · ${charge.label ?? 'charge'}`}>
      <Facts groups={facts.head} />
      {tokens && <Tokens tokens={tokens} />}
      <Facts groups={[facts.tail]} />
    </Panel>
  );
}

function NodeDetail({ node, members, open }: { node: ActivityNodeView; members: RoomMember[] | null; open: (() => void) | null }) {
  const facts = nodeFacts(node, members);
  return (
    <Panel head={<><span className="ar-detail-title" title={node.label}>{node.label}</span><StateChip state={node.state} /></>}>
      <Facts groups={facts.head} />
      {facts.tokens && <Tokens tokens={facts.tokens} />}
      {(facts.tail.length > 0 || open) && (
        <div className="ar-facts">
          {facts.tail.map(([label, value]) => <Fact key={label} label={label}>{value}</Fact>)}
          {open && <button type="button" className="ar-ref" onClick={open}><ExternalLink aria-hidden="true" />Open in Orchestrator</button>}
        </div>
      )}
    </Panel>
  );
}

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
  if (row?.updates) return <UpdatesDetail updates={row.updates} />;
  if (row?.charge) return <ChargeDetail charge={row.charge} />;
  if (!row?.node) return null;
  return <NodeDetail node={row.node} members={membersOf(row.node.id)} open={onOpenDispatch(row.node.id)} />;
}
