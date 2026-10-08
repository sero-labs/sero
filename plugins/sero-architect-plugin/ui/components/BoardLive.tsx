import { useEffect, useState } from 'react';
import { useChildRuns } from '@sero-ai/app-runtime';
import { feedbackWaitMs, type WorkFeedback } from '@sero-ai/common';
import { SubagentLiveBlock } from '@sero-ai/ui';

import type { ProjectRecord } from '../../shared/record';
import { rowAction, textTail, toolPhrase, type LiveRow } from '../lib/board';
import { openDispatch } from '../lib/page-helpers';
import { useProjectPicture } from '../lib/use-project-picture';
import { useLinkedMemberLive, useOwnerWatch } from '../lib/use-work-watch';

function clock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A clock that counts while it is on screen. Timers are an outside effect. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** A Workflow step is known by its title; the agent that runs it has a generic name. */
const whoOf = (entry: WorkFeedback): string => (entry.kind === 'workflow-attempt' && entry.subject ? entry.subject : entry.owner);

/** A key for each line: the line itself, numbered when the same action ran twice. */
function keyed(lines: readonly string[]): [string, string][] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const nth = seen.get(line) ?? 0;
    seen.set(line, nth + 1);
    return [`${line}#${nth}`, line];
  });
}

interface NowView {
  /** The action in plain words, when the watch knows it better than the row does. */
  action: string | null;
  detail: string;
  text: string;
  recent: { toolName: string; summary: string }[];
}

/** The one action in hand: its name, the tool's own detail, the arriving words, what came before. */
function Now({ entry, view }: { entry: WorkFeedback; view: NowView }) {
  return (
    <>
      <p className="bd-act">{view.action ?? rowAction(entry)}</p>
      {view.detail && <p className="bd-detail">{view.detail}</p>}
      {view.text && <p className="bd-stream" aria-live="off">{textTail(view.text)}</p>}
      {view.recent.length > 0 && (
        <ul className="bd-before" aria-label="Just before">
          {keyed(view.recent.map((item) => `${toolPhrase(item.toolName)}${item.summary ? ` · ${item.summary}` : ''}`)).map(([key, line]) => <li key={key}>{line}</li>)}
        </ul>
      )}
    </>
  );
}

function OwnerNow({ projectId, entry, turnSince }: { projectId: string; entry: WorkFeedback; turnSince: string | null }) {
  const { live, recent, finished } = useOwnerWatch(projectId, true);
  // A screenshot is saved when a browser call ends, so each change of action is a reason to look.
  const seen = useProjectPicture(projectId, undefined, `${live?.turnId ?? ''}:${live?.tool?.callId ?? live?.tool?.startedAt ?? ''}:${finished}`);
  // A screenshot from before this turn shows a page the Architect is no longer on.
  const browser = seen && turnSince && seen.at >= turnSince ? seen : null;
  const view: NowView = {
    action: live?.tool ? toolPhrase(live.tool.toolName) : live?.request ? toolPhrase(null) : null,
    detail: live?.tool?.summary ?? '',
    text: live?.text ?? '',
    recent,
  };
  return (
    <div className={browser ? 'bd-now bd-now-seen' : 'bd-now'}>
      <div><Now entry={entry} view={view} /></div>
      {browser && (
        <figure className="bd-sees">
          <img src={browser.dataUrl} alt="The last screenshot Architect took in its browser" />
          <figcaption>What Architect last saw in the browser</figcaption>
        </figure>
      )}
    </div>
  );
}

function MemberNow({ record, roomId, memberId, entry }: { record: ProjectRecord; roomId: string; memberId: string; entry: WorkFeedback }) {
  const live = useLinkedMemberLive(record.id, record.workspaceId, roomId, memberId, true);
  const view: NowView = {
    action: live?.toolInFlight ? toolPhrase(live.toolInFlight.toolName) : null,
    detail: live?.toolInFlight?.summary ?? '',
    text: live?.text ?? '',
    recent: [],
  };
  return <Now entry={entry} view={view} />;
}

function SelectedNow({ record, entry }: { record: ProjectRecord; entry: WorkFeedback }) {
  if (entry.kind === 'owner-wake') return <OwnerNow projectId={record.id} entry={entry} turnSince={record.session.workingSince ?? null} />;
  if (entry.kind === 'room-member' && entry.scope.workId && entry.scope.memberId) {
    return <MemberNow record={record} roomId={entry.scope.workId} memberId={entry.scope.memberId} entry={entry} />;
  }
  return (
    <>
      <Now entry={entry} view={{ action: null, detail: '', text: '', recent: [] }} />
      {entry.watchRunId && <SubagentLiveBlock className="wk-live" runId={entry.watchRunId} />}
    </>
  );
}

/**
 * What runs now. One agent reads as one action; several read as a short list,
 * with the words of the one the user picks.
 */
export function BoardLive({ record, rows, onOpenSession }: { record: ProjectRecord; rows: readonly LiveRow[]; onOpenSession(): void }) {
  const now = useNow();
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const picked = rows.find((row) => row.entry.key === pickedKey) ?? rows[0];
  // Agents a Room member started, matched by that member's own session and nothing else.
  const sessions = rows.flatMap(({ entry }) => (entry.kind === 'room-member' && entry.scope.sessionId ? [entry.scope.sessionId] : []));
  const childRuns = useChildRuns(record.workspaceId, sessions);
  if (!picked) return null;
  const children = [...childRuns.values()].flat();
  const link = picked.group.link;
  const waited = feedbackWaitMs(picked.entry, now);
  return (
    <section className="bd-tile bd-main bd-live" aria-label="Live">
      <h2 className="bd-label"><span>Live</span>{rows.length === 1 && waited !== null && <span className="bd-clock bd-end">{clock(waited)}</span>}</h2>
      {(rows.length > 1 || children.length > 0) && (
        <div className="bd-rows">
          {rows.map(({ entry }) => {
            const rowWaited = feedbackWaitMs(entry, now);
            return (
              <button key={entry.key} type="button" className="bd-row" aria-pressed={entry.key === picked.entry.key} onClick={() => setPickedKey(entry.key)}>
                <b>{whoOf(entry)}</b><span>{rowAction(entry)}</span><span className="bd-clock">{rowWaited === null ? '' : clock(rowWaited)}</span>
              </button>
            );
          })}
          {children.map((child) => {
            const tool = child.toolActivity.filter((item) => item.running).at(-1);
            return (
              <div key={child.id} className="bd-row">
                <b>{child.agentName}</b><span>{tool ? toolPhrase(tool.toolName) : ''}</span><span className="bd-clock">{clock(now - child.startedAt)}</span>
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
