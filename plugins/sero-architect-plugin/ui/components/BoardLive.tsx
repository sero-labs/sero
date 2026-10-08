import { useState } from 'react';
import { Compass, Workflow } from 'lucide-react';
import { useChildRuns } from '@sero-ai/app-runtime';
import type { WorkFeedback } from '@sero-ai/common';
import { useSubagentLive } from '@sero-ai/ui';

import type { ProjectRecord } from '../../shared/record';
import { rowAction, textTail, toolPhrase, type LiveRow } from '../lib/board';
import { memberAvatar } from '../lib/member-avatar';
import { openDispatch } from '../lib/page-helpers';
import { useProjectPicture } from '../lib/use-project-picture';
import { useLinkedMemberLive, useOwnerWatch } from '../lib/use-work-watch';

/** A Workflow step is known by its title; the agent that runs it has a generic name. */
const whoOf = (entry: WorkFeedback): string => (entry.kind === 'workflow-attempt' && entry.subject ? entry.subject : entry.owner);

/** A Room names a member "Vera — Design Lead". The name leads and the role follows, quieter. */
function Who({ name }: { name: string }) {
  const [first, ...rest] = name.split(' — ');
  return <span className="bd-who-row"><b>{first}</b>{rest.length > 0 && <small>{rest.join(' — ')}</small>}</span>;
}

/** Who a row is: a Room member has the face the Room gives it, other work has a mark for its kind. */
function Face({ entry }: { entry?: WorkFeedback }) {
  const member = entry?.kind === 'room-member' ? entry.scope.memberId : undefined;
  if (member) return <img className="bd-face-sm" src={memberAvatar(member)} alt="" />;
  return <span className="bd-face-sm" data-mark="">{entry?.kind === 'owner-wake' ? <Compass /> : <Workflow />}</span>;
}

type Step = { toolName: string; summary: string };

interface NowView {
  /** The tool running now. */
  tool: Step | null;
  /** The tool that finished last, shown while no tool runs. */
  last: Step | null;
  text: string;
}

/**
 * One line for the action in hand, or the last one, and a box for the arriving
 * words. Both have a fixed height: they change many times a second, and nothing
 * around them may move.
 */
function Now({ entry, view }: { entry: WorkFeedback; view: NowView }) {
  const step = view.tool ?? view.last;
  // With no action and no words yet, the tile still says the agent is at work. It is never empty.
  const quiet = !step && !view.text.trim();
  const line = step ? `${toolPhrase(step.toolName)}${step.summary ? ` · ${step.summary}` : ''}` : quiet ? rowAction(entry) : '';
  return (
    <>
      <p className="bd-step-now" data-past={(!view.tool && view.last) || quiet ? '' : undefined}>{line}</p>
      <div className="bd-stream" aria-live="off">{view.text.trim() && <p><span>{textTail(view.text)}</span></p>}</div>
    </>
  );
}

function OwnerNow({ projectId, entry, turnSince }: { projectId: string; entry: WorkFeedback; turnSince: string | null }) {
  const { live, recent, finished } = useOwnerWatch(projectId, true);
  // A screenshot is saved when a browser call ends, so each change of action is a reason to look.
  const seen = useProjectPicture(projectId, undefined, `${live?.turnId ?? ''}:${live?.tool?.callId ?? live?.tool?.startedAt ?? ''}:${finished}`);
  // A screenshot from before this turn shows a page the Architect is no longer on.
  const browser = seen && turnSince && seen.at >= turnSince ? seen : null;
  const view: NowView = { tool: live?.tool ?? null, last: recent[0] ?? null, text: live?.text ?? '' };
  return (
    <div className={browser ? 'bd-now bd-now-seen' : 'bd-now'}>
      <div><Now entry={entry} view={view} /></div>
      {browser && (
        <figure className="bd-sees">
          <img src={browser.dataUrl} alt="The last screenshot Architect took in its browser" />
          <figcaption>Last seen in the browser</figcaption>
        </figure>
      )}
    </div>
  );
}

function MemberNow({ record, roomId, memberId, entry }: { record: ProjectRecord; roomId: string; memberId: string; entry: WorkFeedback }) {
  const live = useLinkedMemberLive(record.id, record.workspaceId, roomId, memberId, true);
  const view: NowView = { tool: live?.toolInFlight ?? null, last: null, text: live?.text ?? '' };
  return <Now entry={entry} view={view} />;
}

function SelectedNow({ record, entry }: { record: ProjectRecord; entry: WorkFeedback }) {
  if (entry.kind === 'owner-wake') return <OwnerNow projectId={record.id} entry={entry} turnSince={record.session.workingSince ?? null} />;
  if (entry.kind === 'room-member' && entry.scope.workId && entry.scope.memberId) {
    return <MemberNow record={record} roomId={entry.scope.workId} memberId={entry.scope.memberId} entry={entry} />;
  }
  return <RunNow entry={entry} />;
}

/** A Workflow step's agent, in the same form as every other row. */
function RunNow({ entry }: { entry: WorkFeedback }) {
  const live = useSubagentLive(entry.watchRunId ?? null);
  return <Now entry={entry} view={{ tool: live.tool ? { toolName: live.tool.toolName, summary: live.tool.argsSummary } : null, last: null, text: live.text }} />;
}

/**
 * What runs now. One agent reads as one action; several read as a short list,
 * with the words of the one the user picks.
 */
export function BoardLive({ record, rows, onOpenSession }: { record: ProjectRecord; rows: readonly LiveRow[]; onOpenSession(): void }) {
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const picked = rows.find((row) => row.entry.key === pickedKey) ?? rows[0];
  // Agents a Room member started, matched by that member's own session and nothing else.
  const sessions = rows.flatMap(({ entry }) => (entry.kind === 'room-member' && entry.scope.sessionId ? [entry.scope.sessionId] : []));
  const childRuns = useChildRuns(record.workspaceId, sessions);
  if (!picked) return null;
  const children = [...childRuns.values()].flat();
  const link = picked.group.link;
  return (
    <section className="bd-tile bd-main bd-live" aria-label="Live">
      <h2 className="bd-label">Live</h2>
      {(rows.length > 1 || children.length > 0) && (
        <div className="bd-rows">
          {rows.map(({ entry }) => (
            <button key={entry.key} type="button" className="bd-row" aria-pressed={entry.key === picked.entry.key} onClick={() => setPickedKey(entry.key)}>
              <Face entry={entry} /><Who name={whoOf(entry)} /><span className="bd-row-act">{rowAction(entry)}</span>
            </button>
          ))}
          {children.map((child) => {
            const tool = child.toolActivity.filter((item) => item.running).at(-1);
            return (
              <div key={child.id} className="bd-row">
                <Face /><Who name={child.agentName} /><span className="bd-row-act">{tool ? toolPhrase(tool.toolName) : ''}</span>
              </div>
            );
          })}
        </div>
      )}
      <SelectedNow key={picked.entry.key} record={record} entry={picked.entry} />
      <p className="bd-foot">
        {picked.entry.kind === 'owner-wake' && <button type="button" className="bd-link" onClick={onOpenSession}>Open the full session</button>}
        {link && <button type="button" className="bd-link" onClick={() => openDispatch(link)}>{link.kind === 'room' ? 'Open the Room' : 'Open the Workflow'}</button>}
      </p>
    </section>
  );
}
