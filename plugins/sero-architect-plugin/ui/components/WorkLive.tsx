import { useEffect, useState } from 'react';
import { useChildRuns, type SubagentLiveEntry } from '@sero-ai/app-runtime';
import { feedbackActivity, feedbackWaitMs, type WorkFeedback } from '@sero-ai/common';
import { LiveBlock, SubagentLiveBlock } from '@sero-ai/ui';
import { ExternalLink, Eye } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import { openDispatch } from '../lib/page-helpers';
import { workGroups } from '../lib/work-groups';
import { useLinkedMemberLive, useOwnerLive } from '../lib/use-work-watch';

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** How long the open call has waited. It counts while the row is on screen. */
function Waited({ entry }: { entry: WorkFeedback }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const waited = feedbackWaitMs(entry, now);
  return waited === null ? null : <span className="wk-t">{clock(waited)}</span>;
}

const since = (at: string | undefined): number | undefined => (at && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : undefined);

function Block({ text, tool, requestSince }: { text: string; tool: { toolName: string; summary: string; startedAt: string } | null; requestSince?: string }) {
  if (!text && !tool) return <div className="lb"><div className="lb-text">No output yet.</div></div>;
  return (
    <LiveBlock
      className="wk-live"
      text={text}
      activity={tool ? { toolName: tool.toolName, argsSummary: tool.summary } : null}
      requestWait={!tool && requestSince ? { since: since(requestSince) ?? null } : null}
      startedAt={since(tool?.startedAt)}
    />
  );
}

function OwnerLive({ projectId }: { projectId: string }) {
  const live = useOwnerLive(projectId, true);
  return <Block text={live?.text ?? ''} tool={live?.tool ?? null} requestSince={live?.request?.startedAt} />;
}

function MemberLive({ record, roomId, memberId }: { record: ProjectRecord; roomId: string; memberId: string }) {
  const live = useLinkedMemberLive(record.id, record.workspaceId, roomId, memberId, true);
  return <Block text={live?.text ?? ''} tool={live?.toolInFlight ?? null} />;
}

/** Which live text a row can show, if any. A row with no route has no eye. */
function watchOf(entry: WorkFeedback, record: ProjectRecord) {
  if (entry.kind === 'owner-wake') return <OwnerLive projectId={record.id} />;
  if (entry.kind === 'room-member' && entry.scope.workId && entry.scope.memberId) return <MemberLive record={record} roomId={entry.scope.workId} memberId={entry.scope.memberId} />;
  if (entry.watchRunId) return <SubagentLiveBlock className="wk-live" runId={entry.watchRunId} />;
  return null;
}

/** One agent a Room member started: its name, the tool it has open and its time. */
function ChildRow({ child }: { child: SubagentLiveEntry }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const tool = child.toolActivity.filter((item) => item.running).at(-1);
  return (
    <div className="wk" data-child="">
      <div className="wk-hd">
        <span className="wk-who">{child.agentName}</span>
        <span className="wk-what">{tool ? `${tool.toolName} ${tool.argsSummary}`.trim() : ''}</span>
        <span className="wk-t">{clock(now - child.startedAt)}</span>
      </div>
    </div>
  );
}

function WorkRow({ entry, record, live, childRuns }: { entry: WorkFeedback; record: ProjectRecord; live: boolean; childRuns: readonly SubagentLiveEntry[] }) {
  const [open, setOpen] = useState(false);
  const watch = live ? watchOf(entry, record) : null;
  // A Workflow step is known by its title; the agent that runs it has a generic name.
  const who = entry.kind === 'workflow-attempt' && entry.subject ? entry.subject : entry.owner;
  const what = entry.wait?.kind === 'tool' ? entry.wait.toolName ?? '' : entry.wait ? 'waiting for the model' : '';
  return (
    <>
      <div className="wk">
        <div className="wk-hd">
          <span className="wk-who">{who}</span>
          <span className={`wk-what ${entry.wait?.kind === 'tool' ? '' : 'quiet'}`}>{what}</span>
          {live && <Waited entry={entry} />}
          {watch && (
            <button type="button" className="ib" aria-expanded={open} aria-label={`Watch ${who}`} onClick={() => setOpen((was) => !was)}>
              <Eye className="ar-i" />
            </button>
          )}
        </div>
        {open && watch}
      </div>
      {live && childRuns.map((child) => <ChildRow key={child.id} child={child} />)}
    </>
  );
}

/** What is running now, by the Room or Workflow it runs in. Text only on request. */
export function WorkLive({ record, work, epoch, runtimeRunning }: { record: ProjectRecord; work: readonly WorkFeedback[]; epoch: string | null; runtimeRunning: boolean }) {
  const groups = workGroups(record, work, epoch);
  // Agents a Room member started, matched by that member's own session and nothing else.
  const sessions = work.flatMap((entry) => (entry.kind === 'room-member' && !entry.terminal && entry.scope.sessionId ? [entry.scope.sessionId] : []));
  const childRuns = useChildRuns(record.workspaceId, sessions);
  if (groups.length === 0) return <p className="wk-line">No work is running.</p>;
  return (
    <>
      {groups.map((group) => {
        const live = (entry: WorkFeedback) => runtimeRunning && epoch !== null && feedbackActivity(entry, epoch) === 'working';
        return (
          <section className="wk-group" key={group.key} aria-label={group.title}>
            <div className="wk-ghead">
              <span>{group.title}</span>
              {group.link && (
                <button type="button" className="ar-btn-link" onClick={() => group.link && openDispatch(group.link)}>
                  {group.link.kind === 'room' ? 'Open Room' : 'Open Workflow'} <ExternalLink className="ar-i" />
                </button>
              )}
            </div>
            {!group.rows.some(live) && <p className="wk-line">Live work cannot be confirmed in this session.</p>}
            {group.rows.map((entry) => <WorkRow key={entry.key} entry={entry} record={record} live={live(entry)} childRuns={childRuns.get(entry.scope.sessionId ?? '') ?? []} />)}
          </section>
        );
      })}
    </>
  );
}
