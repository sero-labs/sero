import { useEffect, useState } from 'react';
import { feedbackActivity, feedbackWaitMs, type WorkFeedback } from '@sero-ai/common';
import { LiveBlock, SubagentLiveBlock } from '@sero-ai/ui';
import { ExternalLink, Eye } from 'lucide-react';

import { ARCHITECT_APP_ID } from '@sero-ai/common';
import type { ProjectRecord } from '../../shared/record';
import { openDispatch } from '../lib/page-helpers';
import { useLinkedMemberLive, useOwnerLive } from '../lib/use-work-watch';

interface WorkGroup {
  key: string;
  /** "Room · Build the synth". The Architect's own work has no heading link. */
  title: string;
  link: { kind: 'room' | 'workflow'; id: string; workspaceId: string } | null;
  rows: WorkFeedback[];
}

/** The name the record gave a Room or Workflow. Never read from a live title. */
function linkedTitle(record: ProjectRecord, id: string): string | null {
  const milestone = record.milestones.find((item) => item.dispatch?.id === id);
  if (milestone) return milestone.title;
  const research = [...(record.pendingResearch ?? []), ...record.research].find((entry) => entry.roomId === id || entry.workflowId === id);
  return research?.question ?? null;
}

/** Work that has not ended, grouped by the Room or Workflow it runs in. */
export function workGroups(record: ProjectRecord, work: readonly WorkFeedback[]): WorkGroup[] {
  const groups = new Map<string, WorkGroup>();
  for (const entry of work.filter((item) => !item.terminal)) {
    const own = entry.scope.appId === ARCHITECT_APP_ID;
    const id = entry.scope.workId ?? '';
    const kind = entry.kind === 'room-member' ? 'room' : 'workflow';
    const key = own || !id ? 'architect' : `${kind}:${id}`;
    const group = groups.get(key) ?? {
      key,
      title: key === 'architect' ? 'Architect' : `${kind === 'room' ? 'Room' : 'Workflow'}${linkedTitle(record, id) ? ` · ${linkedTitle(record, id)}` : ''}`,
      link: key === 'architect' || !record.workspaceId ? null : { kind, id, workspaceId: record.workspaceId },
      rows: [],
    };
    group.rows.push(entry);
    groups.set(key, group);
  }
  // A child follows the work that started it, when the producer named one.
  for (const group of groups.values()) {
    const children = group.rows.filter((row) => row.scope.parentKey && group.rows.some((parent) => parent.key === row.scope.parentKey));
    const parents = group.rows.filter((row) => !children.includes(row));
    group.rows = parents.flatMap((parent) => [parent, ...children.filter((child) => child.scope.parentKey === parent.key)]);
  }
  return [...groups.values()].sort((a, b) => (a.key === 'architect' ? -1 : b.key === 'architect' ? 1 : a.title.localeCompare(b.title)));
}

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

function WorkRow({ entry, record, live }: { entry: WorkFeedback; record: ProjectRecord; live: boolean }) {
  const [open, setOpen] = useState(false);
  const watch = live ? watchOf(entry, record) : null;
  const what = entry.wait?.kind === 'tool' ? entry.wait.toolName ?? '' : entry.wait ? 'waiting for the model' : entry.subject ?? '';
  return (
    <div className="wk" data-child={entry.scope.parentKey ? '' : undefined}>
      <div className="wk-hd">
        <span className="wk-who">{entry.owner}</span>
        <span className={`wk-what ${entry.wait?.kind === 'tool' ? '' : 'quiet'}`}>{what}</span>
        {live && <Waited entry={entry} />}
        {watch && (
          <button type="button" className="ib" aria-expanded={open} aria-label={`Watch ${entry.owner}`} onClick={() => setOpen((was) => !was)}>
            <Eye className="ar-i" />
          </button>
        )}
      </div>
      {open && watch}
    </div>
  );
}

/** What is running now, by the Room or Workflow it runs in. Text only on request. */
export function WorkLive({ record, work, epoch, runtimeRunning }: { record: ProjectRecord; work: readonly WorkFeedback[]; epoch: string | null; runtimeRunning: boolean }) {
  const groups = workGroups(record, work);
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
            {group.rows.map((entry) => <WorkRow key={entry.key} entry={entry} record={record} live={live(entry)} />)}
          </section>
        );
      })}
    </>
  );
}
