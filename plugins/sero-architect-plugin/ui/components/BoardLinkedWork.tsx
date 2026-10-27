import { loopAttention, roomAttention, sessionStartedAt } from '@sero-ai/common';
import type { ProjectRecord } from '../../shared/record';
import { openDispatch } from '../lib/page-helpers';
import { useLinkedIndexes } from '../lib/use-linked-indexes';

/** Durable child attention and progress stay visible even when no agent is currently streaming. */
export function BoardLinkedWork({ record }: { record: ProjectRecord }) {
  const { loops, rooms } = useLinkedIndexes(record.folder);
  const links = [
    ...record.milestones.flatMap((item) => item.dispatch ? [{ kind: item.dispatch.kind, id: item.dispatch.id }] : []),
    ...[...(record.pendingResearch ?? []), ...record.research].flatMap<{ kind: 'room' | 'workflow'; id: string }>((item) => item.roomId ? [{ kind: 'room' as const, id: item.roomId }] : item.workflowId ? [{ kind: 'workflow' as const, id: item.workflowId }] : []),
  ];
  const linkedRooms = rooms.filter((room) => links.some((link) => link.kind === 'room' && link.id === room.id));
  const linkedLoops = loops.filter((loop) => links.some((link) => link.kind === 'workflow' && link.id === loop.id));
  if (!record.workspaceId || linkedRooms.length + linkedLoops.length === 0) return null;
  const workspaceId = record.workspaceId;
  return <section className="bd-tile" aria-label="Linked work"><h2 className="bd-label">Work</h2>
    {linkedRooms.map((room) => {
      const attention = roomAttention(room);
      return <article key={room.id}><h3>{room.title}</h3><p className="bd-why">{attention?.cause ?? (attention ? `${room.attentionCount} requests need you` : room.status)}</p><button type="button" className="bd-link" onClick={() => openDispatch({ kind: 'room', id: room.id, workspaceId })}>{attention ? 'Open Room to resolve' : 'Open the Room'}</button></article>;
    })}
    {linkedLoops.map((loop) => {
      const attention = loopAttention(loop, sessionStartedAt());
      return <article key={loop.id}><h3>{loop.title}</h3><p className="bd-why">{attention?.cause ?? attention?.action ?? loop.status}</p>{loop.attention?.input?.questions.map((question) => <p key={question.id}>{question.prompt}</p>)}{loop.progress && <p>{loop.progress.done} of {loop.progress.total} steps done</p>}{loop.activeStepTitles?.map((title) => <p key={title}>Running: {title}</p>)}<button type="button" className="bd-link" onClick={() => openDispatch({ kind: 'workflow', id: loop.id, workspaceId, runId: record.milestones.find((item) => item.dispatch?.id === loop.id)?.dispatch?.runId ?? loop.lastRunId })}>{attention ? 'Open Workflow to resolve' : 'Open the Workflow'}</button></article>;
    })}
  </section>;
}
